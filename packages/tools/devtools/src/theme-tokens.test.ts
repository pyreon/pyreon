import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The panel's colours live in ONE block of panel.css (between the
// `@tokens-start` / `@tokens-end` markers). Everything else reads tokens,
// so a theme change is one edit and light/dark cannot drift apart.
const css = readFileSync(join(import.meta.dirname, 'panel.css'), 'utf-8')
const start = css.indexOf('/* @tokens-start */')
const end = css.indexOf('/* @tokens-end */')
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi

function tokensOf(selector: string): Map<string, string> {
  const block = css.slice(start, end)
  const i = block.indexOf(selector)
  const body = block.slice(block.indexOf('{', i) + 1, block.indexOf('}', i))
  const out = new Map<string, string>()
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(m[1] as string, (m[2] as string).trim())
  return out
}

describe('panel.css theme tokens', () => {
  it('has exactly one token block', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(css.indexOf('/* @tokens-start */', start + 1)).toBe(-1)
  })

  it('uses no raw colour outside the token block', () => {
    const outside = css.slice(0, start) + css.slice(end)
    const hits = (outside.replace(/\/\*[\s\S]*?\*\//g, '').match(RAW_COLOUR) ?? []).filter(Boolean)
    expect(hits).toEqual([])
  })

  it('light and dark define the same tokens', () => {
    const dark = tokensOf("[data-theme='dark']")
    const light = tokensOf("[data-theme='light']")
    expect(dark.size).toBeGreaterThan(10)
    expect([...light.keys()].sort()).toEqual([...dark.keys()].sort())
  })

  it('every var() the stylesheet reads is defined', () => {
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))
    const missing = [...used].filter((u) => !defined.has(u))
    expect(missing).toEqual([])
  })
})
