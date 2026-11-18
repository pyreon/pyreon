/**
 * `sheet.insert` dropped its unused second parameter (`boost`), so the layer
 * moved from the third argument to the second. A JavaScript caller still on
 * `insert(css, false, 'layer')` would silently lose the layer, and
 * `insert(css, true)` would wrap the rule in `@layer true`. The old shape is
 * detected (a boolean second argument, or a string third) and warned about
 * once per sheet in dev.
 *
 * Bisect-verified: without the `warnedStaleInsertArgs` check in `insert`,
 * the first two specs see no warning.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSheet } from '../sheet'

type LegacyInsert = (css: string, boost: boolean, layer?: string) => string

const staleWarnings = (warn: { mock: { calls: unknown[][] } }): string[] =>
  warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('removed `boost` argument'))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sheet.insert with the removed boost argument', () => {
  it('warns once per sheet for insert(css, false, layer), naming the new call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = createSheet()
    const legacy = s.insert.bind(s) as unknown as LegacyInsert
    legacy('color: red;', false, 'rocketstyle')
    legacy('color: blue;', false, 'rocketstyle')
    const msgs = staleWarnings(warn)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/^\[Pyreon\] sheet\.insert/)
    expect(msgs[0]).toContain("sheet.insert(css, 'layer')")
  })

  it('warns for a lone boolean second argument', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = createSheet()
    ;(s.insert.bind(s) as unknown as LegacyInsert)('color: green;', true)
    expect(staleWarnings(warn)).toHaveLength(1)
  })

  it('does not warn for the current signature', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = createSheet()
    s.insert('color: red;')
    s.insert('color: red;', 'rocketstyle')
    s.insert('color: red;', 'rocketstyle', false)
    s.insert('color: red;', undefined, false)
    expect(staleWarnings(warn)).toEqual([])
  })
})
