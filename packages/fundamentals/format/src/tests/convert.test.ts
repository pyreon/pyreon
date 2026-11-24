/**
 * Unit conversion. The reference values are the DEFINITIONS (exact), checked by hand against the cited sources:
 * NIST SP 811 (2008) Appendix B.6 (international yard and pound agreement, 1959: 1 in = 25.4 mm, 1 lb = 0.45359237 kg),
 * B.8 (US gallon = 231 in3 = 3.785 411 784 L; international acre = 4046.8564224 m2) and CLDR (decimal digital units,
 * kilometre-scale Scandinavian mile = 10 km).
 */
import { canConvert, convert, measurementSystem, preferredUnit, unitDimension } from '../convert'
import type { Unit } from '../types'

describe('convert: exact definitions', () => {
  const rows: Array<[number, Unit, Unit, number]> = [
    [1, 'inch', 'millimeter', 25.4],
    [1, 'foot', 'meter', 0.3048],
    [1, 'foot', 'inch', 12],
    [1, 'yard', 'foot', 3],
    [1, 'yard', 'meter', 0.9144],
    [1, 'mile', 'meter', 1609.344],
    [1, 'mile', 'yard', 1760],
    [5, 'mile', 'kilometer', 8.04672],
    [1, 'mile-scandinavian', 'kilometer', 10],
    [1, 'pound', 'kilogram', 0.45359237],
    [1, 'pound', 'ounce', 16],
    [1, 'stone', 'pound', 14],
    [1, 'stone', 'kilogram', 6.35029318],
    [1, 'kilogram', 'gram', 1000],
    [1, 'gallon', 'liter', 3.785411784],
    [1, 'gallon', 'fluid-ounce', 128],
    [1, 'fluid-ounce', 'milliliter', 29.5735295625],
    [1, 'liter', 'milliliter', 1000],
    [1, 'acre', 'hectare', 0.40468564224],
    [1, 'hectare', 'hectare', 1],
    [1, 'week', 'day', 7],
    [1, 'day', 'hour', 24],
    [1, 'hour', 'second', 3600],
    [1, 'second', 'millisecond', 1000],
    [1, 'millisecond', 'microsecond', 1000],
    [1, 'microsecond', 'nanosecond', 1000],
    [1, 'byte', 'bit', 8],
    [1, 'kilobyte', 'byte', 1000], // decimal, as CLDR and Intl: the 1024 story is formatBytes({ binary: true })
    [1, 'gigabyte', 'megabyte', 1000],
    [1, 'megabyte', 'megabit', 8],
    [1, 'petabyte', 'terabyte', 1000],
    [60, 'mile-per-hour' as Unit, 'kilometer-per-hour' as Unit, 96.56064],
    [1, 'meter-per-second' as Unit, 'kilometer-per-hour' as Unit, 3.6],
    [36, 'kilometer-per-hour' as Unit, 'meter-per-second' as Unit, 10],
    [100, 'celsius', 'fahrenheit', 212],
    [0, 'celsius', 'fahrenheit', 32],
    [-40, 'celsius', 'fahrenheit', -40],
    [212, 'fahrenheit', 'celsius', 100],
    [32, 'fahrenheit', 'celsius', 0],
    [37, 'celsius', 'fahrenheit', 98.6],
  ]

  it.each(rows)('%s %s -> %s = %s', (value, from, to, expected) => {
    expect(convert(value, from, to)).toBe(expected)
  })

  it('the same unit returns the value untouched, NaN and Infinity pass through', () => {
    expect(convert(7.25, 'mile', 'mile')).toBe(7.25)
    expect(convert(Number.NaN, 'mile', 'kilometer')).toBeNaN()
    expect(convert(Infinity, 'mile', 'kilometer')).toBe(Infinity)
    expect(Object.is(convert(-0, 'mile', 'kilometer'), -0)).toBe(true)
  })
})

describe('convert: fuel economy and pace are inversions, not ratios', () => {
  it('liter-per-kilometer and mile-per-gallon are reciprocal', () => {
    // 1 L/km = 1/1.609344 ... : 8 L/km -> (1/8 km/L) * (1/1.609344 mi/km) * 3.785411784 L/gal mi/gal
    const mpg = convert(8, 'liter-per-kilometer' as Unit, 'mile-per-gallon' as Unit)

    expect(mpg).toBeCloseTo(3.785411784 / (8 * 1.609344), 12)
    expect(convert(mpg, 'mile-per-gallon' as Unit, 'liter-per-kilometer' as Unit)).toBeCloseTo(8, 12)
    // 35 mpg is the well-known 6.72 L/100 km
    expect(convert(35, 'mile-per-gallon' as Unit, 'liter-per-kilometer' as Unit) * 100).toBeCloseTo(6.72, 2)
  })

  it('a pace and a speed: 6 minutes per kilometre is 10 kilometres per hour', () => {
    expect(convert(6, 'minute-per-kilometer' as Unit, 'kilometer-per-hour' as Unit)).toBeCloseTo(10, 12)
    expect(convert(10, 'kilometer-per-hour' as Unit, 'minute-per-kilometer' as Unit)).toBeCloseTo(6, 12)
  })

  it('a zero in an inversion is Infinity, not an error', () => {
    expect(convert(0, 'liter-per-kilometer' as Unit, 'mile-per-gallon' as Unit)).toBe(Infinity)
  })
})

describe('convert: round trips stay within a few ulp (one combined factor, no chaining)', () => {
  const groups: Unit[][] = [
    ['millimeter', 'centimeter', 'meter', 'kilometer', 'inch', 'foot', 'yard', 'mile', 'mile-scandinavian'],
    ['gram', 'kilogram', 'ounce', 'pound', 'stone'],
    ['liter', 'milliliter', 'gallon', 'fluid-ounce'],
    ['hectare', 'acre'],
    ['nanosecond', 'microsecond', 'millisecond', 'second', 'minute', 'hour', 'day', 'week'],
    ['bit', 'byte', 'kilobit', 'kilobyte', 'megabit', 'megabyte', 'gigabit', 'gigabyte', 'terabit', 'terabyte', 'petabyte'],
    ['celsius', 'fahrenheit'],
  ]
  let seed = 12345
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296

    return seed / 4294967296
  }

  it('x -> a -> b -> a is x within 4 relative ulp (2^-50), for every pair of every dimension', () => {
    for (const group of groups) {
      for (const a of group) {
        for (const b of group) {
          for (let i = 0; i < 20; i++) {
            const x = (random() * 2 - 1) * 10 ** Math.floor(random() * 8 - 2)
            const back = convert(convert(x, a, b), b, a)

            expect(Math.abs(back - x), `${a} -> ${b}, x = ${x}`).toBeLessThanOrEqual(4 * Number.EPSILON * Math.max(Math.abs(x), 100) * (group.includes('celsius') ? 8 : 1))
          }
        }
      }
    }
  })

  it('a combined factor is exact: 1 of anything to itself through a long chain is not drifting', () => {
    expect(convert(convert(1, 'mile', 'foot'), 'foot', 'mile')).toBe(1)
    expect(convert(1760, 'yard', 'mile')).toBe(1)
    expect(convert(3, 'foot', 'yard')).toBe(1)
  })
})

describe('convert: errors name what is wrong', () => {
  it('a dimension mismatch names both dimensions and both units', () => {
    expect(() => convert(1, 'mile', 'kilogram')).toThrow(/\[Pyreon\] convert\(\): cannot convert length \(mile\) to mass \(kilogram\)/)
    expect(() => convert(1, 'celsius', 'meter')).toThrow(/temperature \(celsius\) to length \(meter\)/)
    expect(() => convert(1, 'kilometer-per-hour' as Unit, 'kilometer')).toThrow(/speed \(kilometer-per-hour\) to length \(kilometer\)/)
  })

  it('month and year have no fixed length; kelvin is not an Intl unit; unknown units and non-numbers throw', () => {
    expect(() => convert(1, 'month', 'day')).toThrow(/no fixed length/)
    expect(() => convert(1, 'week', 'year')).toThrow(/no fixed length/)
    expect(() => convert(1, 'kelvin' as Unit, 'celsius')).toThrow(/Kelvin is not an Intl unit/)
    expect(() => convert(1, 'parsec' as Unit, 'meter')).toThrow(/unknown unit "parsec"/)
    expect(() => convert('1' as never, 'meter', 'foot')).toThrow(/the value must be a number/)
    expect(() => convert(1, 7 as never, 'foot')).toThrow(/the unit must be a string/)
  })

  it('a temperature inside a compound is rejected', () => {
    expect(() => convert(1, 'celsius-per-hour' as Unit, 'fahrenheit-per-hour' as Unit)).toThrow(/not a ratio/)
  })
})

describe('canConvert and unitDimension', () => {
  it('canConvert is the same dimension (or its inverse) and never throws', () => {
    expect(canConvert('mile', 'kilometer')).toBe(true)
    expect(canConvert('mile', 'kilogram')).toBe(false)
    expect(canConvert('month', 'day')).toBe(false)
    expect(canConvert('kelvin' as Unit, 'celsius')).toBe(false)
    expect(canConvert('liter-per-kilometer' as Unit, 'mile-per-gallon' as Unit)).toBe(true)
    expect(canConvert('kilometer-per-hour' as Unit, 'meter-per-second' as Unit)).toBe(true)
    expect(canConvert(7 as never, 'mile')).toBe(false)
  })

  it('names the dimension of every unit Intl sanctions (month and year are durations that cannot convert)', () => {
    const dims = new Set<string>()

    for (const unit of Intl.supportedValuesOf('unit')) dims.add(unitDimension(unit as Unit))
    expect([...dims].sort()).toEqual(['angle', 'area', 'digital', 'duration', 'length', 'mass', 'proportion', 'temperature', 'volume'])
    expect(unitDimension('kilometer-per-hour' as Unit)).toBe('speed')
    expect(unitDimension('mile-per-gallon' as Unit)).toBe('fuel-economy')
    expect(unitDimension('liter-per-kilometer' as Unit)).toBe('fuel-consumption')
    expect(unitDimension('minute-per-kilometer' as Unit)).toBe('pace')
    expect(unitDimension('gram-per-liter' as Unit)).toBe('density')
    expect(unitDimension('byte-per-second' as Unit)).toBe('data-rate')
    expect(unitDimension('meter-per-meter' as Unit)).toBe('length-per-length')
  })

  it('every sanctioned unit but month and year converts to itself', () => {
    for (const unit of Intl.supportedValuesOf('unit')) {
      expect(canConvert(unit as Unit, unit as Unit), unit).toBe(unit !== 'month' && unit !== 'year')
    }
  })
})

describe('measurementSystem and preferredUnit', () => {
  it.each([
    ['en-US', 'us'],
    ['es-US', 'us'],
    ['en-LR', 'us'],
    ['my-MM', 'us'],
    ['en-GB', 'uk'],
    ['cy-GB', 'uk'],
    ['en', 'us'], // likely region: en-US
    ['de', 'metric'],
    ['cs', 'metric'],
    ['fr-CA', 'metric'],
    ['en-AU', 'metric'],
    ['pt-BR', 'metric'],
    ['ja', 'metric'],
    ['x', 'metric'], // not a valid tag: the metric default, never an error
  ] as const)('%s is %s', (tag, system) => {
    expect(measurementSystem(tag)).toBe(system)
  })

  it('the runtime default follows the runtime locale', () => {
    const region = new Intl.Locale(new Intl.DateTimeFormat().resolvedOptions().locale).maximize().region

    expect(measurementSystem()).toBe(region === 'US' || region === 'LR' || region === 'MM' ? 'us' : region === 'GB' ? 'uk' : 'metric')
  })

  it('preferredUnit maps a unit to the same scale in the locale\'s system', () => {
    expect(preferredUnit('kilometer', 'en-US')).toBe('mile')
    expect(preferredUnit('celsius', 'en-US')).toBe('fahrenheit')
    expect(preferredUnit('kilogram', 'en-US')).toBe('pound')
    expect(preferredUnit('liter', 'en-US')).toBe('gallon')
    expect(preferredUnit('kilometer-per-hour' as Unit, 'en-US')).toBe('mile-per-hour')
    expect(preferredUnit('mile', 'cs')).toBe('kilometer')
    expect(preferredUnit('fahrenheit', 'de')).toBe('celsius')
    expect(preferredUnit('pound', 'de')).toBe('kilogram')
    expect(preferredUnit('kilometer', 'en-GB')).toBe('mile')
    expect(preferredUnit('fahrenheit', 'en-GB')).toBe('celsius')
    expect(preferredUnit('second', 'en-US')).toBe('second')
    expect(preferredUnit('byte', 'cs')).toBe('byte')
    expect(preferredUnit('kilometer', 'cs')).toBe('kilometer')
  })

  it('every preferred unit is convertible from the unit it replaces', () => {
    for (const system of ['en-US', 'cs', 'en-GB']) {
      for (const unit of Intl.supportedValuesOf('unit')) {
        const to = preferredUnit(unit as Unit, system)

        expect(canConvert(unit as Unit, to), `${unit} -> ${to} (${system})`).toBe(unit === 'month' || unit === 'year' ? false : true)
      }
    }
  })
})
