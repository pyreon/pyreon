import type { ArrayFormat, Serializer } from './types'

/**
 * Returned by an element codec's `deserialize` for a value that does not parse
 * as the element type. A URL is untrusted input, so one bad element makes the
 * whole array fall back to the default rather than smuggling a wrong-typed
 * value (a string in a `number[]`) into app state.
 */
export const INVALID: unique symbol = Symbol('url-state.invalid')

/** Codec for ONE array element, inferred from a sample element. */
export interface ElementCodec {
  serialize: (value: unknown) => string
  deserialize: (raw: string) => unknown
}

/**
 * Infer the element codec from an array default's FIRST element. An empty
 * default carries no element type, so elements stay strings (the historical
 * behaviour) — give the default one element, or a custom codec, to type them.
 */
export function inferElementCodec(defaultValue: unknown): ElementCodec {
  const sample = Array.isArray(defaultValue) ? defaultValue[0] : undefined
  switch (typeof sample) {
    case 'number':
      return {
        serialize: (v) => String(v),
        deserialize: (raw) => {
          if (raw.trim() === '') return INVALID
          const n = +raw
          return n === n ? n : INVALID
        },
      }
    case 'boolean':
      return {
        serialize: (v) => String(v),
        deserialize: (raw) => parseBoolean(raw) ?? INVALID,
      }
    default:
      return { serialize: (v) => String(v), deserialize: (raw) => raw }
  }
}

/** `true`/`1` → true, `false`/`0` → false, anything else → undefined. */
function parseBoolean(raw: string): boolean | undefined {
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return undefined
}

// Comma format: an element that itself contains `,` must not split into two.
// `%` is escaped first so the escape is reversible; decoding only touches the
// two sequences we produce, so a pre-existing `?tags=50%` still reads `50%`.
function escapeElement(s: string): string {
  return s.includes('%') || s.includes(',') ? s.replace(/%/g, '%25').replace(/,/g, '%2C') : s
}
function unescapeElement(s: string): string {
  return s.includes('%') ? s.replace(/%2C/gi, ',').replace(/%25/g, '%') : s
}

/** Infer a serializer pair from the type of the default value. */
export function inferSerializer<T>(
  defaultValue: T,
  arrayFormat: ArrayFormat = 'comma',
): Serializer<T> {
  if (Array.isArray(defaultValue)) {
    const el = inferElementCodec(defaultValue)
    const parseAll = (parts: string[]): T => {
      const out: unknown[] = []
      for (const part of parts) {
        const v = el.deserialize(part)
        if (v === INVALID) return defaultValue
        out.push(v)
      }
      return out as T
    }
    if (arrayFormat === 'repeat') {
      // Only used as a whole-value codec for equality snapshots; the URL write
      // itself is per element (`?t=a&t=b`), see use-url-state.
      return {
        serialize: (v: T) => (v as unknown[]).map(el.serialize).join('\0REPEAT\0'),
        deserialize: (raw: string) => (raw === '' ? ([] as T) : parseAll(raw.split('\0REPEAT\0'))),
      }
    }
    // comma (default)
    return {
      serialize: (v: T) => (v as unknown[]).map((e) => escapeElement(el.serialize(e))).join(','),
      deserialize: (raw: string) =>
        raw === '' ? ([] as T) : parseAll(raw.split(',').map(unescapeElement)),
    }
  }

  switch (typeof defaultValue) {
    case 'number':
      return {
        serialize: (v: T) => String(v),
        deserialize: (raw: string) => {
          // An EMPTY param (`?page=`) is absent, not zero: `+''` is 0, which
          // silently turned a cleared input into page 0. Fall back instead.
          if (raw.trim() === '') return defaultValue
          // `+raw` is the same strict ToNumber as `Number(raw)` without the
          // global-call site, and the `n === n` self-compare is the free NaN
          // check (NaN is the only value that !== itself) — together they shave
          // the two call sites off the hottest parser (measured vs nuqs).
          const n = +raw
          return (n === n ? n : defaultValue) as T
        },
      }
    case 'boolean':
      return {
        serialize: (v: T) => String(v),
        // `true`/`1` and `false`/`0`; anything else is invalid → the default.
        // (Only the exact `'true'` used to be true, so `?flag=1` read `false`.)
        deserialize: (raw: string) => (parseBoolean(raw) ?? defaultValue) as T,
      }
    case 'string':
      return {
        serialize: (v: T) => v as string,
        deserialize: (raw: string) => raw as T,
      }
    case 'object':
      return {
        serialize: (v: T) => JSON.stringify(v),
        deserialize: (raw: string) => JSON.parse(raw) as T,
      }
    default:
      return {
        serialize: (v: T) => String(v),
        deserialize: (raw: string) => raw as T,
      }
  }
}
