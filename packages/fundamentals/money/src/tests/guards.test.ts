import { _currencyStats, _resetCurrencies } from '../currency'
import { MAX_DIGITS } from '../scaled'
import { abs, add, compare, convert, currencyDigits, defineCurrency, divide, equals, fromMinor, isCurrency, isMoney, isNegative, isPositive, isZero, money, multiply, negate, round, subtract, sum, toMinor, toMinorNumber, zero } from '../index'

const E = (v: string) => money(v, 'EUR')

describe('mixing currencies', () => {
  it('every two-amount operation throws and names both codes and the fix', () => {
    const usd = money('1', 'USD')

    for (const f of [add, subtract, compare]) expect(() => f(E('1'), usd)).toThrow(/\[Pyreon\] \w+: cannot combine EUR with USD.*convert\(money, "EUR", rate\)/)
    expect(() => sum([E('1'), usd])).toThrow(/cannot sum EUR with USD/)
    expect(equals(E('1'), usd)).toBe(false)
  })
})

describe('the float-input rule', () => {
  it('a number is taken by its shortest text: exact when the currency can hold it', () => {
    expect(money(9.99, 'EUR').amount).toBe('9.99')
    expect(money(0.1, 'EUR').amount).toBe('0.10')
    expect(money(19.99 * 3, 'EUR').amount).toBe('59.97')
    expect(money(1e21, 'EUR').amount).toBe('1000000000000000000000.00')
    expect(money(-0, 'EUR').amount).toBe('0.00')
    expect(money(100, 'JPY').amount).toBe('100')
  })

  it('a number or string with more decimals than the currency has throws, and says why (floating point) and how to fix it', () => {
    expect(() => money(0.1 + 0.2, 'EUR')).toThrow(/\[Pyreon\] money: 0\.30000000000000004 has more decimals than EUR has \(2\): that is floating-point noise.*rounding: "halfExpand"/)
    expect(() => money(100.5, 'JPY')).toThrow(/more decimals than JPY has \(0\)/)
    expect(() => money(1e-7, 'EUR')).toThrow(/floating-point noise/)
    expect(() => money('9.995', 'EUR')).toThrow(/"9\.995" has more decimals than EUR has \(2\), so it would lose value.*Round it deliberately/)
    expect(() => money('1.2345', 'KWD')).toThrow(/KWD has \(3\)/)
  })

  it('trailing zeros are not lost value, and rounding opts in', () => {
    expect(money('9.990', 'EUR').amount).toBe('9.99')
    expect(money('100.0', 'JPY').amount).toBe('100')
    expect(money(0.1 + 0.2, 'EUR', { rounding: 'halfExpand' }).amount).toBe('0.30')
    expect(money('9.995', 'EUR', { rounding: 'halfExpand' }).amount).toBe('10.00')
    expect(money('9.995', 'EUR', { rounding: 'halfEven' }).amount).toBe('10.00')
    expect(money('9.985', 'EUR', { rounding: 'halfEven' }).amount).toBe('9.98')
    expect(money('9.985', 'EUR', { rounding: 'floor' }).amount).toBe('9.98')
    expect(() => money('9.995', 'EUR', { rounding: 'nearest' as never })).toThrow(/a rounding mode/)
  })

  it('non-finite numbers and non-numbers throw', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, {}, [], true]) expect(() => money(bad as never, 'EUR'), String(bad)).toThrow(/\[Pyreon\] money/)
  })

  it('what looks like data but is not a decimal says how to fix it', () => {
    expect(() => money('5,50', 'EUR')).toThrow(/Use a dot as the decimal mark/)
    expect(() => money(' 5', 'EUR')).toThrow(/Remove the surrounding spaces/)
    expect(money('+5', 'EUR').amount).toBe('5.00')
    expect(money('1e3', 'EUR').amount).toBe('1000.00')
    expect(money('-0.00', 'EUR').amount).toBe('0.00')
  })
})

describe('currencies', () => {
  afterEach(() => _resetCurrencies())

  it('digits are ISO 4217 minor units; codes must be upper case and known', () => {
    expect([currencyDigits('EUR'), currencyDigits('JPY'), currencyDigits('KWD'), currencyDigits('BHD')]).toEqual([2, 0, 3, 3])
    expect(isCurrency('EUR')).toBe(true)
    expect(isCurrency('eur')).toBe(false)
    expect(isCurrency('XXXX')).toBe(false)
    expect(isCurrency(5 as never)).toBe(false)
    expect(() => money(1, 'eur')).toThrow(/use "EUR"/)
    expect(() => money(1, 'QQQ')).toThrow(/known currency code/)
    expect(zero('KWD').amount).toBe('0.000')
  })

  it('defineCurrency: custom currencies, idempotent redefinition, conflicts throw, the registry is bounded', () => {
    defineCurrency('PTS', { digits: 0 })
    defineCurrency('PTS', { digits: 0 })
    expect(money(5, 'PTS').amount).toBe('5')
    expect(isCurrency('PTS')).toBe(true)
    expect(() => defineCurrency('PTS', { digits: 1 })).toThrow(/already defined with 0 digits/)
    expect(() => defineCurrency('PTS', { digits: 1 })).toThrow(/Define each code once/)
    expect(() => defineCurrency('x', { digits: 1 })).toThrow(/2 to 12 upper-case/)
    expect(() => defineCurrency('ABC1', { digits: 99 })).toThrow(/digits to be a whole number from 0 to 30/)
    for (let i = 1; i < 64; i++) defineCurrency(`T${i}`, { digits: 2 })
    expect(_currencyStats().registered).toBe(64)
    expect(() => defineCurrency('ONEMORE', { digits: 2 })).toThrow(/at most 64 currencies/)
  })

  it('digits are the same on every engine: ISO 4217, never the platform display digits (#4803)', () => {
    // V8 (Node, Chrome) reports CLDR display digits (HUF 0, IQD 0), JavaScriptCore (Bun, Safari) ISO 4217's (HUF 2, IQD 3).
    const iso: Record<string, number> = { HUF: 2, IDR: 2, COP: 2, PKR: 2, IQD: 3, IRR: 2, ISK: 0, TWD: 2, CLP: 0, UGX: 0, JPY: 0, KWD: 3, CLF: 4, UYW: 4, EUR: 2 }

    for (const [code, digits] of Object.entries(iso)) expect(currencyDigits(code), code).toBe(digits)
    expect(fromMinor(12345, 'HUF').amount).toBe('123.45')
    expect(isMoney({ amount: '100.00', currency: 'HUF' })).toBe(true)
    expect(isMoney({ amount: '100', currency: 'HUF' })).toBe(false)
  })

  it('which codes exist is ISO 4217 list one on every engine, never the platform list', () => {
    const spy = vi.spyOn(Intl, 'supportedValuesOf')
    // V8 lists none of these; JavaScriptCore lists all, plus withdrawn codes.
    for (const code of ['VED', 'XAU', 'XAG', 'XUA', 'XTS', 'XXX', 'CHE', 'CHW', 'BOV', 'COU', 'MXV', 'USN', 'XAD', 'XCG', 'ZWG', 'SLE'])
      {expect(isCurrency(code), code).toBe(true)}
    expect(money('1.00', 'VED')).toEqual({ amount: '1.00', currency: 'VED' })
    expect(currencyDigits('XAU')).toBe(2)
    // Withdrawn codes some engines still list are not current ISO 4217 codes.
    for (const code of ['BGN', 'ANG', 'BYR', 'HRK', 'DEM', 'SLL', 'ZWL', 'CUC']) expect(isCurrency(code), code).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    defineCurrency('HRK', { digits: 2 })
    expect(money('7.53', 'HRK').amount).toBe('7.53')
  })

  it('an engine reporting other digits does not change them', () => {
    const real = Intl.NumberFormat
    const spy = vi.spyOn(Intl, 'NumberFormat').mockImplementation(((locale: string, options: Intl.NumberFormatOptions) => {
      const f = new real(locale, options)
      const resolved = f.resolvedOptions()

      return Object.assign(f, { resolvedOptions: () => ({ ...resolved, maximumFractionDigits: 7 }) })
    }) as never)

    expect([currencyDigits('HUF'), currencyDigits('JPY'), currencyDigits('KWD')]).toEqual([2, 0, 3])
    spy.mockRestore()
  })

  it('defineCurrency gives an ISO currency the digits a payment provider uses (#4803)', () => {
    defineCurrency('ISK', { digits: 2 })
    defineCurrency('ISK', { digits: 2 })
    expect(currencyDigits('ISK')).toBe(2)
    expect(fromMinor(12345, 'ISK')).toEqual({ amount: '123.45', currency: 'ISK' })
    expect(toMinor(money('123.45', 'ISK'))).toBe(12345n)
    expect(() => defineCurrency('ISK', { digits: 0 })).toThrow(/ISK is already defined with 2 digits/)
    defineCurrency('EUR', { digits: 2 })
    expect(_currencyStats().registered).toBe(2)
  })
})

describe('what a Money is', () => {
  it('isMoney is strict: exactly the two fields, a known currency, a canonical amount with exactly its digits', () => {
    expect(isMoney({ amount: '9.99', currency: 'EUR' })).toBe(true)
    expect(isMoney({ amount: '5', currency: 'JPY' })).toBe(true)
    expect(isMoney({ amount: '0.500', currency: 'KWD' })).toBe(true)
    for (const bad of [
      { amount: '9.9', currency: 'EUR' },
      { amount: '.50', currency: 'EUR' },
      { amount: '-0.00', currency: 'EUR' },
      { amount: '01.00', currency: 'EUR' },
      { amount: '5.0', currency: 'JPY' },
      { amount: '1.00', currency: 'EUR', note: 'x' },
      { amount: 9.99, currency: 'EUR' },
      { amount: '1.00', currency: 'eur' },
      { amount: '1.00' },
      null,
      [],
      'EUR 1.00',
    ]) expect(isMoney(bad), JSON.stringify(bad)).toBe(false)
  })

  it('survives JSON and structuredClone unchanged, and works frozen', () => {
    const m = E('9.99')

    expect(JSON.parse(JSON.stringify(m))).toEqual(m)
    expect(structuredClone(m)).toEqual(m)
    expect(isMoney(JSON.parse(JSON.stringify(m)))).toBe(true)
    expect(add(Object.freeze({ ...m }), Object.freeze({ ...m })).amount).toBe('19.98')
  })

  it('a non-canonical amount handed to arithmetic is named, not silently used', () => {
    expect(() => add({ amount: '1.0', currency: 'EUR' }, E('1'))).toThrow(/\[Pyreon\] add: expected an amount written with exactly 2 fraction digits for EUR, got "1\.0"/)
    expect(() => add({ amount: '-0.00', currency: 'EUR' }, E('1'))).toThrow(/\[Pyreon\] add/)
    expect(() => add({ amount: '.50', currency: 'EUR' }, E('1'))).toThrow(/\[Pyreon\] add/)
  })
})

describe('minor units', () => {
  it('fromMinor and toMinor round trip, including beyond safe integers', () => {
    expect(fromMinor(999, 'EUR').amount).toBe('9.99')
    expect(fromMinor(-5, 'EUR').amount).toBe('-0.05')
    expect(fromMinor(5, 'JPY').amount).toBe('5')
    expect(fromMinor(1234, 'KWD').amount).toBe('1.234')
    expect(fromMinor('12345678901234567890', 'EUR').amount).toBe('123456789012345678.90')
    expect(toMinor(E('9.99'))).toBe(999n)
    expect(toMinorNumber(E('9.99'))).toBe(999)
    expect(toMinorNumber(fromMinor(999999999999999n, 'EUR'))).toBe(999999999999999)
    expect(() => toMinorNumber(fromMinor(2n ** 60n, 'EUR'))).toThrow(/beyond the safe integer range.*toMinor\(\)/)
    expect(() => fromMinor(2 ** 53, 'EUR')).toThrow(/safe integer.*bigint or a string/)
    expect(() => fromMinor(1.5, 'EUR')).toThrow(/safe integer/)
    expect(() => fromMinor('12.5', 'EUR')).toThrow(/whole number/)
  })

  it('a 15-digit and a 16-digit amount add through the number and the bigint path alike', () => {
    expect(add(fromMinor(999999999999999n, 'EUR'), fromMinor(1, 'EUR')).amount).toBe('10000000000000.00')
    expect(subtract(fromMinor(1000000000000000n, 'EUR'), fromMinor(1, 'EUR')).amount).toBe('9999999999999.99')
    expect(add(fromMinor(9007199254740991n, 'EUR'), fromMinor(9007199254740991n, 'EUR')).amount).toBe('180143985094819.82')
  })
})

describe('the input size limit', () => {
  it(`${MAX_DIGITS} digits are accepted, one more throws a RangeError that says so, and an exponent cannot build a giant number`, () => {
    expect(money('9'.repeat(MAX_DIGITS), 'EUR').amount.length).toBe(MAX_DIGITS + 3)
    expect(() => money('9'.repeat(MAX_DIGITS + 1), 'EUR')).toThrow(RangeError)
    expect(() => money('9'.repeat(MAX_DIGITS + 1), 'EUR')).toThrow(/more than 4096 digits/)
    expect(() => money('1e999999999', 'EUR')).toThrow(/more than 4096 digits once its exponent is applied/)
    expect(() => money('1e9999999999', 'EUR')).toThrow(/exponent .* is too large/)
    expect(() => multiply(E('1'), '1e5000')).toThrow(RangeError)
  })
})

describe('sign helpers and zero', () => {
  it('isZero, isPositive, isNegative, abs, negate', () => {
    expect([isZero(zero('EUR')), isPositive(E('0.01')), isNegative(E('-0.01')), isNegative(zero('EUR'))]).toEqual([true, true, true, false])
    expect(abs(E('-5')).amount).toBe('5.00')
    expect(negate(E('-5')).amount).toBe('5.00')
  })
})

describe('divide, multiply, convert, round reject bad operands by name', () => {
  it('zero divisor, zero or negative rate, increments that do not divide the unit', () => {
    expect(() => divide(E('1'), 0)).toThrow(/\[Pyreon\] divide: the divisor "0" is zero/)
    expect(() => divide(E('1'), '0.00')).toThrow(/is zero/)
    expect(() => convert(E('1'), 'USD', 0)).toThrow(/rate must be greater than zero/)
    expect(() => convert(E('1'), 'USD', -1.1)).toThrow(/rate must be greater than zero/)
    expect(() => round(E('1.23'), { increment: '0.005' })).toThrow(/smaller than a EUR minor unit/)
    expect(() => round(E('1.23'), { increment: 0 })).toThrow(/greater than zero/)
    expect(() => round(E('1.23'), { digits: 1, increment: '0.1' })).toThrow(/either digits or increment/)
    expect(round(E('1.00'), { increment: '0.03' }).amount).toBe('0.99')
    expect(round(E('100.00'), { increment: 7 }).amount).toBe('98.00')
    expect(round(E('12.34'), { digits: 0 }).amount).toBe('12.00')
    expect(round(E('12.34'), { digits: 5 }).amount).toBe('12.34')
  })
})
