// Shared by scripts/build-legal-static.mjs (static pages) and
// FoundationLegalPage.jsx (SPA): gives every top-level <section> of a legal
// document body a stable id and returns the table of contents for it, so
// the sidebar TOC and its scroll-spy work on both surfaces. The document
// text itself is not touched; only the section wrapper gains an id.

const SECTION_RE = /<section\b([^>]*)>([\s\S]*?)(?=<\/section>)/g
const H2_RE = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i

function slug(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .toLowerCase().replace(/&[a-z]+;|&#\d+;/g, ' ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'section'
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} html   document body (one language)
 * @param {string} suffix appended to generated ids so two languages on one
 *                        page never collide (the PL body passes '')
 * @returns {{ html: string, toc: Array<{id: string, title: string}> }}
 */
export function prepareLegalDoc(html, suffix = '') {
  const toc = []
  const used = new Set()
  let index = 0
  const out = html.replace(SECTION_RE, (match, attrs, inner) => {
    index += 1
    const h2 = inner.match(H2_RE)
    if (!h2) return match // sections without a heading (lead paragraphs) are not TOC entries
    const title = stripTags(h2[1])
    const existing = attrs.match(/\bid="([^"]+)"/)
    let id = existing ? existing[1] : slug(title) + suffix
    while (!existing && used.has(id)) id = `${slug(title)}-${index}${suffix}`
    used.add(id)
    toc.push({ id, title })
    if (existing) return match
    return `<section${attrs} id="${id}">${inner}`
  })
  if (toc.length >= 2) return { html: out, toc }
  // Single-section documents (the lesson-analysis notice): index the h2s.
  const toc2 = []
  const used2 = new Set()
  let n = 0
  const out2 = html.replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi, (match, attrs, inner) => {
    n += 1
    const title = stripTags(inner)
    const existing = attrs.match(/\bid="([^"]+)"/)
    let id = existing ? existing[1] : slug(title) + suffix
    while (!existing && used2.has(id)) id = `${slug(title)}-${n}${suffix}`
    used2.add(id)
    toc2.push({ id, title })
    return existing ? match : `<h2${attrs} id="${id}">${inner}</h2>`
  })
  return { html: out2, toc: toc2 }
}

/** Wrap bare tables so wide ones scroll inside their own box on mobile. */
export function wrapTables(html) {
  return html.replace(/<table\b/g, '<div class="fl-table-wrap"><table').replace(/<\/table>/g, '</table></div>')
}
