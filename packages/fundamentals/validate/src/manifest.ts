import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/validate',
  title: 'Pyreon validator + Standard Schema DX',
  tagline:
    "Pyreon's own validation library — chainable + function-comp hybrid API, Standard Schema-native, with built-in field metadata, reactive parse, and i18n-aware error formatting",
  description:
    "Pyreon-owned validator library implementing Standard Schema (https://standardschema.dev) natively. Hybrid API: chainable methods (`s.string().email().min(3)`) AND function composition (`pipe(string(), email(), min(3))`) — same schemas, different ergonomic surface. The chainable path doesn't pay class-overhead per parse: each schema's ops compile to a single closure on first call. Includes built-in DX helpers (`withField` / `parseReactive` / `formatErrors`) that ALSO work on top of any other Standard Schema validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+) — backward-compatible with existing schema code. v1 surface: string/number/boolean/bigint/date/literal/enum/symbol/null/undefined/void/any/unknown primitives + object/array/tuple/record/union/discriminatedUnion/intersection/map/set/lazy composition + optional/nullable/nullish/default/transform/refine/brand/describe modifiers + coercion + 20+ built-in checks. Object algebra: .pick / .omit / .partial / .required / .extend / .merge / .keyof + unknown-key policy (.strip / .strict / .passthrough / .catchall). Performance (bench:validation vs Zod 4 / Valibot 1 / ArkType 2 — per-cell process-isolated with 3 processes pooled, cross-library correctness gate, seeded bootstrap CI95 with tie detection; author-written-and-judged, disclosed in the bench header): FASTEST on the error/invalid path across every shape (33–44× vs Zod, 20–53× vs ArkType, 1.4–3.6× vs Valibot — early-exit vs rich error allocation, with verified error-information parity vs Zod); valid-parse WINS the array shapes outright (1.9–2.3× vs ArkType), is statistically TIED 🤝 on scalar-email + number-range + deep-nested, and trails only on flat-object (~1.2× — ArkType returns the INPUT by reference while Pyreon returns an immutable stripped clone; a semantic choice, not a codegen gap), ahead of Zod + Valibot on every shape. The JIT (`core/jit.ts`) SHIPS and auto-applies on first `.parse()`: it recursively flattens pure object/array/primitive shapes to one monomorphic `new Function` with static-path elision (ctx.path untouched on the valid path; full issue paths reconstructed only at failure sites) and async-aware fallback deferral (async `.refine`/`.transform`/`.serverCheck` subtrees park on a pending list the root return awaits), falling back to the interpreter per-subtree for anything it can't inline (union/record/tuple/coerce/…). Both paths are byte-identical, locked by THREE JIT↔interpreter differential fuzz suites (sync inline kinds, the partial-inline seam, async trees). The hot email 'standard' tier runs a table-driven charcode scanner (~1.6× the Zod-parity regex, exhaustive+fuzz equivalence-locked).",
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
        "Async variant of parseReactive. The outer Computed re-evaluates synchronously on source change; the inner Promise resolves once the validator finishes. Stale results are superseded automatically — each re-run bumps an internal version, and a validation that finishes after a newer one started resolves to the NEWEST run's result, so an awaited stale frame can never deliver a stale verdict.",
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
      name: 'toJsonSchema',
      kind: 'function',
      signature:
        "(schema: Schema<unknown>, options?: { unrepresentable?: 'throw' | 'any' }) => JsonSchema",
      summary:
        "Emit a JSON Schema (draft 2020-12) document from an `s` schema — for OpenAPI specs, AI structured-output constraints, editor autocomplete, cross-language contracts. Ships on the `@pyreon/validate/json-schema` SUBPATH so the main entry stays lean. The document describes the INPUT shape: `.transform()` emits its inner schema, `.pipe()` its source, `s.preprocess()` its target; `.refine()`/`.superRefine()`/`.serverCheck()` are runtime-only predicates and are structurally omitted. Formats map to standard `format` keywords (email/uri/uuid/date/date-time/time/duration); `regex`/`startsWith`/`endsWith`/`includes` map to `pattern`; `.int()` upgrades to `type: 'integer'`; `.strict()` → `additionalProperties: false`, `.catchall(s)` → `additionalProperties: <schema>`; `.optional()`/`.nullish()`/`.default()` fields are omitted from `required`.",
      example: `import { toJsonSchema } from '@pyreon/validate/json-schema'

toJsonSchema(s.object({ name: s.string().min(2), age: s.number().int().optional() }))
// → { $schema: 'https://json-schema.org/draft/2020-12/schema',
//     type: 'object',
//     properties: { name: { type: 'string', minLength: 2 }, age: { type: 'integer' } },
//     required: ['name'] }`,
      mistakes: [
        "Expecting Date/BigInt/Map/Symbol/undefined kinds to emit — JSON Schema cannot express them; the emitter THROWS a [Pyreon]-prefixed error naming the kind. Pass { unrepresentable: 'any' } to emit {} (accept-anything) in their place instead.",
        "Expecting the post-transform OUTPUT shape — the document describes the INPUT the schema accepts (a `.transform()` result type is a runtime concern JSON Schema can't express).",
        'Feeding a cyclic s.lazy() schema — recursive $ref/$defs graph emission is not supported in v1; the emitter throws with guidance. Flatten the recursion or write the recursive document by hand.',
        "Importing from the main entry — `toJsonSchema` is deliberately on the `@pyreon/validate/json-schema` subpath so validators-only bundles never carry the emitter.",
      ],
      seeAlso: ['object', 'union'],
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
    {
      name: 'array',
      kind: 'function',
      signature: '() => ArraySchema<T>',
      summary:
        "Wrap this schema in an array — `s.string().array()` ≡ `s.array(s.string())` (Zod's `.array`). Chains and nests (`s.number().array().array()`). Late-bound via a tree-shake-safe factory registry so the base class never imports the composition modules (no load-order cycle).",
      example: `s.string().array().parse(['a', 'b']) // → { ok: true, value: ['a', 'b'] }`,
      seeAlso: ['or', 'and'],
    },
    {
      name: 'or',
      kind: 'function',
      signature: '<U>(other: Schema<U>) => UnionSchema<readonly [Schema<T>, Schema<U>]>',
      summary: "Union this schema with another — `a.or(b)` ≡ `s.union(a, b)` (Zod's `.or`). Output type is `T | U`.",
      example: `s.string().or(s.number()) // Schema<string | number>`,
      seeAlso: ['and', 'array'],
    },
    {
      name: 'and',
      kind: 'function',
      signature: '<U>(other: Schema<U>) => IntersectionSchema<T, U>',
      summary:
        "Intersect this schema with another — `a.and(b)` ≡ `s.intersection(a, b)` (Zod's `.and`). Output type is `T & U`.",
      example: `s.object({ a: s.string() }).and(s.object({ b: s.number() })) // { a } & { b }`,
      seeAlso: ['or', 'array'],
    },
    {
      name: 'pipe',
      kind: 'function',
      signature: '<U>(target: Schema<U>) => Schema<U>',
      summary:
        "Validate with this schema, then feed the (validated, transformed) output into `target` (Zod's `.pipe`). Ideal for coerce→validate chains. Short-circuits if this schema fails; async-aware. Output type is `target`'s.",
      example: `s.string().transform(Number).pipe(s.number().positive())`,
      seeAlso: ['preprocess', 'transform'],
    },
    {
      name: 'superRefine',
      kind: 'function',
      signature: '(fn: (value: T, ctx: SuperRefineCtx) => void) => Schema<T>',
      summary:
        "Like `.refine`, but the callback may add ANY number of issues (or none) via `ctx.addIssue({ message, path? })` — for cross-field validation that reports multiple problems at once. `path` is appended to the field's current path. Runs only if this schema passed.",
      example: `s.object({ pw: s.string(), confirm: s.string() }).superRefine((v, ctx) => {
  if (v.pw !== v.confirm) ctx.addIssue({ message: 'Mismatch', path: ['confirm'] })
})`,
      seeAlso: ['refine', 'pipe'],
    },
    {
      name: 'preprocess',
      kind: 'function',
      signature: '<TOut>(fn: (input: unknown) => unknown, schema: Schema<TOut>) => Schema<TOut>',
      summary:
        "Transform the raw input BEFORE `schema` validates it (Zod's `z.preprocess`) — for trim/coerce/normalize that must happen before the type-check. A standalone function (also on the `s` namespace), not a method.",
      example: `s.preprocess((v) => String(v).trim(), s.string().min(1))`,
      seeAlso: ['pipe', 'transform'],
    },
    {
      name: 'nonoptional',
      kind: 'function',
      signature: '(message?: string) => Schema<Exclude<T, undefined>>',
      summary:
        "Reject `undefined` (Zod 4's `.nonoptional`) — re-requires a present value, e.g. after an `.optional()` in a reused base schema.",
      example: `s.string().optional().nonoptional() // rejects undefined again`,
      seeAlso: ['optional'],
    },
    {
      name: 'stringbool',
      kind: 'function',
      signature: '(opts?: { truthy?: string[]; falsy?: string[]; message?: string }) => StringBoolSchema',
      summary:
        "Coerce a boolean-ish STRING to a real boolean (Zod 4's `z.stringbool`). Type-checks a string, then maps configured truthy/falsy tokens (case-insensitive, trimmed; defaults `true`/`1`/`yes`/`on`/`y`/`enabled` ↔ `false`/`0`/`no`/`off`/`n`/`disabled`) to `true`/`false`; anything else errors. Stricter than `s.coerce.boolean()` (which uses JS truthiness on any input).",
      example: `s.stringbool().parse('yes') // → { ok: true, value: true }
s.stringbool({ truthy: ['si'], falsy: ['no'] })`,
      seeAlso: ['coerce'],
    },
    {
      name: 'never',
      kind: 'function',
      signature: '() => Schema<never>',
      summary:
        "Accepts NO value (Zod's `z.never`) — every input is a validation error, including `undefined`. Used for exhaustiveness and to forbid a key (`s.object(...).extend({ legacy: s.never().optional() })` rejects the key only when present; a bare `s.never()` field is required-and-unsatisfiable).",
      example: `s.never().parse(1) // → { ok: false }
s.object({ a: s.string() }).extend({ legacy: s.never().optional() })`,
      seeAlso: ['unknown', 'custom'],
    },
    {
      name: 'custom',
      kind: 'function',
      signature: '<T = unknown>(check?: (value: unknown) => boolean, message?: string) => Schema<T>',
      summary:
        "Escape-hatch validated by a user predicate (Zod's `z.custom<T>`). With NO predicate it accepts everything as `T` (a pure type assertion); with one it emits a `custom`-coded issue when the predicate returns false. The output type is the caller-supplied `T` — never narrowed, since the predicate is opaque.",
      example: `s.custom<\`\${number}px\`>((v) => typeof v === 'string' && v.endsWith('px'))
s.custom<MyType>() // accept anything as MyType`,
      seeAlso: ['instanceof', 'refine'],
    },
    {
      name: 'instanceof',
      kind: 'function',
      signature: '<T>(ctor: new (...args: any[]) => T, message?: string) => Schema<T>',
      summary:
        "Asserts `input instanceof Ctor` (Zod's `z.instanceof`). The canonical way to validate runtime class instances — `s.instanceof(File)`, `s.instanceof(Date)`, `s.instanceof(URL)`, user classes. The default message names the class; pass a second arg to override.",
      example: `s.instanceof(File) // validate an uploaded File
s.instanceof(Date, 'need a Date')`,
      seeAlso: ['custom'],
    },
    {
      name: 'nativeEnum',
      kind: 'function',
      signature: '<E extends Record<string, string | number>>(enumObject: E) => Schema<E[keyof E]>',
      summary:
        "Validate a VALUE of a TS native `enum` (or a `const` value-object) — Zod's `z.nativeEnum`. Output type is the enum's value union (`E[keyof E]`). Correctly filters out the numeric reverse-mappings TS auto-generates (a numeric `enum { A }` compiles to `{ A: 0, 0: 'A' }`, so `'A'` is NOT accepted as input — only `0` is). Use `s.enum([...])` instead for a plain literal array.",
      example: `enum Role { Admin = 'admin', User = 'user' }
s.nativeEnum(Role).parse('admin') // → { ok: true, value: 'admin' }`,
      seeAlso: ['enum', 'literal'],
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
      note: "`.serverCheck(key)` only runs where its validator is installed. On the client it ALWAYS passes (recorded on `Result.pending`) — the SERVER is the authoritative re-validation; never treat a client `ok: true` with `pending` as fully verified. A registered ASYNC check promotes the parse to a Promise, so `parse()` returns a parseAsync-directing issue — use `parseAsync(input, { context })` server-side. serverCheck fields JIT-compile like everything else (the JIT defers async-resolving subtrees onto a pending list its root return awaits) — no perf cliff.",
    },
    {
      label: 'Three shipped performance layers — runtime JIT + two build flags',
      note: "The runtime JIT (`core/jit.ts`) auto-applies on first `.parse()` and is differential-fuzz-locked against the interpreter (incl. async trees + the partial-inline seam). On top: `pyreon({ optimizeValidators: true })` rewrites module-level `s.` chains to the tree-shakeable `/mini` form (~−41% measured), and `pyreon({ compileValidators: true })` attaches build-emitted monomorphic `.is()` verdicts (1.6–3× on hot verdict loops — nanoseconds; only matters in tight `.is()` loops, `.parse()` is unchanged). Both build flags recognize statically-analyzable chains only (a dynamically-built or out-of-emit-scope chain — e.g. `.cuid2()`, unions — gracefully stays full-runtime).",
    },
  ],
})
