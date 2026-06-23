/**
 * `Schema<T>` — the base class every Pyreon-validate schema extends.
 *
 * Architecture:
 *   - Each schema has a `_kind` discriminator + an ordered `_ops` list.
 *   - Chainable methods (e.g. `.min(2)`) push Ops onto the list and
 *     return `this` so they can chain.
 *   - The first call to `.parse()` / `~standard.validate` compiles the
 *     ops into a single closure — subsequent parses just invoke it.
 *     This is what makes chainable APIs cheap: we don't pay
 *     method-dispatch cost per parse.
 *
 * The `~standard` getter exposes the Standard Schema v1 contract
 * (https://standardschema.dev). Pyreon-validate schemas drop into any
 * StdSchema consumer (`@pyreon/form`, `@pyreon/feature`, `@pyreon/zero`
 * loader validators, etc.) without an adapter.
 */

import type { FieldMeta, StandardSchemaIssue, StandardSchemaV1 } from '../types'
import { META_SLOT } from '../types'
import { type PyreonIssue, ValidationError } from './issue'
import { tryCompileJit } from './jit'
import type { CheckOpts, Op, ParseCtx, PendingCheck } from './ops'
import { makeCtx } from './ops'
import { getServerCheck } from './registry'
// Type-only imports for the composition shorthand return types (`.array` /
// `.or` / `.and`). Erased at build time, so they create NO runtime dependency
// on the composition modules — the base class never imports them as values, so
// the schema↔composition load-order cycle is structurally impossible. The
// runtime factories are late-bound via the registry below.
import type { ArraySchema } from '../composition/array'
import type { IntersectionSchema } from '../composition/intersection'
import type { UnionSchema } from '../composition/union'

/**
 * Late-bound composition factories — populated by the composition modules
 * (`array` / `union` / `intersection`) at the moment their exports are first
 * evaluated (the factory is registered from each export's INITIALIZER via
 * `registerCompositionFactory`, so it is tree-shake-safe: rollup must run the
 * initializer to produce the used export, yet drops it entirely for consumers
 * that never import composition — e.g. the DX-helpers-only path). The base
 * class only ever READS these, so it never imports the composition modules as
 * values → no schema↔composition load-order cycle.
 */
type ArrayFactory = (element: Schema<unknown>) => unknown
type UnionFactory = (a: Schema<unknown>, b: Schema<unknown>) => unknown
type IntersectionFactory = (a: Schema<unknown>, b: Schema<unknown>) => unknown

let _arrayFactory: ArrayFactory | undefined
let _unionFactory: UnionFactory | undefined
let _intersectionFactory: IntersectionFactory | undefined

/**
 * Per-factory registrars. Each composition module calls its own from the
 * export's INITIALIZER (`export const array = registerArrayFactory(fn)`), which
 * makes registration tree-shake-safe — rollup must evaluate the initializer to
 * produce the used export, but drops it (and the whole module) for consumers
 * that never reference composition. `fn` is returned unchanged so the export is
 * still the bare factory function.
 */
export function registerArrayFactory<F extends ArrayFactory>(fn: F): F {
  _arrayFactory = fn
  return fn
}
export function registerUnionFactory<F extends UnionFactory>(fn: F): F {
  _unionFactory = fn
  return fn
}
export function registerIntersectionFactory<F extends IntersectionFactory>(fn: F): F {
  _intersectionFactory = fn
  return fn
}

const COMPOSITION_UNREGISTERED =
  "[Pyreon] .array()/.or()/.and() require the composition factories — import `s` (or `array`/`union`/`intersection`) from '@pyreon/validate' so they register. (A bare `import { string }` that never references composition skips registration.)"

function requireFactory<F>(fn: F | undefined): F {
  if (!fn) throw new Error(COMPOSITION_UNREGISTERED)
  return fn
}

/**
 * Result discriminated union. `parse()` returns this. On success, the
 * value is fully type-T (transforms applied). On failure, `issues` is
 * the ordered list of parse problems.
 */
export type Result<T> =
  | {
      readonly ok: true
      readonly value: T
      /**
       * Server-only checks (`.serverCheck`) deferred because their validator
       * wasn't installed — the "valid so far, pending server" contract. Present
       * only on the CLIENT (where server checks are no-ops); empty/absent on the
       * server (where `parseAsync` runs them). The form/UX layer uses this to
       * show a "checking…" affordance and defer the field's final verdict.
       */
      readonly pending?: ReadonlyArray<PendingCheck>
    }
  | { readonly ok: false; readonly issues: ReadonlyArray<PyreonIssue> }

/**
 * Sync validator function the parse compiler produces. Accepts the
 * raw input + parse context (for path-aware issue accumulation); writes
 * issues into ctx.issues; returns the (possibly-transformed) value.
 */
export type SyncValidator = (input: unknown, ctx: ParseCtx) => unknown

/**
 * Async validator — same shape, but returns a Promise. Used only when
 * the ops list contains `transform` or `refine` whose function returns
 * a Promise at runtime.
 */
export type AsyncValidator = (input: unknown, ctx: ParseCtx) => Promise<unknown>

/**
 * Base class for every primitive / composition / modifier schema.
 *
 * Subclasses set `_kind` and provide a `_compileType` hook that
 * generates the type-check step (e.g. `typeof input === 'string'`).
 * Everything else — checks, transforms, refines, modifier handling —
 * is shared in the base.
 */
export abstract class Schema<T> {
  /** Subclass discriminator. Used by the compiler + StdSchema vendor. */
  abstract readonly _kind: string

  /** Ordered list of operations applied at parse time. Mutated by chainable methods. */
  _ops: Op[] = []

  /** Cached parse closure — built on first parse, reused thereafter. */
  private _compiled?: SyncValidator | undefined

  // ─── Public parse API ─────────────────────────────────────────────────

  /**
   * Parse an unknown input through this schema. Never throws — returns
   * a `Result<T>` discriminated union. For async schemas (those with a
   * `refine(asyncFn)` or `transform(asyncFn)`) use {@link parseAsync}.
   *
   * @example
   * ```ts
   * const r = schema.parse(input)
   * if (r.ok) console.log(r.value)
   * else console.log(r.issues)
   * ```
   */
  parse(input: unknown): Result<T> {
    const compiled = this._getCompiled()
    const ctx = makeCtx()
    const value = compiled(input, ctx)
    // Runtime async detection: sync transforms/refines work normally;
    // only refuse `.parse` when a fn ACTUALLY returned a Promise.
    if (value instanceof Promise) {
      return {
        ok: false,
        issues: [
          {
            message: '[Pyreon] schema is async — use parseAsync(input) instead of parse()',
            path: [],
          } satisfies StandardSchemaIssue,
        ],
      }
    }
    if (ctx.issues.length > 0) return { ok: false, issues: ctx.issues }
    return ctx.pending && ctx.pending.length > 0
      ? { ok: true, value: value as T, pending: ctx.pending }
      : { ok: true, value: value as T }
  }

  /**
   * Async variant of {@link parse}. Always returns a Promise; the
   * resolved value is the same `Result<T>` shape. Use for schemas
   * whose `.refine` / `.transform` returns a Promise.
   */
  async parseAsync(input: unknown, options?: { context?: unknown }): Promise<Result<T>> {
    const compiled = this._getCompiled()
    const ctx = makeCtx()
    // Thread the opaque server context (DB handle, request, …) to
    // `.serverCheck` validators. Undefined on the client; the server passes it.
    if (options && 'context' in options) ctx.context = options.context
    let value: unknown
    try {
      value = await compiled(input, ctx)
    } catch (err) {
      return {
        ok: false,
        issues: [
          {
            message: `[Pyreon] parse threw: ${err instanceof Error ? err.message : String(err)}`,
            path: [],
          } satisfies StandardSchemaIssue,
        ],
      }
    }
    if (ctx.issues.length > 0) return { ok: false, issues: ctx.issues }
    return ctx.pending && ctx.pending.length > 0
      ? { ok: true, value: value as T, pending: ctx.pending }
      : { ok: true, value: value as T }
  }

  /**
   * Parse and throw on failure. Returns the parsed value directly.
   * Use when you want Zod-style throwing semantics — the throw is a
   * `ValidationError` with the issues array attached.
   */
  parseOrThrow(input: unknown): T {
    const r = this.parse(input)
    if (!r.ok) throw new ValidationError(r.issues)
    return r.value
  }

  /** Zod-compat alias for {@link parse}. */
  safeParse(input: unknown): Result<T> {
    return this.parse(input)
  }

  // ─── Standard Schema v1 contract ──────────────────────────────────────

  /**
   * Standard Schema v1 protocol (https://standardschema.dev). Lets
   * Pyreon-validate schemas drop into any StdSchema-aware consumer —
   * `@pyreon/form` via `bindSchema()`, `@pyreon/feature`, third-party
   * libraries that adopted the spec, etc.
   */
  get ['~standard'](): StandardSchemaV1<unknown, T>['~standard'] {
    const validate = (input: unknown) => {
      const compiled = this._getCompiled()
      const ctx = makeCtx()
      const value = compiled(input, ctx)
      if (value instanceof Promise) {
        return value.then((resolved) => {
          if (ctx.issues.length > 0) return { issues: ctx.issues }
          return { value: resolved as T }
        })
      }
      if (ctx.issues.length > 0) return { issues: ctx.issues }
      return { value: value as T }
    }
    return {
      version: 1 as const,
      vendor: 'pyreon-validate',
      validate,
    }
  }

  // ─── Chainable modifiers (every schema gets these) ────────────────────

  /**
   * Mark this schema as optional — input may be `undefined`. The
   * resulting type is `T | undefined`. (Modifier classes wrap the
   * schema and refine its output type.)
   */
  optional(): OptionalSchema<T> {
    return new OptionalSchema<T>(this)
  }

  /** Mark this schema as nullable — input may be `null`. Output: `T | null`. */
  nullable(): NullableSchema<T> {
    return new NullableSchema<T>(this)
  }

  /** Mark this schema as nullish — input may be `null` or `undefined`. */
  nullish(): NullishSchema<T> {
    return new NullishSchema<T>(this)
  }

  /**
   * Apply a default value when the input is `undefined`. The output
   * type stays `T` (default fills in for absent input).
   */
  default(value: T | (() => T)): DefaultSchema<T> {
    return new DefaultSchema<T>(this, value)
  }

  /**
   * Transform the parsed value to a new shape. The result schema's
   * output type is `U`; input remains the original `T`'s input.
   *
   * @example
   * ```ts
   * const trimmed = s.string().transform(s => s.trim())
   * const stringified = s.number().transform(n => String(n))
   * ```
   */
  transform<U>(fn: (value: T) => U | Promise<U>): TransformSchema<T, U> {
    return new TransformSchema<T, U>(this, fn)
  }

  /**
   * Add a custom constraint. The predicate runs after type-check + all
   * other checks. Receives the parsed value; returns `true` if valid.
   *
   * @example
   * ```ts
   * s.string().refine(s => s.length > 0, {
   *   message: 'Must not be empty',
   *   key: 'common.required',
   *   code: 'too_small',
   * })
   * ```
   */
  refine(
    fn: (value: T) => boolean | Promise<boolean>,
    opts: {
      message: string
      code?: string
      key?: string
      params?: Record<string, unknown>
      fallback?: string
    },
  ): this {
    this._ops.push({ kind: 'refine', fn: fn as (v: unknown) => boolean | Promise<boolean>, opts })
    this._invalidateCompile()
    return this
  }

  /**
   * Wrap this schema in an array — `s.string().array()` ≡ `s.array(s.string())`
   * (Zod's `.array()`). Sugar for the common "list of X" shape.
   *
   * @example s.string().array().parse(['a', 'b']) // → { ok: true, value: ['a','b'] }
   */
  array(): ArraySchema<T> {
    return requireFactory(_arrayFactory)(this) as ArraySchema<T>
  }

  /**
   * Union this schema with another — `a.or(b)` ≡ `s.union(a, b)` (Zod's `.or`).
   * Output type is `T | U`.
   *
   * @example s.string().or(s.number()) // Schema<string | number>
   */
  or<U>(other: Schema<U>): UnionSchema<readonly [Schema<T>, Schema<U>]> {
    return requireFactory(_unionFactory)(this, other) as UnionSchema<readonly [Schema<T>, Schema<U>]>
  }

  /**
   * Intersect this schema with another — `a.and(b)` ≡ `s.intersection(a, b)`
   * (Zod's `.and`). Output type is `T & U`.
   *
   * @example s.object({ a: s.string() }).and(s.object({ b: s.number() }))
   */
  and<U>(other: Schema<U>): IntersectionSchema<T, U> {
    return requireFactory(_intersectionFactory)(this, other) as IntersectionSchema<T, U>
  }

  /**
   * A server-only check, resolved against a registry `key` installed behind
   * `@pyreon/validate/server` (via `registerServerCheck`). The shared schema
   * carries ONLY the `key` + the issue `opts` — never the (heavy / async /
   * privileged) implementation — so the check is:
   *
   *   - **client**: a no-op that records a `pending` entry on the result (the
   *     "valid so far, pending server" contract). Zero heavy code shipped.
   *   - **server**: the registered validator runs, receiving the parse context
   *     from `parseAsync(input, { context })`, producing an authoritative issue.
   *
   * Use for uniqueness, breach-checks, MX existence, DB cross-field rules.
   *
   * @example
   * // shared schema (client bundle carries only 'email-unique'):
   * const email = s.string().email().serverCheck('email-unique', { message: 'Email already registered' })
   * // server-only module:
   * registerServerCheck('email-unique', async (v, ctx) => !(await ctx.db.userExists(v as string)))
   */
  serverCheck(
    key: string,
    opts?: {
      message?: string
      code?: string
      /** i18n key for the issue (distinct from the registry `key`). */
      key?: string
      params?: Record<string, unknown>
      fallback?: string
    },
  ): this {
    // Spread first, then force a resolved string message (so an explicit
    // `message: undefined` can't override the default).
    this._ops.push({
      kind: 'serverCheck',
      key,
      opts: { ...opts, message: opts?.message ?? `Failed server check: ${key}` },
    })
    this._invalidateCompile()
    return this
  }

  /**
   * Brand the output type with a phantom marker. Doesn't affect parse;
   * is purely a type-level annotation to prevent mixing of structurally-
   * identical-but-semantically-distinct values (e.g. `UserId` vs
   * `PostId` both being `string`).
   */
  brand<TBrand extends string>(): Schema<T & { readonly __brand: TBrand }> {
    this._ops.push({ kind: 'brand' })
    this._invalidateCompile()
    return this as unknown as Schema<T & { readonly __brand: TBrand }>
  }

  /**
   * Attach human-readable description metadata. Read via the
   * `getMeta(schema)` helper. Note: also accessible via `.field({
   * hint })` — `describe` is the Zod-compatible alias.
   */
  describe(text: string): this {
    this._ops.push({ kind: 'describe', text })
    // Also mirror to the Symbol-keyed meta slot so `getMeta` sees it as `hint`.
    const existing = (this as { [META_SLOT]?: FieldMeta })[META_SLOT]
    const meta: FieldMeta = { ...existing, hint: text }
    Object.defineProperty(this, META_SLOT, {
      value: meta,
      enumerable: false,
      configurable: true,
      writable: false,
    })
    return this
  }

  /**
   * Attach Pyreon field metadata (label / hint / placeholder / i18n
   * keys / autoFocus / autoComplete / defaultValue). Read via
   * `getMeta(schema)` or `useField` in `@pyreon/form`. Schema-aware
   * UI surfaces use this to drive labels + i18n.
   *
   * Mirrors the `withField(schema, meta)` standalone helper —
   * both produce identical output; the chainable method is sugar.
   */
  field(meta: FieldMeta): this {
    const existing = (this as { [META_SLOT]?: FieldMeta })[META_SLOT]
    const merged: FieldMeta = existing ? { ...existing, ...meta } : meta
    Object.defineProperty(this, META_SLOT, {
      value: merged,
      enumerable: false,
      configurable: true,
      writable: false,
    })
    return this
  }

  // ─── Subclass hook ────────────────────────────────────────────────────

  /**
   * Subclasses implement this to add their type-check step + any
   * subclass-specific logic to the compiled validator. Default: no-op
   * (passes through). Composition schemas (object, array, etc.)
   * override extensively.
   *
   * The hook runs AFTER modifier handling (optional/nullable/default)
   * and BEFORE generic check ops.
   */
  _compileType(_input: unknown, _ctx: ParseCtx): unknown {
    return _input
  }

  // ─── Compiler — the hot path ─────────────────────────────────────────

  /** Invalidate the cached closure (called when ops change). */
  _invalidateCompile(): void {
    this._compiled = undefined
  }

  /** Build (or fetch cached) compiled validator. */
  private _getCompiled(): SyncValidator {
    if (!this._compiled) {
      // Try the JIT fast path first (pure object-of-primitives shapes);
      // fall back to the interpreted compiler for everything else.
      this._compiled = tryCompileJit(this) ?? compileSchema(this)
    }
    return this._compiled
  }

  /**
   * Composition fast path. Runs this schema's compiled validator against
   * the caller's SHARED `ctx` — issues accumulate directly (with the
   * caller's already-pushed path) and no per-field `ctx` / result object
   * is allocated. The return value is the (possibly transformed) value, or
   * a `Promise` if an async transform/refine fired (the caller treats that
   * as an async-in-sync error). Used by object / array / record / tuple
   * instead of the allocation-heavy `~standard.validate` per child.
   */
  _runInto(input: unknown, ctx: ParseCtx): unknown {
    return this._getCompiled()(input, ctx)
  }
}

/**
 * Compile a schema's ops list into a single sync validator function.
 * Called once per schema (cached). The returned function runs:
 *
 *   1. Modifier prelude (optional/nullable/default/nullish handling)
 *   2. Subclass type-check (`_compileType` hook)
 *   3. Each check op in order
 *   4. Each transform op (in declaration order)
 *   5. Each refine op (after transforms, against the transformed value)
 *
 * Async functions returned by transform/refine are awaited downstream
 * by `parseAsync` / `~standard.validate`'s async wrapper.
 */
export function compileSchema<T>(schema: Schema<T>): SyncValidator {
  // Lazily resolve checks at compile time so the runtime hot path is
  // just sequential function calls.
  const modifiers = scanModifiers(schema._ops)
  const checks = scanChecks(schema._ops)
  const transforms = scanTransforms(schema._ops)
  const refines = scanRefines(schema._ops)
  const serverChecks = scanServerChecks(schema._ops)

  // Bind the type-check hook to `schema` so subclass overrides fire.
  const typeCheck: SyncValidator = (input, ctx) =>
    (
      schema as unknown as {
        _compileType(input: unknown, ctx: ParseCtx): unknown
      }
    )._compileType(input, ctx)

  return function compiled(input, ctx): unknown {
    // 1. Modifier prelude.
    if (input === undefined) {
      if (modifiers.hasDefault) {
        const dv = modifiers.defaultValue
        input = typeof dv === 'function' ? (dv as () => unknown)() : dv
      } else if (modifiers.isOptional || modifiers.isNullish) {
        return undefined
      }
      // else: fall through — let the type-check emit a "required" issue.
    }
    if (input === null) {
      if (modifiers.isNullable || modifiers.isNullish) return null
      // else: fall through.
    }

    // 2. Type-check.
    const issuesBefore = ctx.issues.length
    const typed = typeCheck(input, ctx)
    if (ctx.issues.length > issuesBefore) {
      // Type-check failed — don't continue to checks/transforms/refines.
      return typed
    }

    // A composite type-check (object/array with an async field — async
    // `.serverCheck` / `.refine` under parseAsync) returns a Promise. Defer the
    // rest of the pipeline (checks/transforms/refines/serverChecks all run
    // against the RESOLVED value, never the Promise). The all-sync path never
    // allocates a Promise here.
    if (typed instanceof Promise) {
      return typed.then((resolved) =>
        // A field-level async check may have pushed issues during resolution —
        // skip the object's own pipeline in that case (parity with the sync
        // early-return above).
        ctx.issues.length > issuesBefore ? resolved : runPostType(resolved, ctx),
      )
    }
    return runPostType(typed, ctx)
  }

  // Steps 3-6 against an already-type-checked value (sync or post-await).
  function runPostType(value: unknown, ctx: ParseCtx): unknown {
    // 3. Checks (ordered).
    for (const check of checks) {
      check(value, ctx)
    }

    // 4. Transforms — apply in declaration order. Sync if all
    //    transforms returned non-Promise; otherwise the result is a
    //    Promise the async path will await.
    if (transforms.length > 0) {
      value = applyTransforms(value, transforms)
    }

    // 5. Refines — run last, against the transformed value.
    if (refines.length > 0) {
      value = applyRefines(value, refines, ctx)
    }

    // 6. Server-only checks — registered validator runs (server) or the check
    //    is deferred + recorded on `ctx.pending` (client / not installed).
    if (serverChecks.length > 0) {
      value = applyServerChecks(value, serverChecks, ctx)
    }

    return value
  }
}

interface ModifierSet {
  isOptional: boolean
  isNullable: boolean
  isNullish: boolean
  hasDefault: boolean
  defaultValue: unknown
}

function scanModifiers(ops: ReadonlyArray<Op>): ModifierSet {
  const out: ModifierSet = {
    isOptional: false,
    isNullable: false,
    isNullish: false,
    hasDefault: false,
    defaultValue: undefined,
  }
  for (const op of ops) {
    switch (op.kind) {
      case 'optional':
        out.isOptional = true
        break
      case 'nullable':
        out.isNullable = true
        break
      case 'nullish':
        out.isNullish = true
        out.isOptional = true
        out.isNullable = true
        break
      case 'default':
        out.hasDefault = true
        out.defaultValue = op.value
        break
    }
  }
  return out
}

type CheckFn = (value: unknown, ctx: ParseCtx) => void

function scanChecks(ops: ReadonlyArray<Op>): ReadonlyArray<CheckFn> {
  // The actual check implementations live in `../checks/*` and are
  // resolved by the per-type schemas at instantiation. Here we just
  // collect the `_checkFn` payload the schema attached.
  const fns: CheckFn[] = []
  for (const op of ops) {
    if (op.kind.startsWith('check:')) {
      const fn = (op as { _checkFn?: CheckFn })._checkFn
      if (fn) fns.push(fn)
    }
  }
  return fns
}

function scanTransforms(
  ops: ReadonlyArray<Op>,
): ReadonlyArray<(v: unknown) => unknown | Promise<unknown>> {
  const fns: Array<(v: unknown) => unknown | Promise<unknown>> = []
  for (const op of ops) {
    if (op.kind === 'transform') fns.push(op.fn)
  }
  return fns
}

interface RefineSpec {
  fn: (value: unknown) => boolean | Promise<boolean>
  opts: {
    message: string
    code?: string
    key?: string
    params?: Readonly<Record<string, unknown>>
    fallback?: string
  }
}

function scanRefines(ops: ReadonlyArray<Op>): ReadonlyArray<RefineSpec> {
  const fns: RefineSpec[] = []
  for (const op of ops) {
    if (op.kind === 'refine') fns.push({ fn: op.fn, opts: op.opts })
  }
  return fns
}

function applyTransforms(
  value: unknown,
  transforms: ReadonlyArray<(v: unknown) => unknown | Promise<unknown>>,
): unknown | Promise<unknown> {
  let current: unknown | Promise<unknown> = value
  for (const t of transforms) {
    current = current instanceof Promise ? current.then(t) : t(current)
  }
  return current
}

function applyRefines(
  value: unknown,
  refines: ReadonlyArray<RefineSpec>,
  ctx: ParseCtx,
): unknown | Promise<unknown> {
  if (value instanceof Promise) {
    return value.then((resolved) => applyRefinesSync(resolved, refines, ctx))
  }
  return applyRefinesSync(value, refines, ctx)
}

function applyRefinesSync(
  value: unknown,
  refines: ReadonlyArray<RefineSpec>,
  ctx: ParseCtx,
): unknown {
  for (const r of refines) {
    const ok = r.fn(value)
    if (ok instanceof Promise) {
      // Promote to async by returning the awaited check.
      // We rebuild the remaining-refines chain as a Promise.
      const rest = refines.slice(refines.indexOf(r))
      return Promise.resolve().then(async () => {
        for (const rr of rest) {
          const passed = await rr.fn(value)
          if (!passed) {
            ctx.issues.push(makeRefineIssue(rr.opts, ctx.path))
          }
        }
        return value
      })
    }
    if (!ok) {
      ctx.issues.push(makeRefineIssue(r.opts, ctx.path))
    }
  }
  return value
}

function makeRefineIssue(opts: RefineSpec['opts'], path: ParseCtx['path']): PyreonIssue {
  const issue: PyreonIssue = { message: opts.message, path: path.slice() }
  if (opts.code !== undefined) (issue as { code?: string }).code = opts.code
  if (opts.key !== undefined) (issue as { key?: string }).key = opts.key
  if (opts.params !== undefined)
    (issue as { params?: Readonly<Record<string, unknown>> }).params = opts.params
  if (opts.fallback !== undefined) (issue as { fallback?: string }).fallback = opts.fallback
  return issue
}

// ─── Server-only checks (`.serverCheck`) ────────────────────────────────────

interface ServerCheckSpec {
  key: string
  opts: RefineSpec['opts']
}

function scanServerChecks(ops: ReadonlyArray<Op>): ReadonlyArray<ServerCheckSpec> {
  const out: ServerCheckSpec[] = []
  for (const op of ops) {
    if (op.kind === 'serverCheck') out.push({ key: op.key, opts: op.opts })
  }
  return out
}

function applyServerChecks(
  value: unknown,
  specs: ReadonlyArray<ServerCheckSpec>,
  ctx: ParseCtx,
): unknown | Promise<unknown> {
  if (value instanceof Promise) {
    return value.then((resolved) => applyServerChecksSync(resolved, specs, ctx))
  }
  return applyServerChecksSync(value, specs, ctx)
}

function applyServerChecksSync(
  value: unknown,
  specs: ReadonlyArray<ServerCheckSpec>,
  ctx: ParseCtx,
): unknown | Promise<unknown> {
  for (let i = 0; i < specs.length; i++) {
    const sc = specs[i]!
    const fn = getServerCheck(sc.key)
    if (!fn) {
      // Not installed (the client, or a server that didn't register it): defer.
      // Record the pending check and let the value pass — the SERVER is the
      // authoritative re-validation. Path is snapshotted now (sync).
      ;(ctx.pending ??= []).push({ path: ctx.path.slice(), key: sc.key })
      continue
    }
    const ok = fn(value, ctx.context)
    if (ok instanceof Promise) {
      // A registered async check — promote the remaining checks to async.
      // Snapshot the path NOW: it unwinds (object field pop) before resolve.
      const rest = specs.slice(i)
      const pathSnap = ctx.path.slice()
      return Promise.resolve().then(async () => {
        for (const r of rest) {
          const f = getServerCheck(r.key)
          if (!f) {
            ;(ctx.pending ??= []).push({ path: pathSnap, key: r.key })
            continue
          }
          const passed = await f(value, ctx.context)
          if (!passed) ctx.issues.push(makeRefineIssue(r.opts, pathSnap))
        }
        return value
      })
    }
    if (!ok) ctx.issues.push(makeRefineIssue(sc.opts, ctx.path))
  }
  return value
}

// ─── Modifier wrapper classes (kept minimal — they forward to base) ──

/**
 * Wraps an inner schema, adding `undefined` to its output type. Modifier
 * classes exist primarily for type inference — the runtime modifier
 * behaviour is handled by the inner schema's compiled validator (which
 * sees the `optional` op via the prelude).
 */
export class OptionalSchema<T> extends Schema<T | undefined> {
  readonly _kind = 'optional' as const
  /** The wrapped schema — exposed so `ObjectSchema.required()` can unwrap it. */
  readonly inner: Schema<T>

  constructor(inner: Schema<T>) {
    super()
    this.inner = inner
    this._ops = [{ kind: 'optional' }, ...inner._ops]
    // Hoist the inner's type-check.
    ;(this as unknown as { _compileType: typeof inner._compileType })._compileType = (
      inner as unknown as { _compileType: typeof inner._compileType }
    )._compileType.bind(inner)
  }
}

export class NullableSchema<T> extends Schema<T | null> {
  readonly _kind = 'nullable' as const

  constructor(inner: Schema<T>) {
    super()
    this._ops = [{ kind: 'nullable' }, ...inner._ops]
    ;(this as unknown as { _compileType: typeof inner._compileType })._compileType = (
      inner as unknown as { _compileType: typeof inner._compileType }
    )._compileType.bind(inner)
  }
}

export class NullishSchema<T> extends Schema<T | null | undefined> {
  readonly _kind = 'nullish' as const
  /** The wrapped schema — exposed so `ObjectSchema.required()` can unwrap it. */
  readonly inner: Schema<T>

  constructor(inner: Schema<T>) {
    super()
    this.inner = inner
    this._ops = [{ kind: 'nullish' }, ...inner._ops]
    ;(this as unknown as { _compileType: typeof inner._compileType })._compileType = (
      inner as unknown as { _compileType: typeof inner._compileType }
    )._compileType.bind(inner)
  }
}

export class DefaultSchema<T> extends Schema<T> {
  readonly _kind = 'default' as const

  constructor(inner: Schema<T>, value: T | (() => T)) {
    super()
    this._ops = [{ kind: 'default', value }, ...inner._ops]
    ;(this as unknown as { _compileType: typeof inner._compileType })._compileType = (
      inner as unknown as { _compileType: typeof inner._compileType }
    )._compileType.bind(inner)
  }
}

export class TransformSchema<TIn, TOut> extends Schema<TOut> {
  readonly _kind = 'transform' as const

  constructor(inner: Schema<TIn>, fn: (value: TIn) => TOut | Promise<TOut>) {
    super()
    this._ops = [
      ...inner._ops,
      { kind: 'transform', fn: fn as (v: unknown) => unknown | Promise<unknown> },
    ]
    ;(this as unknown as { _compileType: typeof inner._compileType })._compileType = (
      inner as unknown as { _compileType: typeof inner._compileType }
    )._compileType.bind(inner)
  }
}

/**
 * Internal helper — attach a check function to a check Op. Used by the
 * primitive subclasses' chainable methods so the compiler doesn't need
 * to know about every check kind.
 */
export function attachCheck(op: Op, fn: (value: unknown, ctx: ParseCtx) => void): Op {
  ;(op as { _checkFn?: typeof fn })._checkFn = fn
  return op
}

// ─── Helper: build a CheckOpts-aware issue for built-in checks ───────

export function makeCheckIssue(
  code: string,
  message: string,
  key: string,
  params: Readonly<Record<string, unknown>>,
  fallback: string,
  ctx: ParseCtx,
  opts?: CheckOpts,
): PyreonIssue {
  const issue: PyreonIssue = {
    message: opts?.message ?? message,
    path: ctx.path.slice(), // snapshot — ctx.path is mutated during parse
  }
  ;(issue as { code?: string }).code = opts?.code ?? code
  ;(issue as { key?: string }).key = opts?.key ?? key
  ;(issue as { params?: Readonly<Record<string, unknown>> }).params = opts?.params ?? params
  ;(issue as { fallback?: string }).fallback = opts?.fallback ?? fallback
  return issue
}
