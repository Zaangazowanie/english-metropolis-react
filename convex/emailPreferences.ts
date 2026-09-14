import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { generateToken, requireStudent, sha256Hex } from './authHelpers';
import { recordMarketingChoice } from './marketingConsent';

export const mine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    const email = student.email?.trim().toLowerCase();
    const current = email ? await ctx.db.query('marketingPreferences')
      .withIndex('by_email', q => q.eq('email', email)).unique() : null;
    return { subscribed: current?.subscribed === true };
  },
});

export const setMine = mutation({
  args: {
    sessionToken: v.string(), subscribed: v.boolean(),
    locale: v.union(v.literal('en'), v.literal('pl')),
  },
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx, args.sessionToken);
    return recordMarketingChoice(ctx, student._id, student.email, args.subscribed, 'account', args.locale);
  },
});

// The bearer link can only withdraw consent, never read an address or subscribe.
// A human clicks the confirmation button: loading an email or a scanner's GET
// cannot change a preference. Repeating the withdrawal is harmless.
export const unsubscribe = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.token)) return { success: false };
    const tokenHash = await sha256Hex(args.token);
    const link = await ctx.db.query('marketingUnsubscribeTokens')
      .withIndex('by_hash', q => q.eq('tokenHash', tokenHash)).unique();
    if (!link) return { success: false };
    let current = link.preferenceId ? await ctx.db.get(link.preferenceId) : null;
    if (!current && link.studentId && link.email) {
      current = await ctx.db.query('marketingPreferences')
        .withIndex('by_email', q => q.eq('email', link.email!)).unique();
      if (!current) {
        const now = Date.now();
        const preferenceId = await ctx.db.insert('marketingPreferences', {
          studentId: link.studentId, email: link.email, subscribed: false, updatedAt: now,
        });
        await ctx.db.insert('marketingConsentEvents', {
          preferenceId, studentId: link.studentId, subscribed: false,
          source: 'unsubscribe_link', at: now,
        });
        return { success: true };
      }
    }
    if (!current) return { success: false };
    if (current.subscribed) {
      const now = Date.now();
      await ctx.db.patch(current._id, { subscribed: false, updatedAt: now });
      await ctx.db.insert('marketingConsentEvents', {
        preferenceId: current._id, studentId: current.studentId,
        subscribed: false, source: 'unsubscribe_link', at: now,
      });
    }
    return { success: true };
  },
});

// Owner-approved, one-time Raty announcement to the existing private roster.
// This does not assert or grant marketing consent. It is deliberately separate
// from prepareRecipient's ongoing promotional-list eligibility check.
export const prepareExistingStudentUpdate = internalMutation({
  args: { studentId: v.id('students'), campaignKey: v.literal('raty-zero-2026-09-14') },
  handler: async (ctx, args) => {
    if (Date.now() > Date.UTC(2026, 8, 15, 23, 59, 59)) return null;
    const student = await ctx.db.get(args.studentId);
    if (!student || student.organizationId !== 'js779cs2vjwb2c9yjc3a7t619n84zcp8'
      || !['active', 'paused'].includes(student.status)
      || student.createdAt > Date.UTC(2026, 8, 14, 8, 47, 32)) return null;
    const candidates = [student.email, student.googleEmail].map(x => x?.trim().toLowerCase() || '');
    const email = candidates.find(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)
      && !x.endsWith('@englishmetro.com') && !x.endsWith('.invalid'));
    if (!email) return null;
    // Any known opt-out on either account address suppresses the update.
    for (const address of new Set(candidates.filter(Boolean))) {
      const preference = await ctx.db.query('marketingPreferences')
        .withIndex('by_email', q => q.eq('email', address)).unique();
      if (preference?.subscribed === false) return null;
    }
    const token = generateToken();
    await ctx.db.insert('marketingUnsubscribeTokens', {
      studentId: student._id, email, campaignKey: args.campaignKey,
      tokenHash: await sha256Hex(token), createdAt: Date.now(),
    });
    return { email, name: student.name, unsubscribeUrl: `https://englishmetro.com/email-preferences#unsubscribe=${token}` };
  },
});

// For a future, explicitly approved sender. No sender or schedule is introduced
// by this release. Recheck this state immediately before sending every message.
export const prepareRecipient = internalMutation({
  args: { studentId: v.id('students') },
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    const email = student?.email?.trim().toLowerCase();
    if (!email || !student?.emailVerifiedAt || student.status !== 'active') return null;
    const current = await ctx.db.query('marketingPreferences')
      .withIndex('by_email', q => q.eq('email', email)).unique();
    if (!current?.subscribed || current.studentId !== student._id) return null;
    const token = generateToken();
    await ctx.db.insert('marketingUnsubscribeTokens', {
      preferenceId: current._id, tokenHash: await sha256Hex(token), createdAt: Date.now(),
    });
    return { email, unsubscribeUrl: `https://englishmetro.com/email-preferences#unsubscribe=${token}` };
  },
});
