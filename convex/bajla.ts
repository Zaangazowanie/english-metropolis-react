// Bajla · English Metro WhatsApp assistant — Convex helpers.
//
// Additive module (2026-06-06). Lets the off-Convex Bajla router attach a
// WhatsApp number to a teacher/admin user so role-by-phone resolution works.
// (students.updateStudent already covers the student case.) Pipeline-gated.

import { action, internalMutation, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import {
  createStudentSession, generateToken, requireAdminOrPipelineKey, requireAdminOrStudent,
  sha256Hex,
} from "./authHelpers";
import { signupDobProblem } from "./enrolmentRules";

// Patch a booking's video-room link. Used to replace the Jitsi placeholder with
// a real Google Meet once the VPS (em-report / Bajla router) has minted one.
export const setBookingMeetLink = mutation({
  args: {
    apiKey: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    bookingId: v.id("lessonBookings"),
    meetLink: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const b = await ctx.db.get(args.bookingId);
    if (!b) throw new Error("Booking not found");
    await ctx.db.patch(args.bookingId, { meetLink: args.meetLink, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const setUserPhone = mutation({
  args: {
    apiKey: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    userId: v.id("users"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);
    const u = await ctx.db.get(args.userId);
    if (!u) throw new Error("User not found");
    await ctx.db.patch(args.userId, { phone: args.phone, updatedAt: Date.now() });
    return { ok: true, userId: args.userId };
  },
});

// ─────────────────────────────────────────────────────────────
// Self-serve phone — lets a *logged-in* student/teacher/admin read and save
// their OWN WhatsApp number from the Bajla connect popup, authenticating with
// their own session (the older setUserPhone/updateStudent both require an
// admin/pipeline key, which a student or teacher session does not have).
// Bajla matches accounts by the last 9 digits, so we just keep digits (+ a
// leading "+" if present) and require at least 9 of them.
// ─────────────────────────────────────────────────────────────

export const getMyPhone = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const who = await requireAdminOrStudent(ctx, args.sessionToken);
    const acct = who.kind === "student" ? who.student : who.user;
    return { phone: acct?.phone || null, name: acct?.name || null, kind: who.kind };
  },
});

export const setMyPhone = mutation({
  args: { sessionToken: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    const who = await requireAdminOrStudent(ctx, args.sessionToken);
    const clean = args.phone.trim().replace(/[^\d+]/g, "");
    if (clean.replace(/\D/g, "").length < 9) {
      throw new Error("Phone number must have at least 9 digits");
    }
    const now = Date.now();
    if (who.kind === "student") {
      await ctx.db.patch(who.student._id, { phone: clean, updatedAt: now });
    } else {
      await ctx.db.patch(who.user._id, { phone: clean, updatedAt: now });
    }
    return { ok: true, phone: clean };
  },
});

// ═════════════════════════════════════════════════════════════
// WHATSAPP SIGNUP FUNNEL — server side (2026-08-18)
//
// The Bajla router replaces its "I don't recognise this number" wall with a
// real prospect conversation that can end in an account. Everything below is
// what that conversation is allowed to touch on this side, and nothing more:
//
//   listPackages        public read-only price catalogue (no auth, no PII)
//   waSignupPrecheck    internal — is this phone/email already taken
//   waSignup            pipeline-key action — creates the student
//   waSignupFinish      internal — audit row + first login token, one txn
//   createWaLoginLink   pipeline-key mutation — mint a fresh login token
//   redeemLoginToken    public — the token IS the credential, exchange for a session
//
// Three rules this module exists to hold, and must keep holding:
//   1. The 18+ gate is never bypassed. waSignup refuses a blank date of birth
//      OUTRIGHT (not merely when REQUIRE_SIGNUP_DOB is set), then delegates to
//      studentAuth:studentSignupAction, whose signupInsert re-checks
//      signupDobProblem at the insert itself. Two independent refusals.
//   2. No password is ever collected, transmitted or logged over WhatsApp. The
//      one this path needs is minted here from crypto.getRandomValues and
//      discarded in the same isolate. The person claims the account later via
//      the ordinary /reset flow, which works precisely because a passwordHash
//      now exists.
//   3. Nothing here writes lessonAnalysis, bajlaConsent or isMinor. A funnel
//      account is an ordinary adult account with no add-on consents attached.
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// listPackages — public query, read-only, no auth, no database read.
//
// The single price source Bajla is allowed to quote from. The router caches
// this per turn and the guard then blocks any price string in her reply that
// is not a member of what this returned, so a model that runs the tool and
// then invents a number is still caught.
//
// ⚠ DUPLICATION, KNOWN AND TRACKED. These values are a second copy of
// src/views/public/packages.js, which declares itself the single source of
// truth for the pricing page, the buy wizard and order records. Convex cannot
// import that module without bundling from outside convex/, and that file is
// being edited on another track right now. So: copied, verified byte-for-byte
// against it on 2026-08-18, and guarded by a drift check that must run before
// WA_QUOTE_PRICES is turned on and on every pricing change:
//
//   node --input-type=module -e "import {PRIVATE_PACKAGES,SPECIALIST_PACKAGES,\
//   GROUP_COURSES,PACKAGE_LESSONS} from './src/views/public/packages.js';\
//   for (const p of [...PRIVATE_PACKAGES,...SPECIALIST_PACKAGES,...GROUP_COURSES])\
//   console.log([p.id,PACKAGE_LESSONS[p.id],p.price,p.perLesson].join(' | '))"
//
// The moment convex/packageCatalogue.ts lands, delete these three consts and
// re-export from it. Two ladders is a fabrication engine waiting to happen.
// ─────────────────────────────────────────────────────────────

const CATALOGUE_VERSION = "2026-08-18";

const WA_PRIVATE_PACKAGES = [
  { id: "single", name: "One-off 1:1", lessons: 1, price: "135 PLN", perLesson: "135 PLN / lesson",
    pace: "1 live lesson", pacePl: "1 lekcja na żywo",
    bestFor: "A focused first session with a clear next-step plan",
    bestForPl: "Jedno skoncentrowane spotkanie z jasnym planem na dalszą naukę",
    badge: "Once off", badgePl: "Jednorazowo" },
  { id: "private-core", name: "Private Core", lessons: 4, price: "480 PLN", perLesson: "120 PLN / lesson",
    pace: "4 live lessons", pacePl: "4 lekcje na żywo",
    bestFor: "A compact first month for regular speaking progress",
    bestForPl: "Kompaktowy pierwszy miesiąc regularnej pracy nad mówieniem",
    badge: "Start here", badgePl: "Zacznij tutaj" },
  { id: "momentum", name: "Fluency Momentum", lessons: 8, price: "880 PLN", perLesson: "110 PLN / lesson",
    pace: "8 live lessons", pacePl: "8 lekcji na żywo",
    bestFor: "The strongest routine for steady fluency work",
    bestForPl: "Najmocniejsza rutyna dla stałych postępów w płynności",
    badge: "Most chosen", badgePl: "Najczęściej wybierany" },
  { id: "fluency-16", name: "Fluency Builder", lessons: 16, price: "1,600 PLN", perLesson: "100 PLN / lesson",
    pace: "16 live lessons", pacePl: "16 lekcji na żywo",
    bestFor: "A deeper programme for visible speaking progress",
    bestForPl: "Głębszy program dla widocznych postępów w mówieniu",
    badge: "Best rhythm", badgePl: "Najlepszy rytm" },
  { id: "fluency-24", name: "Fluency Mastery", lessons: 24, price: "2,160 PLN", perLesson: "90 PLN / lesson",
    pace: "24 live lessons", pacePl: "24 lekcje na żywo",
    bestFor: "The best value for sustained private coaching",
    bestForPl: "Najlepsza cena przy długofalowym indywidualnym coachingu",
    badge: "Best value", badgePl: "Najlepsza cena" },
];

const WA_SPECIALIST_PACKAGES = [
  { id: "specialist", name: "Specialist Sprint", lessons: 6, price: "900 PLN", perLesson: "150 PLN / lesson",
    pace: "6 specialist lessons", pacePl: "6 lekcji specjalistycznych",
    bestFor: "Interview, exam, relocation, and business pressure",
    bestForPl: "Rozmowa kwalifikacyjna, egzamin, relokacja i presja biznesowa",
    badge: "Focused", badgePl: "Skupiony" },
  { id: "specialist-12", name: "Specialist Track", lessons: 12, price: "1,560 PLN", perLesson: "130 PLN / lesson",
    pace: "12 specialist lessons", pacePl: "12 lekcji specjalistycznych",
    bestFor: "A focused plan for exam, interview, or business outcomes",
    bestForPl: "Skoncentrowany plan pod egzamin, rozmowę lub cele biznesowe",
    badge: "Deeper focus", badgePl: "Głębsza praca" },
  { id: "specialist-24", name: "Specialist Mastery", lessons: 24, price: "2,640 PLN", perLesson: "110 PLN / lesson",
    pace: "24 specialist lessons", pacePl: "24 lekcje specjalistyczne",
    bestFor: "The best value for long-term specialist coaching",
    bestForPl: "Najlepsza cena przy długofalowym coachingu specjalistycznym",
    badge: "Best specialist value", badgePl: "Najlepsza cena specjalistyczna" },
];

// Fixed timetable, never self-booked: a group runs at set times and the student
// joins it. Bajla must not offer to book one.
const WA_GROUP_COURSES = [
  { id: "september", name: "September Group Course", namePl: "Kurs wrześniowy", lessons: 8,
    price: "200 PLN", perLesson: "25 PLN / lesson",
    pace: "8 group lessons", pacePl: "8 lekcji grupowych",
    bestFor: "Two lessons a week for the month, in a group of up to 4 at your level",
    bestForPl: "Dwie lekcje w tygodniu przez miesiąc, w grupie do 4 osób na Twoim poziomie",
    badge: "September", badgePl: "Wrzesień" },
];

export const listPackages = query({
  args: {},
  handler: async () => {
    return {
      currency: "PLN",
      catalogueVersion: CATALOGUE_VERSION,
      pricingUrl: "https://englishmetro.com/pricing",
      packages: WA_PRIVATE_PACKAGES,
      specialist: WA_SPECIALIST_PACKAGES,
      groups: WA_GROUP_COURSES,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Login tokens — a third `kind` on the existing studentTokens table.
//
// No schema migration: studentTokens.kind is v.string() and both indexes
// (by_tokenHash, by_student_kind) are kind-agnostic. Only the SHA-256 hash is
// stored, exactly as "verify" and "reset" do.
//
// 3 minutes, single use, hash-only (Mike's call, 2026-08-19). "verify" is 7 days
// and "reset" is 1 hour, but this link arrives in a WhatsApp thread that persists
// forever on a handset that may be shared, and Meta holds a copy. It is read
// within a minute or not at all, so the window is set to the smallest value that
// still survives a slow handset waking a browser.
// ─────────────────────────────────────────────────────────────
const LOGIN_TOKEN_TTL_MS = 3 * 60 * 1000;

const onlyDigits = (s: string | undefined | null) => (s || "").replace(/\D/g, "");

// Mint a fresh single-use login token for a student, superseding any live one.
// Shared by the signup path and the re-mint path so there is one implementation.
async function mintLoginTokenFor(ctx: any, student: any) {
  const now = Date.now();
  const previous = await ctx.db
    .query("studentTokens")
    .withIndex("by_student_kind", (q: any) => q.eq("studentId", student._id).eq("kind", "login"))
    .collect();
  for (const row of previous) {
    if (!row.usedAt && row.expiresAt > now) await ctx.db.patch(row._id, { usedAt: now });
  }
  const token = generateToken();
  const expiresAt = now + LOGIN_TOKEN_TTL_MS;
  await ctx.db.insert("studentTokens", {
    kind: "login",
    tokenHash: await sha256Hex(token),
    studentId: student._id,
    email: student.email || student.googleEmail || "",
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}

// ─────────────────────────────────────────────────────────────
// waSignupPrecheck — internal. Gives the router a machine-readable reason to
// stop BEFORE an account is created, which studentSignupAction cannot: its
// duplicate-email refusal is a prose string with no code, and the router has to
// branch on it (an email that already has an account gets a sign-in link to the
// INBOX, never a login link over WhatsApp — minting one on an address a
// stranger typed is an account-takeover primitive).
//
// Note the two phone rules pull in opposite directions on purpose:
//   refusing here uses the LAST NINE DIGITS, the same forgiving rule
//     findAccountByPhone uses, because anyone it would already resolve must
//     never reach this path a second time;
//   granting a login link below uses an EXACT full-number match, because a
//     nine-digit collision there would hand one person another person's account.
// Conservative in both directions.
// ─────────────────────────────────────────────────────────────
export const waSignupPrecheck = internalMutation({
  args: { email: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const wantTail = onlyDigits(args.phone).slice(-9);
    if (wantTail.length < 9) return { ok: false, code: "PHONE_INVALID" };

    const students = await ctx.db.query("students").collect();
    for (const s of students) {
      if (s.status === "archived") continue;
      if ((s.email || "").toLowerCase() === email) return { ok: false, code: "EMAIL_TAKEN" };
      if ((s.googleEmail || "").toLowerCase() === email) return { ok: false, code: "EMAIL_TAKEN" };
      if (s.phone && onlyDigits(s.phone).slice(-9) === wantTail) {
        return { ok: false, code: "PHONE_TAKEN", slug: s.slug };
      }
    }
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────
// waSignupFinish — internal. The accountability record and the first login
// token, in one transaction with the account that was just created.
//
// The audit row is the Art 5(2) evidence that this person was shown a notice
// before anything was collected, and WHICH notice: `noticeVersion` is the
// string the router actually sent, not a default. It also doubles as the only
// WhatsApp attribution that exists (nothing on students, lessonOrders or
// p24Payments records an origin), joinable by targetId.
// ─────────────────────────────────────────────────────────────
export const waSignupFinish = internalMutation({
  args: {
    studentId: v.id("students"),
    noticeVersion: v.string(),
    lang: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    if (!student) return { ok: false as const, code: "NO_STUDENT" };
    const now = Date.now();
    await ctx.db.insert("auditLog", {
      organizationId: student.organizationId,
      action: "student.whatsappSignup",
      targetType: "student",
      targetId: student._id,
      details: JSON.stringify({
        source: "whatsapp",
        noticeVersion: args.noticeVersion,
        lang: args.lang || null,
        ageDeclaredAdult: true,
        dateOfBirthOnRecord: !!student.dateOfBirth,
      }),
      timestamp: now,
    });
    const { token, expiresAt } = await mintLoginTokenFor(ctx, student);
    return {
      ok: true as const,
      token,
      expiresAt,
      studentId: student._id,
      slug: student.slug,
      name: student.name,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// waSignup — pipeline-key action. The one way a WhatsApp conversation becomes
// an account.
//
// Gated on PIPELINE_API_KEY by string comparison rather than
// requireAdminOrPipelineKey, because that helper needs ctx.db and an action has
// none. Same shape as studentAuth:createStudentToken's key check.
//
// The password is generated here and never leaves this isolate. It is NOT
// returned, NOT logged and NOT sent to the router: a credential in a WhatsApp
// thread is a credential Meta keeps a copy of. It exists so the row has a
// passwordHash, which is what makes the ordinary /reset path work for this
// person later (createStudentToken refuses kind "reset" on an account with no
// passwordHash).
// ─────────────────────────────────────────────────────────────
export const waSignup = action({
  args: {
    apiKey: v.string(),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    dateOfBirth: v.string(),
    noticeVersion: v.string(),
    lang: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const expected = process.env.PIPELINE_API_KEY;
    if (!expected || args.apiKey !== expected) return { success: false, code: "UNAUTHORIZED" };

    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    // Keep digits and a leading "+", the same normalisation setMyPhone applies.
    // The FULL number is what gets stored: the exact-match login rule below and
    // the fix for the last-nine-digits collision both depend on it being whole.
    const phone = args.phone.trim().replace(/[^\d+]/g, "");
    const dateOfBirth = args.dateOfBirth.trim();
    const noticeVersion = args.noticeVersion.trim();

    if (name.length < 2) return { success: false, code: "NAME_INVALID" };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, code: "EMAIL_INVALID" };
    if (onlyDigits(phone).length < 9) return { success: false, code: "PHONE_INVALID" };
    // Accountability is not optional on this path: we record the notice that
    // was actually sent, so a router that forgot to send one cannot create an
    // account and claim it did.
    if (!noticeVersion) return { success: false, code: "NOTICE_VERSION_REQUIRED" };
    // ⛔ Deliberately NOT delegated to REQUIRE_SIGNUP_DOB. That env flag exists
    // to sequence a web deploy and may be unset in prod; whether it is has not
    // been verified. On this path a blank date of birth is refused outright, so
    // the 18+ block cannot be switched off by an env var nobody has read.
    if (!dateOfBirth) return { success: false, code: "DOB_REQUIRED" };
    const dobProblem = signupDobProblem(dateOfBirth);
    if (dobProblem) return { success: false, code: dobProblem };

    const pre: any = await ctx.runMutation(internal.bajla.waSignupPrecheck, { email, phone });
    // On EMAIL_TAKEN the router must NOT be given a login link: minting one on
    // an address a stranger typed is an account-takeover primitive, so that
    // case goes to the person's INBOX. There is one safe recovery it should try
    // first — call createWaLoginLink with the SAME phone. That only returns a
    // token when the number on the account is exactly this one, which is true
    // precisely when we created that account for this handset on an earlier
    // attempt that failed after the insert. ok:false means the address belongs
    // to somebody else, and the inbox is the only correct route.
    if (!pre.ok) return { success: false, code: pre.code, slug: pre.slug };

    // studentSignupAction is the only signup entry point that both persists
    // dateOfBirth (via signupInsert) and re-checks signupDobProblem at the
    // insert. studentAuth:studentSignup validates the date and then drops it —
    // never call that one from here.
    const created: any = await ctx.runAction(api.studentAuth.studentSignupAction, {
      name, email, password: generateToken(), phone, dateOfBirth,
    });
    if (!created?.success) {
      // The server is the authority, not the button the person tapped. A
      // DOB_UNDERAGE here means erase and stop, not retry.
      return { success: false, code: created?.code || "SIGNUP_REFUSED", error: created?.error };
    }

    const finished: any = await ctx.runMutation(internal.bajla.waSignupFinish, {
      studentId: created.student._id,
      noticeVersion,
      lang: args.lang,
    });
    if (!finished.ok) return { success: false, code: finished.code };

    // No sessionToken is returned. studentSignupAction minted one; its raw
    // value is discarded in this isolate and only its hash was stored, so it is
    // unreachable dead weight rather than a live credential in a chat log.
    return {
      success: true,
      studentId: finished.studentId,
      slug: finished.slug,
      name: finished.name,
      token: finished.token,
      expiresAt: finished.expiresAt,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// createWaLoginLink — pipeline-key mutation. Mints a fresh login token when the
// first one expired unread, without creating anything.
//
// It resolves the student by an EXACT full-number match on the digits, NOT by
// the last nine that findAccountByPhone uses. That is the whole point: a login
// token is a live key to an account, and handing it to whoever happens to share
// nine trailing digits with a real student is account takeover. A student whose
// stored number is a bare national number will simply not match, and no link is
// minted — the correct, safe failure.
//
// Returns { ok: false } for an unknown number, an archived student and a bad
// key alike, so the endpoint cannot be used to test whether a number is ours.
// ─────────────────────────────────────────────────────────────
export const createWaLoginLink = mutation({
  args: {
    apiKey: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminOrPipelineKey(ctx, args.sessionToken, args.apiKey);

    const want = onlyDigits(args.phone);
    if (want.length < 9) return { ok: false as const };

    const students = await ctx.db.query("students").collect();
    const student = students.find(
      (s) => s.status !== "archived" && !!s.phone && onlyDigits(s.phone) === want,
    );
    if (!student) return { ok: false as const };

    const { token, expiresAt } = await mintLoginTokenFor(ctx, student);
    return {
      ok: true as const,
      token,
      expiresAt,
      studentId: student._id,
      slug: student.slug,
      name: student.name,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// redeemLoginToken — public mutation. The token IS the credential, so there is
// no key and no session on the way in. Mirrors teacherAuth:verifyMagicToken.
//
// ⛔ It does NOT stamp emailVerifiedAt. Redeeming a link delivered to a
// WhatsApp number proves control of that number and nothing whatever about the
// email address the person typed into a chat. Verification is the one signal
// the booking gate relies on (scheduling.ts REQUIRE_VERIFIED_TO), so a stolen
// or forwarded link must not be able to satisfy it. The confirmation email that
// studentSignupAction already sent is what verifies the address.
// ─────────────────────────────────────────────────────────────
export const redeemLoginToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const hash = await sha256Hex(args.token);
    const record = await ctx.db
      .query("studentTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", hash))
      .unique();

    const now = Date.now();
    if (!record || record.kind !== "login" || record.usedAt || record.expiresAt < now) {
      return { ok: false as const };
    }

    const student = await ctx.db.get(record.studentId);
    if (!student || student.status === "archived") return { ok: false as const };

    await ctx.db.patch(record._id, { usedAt: now });
    const sessionToken = await createStudentSession(ctx, student._id);

    return {
      ok: true as const,
      sessionToken,
      student: {
        _id: student._id,
        name: student.name,
        slug: student.slug,
        email: student.email ?? null,
        organizationId: student.organizationId ?? null,
      },
    };
  },
});
