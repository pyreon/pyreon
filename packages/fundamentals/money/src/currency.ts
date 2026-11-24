import { badRange, badValue, show } from './errors'

/** An ISO 4217 code (`"EUR"`) or a code registered with `defineCurrency`. */
export type CurrencyCode = string

/** The most currencies `defineCurrency` registers. */
const LIMIT = 64
const registry = new Map<string, number>()
let iso: Set<string> | undefined

/**
 * ISO 4217 list one (the current codes), as published by the maintenance agency (SIX) on 2026-09-17: 178 codes,
 * three letters each, packed. Shipped because the platforms disagree on which codes exist (`Intl.supportedValuesOf`
 * lists 162 in V8, 307 including withdrawn ones in JavaScriptCore), and a Money must be valid on every engine.
 * Update it, and the table below, when ISO 4217 is amended.
 */
const ISO_CODES =
  'AEDAFNALLAMDAOAARSAUDAWGAZNBAMBBDBDTBHDBIFBMDBNDBOBBOVBRLBSDBTNBWPBYNBZDCADCDFCHECHFCHWCLFCLPCNYCOPCOUCRC' +
  'CUPCVECZKDJFDKKDOPDZDEGPERNETBEURFJDFKPGBPGELGHSGIPGMDGNFGTQGYDHKDHNLHTGHUFIDRILSINRIQDIRRISKJMDJODJPYKES' +
  'KGSKHRKMFKPWKRWKWDKYDKZTLAKLBPLKRLRDLSLLYDMADMDLMGAMKDMMKMNTMOPMRUMURMVRMWKMXNMXVMYRMZNNADNGNNIONOKNPRNZD' +
  'OMRPABPENPGKPHPPKRPLNPYGQARRONRSDRUBRWFSARSBDSCRSDGSEKSGDSHPSLESOSSRDSSPSTNSVCSYPSZLTHBTJSTMTTNDTOPTRYTTD' +
  'TWDTZSUAHUGXUSDUSNUYIUYUUYWUZSVEDVESVNDVUVWSTXADXAFXAGXAUXBAXBBXBCXBDXCDXCGXDRXOFXPDXPFXPTXSUXTSXUAXXXYER' +
  'ZARZMWZWG'

/**
 * The minor units of the ISO 4217 codes whose minor unit is not 2 (same list, same date). The codes ISO lists with no
 * minor unit ("N.A.": gold, silver, the SDR, the test and no-currency codes) count as 2, as `Intl` counts them.
 * Not asked of `Intl`: V8 (Node, Chrome) reports CLDR display digits (0 for HUF, IDR, COP, IQD, ...), JavaScriptCore
 * (Bun, Safari) the ISO ones, so a Money made on one engine would not be canonical on the other.
 */
const ISO_MINOR: Readonly<Record<string, number>> = {
  BHD: 3, BIF: 0, CLF: 4, CLP: 0, DJF: 0, GNF: 0, IQD: 3, ISK: 0, JOD: 3, JPY: 0, KMF: 0, KRW: 0, KWD: 3, LYD: 3,
  OMR: 3, PYG: 0, RWF: 0, TND: 3, UGX: 0, UYI: 0, UYW: 4, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
}

function isoCodes(): Set<string> {
  if (iso === undefined) {
    iso = new Set()
    for (let i = 0; i < ISO_CODES.length; i += 3) iso.add(ISO_CODES.slice(i, i + 3))
  }

  return iso
}

function wellFormed(code: string): boolean {
  return code.length === 3 && code.charCodeAt(0) - 65 >>> 0 < 26 && code.charCodeAt(1) - 65 >>> 0 < 26 && code.charCodeAt(2) - 65 >>> 0 < 26
}

/** The ISO 4217 minor units of a current ISO code, else `undefined`. Same on every engine: `Intl` is never asked. */
function isoDigits(code: string): number | undefined {
  if (!wellFormed(code) || !isoCodes().has(code)) return undefined

  return Object.hasOwn(ISO_MINOR, code) ? ISO_MINOR[code] : 2
}

/** The digits of a code for a calling function: a registered code, else its ISO 4217 minor unit, else a `[Pyreon]` error. */
export function digitsOf(fn: string, code: unknown): number {
  const digits = typeof code === 'string' ? (registry.get(code) ?? isoDigits(code)) : undefined

  return digits ?? unknownCurrency(fn, code)
}

function unknownCurrency(fn: string, code: unknown): never {
  const lower = typeof code === 'string' && wellFormed(code.toUpperCase()) && code !== code.toUpperCase()
  const fix = lower
    ? `Currency codes are upper case: use ${JSON.stringify((code as string).toUpperCase())}.`
    : 'Use an ISO 4217 code such as "EUR", or register your own with defineCurrency("PTS", { digits: 0 }).'

  return badValue(fn, 'a known currency code', code, fix)
}

/**
 * The number of minor-unit digits of a currency: the one `defineCurrency` gave it, else its ISO 4217 minor unit
 * (2 for EUR and HUF, 0 for JPY, 3 for KWD). The same on every engine: the ISO 4217 list is shipped (178 codes),
 * because V8 and JavaScriptCore disagree on which codes exist and on the digits of about twenty.
 *
 * @example currencyDigits('EUR') // => 2
 * @example currencyDigits('JPY') // => 0
 * @example currencyDigits('KWD') // => 3
 */
export function currencyDigits(code: CurrencyCode): number {
  return digitsOf('currencyDigits', code)
}

/**
 * Whether `code` is a known currency: a current upper-case ISO 4217 code (list one, shipped), or one registered with
 * `defineCurrency`. Never throws.
 *
 * @example isCurrency('EUR') // => true
 * @example isCurrency('eur') // => false
 * @example isCurrency('XXXX') // => false
 */
export function isCurrency(code: string): boolean {
  return typeof code === 'string' && (registry.has(code) || isoDigits(code) !== undefined)
}

/**
 * Register a currency ISO 4217 does not list (crypto, loyalty points, a withdrawn code such as `HRK` for old records): `defineCurrency('PTS', { digits: 0 })`,
 * or give an ISO currency the digits your payment provider uses instead of ISO 4217's (`defineCurrency('ISK', { digits: 2 })`
 * when the provider sends ISK in hundredths). The code is 2 to 12 upper-case letters or digits starting with a letter.
 * A code is defined once: defining it again with the same digits is fine, with different digits it throws. Define it at
 * startup, before any Money of that currency exists (an amount made with the old digits is no longer canonical). The
 * registry holds at most 64 currencies.
 *
 * @example defineCurrency('PTS', { digits: 0 }); currencyDigits('PTS') // => 0
 * @example defineCurrency('ISK', { digits: 2 }); fromMinor(12345, 'ISK') // => { amount: '123.45', currency: 'ISK' }
 */
export function defineCurrency(code: string, spec: { digits: number }): void {
  const ok = typeof code === 'string' && code.length >= 2 && code.length <= 12 && code.charCodeAt(0) - 65 >>> 0 < 26 && /^[A-Z][A-Z0-9]*$/.test(code)

  if (!ok) return badValue('defineCurrency', 'a code of 2 to 12 upper-case letters or digits starting with a letter', code, 'Example: defineCurrency("PTS", { digits: 0 }).')
  const digits = spec?.digits

  if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0 || digits > 30) return badValue('defineCurrency', 'spec.digits to be a whole number from 0 to 30', digits)
  const existing = registry.get(code)

  if (existing !== undefined) {
    if (existing === digits) return

    return badRange('defineCurrency', `${code} is already defined with ${existing} digits and cannot be redefined with ${digits}. Define each code once, at startup.`)
  }
  if (registry.size >= LIMIT) return badRange('defineCurrency', `at most ${LIMIT} currencies can be registered, got ${show(code)} as number ${LIMIT + 1}. This is a registry for a few custom currencies, not a table.`)
  registry.set(code, digits)
}

/** Test hook: how many currencies are registered. */
export function _currencyStats(): { registered: number } {
  return { registered: registry.size }
}

/** Test hook: forget every registered currency and the unpacked ISO code set. */
export function _resetCurrencies(): void {
  registry.clear()
  iso = undefined
}
