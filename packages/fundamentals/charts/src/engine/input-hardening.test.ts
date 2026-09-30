import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetWarnOnce, warnOnce } from './dev-warn'
import { line, resolveMarks } from './marks'
import type { Mark } from './marks'
import { safeTooltipStyle } from './tooltip-html'

afterEach(() => {
  _resetWarnOnce()
  vi.restoreAllMocks()
})

describe('resolveMarks — input boundary', () => {
  it('coerces numeric STRINGS (CSV / form data) instead of plotting gaps, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rows = [{ v: '10' }, { v: '2' }, { v: ' ' }, { v: 'x' }]
    const [s] = resolveMarks(rows, [line((d: { v: string }) => d.v as unknown as number, { label: 'Sales' })])
    expect(s!.values.slice(0, 2)).toEqual([10, 2])
    expect(Number.isNaN(s!.values[2]!)).toBe(true)
    expect(Number.isNaN(s!.values[3]!)).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\[Pyreon\] @pyreon\/charts: mark "Sales" returned the string "10"/)
  })

  it('warns on an unknown mark kind', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bogus = { ...line((d: number) => d), kind: 'donut' } as unknown as Mark<number>
    resolveMarks([1, 2], [bogus])
    expect(String(warn.mock.calls[0]![0])).toContain('unknown mark kind "donut"')
  })

  it('warnOnce stops remembering past 100 keys (bounded)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 101; i++) warnOnce(`k${i}`, 'm')
    warnOnce('k100', 'm')
    expect(warn).toHaveBeenCalledTimes(102)
  })
})

describe('safeTooltipStyle — URL-loading values', () => {
  it('rejects CSS escapes and the url-less image loaders', () => {
    expect(safeTooltipStyle('background:u\\72l(https://x.test/a.png)')).toBe('')
    expect(safeTooltipStyle('background:image-set("https://x.test/a.png" 1x)')).toBe('')
    expect(safeTooltipStyle('background:-webkit-image-set("https://x.test/a.png" 1x)')).toBe('')
    expect(safeTooltipStyle('background:src("https://x.test/a.png")')).toBe('')
    expect(safeTooltipStyle('color:red;background:#fff')).toBe('color:red;background:#fff')
  })
})

