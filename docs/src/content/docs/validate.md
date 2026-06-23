---
title: 'Validate — Standard Schema DX overlay'
---

# `@pyreon/validate`

Pyreon's validator + DX layer on top of [Standard Schema](https://standardschema.dev) — the cross-library protocol implemented natively by **Zod 3.24+**, **Valibot 1.0+**, **ArkType 2.0+**, and any future spec-compliant validator.

**Two ways to use it:**

1. **DX helpers on top of your validator of choice** — `withField`, `parseReactive`, `formatErrors` work on ANY Standard Schema. Pyreon's own validator runtime tree-shakes away entirely when you don't import it (a DX-helpers-only import is ~0.5KB gz, measured).
2. **Pyreon's own `s` validator** (since v1) — chainable + function-comp hybrid (`s.string().email()` / `pipe(string(), email())`), Standard Schema-native, ~3.5KB gz. No third-party validator needed.

```bash
bun add @pyreon/validate

# Option 1 — pair the DX helpers with a validator of choice:
bun add zod        # or
bun add valibot    # or
bun add arktype

# Option 2 — use Pyreon's own validator (no extra dep):
#   import { s } from '@pyreon/validate'
```

## Why this exists

Standard Schema is parse-only — the protocol authors deliberately excluded a metadata channel. Pyreon's `@pyreon/form` and `@pyreon/feature` need:

1. **Field metadata** (label, hint, placeholder, i18n keys) bound to the schema, not duplicated in form props.
2. **Reactive parse** — re-validate as the user types, with the result usable in JSX and effects.
3. **i18n-aware errors** — error messages as translation keys, resolved via the project's `useI18n()` `t` function.

`@pyreon/validate` is the layer that adds those three things on any Standard Schema validator.

## Quick start

```ts
import { z } from 'zod'
import { signal } from '@pyreon/reactivity'
import { useI18n } from '@pyreon/i18n'
import { withField, parseReactive, formatErrors, watchValid } from '@pyreon/validate'

// 1. Attach field metadata.
const emailSchema = withField(z.string().email(), {
  label: 'Email address',
  placeholder: 'you@example.com',
  hint: 'We never share your email',
  i18nLabel: 'auth.email.label',
  i18nHint: 'auth.email.hint',
  autoComplete: 'email',
})

// emailSchema is still a Zod schema — `.parse()`, `.optional()`, etc. all work.

// 2. Reactively validate.
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
// → strings resolved via t('auth.email.required', { ... }), falling back to issue.fallback or issue.message

// 4. Watch validity flips (no fire on every error change).
const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})
```

## Field metadata

`withField(schema, meta)` attaches Pyreon metadata to any Standard Schema validator. The returned schema is the **same reference** — Pyreon mutates a Symbol-keyed non-enumerable slot.

### Available metadata

| Field | Type | Use |
| --- | --- | --- |
| `label` | `string` | Human-readable form label. |
| `hint` | `string` | Short helper text under the input. |
| `placeholder` | `string` | Input placeholder. |
| `defaultValue` | `unknown` | Initial value for `useForm`. |
| `autoFocus` | `boolean` | Whether the input should auto-focus on mount. |
| `autoComplete` | `string` | HTML autocomplete token (`'email'`, `'new-password'`, `'off'`, …). |
| `i18nLabel` | `string` | i18n key — wins over `label` when `t` resolves. |
| `i18nHint` | `string` | i18n key for `hint`. |
| `i18nPlaceholder` | `string` | i18n key for `placeholder`. |

### Reading metadata

```ts
import { getMeta, resolveMetaField } from '@pyreon/validate'

// Direct read — returns FieldMeta | undefined.
const meta = getMeta(emailSchema)
const label = meta?.label ?? 'Email'

// i18n-aware read — prefers t() resolution.
const { t } = useI18n()
const i18nLabel = resolveMetaField(emailSchema, 'label', t)
// → t('auth.email.label') when set + resolved, else meta.label, else undefined
```

### Why mutation, not cloning?

`withField` mutates the original schema rather than cloning it. **This is intentional**:

- ArkType's `Type` instances are callable functions whose `~standard.validate` does `this(input)` — `this` must be the callable schema itself. A shallow `Object.create()` clone is not callable and breaks that contract.
- Symbol-keyed non-enumerable mutation is invisible to `JSON.stringify`, `for…in`, `Object.keys`, structured clone, and library-internal schema comparators.
- Re-wrapping is the natural extension: `withField(base, { a })` then `withField(base, { b })` produces a schema with both `a` and `b` automatically.

If you need isolated copies of the same shape, construct two separate schemas (`z.string().email()` twice) and wrap each.

## Reactive parse

`parseReactive(schema, source)` returns a `Computed<ParseResult>` that re-validates on every source change. The source can be a `Signal<T>` or a plain `() => T` accessor.

```ts
const $email = signal('')
const $result = parseReactive(emailSchema, $email)

effect(() => {
  const r = $result()
  if (r.issues) {
    showErrors(r.issues)
  } else {
    submitForm(r.value)
  }
})
```

### Async validators

For schemas with async refinements (Zod `.refine(async)`, Valibot async pipe), use `parseReactiveAsync`:

```ts
const schema = z.string().refine(async (s) => await checkUnique(s))
const $result = parseReactiveAsync(schema, $username)

watch($result, async (current) => {
  const r = await current
  showFeedback(r)
})
```

`watch` naturally drops stale frames — rapid input changes won't deliver out-of-order results.

### Validity watcher

`watchValid(schema, source, callback)` fires only on **validity transitions** (true→false or false→true), not on every error-message change. Use for form-state hooks that care about "is this OK?" rather than rendering the specific error.

```ts
const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})

onUnmount(stop)
```

## i18n bridge

`@pyreon/validate` extends Standard Schema's `Issue` with optional `{ key, params, fallback }` fields. The `formatError` / `formatErrors` / `formatErrorsByPath` helpers resolve issues through your `t` function:

```ts
import { useI18n } from '@pyreon/i18n'
import { formatErrors } from '@pyreon/validate'

const { t } = useI18n()
const messages = formatErrors(result.issues ?? [], t)
```

Resolution order per issue:

1. `issue.key` + `t` provided AND `t` returns a non-key string (i.e. the i18n provider actually has a translation) → use the resolved string.
2. `issue.fallback` if set.
3. `issue.message` (always present per Standard Schema spec).

Native Standard Schema issues from raw Zod / Valibot / ArkType don't carry `key`/`fallback` — they fall through to `message` immediately, no overhead.

### Per-field error map

For `@pyreon/form`'s `Errors` shape (`Partial<Record<fieldName, string>>`), use `formatErrorsByPath`:

```ts
import { formatErrorsByPath } from '@pyreon/validate'

const errorMap = formatErrorsByPath(result.issues ?? [], t)
// → { email: 'Invalid email', password: 'Too short', ... }

// Concatenate colliding paths:
formatErrorsByPath(issues, t, { joinWith: '; ' })
// → { email: 'invalid; required' }
```

## Coexists with existing adapters

`@pyreon/validation`'s `zodSchema()` / `valibotSchema()` / `arktypeSchema()` adapters are unchanged. New code can write:

```ts
// Old way (still works):
import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

const form = useForm({
  initialValues: { email: '' },
  schema: zodSchema(z.object({ email: z.string().email() })),
  onSubmit: (v) => save(v),
})

// New way (any Standard Schema validator, no per-lib adapter):
import { bindSchema } from '@pyreon/validation'

const form = useForm({
  initialValues: { email: '' },
  schema: bindSchema(z.object({ email: z.string().email() })),  // or valibot, or arktype
  onSubmit: (v) => save(v),
})
```

`@pyreon/validate`'s `withField` works on top of either — wrap individual fields with metadata before composing into the form schema.

## Client / server validation

One shared schema, a thin client and a heavy server — without shipping the heavy code to the browser. This is the part of the design that no other validator gives you out of the box.

### Format upgrade (automatic)

The lightweight in-bundle validators (`s.string().email()`, `.phone()`) are upgraded to strict server validators the instant the server imports `@pyreon/validate/server` — strict RFC-5322 email + disposable-domain blocklist, full E.164 phone. The heavy code is unreachable from the main entry, so it tree-shakes out of the client bundle.

```ts
// server entry only (side-effect import):
import '@pyreon/validate/server'
// …now every s.string().email() / .phone() validates strictly here,
// while the client keeps the small, fast in-bundle defaults.
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

- The **server is authoritative** — never treat a client `ok: true` with `pending` entries as fully verified.
- An async registered check promotes the parse to a Promise, so `parse()` returns a parseAsync-directing issue — use `parseAsync(input, { context })` server-side.
- Object fields and array elements are validated async-aware, so the issue `path` is correct even though an async check resolves after the path unwinds.
- A schema containing any `serverCheck` is never JIT-compiled (the JIT can't await); it uses the async-aware interpreter.

## Performance

v1 ships Pyreon's own `s` validator runtime. On the `bun bench:validate` suite (vs Zod 4 / Valibot 1 / ArkType 2):

- **Fastest on the error / invalid path** across every shape (≈2.5–50× — early-exit issue accumulation vs the others' rich error allocation).
- **Runner-up on valid-parse** — behind only ArkType's JIT, ahead of Zod and Valibot. The chainable API doesn't pay class-overhead per parse: each schema's ops compile to one closure on first call, then a flat monomorphic `new Function` validator for pure object/array/primitive trees.
- A **follow-up PR** adds `@pyreon/compiler:analyzeValidate()` — compile-time specialized validators to close the valid-parse gap to ArkType (works against any Standard Schema validator). You can also keep using Zod / Valibot / ArkType through the DX helpers — `@pyreon/validate` never locks you in.

## See also

- [Standard Schema spec](https://standardschema.dev)
- [`@pyreon/validation`](/docs/validation) — per-library adapters
- [`@pyreon/form`](/docs/form) — signal-based forms
- [`@pyreon/i18n`](/docs/i18n) — translation provider
