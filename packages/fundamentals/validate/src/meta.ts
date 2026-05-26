/**
 * Field metadata — attach + read.
 *
 * Standard Schema deliberately omits a metadata channel (the protocol
 * is parse-only). Pyreon needs label / hint / placeholder / i18n keys
 * so `@pyreon/form` / `@pyreon/feature` can drive form UIs and CRUD
 * tables from a single schema. `withField()` attaches a `FieldMeta`
 * object via a Symbol-keyed property; `getMeta()` reads it.
 *
 * The wrapper is a shallow `Object.create` clone — the returned schema
 * keeps every method / property of the original (so `Zod.parse`,
 * `Valibot.pipe`, ArkType template-literal forms all still work
 * end-to-end on the wrapped schema). Only the new Symbol slot is added.
 */

import { type FieldMeta, type StandardSchemaV1, META_SLOT, type WithFieldMeta } from './types'

/**
 * Attach Pyreon field metadata to any Standard Schema. The returned
 * schema is structurally `schema` PLUS a Symbol-keyed `FieldMeta` slot.
 * Library methods (`.parse`, `.safeParse`, `.optional`, etc.) are
 * preserved by reference — no proxying, no boxing.
 *
 * Re-wrapping a previously-wrapped schema MERGES the new metadata with
 * the existing (later wins on key collision). This is the natural
 * semantics for builders like `withField(emailSchema, { autoFocus: true })`
 * where the email schema already carries `{ label, i18nLabel }`.
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 * import { withField } from '@pyreon/validate'
 *
 * const emailSchema = withField(z.string().email(), {
 *   label: 'Email',
 *   placeholder: 'you@example.com',
 *   i18nLabel: 'auth.email.label',
 * })
 *
 * emailSchema.parse('foo@bar.com')      // ← Zod method still works
 * emailSchema['~standard'].validate(x)  // ← Standard Schema still works
 * getMeta(emailSchema)                  // → { label, placeholder, i18nLabel }
 * ```
 */
export function withField<S extends StandardSchemaV1<unknown, unknown>>(
  schema: S,
  meta: FieldMeta,
): WithFieldMeta<S> {
  const existing = getMeta(schema)
  const merged: FieldMeta = existing ? { ...existing, ...meta } : meta

  // Attach the metadata via a Symbol-keyed non-enumerable property on
  // the original schema. We mutate in place rather than clone because:
  //
  //   1. **Callable schemas can't be naively cloned.** ArkType's `Type`
  //      instances are functions whose `~standard.validate` does
  //      `this(input)` — `this` must be the callable schema itself.
  //      An `Object.create(proto)` clone is not callable and breaks
  //      ArkType. A Proxy would work but adds prototype-chain
  //      subtleties (`instanceof` checks, hidden ownership).
  //
  //   2. **Symbol-keyed non-enumerable mutation is invisible** to JSON
  //      serialization (`JSON.stringify` skips symbol keys), `for…in`
  //      enumeration, `Object.keys`, structured clone, library-internal
  //      schema comparators. The slot is functionally hidden.
  //
  //   3. **Re-wrapping is the natural extension** — `withField(base,
  //      { a: 1 })` then `withField(base, { b: 2 })` should produce a
  //      schema with both `a` and `b`. With mutate-in-place that's
  //      automatic; with cloning we'd need merge logic and two
  //      separate schema references would confuse consumers.
  //
  // The mutation is idempotent — repeated calls overwrite the slot
  // with the merged metadata. `configurable: true` so a future call
  // can replace it.
  Object.defineProperty(schema, META_SLOT, {
    value: merged,
    enumerable: false,
    configurable: true,
    writable: false,
  })
  return schema as WithFieldMeta<S>
}

/**
 * Read the Pyreon field metadata attached via `withField()`. Returns
 * `undefined` for schemas that haven't been wrapped — consumers should
 * be defensive (`getMeta(schema)?.label ?? nameToLabel(field)`).
 *
 * Reading is cheap (a single Symbol-keyed property access). Safe to
 * call on every render.
 */
export function getMeta<S extends StandardSchemaV1<unknown, unknown>>(
  schema: S,
): FieldMeta | undefined {
  // Defensive: accept objects AND functions. ArkType's `Type` instances
  // are callable functions (`typeof === 'function'`); rejecting them as
  // "not an object" was the original bug. Reject only null / primitives.
  if (schema === null || (typeof schema !== 'object' && typeof schema !== 'function')) {
    return undefined
  }
  return (schema as { [META_SLOT]?: FieldMeta })[META_SLOT]
}

/**
 * Resolve a metadata field through optional i18n. If the metadata has
 * an `i18n<Capitalised>` key AND a `t` function is provided AND `t`
 * returns a non-empty resolved string (i.e. didn't just echo the key
 * back), the resolved string wins. Otherwise falls back to the literal.
 *
 * Recommended over `getMeta(schema)?.label` directly when you have
 * access to a `t` from `useI18n()` — keeps the conditional in one place.
 *
 * @example
 * ```ts
 * const label = resolveMetaField(schema, 'label', t)
 * // Pulls schema's `i18nLabel` via t() if present and resolved; else `label`.
 * ```
 */
export function resolveMetaField<S extends StandardSchemaV1<unknown, unknown>>(
  schema: S,
  field: 'label' | 'hint' | 'placeholder',
  t?: (key: string, params?: Record<string, unknown>) => string,
): string | undefined {
  const meta = getMeta(schema)
  if (!meta) return undefined
  const i18nKey =
    field === 'label'
      ? meta.i18nLabel
      : field === 'hint'
        ? meta.i18nHint
        : meta.i18nPlaceholder
  if (t && i18nKey) {
    const resolved = t(i18nKey)
    // If t() echoed the key back (no match), fall through to literal.
    if (resolved && resolved !== i18nKey) return resolved
  }
  return meta[field]
}
