// ─── Dot-path field helpers ─────────────────────────────────────────────────
//
// @pyreon/form is a FLAT-keyed field model: a field name is a string, and a
// dot-path name (`address.city`, `contact.email`) declares a first-class LEAF
// field addressable exactly like a top-level one — `fields['address.city']`,
// `register('address.city')`, `useField('address.city')`, `setFieldValue`,
// per-field `validators['address.city']`, and a schema keyed by the same
// dot-path all route to it. The value model stays flat end-to-end (so `values()`
// / `onSubmit` keys stay `keyof TValues`, no type footgun, no cascade); these
// pure helpers convert between the flat form shape and the nested API shape when
// a backend wants nesting, and back the schema-error routing + collision guard.

/**
 * The nearest REGISTERED field that is a dot-ancestor of `key` — the field an
 * object-level schema error routes DOWN to. For `key = "address.city"` with a
 * field `"address"` this returns `"address"`; for a leaf field `"address.city"`
 * the exact match is checked BEFORE this (so a leaf wins its own error). Walks
 * from the longest prefix to the shortest, so the MOST specific object field
 * wins (`a.b.c` prefers field `a.b` over field `a`). Pure.
 */
export function nearestAncestorField(
  key: string,
  fieldNames: ReadonlySet<string>,
): string | undefined {
  let idx = key.lastIndexOf('.')
  while (idx > 0) {
    const prefix = key.slice(0, idx)
    if (fieldNames.has(prefix)) return prefix
    idx = key.lastIndexOf('.', idx - 1)
  }
  return undefined
}

/**
 * The first ambiguous pair `[ancestor, descendant]` where a registered field
 * name is a strict dot-ancestor of another (`"address"` object field AND an
 * `"address.city"` leaf field). Declaring both is a footgun: a schema error
 * keyed `address.city` matches BOTH (the leaf exactly, the object via ancestor
 * routing), so the message appears twice. Returns `undefined` when the field
 * set is unambiguous. Pure — used for a dev-time warning, never a throw (the
 * config is confusing, not corrupting). Order-independent (checks every name
 * against a Set of all names).
 */
export function findPathAncestorConflict(
  names: readonly string[],
): readonly [string, string] | undefined {
  const set = new Set(names)
  for (const name of names) {
    let idx = name.lastIndexOf('.')
    while (idx > 0) {
      const ancestor = name.slice(0, idx)
      if (set.has(ancestor)) return [ancestor, name]
      idx = name.lastIndexOf('.', idx - 1)
    }
  }
  return undefined
}

// A value that must be treated as a LEAF by flatten/nest — never recursed into.
// Plain objects and non-empty arrays are the ONLY containers walked; a Date /
// RegExp / File / FileList / Map / Set / class instance / null / primitive — and
// an EMPTY object or array — is a leaf (preserved verbatim so a round-trip is
// lossless).
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  if (Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function isWalkable(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  if (isPlainRecord(v)) return Object.keys(v).length > 0
  return false
}

/**
 * Flatten a nested object/array into a flat dot-path record —
 * `{ address: { city: "NYC" }, tags: ["a"] }` → `{ "address.city": "NYC",
 * "tags.0": "a" }`. The inverse of {@link nestValues}. Only plain objects and
 * non-empty arrays are walked; a `Date` / `File` / `Map` / class instance /
 * empty container is kept as a single leaf value (lossless round-trip). Pure.
 *
 * Handy for the "reset to freshly-saved server data" flow when the server
 * returns a nested payload: `form.reset(flattenValues(serverData))`.
 */
export function flattenValues(
  nested: unknown,
  prefix = '',
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  if (isWalkable(nested)) {
    const obj = nested as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      flattenValues(obj[key], prefix ? `${prefix}.${key}` : key, out)
    }
  } else {
    out[prefix] = nested
  }
  return out
}

/**
 * Rebuild a nested object/array from a flat dot-path record —
 * `{ "address.city": "NYC", "tags.0": "a" }` → `{ address: { city: "NYC" },
 * tags: ["a"] }`. The inverse of {@link flattenValues}. A numeric path segment
 * creates an array (`items.0.name` → `{ items: [{ name }] }`); everything else
 * an object. Pure.
 *
 * Handy for a nested API payload from a flat form: `onSubmit: (v) =>
 * api.save(nestValues(v))`. `form.values()` / `onSubmit` keep FLAT dot-path
 * keys (so the field-name types stay honest); reach for this only at the
 * backend boundary that wants nesting.
 */
export function nestValues(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(flat)) {
    setPath(out, key, flat[key])
  }
  return out
}

const NUMERIC_SEGMENT = /^(?:0|[1-9]\d*)$/

function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur: Record<string, unknown> = root
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    // Prototype-pollution guard. An explicit `===` comparison (NOT a `Set.has`
    // membership test) placed in the walk loop so it dominates EVERY write below
    // — the final leaf assignment AND each intermediate container creation. This
    // is the barrier form static taint analysis recognizes; `__proto__` /
    // `constructor` / `prototype` are never legitimate field names, so a path
    // containing one is rejected — the standard post-CVE `lodash.set` posture.
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
      return
    }
    // Last segment (incl. the "" empty top-level path — a flattened leaf whose
    // whole value was a scalar with no key) is the assignment target.
    if (i === parts.length - 1) {
      cur[part] = value
      return
    }
    const nextIsIndex = NUMERIC_SEGMENT.test(parts[i + 1]!)
    const existing = cur[part]
    if (existing === null || typeof existing !== 'object') {
      cur[part] = nextIsIndex ? [] : {}
    }
    cur = cur[part] as Record<string, unknown>
  }
}
