import { badRange, badValue, show } from './errors'

/** An ISO 4217 code (`"EUR"`) or a code registered with `defineCurrency`. */
export type CurrencyCode = string

/** The most currencies `defineCurrency` registers. */
const LIMIT = 64
const registry = new Map<string, number>()
let iso: Set<string> | null | undefined

/**
 * The ISO 4217 minor units of every code whose minor unit is not 2 (ISO 4217 list one; the funds and metals with no
 * minor unit count as 2, as `Intl` does). Shipped because the platforms disagree: V8 (Node, Chrome) reports the CLDR
 * display digits (0 for HUF, IDR, COP, PKR, IQD, ...), JavaScriptCore (Bun, Safari) the ISO 4217 ones, so a Money
 * made on one engine would not be canonical on the other.
 */
const ISO_MINOR: Readonly<Record<string, number>> = {
  BHD: 3, BIF: 0, BYR: 0, CLF: 4, CLP: 0, DJF: 0, GNF: 0, IQD: 3, ISK: 0, JOD: 3, JPY: 0, KMF: 0, KRW: 0, KWD: 3,
  LYD: 3, OMR: 3, PYG: 0, RWF: 0, TND: 3, UGX: 0, UYI: 0, UYW: 4, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
}

function isoCodes(): Set<string> | null {
  if (iso === undefined) {
    const list = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('currency')

    iso = list === undefined ? null : new Set(list)
  }

  return iso
}

function wellFormed(code: string): boolean {
  return code.length === 3 && code.charCodeAt(0) - 65 >>> 0 < 26 && code.charCodeAt(1) - 65 >>> 0 < 26 && code.charCodeAt(2) - 65 >>> 0 < 26
}

/** The ISO 4217 minor units of a code the platform knows (or one in the table), else `undefined`. Same on every engine. */
function isoDigits(code: string): number | undefined {
  if (!wellFormed(code)) return undefined
  const table = Object.hasOwn(ISO_MINOR, code) ? ISO_MINOR[code] : undefined

  if (table !== undefined) return table
  const known = isoCodes()

  return known === null || known.has(code) ? 2 : undefined
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
 * (2 for EUR and HUF, 0 for JPY, 3 for KWD). The same on every engine: `Intl` is asked only whether a code exists,
 * never for its digits, because V8 and JavaScriptCore disagree on about twenty currencies.
 *
 * @example currencyDigits('EUR') // => 2
 * @example currencyDigits('JPY') // => 0
 * @example currencyDigits('KWD') // => 3
 */
export function currencyDigits(code: CurrencyCode): number {
  return digitsOf('currencyDigits', code)
}

/**
 * Whether `code` is a known currency: an upper-case ISO 4217 code the platform knows, or one registered with
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
 * Register a currency the platform does not know (crypto, loyalty points, a test currency): `defineCurrency('PTS', { digits: 0 })`,
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

/** Test hook: forget every registered currency and the platform's code list. */
export function _resetCurrencies(): void {
  registry.clear()
  iso = undefined
}
