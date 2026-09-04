// Rules that only apply to students who sign themselves up from 2026-08-10.
//
// Mike, 2026-08-10: "all these things are only for new students not students i
// took on prior to today." Three rules shipped that day — a compulsory date of
// birth with an 18+ block, Bajla riding on the paid AI add-on, and the World
// beta behind a confirmed e-mail. None of them may be applied retroactively to
// a roster that was never asked.
//
// The cutoff is a timestamp rather than a backfilled flag because `createdAt`
// is already trustworthy on this table (it tracks `_creationTime` on every row
// checked), so no migration is needed and no student can be missed by one.
// Counted against production on 2026-08-10: 162 of 176 rows predate it.
export const NEW_RULES_FROM_MS = 1786320000000; // 2026-08-10T00:00:00Z

// A row with no createdAt at all is older than anything we can date, so it is
// grandfathered too — never the other way round. Getting this backwards would
// lock a paying student out of a feature they already had.
export function isGrandfathered(student: { createdAt?: number } | null | undefined): boolean {
  if (!student) return false;
  return (student.createdAt ?? 0) < NEW_RULES_FROM_MS;
}

// Age in whole years on `asOf`, from a YYYY-MM-DD date of birth.
// Returns null if the string is not a real calendar date, so a caller can tell
// "malformed" apart from "too young" and never let a bad value read as adult.
export function ageInYears(dateOfBirth: string, asOf: number = Date.now()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth.trim());
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const dob = new Date(Date.UTC(year, month - 1, day));
  // Rejects 2026-02-30 and friends: Date rolls them over, so the parts change.
  if (dob.getUTCFullYear() !== year || dob.getUTCMonth() !== month - 1 || dob.getUTCDate() !== day) {
    return null;
  }
  const now = new Date(asOf);
  if (dob.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - year;
  const hadBirthday = now.getUTCMonth() > month - 1 ||
    (now.getUTCMonth() === month - 1 && now.getUTCDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
}

export const MIN_SIGNUP_AGE = 18;

// Enforcement is switched on by an env var rather than baked in, for one
// specific reason: Convex rejects unknown arguments, so there is no ordering of
// "push functions" and "rsync the bundle" that does not break live signups for
// the minute in between — the old bundle sends no date of birth, and a bundle
// that sends one would be refused by the old validator.
//
// So the rollout is: push (off, validator now accepts the field) → rsync the
// bundle → `npx convex env set REQUIRE_SIGNUP_DOB 1 --prod`, which takes effect
// with no redeploy at all. It doubles as the kill switch if the field turns out
// to cost conversions. Same shape as REQUIRE_VERIFIED_TO in scheduling.ts.
export function dobRequired(): boolean {
  return process.env.REQUIRE_SIGNUP_DOB === "1";
}

// The one gate every self-signup path calls. Returns an error string to hand
// back to the customer, or null when the date is acceptable.
//
// An adult buying for a child is a different flow entirely: they sign up as
// themselves and tick the child declaration at checkout (students.isMinor).
// A learner under 18 may never hold an account of their own.
export function signupDobProblem(dateOfBirth: string | undefined): string | null {
  if (!dateOfBirth || !dateOfBirth.trim()) return dobRequired() ? "DOB_REQUIRED" : null;
  // A date that IS supplied is always checked, flag or no flag. The switch
  // exists to sequence a deploy, never to let an under-18 through.
  const age = ageInYears(dateOfBirth);
  if (age === null) return "DOB_INVALID";
  if (age > 120) return "DOB_INVALID";
  if (age < MIN_SIGNUP_AGE) return "DOB_UNDERAGE";
  return null;
}

// Every self-signup path must produce a first name AND a last name (Mike,
// 2026-09-03, after a Google signup landed a student called "Szymon" and
// nothing else). Pure, so the pages and the tests can share the exact rule.
//
// Incomplete = fewer than two whitespace-separated parts, or any part with
// fewer than two letters. Letters are Unicode letters, so Polish diacritics
// pass; a part may carry hyphens or apostrophes between letters
// ("Anna-Maria Kowalska-Nowak", "O'Neil"). Digits and symbols fail.
export type SignupNameProblem = "NAME_REQUIRED" | "NAME_INCOMPLETE";
const NAME_PART = /^\p{L}+(?:[-'\u2019]\p{L}+)*$/u;
export const MAX_SIGNUP_NAME_LENGTH = 100;

export function signupNameProblem(name: string | undefined | null): SignupNameProblem | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "NAME_REQUIRED";
  if (trimmed.length > MAX_SIGNUP_NAME_LENGTH) return "NAME_INCOMPLETE";
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return "NAME_INCOMPLETE";
  for (const part of parts) {
    if (!NAME_PART.test(part)) return "NAME_INCOMPLETE";
    if (part.replace(/[^\p{L}]/gu, "").length < 2) return "NAME_INCOMPLETE";
  }
  return null;
}

// The canonical stored form: trimmed, internal whitespace collapsed to one
// space. Apply before signupNameProblem and before the insert.
export function normaliseSignupName(name: string | undefined | null): string {
  return (name ?? "").trim().replace(/\s+/g, " ");
}
