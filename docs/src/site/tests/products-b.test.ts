import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXTRA_SECTIONS_MORE } from '../content/extra-sections.more'
import { HEROES_B, SHARE_B } from '../demos/_asset-b.generated'
import { DEMOS_APP } from '../demos/registry.app'
import { DEMOS_TOOLS } from '../demos/registry.tools'

/**
 * The app-building-blocks and visual-and-tools product pages: every id has
 * its content file, a registered live demo (in its group's registry), a hero
 * visual whose files are in public/, and a share image. A missing piece fails
 * here, not as a silently empty section on the built page.
 */
const APP = ['feature', 'i18n', 'permissions', 'urlstate', 'hotkeys', 'rx', 'dnd', 'toast', 'table', 'virtual']
const TOOLS = ['charts', 'editor', 'flow', 'document', 'atlas', 'lathe', 'loom', 'tooling', 'ai', 'migrate']

const content = resolve(__dirname, '../content/products')
const pub = resolve(__dirname, '../../../public')
const read = (id: string) => JSON.parse(readFileSync(resolve(content, `${id}.json`), 'utf8'))
const inPublic = (url: string) => existsSync(resolve(pub, url.replace(/^\//, '')))

describe.each([
  ['app', APP, DEMOS_APP],
  ['tools', TOOLS, DEMOS_TOOLS],
] as const)('%s group', (_group, ids, registry) => {
  it.each(ids)('%s has its content, a demo in its registry, a hero visual and a share image', (id) => {
    const data = read(id)
    expect(data.id).toBe(id)
    expect(Object.keys(registry), `${id}: demo ${data.demo.component} is not registered`).toContain(data.demo.component)
    expect(existsSync(resolve(__dirname, `../demos/${data.demo.component}.tsx`))).toBe(true)

    const hero = HEROES_B[id]
    expect(hero, `${id}: no hero visual`).toBeDefined()
    if (!hero) return
    expect(hero.alt.length).toBeGreaterThan(20)
    expect(hero.width).toBeGreaterThan(0)
    expect(hero.height).toBeGreaterThan(0)
    const files = hero.kind === 'svg' ? [hero.dark, hero.light] : [...hero.dark, ...hero.light].map((v) => v.file)
    expect(files.length).toBeGreaterThan(1)
    for (const f of files) expect(inPublic(f), `${id}: ${f} is not in public/`).toBe(true)

    const share = SHARE_B[id]
    expect(share, `${id}: no share image`).toBeDefined()
    if (share) expect(inPublic(share), `${id}: ${share} is not in public/`).toBe(true)
  })
})

describe('pre-themed hero SVGs', () => {
  it.each(Object.entries(HEROES_B).filter(([, h]) => h.kind === 'svg'))('%s has a dark and a light copy', (_id, hero) => {
    if (hero.kind !== 'svg') return
    expect(readFileSync(resolve(pub, hero.dark.slice(1)), 'utf8')).toMatch(/^<svg data-theme="dark" /)
    expect(readFileSync(resolve(pub, hero.light.slice(1)), 'utf8')).toMatch(/^<svg data-theme="light" /)
  })
})

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
