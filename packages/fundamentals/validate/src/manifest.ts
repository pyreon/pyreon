import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/validate',
  title: 'Pyreon validator + Standard Schema DX',
  tagline:
    "Pyreon's own validation library — chainable + function-comp hybrid API, Standard Schema-native, with built-in field metadata, reactive parse, and i18n-aware error formatting",
  description:
    "Pyreon-owned validator library implementing Standard Schema (https://standardschema.dev) natively. Hybrid API: chainable methods (`s.string().email().min(3)`) AND function composition (`pipe(string(), email(), min(3))`) — same schemas, different ergonomic surface. The chainable path doesn't pay class-overhead per parse: each schema's ops compile to a single closure on first call. Includes built-in DX helpers (`withField` / `parseReactive` / `formatErrors`) that ALSO work on top of any other Standard Schema validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+) — backward-compatible with existing schema code. v1 surface: string/number/boolean/bigint/date/literal/enum/symbol/null/undefined/void/any/unknown primitives + object/array/tuple/record/union/discriminatedUnion/intersection/map/set/lazy composition + optional/nullable/nullish/default/transform/refine/brand/describe modifiers + coercion + 20+ built-in checks. Object algebra: .pick / .omit / .partial / .required / .extend / .merge / .keyof + unknown-key policy (.strip / .strict / .passthrough / .catchall). Performance (bench:validate vs Zod 4 / Valibot 1 / ArkType 2): FASTEST on the error/invalid path across every shape (2.5–50× faster — early-exit vs rich error allocation); 2nd-fastest on valid-parse, behind only ArkType's JIT but faster than Zod + Valibot. Compiler-emit (typia-class JIT to close the valid-parse gap to ArkType) deferred to a follow-up.",
  category: 'universal',
  longExample: `import { z } from 'zod'
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
`,
  features: [
    'withField(schema, meta) — attach label/hint/placeholder/i18n keys to ANY Standard Schema validator',
    'getMeta(schema) / resolveMetaField(schema, field, t) — read metadata, optionally i18n-resolved',
    'parseReactive(schema, signal) — Computed<ParseResult> that re-derives on signal changes',
    'parseReactiveAsync — async variant for schemas with async refinements',
    'watchValid(schema, signal, callback) — fires on validity transitions, not every error change',
    'formatError / formatErrors / formatErrorsByPath — i18n-key-aware error rendering',
    'Works with any Standard Schema validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+, …)',
    'Tree-shakeable — DX helpers alone are ~0.5KB gz (measured); the v1 validator runtime (~3.5KB gz) is pulled in only when `s` / primitives are imported',
    'Client/server split — ONE shared schema, thin client + heavy server. `s.string().email()` validates strictly server-side (rfc5322 + disposable blocklist, full E.164 phone) the instant `@pyreon/validate/server` is imported — the heavy code tree-shakes out of the client bundle. `.serverCheck(key)` is the async/privileged tier (unique-email, breach-check, MX): a no-op on the client (recorded on `Result.pending`), the registered validator (via `registerServerCheck`) on the server. `parseAsync(input, { context })` threads a DB handle / request to the server checks.',
    'String format checks: email / url / uuid / ip / phone / creditCard + cuid2 / ulid / nanoid / emoji / base64 / jwt + ISO date/dateTime/time — every format routed through the client/server registry seam, so a server can upgrade any of them in place via `installFormatValidator`.',
    '`.catch(fallback)` — resilient parse: on failure, discard issues and substitute a static or input-derived fallback (terminal regardless of chain position; sync + async). `.readonly()` — freeze the parsed output + `Readonly<T>` at the type level.',
  ],
  api: [
    {
      name: 'withField',
      kind: 'function',
      signature: '<S extends StandardSchemaV1>(schema: S, meta: FieldMeta) => S',
      summary:
        "Attach Pyreon field metadata (label, hint, placeholder, i18n keys, autoFocus, autoComplete, defaultValue) to any Standard Schema. The returned schema is the SAME REFERENCE as the input — Pyreon mutates a Symbol-keyed non-enumerable slot in place, which is invisible to JSON serialization, for…in, Object.keys, and library-internal comparators. Mutation (instead of cloning) is required because ArkType's `Type` instances are callable functions whose `~standard.validate` does `this(input)` — a shallow clone would not be callable and would break that contract. Re-wrapping merges new metadata onto existing (later keys win).",
      example: `const emailSchema = withField(z.string().email(), {
  label: 'Email address',
  placeholder: 'you@example.com',
  i18nLabel: 'auth.email.label',
  autoComplete: 'email',
})`,
      mistakes: [
        "Expecting withField to return a NEW reference — it doesn't. The metadata mutation is in place. If you need an isolated copy, construct two separate schemas instead.",
        "Adding `i18nLabel` without a corresponding `label` — without a translation provider (or when t echoes the key), there's no fallback. Always set both.",
        "Storing schemas with metadata in JSON.stringify-d state and round-tripping — the metadata is Symbol-keyed and won't survive serialization. Re-attach on load.",
      ],
      seeAlso: ['getMeta', 'resolveMetaField', 'StandardSchemaV1'],
    },
    {
      name: 'getMeta',
      kind: 'function',
      signature: '<S extends StandardSchemaV1>(schema: S) => FieldMeta | undefined',
      summary:
        'Read the Pyreon field metadata attached via withField(). Returns undefined for schemas that haven\'t been wrapped — consumers should be defensive (`getMeta(schema)?.label ?? fallback`). Accepts both objects AND functions (ArkType\'s `Type` instances are callable).',
      example: `const meta = getMeta(emailSchema)
const label = meta?.label ?? humanize(fieldName)`,
      seeAlso: ['withField', 'resolveMetaField'],
    },
    {
      name: 'resolveMetaField',
      kind: 'function',
      signature: `<S extends StandardSchemaV1>(
  schema: S,
  field: 'label' | 'hint' | 'placeholder',
  t?: TFn,
) => string | undefined`,
      summary:
        "Read a metadata field through optional i18n. If the metadata has an `i18n<Field>` key AND a `t` function is provided AND `t` resolves it (returns a non-key string), the resolved string wins. Otherwise falls back to the literal. Recommended over `getMeta(schema)?.label` directly when you have a `t` from `useI18n()`.",
      example: `const label = resolveMetaField(emailSchema, 'label', t)
// → t('auth.email.label') if set + resolved, else meta.label, else undefined`,
      seeAlso: ['getMeta', 'formatErrors'],
    },
    {
      name: 'parseReactive',
      kind: 'function',
      signature: `<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
) => Computed<ParseResult>`,
      summary:
        "Reactively parse `source` through `schema`. Returns a `Computed<ParseResult>` that re-validates on every source change. Synchronous only — for schemas with async refinements (Zod `.refine(async)`, Valibot async pipe), use parseReactiveAsync (this sync variant surfaces an actionable issue if the schema returns a Promise).",
      example: `const $email = signal('')
const $result = parseReactive(emailSchema, $email)

effect(() => {
  const r = $result()
  if (r.issues) showError(r.issues)
  else commitValue(r.value)
})

$email.set('foo@bar.com')  // $result re-derives`,
      mistakes: [
        'Using parseReactive on an async schema — it surfaces a clear "use parseReactiveAsync" issue rather than silently producing a Promise as the validation result.',
        'Calling parseReactive on every render of a component — it allocates a Computed; cache it at component setup time (call once per signal-source pair).',
      ],
      seeAlso: ['parseReactiveAsync', 'watchValid', 'formatErrors'],
    },
    {
      name: 'parseReactiveAsync',
      kind: 'function',
      signature: `<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
) => Computed<Promise<ParseResult>>`,
      summary:
        "Async variant of parseReactive. The outer Computed re-evaluates synchronously on source change; the inner Promise resolves once the validator finishes. Rapid source changes produce overlapping in-flight promises — the caller is responsible for handling staleness (a `watch()` over the Computed naturally drops stale frames).",
      example: `const schema = z.string().refine(async (s) => await checkUnique(s))
const $result = parseReactiveAsync(schema, $username)

watch($result, async (current) => {
  const r = await current
  showFeedback(r)
})`,
      seeAlso: ['parseReactive'],
    },
    {
      name: 'watchValid',
      kind: 'function',
      signature: `<S extends StandardSchemaV1>(
  schema: S,
  source: Signal<unknown> | (() => unknown),
  callback: (valid: boolean) => void,
) => () => void`,
      summary:
        "Subscribe to validity transitions. The callback fires only when validity flips (true→false or false→true), NOT on every error-message change — ideal for form-state hooks that care about \"is this OK?\" without re-rendering on every typo. Returns an unsubscribe function. Internally a `watch()` over `parseReactive`.",
      example: `const stop = watchValid(emailSchema, $email, (valid) => {
  submitButton.disabled = !valid
})

onUnmount(stop)`,
      seeAlso: ['parseReactive'],
    },
    {
      name: 'formatError',
      kind: 'function',
      signature: '(issue: StandardSchemaIssue | PyreonIssue, t?: TFn) => string',
      summary:
        "Resolve a single issue to a human-readable string. Resolution order: (1) `issue.key` + `t` provided AND `t` returns a non-key string → resolved string; (2) `issue.fallback` if set; (3) `issue.message` (always present per StdSchema spec). Native StdSchema issues without `key`/`fallback` fall through to `message` immediately — no overhead.",
      example: `const message = formatError(issue, t)
// → t('validate.string.too-short', { min: 2 }) when key + t resolve
// → issue.fallback ('Must be at least 2 characters') when t echoes the key
// → issue.message (raw lib message) when no key at all`,
      seeAlso: ['formatErrors', 'formatErrorsByPath'],
    },
    {
      name: 'formatErrors',
      kind: 'function',
      signature: '(issues: ReadonlyArray<StandardSchemaIssue | PyreonIssue>, t?: TFn) => string[]',
      summary:
        'Resolve an array of issues to strings via the same per-issue logic as formatError. Returns strings in the original order so paths line up with the input array.',
      example: `const { t } = useI18n()
const messages = formatErrors(result.issues ?? [], t)`,
      seeAlso: ['formatError', 'formatErrorsByPath'],
    },
    {
      name: 'formatErrorsByPath',
      kind: 'function',
      signature:
        '(issues: ReadonlyArray<StandardSchemaIssue | PyreonIssue>, t?: TFn, options?: { joinWith?: string }) => Record<string, string>',
      summary:
        "Build a per-field error map keyed by the issue's path joined with `.`. Compatible with `@pyreon/form`'s `Errors` shape (`Partial<Record<fieldName, string>>`). Path-less issues land under the empty-string key. First issue wins on collision unless `joinWith` is set (then messages concatenate).",
      example: `const errorMap = formatErrorsByPath(result.issues ?? [], t)
// → { email: 'Invalid email', password: 'Too short', ... }`,
      seeAlso: ['formatErrors'],
    },
    {
      name: 'serverCheck',
      kind: 'function',
      signature:
        '(key: string, opts?: { message?: string; code?: string; key?: string; params?: Record<string, unknown>; fallback?: string }) => this',
      summary:
        "Declare a server-only validation step on a shared schema — the async/privileged tier of the client/server split (unique-email, breach-check, DNS-MX, cross-field DB lookups). On the CLIENT (no validator installed) it's a no-op: the value passes and the deferred check is recorded on `Result.pending` (so the UX can show a \"checking…\" affordance). On the SERVER, the validator registered via `registerServerCheck(key, fn)` runs — sync or async. Async checks promote the parse to `parseAsync`, which threads an opaque `context` (DB handle, request) to the validator. Issue `path` is snapshotted at the check site, so a field/array-element check reports the correct path even though it resolves after the path unwinds.",
      example: `// shared schema (client + server)
const signup = s.object({
  email: s.string().email().serverCheck('email-unique', { message: 'Email already taken' }),
})

// CLIENT: cheap checks run; serverCheck is deferred
const r = signup.parse(formData)
if (r.ok && r.pending?.length) showChecking()   // 'email-unique' pending

// SERVER (registerServerCheck installed elsewhere):
const verdict = await signup.parseAsync(formData, { context: { db } })`,
      seeAlso: ['registerServerCheck', 'parseAsync'],
    },
    {
      name: 'registerServerCheck',
      kind: 'function',
      signature: '(key: string, fn: (value: unknown, context?: unknown) => boolean | Promise<boolean>) => void',
      summary:
        "Register the heavy/privileged half of a `.serverCheck(key)` — the implementation that must NEVER reach the client bundle (DB lookups, breach-checks, MX, cross-field). Imported from `@pyreon/validate/server` and called from a server-only module; the matching `s.…serverCheck(key)` in the shared schema then validates here. Returning `false` fails the check with the schema's `message`. The second arg is the `context` passed to `parseAsync(input, { context })`.",
      example: `// server-only module
import { registerServerCheck } from '@pyreon/validate/server'

registerServerCheck('email-unique', async (value, ctx) => {
  const db = (ctx as { db: Db }).db
  return !(await db.user.existsByEmail(value as string))
})`,
      seeAlso: ['serverCheck'],
    },
    {
      name: 'catch',
      kind: 'function',
      signature: '(value: T | ((input: unknown) => T)) => this',
      summary:
        "On parse FAILURE, discard the issues this schema produced and return a fallback instead of erroring — resilient parsing (Zod's `.catch`). The fallback is a static value or a function of the raw input. Terminal regardless of chain position: `s.string().min(3).catch('x')` and `s.string().catch('x').min(3)` behave identically. Works on both `parse` and `parseAsync` (an async transform/refine failure is caught after the Promise settles). Scoped per-schema: a caught FIELD failure is substituted while sibling failures still fail the object.",
      example: `s.number().catch(0).parse('nope')          // → { ok: true, value: 0 }
s.string().min(3).catch('x').parse('ab')   // → { ok: true, value: 'x' }
s.string().catch((input) => String(input)) // fallback derived from the raw input`,
      seeAlso: ['readonly', 'default'],
    },
    {
      name: 'readonly',
      kind: 'function',
      signature: '() => Schema<ShallowReadonly<T>>',
      summary:
        "Freeze the parsed output and mark it `Readonly<T>` at the type level (Zod's `.readonly`). Objects/arrays are `Object.freeze`d (shallow) so accidental downstream mutation throws in strict mode; primitives pass through. Apply last in a chain. Uses a primitive-safe `ShallowReadonly<T>` (not the built-in `Readonly<T>`, whose `Readonly<unknown>` resolves to `{}` and breaks `Schema<T>` → `Schema<unknown>` assignability).",
      example: `const cfg = s.object({ port: s.number() }).readonly()
const r = cfg.parse({ port: 80 })
// r.value is Readonly<{ port: number }> and Object.isFrozen(r.value) === true`,
      seeAlso: ['catch'],
    },
  ],
  gotchas: [
    {
      label: 'Standard Schema is parse-only',
      note: "The protocol deliberately omits a metadata channel — that's the gap `withField` fills. The protocol also doesn't carry i18n keys — `formatErrors` adds that layer.",
    },
    {
      label: 'withField mutates in place',
      note: "ArkType's Type instances are callable functions whose `~standard.validate` does `this(input)` — `this` must be the callable schema itself. An Object.create() clone is not callable and breaks ArkType. Symbol-keyed non-enumerable mutation is invisible to JSON / for…in / Object.keys / library-internal comparators. Safe.",
    },
    {
      label: 'Ships its own validator AND interops with others',
      note: "v1 ships Pyreon's own `s` validator runtime (chainable + function-comp, Standard Schema-native, opt-in by import). The DX helpers (`withField` / `parseReactive` / `formatErrors`) ALSO work on top of any other Standard Schema validator (Zod / Valibot / ArkType / typia) — backward-compatible. Use whichever; mix freely.",
    },
    {
      label: 'serverCheck is client-no-op, server-async',
      note: "`.serverCheck(key)` only runs where its validator is installed. On the client it ALWAYS passes (recorded on `Result.pending`) — the SERVER is the authoritative re-validation; never treat a client `ok: true` with `pending` as fully verified. A registered ASYNC check promotes the parse to a Promise, so `parse()` returns a parseAsync-directing issue — use `parseAsync(input, { context })` server-side. A schema containing any `serverCheck` is never JIT-compiled (the JIT can't await); it uses the async-aware interpreter.",
    },
    {
      label: 'Compiler-emit is a follow-up',
      note: 'A future PR adds `@pyreon/compiler:analyzeValidate()` to emit typia-class specialized validators per schema at build time. v1 ships at the underlying lib\'s speed (Valibot/ArkType are already 3-5× faster than Zod; the compiler PR closes the gap for Zod schemas too).',
    },
  ],
})
