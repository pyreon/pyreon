/**
 * `@pyreon/validate` — Pyreon DX overlay on Standard Schema.
 *
 * Standard Schema (https://standardschema.dev) is the cross-library
 * protocol implemented natively by Zod 3.24+, Valibot 1.0+, ArkType
 * 2.0+, typia, and any future StdSchema-compliant validator. Pyreon
 * builds three things ON TOP of it that the spec deliberately leaves
 * out, plus the reactive + i18n bridges Pyreon's stack needs:
 *
 *   - `withField(schema, meta)` — attach label / hint / placeholder /
 *     i18n keys to ANY StdSchema schema. The wrapped schema retains
 *     every library method (`schema.parse(...)`, `schema.optional()`,
 *     etc.); Pyreon's metadata rides on a Symbol-keyed slot.
 *   - `getMeta(schema)` / `resolveMetaField(schema, field, t)` — read
 *     metadata back, optionally resolving i18n keys through a `t`
 *     function.
 *   - `parseReactive(schema, source)` / `parseReactiveAsync(...)` /
 *     `watchValid(...)` — re-validate on signal changes; result is a
 *     `Computed<ParseResult>` consumable in JSX templates / effects.
 *   - `formatError(issue, t)` / `formatErrors(issues, t)` /
 *     `formatErrorsByPath(...)` — resolve Pyreon-flavoured `Issue`s
 *     through i18n. Bare StdSchema issues (no i18n key) fall through
 *     to `message`, so the helpers work with raw Zod/Valibot/ArkType
 *     output too.
 *
 * Pyreon does NOT ship its own validator runtime. Use whichever
 * StdSchema-compliant library you prefer; `@pyreon/validate` makes it
 * Pyreon-flavoured.
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 * import { signal } from '@pyreon/reactivity'
 * import { useI18n } from '@pyreon/i18n'
 * import {
 *   withField,
 *   parseReactive,
 *   formatErrors,
 * } from '@pyreon/validate'
 *
 * // 1. Annotate the schema with field metadata.
 * const emailSchema = withField(z.string().email(), {
 *   label: 'Email',
 *   i18nLabel: 'auth.email.label',
 *   placeholder: 'you@example.com',
 * })
 *
 * // 2. Reactively parse a signal-backed input.
 * const $email = signal('')
 * const $result = parseReactive(emailSchema, $email)
 *
 * // 3. Render with i18n-aware errors.
 * const { t } = useI18n()
 * effect(() => {
 *   const r = $result()
 *   if (r.issues) renderErrors(formatErrors(r.issues, t))
 * })
 * ```
 */

// ─── v1 validator (new) ────────────────────────────────────────────────

export * from './v1'

// ─── DX layer (from PR #952 — works with Pyreon's own validator + any other StdSchema lib) ──

export { formatError, formatErrors, formatErrorsByPath } from './format'
export { getMeta, resolveMetaField, withField } from './meta'
export {
  parseReactive,
  parseReactiveAsync,
  type ParseResult,
  type ReactiveSource,
  watchValid,
} from './reactive'
export {
  type FieldMeta,
  type Input,
  type Output,
  type PyreonIssue,
  type StandardSchemaIssue,
  type StandardSchemaResult,
  type StandardSchemaV1,
  type TFn,
  type WithFieldMeta,
} from './types'
