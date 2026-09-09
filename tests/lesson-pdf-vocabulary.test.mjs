import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const files = ['src/views/Lessons.jsx', 'src/views/v3/lessons-pdf.js']
function render(file, keywords, initialY = 640) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const begin = source.indexOf('  function renderVocabulary() {')
  const end = source.indexOf('\n  // ------------------------------------------------------------------------\n  // Render flow', begin)
  assert.ok(begin >= 0 && end > begin, 'PDF vocabulary renderer not found')
  const output = [], measurements = []
  let size = 10, bold = false, page = 1
  const scope = {
    lesson: { keywords }, W: 595, MX: 42, CONTENT_BOTTOM: 790, CONTENT_TOP_PN: 142,
    C: { violetDeep: [], slate500: [], fuchsiaDeep: [], slate100: [] },
    y: initialY, pageNum: 1,
    fontR: () => { bold = false }, fontB: () => { bold = true },
    setColor() {}, setStroke() {}, drawFooter() {}, drawHero() {},
    doc: {
      setFontSize(v) { size = v }, setCharSpace() {}, setLineWidth() {}, line() {},
      addPage() { page++ },
      splitTextToSize(text, width) {
        measurements.push({ text, size, bold })
        const chars = Math.floor(width / (size * (bold ? .6 : .5)))
        return text.match(new RegExp('.{1,' + chars + '}', 'g')) || ['']
      },
      text(text, x, y) { output.push({ text, x, y, page, size, bold }) },
    },
  }
  scope.ensureSpace = need => {
    if (scope.y + need > scope.CONTENT_BOTTOM) {
      scope.doc.addPage(); scope.pageNum++; scope.y = scope.CONTENT_TOP_PN
    }
  }
  scope.sectionHeader = () => { scope.ensureSpace(42); scope.y += 26 }
  vm.runInNewContext(source.slice(begin, end) + '\nrenderVocabulary()', scope)
  return { output, measurements }
}

const keywords = count => Array.from({ length: count }, (_, i) => ({
  word: `keyword-${i + 1}`, ipa: `/pronunciation-${i + 1}/`,
  translation: 'A translation with several words that must wrap into another line without being lost.',
  exampleEn: 'This complete example must remain readable and include its final distinctive word: FINISH.',
}))

for (const file of files) {
  test(`${file}: page transitions preserve every entry exactly once in alternating columns`, () => {
    const data = keywords(41)
    const { output } = render(file, data)
    for (const [i, kw] of data.entries()) {
      const words = output.filter(t => t.text === kw.word)
      assert.equal(words.length, 1, kw.word)
      assert.equal(words[0].x, i % 2 ? 305.5 : 42, kw.word)
    }
    assert.ok(output.at(-1).page > 1)
    for (const t of output) {
      assert.ok(t.y - t.size >= 142, JSON.stringify(t))
      assert.ok(t.y <= 790, JSON.stringify(t))
    }
    for (let i = 0; i < output.length; i++) {
      for (const other of output.slice(i + 1)) {
        const t = output[i]
        if (t.page === other.page && t.x === other.x) {
          assert.ok(t.y <= other.y - other.size || other.y <= t.y - t.size, 'overlapping text: ' + t.text + ' / ' + other.text)
        }
      }
    }
  })
  test(`${file}: correct font measurement, separate IPA, and full translations/examples`, () => {
    const data = keywords(2)
    const { output, measurements } = render(file, data, 200)
    assert.ok(measurements.some(m => m.text === data[0].word && m.bold && m.size === 10.5))
    assert.ok(measurements.some(m => m.text === data[0].ipa && !m.bold && m.size === 8.5))
    const first = output.filter(t => t.x === 42)
    assert.ok(first[1].y > first[0].y)
    assert.equal(first.map(t => t.text).join(''), data[0].word + data[0].ipa + data[0].translation + `"${data[0].exampleEn}"`)
  })
  test(`${file}: an entry taller than a page remains complete`, () => {
    const data = keywords(1)
    data[0].exampleEn = 'A long but fully retained explanation. '.repeat(120) + 'THE END'
    const { output } = render(file, data)
    assert.ok(output.at(-1).page > 2)
    assert.equal(output.map(t => t.text).join(''), data[0].word + data[0].ipa + data[0].translation + `"${data[0].exampleEn}"`)
  })
}
