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

## Performance

v1 parse speed is **the underlying library's speed**. Pyreon-validate is a metadata + reactive bridge, not a parse runtime. If you want speed:

- Valibot and ArkType are already 3-5× faster than Zod on common shapes (independent of Pyreon-validate).
- A **follow-up PR** adds `@pyreon/compiler:analyzeValidate()` — emits typia-class specialized validators per schema at build time. Works against any Standard Schema validator. Until that ships, parse speed is your library's speed.

## See also

- [Standard Schema spec](https://standardschema.dev)
- [`@pyreon/validation`](/docs/validation) — per-library adapters
- [`@pyreon/form`](/docs/form) — signal-based forms
- [`@pyreon/i18n`](/docs/i18n) — translation provider
