/**
 * `@pyreon/http/json` — a LOSSLESS JSON codec for 64-bit integers.
 *
 * `JSON.parse` turns every number into an IEEE-754 double, so an integer past
 * `Number.MAX_SAFE_INTEGER` (2^53 - 1) is ROUNDED before any code — a schema, a
 * reviver's `value` argument — ever sees it: `9007199254740993` arrives as
 * `9007199254740992`. For an OpenAPI `format: int64` id that is not a
 * cosmetic loss; it is a different record.
 *
 * {@link losslessJson} decodes such an integer as a `bigint` instead, and
 * encodes a `bigint` back as JSON NUMBER text (`JSON.stringify` throws on one).
 * Every other value is exactly what `JSON.parse` / `JSON.stringify` produce:
 * a safe integer stays a `number`, a fraction or an exponent form (`1e21`)
 * stays a `number` — the server wrote a double, and a double is what arrives.
 *
 * ```ts
 * import { createHttp } from '@pyreon/http'
 * import { losslessJson } from '@pyreon/http/json'
 *
 * const api = createHttp({ baseUrl: '/api', json: losslessJson })
 * const order = await api.get('/orders/1').json<{ id: bigint | number }>()
 * ```
 *
 * ## How precision is recovered, portably
 *
 * The exact digits are only available from the SOURCE TEXT. Three layers, the
 * cheapest that is correct wins:
 *
 * 1. **No run of 16+ digits anywhere** (the overwhelmingly common body): no
 *    unsafe integer can be present — 2^53 has 16 digits — so plain
 *    `JSON.parse`, at native speed.
 * 2. **The reviver's `context.source`** (TC39 "JSON.parse source text access";
 *    V8 ≥ 11.4, JSC as shipped in current Safari/Bun, SpiderMonkey ≥ 135):
 *    still the native parser, with a reviver that re-reads an unsafe
 *    integer's own digits.
 * 3. **An own parser** where (2) is not implemented (Node 20, older engines,
 *    Hermes). It follows `JSON.parse`'s grammar and error class exactly, so a
 *    body that `JSON.parse` rejects is rejected here too.
 *
 * Encoding prefers `JSON.rawJSON` (same proposal); without it a `bigint` is
 * written through a verified placeholder — see {@link stringifyJsonLossless}.
 */

import type { JsonCodec } from './types'

export type { JsonCodec }

/** An integer literal as JSON spells it: optional minus, no leading zero. */
const INTEGER_TEXT = /^-?(?:0|[1-9]\d*)$/

/** A run long enough to hold an unsafe integer. */
const LONG_DIGIT_RUN = /\d{16}/

type SourceReviver = (key: string, value: unknown, context?: { source?: string }) => unknown

let sourceTextSupport: boolean | undefined

/** Whether this engine passes `context.source` to a `JSON.parse` reviver. */
function hasSourceText(): boolean {
  if (sourceTextSupport === undefined) {
    let seen: string | undefined
    const probe: SourceReviver = (_key, value, context) => {
      seen = context?.source
      return value
    }
    ;(JSON.parse as (text: string, reviver: SourceReviver) => unknown)('1', probe)
    sourceTextSupport = seen === '1'
  }
  return sourceTextSupport
}

/**
 * Test hook: force the parser layer. `undefined` restores detection.
 * @internal
 */
export function _setSourceTextSupport(value: boolean | undefined): void {
  sourceTextSupport = value
}

/** The number a token denotes: a `bigint` when a double cannot hold it exactly. */
function numberFromText(text: string, parsed: number): number | bigint {
  return !Number.isSafeInteger(parsed) && INTEGER_TEXT.test(text) ? BigInt(text) : parsed
}

const reviveUnsafeIntegers: SourceReviver = (_key, value, context) =>
  typeof value === 'number' && !Number.isSafeInteger(value) && context?.source !== undefined
    ? numberFromText(context.source, value)
    : value

/**
 * Parse JSON, decoding an integer past 2^53 - 1 as a `bigint`.
 *
 * Throws the same `SyntaxError` class `JSON.parse` does for malformed input.
 */
export function parseJsonLossless(text: string): unknown {
  if (!LONG_DIGIT_RUN.test(text)) return JSON.parse(text)
  if (hasSourceText()) {
    return (JSON.parse as (text: string, reviver: SourceReviver) => unknown)(text, reviveUnsafeIntegers)
  }
  return new Parser(text).document()
}

/**
 * A strict JSON parser — the layer-3 fallback.
 *
 * Grammar per RFC 8259, matching `JSON.parse` on every point a caller can
 * observe: insignificant whitespace is exactly space / tab / LF / CR,
 * duplicate keys keep the LAST value, a `"__proto__"` key becomes an OWN
 * property (never the prototype — `JSON.parse` uses CreateDataProperty, and a
 * plain assignment here would be prototype pollution), and every rejection is
 * a `SyntaxError`.
 */
class Parser {
  private i = 0

  constructor(private readonly s: string) {}

  document(): unknown {
    this.ws()
    const value = this.value()
    this.ws()
    if (this.i !== this.s.length) this.fail('Unexpected non-whitespace character after JSON')
    return value
  }

  private fail(message: string): never {
    throw new SyntaxError(`${message} at position ${this.i}`)
  }

  private ws(): void {
    const s = this.s
    while (this.i < s.length) {
      const c = s.charCodeAt(this.i)
      if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return
      this.i++
    }
  }

  private value(): unknown {
    const c = this.s[this.i]
    switch (c) {
      case '{':
        return this.object()
      case '[':
        return this.array()
      case '"':
        return this.string()
      case 't':
        return this.word('true', true)
      case 'f':
        return this.word('false', false)
      case 'n':
        return this.word('null', null)
      default:
        if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.number()
        return this.fail(c === undefined ? 'Unexpected end of JSON input' : `Unexpected token '${c}'`)
    }
  }

  private word<T>(text: string, value: T): T {
    if (this.s.startsWith(text, this.i)) {
      this.i += text.length
      return value
    }
    return this.fail(`Unexpected token '${this.s[this.i]}'`)
  }

  private object(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    this.i++ // {
    this.ws()
    if (this.s[this.i] === '}') {
      this.i++
      return out
    }
    for (;;) {
      if (this.s[this.i] !== '"') this.fail('Expected a string key')
      const key = this.string()
      this.ws()
      if (this.s[this.i] !== ':') this.fail("Expected ':' after a key")
      this.i++
      this.ws()
      const value = this.value()
      if (key === '__proto__') {
        Object.defineProperty(out, key, { value, writable: true, enumerable: true, configurable: true })
      } else {
        out[key] = value
      }
      this.ws()
      const c = this.s[this.i]
      if (c === ',') {
        this.i++
        this.ws()
        continue
      }
      if (c === '}') {
        this.i++
        return out
      }
      return this.fail("Expected ',' or '}'")
    }
  }

  private array(): unknown[] {
    const out: unknown[] = []
    this.i++ // [
    this.ws()
    if (this.s[this.i] === ']') {
      this.i++
      return out
    }
    for (;;) {
      out.push(this.value())
      this.ws()
      const c = this.s[this.i]
      if (c === ',') {
        this.i++
        this.ws()
        continue
      }
      if (c === ']') {
        this.i++
        return out
      }
      return this.fail("Expected ',' or ']'")
    }
  }

  private string(): string {
    const s = this.s
    const start = ++this.i // opening quote
    // Fast path: no escapes before the closing quote.
    for (let j = start; j < s.length; j++) {
      const c = s.charCodeAt(j)
      if (c === 0x22) {
        this.i = j + 1
        return s.slice(start, j)
      }
      if (c === 0x5c || c < 0x20) break
    }
    let out = ''
    for (;;) {
      if (this.i >= s.length) this.fail('Unterminated string in JSON')
      const c = s.charCodeAt(this.i)
      if (c === 0x22) {
        this.i++
        return out
      }
      if (c < 0x20) this.fail('Bad control character in string literal')
      if (c !== 0x5c) {
        out += s[this.i]
        this.i++
        continue
      }
      const e = s[this.i + 1]
      this.i += 2
      switch (e) {
        case '"':
          out += '"'
          break
        case '\\':
          out += '\\'
          break
        case '/':
          out += '/'
          break
        case 'b':
          out += '\b'
          break
        case 'f':
          out += '\f'
          break
        case 'n':
          out += '\n'
          break
        case 'r':
          out += '\r'
          break
        case 't':
          out += '\t'
          break
        case 'u': {
          const hex = s.slice(this.i, this.i + 4)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Bad Unicode escape in JSON')
          out += String.fromCharCode(Number.parseInt(hex, 16))
          this.i += 4
          break
        }
        default:
          this.i -= 1
          this.fail('Bad escaped character in JSON')
      }
    }
  }

  private number(): number | bigint {
    const s = this.s
    const start = this.i
    if (s[this.i] === '-') this.i++
    if (s[this.i] === '0') {
      this.i++
    } else if (s[this.i] !== undefined && (s[this.i] as string) >= '1' && (s[this.i] as string) <= '9') {
      while (this.isDigit()) this.i++
    } else {
      this.fail('No number after minus sign in JSON')
    }
    if (s[this.i] === '.') {
      this.i++
      if (!this.isDigit()) this.fail('Unterminated fractional number in JSON')
      while (this.isDigit()) this.i++
    }
    if (s[this.i] === 'e' || s[this.i] === 'E') {
      this.i++
      if (s[this.i] === '+' || s[this.i] === '-') this.i++
      if (!this.isDigit()) this.fail('Exponent part is missing a number in JSON')
      while (this.isDigit()) this.i++
    }
    const text = s.slice(start, this.i)
    return numberFromText(text, Number(text))
  }

  private isDigit(): boolean {
    const c = this.s.charCodeAt(this.i)
    return c >= 0x30 && c <= 0x39
  }
}

type RawJson = (text: string) => unknown

/** `JSON.rawJSON`, read per call so a test can exercise the fallback. */
function rawJsonOf(): RawJson | undefined {
  return (JSON as unknown as { rawJSON?: RawJson }).rawJSON
}

/**
 * `JSON.stringify`, but a `bigint` is written as JSON NUMBER text
 * (`9007199254740993`, not `"9007199254740993"` and not a thrown TypeError).
 *
 * Output is byte-identical to `JSON.stringify` for any value holding no
 * `bigint` — `toJSON`, key order, `undefined` / function dropping all apply.
 *
 * Without `JSON.rawJSON`, each `bigint` is replaced by a placeholder string
 * carrying a random nonce, and the placeholders are then swapped for the
 * digits. The swap is VERIFIED rather than trusted: if the output holds more
 * placeholders than bigints were written (a user string that happens to equal
 * one), it retries with a fresh nonce — so a collision costs a retry, never a
 * corrupted body.
 */
export function stringifyJsonLossless(value: unknown): string {
  const raw = rawJsonOf()
  if (raw !== undefined) {
    return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? raw(v.toString()) : v))
  }
  for (;;) {
    const nonce = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}:`
    let written = 0
    const out = JSON.stringify(value, (_key, v: unknown) => {
      if (typeof v !== 'bigint') return v
      written++
      return `${nonce}${v.toString()}`
    })
    if (written === 0) return out
    const pattern = new RegExp(`"${nonce}(-?\\d+)"`, 'g')
    let swapped = 0
    const result = out.replace(pattern, (_m, digits: string) => {
      swapped++
      return digits
    })
    if (swapped === written && !result.includes(nonce)) return result
  }
}

/**
 * The lossless codec — pass as `createHttp({ json: losslessJson })`.
 *
 * Responses (and error bodies) decode unsafe integers as `bigint`; request
 * `json` bodies encode a `bigint` as a JSON number.
 */
export const losslessJson: JsonCodec = {
  parse: parseJsonLossless,
  stringify: stringifyJsonLossless,
}
