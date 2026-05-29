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

/**
 * Inline copy of the Standard Schema v1 protocol shape. We don't `import`
 * from `@standard-schema/spec` to keep this package zero-dep at the type
 * level — the protocol is small and stable. Any StdSchema-compliant
 * validator (Zod / Valibot / ArkType / typia / etc.) satisfies this
 * structural type.
 *
 * The `validate` return type is intentionally LOOSER than the spec's
 * formal discriminated union (`SuccessResult | FailureResult`) — real
 * library types (Zod's, Valibot's, ArkType's) have subtly different
 * Issue shapes that don't structurally match a strict union. Using the
 * looser duck-typed shape here (mirroring `@pyreon/validation`'s proven
 * adapter contract) lets `withField` accept any StdSchema-compliant
 * validator without per-lib type casts.
 *
 * See https://github.com/standard-schema/standard-schema for the canonical
 * spec.
 */
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: TOutput; readonly issues?: undefined }
      | { readonly value?: undefined; readonly issues: ReadonlyArray<StandardSchemaIssue> }
      | Promise<
          | { readonly value: TOutput; readonly issues?: undefined }
          | { readonly value?: undefined; readonly issues: ReadonlyArray<StandardSchemaIssue> }
        >
    // `| undefined` (not bare optional) under exactOptionalPropertyTypes
    // — Valibot's emitted shape is `types: StandardTypes | undefined`.
    readonly types?: { readonly input: TInput; readonly output: TOutput } | undefined
  }
}

/**
 * Standard Schema's success-or-failure result shape. A success has a
 * `value` and `issues` is absent. A failure has `issues` and `value` is
 * absent. The mutual-undefined-discriminator lets TypeScript narrow on
 * `result.issues === undefined` (matches the official spec shape).
 */
export type StandardSchemaResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly value?: undefined; readonly issues: ReadonlyArray<StandardSchemaIssue> }

/**
 * Standard Schema's per-issue shape. Pyreon extends this with optional
 * i18n fields via {@link PyreonIssue}.
 *
 * `path`'s `| undefined` is intentional (not just optional `?`) — under
 * `exactOptionalPropertyTypes: true`, Valibot's issue type explicitly
 * declares `path: ... | undefined` and a bare `path?: ...` would
 * reject it. The wider form accepts both Zod's absent-path issues and
 * Valibot's explicit-undefined-path issues.
 */
export interface StandardSchemaIssue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
}

/**
 * Pyreon-flavoured issue. Extends `StandardSchemaIssue` with optional
 * i18n routing. Validators that don't know about Pyreon (i.e. raw Zod /
 * Valibot / ArkType) produce bare `StandardSchemaIssue` — Pyreon's
 * format helpers handle both shapes.
 */
export interface PyreonIssue extends StandardSchemaIssue {
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
