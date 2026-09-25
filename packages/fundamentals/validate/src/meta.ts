/**
 * Field metadata — attach + read.
 *
 * Standard Schema deliberately omits a metadata channel (the protocol
 * is parse-only). Pyreon needs label / hint / placeholder / i18n keys
 * so `@pyreon/form` / `@pyreon/feature` can drive form UIs and CRUD
 * tables from a single schema. `withField()` attaches a `FieldMeta`
 * object via a Symbol-keyed property; `getMeta()` reads it.
 *
 * `withField` NEVER mutates the schema it is given — it returns a new schema
 * carrying the metadata, so two `withField` calls on one shared base keep
 * their own labels. A Pyreon `s` schema is cloned (copy-on-write, like its
 * chainable methods); any other Standard Schema (Zod / Valibot / ArkType, …)
 * is wrapped in a transparent Proxy that answers ONLY the metadata slot and
 * forwards everything else — so `.parse`, `.safeParse`, `~standard`, and an
 * ArkType schema's call signature all keep working on the result.
 */

import { type FieldMeta, type StandardSchemaV1, META_SLOT, type WithFieldMeta } from './types'

/**
 * Attach Pyreon field metadata to any Standard Schema. The returned
 * schema is structurally `schema` PLUS a Symbol-keyed `FieldMeta` slot.
 * Library methods (`.parse`, `.safeParse`, `.optional`, etc.) keep working.
 * The input schema is not modified (and may be frozen).
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

  // A Pyreon `s` schema: copy-on-write clone (duck-typed so the DX-only entry
  // keeps not importing the validator runtime).
  const cloneable = schema as unknown as { _cloneWith?: () => object }
  if (typeof cloneable._cloneWith === 'function') {
    const clone = cloneable._cloneWith()
    Object.defineProperty(clone, META_SLOT, {
      value: merged,
      enumerable: false,
      configurable: true,
      writable: false,
    })
    return clone as WithFieldMeta<S>
  }

  // Any other Standard Schema: a transparent Proxy. It intercepts only the
  // metadata READ; every other access is forwarded to the original, with the
  // original as the getter receiver (so a library getter reading internal
  // state sees its real instance). A callable schema (ArkType's `Type`) stays
  // callable — a function target keeps the `apply` trap's default forwarding.
  // Why not a mutation (the old shape): a shared base labelled twice kept only
  // the LAST label, and a frozen schema threw.
  return new Proxy(schema, {
    get(target, prop) {
      return prop === META_SLOT ? merged : Reflect.get(target, prop, target)
    },
  }) as WithFieldMeta<S>
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
