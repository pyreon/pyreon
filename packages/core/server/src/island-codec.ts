/**
 * Island prop codec — roundtrip-preserving JSON encoder + decoder.
 *
 * SSR encodes each island's props into a `data-props` JSON attribute that
 * the client reads + spreads into the hydrated component. The naive
 * `JSON.stringify` path silently loses fidelity:
 *
 *   - `Date` → ISO string (client sees `string`, not `Date`)
 *   - `Map` / `Set` → `{}` (lost entirely)
 *   - `RegExp` → `{}` (lost entirely)
 *   - `BigInt` → throws → falls back to empty props
 *   - Custom class instances → `{}` (lost entirely, silently)
 *
 * This codec preserves the JSON-native shape EXACTLY (so existing apps
 * keep round-tripping their primitives/objects/arrays byte-identically),
 * but for the non-JSON-native types above it embeds a small tag object:
 *
 *   ```
 *   { __pyreon_t: 'd', v: '<iso-string>' }   // Date
 *   { __pyreon_t: 'm', v: [[k, v], ...] }    // Map (entries)
 *   { __pyreon_t: 's', v: [v1, v2, ...] }    // Set (values)
 *   { __pyreon_t: 'r', v: { source, flags }} // RegExp
 *   { __pyreon_t: 'B', v: '<bigint-string>'} // BigInt
 *   { __pyreon_t: 'e', v: {...} }            // escape: wrap an object
 *                                            // that LITERALLY has a
 *                                            // `__pyreon_t` own-key
 *   ```
 *
 * The decoder reverses the encoding and unwraps the escape. Tags it
 * doesn't recognise pass through verbatim (forward-compatible — older
 * clients won't crash on newer-marker types).
 *
 * **Fails loud (was: silently lost):** instances of custom classes
 * (anything whose prototype is not `Object.prototype` and isn't in the
 * tagged-type set above) throw `IslandPropEncodeError` with the prop key
 * + class name + island name. The server caller catches and either dev-
 * logs or empty-falls-back as a unit — same contract as before for the
 * fallback case, but the error now NAMES the offender instead of hiding.
 *
 * **Functions, symbols, `undefined`**: still dropped silently — that's
 * the documented "not portable across a JSON wire" contract.
 */

export class IslandPropEncodeError extends Error {
  constructor(
    message: string,
    public readonly propPath: string,
    public readonly islandName: string,
  ) {
    super(message)
    this.name = 'IslandPropEncodeError'
  }
}

const TAG = '__pyreon_t'
const VALUE = 'v'
const MAX_DEPTH = 100

type Encoded = unknown // a JSON-safe value

/**
 * Encode a value to a JSON-safe shape preserving Date / Map / Set /
 * RegExp / BigInt. Drops `undefined` / function / symbol values in
 * objects (mirrors `JSON.stringify` behaviour on those). Throws
 * `IslandPropEncodeError` for class instances, naming the prop path
 * + class.
 */
export function encodeIslandProps(value: unknown, islandName: string): Encoded {
  const seen = new WeakSet<object>()
  return walk(value, seen, '$', islandName, 0)
}

function walk(
  value: unknown,
  seen: WeakSet<object>,
  path: string,
  islandName: string,
  depth: number,
): Encoded {
  if (depth > MAX_DEPTH) {
    throw new IslandPropEncodeError(
      `Maximum prop nesting depth (${MAX_DEPTH}) exceeded at "${path}". This is almost always a structural issue with the data shape.`,
      path,
      islandName,
    )
  }

  if (value === null) return null
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (t === 'bigint') return { [TAG]: 'B', [VALUE]: String(value as bigint) }
  // function / symbol / undefined → null (matches JSON.stringify on
  // arrays). Containing objects skip these as own keys BEFORE recursing,
  // so this branch is only reached for Map/Set values + as a defensive
  // fallback if a caller hands in a non-portable root.
  if (t === 'function' || t === 'symbol' || t === 'undefined') return null

  // Objects from here on.
  const obj = value as object
  if (seen.has(obj)) {
    throw new IslandPropEncodeError(`Circular reference at "${path}".`, path, islandName)
  }
  seen.add(obj)

  if (obj instanceof Date) {
    return { [TAG]: 'd', [VALUE]: obj.toISOString() }
  }
  if (obj instanceof RegExp) {
    return { [TAG]: 'r', [VALUE]: { source: obj.source, flags: obj.flags } }
  }
  if (obj instanceof Map) {
    const entries: Array<[Encoded, Encoded]> = []
    let i = 0
    for (const [k, v] of obj) {
      entries.push([
        walk(k, seen, `${path}.<map-key:${i}>`, islandName, depth + 1),
        walk(v, seen, `${path}.<map-value:${i}>`, islandName, depth + 1),
      ])
      i++
    }
    return { [TAG]: 'm', [VALUE]: entries }
  }
  if (obj instanceof Set) {
    const arr: Encoded[] = []
    let i = 0
    for (const v of obj) {
      arr.push(walk(v, seen, `${path}.<set:${i}>`, islandName, depth + 1))
      i++
    }
    return { [TAG]: 's', [VALUE]: arr }
  }
  if (Array.isArray(obj)) {
    const arr: Encoded[] = []
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i]
      // Match JSON.stringify on arrays: function/symbol/undefined → null.
      if (typeof item === 'function' || typeof item === 'symbol' || item === undefined) {
        arr.push(null)
        continue
      }
      arr.push(walk(item, seen, `${path}[${i}]`, islandName, depth + 1))
    }
    return arr
  }

  // Plain object check — anything with a prototype other than
  // `Object.prototype` (and not one of the tagged classes above) is a
  // custom class instance. Fail loud naming the constructor.
  const proto = Object.getPrototypeOf(obj)
  if (proto !== null && proto !== Object.prototype) {
    const ctor = (obj as { constructor?: { name?: string } }).constructor?.name
    throw new IslandPropEncodeError(
      `Cannot encode instance of class \`${ctor ?? '<anonymous>'}\` at "${path}". Class instances lose their prototype across the JSON wire; pass an ID + restore on the client, or convert to a plain object on the caller side.`,
      path,
      islandName,
    )
  }

  // Plain object. Walk own enumerable string-keyed props, skipping the
  // same not-portable types `JSON.stringify` skips.
  const result: Record<string, Encoded> = {}
  let hasOwnTag = false
  for (const [key, val] of Object.entries(obj)) {
    if (key === TAG) hasOwnTag = true
    if (typeof val === 'function' || typeof val === 'symbol' || val === undefined) {
      // Silently dropped — JSON.stringify does the same.
      continue
    }
    result[key] = walk(val, seen, `${path}.${key}`, islandName, depth + 1)
  }

  // If the user's plain object literally has `__pyreon_t` as an own key,
  // wrap it in the `'e'` (escape) marker so the decoder doesn't mistake
  // it for a tagged value. The escape wrapping is the only way to
  // round-trip such an object.
  if (hasOwnTag) {
    return { [TAG]: 'e', [VALUE]: result }
  }
  return result
}

/**
 * Decode a JSON-parsed value emitted by `encodeIslandProps`. Tags it
 * doesn't recognise pass through verbatim — forward-compatible: an
 * older `client.ts` will see a future-encoded type as a plain object
 * rather than crashing.
 */
export function decodeIslandProps(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(decodeIslandProps)

  const obj = value as Record<string, unknown>
  const tag = obj[TAG]
  if (typeof tag === 'string') {
    const v = obj[VALUE]
    switch (tag) {
      case 'd':
        return typeof v === 'string' ? new Date(v) : value
      case 'B':
        return typeof v === 'string' ? BigInt(v) : value
      case 'r':
        if (v && typeof v === 'object') {
          const r = v as { source?: unknown; flags?: unknown }
          if (typeof r.source === 'string' && typeof r.flags === 'string') {
            try {
              return new RegExp(r.source, r.flags)
            } catch {
              return value // bogus regex source → leave verbatim
            }
          }
        }
        return value
      case 'm':
        if (Array.isArray(v)) {
          const m = new Map()
          for (const entry of v) {
            if (Array.isArray(entry) && entry.length === 2) {
              m.set(decodeIslandProps(entry[0]), decodeIslandProps(entry[1]))
            }
          }
          return m
        }
        return value
      case 's':
        if (Array.isArray(v)) {
          const s = new Set()
          for (const item of v) s.add(decodeIslandProps(item))
          return s
        }
        return value
      case 'e':
        // Escape — the wrapped value is itself a plain object that
        // happens to have `__pyreon_t` as one of its keys. Decode
        // recursively (in case nested values are themselves tagged).
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const out: Record<string, unknown> = {}
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            out[k] = decodeIslandProps(val)
          }
          return out
        }
        return value
      default:
        // Unknown tag — leave verbatim. Forward-compatible.
        return value
    }
  }

  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(obj)) {
    out[k] = decodeIslandProps(val)
  }
  return out
}
