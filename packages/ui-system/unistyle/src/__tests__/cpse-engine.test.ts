/**
 * CPSE engine — the `styles()` extractVars mode.
 * See `.claude/audits/custom-property-style-extraction-2026-06-22.md`.
 *
 * Proves the general engine: WITH an `extractVars` sink, every flat
 * `prop: value` declaration becomes a value-agnostic `prop: var(--u-<hash>)`
 * and the value lands in the sink — across `convert` (gap), `edge` (padding),
 * `simple` (color), `convert_fallback` (width) kinds, reusing all of
 * processDescriptor's resolution. WITHOUT the sink the output is unchanged
 * (the off-path is byte-identical by construction — the existing
 * `styles.test.ts` suite is the regression lock for that).
 */
import { describe, expect, it } from 'vitest'
import { cpseVarName } from '../cpse'
import styles from '../styles/styles/index'

const mockCss = (strings: TemplateStringsArray, ...vals: unknown[]): string => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

describe('styles() CPSE extractVars mode', () => {
  it('OFF (no sink) → classic value-baked CSS (unchanged)', () => {
    const out = String(styles({ theme: { gap: 36 }, css: mockCss, rootSize: 16 }))
    expect(out).toContain('gap: 2.25rem;') // 36/16, value baked into the rule
  })

  it('ON → value-agnostic rule + the value in the sink (convert: gap)', () => {
    const vars: Record<string, string> = {}
    const out = String(styles({ theme: { gap: 36 }, css: mockCss, rootSize: 16, extractVars: vars }))
    const v = cpseVarName('gap')
    expect(out).toContain(`gap:var(${v});`) // value-agnostic
    expect(out).not.toContain('2.25rem') // value NOT in the rule
    expect(vars[v]).toBe('2.25rem') // …it's in the sink
  })

  it('ON → covers edge (padding), simple (color), convert_fallback (width)', () => {
    const vars: Record<string, string> = {}
    const out = String(
      styles({
        theme: { padding: 8, color: 'red', width: 160 },
        css: mockCss,
        rootSize: 16,
        extractVars: vars,
      }),
    )
    expect(out).toContain(`padding:var(${cpseVarName('padding')});`)
    expect(out).toContain(`color:var(${cpseVarName('color')});`)
    expect(out).toContain(`width:var(${cpseVarName('width')});`)
    expect(vars[cpseVarName('padding')]).toBe('0.5rem') // 8/16
    expect(vars[cpseVarName('color')]).toBe('red') // simple passthrough
    expect(vars[cpseVarName('width')]).toBe('10rem') // 160/16
    // NO resolved values leak into the value-agnostic CSS.
    expect(out).not.toContain('0.5rem')
    expect(out).not.toContain('10rem')
    expect(out).not.toMatch(/:\s*red;/)
  })

  it('ON → breakpoint suffix gives per-breakpoint var names', () => {
    const vars: Record<string, string> = {}
    String(
      styles({ theme: { gap: 16 }, css: mockCss, rootSize: 16, extractVars: vars, breakpoint: 'sm' }),
    )
    expect(vars[cpseVarName('gap', 'sm')]).toBe('1rem')
    expect(cpseVarName('gap', 'sm')).not.toBe(cpseVarName('gap')) // distinct
  })

  it('CONSERVATIVE: already-var values are not double-wrapped (idempotent)', () => {
    const vars: Record<string, string> = {}
    const out = String(
      styles({ theme: { color: 'var(--brand)' }, css: mockCss, rootSize: 16, extractVars: vars }),
    )
    expect(out).toContain('color: var(--brand);') // left verbatim
    expect(Object.keys(vars)).toHaveLength(0) // nothing extracted
  })
})
