import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { formatUnit as coreFormatUnit } from '../core'
import { _resetLocaleState, setLocale } from '../locale'
import * as units from '../units'
import * as unitsCore from '../units/core'

afterEach(() => _resetLocaleState())

const one = { maximumFractionDigits: 1 }

describe('formatUnit with a conversion (pure entry)', () => {
  it('convertTo converts, then formats with the target unit', () => {
    expect(unitsCore.formatUnit(5, 'mile', { convertTo: 'kilometer', locale: 'en-US', maximumFractionDigits: 2 })).toBe('8.05 km')
    expect(unitsCore.formatUnit(100, 'celsius', { convertTo: 'fahrenheit', locale: 'en-US' })).toBe('212°F')
    expect(unitsCore.formatUnit(1, 'gallon', { convertTo: 'liter', locale: 'en-US', unitDisplay: 'long', maximumFractionDigits: 2 })).toBe('3.79 liters')
  })

  it('system: auto shows the locale\'s own unit; a fixed system ignores the locale', () => {
    expect(unitsCore.formatUnit(100, 'kilometer', { system: 'auto', locale: 'en-US', ...one })).toBe('62.1 mi')
    expect(unitsCore.formatUnit(100, 'mile', { system: 'auto', locale: 'cs', ...one })).toMatch(/^160[,.]9 km$/)
    expect(unitsCore.formatUnit(100, 'kilometer', { system: 'us', locale: 'cs', ...one })).toMatch(/^62[,.]1 mi$/)
    expect(unitsCore.formatUnit(100, 'mile', { system: 'metric', locale: 'en-US', ...one })).toBe('160.9 km')
    expect(unitsCore.formatUnit(100, 'kilometer', { system: 'uk', locale: 'en-US', ...one })).toBe('62.1 mi')
    expect(unitsCore.formatUnit(30, 'celsius', { system: 'auto', locale: 'en-US' })).toBe('86°F')
  })

  it('convertTo wins over system; with neither it is formatUnit of /core', () => {
    expect(unitsCore.formatUnit(1, 'kilometer', { convertTo: 'meter', system: 'us', locale: 'en-US' })).toBe('1,000 m')
    expect(unitsCore.formatUnit(5, 'kilometer', { locale: 'en-US' })).toBe(coreFormatUnit(5, 'kilometer', { locale: 'en-US' }))
    expect(unitsCore.formatUnit(5, 'kilometer', 'long')).toBe(coreFormatUnit(5, 'kilometer', 'long'))
  })

  it('a unit with no counterpart is formatted as it is; nullish and invalid values give the fallback', () => {
    expect(unitsCore.formatUnit(5, 'second', { system: 'us', locale: 'en-US' })).toBe(coreFormatUnit(5, 'second', { locale: 'en-US' }))
    expect(unitsCore.formatUnit(null, 'mile', { convertTo: 'kilometer', fallback: '-' })).toBe('-')
    expect(unitsCore.formatUnit(Number.NaN, 'mile', { convertTo: 'kilometer', fallback: '?' })).toBe('?')
    expect(unitsCore.formatUnit(10n, 'mile', { convertTo: 'kilometer', locale: 'en-US', ...one })).toBe('16.1 km')
  })

  it('a mismatched convertTo is a [Pyreon] error, never a wrong number', () => {
    expect(() => unitsCore.formatUnit(5, 'mile', { convertTo: 'kilogram' })).toThrow(/cannot convert length \(mile\) to mass \(kilogram\)/)
  })

  it('the conversion options stay out of the Intl options (no leak into the cache key)', () => {
    const a = unitsCore.formatUnit(5, 'mile', { convertTo: 'kilometer', locale: 'en-US' })
    const b = unitsCore.formatUnit(5, 'mile', { convertTo: 'kilometer', system: 'us', locale: 'en-US' })

    expect(a).toBe(b)
  })
})

describe('unitFormatter with a conversion', () => {
  it('formats, derives with with(), adapts with from(), and has parts and range', () => {
    const distance = unitsCore.unitFormatter('kilometer', { locale: 'en-US', system: 'us', ...one })

    expect(distance(100)).toBe('62.1 mi')
    expect(distance.from((m: number) => m / 1000)(100000)).toBe('62.1 mi')
    expect(distance.with({ unitDisplay: 'long' })(100)).toBe('62.1 miles')
    expect(distance.parts?.(100).map((p) => p.type)).toEqual(['integer', 'decimal', 'fraction', 'literal', 'unit'])
    expect(distance.range?.(10, 20)).toBe('6.2–12.4 mi')
    expect(distance(null)).toBe('')
  })

  it('a fixed convertTo is one formatter for every locale', () => {
    const f = unitsCore.unitFormatter('mile', { convertTo: 'kilometer', ...one })

    expect(f(1)).toBe(new Intl.NumberFormat(undefined, { style: 'unit', unit: 'kilometer', unitDisplay: 'short', maximumFractionDigits: 1, signDisplay: 'negative' }).format(1.609344))
  })
})

describe('the reactive entry follows the active locale', () => {
  it('system: auto and measurementSystem() read the ambient locale, and a binding updates on setLocale', () => {
    const root = document.createElement('div')
    const distance = units.unitFormatter('kilometer', { system: 'auto', ...one })
    const Label = () => h('span', null, () => distance(100))
    const Raw = () => h('i', null, () => units.formatUnit(100, 'kilometer', { system: 'auto', ...one }))
    const unmount = mount(h('div', null, h(Label, null), h(Raw, null)) as never, root)

    setLocale('en-US')
    expect(root.textContent).toBe('62.1 mi62.1 mi')
    expect(units.measurementSystem()).toBe('us')
    expect(units.preferredUnit('celsius')).toBe('fahrenheit')
    setLocale('cs')
    expect(root.textContent).toMatch(/^100 km100 km$/)
    expect(units.measurementSystem()).toBe('metric')
    expect(units.preferredUnit('celsius')).toBe('celsius')
    setLocale('en-GB')
    expect(root.textContent).toBe('62.1 mi62.1 mi')
    expect(units.measurementSystem()).toBe('uk')
    unmount()
  })

  it('an explicit locale wins and does not subscribe', () => {
    setLocale('cs')
    expect(units.formatUnit(100, 'kilometer', { system: 'auto', locale: 'en-US', ...one })).toBe('62.1 mi')
    expect(units.measurementSystem('en-US')).toBe('us')
  })

  it('the reactive entry re-exports the pure conversion functions unchanged', () => {
    expect(units.convert).toBe(unitsCore.convert)
    expect(units.canConvert).toBe(unitsCore.canConvert)
    expect(units.unitDimension).toBe(unitsCore.unitDimension)
  })
})
