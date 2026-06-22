---
title: "Pyreon validator + Standard Schema DX — API Reference"
description: "Pyreon's own validation library — chainable + function-comp hybrid API, Standard Schema-native, with built-in field metadata, reactive parse, and i18n-aware err"
---

# @pyreon/validate — API Reference

> **Generated** from `validate`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [validate](/docs/validate).

Pyreon-owned validator library implementing Standard Schema (https://standardschema.dev) natively. Hybrid API: chainable methods (`s.string().email().min(3)`) AND function composition (`pipe(string(), email(), min(3))`) — same schemas, different ergonomic surface. The chainable path doesn't pay class-overhead per parse: each schema's ops compile to a single closure on first call. Includes built-in DX helpers (`withField` / `parseReactive` / `formatErrors`) that ALSO work on top of any other Standard Schema validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+) — backward-compatible with existing schema code. v1 surface: string/number/boolean/literal/enum primitives + object/array composition + optional/nullable/nullish/default/transform/refine/brand/describe modifiers + 20+ built-in checks. tuple / record / union / discriminate / intersection / date / bigint / .pick / .omit / compiler-emit deferred to follow-up PRs.

## Features

- withField(schema, meta) — attach label/hint/placeholder/i18n keys to ANY Standard Schema validator
- getMeta(schema) / resolveMetaField(schema, field, t) — read metadata, optionally i18n-resolved
- parseReactive(schema, signal) — Computed&lt;ParseResult&gt; that re-derives on signal changes
- parseReactiveAsync — async variant for schemas with async refinements
- watchValid(schema, signal, callback) — fires on validity transitions, not every error change
- formatError / formatErrors / formatErrorsByPath — i18n-key-aware error rendering
- Works with any Standard Schema validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+, …)
- Tree-shakeable — DX helpers alone are ~0.5KB gz (measured); the v1 validator runtime (~3.5KB gz) is pulled in only when `s` / primitives are imported

## Complete example

A full, end-to-end usage of the package:

```tsx
import { z } from 'zod'
import { signal } from '@pyreon/reactivity'
import { useI18n } from '@pyreon/i18n'
import {
  withField,
  getMeta,
  parseReactive,
  watchValid,
  formatErrors,
} from '@pyreon/validate'

// 1. Attach Pyreon field metadata to any Standard Schema.
const emailSchema = withField(z.string().email(), {
  label: 'Email address',
  placeholder: 'you@example.com',
  hint: 'We never share your email',
  i18nLabel: 'auth.email.label',
  i18nHint: 'auth.email.hint',
  autoComplete: 'email',
})

// emailSchema is STILL a Zod schema — every Zod method works:
emailSchema.parse('foo@bar.com')          // → 'foo@bar.com'
emailSchema['~standard'].validate('bad')  // → { issues: [...] }

// Read the metadata back:
getMeta(emailSchema)
// → { label: 'Email address', placeholder: ..., i18nLabel: ..., ... }

// 2. Reactively parse a signal-backed input.
const $email = signal('')
const $result = parseReactive(emailSchema, $email)

effect(() => {
  const r = $result()
  if (r.issues) console.warn('invalid:', r.issues)
  else console.log('parsed:', r.value)
})

$email.set('foo@bar.com')   // → $result fires, valid

// 3. Watch for validity flips (no fire on error-message change).
const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})

// 4. i18n bridge — resolve issue keys to translated strings.
const { t } = useI18n()
const messages = formatErrors($result().issues ?? [], t)
// → translated strings via t(issue.key, issue.params), with fallback to issue.fallback or issue.message

// 5. Works with ANY Standard Schema validator — drop-in swap to Valibot:
import * as v from 'valibot'
const sameSchema = withField(v.pipe(v.string(), v.email()), { label: 'Email' })
const $sameResult = parseReactive(sameSchema, $email)
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`withField`](#withfield) | function | Attach Pyreon field metadata (label, hint, placeholder, i18n keys, autoFocus, autoComplete, defaultValue) to any Standar |
| [`getMeta`](#getmeta) | function | Read the Pyreon field metadata attached via withField(). |
| [`resolveMetaField`](#resolvemetafield) | function | Read a metadata field through optional i18n. |
| [`parseReactive`](#parsereactive) | function | Reactively parse `source` through `schema`. |
| [`parseReactiveAsync`](#parsereactiveasync) | function | Async variant of parseReactive. |
| [`watchValid`](#watchvalid) | function | Subscribe to validity transitions. |
| [`formatError`](#formaterror) | function | Resolve a single issue to a human-readable string. |
| [`formatErrors`](#formaterrors) | function | Resolve an array of issues to strings via the same per-issue logic as formatError. |
| [`formatErrorsByPath`](#formaterrorsbypath) | function | Build a per-field error map keyed by the issue's path joined with `.`. |

## API

### withField `function`

```ts
<S extends StandardSchemaV1>(schema: S, meta: FieldMeta) => S
```

Attach Pyreon field metadata (label, hint, placeholder, i18n keys, autoFocus, autoComplete, defaultValue) to any Standard Schema. The returned schema is the SAME REFERENCE as the input — Pyreon mutates a Symbol-keyed non-enumerable slot in place, which is invisible to JSON serialization, for…in, Object.keys, and library-internal comparators. Mutation (instead of cloning) is required because ArkType's `Type` instances are callable functions whose `~standard.validate` does `this(input)` — a shallow clone would not be callable and would break that contract. Re-wrapping merges new metadata onto existing (later keys win).

**Example**

```tsx
const emailSchema = withField(z.string().email(), {
  label: 'Email address',
  placeholder: 'you@example.com',
  i18nLabel: 'auth.email.label',
  autoComplete: 'email',
})
```

**Common mistakes**

- Expecting withField to return a NEW reference — it doesn't. The metadata mutation is in place. If you need an isolated copy, construct two separate schemas instead.
- Adding `i18nLabel` without a corresponding `label` — without a translation provider (or when t echoes the key), there's no fallback. Always set both.
- Storing schemas with metadata in JSON.stringify-d state and round-tripping — the metadata is Symbol-keyed and won't survive serialization. Re-attach on load.

**See also:** `getMeta` · `resolveMetaField` · `StandardSchemaV1`

---

### getMeta `function`

```ts
<S extends StandardSchemaV1>(schema: S) => FieldMeta | undefined
```

Read the Pyreon field metadata attached via withField(). Returns undefined for schemas that haven't been wrapped — consumers should be defensive (`getMeta(schema)?.label ?? fallback`). Accepts both objects AND functions (ArkType's `Type` instances are callable).

**Example**

```tsx
const meta = getMeta(emailSchema)
const label = meta?.label ?? humanize(fieldName)
```

**See also:** `withField` · `resolveMetaField`

---

### resolveMetaField `function`

```ts
<S extends StandardSchemaV1>(
  schema: S,
  field: 'label' | 'hint' | 'placeholder',
  t?: TFn,
) => string | undefined
```

Read a metadata field through optional i18n. If the metadata has an `i18n<Field>` key AND a `t` function is provided AND `t` resolves it (returns a non-key string), the resolved string wins. Otherwise falls back to the literal. Recommended over `getMeta(schema)?.label` directly when you have a `t` from `useI18n()`.

**Example**

```tsx
const label = resolveMetaField(emailSchema, 'label', t)
// → t('auth.email.label') if set + resolved, else meta.label, else undefined
```

**See also:** `getMeta` · `formatErrors`

---

### parseReactive `function`

```ts
<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
) => Computed<ParseResult>
```

Reactively parse `source` through `schema`. Returns a `Computed<ParseResult>` that re-validates on every source change. Synchronous only — for schemas with async refinements (Zod `.refine(async)`, Valibot async pipe), use parseReactiveAsync (this sync variant surfaces an actionable issue if the schema returns a Promise).

**Example**

```tsx
const $email = signal('')
const $result = parseReactive(emailSchema, $email)

effect(() => {
  const r = $result()
  if (r.issues) showError(r.issues)
  else commitValue(r.value)
})

$email.set('foo@bar.com')  // $result re-derives
```

**Common mistakes**

- Using parseReactive on an async schema — it surfaces a clear "use parseReactiveAsync" issue rather than silently producing a Promise as the validation result.
- Calling parseReactive on every render of a component — it allocates a Computed; cache it at component setup time (call once per signal-source pair).

**See also:** `parseReactiveAsync` · `watchValid` · `formatErrors`

---

### parseReactiveAsync `function`

```ts
<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
) => Computed<Promise<ParseResult>>
```

Async variant of parseReactive. The outer Computed re-evaluates synchronously on source change; the inner Promise resolves once the validator finishes. Rapid source changes produce overlapping in-flight promises — the caller is responsible for handling staleness (a `watch()` over the Computed naturally drops stale frames).

**Example**

```tsx
const schema = z.string().refine(async (s) => await checkUnique(s))
const $result = parseReactiveAsync(schema, $username)

watch($result, async (current) => {
  const r = await current
  showFeedback(r)
})
```

**See also:** `parseReactive`

---

### watchValid `function`

```ts
<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
  callback: (valid: boolean) => void,
) => () => void
```

Subscribe to validity transitions. The callback fires only when validity flips (true→false or false→true), NOT on every error-message change — ideal for form-state hooks that care about "is this OK?" without re-rendering on every typo. Returns an unsubscribe function. Internally a `watch()` over `parseReactive`.

**Example**

```tsx
const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})

onUnmount(stop)
```

**See also:** `parseReactive`

---

### formatError `function`

```ts
(issue: StandardSchemaIssue | PyreonIssue, t?: TFn) => string
```

Resolve a single issue to a human-readable string. Resolution order: (1) `issue.key` + `t` provided AND `t` returns a non-key string → resolved string; (2) `issue.fallback` if set; (3) `issue.message` (always present per StdSchema spec). Native StdSchema issues without `key`/`fallback` fall through to `message` immediately — no overhead.

**Example**

```tsx
const message = formatError(issue, t)
// → t('validate.string.too-short', { min: 2 }) when key + t resolve
// → issue.fallback ('Must be at least 2 characters') when t echoes the key
// → issue.message (raw lib message) when no key at all
```

**See also:** `formatErrors` · `formatErrorsByPath`

---

### formatErrors `function`

```ts
(issues: ReadonlyArray<StandardSchemaIssue | PyreonIssue>, t?: TFn) => string[]
```

Resolve an array of issues to strings via the same per-issue logic as formatError. Returns strings in the original order so paths line up with the input array.

**Example**

```tsx
const { t } = useI18n()
const messages = formatErrors(result.issues ?? [], t)
```

**See also:** `formatError` · `formatErrorsByPath`

---

### formatErrorsByPath `function`

```ts
(issues: ReadonlyArray<StandardSchemaIssue | PyreonIssue>, t?: TFn, options?: { joinWith?: string }) => Record<string, string>
```

Build a per-field error map keyed by the issue's path joined with `.`. Compatible with `@pyreon/form`'s `Errors` shape (`Partial<Record<fieldName, string>>`). Path-less issues land under the empty-string key. First issue wins on collision unless `joinWith` is set (then messages concatenate).

**Example**

```tsx
const errorMap = formatErrorsByPath(result.issues ?? [], t)
// → { email: 'Invalid email', password: 'Too short', ... }
```

**See also:** `formatErrors`

---

## Package-level notes

> **Standard Schema is parse-only:** The protocol deliberately omits a metadata channel — that's the gap `withField` fills. The protocol also doesn't carry i18n keys — `formatErrors` adds that layer.

> **withField mutates in place:** ArkType's Type instances are callable functions whose `~standard.validate` does `this(input)` — `this` must be the callable schema itself. An Object.create() clone is not callable and breaks ArkType. Symbol-keyed non-enumerable mutation is invisible to JSON / for…in / Object.keys / library-internal comparators. Safe.

> **No validator runtime:** Pyreon-validate does NOT ship a validator. Use Zod / Valibot / ArkType / typia / any Standard Schema-compliant lib — Pyreon-validate makes it Pyreon-flavoured.

> **Compiler-emit is a follow-up:** A future PR adds `@pyreon/compiler:analyzeValidate()` to emit typia-class specialized validators per schema at build time. v1 ships at the underlying lib's speed (Valibot/ArkType are already 3-5× faster than Zod; the compiler PR closes the gap for Zod schemas too).
