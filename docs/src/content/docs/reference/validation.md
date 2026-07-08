---
title: "Universal Validation Gate — API Reference"
description: "The library-agnostic validation gate — Standard Schema bridge + Zod / Valibot / ArkType adapters"
---

# @pyreon/validation — API Reference

> **Generated** from `validation`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [validation](/docs/validation).

The stack-wide validation gate — the library-agnostic contract every Pyreon data package (`@pyreon/form`, `@pyreon/store`, `@pyreon/state-tree`, `@pyreon/feature`) consumes. Owns the validation contract types (`ValidationError` / `ValidateFn` / `SchemaValidateFn`) and the Standard Schema bridge, with ZERO pyreon dependencies (the consumers depend on it, not the reverse). Accept a RAW Standard Schema (Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, `@pyreon/validate` `s`) directly — no wrapper, no cast — via `standardSchemaToValidator`, or use the duck-typed `zodSchema` / `valibotSchema` / `arktypeSchema` adapters (which add the `_infer` brand + a sync `parse` for schema-driven state). All schema libraries are optional peer dependencies.

## Features

- Universal, library-agnostic validation gate — owns the contract types (ValidationError / ValidateFn / SchemaValidateFn) with ZERO pyreon deps
- Standard Schema bridge — pass a raw Zod / Valibot / ArkType / Effect / `s` schema directly, no adapter (standardSchemaToValidator / isStandardSchema)
- zodSchema / zodField — duck-typed Zod adapter (works with v3 and v4)
- valibotSchema / valibotField — Valibot standalone-function-style adapter
- arktypeSchema / arktypeField — ArkType sync adapter
- InferSchema&lt;S&gt; — resolve inferred field types from a Pyreon adapter OR a raw Standard Schema
- Schema-driven-state helpers — extractParseFn / formatIssues power @pyreon/store + @pyreon/state-tree
- issuesToRecord utility for building custom adapters

## Complete example

A full, end-to-end usage of the package:

```tsx
import { useForm } from '@pyreon/form'
import { z } from 'zod'

// Universal gate: pass a RAW Standard Schema directly — no adapter, no cast.
// Zod ≥3.24 / Valibot ≥1 / ArkType ≥2 / Effect Schema / @pyreon/validate 's'
// all expose '~standard', so the form bridges it via standardSchemaToValidator.
const schema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
})

const form = useForm({
  initialValues: { email: '', age: 0 },
  schema,                             // raw schema — the gate adapts it
  onSubmit: (values) => save(values),
})

// Or use the typed adapter when you want the _infer brand + sync parse
// (schema-driven @pyreon/store / @pyreon/state-tree need the coerced value):
import { zodSchema, zodField } from '@pyreon/validation'

const form2 = useForm({
  initialValues: { username: '', bio: '' },
  validators: {
    username: zodField(z.string().min(3).max(20)),  // per-field
    bio: zodField(z.string().max(500)),
  },
  schema: zodSchema(z.object({ username: z.string(), bio: z.string() })),
  onSubmit: (values) => save(values),
})

// Valibot adapter — standalone-function style (pass v.safeParse explicitly)
import { valibotSchema } from '@pyreon/validation'
import * as v from 'valibot'

const vSchema = v.object({ email: v.pipe(v.string(), v.email()) })
const form3 = useForm({
  initialValues: { email: '' },
  schema: valibotSchema(vSchema, v.safeParse),
  onSubmit: (values) => save(values),
})

// Bridge a raw schema by hand when you need the validator standalone:
import { standardSchemaToValidator } from '@pyreon/validation'
const validate = standardSchemaToValidator(schema)
const errors = await validate({ email: 'x', age: 5 })
// => { email: 'Invalid email', age: 'Too small: ...' }
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`zodSchema`](#zodschema) | function | Create a typed whole-form schema adapter from a Zod schema. |
| [`zodField`](#zodfield) | function | Create a per-field validator from a Zod schema. |
| [`valibotSchema`](#valibotschema) | function | Create a typed whole-form schema adapter from a Valibot schema. |
| [`valibotField`](#valibotfield) | function | Create a per-field validator from a Valibot schema. |
| [`arktypeSchema`](#arktypeschema) | function | Create a typed whole-form schema adapter from an ArkType type. |
| [`arktypeField`](#arktypefield) | function | Create a per-field validator from an ArkType type. |
| [`standardSchemaToValidator`](#standardschematovalidator) | function | Convert a RAW Standard Schema (any library exposing `~standard` — Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, `@py |
| [`isStandardSchema`](#isstandardschema) | function | Runtime type guard — detect a Standard Schema-compliant object by its `~standard` property (an object with a `validate`  |
| [`isPyreonAdapter`](#ispyreonadapter) | function | Runtime type guard — detect a Pyreon TypedSchemaAdapter (Tier A.1) by its `_infer` brand plus a callable `parse`. |
| [`wrapStandardSchema`](#wrapstandardschema) | function | Convert a Standard Schema into a synchronous parser returning `SchemaParseResult<T>` (`&#123; ok: true, value &#125; \| &#123; ok: false |
| [`extractParseFn`](#extractparsefn) | function | The primary schema-driven entry point for `@pyreon/store` + `@pyreon/state-tree`: accept EITHER a Pyreon TypedSchemaAdap |
| [`formatIssues`](#formatissues) | function | Format normalized schema issues into a readable multi-line `[Pyreon] Schema validation failed (<op>): ...` message. |
| [`issuesToRecord`](#issuestorecord) | function | Collapse an array of normalized `ValidationIssue` (`{ path, message }`) into a flat field→error record — the shape `@pyr |
| [`TypedSchemaAdapter`](#typedschemaadapter) | type | The object every `zodSchema()` / `valibotSchema()` / `arktypeSchema()` returns. |
| [`InferSchema`](#inferschema) | type | Extract the inferred output type from EITHER a Pyreon TypedSchemaAdapter (reads `_infer`, Tier A.1) OR a raw Standard Sc |
| [`SchemaValidateFn`](#schemavalidatefn) | type | The whole-object validator contract — maps a values object to a per-key error record (sync or async). |
| [`ValidateFn`](#validatefn) | type | The single-field validator contract — receives the field value, all current values (for cross-field checks), and an opti |
| [`ValidationError`](#validationerror) | type | A single field's error value — the message string, or `undefined` for "no error". |
| [`StandardSchemaLike`](#standardschemalike) | type | The Standard Schema (https://standardschema.dev) shape `@pyreon/validation` owns so any consumer can accept a raw schema |
| [`ValidationIssue`](#validationissue) | type | The normalized issue shape every adapter produces before calling `issuesToRecord` — a dot-separated field `path` (`addre |

## API

### zodSchema `function`

```ts
<TValues>(schema: ZodSchema<TValues>) => TypedSchemaAdapter<TValues>
```

Create a typed whole-form schema adapter from a Zod schema. Duck-typed against `.safeParse()` / `.safeParseAsync()` so it works with Zod v3 and v4 without version checks. Returns a `TypedSchemaAdapter` (`{ _infer, validator, parse }`) that `useForm({ schema })`, schema-driven `defineStore`, and `model` accept — `_infer` carries the inferred field types for compile-time field-name checking; `parse` gives store / state-tree the coerced value. Since Zod ≥3.24 is Standard-Schema-compliant you may also skip this wrapper and pass the raw `z.object(...)` directly.

**Example**

```tsx
const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: zodSchema(schema),
  onSubmit: (values) => save(values),
})
```

**Common mistakes**

- Passing both zodSchema AND a per-field validator for the same field — both run; a schema error can override the field error on that key
- Using zodSchema with a non-object schema (z.string()) — form/store schemas must validate an object shape matching initialValues
- Assuming the return is a plain function — it is a TypedSchemaAdapter object (&#123; _infer, validator, parse &#125;); the form reads `.validator` for you

**See also:** `zodField` · `standardSchemaToValidator` · `TypedSchemaAdapter`

---

### zodField `function`

```ts
<T>(schema: ZodSchema<T>) => ValidateFn<T>
```

Create a per-field validator from a Zod schema. Returns a `ValidateFn` compatible with `useForm({ validators: { fieldName: zodField(z.string().email()) } })`. Uses `safeParseAsync` so sync AND async refinements work; returns the first issue message on failure, `undefined` on success. Use when individual fields have independent rules that don't need cross-field context.

**Example**

```tsx
const form = useForm({
  initialValues: { username: '' },
  validators: { username: zodField(z.string().min(3).max(20)) },
  onSubmit: (values) => save(values),
})
```

**See also:** `zodSchema` · `valibotField` · `ValidateFn`

---

### valibotSchema `function`

```ts
<TValues>(schema: unknown, safeParse: Function) => TypedSchemaAdapter<TValues>
```

Create a typed whole-form schema adapter from a Valibot schema. Requires passing the `safeParse` (or `safeParseAsync`) function explicitly — Valibot uses standalone functions, not methods, so this keeps the adapter independent of Valibot's internal module structure across versions. Returns a `TypedSchemaAdapter` (&#123; _infer, validator, parse &#125;); the sync `parse` path needs the SYNC `v.safeParse`. Valibot ≥1 is also Standard-Schema-compliant, so a raw `v.object(...)` can be passed directly instead.

**Example**

```tsx
import * as v from 'valibot'
const schema = v.object({ email: v.pipe(v.string(), v.email()) })
const form = useForm({
  initialValues: { email: '' },
  schema: valibotSchema(schema, v.safeParse),
  onSubmit: (values) => save(values),
})
```

**Common mistakes**

- Forgetting to pass v.safeParse as the second argument — the adapter cannot call safeParse without it (Valibot uses standalone functions)
- Passing v.safeParseAsync when using the sync `parse` path (schema-driven store) — the parser then returns a Promise and store rejects it at defineStore-time

**See also:** `valibotField` · `zodSchema` · `standardSchemaToValidator`

---

### valibotField `function`

```ts
<T>(schema: unknown, safeParse: Function) => ValidateFn<T>
```

Create a per-field validator from a Valibot schema. Same standalone-function style as valibotSchema — pass `v.safeParse` (or `v.safeParseAsync`) explicitly. Returns the first issue message on failure, `undefined` on success.

**Example**

```tsx
validators: { email: valibotField(v.pipe(v.string(), v.email()), v.safeParseAsync) }
```

**See also:** `valibotSchema` · `zodField`

---

### arktypeSchema `function`

```ts
<TValues>(schema: (data: unknown) => unknown) => TypedSchemaAdapter<TValues>
```

Create a typed whole-form schema adapter from an ArkType type. Accepts any callable — ArkType schemas are invoked directly, no ArkType import required. Synchronous only (ArkType has no async surface); the non-error result IS the coerced value, so the `parse` path is native. Returns a `TypedSchemaAdapter` (&#123; _infer, validator, parse &#125;); errors are read from the returned `ArkErrors` array. ArkType ≥2 is Standard-Schema-compliant, so a raw `type(...)` can be passed directly instead.

**Example**

```tsx
import { type } from 'arktype'
const schema = type({ email: 'string.email', age: 'number > 18' })
const form = useForm({
  initialValues: { email: '', age: 0 },
  schema: arktypeSchema(schema),
  onSubmit: (values) => save(values),
})
```

**Common mistakes**

- Expecting async validation — the ArkType adapter is synchronous; wrap async logic in a per-field validator function instead

**See also:** `arktypeField` · `zodSchema` · `standardSchemaToValidator`

---

### arktypeField `function`

```ts
<T>(schema: (data: unknown) => unknown) => ValidateFn<T>
```

Create a per-field validator from an ArkType type. Synchronous, like arktypeSchema. Returns the first ArkType error message on failure, `undefined` on success.

**Example**

```tsx
validators: { age: arktypeField(type('number > 18')) }
```

**See also:** `arktypeSchema` · `zodField`

---

### standardSchemaToValidator `function`

```ts
<TValues>(schema: StandardSchemaLike) => SchemaValidateFn<TValues>
```

Convert a RAW Standard Schema (any library exposing `~standard` — Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, `@pyreon/validate` `s`) into a whole-object `SchemaValidateFn` — `(values) => per-key error record`. This is the bridge that lets a consumer accept a raw schema with no `zodSchema()` wrapper and no cast: `useForm({ schema: z.object(...) })`. Issue paths flatten to dot-strings (`address.city`); first message per path wins; async schemas resolve naturally (the returned validator is always async — await it).

**Example**

```tsx
import { z } from 'zod'
import { standardSchemaToValidator } from '@pyreon/validation'

const schema = z.object({ email: z.string().email(), age: z.number().min(18) })
const validate = standardSchemaToValidator(schema)
const errors = await validate({ email: 'x', age: 5 })
// => { email: 'Invalid email', age: 'Too small: ...' }
```

**Common mistakes**

- Passing a Pyreon adapter (the result of zodSchema()) instead of the RAW schema — the adapter is already a validator; pass z.object(...) directly, or use adapter.validator
- Expecting a synchronous return — the produced validator is always async (returns a Promise); always await it
- Assuming a non-object schema works — the output is a per-key record keyed on the top-level fields, so the schema must describe an object shape

**See also:** `isStandardSchema` · `zodSchema` · `InferSchema`

---

### isStandardSchema `function`

```ts
(value: unknown) => value is StandardSchemaShape<unknown>
```

Runtime type guard — detect a Standard Schema-compliant object by its `~standard` property (an object with a `validate` function). Used by the universal gate to decide whether a `schema` option is a raw Standard Schema (→ standardSchemaToValidator) vs a Pyreon TypedSchemaAdapter (→ isPyreonAdapter) vs a plain validator function. Zero library imports — pure duck-typing, so it never breaks on a validator-library major bump.

**Example**

```tsx
import { isStandardSchema, standardSchemaToValidator } from '@pyreon/validation'

if (isStandardSchema(schema)) {
  const validate = standardSchemaToValidator(schema)
}
```

**Common mistakes**

- Using it to detect a Pyreon adapter — those brand with `_infer`, not `~standard`; use isPyreonAdapter for that tier

**See also:** `isPyreonAdapter` · `standardSchemaToValidator`

---

### isPyreonAdapter `function`

```ts
(value: unknown) => value is PyreonAdapterShape<Record<string, unknown>>
```

Runtime type guard — detect a Pyreon TypedSchemaAdapter (Tier A.1) by its `_infer` brand plus a callable `parse`. The counterpart to isStandardSchema in the two-tier detection that schema-driven consumers (`@pyreon/store`, `@pyreon/state-tree`) use to accept EITHER a `zodSchema()`-style adapter OR a raw Standard Schema (Tier A.2).

**Example**

```tsx
import { isPyreonAdapter } from '@pyreon/validation'

if (isPyreonAdapter(schema)) {
  const result = schema.parse!(value) // sync coerced parse
}
```

**Common mistakes**

- Assuming any adapter passes — all three built-in adapters ship `parse` so they do, but a validator-only shape (&#123; _infer, validator &#125; with no parse) does NOT

**See also:** `isStandardSchema` · `extractParseFn`

---

### wrapStandardSchema `function`

```ts
<T>(schema: StandardSchemaShape<unknown>) => (value: unknown) => SchemaParseResult<T>
```

Convert a Standard Schema into a synchronous parser returning `SchemaParseResult<T>` (`{ ok: true, value } | { ok: false, issues }`). Unlike standardSchemaToValidator (which returns per-key ERRORS for forms), this returns the coerced VALUE on success — what `@pyreon/store` / `@pyreon/state-tree` need. Surfaces async validation as a `Promise` return so callers can detect and reject async-only schemas. @internal — most consumers go through extractParseFn.

**Example**

```tsx
import { wrapStandardSchema } from '@pyreon/validation'

const parse = wrapStandardSchema(schema)
const r = parse(input)
if (r instanceof Promise) throw new Error('async schema unsupported')
if (r.ok) use(r.value)
```

**Common mistakes**

- Treating it like standardSchemaToValidator — this returns a coerced-value ParseResult, not a form error record
- Not probing for a Promise return — an async Standard Schema returns a Promise, which is not a valid sync ParseResult

**See also:** `extractParseFn` · `standardSchemaToValidator`

---

### extractParseFn `function`

```ts
<T>(schema: unknown) => (value: unknown) => SchemaParseResult<T>
```

The primary schema-driven entry point for `@pyreon/store` + `@pyreon/state-tree`: accept EITHER a Pyreon TypedSchemaAdapter (uses its sync `parse`) OR a raw Standard Schema (wraps via wrapStandardSchema) and return one uniform sync parser. Throws a `[Pyreon]`-prefixed error at construction if the value is neither shape, or if a Tier-A.1 adapter is missing its `parse`. Callers should probe the first call for a `Promise` (async-only schema) and reject it.

**Example**

```tsx
import { extractParseFn, formatIssues } from '@pyreon/validation'

const parse = extractParseFn(userSchema)
const r = parse(initial)
if (r instanceof Promise) throw new Error('[Pyreon] async schemas unsupported')
if (!r.ok) throw new Error(formatIssues(r.issues, 'init'))
const value = r.value // parsed + coerced
```

**Common mistakes**

- Passing an async-only schema (objectAsync / safeParseAsync-only) — extractParseFn constructs fine but the returned parser resolves a Promise; detect and reject it
- Passing a @pyreon/form-only validator (&#123; _infer, validator &#125; with no parse) — throws at construction; schema-driven state needs the coerced value, not just errors

**See also:** `wrapStandardSchema` · `isPyreonAdapter` · `formatIssues`

---

### formatIssues `function`

```ts
(issues: SchemaIssue[], op: string) => string
```

Format normalized schema issues into a readable multi-line `[Pyreon] Schema validation failed (<op>): ...` message. Truncates after 5 issues with an "and N more" suffix. `op` is a free-form label for the failing operation (`init`, `set`, `patch`, `create`, `$set`, ...). Used by schema-driven store / state-tree to throw clear errors on an invalid write.

**Example**

```tsx
import { formatIssues } from '@pyreon/validation'

throw new Error(formatIssues([{ path: 'email', message: 'Invalid' }], 'set'))
// [Pyreon] Schema validation failed (set):
//   - email: Invalid
```

**See also:** `extractParseFn` · `issuesToRecord`

---

### issuesToRecord `function`

```ts
<TValues>(issues: ValidationIssue[]) => Partial<Record<keyof TValues, ValidationError>>
```

Collapse an array of normalized `ValidationIssue` (`{ path, message }`) into a flat field→error record — the shape `@pyreon/form` consumes. First message per path wins; nested dot-paths (`address.city`) become the record key verbatim (the adapter is responsible for producing the dot-string). The building block every custom adapter ends with.

**Example**

```tsx
import { issuesToRecord } from '@pyreon/validation'

issuesToRecord([
  { path: 'email', message: 'Required' },
  { path: 'email', message: 'Invalid' }, // dropped — first wins
])
// => { email: 'Required' }
```

**Common mistakes**

- Expecting the LAST message to win for a repeated path — the FIRST wins; order your issues most-important-first
- Feeding native library paths (arrays / objects) directly — normalize to a dot-string path in the ValidationIssue first

**See also:** `formatIssues` · `zodSchema`

---

### TypedSchemaAdapter `type`

```ts
interface TypedSchemaAdapter<TValues> { readonly _infer: TValues; readonly validator: SchemaValidateFn<TValues>; readonly parse?: (value: unknown) => ParseResult<TValues> }
```

The object every `zodSchema()` / `valibotSchema()` / `arktypeSchema()` returns. `_infer` is a compile-time-only brand carrying the inferred field types (never read at runtime — it is `undefined as any`); `validator` is the whole-form error function `@pyreon/form` runs; `parse` is the optional sync coerced-value parser `@pyreon/store` / `@pyreon/state-tree` need (all three built-in adapters ship it).

**Example**

```tsx
import { zodSchema } from '@pyreon/validation'
const adapter = zodSchema(z.object({ id: z.string() }))
adapter.validator({ id: 5 })   // => { id: 'Expected string' }
adapter.parse!({ id: 'x' })    // => { ok: true, value: { id: 'x' } }
```

**Common mistakes**

- Calling the adapter like a function — it is an object; the form reads `.validator` for you, store reads `.parse`
- Relying on `_infer` at runtime — it is `undefined as any`, a type brand only

**See also:** `zodSchema` · `SchemaValidateFn` · `InferSchema`

---

### InferSchema `type`

```ts
type InferSchema<S> = S["_infer"] /* Tier A.1 */ | S["~standard"]["types"]["output"] /* Tier A.2 */ | Record<string, unknown>
```

Extract the inferred output type from EITHER a Pyreon TypedSchemaAdapter (reads `_infer`, Tier A.1) OR a raw Standard Schema (reads `~standard.types.output`, Tier A.2). Falls back to `Record<string, unknown>` for unknown shapes (never collapses to `never`). Powers the strict typing in `@pyreon/store` + `@pyreon/state-tree` so a raw `z.object(...)` passed directly infers its exact field types.

**Example**

```tsx
import type { InferSchema } from '@pyreon/validation'
import { z } from 'zod'

const schema = z.object({ id: z.string(), n: z.number() })
type Values = InferSchema<typeof schema> // { id: string; n: number }
```

**Common mistakes**

- Expecting inference when a raw schema omits its `~standard.types` phantom — the spec makes `types?` optional; real libraries emit it, but a hand-rolled ~standard without it falls back to Record&lt;string, unknown&gt;

**See also:** `TypedSchemaAdapter` · `StandardSchemaLike`

---

### SchemaValidateFn `type`

```ts
type SchemaValidateFn<TValues> = (values: TValues) => Partial<Record<keyof TValues, ValidationError>> | Promise<Partial<Record<keyof TValues, ValidationError>>>
```

The whole-object validator contract — maps a values object to a per-key error record (sync or async). What every schema adapter (zod / valibot / arktype / Standard Schema) produces and what `@pyreon/form` + `@pyreon/store` consume. OWNED by `@pyreon/validation` (the library-agnostic gate); `@pyreon/form` re-exports it for back-compat.

**Example**

```tsx
import type { SchemaValidateFn } from '@pyreon/validation'

const validate: SchemaValidateFn<{ email: string }> = (values) =>
  values.email.includes('@') ? {} : { email: 'Invalid email' }
```

**Common mistakes**

- Returning a full record with every key present — return ONLY errored keys; an empty object &#123;&#125; means "valid"

**See also:** `ValidateFn` · `standardSchemaToValidator`

---

### ValidateFn `type`

```ts
type ValidateFn<T, TValues = Record<string, unknown>> = (value: T, allValues: TValues, signal?: AbortSignal) => ValidationError | Promise<ValidationError>
```

The single-field validator contract — receives the field value, all current values (for cross-field checks), and an optional `AbortSignal` (cancellation, e.g. when a form unmounts). Returns an error string or `undefined` (sync or async). OWNED by `@pyreon/validation`; `@pyreon/form` re-exports it.

**Example**

```tsx
import type { ValidateFn } from '@pyreon/validation'

const confirm: ValidateFn<string, { password: string }> = (value, all) =>
  value === all.password ? undefined : 'Passwords must match'
```

**Common mistakes**

- Returning a falsy non-undefined value ("" / false / 0) to mean "valid" — return `undefined`; an empty string is technically an error message

**See also:** `SchemaValidateFn` · `ValidationError`

---

### ValidationError `type`

```ts
type ValidationError = string | undefined
```

A single field's error value — the message string, or `undefined` for "no error". The atomic unit of every error record and validator return in the stack. OWNED by `@pyreon/validation`; re-exported by `@pyreon/form` so `import { ValidationError } from '@pyreon/form'` still works.

**Example**

```tsx
import type { ValidationError } from '@pyreon/validation'

const err: ValidationError = isValid ? undefined : 'Required'
```

**See also:** `ValidateFn` · `SchemaValidateFn`

---

### StandardSchemaLike `type`

```ts
interface StandardSchemaLike<Output = unknown> { readonly "~standard": { readonly types?: { readonly output: Output }; readonly validate: (value: unknown) => StandardSchemaResult | Promise<StandardSchemaResult> } }
```

The Standard Schema (https://standardschema.dev) shape `@pyreon/validation` owns so any consumer can accept a raw schema with no adapter and no cast — the `~standard` property Zod ≥3.24 / Valibot ≥1 / ArkType ≥2 / Effect Schema / `@pyreon/validate` `s` all expose. `standardSchemaToValidator` takes this type; `useForm({ schema })` accepts it directly.

**Example**

```tsx
import type { StandardSchemaLike } from '@pyreon/validation'
import { standardSchemaToValidator } from '@pyreon/validation'

function adapt<T extends Record<string, unknown>>(s: StandardSchemaLike) {
  return standardSchemaToValidator<T>(s)
}
```

**Common mistakes**

- Confusing it with StandardSchemaShape — near-identical duck-types; standardSchemaToValidator takes StandardSchemaLike, wrapStandardSchema / isStandardSchema use StandardSchemaShape

**See also:** `standardSchemaToValidator` · `isStandardSchema`

---

### ValidationIssue `type`

```ts
interface ValidationIssue { path: string; message: string }
```

The normalized issue shape every adapter produces before calling `issuesToRecord` — a dot-separated field `path` (`address.city`) plus a human-readable `message`. The common denominator that lets any library's errors flow into `@pyreon/form`'s flat record. Aliased as `SchemaIssue` for the store / state-tree surface.

**Example**

```tsx
import type { ValidationIssue } from '@pyreon/validation'

const issues: ValidationIssue[] = [{ path: 'address.city', message: 'Required' }]
```

**See also:** `issuesToRecord` · `formatIssues`

---

## Package-level notes

> **Note:** All three schema libraries are optional peer dependencies. Install only the one you use — the adapters are tree-shaken per import path (`@pyreon/validation/zod`, `@pyreon/validation/valibot`, `@pyreon/validation/arktype`).

> **Raw Standard Schema needs no wrapper:** Zod 3.24+, Valibot 1+, ArkType 2+, Effect Schema, and `@pyreon/validate`'s `s` all expose `~standard`, so you can pass the schema DIRECTLY (`useForm({ schema: z.object(...) })`) — the gate bridges it via `standardSchemaToValidator`. Reach for `zodSchema()` / `valibotSchema()` / `arktypeSchema()` when you want the `_infer`-branded typed adapter, the sync `parse` path (schema-driven `@pyreon/store` / `@pyreon/state-tree`), or a library that is not Standard-Schema-compliant.

> **Contract types live here now:** `ValidationError` / `ValidateFn` / `SchemaValidateFn` are OWNED by `@pyreon/validation` (the gate has ZERO pyreon deps; `@pyreon/form` / `@pyreon/store` / `@pyreon/state-tree` / `@pyreon/feature` depend on it). `@pyreon/form` re-exports them, so `import { ValidationError } from '@pyreon/form'` still works.

> **Valibot standalone functions:** Valibot uses standalone functions (not methods), so `valibotSchema` and `valibotField` require passing `v.safeParse` as an explicit argument. This is by design to avoid internal coupling to Valibot's module structure.

> **Duck typing:** Every adapter AND the Standard Schema bridge duck-type at runtime — they never `import` from Zod / Valibot / ArkType. Major version bumps in any validator library do not break the gate.
