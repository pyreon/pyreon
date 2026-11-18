import { badRange, badValue, show } from './errors'

/** An ISO 4217 code (`"EUR"`) or a code registered with `defineCurrency`. */
export type CurrencyCode = string

/** The most currencies `defineCurrency` registers, and the most digit counts `currencyDigits` remembers. */
const LIMIT = 64
const registry = new Map<string, number>()
const platform = new Map<string, number>()
let iso: Set<string> | null | undefined

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

/** The fraction digits `Intl` uses for an ISO code, remembered for `LIMIT` codes (the oldest is dropped first). */
function platformDigits(code: string): number | undefined {
  const hit = platform.get(code)

  if (hit !== undefined) return hit
  if (!wellFormed(code)) return undefined
  const known = isoCodes()

  if (known !== null && !known.has(code)) return undefined
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2

  if (platform.size >= LIMIT) platform.delete(platform.keys().next().value as string)
  platform.set(code, digits)

  return digits
}

/** The digits of a code for a calling function: a registered code, else the platform's, else a `[Pyreon]` error. */
export function digitsOf(fn: string, code: unknown): number {
  const digits = typeof code === 'string' ? (registry.get(code) ?? platformDigits(code)) : undefined

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
 * The number of minor-unit digits of a currency, from the platform (`Intl`; no currency table is shipped) or from
 * `defineCurrency`: 2 for EUR, 0 for JPY, 3 for KWD.
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
  return typeof code === 'string' && (registry.has(code) || platformDigits(code) !== undefined)
}

/**
 * Register a currency the platform does not know (crypto, loyalty points, a test currency): `defineCurrency('PTS', { digits: 0 })`.
 * The code is 2 to 12 upper-case letters or digits starting with a letter. Registering the same code again with the same
 * digits is fine; with different digits it throws, as does changing an ISO currency's digits. The registry holds at most
 * 64 currencies.
 *
 * @example defineCurrency('PTS', { digits: 0 }); currencyDigits('PTS') // => 0
 */
export function defineCurrency(code: string, spec: { digits: number }): void {
  const ok = typeof code === 'string' && code.length >= 2 && code.length <= 12 && code.charCodeAt(0) - 65 >>> 0 < 26 && /^[A-Z][A-Z0-9]*$/.test(code)

  if (!ok) return badValue('defineCurrency', 'a code of 2 to 12 upper-case letters or digits starting with a letter', code, 'Example: defineCurrency("PTS", { digits: 0 }).')
  const digits = spec?.digits

  if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0 || digits > 30) return badValue('defineCurrency', 'spec.digits to be a whole number from 0 to 30', digits)
  const existing = registry.get(code) ?? platformDigits(code)

  if (existing !== undefined && existing !== digits) {
    return badRange('defineCurrency', `${code} is already defined with ${existing} digits and cannot be redefined with ${digits}. Pick another code for a different currency.`)
  }
  if (registry.has(code)) return
  if (registry.size >= LIMIT) return badRange('defineCurrency', `at most ${LIMIT} currencies can be registered, got ${show(code)} as number ${LIMIT + 1}. This is a registry for a few custom currencies, not a table.`)
  registry.set(code, digits)
}

/** Test hook: how many currencies are registered, and how many platform digit counts are remembered. */
export function _currencyStats(): { registered: number; remembered: number } {
  return { registered: registry.size, remembered: platform.size }
}

/** Test hook: forget every registered currency and remembered digit count. */
export function _resetCurrencies(): void {
  registry.clear()
  platform.clear()
  iso = undefined
}
