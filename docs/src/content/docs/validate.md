---
title: 'Validate — validator + Standard Schema DX'
description: Pyreon's own validator runtime plus a DX layer (field metadata, reactive parse, i18n errors) that works on any Standard Schema validator.
---

`@pyreon/validate` is **two things in one package**, layered on [Standard Schema](https://standardschema.dev) — the cross-library protocol implemented natively by **Zod 3.24+**, **Valibot 1.0+**, **ArkType 2.0+**, and any future spec-compliant validator:

1. **DX helpers on top of _your_ validator** — `withField`, `parseReactive`, `watchValid`, `formatErrors` work on **any** Standard Schema. They add the three things the protocol deliberately leaves out: field metadata, reactive parse, and i18n-aware error formatting. Bring Zod / Valibot / ArkType, or anything spec-compliant.
2. **Pyreon's own `s` validator** — a chainable + function-composition hybrid (`s.string().email()` _or_ `pipe(string(), email())`), Standard Schema-native, with primitives, composition, object algebra, coercion, and 30+ built-in checks. No third-party dependency required.

The two halves share one package but tree-shake independently: import only the DX helpers and the `s` runtime is dropped entirely (a DX-only import measures ~0.5 KB gz). Use either, or mix them freely.

<PackageBadge name="@pyreon/validate" href="/docs/validate" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/validate
```

```bash [bun]
bun add @pyreon/validate
```

```bash [pnpm]
pnpm add @pyreon/validate
```

```bash [yarn]
yarn add @pyreon/validate
```

:::

If you only want the **DX helpers** on top of an existing validator, add that validator too:

```bash
bun add zod        # or valibot, or arktype — any Standard Schema validator
```

If you want **Pyreon's own `s` validator**, no extra dependency is needed — `import { s } from '@pyreon/validate'`.

:::note[Bundle contract]
The package is tree-shakeable in two layers. A **DX-helpers-only** import (`withField` / `parseReactive` / `formatErrors`) is ~**0.5 KB gz** — Pyreon's `s` runtime is never pulled in. The **`s` validator runtime** is included only when you import `s` (or its standalone primitives like `string`, `object`), adding the runtime for a combined ~**3.9 KB gz**. So pairing the helpers with Zod / Valibot / ArkType stays as light as before.
:::

## Why this exists

Standard Schema is **parse-only** — its authors deliberately omitted a metadata channel and an i18n channel. But `@pyreon/form` and `@pyreon/feature` need:

1. **Field metadata** (label, hint, placeholder, i18n keys) bound to the schema, not duplicated in form props.
2. **Reactive parse** — re-validate as the user types, with the result usable in JSX and effects.
3. **i18n-aware errors** — error messages as translation keys, resolved through the project's `useI18n()` `t` function.

`@pyreon/validate` adds those three things on any Standard Schema validator — and, since v1, also ships the `s` validator so you can stay in one dependency end-to-end.

---

## Part 1 — DX helpers (works with any validator)

These helpers work on **any** Standard Schema validator. The `s` runtime below is optional.

## Quick start

```ts
import { z } from 'zod'
import { signal, effect } from '@pyreon/reactivity'
import { useI18n } from '@pyreon/i18n'
import { withField, parseReactive, formatErrors, watchValid } from '@pyreon/validate'

// 1. Attach field metadata to any Standard Schema (here: a Zod schema).
const emailSchema = withField(z.string().email(), {
  label: 'Email address',
  placeholder: 'you@example.com',
  hint: 'We never share your email',
  i18nLabel: 'auth.email.label',
  i18nHint: 'auth.email.hint',
  autoComplete: 'email',
})

// emailSchema is STILL a Zod schema — `.parse()`, `.optional()`, etc. all work.

// 2. Reactively validate a signal-backed input.
const $email = signal('')
const $result = parseReactive(emailSchema, $email)

effect(() => {
  const r = $result()
  if (r.issues) console.warn('invalid')
  else console.log('parsed:', r.value)
})

$email.set('foo@bar.com') // → $result re-derives, .value populated

// 3. i18n-aware error formatting.
const { t } = useI18n()
const messages = formatErrors($result().issues ?? [], t)
// → strings resolved via t('auth.email.required', …), falling back to issue.fallback or issue.message

// 4. Watch validity flips (does NOT fire on every error change).
const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})
```

Everything above works identically with Valibot or ArkType — swap the schema constructor, the helpers don't change:

```ts
import * as v from 'valibot'
const sameSchema = withField(v.pipe(v.string(), v.email()), { label: 'Email' })
const $sameResult = parseReactive(sameSchema, $email)
```

## Field metadata

`withField(schema, meta)` attaches Pyreon metadata to any Standard Schema validator.

```ts
import { withField } from '@pyreon/validate'

const emailSchema = withField(z.string().email(), {
  label: 'Email address',
  placeholder: 'you@example.com',
  i18nLabel: 'auth.email.label',
  autoComplete: 'email',
})
```

### Available metadata

Every `FieldMeta` field is optional — consumers (`@pyreon/form`'s `useField`, `@pyreon/feature`'s `defineFeature`) read whichever ones they need.

| Field | Type | Use |
| --- | --- | --- |
| `label` | `string` | Human-readable form label (for `<label>` elements). |
| `hint` | `string` | Short helper text under the input. |
| `placeholder` | `string` | Input placeholder. |
| `defaultValue` | `unknown` | Initial value used by `useForm` when the user provides none. |
| `autoFocus` | `boolean` | Whether the input should auto-focus on mount. |
| `autoComplete` | `string` | HTML autocomplete token (`'email'`, `'new-password'`, `'off'`, …). |
| `i18nLabel` | `string` | i18n key — overrides `label` when `t` resolves it. |
| `i18nHint` | `string` | i18n key for `hint`. |
| `i18nPlaceholder` | `string` | i18n key for `placeholder`. |

### Reading metadata

```ts
import { getMeta, resolveMetaField } from '@pyreon/validate'
import { useI18n } from '@pyreon/i18n'

// Direct read — returns FieldMeta | undefined. Be defensive.
const meta = getMeta(emailSchema)
const label = meta?.label ?? 'Email'

// i18n-aware read — prefers t() resolution, falls back to the literal.
const { t } = useI18n()
const i18nLabel = resolveMetaField(emailSchema, 'label', t)
// → t('auth.email.label') when set + resolved, else meta.label, else undefined
```

`resolveMetaField` accepts only `'label' | 'hint' | 'placeholder'` and consults the matching `i18n<Field>` key when a `t` is supplied. It echoes back to the literal when `t` returns the key unchanged (no translation registered).

### Why mutation, not cloning?

`withField` mutates the **original schema** rather than cloning it — the returned schema is the **same reference**. This is intentional:

- **Callable schemas can't be naively cloned.** ArkType's `Type` instances are callable functions whose `~standard.validate` does `this(input)` — `this` must be the callable schema itself. A shallow `Object.create()` clone is not callable and would break ArkType.
- **The slot is invisible.** The metadata rides on a `Symbol.for('pyreon.validate.fieldMeta')` non-enumerable property, so it's skipped by `JSON.stringify`, `for…in`, `Object.keys`, structured clone, and library-internal schema comparators.
- **Re-wrapping merges.** `withField(base, { a })` then `withField(base, { b })` produces a schema carrying both — later keys win on collision.

:::warning[withField returns the SAME reference]
Don't expect `withField` to return a fresh object. The metadata mutation is **in place**. If you need an isolated copy of the same shape, construct two separate schemas (`z.string().email()` twice) and wrap each.
:::

:::warning[Metadata doesn't survive serialization]
The slot is Symbol-keyed, so it won't round-trip through `JSON.stringify` / `JSON.parse`. If you store schemas with metadata in serialized state, re-attach the metadata on load.
:::

:::warning[Set `label` alongside `i18nLabel`]
Adding `i18nLabel` without a corresponding `label` leaves no fallback — without a translation provider (or when `t` echoes the key), there's nothing to render. Always set both.
:::

## Reactive parse

`parseReactive(schema, source)` returns a `Computed<ParseResult>` that re-validates on every source change. The source can be a `Signal<T>` or a plain `() => T` accessor (both are callable, so no `typeof` branching is needed).

```ts
import { signal, effect } from '@pyreon/reactivity'

const $email = signal('')
const $result = parseReactive(emailSchema, $email)

effect(() => {
  const r = $result()
  if (r.issues) showErrors(r.issues)
  else submitForm(r.value)
})
```

`ParseResult` mirrors Standard Schema's result shape exactly — `{ value }` on success, `{ issues }` on failure — so downstream code that already handles StdSchema results just works.

:::warning[Cache the Computed, don't re-create it]
`parseReactive` allocates a `Computed`. Call it **once per (schema, source) pair** at component setup time — not inside a render that runs every frame.
:::

### Async validators

For schemas with async refinements (Zod `.refine(async)`, Valibot async pipe), use `parseReactiveAsync` — it returns a `Computed<Promise<ParseResult>>`:

```ts
import { watch } from '@pyreon/reactivity'

const schema = z.string().refine(async (s) => await checkUnique(s))
const $result = parseReactiveAsync(schema, $username)

watch($result, async (current) => {
  const r = await current
  showFeedback(r)
})
```

The outer `Computed` re-evaluates synchronously on source change; the inner `Promise` resolves when the validator finishes. Rapid input changes produce overlapping in-flight promises — `watch` naturally drops stale frames, so the latest input wins.

:::warning[Use the async variant for async schemas]
Calling `parseReactive` on an async schema doesn't silently produce a Promise as the "value". It surfaces a clear `issues` entry directing you to `parseReactiveAsync`.
:::

### Validity watcher

`watchValid(schema, source, callback)` fires only on **validity transitions** (true→false or false→true), **not** on every error-message change. Use it for form-state hooks that care about "is this OK?" without re-rendering on every keystroke. It returns an unsubscribe function.

```ts
import { onUnmount } from '@pyreon/core'

const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})

onUnmount(stop)
```

## i18n bridge

`@pyreon/validate` extends Standard Schema's `Issue` with optional `{ code, key, params, fallback }` fields. The `formatError` / `formatErrors` / `formatErrorsByPath` helpers resolve issues through your `t` function:

```ts
import { useI18n } from '@pyreon/i18n'
import { formatErrors } from '@pyreon/validate'

const { t } = useI18n()
const messages = formatErrors(result.issues ?? [], t)
```

Resolution order per issue:

1. `issue.key` is set **and** `t` is provided **and** `t` returns a non-key string (i.e. the provider actually has a translation) → use the resolved string.
2. `issue.fallback` if set.
3. `issue.message` (always present per the Standard Schema spec).

Native Standard Schema issues from raw Zod / Valibot / ArkType don't carry `key` / `fallback` — they fall through to `message` immediately, with no overhead. So `formatErrors` works on third-party validators too; passing `t` only changes behavior for Pyreon-emitted issues.

### Per-field error map

For `@pyreon/form`'s `Errors` shape (`Partial<Record<fieldName, string>>`), use `formatErrorsByPath`:

```ts
import { formatErrorsByPath } from '@pyreon/validate'

const errorMap = formatErrorsByPath(result.issues ?? [], t)
// → { email: 'Invalid email', password: 'Too short', ... }

// Concatenate colliding paths instead of "first wins":
formatErrorsByPath(issues, t, { joinWith: '; ' })
// → { email: 'invalid; required' }
```

The path is the issue's path segments joined with `.`. Path-less issues land under the empty-string key (a form-level error). On collision the **first** issue wins, unless you pass `joinWith`.

## Binding to a form

`toFormValidator(schema, t?)` adapts any `@pyreon/validate` schema into the `(values) => Record<field, errorMessage>` function `@pyreon/form` expects as its `schema` option. It runs `schema.safeParse`, maps each issue's path to a per-field error via `formatErrorsByPath` (so i18n keys resolve through `t`), and returns `{}` on success.

```ts
import { useForm, field } from '@pyreon/form'
import { s } from '@pyreon/validate'
import { toFormValidator } from '@pyreon/validate'
import { useI18n } from '@pyreon/i18n'

const { t } = useI18n()

const schema = s.object({
  email: s.string().email(),
  age: s.number().int().min(18),
})

const form = useForm({
  fields: [field('email', ''), field('age', 0)],
  schema: toFormValidator(schema, t),
  onSubmit: (values) => save(values),
})
```

`toFormValidator` is designed for a **flat** object schema whose field names match the form's fields — each issue path is a single segment that becomes the field key. Nested schemas produce dotted keys (`user.email`) which won't match a flat form field; use a flat schema (or `@pyreon/form` field arrays) for form binding.

### Coexisting with `@pyreon/validation` adapters

If you're already using `@pyreon/validation`'s per-library adapters, nothing changes — they stay supported:

```ts
import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

const form = useForm({
  initialValues: { email: '' },
  schema: zodSchema(z.object({ email: z.string().email() })),
  onSubmit: (v) => save(v),
})
```

`@pyreon/validation` ships `zodSchema` / `valibotSchema` / `arktypeSchema` (plus the per-field `zodField` / `valibotField` / `arktypeField`). `@pyreon/validate`'s `withField` works on top of any of them — wrap individual fields with metadata before composing into the form schema. See [`@pyreon/validation`](/docs/validation) for the per-library adapter details.

---

## Part 2 — the `s` validator

Pyreon's own validator runtime is opt-in by import. It implements Standard Schema natively, so the DX helpers above work on `s` schemas with no adapter.

## Defining a schema

```ts
import { s } from '@pyreon/validate'

const userSchema = s.object({
  name: s.string().min(2),
  email: s.string().email(),
  age: s.number().int().between(0, 150),
  role: s.enum(['admin', 'user']),
  tags: s.array(s.string()).max(10),
})

const result = userSchema.parse(input)
if (result.ok) {
  console.log(result.value) // fully typed { name, email, age, role, tags }
} else {
  console.log(result.issues) // ordered list of parse problems
}
```

`s.object({ … })` infers its output type from the field schemas — `result.value` is `{ name: string; email: string; age: number; role: 'admin' | 'user'; tags: string[] }` with no manual annotations. `.optional()` / `.nullish()` fields become optional keys.

### Chainable _or_ function-composition

The same schemas, two ergonomic surfaces. Use whichever reads better:

```ts
import { s, pipe, string } from '@pyreon/validate'

// Chainable (the `s.` namespace, mirrors Zod's `z.`):
const a = s.string().email().min(3)

// Function composition via pipe():
const b = pipe(
  string(),
  (s) => s.email(),
  (s) => s.min(3),
)
```

The chainable path is cheap: each schema's ops compile to **one closure on first parse**, so chaining doesn't pay method-dispatch cost per parse.

### Tree-shaking — keep chaining, let the compiler do it

The chainable `s.` API is the most ergonomic, but it **can't tree-shake its checks**: `s.string()` returns a class whose prototype carries every string-format method (`.email()`, `.url()`, `.uuid()`, …), so the bundle pulls all 17 format regexes whether you use them or not. Chaining fundamentally requires the methods to exist on the object — so instead of making you switch to a second, more verbose API (the Zod-vs-`zod/mini` split), Pyreon makes **the compiler produce the tree-shakeable output**.

Opt in once:

```ts
// vite.config.ts
import { pyreon } from '@pyreon/vite-plugin'
export default { plugins: [pyreon({ optimizeValidators: true })] }
```

…and **keep writing the beautiful chainable API**:

```ts
import { s } from '@pyreon/validate'

export const User = s.object({
  name: s.string().min(2),
  email: s.string().email(),
  age: s.number().int().min(0),
})
```

At build time the compiler rewrites each statically-analyzable module-level `const X = s.<chain>` into a lean, function-composition form that imports only the constructors + actions it uses — so the bundler prunes everything else. The rewrite is **verdict-for-verdict identical** to the runtime (parity-locked end to end). Measured against the published bundle with Vite/Rollup, a 3-field schema drops **~11 KB → ~6.5 KB gzipped (−41%)** with no source change on your side. Conservative + safe: a dynamically-built schema (inside a function, conditionally, or with a non-literal argument) or a `.tsx` schema simply stays the full runtime — correct, just not pruned.

Under the hood the rewrite targets **`@pyreon/validate/mini`** — lean base constructors plus standalone check **actions** (`minLength` / `email` / `minValue` / `integer` / …). That's the compiler's emit target rather than the headline API, but it's importable directly as an escape hatch for dynamically-built schemas or non-Vite bundlers. Both `.check()` (reads like chaining) and point-free `pipe()` are supported, and mini schemas are **Standard Schema-native** + byte-identical to the chainable form:

```ts
import { object, string, minLength, email, pipe } from '@pyreon/validate/mini'
const User = object({ name: string().check(minLength(2)), email: string().check(email()) })
const name = pipe(string(), minLength(2))
```

## Primitives

Every primitive is available both as a `s.` member and as a standalone named export.

| Constructor | Output type | Notes |
| --- | --- | --- |
| `s.string()` | `string` | Length + format + substring + transform checks (see below). |
| `s.number()` | `number` | Rejects `NaN`. Bounds + integer + multiple-of checks. |
| `s.boolean()` | `boolean` | Atomic — type guard only. |
| `s.bigint()` | `bigint` | `typeof === 'bigint'` (no coercion). Bounds + multiple-of. |
| `s.date()` | `Date` | Real `Date` instances only; rejects `new Date('nonsense')`. `.min`/`.max`. |
| `s.literal(value)` | the literal | Matches one `string \| number \| boolean` literal via `===`. |
| `s.enum([...])` | union of values | A small set of `string \| number` literals. |
| `s.nativeEnum(Enum)` | `E[keyof E]` | A VALUE of a TS native `enum` / const value-object (filters reverse-mappings). |
| `s.symbol()` | `symbol` | `typeof === 'symbol'`. |
| `s.nan()` | `number` | Accepts only `NaN`. |
| `s.null()` | `null` | Accepts only `null`. |
| `s.undefined()` | `undefined` | Accepts only `undefined`. |
| `s.void()` | `void` | Accepts only `undefined`. |
| `s.any()` | `any` | Escape hatch — no validation. |
| `s.unknown()` | `unknown` | Like `any` but keeps the output opaque. |
| `s.never()` | `never` | Accepts NO value — every input errors. |
| `s.custom<T>(check?, msg?)` | `T` | Validated by a user predicate; with no predicate, a pure type assertion. |
| `s.instanceof(Ctor, msg?)` | instance type | Asserts `input instanceof Ctor` — `s.instanceof(File)`, `s.instanceof(URL)`, … |
| `s.stringbool(opts?)` | `boolean` | Coerce a boolean-ish **string** to a real boolean. |

```ts
import { s } from '@pyreon/validate'

s.literal('active').parse('active')        // → { ok: true, value: 'active' }
s.enum(['red', 'green', 'blue'])           // Schema<'red' | 'green' | 'blue'>

enum Role { Admin = 'admin', User = 'user' }
s.nativeEnum(Role).parse('admin')          // → { ok: true, value: 'admin' }

s.instanceof(File)                          // validate an uploaded File
s.custom<`${number}px`>((v) => typeof v === 'string' && v.endsWith('px'))

s.stringbool().parse('yes')                 // → { ok: true, value: true }
s.stringbool({ truthy: ['si'], falsy: ['no'] })
```

`s.stringbool()` accepts only strings and only the configured tokens (defaults: `true`/`1`/`yes`/`on`/`y`/`enabled` ↔ `false`/`0`/`no`/`off`/`n`/`disabled`, case-insensitive + trimmed). It's stricter than `s.coerce.boolean()`, which applies JS truthiness to any input.

:::warning[`s.nativeEnum` only accepts member VALUES]
A numeric TS `enum { A }` compiles to `{ A: 0, 0: 'A' }`. `s.nativeEnum` filters out the auto-generated reverse-mapping, so `'A'` is **not** accepted — only `0` is. For a plain literal array, use `s.enum([...])` instead.
:::

## String checks

`s.string()` ships a deep set of checks. Each appends an op and returns `this`, so they chain.

### Length & substring

| Method | Validates |
| --- | --- |
| `.min(n)` / `.max(n)` / `.length(n)` | string length ≥ / ≤ / exactly `n` |
| `.nonEmpty()` | length ≥ 1 (alias for `.min(1)`) |
| `.startsWith(s)` / `.endsWith(s)` / `.includes(s)` | substring constraints |
| `.regex(re)` | matches a custom `RegExp` |

### Format checks

| Method | Validates |
| --- | --- |
| `.email(opts?)` | email; precision tiers `'html5'` / `'standard'` (default) / `'rfc5322'` |
| `.url()` | `http(s)://…` |
| `.uuid()` | UUID v1–v5 |
| `.ip()` | IPv4 or IPv6 |
| `.cidr()` | CIDR notation (`x.x.x.x/0-32` or `…/0-128`) |
| `.phone()` | normalized E.164 shape (client/server-split — see below) |
| `.e164()` | strict E.164 (`+` then 1–15 digits, first non-zero) |
| `.creditCard()` | 12–19 digits + Luhn checksum |
| `.cuid()` / `.cuid2()` | CUID v1 / CUID2 |
| `.ulid()` | ULID (Crockford base32, 26 chars) |
| `.nanoid()` | Nano ID (`A-Za-z0-9_-`) |
| `.emoji()` | one or more emoji code points |
| `.base64()` / `.base64url()` | standard / URL-safe base64 |
| `.jwt()` | three base64url segments (`header.payload.signature`) |
| `.duration()` | ISO 8601 duration (`P3Y6M4DT12H30M5S`, `PT1H`, …) |
| `.iso.date()` / `.iso.dateTime()` / `.iso.time()` | ISO 8601 date / date-time / time |

```ts
import { s } from '@pyreon/validate'

s.string().cuid2().parse('tz4a98xxat96iws9zmbrgj3a') // ok
s.string().ulid()                                     // 01ARZ3NDEKTSV4RRFFQ69G5FAV
s.string().base64().min(4)                            // composes with length checks
s.string().email({ precision: 'rfc5322' })            // server-grade strictness
```

### String transforms

These run after the type-check, before further checks:

```ts
s.string().trim().min(2)        // trim first, then enforce length
s.string().toLowerCase()
s.string().toUpperCase()
```

### Custom messages & i18n keys

Every check accepts an optional `CheckOpts` carrying `{ message, code, key, params, fallback }` — the i18n routing the `format*` helpers resolve:

```ts
s.string().min(8, {
  message: 'Password too short',
  key: 'auth.password.too-short',
  params: { min: 8 },
})
```

## Number, bigint & date checks

`s.number()` checks (rejects `NaN` at the type level):

| Method | Validates |
| --- | --- |
| `.min(n)` / `.gte(n)` | ≥ `n` (inclusive) |
| `.max(n)` / `.lte(n)` | ≤ `n` (inclusive) |
| `.gt(n)` / `.lt(n)` | strictly > / < `n` (exclusive) |
| `.between(lo, hi)` | inclusive range |
| `.int()` | integer |
| `.finite()` | finite (rejects `±Infinity`) |
| `.positive()` / `.negative()` | > 0 / < 0 |
| `.nonNegative()` / `.nonPositive()` | ≥ 0 / ≤ 0 |
| `.multipleOf(n)` / `.step(n)` | divisible by `n` |
| `.safe()` | within the IEEE-754 safe-integer **range** (a bounds check, not integer-ness) |

`s.bigint()` has the parallel surface: `.min` / `.max` / `.gt` / `.gte` / `.lt` / `.lte` / `.between` / `.positive` / `.negative` / `.multipleOf` / `.step` (all `bigint` arguments).

`s.date()` accepts only valid `Date` instances and bounds the instant with `.min(date)` / `.max(date)` (inclusive).

```ts
s.number().int().between(0, 150)
s.number().multipleOf(0.5)
s.bigint().positive().max(1_000_000n)
s.date().min(new Date('2020-01-01'))
```

## Composition

| Constructor | Output | Element checks |
| --- | --- | --- |
| `s.object({ … })` | inferred object | unknown-key policy + object algebra (below) |
| `s.array(el)` | `T[]` | `.min` / `.max` / `.length` / `.nonEmpty` |
| `s.tuple([a, b])` | `[A, B]` | `.rest(schema)` for a variadic tail |
| `s.record(value)` / `s.record(key, value)` | `Record<K, V>` | validates each own key's value (and key, if given) |
| `s.map(key, value)` | `Map<K, V>` | `.min` / `.max` / `.size` |
| `s.set(value)` | `Set<V>` | `.min` / `.max` / `.size` / `.nonEmpty` |
| `s.union(a, b, …)` | `A \| B \| …` | first matching member wins |
| `s.discriminatedUnion('kind', [...])` | object union | O(1) dispatch on a shared literal discriminant |
| `s.intersection(a, b)` | `A & B` | both must pass; object outputs shallow-merged |
| `s.lazy(() => schema)` | `T` | recursive / self-referential schemas |

```ts
import { s } from '@pyreon/validate'

// Discriminated union — fast, precise errors.
const event = s.discriminatedUnion('type', [
  s.object({ type: s.literal('click'), x: s.number(), y: s.number() }),
  s.object({ type: s.literal('key'), code: s.string() }),
])

// Recursive type via lazy() — annotate the type explicitly.
type Tree = { value: number; children: Tree[] }
const tree: import('@pyreon/validate').Schema<Tree> = s.lazy(() =>
  s.object({ value: s.number(), children: s.array(tree) }),
)
```

Schemas also carry composition shortcuts as chainable methods:

```ts
s.string().array()           // ≡ s.array(s.string())
s.string().or(s.number())    // ≡ s.union(s.string(), s.number())  → string | number
objA.and(objB)               // ≡ s.intersection(objA, objB)        → A & B
s.string().transform(Number).pipe(s.number().positive())  // coerce → validate
```

:::warning[Composition methods need the constructors imported]
`.array()` / `.or()` / `.and()` rely on the composition factories registering themselves. Import `s` (or `array` / `union` / `intersection`) from `@pyreon/validate` so they register — a bare `import { string }` that never references composition will throw a clear `[Pyreon]` error when you call `.array()`.
:::

## Object algebra

`s.object(...)` exposes the full Zod-style algebra. Each returns a **new** schema (immutable):

| Method | Effect |
| --- | --- |
| `.pick([keys])` | keep only the named keys |
| `.omit([keys])` | drop the named keys |
| `.partial()` | make every field optional |
| `.required()` | inverse of `.partial()` — unwrap `.optional()`/`.nullish()` back to required |
| `.extend({ … })` | add / override fields |
| `.merge(other)` | merge another object schema's shape (other wins on conflict) |
| `.keyof()` | an `enum` schema over this object's keys |

Plus the unknown-key policy:

| Method | Behavior |
| --- | --- |
| `.strip()` | **default** — unknown keys are dropped from the output |
| `.strict()` | unknown keys are a validation error |
| `.passthrough()` | unknown keys are kept verbatim |
| `.catchall(schema)` | validate every unknown key against `schema` and keep it (takes precedence) |

```ts
const base = s.object({ id: s.string(), name: s.string(), secret: s.string() })

base.pick(['id', 'name'])              // { id, name }
base.omit(['secret'])                  // { id, name }
base.partial()                         // { id?, name?, secret? }
base.extend({ active: s.boolean() })   // adds `active`
base.strict()                          // reject unknown keys
base.catchall(s.string())              // unknown keys must be strings
```

## Coercion

`s.coerce.*` coerces the input via the JS constructor **before** the type-check, then runs the normal primitive validation on the coerced value. Each coerced schema inherits its base primitive's full check surface.

```ts
import { s } from '@pyreon/validate'

s.coerce.number().int().min(0).parse('42')  // '42' → 42 → ok
s.coerce.string().parse(123)                 // 123 → '123'
s.coerce.boolean().parse(1)                   // 1 → true (JS truthiness)
s.coerce.date().parse('2024-01-01')          // → a Date
s.coerce.bigint().parse('100')               // → 100n
```

For string-to-boolean with explicit token mapping (stricter than JS truthiness), prefer `s.stringbool()`.

`s.preprocess(fn, schema)` is the general form — transform the raw input before `schema` validates it:

```ts
s.preprocess((v) => String(v).trim(), s.string().min(1))
```

## Modifiers

| Modifier | Effect |
| --- | --- |
| `.optional()` | input may be `undefined`; output `T \| undefined` |
| `.nullable()` | input may be `null`; output `T \| null` |
| `.nullish()` | input may be `null` or `undefined` |
| `.nonoptional(msg?)` | re-require a present value (rejects `undefined` again) |
| `.default(value)` | fill `undefined` input with a value (or `() => value`) |
| `.transform(fn)` | map the parsed value to a new shape (sync or async) |
| `.refine(fn, opts)` | add a custom constraint after type + checks |
| `.superRefine(fn)` | add **any number** of issues via `ctx.addIssue` (cross-field) |
| `.brand<'T'>()` | phantom type brand — prevent mixing structurally-identical values |
| `.describe(text)` / `.field(meta)` | attach description / full `FieldMeta` (read via `getMeta`) |

```ts
s.string().optional().default('anon')
s.string().transform((s) => s.trim())
s.string().refine((s) => s.length > 0, { message: 'Required', key: 'common.required' })

// Cross-field validation that reports multiple problems:
s.object({ pw: s.string(), confirm: s.string() }).superRefine((v, ctx) => {
  if (v.pw !== v.confirm) ctx.addIssue({ message: 'Mismatch', path: ['confirm'] })
})

// Phantom brand — UserId and PostId are both `string` but not interchangeable:
const UserId = s.string().brand<'UserId'>()
```

`.field(meta)` is the chainable equivalent of the standalone `withField` — both write the same Symbol-keyed slot, so `getMeta` reads either.

## Resilient parsing & readonly

### `.catch(fallback)`

On parse **failure**, discard the issues this schema produced and substitute a fallback instead of erroring — for config defaults, lenient inputs, and "never throw" boundaries.

```ts
import { s } from '@pyreon/validate'

s.number().catch(0).parse('nope')          // → { ok: true, value: 0 }
s.string().min(3).catch('x').parse('ab')   // → { ok: true, value: 'x' }

// The fallback can be derived from the raw input:
s.string().catch((input) => String(input)).parse(42) // → { ok: true, value: '42' }
```

- **Terminal regardless of chain position** — `.min(3).catch('x')` and `.catch('x').min(3)` behave identically; `catch` always gates the final result.
- **Scoped per-schema** — a caught field failure is substituted while a sibling's failure still fails the object:

```ts
const schema = s.object({
  name: s.string(),         // no catch
  age: s.number().catch(0), // caught
})
schema.parse({ name: 'Ada', age: 'x' })  // → { ok: true, value: { name: 'Ada', age: 0 } }
schema.parse({ name: 123,   age: 'x' })  // → { ok: false } (name failed; age was caught)
```

- **Async-aware** — under `parseAsync`, a failing async `.refine` / `.serverCheck` is caught after the Promise settles.

### `.readonly()`

Freeze the parsed output (`Object.freeze`, shallow) and mark it `Readonly<T>` at the type level. Apply last in a chain.

```ts
const cfg = s.object({ port: s.number() }).readonly()
const r = cfg.parse({ port: 80 })
// r.value is Readonly<{ port: number }> and Object.isFrozen(r.value) === true
// (r.value as { port: number }).port = 1  // throws in strict mode
```

## Parse API

Every `s` schema exposes the same parse surface:

| Method | Returns | Notes |
| --- | --- | --- |
| `.parse(input)` | `Result<T>` | Never throws — a discriminated union (`{ ok: true, value }` \| `{ ok: false, issues }`). |
| `.safeParse(input)` | `Result<T>` | Zod-compat alias for `.parse`. |
| `.parseOrThrow(input)` | `T` | Returns the value, or throws a `ValidationError` with the issues attached. |
| `.parseAsync(input, { context? })` | `Promise<Result<T>>` | For schemas with async `.refine` / `.transform` / `.serverCheck`. Threads `context` to server checks. |
| `.is(input)` | `boolean` | Pure validity check (sync only — async schemas return `false`). |
| `['~standard']` | StdSchema contract | Drops into any Standard Schema consumer with no adapter. |

```ts
const r = userSchema.parse(input)
if (r.ok) use(r.value)
else show(r.issues)

if (userSchema.is(req.body)) handle(req.body) // boolean fast path
```

A successful `Result` may also carry `pending` — the deferred server checks recorded on the client (see below).

## Client / server validation

One shared schema, a thin client and a heavy server — without shipping the heavy code to the browser. This is the part of the design no other validator gives you out of the box.

### Format upgrade (automatic)

The lightweight in-bundle format validators (`s.string().email()`, `.phone()`) are upgraded to strict server validators the instant the server imports `@pyreon/validate/server` — strict RFC-5322 email + a disposable-domain blocklist, full E.164 phone. The heavy code is unreachable from the main entry, so it tree-shakes out of the client bundle.

```ts
// server entry only (side-effect import):
import '@pyreon/validate/server'
// …now every s.string().email() / .phone() validates strictly here,
// while the client keeps the small, fast in-bundle defaults.
```

`@pyreon/validate/server` also exports `addDisposableDomains(domains)`, `isDisposableEmail(email)`, `strictEmail(value)`, `strictPhone(value)`, and `installServerValidators()` for explicit / test-controlled setup.

Any format routes through a registry seam, so you can swap in a stricter validator for **any** format in place:

```ts
import { installFormatValidator } from '@pyreon/validate'

// e.g. tighten ULID validation server-side — every s.string().ulid() now uses it:
installFormatValidator('ulid', (value) => myStrictUlidCheck(value))
```

### `.serverCheck(key)` — the async / privileged tier

For checks that can only run server-side — unique-email, breach-check, DNS-MX, cross-field DB lookups. On the **client** it's a no-op: the value passes and the deferred check is recorded on `Result.pending` (so the UX can show a "checking…" affordance). On the **server**, the validator registered via `registerServerCheck(key, fn)` runs — sync or async.

```ts
// shared schema (client + server)
import { s } from '@pyreon/validate'

const signup = s.object({
  email: s.string().email().serverCheck('email-unique', { message: 'Email already taken' }),
})

// CLIENT — cheap checks run; serverCheck deferred:
const r = signup.parse(formData)
if (r.ok && r.pending?.length) showChecking() // 'email-unique' is pending

// SERVER-only module — register the heavy implementation:
import { registerServerCheck } from '@pyreon/validate/server'

registerServerCheck('email-unique', async (value, ctx) => {
  const db = (ctx as { db: Db }).db
  return !(await db.user.existsByEmail(value as string))
})

// SERVER — run the async checks, threading a context (DB handle / request):
const verdict = await signup.parseAsync(formData, { context: { db } })
```

:::danger[The server is authoritative]
On the client, `.serverCheck` ALWAYS passes — the entry is recorded on `Result.pending`, not validated. Never treat a client `{ ok: true, pending: [...] }` as fully verified; the server's `parseAsync` is the real verdict.
:::

- A registered **async** check promotes the parse to a Promise, so `parse()` returns a `parseAsync`-directing issue — use `parseAsync(input, { context })` server-side.
- The issue `path` is snapshotted at the check site, so a field / array-element check reports the correct path even though it resolves after the path unwinds.
- `serverCheck` fields JIT-compile like everything else — the JIT defers async-resolving subtrees onto a pending list its root return awaits, so carrying server checks costs no performance.

## JSON Schema emit

`toJsonSchema(schema)` — from the **`@pyreon/validate/json-schema`** subpath — emits a JSON Schema **draft 2020-12** document from any `s` schema: for OpenAPI specs, AI structured-output constraints, editor autocomplete, or cross-language contracts. The subpath keeps the emitter out of validators-only bundles.

```ts
import { s } from '@pyreon/validate'
import { toJsonSchema } from '@pyreon/validate/json-schema'

const User = s.object({
  name: s.string().min(2),
  email: s.string().email(),
  age: s.number().int().min(0).optional(),
})

toJsonSchema(User)
// {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   type: 'object',
//   properties: {
//     name: { type: 'string', minLength: 2 },
//     email: { type: 'string', format: 'email' },
//     age: { type: 'integer', minimum: 0 },
//   },
//   required: ['name', 'email'],
// }
```

The mapping: string formats → standard `format` keywords (`email` / `uri` / `uuid` / `date` / `date-time` / `time` / `duration`); `regex` / `startsWith` / `endsWith` / `includes` → `pattern`; `.int()` upgrades to `type: 'integer'`; unions → `anyOf`, intersections → `allOf`, tuples → `prefixItems`; `.strict()` → `additionalProperties: false`, `.catchall(s)` → `additionalProperties: <schema>`; `.optional()` / `.nullish()` / `.default()` fields drop out of `required`; `.describe()` → `description`, `.default()` → `default`.

:::warning[The contract, precisely]
The document describes the **input shape** — `.transform()` emits its inner schema, `.pipe()` its source, `s.preprocess()` its target; `.refine()` / `.superRefine()` / `.serverCheck()` are runtime-only predicates and are structurally omitted. Unrepresentable kinds (`s.date()`, `s.bigint()`, `s.map()`, `s.undefined()`, …) **throw** a `[Pyreon]`-prefixed error by default — pass `{ unrepresentable: 'any' }` to emit `{}` in their place. Cyclic `s.lazy()` schemas throw (no `$defs`/`$ref` graph in v1 — documented scope).
:::

## Performance

The `s` runtime is benchmarked against Zod 4 / Valibot 1 / ArkType 2 (`bun bench:validation`). The harness is built for objectivity: every scenario × path × library cell runs in fresh isolated processes (3 pooled per cell, so the confidence interval covers process-level jitter), a cross-library correctness gate runs before any timing, and each row carries a seeded bootstrap 95% CI — rows inside the winner's CI are marked 🤝 tied. One honest limit is structural: the bench is written and judged by the Pyreon authors (disclosed in its header); every scenario, input, and competitor call form is in the one file for review.

- **Fastest on the error / invalid path** across every shape — **33–44× vs Zod, 20–53× vs ArkType, 1.4–3.6× vs Valibot** — because it early-exits on the first failing op while Zod and ArkType allocate rich structured error objects. Error-information parity is verified separately: on a multi-fail object Pyreon reports the same issue count with paths and messages as Zod, so the error-path speed is not "reporting less".
- **Valid-parse path** — **wins the array shapes outright (1.9–2.3× vs ArkType)**, statistically tied 🤝 on scalar-email, number-range, and deep-nested objects, and trails only on flat-object parse (~1.2×). **Faster than Zod and Valibot on every shape.** The chainable API doesn't pay class-overhead per parse: each schema's ops compile to one closure on first call, and pure object/array/primitive trees get a flat monomorphic JIT validator with static-path elision (`ctx.path` is untouched on the valid path; full issue paths are reconstructed only at failure sites) and an equivalence-locked table-driven email scanner on the hot `email()` tier.

The one row ArkType still leads — flat-object valid-parse — is a **semantic difference, not a codegen gap**: ArkType returns the INPUT object by reference, while Pyreon (like Zod and Valibot) returns an immutable clone with unknown keys stripped. Keeping strip-and-clone semantics is deliberate; the ~7ns/parse it costs on a 4-field object is the documented trade. For hot boolean-verdict loops, `pyreon({ compileValidators: true })` attaches build-emitted monomorphic `.is()` verdicts (1.6–3× on that call form). You can also keep using Zod / Valibot / ArkType through the DX helpers — `@pyreon/validate` never locks you in.

## See also

- [Standard Schema spec](https://standardschema.dev) — the cross-library protocol this package builds on.
- [`@pyreon/validation`](/docs/validation) — per-library adapters (`zodSchema` / `valibotSchema` / `arktypeSchema`).
- [`@pyreon/form`](/docs/form) — signal-based forms (consumes `toFormValidator` output).
- [`@pyreon/i18n`](/docs/i18n) — the translation provider behind `formatErrors`.

## API reference

### DX helpers (any Standard Schema validator)

| Export | Signature | Description |
| --- | --- | --- |
| `withField` | `(schema: S, meta: FieldMeta) => S` | Attach field metadata to any Standard Schema. Returns the **same reference** (mutates a Symbol slot); re-wrapping merges. |
| `getMeta` | `(schema: S) => FieldMeta \| undefined` | Read the attached metadata (or `undefined`). Accepts objects **and** callable schemas (ArkType). |
| `resolveMetaField` | `(schema, field: 'label' \| 'hint' \| 'placeholder', t?) => string \| undefined` | Read one field through optional i18n; falls back to the literal. |
| `parseReactive` | `(schema, source) => Computed<ParseResult>` | Re-validate on every source (`Signal` or accessor) change. Sync only. |
| `parseReactiveAsync` | `(schema, source) => Computed<Promise<ParseResult>>` | Async variant; caller handles staleness (e.g. via `watch`). |
| `watchValid` | `(schema, source, cb) => () => void` | Fire `cb(valid)` only on validity flips; returns an unsubscribe. |
| `formatError` | `(issue, t?) => string` | Resolve one issue: `key`+`t` → `fallback` → `message`. |
| `formatErrors` | `(issues, t?) => string[]` | Resolve an array of issues (original order preserved). |
| `formatErrorsByPath` | `(issues, t?, { joinWith? }?) => Record<string, string>` | Per-field error map keyed by dotted path (for `@pyreon/form`). |
| `toFormValidator` | `(schema, t?) => (values) => Record<string, string>` | Adapt an `s` schema into a `@pyreon/form` `schema` validator. |
| `installFormatValidator` | `(name, fn) => void` | Swap a superior validator for a named format (the client/server seam). |

Types: `FieldMeta`, `Input<S>`, `Output<S>`, `ParseResult`, `ReactiveSource`, `PyreonIssue`, `StandardSchemaIssue`, `StandardSchemaResult`, `StandardSchemaV1`, `TFn`, `WithFieldMeta`.

### `s` validator runtime

| Group | Surface |
| --- | --- |
| **Namespace** | `s.{string, number, boolean, bigint, date, literal, enum, nativeEnum, symbol, nan, null, undefined, void, any, unknown, never, custom, instanceof, object, array, union, discriminatedUnion, record, tuple, map, set, intersection, lazy, coerce, preprocess, stringbool}` |
| **Standalone** | every constructor above is also a named export (`string`, `object`, …); reserved words use a `_` suffix (`null_`, `undefined_`, `void_`, `enum_`, `instanceof_`) |
| **Function comp** | `pipe(schema, ...actions)` — apply chain-method steps as functions |
| **Coercion** | `s.coerce.{string, number, boolean, date, bigint}` |
| **Parse API** | `.parse` · `.safeParse` · `.parseOrThrow` · `.parseAsync(input, { context? })` · `.is` · `['~standard']` |
| **Modifiers** | `.optional` · `.nullable` · `.nullish` · `.nonoptional` · `.default` · `.transform` · `.refine` · `.superRefine` · `.brand` · `.describe` · `.field` · `.catch` · `.readonly` · `.serverCheck` |
| **Composition methods** | `.array` · `.or` · `.and` · `.pipe` |
| **String checks** | `.min` · `.max` · `.length` · `.nonEmpty` · `.regex` · `.startsWith` · `.endsWith` · `.includes` · `.email` · `.url` · `.uuid` · `.ip` · `.cidr` · `.phone` · `.e164` · `.creditCard` · `.cuid` · `.cuid2` · `.ulid` · `.nanoid` · `.emoji` · `.base64` · `.base64url` · `.jwt` · `.duration` · `.iso.date` · `.iso.dateTime` · `.iso.time` · `.trim` · `.toLowerCase` · `.toUpperCase` |
| **Number checks** | `.min` · `.max` · `.gt` · `.gte` · `.lt` · `.lte` · `.between` · `.int` · `.finite` · `.positive` · `.negative` · `.nonNegative` · `.nonPositive` · `.multipleOf` · `.step` · `.safe` |
| **BigInt checks** | `.min` · `.max` · `.gt` · `.gte` · `.lt` · `.lte` · `.between` · `.positive` · `.negative` · `.multipleOf` · `.step` |
| **Date checks** | `.min(date)` · `.max(date)` |
| **Array checks** | `.min` · `.max` · `.length` · `.nonEmpty` |
| **Map/Set checks** | `.min` · `.max` · `.size` (Set also `.nonEmpty`) |
| **Object algebra** | `.pick` · `.omit` · `.partial` · `.required` · `.extend` · `.merge` · `.keyof` · `.strip` · `.strict` · `.passthrough` · `.catchall` |
| **Tuple** | `.rest(schema)` for a variadic tail |
| **Types** | `Infer<S>` · `Input<S>` · `Output<S>` · `Result<T>` · `Schema<T>` · `SuperRefineCtx` · `PyreonIssue` · `ValidationError` · `PendingCheck` |

### Server entry (`@pyreon/validate/server`)

| Export | Description |
| --- | --- |
| `registerServerCheck(key, fn)` | Register the heavy/privileged half of a `.serverCheck(key)` (never ships to the client). |
| `addDisposableDomains(domains)` | Extend the disposable-email blocklist. |
| `isDisposableEmail(email)` / `strictEmail(value)` / `strictPhone(value)` | The strict server validators. |
| `installServerValidators()` | Explicitly install the strict email + phone validators (runs automatically on import). |
