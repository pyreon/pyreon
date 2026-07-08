/**
 * Public types for `@pyreon/validate`. Layered on Standard Schema
 * (https://standardschema.dev) — the cross-library protocol implemented
 * natively by Zod 3.24+, Valibot 1.0+, ArkType 2.0+, and any future
 * StdSchema-compliant validator.
 *
 * This package is INTENTIONALLY tiny: it adds three things on top of
 * Standard Schema that the spec deliberately leaves out, plus reactive
 * + i18n bridges Pyreon's stack needs:
 *
 *   1. Field metadata (label, hint, placeholder, i18n keys) attached via
 *      `withField()` — the metadata channel StdSchema doesn't include.
 *   2. Reactive parse — `parseReactive(schema, signal)` returns a
 *      `Computed<ParseResult>` that re-derives on signal changes.
 *   3. i18n-aware error formatting — issues carry optional `{ key,
 *      params, fallback }` and `formatErrors(issues, t)` resolves them.
 */

// The Standard Schema contract (`StandardSchemaV1` / `StandardSchemaResult` /
// `StandardSchemaIssue`) is owned by @pyreon/validation — the SINGLE canonical
// source of truth for the whole @pyreon stack. @pyreon/validate imports and
// re-exports it (preserving this package's public API) instead of re-declaring
// its own copy, so the two can never drift. `import type` binds them for local
// use by `PyreonIssue` / `Output` / `WithFieldMeta` below; `export type`
// re-exports them.
import type {
  StandardSchemaIssue,
  StandardSchemaResult,
  StandardSchemaV1,
} from '@pyreon/validation'
export type { StandardSchemaIssue, StandardSchemaResult, StandardSchemaV1 }

/**
 * Pyreon-flavoured issue. Extends `StandardSchemaIssue` with optional
 * i18n routing. Validators that don't know about Pyreon (i.e. raw Zod /
 * Valibot / ArkType) produce bare `StandardSchemaIssue` — Pyreon's
 * format helpers handle both shapes.
 */
export interface PyreonIssue extends StandardSchemaIssue {
  /**
   * Machine-readable issue code (`'wrong_type'` / `'invalid_enum'` /
   * `'custom'` / …). Set by `makeIssue` / `makeCheckIssue` on every
   * Pyreon-emitted issue; lets consumers branch on the failure kind without
   * parsing `message`.
   */
  readonly code?: string
  /** Translation key for the message — resolved by `formatErrors(issues, t)`. */
  readonly key?: string
  /** Interpolation params for the i18n key (e.g. `{ min: 2 }`). */
  readonly params?: Readonly<Record<string, unknown>>
  /** Fallback string used when no `t` is provided or the key misses. */
  readonly fallback?: string
}

/**
 * Field metadata attached to a schema via `withField()`. Every field is
 * optional — consumers (`@pyreon/form` `useField()`, `@pyreon/feature`
 * `defineFeature()`) read whichever fields they need.
 *
 * The i18n companions (`i18nLabel`, `i18nHint`, `i18nPlaceholder`) take
 * precedence over the literal strings when a `t` function is present —
 * consumers call `t(meta.i18nLabel)` and fall back to `meta.label`.
 */
export interface FieldMeta {
  /** Human-readable label (e.g. for `<label>` elements). */
  readonly label?: string
  /** Short helper text under the input. */
  readonly hint?: string
  /** Input placeholder. */
  readonly placeholder?: string
  /** Initial value used by `useForm` when the user provides none. */
  readonly defaultValue?: unknown
  /** Whether the input should auto-focus on mount. */
  readonly autoFocus?: boolean
  /** HTML autocomplete token (`'email'`, `'new-password'`, `'off'`, …). */
  readonly autoComplete?: string
  /** I18n key for the label — overrides `label` when `t` resolves it. */
  readonly i18nLabel?: string
  /** I18n key for the hint — overrides `hint` when `t` resolves it. */
  readonly i18nHint?: string
  /** I18n key for the placeholder — overrides `placeholder` when `t` resolves it. */
  readonly i18nPlaceholder?: string
}

/**
 * Symbol-keyed slot we use to attach `FieldMeta` to a schema. Symbol
 * (not a string) so it doesn't collide with any property a validator
 * library might use. Exported only so unit tests can assert presence —
 * downstream consumers should call {@link getMeta} instead.
 *
 * @internal
 */
export const META_SLOT = Symbol.for('pyreon.validate.fieldMeta')

/**
 * A Pyreon-meta-bearing schema. Structurally a `StandardSchemaV1` PLUS
 * the metadata slot. `withField()` returns this; `getMeta()` reads it.
 *
 * The intersection preserves the original library's full surface
 * (Zod's `.parse`, `.optional`, etc.) — Pyreon rides on the side via a
 * Symbol-keyed property.
 */
export type WithFieldMeta<S extends StandardSchemaV1<unknown, unknown>> = S & {
  readonly [META_SLOT]: FieldMeta
}

/**
 * Type alias commonly used by consumers — `Output<S>` is the parsed
 * output type of a Standard Schema. Falls back to `unknown` when the
 * schema doesn't expose a `types` slot (most don't at runtime; this is
 * purely type-level).
 */
export type Output<S> = S extends StandardSchemaV1<infer _I, infer O> ? O : unknown

/**
 * Input type of a Standard Schema (pre-transform). Useful for form
 * `initialValues` typing.
 */
export type Input<S> = S extends StandardSchemaV1<infer I, infer _O> ? I : unknown

/**
 * Translation function shape — matches `@pyreon/i18n`'s `t` signature
 * (one of several equivalent overloads). Kept structural so the package
 * doesn't depend on `@pyreon/i18n` directly (avoids a circular: i18n
 * may want to consume validate helpers in the future).
 */
export type TFn = (key: string, params?: Record<string, unknown>) => string
