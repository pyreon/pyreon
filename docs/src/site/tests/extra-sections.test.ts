import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXTRA_SECTIONS_MORE } from '../content/extra-sections.more'

const content = resolve(__dirname, '../content/products')
const read = (id: string) => JSON.parse(readFileSync(resolve(content, `${id}.json`), 'utf8'))

/** Visible text of the reference HTML: tags dropped, entities decoded, whitespace collapsed. */
function htmlText(html: string): string {
  return html
    .replace(/<\/?(code|i|b|span)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}
const norm = (s: string) => s.replace(/`/g, '').replace(/\s+/g, ' ').trim()

describe('typed extra sections match the content files', () => {
  // extra-sections.more.ts is a typed copy of each file's reference-only
  // extraSectionsHtml. When a re-sync changes that HTML, this names the copy to update.
  it.each(Object.entries(EXTRA_SECTIONS_MORE))('%s', (id, sections) => {
    const text = norm(htmlText(read(id).extraSectionsHtml ?? ''))
    const strings: string[] = []
    for (const s of sections) {
      strings.push(s.label, s.title)
      if (s.text) strings.push(s.text)
      switch (s.kind) {
        case 'terminal':
          strings.push(...s.output.split('\n').filter((l) => l.trim()))
          break
        case 'tools':
          for (const i of s.items) strings.push(i.name, i.title, i.text, i.cmd)
          break
        case 'table':
          strings.push(...s.columns, ...s.rows.flat())
          break
        case 'chips':
          for (const g of s.groups) strings.push(g.name, ...g.items)
          break
        case 'packageRows':
          for (const r of s.rows) for (const i of r.items) strings.push(i.pkg, i.role, i.text)
          break
      }
    }
    for (const str of strings) expect(text, `${id}: "${str}" is no longer in extraSectionsHtml`).toContain(norm(str))
  })
})

describe('comingFromTitle', () => {
  it('names each library once and joins the list the way a person writes it', async () => {
    const { comingFromTitle } = await import('../kit/recipe')
    expect(comingFromTitle(['React Flow', 'React Flow', 'React Flow'])).toBe('Coming from React Flow?')
    expect(comingFromTitle(['i18next', 'react-intl'])).toBe('Coming from i18next or react-intl?')
    expect(comingFromTitle(['ECharts', 'Chart.js', 'Recharts'])).toBe('Coming from ECharts, Chart.js or Recharts?')
  })
})
