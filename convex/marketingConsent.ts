import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

import { MARKETING_NOTICE_VERSION, MARKETING_NOTICE } from '../shared/marketingNotice';

// An explicit choice only. Existing students and historical payment rows are
// never inferred to be subscribed. Marketing state is separate from service mail.
export async function recordMarketingChoice(
  ctx: MutationCtx, studentId: Id<'students'>, email: string | undefined,
  subscribed: boolean, source: 'signup_email' | 'signup_google' | 'account',
  locale: 'en' | 'pl' = 'en',
) {
  const address = email?.trim().toLowerCase();
  if (!address) throw new Error('An account email is required');
  const current = await ctx.db.query('marketingPreferences')
    .withIndex('by_email', q => q.eq('email', address)).unique();
  const now = Date.now();
  const choice = { studentId, email: address, subscribed, updatedAt: now };
  const preferenceId = current?._id ?? await ctx.db.insert('marketingPreferences', choice);
  if (current) await ctx.db.patch(current._id, choice);
  await ctx.db.insert('marketingConsentEvents', {
    preferenceId, studentId, subscribed, source, locale,
    noticeVersion: MARKETING_NOTICE_VERSION, noticeText: MARKETING_NOTICE[locale], at: now,
  });
  return { subscribed };
}
