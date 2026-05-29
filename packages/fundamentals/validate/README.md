# `@pyreon/validate`

Pyreon DX overlay on **Standard Schema** — field metadata, reactive parse, i18n-aware error formatting.

Standard Schema (https://standardschema.dev) is the cross-library protocol implemented natively by Zod 3.24+, Valibot 1.0+, ArkType 2.0+, and any future spec-compliant validator. `@pyreon/validate` adds the three things the spec deliberately omits, plus Pyreon-native bridges to `@pyreon/reactivity` and `@pyreon/i18n`.

**Pyreon does NOT ship its own validator runtime.** Use whichever Standard Schema-compliant library you prefer.

```bash
bun add @pyreon/validate
# Plus your validator of choice:
bun add zod          # or
bun add valibot      # or
bun add arktype
```

## Quick start

```ts
import { z } from 'zod'
import { signal } from '@pyreon/reactivity'
import { useI18n } from '@pyreon/i18n'
import { withField, parseReactive, formatErrors, watchValid } from '@pyreon/validate'

// 1. Attach metadata.
const emailSchema = withField(z.string().email(), {
  label: 'Email address',
  placeholder: 'you@example.com',
  hint: 'We never share your email',
  i18nLabel: 'auth.email.label',
})

// 2. Reactively validate as the user types.
const $email = signal('')
const $result = parseReactive(emailSchema, $email)

// 3. Format errors with i18n.
const { t } = useI18n()
effect(() => {
  const r = $result()
  if (r.issues) showErrors(formatErrors(r.issues, t))
})

// 4. Subscribe only to validity flips.
const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})
```

## API surface (v1)

| Helper                                     | Purpose                                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `withField(schema, meta)`                  | Attach `FieldMeta` (label, hint, placeholder, i18n keys, autoFocus, autoComplete) to any Standard Schema. Returns the same reference — metadata is a Symbol-keyed non-enumerable slot. |
| `getMeta(schema)`                          | Read attached metadata back. Returns `undefined` for unwrapped schemas.                                                                                                                |
| `resolveMetaField(schema, field, t?)`      | Read a field through optional i18n. `t('auth.email.label')` wins over `meta.label` when it resolves.                                                                                   |
| `parseReactive(schema, source)`            | `Computed<ParseResult>` that re-derives on signal changes. Synchronous.                                                                                                                |
| `parseReactiveAsync(schema, source)`       | Async variant for schemas with async refinements.                                                                                                                                      |
| `watchValid(schema, source, cb)`           | Fire `cb(valid)` only on validity transitions, not every error change.                                                                                                                 |
| `formatError(issue, t?)`                   | Resolve a single issue's text. `issue.key + t` wins; falls back to `fallback` then `message`.                                                                                          |
| `formatErrors(issues, t?)`                 | Array variant.                                                                                                                                                                         |
| `formatErrorsByPath(issues, t?, options?)` | Build a per-field error map keyed by the issue's path. Compatible with `@pyreon/form`'s `Errors` shape.                                                                                |

## Why mutate-in-place?

`withField()` mutates the original schema with a Symbol-keyed non-enumerable property. It does NOT clone.

ArkType's `Type` instances are callable functions whose `~standard.validate` does `this(input)` — `this` must be the callable schema itself. A shallow clone (`Object.create()`) is not callable and breaks that contract. Symbol-keyed non-enumerable mutation is invisible to:

- `JSON.stringify` (skips symbol keys)
- `for…in` / `Object.keys` / `Object.entries`
- Structured clone
- Library-internal schema comparators

…so the mutation is functionally hidden. Re-wrapping is the natural extension — `withField(base, { a })` then `withField(base, { b })` produces a schema with both `a` and `b` automatically.

## What this is NOT

- **A new validator.** Use Zod / Valibot / ArkType / typia. `@pyreon/validate` makes them Pyreon-flavoured.
- **A validation library you must adopt.** Existing `zodSchema` / `valibotSchema` / `arktypeSchema` adapters from `@pyreon/validation` continue to work.
- **A perf claim.** v1 parse speed is the underlying lib's speed. A follow-up PR adds `@pyreon/compiler:analyzeValidate()` for typia-class wall-clock per schema (works against any Standard Schema validator).

## See also

- [Standard Schema spec](https://standardschema.dev)
- [`@pyreon/validation`](../validation/) — per-lib adapters for `@pyreon/form`
- [`@pyreon/form`](../form/) — signal-based forms
- [`@pyreon/i18n`](../i18n/) — translation provider
