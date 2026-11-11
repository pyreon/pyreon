import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOCS_VARS, docsLayout, renderDocsVars } from '../tokens'

const CSS = readFileSync(join(import.meta.dirname, '../../styles/docs-v3.css'), 'utf8')
const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

function lum(hex: string): number {
  const v = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = v.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
const tone = (k: string, mode: 'dark' | 'light'): string => {
  const v = DOCS_VARS[k]
  if (v === undefined) throw new Error(`no --dx-${k}`)
  return typeof v === 'string' ? v : v[mode]
}

describe('docs stylesheet ↔ tokens', () => {
  it('writes no colour of its own (theme.ts is the only place a colour lives)', () => {
    expect(code.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi)).toBeNull()
  })
  it('uses only variables the docs tokens define', () => {
    const used = new Set([...code.matchAll(/var\(--dx-([a-z0-9-]+)/g)].map((m) => m[1]))
    used.delete('role') // the callout's local role colour, set from other tokens in the same file
    expect([...used].filter((k) => !(k! in DOCS_VARS))).toEqual([])
  })
  it('breaks at the docs layout breakpoints', () => {
    expect(code).toContain(`@media (max-width: ${docsLayout.railBreak - 0.02}px)`)
    expect(code).toContain(`@media (max-width: ${docsLayout.drawerBreak - 0.02}px)`)
    expect(code).toContain(`@media (max-width: ${docsLayout.narrow}px)`)
    expect(code).toContain(`grid-template-columns: ${docsLayout.sidebar}px minmax(0, 1fr)`)
    expect(code).toContain(`grid-template-columns: minmax(0, 1fr) ${docsLayout.rail}px`)
    expect(code).toContain(`max-width: ${docsLayout.content}px`)
  })
  it('renders both themes and leaves nothing undefined', () => {
    const css = renderDocsVars()
    expect(css).toMatch(/^:root\{--dx-bg:#0A0A0E;.*\}:root\[data-theme="light"\]\{--dx-bg:#FAF5EB;/)
    expect(css).not.toContain('undefined')
  })
})

describe('docs text contrast (WCAG AA 4.5:1)', () => {
  const TEXT = ['text', 'strong', 'mist', 'fog', 'accent-text', 'link', 'warn', 'ok', 'err']
  for (const mode of ['dark', 'light'] as const) {
    for (const bg of ['bg', 'card', 'code-bg', 'raised']) {
      it(`${mode}: text tokens on ${bg}`, () => {
        for (const fg of TEXT) expect(contrast(tone(fg, mode), tone(bg, mode)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      })
    }
    it(`${mode}: syntax tokens on the code well`, () => {
      for (const k of ['s-kw', 's-str', 's-num', 's-fn', 's-type', 's-com', 's-punct', 's-fg']) {
        expect(contrast(tone(k, mode), tone('code-bg', mode)), k).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
