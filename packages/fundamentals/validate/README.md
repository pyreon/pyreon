# `@pyreon/validate`

Pyreon's validator + **Standard Schema** DX layer — field metadata, reactive parse, i18n-aware error formatting, and (since v1) Pyreon's own validator runtime.

Standard Schema (https://standardschema.dev) is the cross-library protocol implemented natively by Zod 3.24+, Valibot 1.0+, ArkType 2.0+, and any future spec-compliant validator. `@pyreon/validate` adds the things the spec deliberately omits, plus Pyreon-native bridges to `@pyreon/reactivity` and `@pyreon/i18n`.

**Two ways to use it:**

1. **DX helpers on top of your validator of choice** (Zod / Valibot / ArkType). The Pyreon validator runtime tree-shakes away entirely — a DX-helpers-only import is ~0.5KB gz (measured).
2. **Pyreon's own `s` validator** (v1) — chainable + function-comp hybrid, Standard Schema-native, ~3.5KB gz when imported. No third-party validator needed.

```bash
bun add @pyreon/validate
# Option 1 — pair the DX helpers with a third-party validator:
bun add zod          # or
bun add valibot      # or
bun add arktype
# Option 2 — use Pyreon's own `s` validator (no extra dep):
#   import { s } from '@pyreon/validate'
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

| Helper | Purpose |
| --- | --- |
| `withField(schema, meta)` | Attach `FieldMeta` (label, hint, placeholder, i18n keys, autoFocus, autoComplete) to any Standard Schema. Returns the same reference — metadata is a Symbol-keyed non-enumerable slot. |
| `getMeta(schema)` | Read attached metadata back. Returns `undefined` for unwrapped schemas. |
| `resolveMetaField(schema, field, t?)` | Read a field through optional i18n. `t('auth.email.label')` wins over `meta.label` when it resolves. |
| `parseReactive(schema, source)` | `Computed<ParseResult>` that re-derives on signal changes. Synchronous. |
| `parseReactiveAsync(schema, source)` | Async variant for schemas with async refinements. |
| `watchValid(schema, source, cb)` | Fire `cb(valid)` only on validity transitions, not every error change. |
| `formatError(issue, t?)` | Resolve a single issue's text. `issue.key + t` wins; falls back to `fallback` then `message`. |
| `formatErrors(issues, t?)` | Array variant. |
| `formatErrorsByPath(issues, t?, options?)` | Build a per-field error map keyed by the issue's path. Compatible with `@pyreon/form`'s `Errors` shape. |

## Client / server validation

One shared schema, a thin client and a heavy server — without shipping the heavy code to the browser.

**Format upgrade (automatic).** The lightweight in-bundle validators (`s.string().email()`, `.phone()`) are upgraded to strict server validators the instant the server imports `@pyreon/validate/server` — strict RFC-5322 email + disposable-domain blocklist, full E.164 phone. The heavy code is unreachable from the main entry, so it tree-shakes out of the client bundle.

```ts
// server entry only (side-effect import):
import '@pyreon/validate/server'
// …now every s.string().email() / .phone() validates strictly here.
```

**`.serverCheck(key)` — the async / privileged tier.** For checks that can only run server-side (unique-email, breach-check, DNS-MX, cross-field DB lookups). On the **client** it's a no-op: the value passes and the deferred check is recorded on `Result.pending` (so the UX can show a "checking…" affordance). On the **server**, the validator registered via `registerServerCheck(key, fn)` runs — sync or async.

```ts
// shared schema (client + server)
import { s } from '@pyreon/validate'
const signup = s.object({
  email: s.string().email().serverCheck('email-unique', { message: 'Email already taken' }),
})

// CLIENT — cheap checks run; serverCheck deferred:
const r = signup.parse(formData)
if (r.ok && r.pending?.length) showChecking()   // 'email-unique' pending

// SERVER-only module — register the heavy impl:
import { registerServerCheck } from '@pyreon/validate/server'
registerServerCheck('email-unique', async (value, ctx) => {
  const db = (ctx as { db: Db }).db
  return !(await db.user.existsByEmail(value as string))
})

// SERVER — run the async checks, threading a context (DB handle / request):
const verdict = await signup.parseAsync(formData, { context: { db } })
```

Notes:
- The **server is authoritative** — never treat a client `ok: true` with `pending` entries as fully verified.
- An async registered check promotes the parse to a Promise, so `parse()` returns a parseAsync-directing issue — use `parseAsync(input, { context })` server-side.
- Object fields and array elements are validated async-aware, so the issue `path` is correct even though an async check resolves after the path unwinds.
- A schema containing any `serverCheck` is never JIT-compiled (the JIT can't await); it uses the async-aware interpreter.

## Why mutate-in-place?

`withField()` mutates the original schema with a Symbol-keyed non-enumerable property. It does NOT clone.

ArkType's `Type` instances are callable functions whose `~standard.validate` does `this(input)` — `this` must be the callable schema itself. A shallow clone (`Object.create()`) is not callable and breaks that contract. Symbol-keyed non-enumerable mutation is invisible to:

- `JSON.stringify` (skips symbol keys)
- `for…in` / `Object.keys` / `Object.entries`
- Structured clone
- Library-internal schema comparators

…so the mutation is functionally hidden. Re-wrapping is the natural extension — `withField(base, { a })` then `withField(base, { b })` produces a schema with both `a` and `b` automatically.

## What this is NOT

- **Lock-in.** The DX helpers work on top of any Standard Schema validator (Zod / Valibot / ArkType / typia) — use Pyreon's own `s` runtime or bring your own; mix freely. Existing `zodSchema` / `valibotSchema` / `arktypeSchema` adapters from `@pyreon/validation` continue to work.
- **A typia-class JIT (yet).** v1's `s` runtime is the error-path leader and runner-up on valid-parse (bench: `bun bench:validate`). A follow-up PR adds `@pyreon/compiler:analyzeValidate()` for compile-time specialized validators (works against any Standard Schema validator).

## See also

- [Standard Schema spec](https://standardschema.dev)
- [`@pyreon/validation`](../validation/) — per-lib adapters for `@pyreon/form`
- [`@pyreon/form`](../form/) — signal-based forms
- [`@pyreon/i18n`](../i18n/) — translation provider
