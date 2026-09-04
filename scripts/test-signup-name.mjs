// Unit test for the compulsory first-name + last-name rule (2026-09-03).
// Bundles convex/enrolmentRules.ts with esbuild into a scratch ESM file so the
// exact server rule is what is asserted, not a copy. Run:
//   node scripts/test-signup-name.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(mkdtempSync(join(process.env.SCRATCH_DIR || tmpdir(), 'signup-name-')), 'enrolmentRules.mjs')
execFileSync(join(root, 'node_modules/.bin/esbuild'), [
  join(root, 'convex/enrolmentRules.ts'), '--format=esm', '--platform=node', '--target=es2022', `--outfile=${out}`,
], { stdio: 'inherit' })
const { signupNameProblem, normaliseSignupName } = await import(pathToFileURL(out).href)

// Client mirror: the field-level check the pages use to hold the button back.
const { nameFieldOk, joinName } = await import(pathToFileURL(join(root, 'src/lib/signup-name.js')).href)

const cases = [
  ['single word (the Szymon case)', 'Szymon', 'NAME_INCOMPLETE'],
  ['two words', 'Szymon Kowalski', null],
  ['Polish diacritics', 'Łukasz Żółć', null],
  ['hyphenated both parts', 'Anna-Maria Kowalska-Nowak', null],
  ['apostrophe', "Conor O'Neil", null],
  ['curly apostrophe', 'Conor O’Neil', null],
  ['leading/trailing spaces', '   Marta   Kowalska  ', null],
  ['three parts (middle name)', 'Jan Maria Rokita', null],
  ['digits in a part', 'Marta K0walska', 'NAME_INCOMPLETE'],
  ['single-letter part', 'Marta K', 'NAME_INCOMPLETE'],
  ['single-letter initial with dot', 'J. Kowalski', 'NAME_INCOMPLETE'],
  ['empty', '', 'NAME_REQUIRED'],
  ['whitespace only', '   ', 'NAME_REQUIRED'],
  ['undefined', undefined, 'NAME_REQUIRED'],
  ['very long (101+ chars)', 'A'.repeat(60) + ' ' + 'B'.repeat(60), 'NAME_INCOMPLETE'],
  ['long but under the cap', 'A'.repeat(40) + ' ' + 'B'.repeat(40), null],
  ['e-mail local part', 'szymon.k', 'NAME_INCOMPLETE'],
  ['symbols', 'Marta @Kowalska', 'NAME_INCOMPLETE'],
  ['hyphen at edge', 'Marta -Kowalska', 'NAME_INCOMPLETE'],
  ['Cyrillic letters', 'Олена Шевченко', null],
]
let pass = 0, fail = 0
const ok = (label, got, want) => {
  const good = got === want
  good ? pass++ : fail++
  console.log(`  ${good ? 'PASS' : 'FAIL'}  ${label}   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
}
console.log('signupNameProblem (server rule)')
for (const [label, input, want] of cases) ok(label, signupNameProblem(input), want)

console.log('normaliseSignupName')
ok('collapses inner whitespace, trims', normaliseSignupName('  Marta \t  Kowalska '), 'Marta Kowalska')

console.log('client mirror: nameFieldOk / joinName')
ok('first name ok', nameFieldOk('Anna'), true)
ok('double first name ok', nameFieldOk('Anna Maria'), true)
ok('one letter refused', nameFieldOk('A'), false)
ok('digits refused', nameFieldOk('An4'), false)
ok('space + initial refused (server would refuse the part)', nameFieldOk('Anna M'), false)
ok('joined name is what the server accepts', signupNameProblem(joinName('  Anna ', ' Kowalska ')), null)
ok('joinName collapses spaces', joinName('Anna  Maria', 'Nowak'), 'Anna Maria Nowak')
// Every client-accepted pair must be server-accepted (the button never enables for a refusal).
for (const [f, l] of [['Zoë', 'Brontë'], ['Jean-Luc', "D'Arcy"], ['Ola', 'Kot']]) {
  ok(`client/server agree on "${f} ${l}"`, nameFieldOk(f) && nameFieldOk(l) && signupNameProblem(joinName(f, l)) === null, true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
