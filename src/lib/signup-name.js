// Client mirror of convex/enrolmentRules.ts:signupNameProblem, so the pages can
// hold the submit button back for exactly the names the server will refuse.
// The server remains the authority; this only saves a round trip.
//
// A single field ("first name" or "last name") passes when it is letters only,
// with hyphens, apostrophes or single spaces between letter runs ("Anna Maria",
// "Kowalska-Nowak", "O'Neil"), and carries at least two letters.
const FIELD = /^\p{L}+(?:[-'’ ]\p{L}+)*$/u

export function nameFieldOk(value) {
  const v = String(value || '').trim().replace(/\s+/g, ' ')
  if (!v || v.length > 50) return false
  if (!FIELD.test(v)) return false
  // Each space-separated piece needs two letters, same as the server's parts.
  return v.split(' ').every(part => part.replace(/[^\p{L}]/gu, '').length >= 2)
}

// The one string the server stores: "First Last", trimmed, spaces collapsed.
export function joinName(first, last) {
  return `${String(first || '')} ${String(last || '')}`.trim().replace(/\s+/g, ' ')
}
