import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BASELINE_PATH, countFindings, FIX, loadSources, report, scan, type DesignFinding } from '../../../../../scripts/check-site-design'
import { readReadableBaseline, updatePerFile } from '../../../../../scripts/check-readable-ratchet'
import { blankComments } from '../../../../../scripts/site-design/lex'
import { literalNumbers, scanLiterals, tokensOut, valueAt } from '../../../../../scripts/site-design/literals'
import {
  duplicateNames,
  focusMissing,
  galleryMissing,
  importsOf,
  islandStylingRuntime,
  kitBoundary,
  motionUnguarded,
  type SourceFile,
  styledOutsideKit,
} from '../../../../../scripts/site-design/structure'
import { countDiff, shotName } from '../../../../../scripts/site-visual-sweep'

const rules = (src: string, css = false) => scanLiterals(blankComments(src, css)).map((f) => `${f.rule} ${f.detail}`)
const file = (path: string, text: string): SourceFile => ({ path: `docs/src/${path}`, text: blankComments(text, path.endsWith('.css')) })

describe('site design — comment blanking', () => {
  it('blanks // and /* */ comments in code, keeps strings, templates and line numbers', () => {
    const src = "const a = 'http://x' // gap: 12\n/* padding: 8px */ const b = `margin: 4px; /* top: 9px */`"
    const out = blankComments(src)
    expect(out.split('\n')).toHaveLength(2)
    expect(out).toContain("'http://x'")
    expect(out).not.toContain('gap: 12')
    expect(out).not.toContain('padding: 8px')
    expect(out).not.toContain('top: 9px')
    expect(out).toContain('margin: 4px;')
  })

  it('follows ${} into code and back into the template', () => {
    const out = blankComments('css`a { ${x /* c */ ? css`b { gap: 2px }` : ""} padding: 4px }`')
    expect(out).toContain('gap: 2px')
    expect(out).toContain('padding: 4px')
    expect(out).not.toContain('/* c */')
  })

  it('does not read a glob or a regex literal as a comment', () => {
    expect(blankComments("const g = 'docs/**/*.md'; const r = /a\\/\\/b/; const k = 1")).toContain('const k = 1')
  })
})

describe('site design — literals', () => {
  it('reads rocketstyle objects, responsive objects, CSS strings and stylesheets', () => {
    expect(rules('.theme(() => ({ padding: 12, marginTop: 8, fontSize: 13, borderRadius: 4, zIndex: 3 }))')).toEqual([
      'literal/space padding: 12',
      'literal/space marginTop: 8',
      'literal/font-size fontSize: 13',
      'literal/radius borderRadius: 4',
      'literal/z-index zIndex: 3',
    ])
    expect(rules('.attrs({ gap: { xs: 12, md: 20 } })')).toEqual(['literal/space gap: 12', 'literal/space gap: 20'])
    expect(rules('.a { padding: 8px 14px; font: 600 12px/1 x; box-shadow: 0 2px 4px red }', true)).toEqual([
      'literal/space padding: 8px',
      'literal/space padding: 14px',
      'literal/font-size font: 12px',
      'literal/shadow box-shadow: 0 2px 4px red',
    ])
  })

  it('treats interpolations, var() reads, hairlines and calc arithmetic as tokens', () => {
    expect(rules('const s = `padding: ${space[150]}px; margin: var(--s-space-100); top: 1px; left: -1px; gap: 0`')).toEqual([])
    expect(rules('.a { padding-top: calc((44px - 1em) / 2) }', true)).toEqual(['literal/space padding-top: 44px', 'literal/space padding-top: 1em'])
    expect(tokensOut('a ${b ? `${c}` : d} var(--x, 2px) e')).not.toMatch(/[bcd]|2px/)
  })

  it('finds colours and @media widths, not fragments or numbers in copy', () => {
    expect(rules("const c = '#FF5E1A'; const d = 'rgba(0,0,0,.5)'; const h = href='#faq'; const n = 'Invoice #1042'")).toEqual([
      'literal/color #FF5E1A',
      'literal/color rgba(0…)',
    ])
    expect(rules('@media (max-width: 699.98px) { }', true)).toEqual(['literal/media @media 699.98px'])
    expect(rules('const q = `@media (min-width: ${breakpoints.md}px) {}`')).toEqual([])
  })

  it('valueAt stops at the declaration end, literalNumbers keeps units', () => {
    expect(valueAt('padding: 12px 4px; margin: 2px', 9)).toBe('12px 4px')
    expect(valueAt('{ gap: 18, color: x }', 7)).toBe('18')
    expect(literalNumbers('0.5rem 1px 12', 'literal/space')).toEqual(['0.5rem', '12'])
  })
})

describe('site design — structure', () => {
  const kit = file('site/kit/cards.tsx', "export const Card = el.config({ name: 'Card' })\nexport function Badge() {}\nexport const ALL = 1\nimport { Page } from '../pages/Home'")
  const page = file('site/pages/Home.tsx', "import { el } from '../kit/bases'\nconst Stack = el.config({ name: 'Card' }).theme(() => ({}))\nconst X = Pill.config({ extendCss: '' })")
  const gallery = file('site/pages/KitGallery.tsx', 'import { Card } from "../kit/cards"')

  it('counts styled definitions and extendCss outside the kit, not in demos', () => {
    const demo = file('site/demos/DemoX.tsx', "const A = el.config({ name: 'DemoA' })")
    expect(styledOutsideKit([kit, page, demo]).map((f) => `${f.file} ${f.rule}`)).toEqual([
      'docs/src/site/pages/Home.tsx kit/styled-outside',
      'docs/src/site/pages/Home.tsx kit/extend-css',
    ])
  })

  it('reports the second definition of a name, the kit one counting as first', () => {
    expect(duplicateNames([page, kit]).map((f) => f.file)).toEqual(['docs/src/site/pages/Home.tsx'])
  })

  it('kit → app imports and page → kit internals', () => {
    const files = [kit, page, file('site/kit/bases.ts', 'export const el = 1')]
    expect(kitBoundary(files).map((f) => `${f.rule} ${f.detail}`)).toEqual(['kit/imports-app ../pages/Home', 'kit/internal-import ../kit/bases'])
  })

  it('reads value imports only', () => {
    expect(importsOf("import type { A } from './a'\nimport { b } from './b'\nexport { c } from './c'\nconst d = import('./d')").map((i) => i.spec)).toEqual(['./b', './c', './d'])
  })

  it('follows an island into the styling runtime, but not into demos or through dynamic imports', () => {
    const files = [
      file('site/kit/islands.ts', "export const A = island(() => import('./Nav'), { name: 'A' })\nexport const B = island(() => import('./Lazy'), { name: 'B' })"),
      file('site/kit/Nav.tsx', "import { el } from './bases'"),
      file('site/kit/bases.ts', "import rocketstyle from '@pyreon/rocketstyle'"),
      file('site/kit/Lazy.tsx', "const X = import('./bases')"),
    ]
    const found = islandStylingRuntime(files)
    expect(found).toHaveLength(1)
    expect(found[0]?.detail).toBe('docs/src/site/kit/Nav.tsx → docs/src/site/kit/bases.ts → @pyreon/rocketstyle')
  })

  it('lists kit components the gallery never names (not ALL-CAPS constants)', () => {
    expect(galleryMissing([kit, gallery]).map((f) => f.detail)).toEqual(['Badge'])
  })

  it('flags an interactive definition without a focus style', () => {
    const f = file('site/kit/x.tsx', "export const Go = el\n  .config({ name: 'Go' })\n  .attrs({ tag: 'button' })\n  .theme(() => ({ color: 'red' }))\nexport const Ok = el\n  .config({ name: 'Ok' })\n  .attrs({ tag: 'a' })\n  .theme((_t, m) => ({ focus: focusRing(m) }))")
    expect(focusMissing([f]).map((x) => x.detail)).toEqual(['Go'])
  })

  it('flags motion only in a file that never handles reduced motion', () => {
    const bare = file('site/kit/a.tsx', "theme(() => ({ transition: motion.hover, animation: 'none' }))")
    const guarded = file('site/kit/b.tsx', 'const s = `transition: color .2s; @media (prefers-reduced-motion: reduce) { transition: none }`')
    expect(motionUnguarded([bare, guarded]).map((x) => `${x.file} ${x.detail}`)).toEqual(['docs/src/site/kit/a.tsx transition:'])
  })
})

describe('site design — the ratchet', () => {
  const finding = (rule: string, f = 'docs/src/site/pages/A.tsx'): DesignFinding => ({ file: f, line: 3, rule, detail: 'gap: 12' })
  const silent = () => {
    const lines: string[] = []
    return { lines, log: { log: (s: string) => lines.push(s), error: (s: string) => lines.push(s) } }
  }

  it('passes at or below the baseline and fails on growth, saying what to do before where', () => {
    const ok = silent()
    expect(report([finding('literal/space')], { 'docs/src/site/pages/A.tsx': { 'literal/space': 1 } }, ok.log as never)).toBe(true)
    const bad = silent()
    expect(report([finding('literal/space'), finding('literal/space')], { 'docs/src/site/pages/A.tsx': { 'literal/space': 1 } }, bad.log as never)).toBe(false)
    const text = bad.lines.join('\n')
    expect(text.indexOf(FIX.literal as string)).toBeGreaterThan(0)
    expect(text.indexOf(FIX.literal as string)).toBeLessThan(text.indexOf('docs/src/site/pages/A.tsx'))
    expect(text).toContain(':3  gap: 12')
  })

  it('a file not in the baseline must be clean', () => {
    expect(report([finding('kit/styled-outside', 'docs/src/site/pages/New.tsx')], {}, silent().log as never)).toBe(false)
  })

  it('--update refuses to raise a count and writes a lower one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'site-design-'))
    const path = join(dir, 'baseline.json')
    const cfg = { label: 't', description: 'd', updateCommand: 'u', fixHint: [] }
    writeFileSync(path, JSON.stringify({ description: 'd', total: 1, files: { a: { 'literal/space': 1 } } }))
    expect(updatePerFile({ a: { 'literal/space': 2 } }, path, cfg)).toBe(false)
    expect(readReadableBaseline(path)?.files).toEqual({ a: { 'literal/space': 1 } })
    expect(updatePerFile({}, path, cfg)).toBe(true)
    expect(readReadableBaseline(path)?.total).toBe(0)
  })

  it('the committed baseline matches the site today (no file above it)', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as { files: Record<string, Record<string, number>> }
    const current = countFindings(scan(loadSources()))
    for (const [f, perRule] of Object.entries(current)) {
      for (const [rule, n] of Object.entries(perRule)) expect(n, `${f} ${rule}`).toBeLessThanOrEqual(baseline.files[f]?.[rule] ?? 0)
    }
  })
})

describe('site visual sweep — pure parts', () => {
  it('names shots by page, width and theme', () => {
    expect(shotName('/', 375, 'dark')).toBe('home@375-dark.png')
    expect(shotName('/docs/reference/core', 1280, 'light')).toBe('docs__reference__core@1280-light.png')
    expect(shotName('/404.html', 320, 'light')).toBe('404@320-light.png')
  })

  it('counts differing pixels and marks them', () => {
    const a = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255])
    const b = new Uint8ClampedArray([0, 0, 0, 255, 10, 11, 10, 255])
    const out = new Uint8ClampedArray(8)
    expect(countDiff(a, b, out)).toBe(1)
    expect([...out.slice(4)]).toEqual([255, 0, 255, 255])
    expect(countDiff(a, a)).toBe(0)
  })
})
