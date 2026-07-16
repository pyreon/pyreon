import type { ArrayFormat, Serializer } from './types'

/** Infer a serializer pair from the type of the default value. */
export function inferSerializer<T>(
  defaultValue: T,
  arrayFormat: ArrayFormat = 'comma',
): Serializer<T> {
  if (Array.isArray(defaultValue)) {
    if (arrayFormat === 'repeat') {
      return {
        serialize: (v: T) => (v as string[]).join('\0REPEAT\0'),
        deserialize: (raw: string) => (raw === '' ? [] : raw.split('\0REPEAT\0')) as T,
      }
    }
    // comma (default)
    return {
      serialize: (v: T) => (v as string[]).join(','),
      deserialize: (raw: string) => (raw === '' ? [] : raw.split(',')) as T,
    }
  }

  switch (typeof defaultValue) {
    case 'number':
      return {
        serialize: (v: T) => String(v),
        deserialize: (raw: string) => {
          // `+raw` is the same strict ToNumber as `Number(raw)` without the
          // global-call site, and the `n === n` self-compare is the free NaN
          // check (NaN is the only value that !== itself) — together they shave
          // the two call sites off the hottest parser (measured vs nuqs).
          // Behavior identical: ''→0, whitespace/hex per ToNumber, NaN→default.
          const n = +raw
          return (n === n ? n : defaultValue) as T
        },
      }
    case 'boolean':
      return {
        serialize: (v: T) => String(v),
        deserialize: (raw: string) => (raw === 'true') as T,
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
