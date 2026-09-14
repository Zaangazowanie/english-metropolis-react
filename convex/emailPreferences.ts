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
    const current = link && await ctx.db.get(link.preferenceId);
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
