import { describe, expect, it } from 'vitest'
import { getTheme, listThemes, registerTheme, resolveTheme } from './theme-registry'
import { dateFormatter, getLocale, numberFormatter, registerLocale } from './locale'
import { compileOption, optionToSvg } from './option'
import { defaultTheme } from './render'

const opt = { xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }, { type: 'line', data: [2, 1] }] }

describe('theme registry', () => {
  it('ships light and dark; registers, lists and resolves; unknown names warn and fall back', () => {
    expect(listThemes()).toEqual(['light', 'dark'])
    const dark = resolveTheme('dark')
    expect(dark.palette![0]).toBe('#4992ff')
    expect(dark.background).toBe('#100c2a')
    expect(dark.chartTheme.label).toBe('#b9b8ce')
    registerTheme('brand', { color: ['#111111', '#222222'], textStyle: { fontSize: 13 } })
    expect(getTheme('brand')!.color).toEqual(['#111111', '#222222'])
    expect(resolveTheme('brand').chartTheme.fontSize).toBe(13)
    expect(resolveTheme('brand').chartTheme.axis).toBe(defaultTheme.axis)
    const warnings: { code: string }[] = []
    const missing = resolveTheme('nope', warnings as never)
    expect(missing.palette).toBeNull()
    expect(warnings.map((w) => w.code)).toEqual(['option-key-unsupported'])
    expect(resolveTheme(undefined).chartTheme).toEqual(defaultTheme)
  })
  it('compileOption applies a theme: palette to series without a colour, text/axis/grid to the spec, background to the svg', () => {
    const c = compileOption(opt, { theme: 'dark' })
    expect(c.spec.series[0]!.color).toBe('#4992ff')
    expect(c.spec.series[1]!.color).toBe('#7cffb2')
    expect(c.spec.theme.label).toBe('#b9b8ce')
    expect(c.background).toBe('#100c2a')
    const explicit = compileOption({ ...opt, color: ['#abcdef'] }, { theme: 'dark' })
    expect(explicit.spec.series[0]!.color).toBe('#abcdef')
    const inline = compileOption(opt, { theme: { color: ['#0000ff'], backgroundColor: '#eeeeee' } })
    expect(inline.spec.series[0]!.color).toBe('#0000ff')
    const svg = optionToSvg(opt, { theme: 'dark', width: 300, height: 200 })
    expect(svg).toContain('#100c2a')
    expect(svg.indexOf('#100c2a')).toBeLessThan(svg.indexOf('#4992ff'))
    expect(optionToSvg(opt, { width: 300, height: 200 })).not.toContain('#100c2a')
    expect(compileOption(opt, { theme: 'nope' }).warnings.map((w) => w.code)).toEqual(['option-key-unsupported'])
  })
})

describe('locale', () => {
  it('formats numbers and dates per locale via Intl; packs override; bad tags fall back to en', () => {
    expect(numberFormatter('en')(1234.5)).toBe('1,234.5')
    expect(numberFormatter('de')(1234.5)).toBe('1.234,5')
    expect(numberFormatter('en')(NaN)).toBe('')
    expect(dateFormatter('en')(Date.UTC(2024, 2, 5))).toBe('Mar 5')
    registerLocale('x-test', { number: { minimumFractionDigits: 2 }, monthNames: ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'] })
    expect(getLocale('x-test')!.monthNames![2]).toBe('bře')
    expect(numberFormatter('x-test')(3)).toBe('3.00')
    expect(dateFormatter('x-test')(Date.UTC(2024, 2, 5))).toBe('5 bře')
    expect(numberFormatter('!!not-a-tag')(1000)).toBe('1,000')
  })
  it('compileOption applies the locale to axis labels unless the option carries its own formatter', () => {
    const c = compileOption({ ...opt, series: [{ type: 'bar', data: [1500, 2500] }] }, { locale: 'de' })
    expect(c.spec.yFormat!(1500)).toBe('1.500')
    expect(c.spec.xFormat).toBeUndefined()
    const own = compileOption({ ...opt, yAxis: { axisLabel: { formatter: '{value} kg' } }, series: [{ type: 'bar', data: [1500] }] }, { locale: 'de' })
    expect(own.spec.yFormat!(1500)).toBe('1500 kg')
    const time = compileOption({ xAxis: { type: 'time' }, yAxis: {}, series: [{ type: 'line', data: [[Date.UTC(2024, 0, 1), 1], [Date.UTC(2024, 5, 1), 2]] }] }, { locale: 'en' })
    expect(time.spec.xFormat!(Date.UTC(2024, 5, 1))).toBe('Jun 1')
  })
})
