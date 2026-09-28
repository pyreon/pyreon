import { describe, expect, it } from 'vitest'
import { dateFormatter, getLocale, numberFormatter, registerLocale } from './locale'
import { defaultTheme } from './render'

const opt = { xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }, { type: 'line', data: [2, 1] }] }


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
})
