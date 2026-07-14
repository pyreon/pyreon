/**
 * Op shape — the building block of every Pyreon-validate schema. A
 * schema is a `kind` (the primitive/composition type) plus an ordered
 * list of Ops. Each Op is one of:
 *
 *   - a **check** (`{ kind: 'check:string:min', ...args }`) — runs a
 *     constraint against the input value, may emit an issue
 *   - a **modifier** (`{ kind: 'optional' | 'nullable' | 'default' }`)
 *     — adjusts the type / fallback behavior
 *   - a **transform** (`{ kind: 'transform', fn }`) — maps the value
 *     to a different shape
 *   - a **refine** (`{ kind: 'refine', fn, opts }`) — user-supplied
 *     constraint, possibly async
 *
 * Schema's `_ops` is just an array of these. At parse time, the schema
 * compiles the ops into a single closure (one-time) and re-uses it for
 * every subsequent parse — the perf trick that gives us Zod-like DX at
 * Valibot-class speed.
 */

import type { PathSegment, PyreonIssue } from './issue'

// ─── Op discriminator ──────────────────────────────────────────────────────

export type Op =
  | StringCheckOp
  | NumberCheckOp
  | ArrayCheckOp
  | CollectionCheckOp
  | DateCheckOp
  | BigIntCheckOp
  | ModifierOp
  | TransformOp
  | RefineOp
  | ServerCheckOp
  | CatchOp
  | FieldMetaOp
  | DescribeOp

// ─── String checks ─────────────────────────────────────────────────────────

export type StringCheckOp =
  | { kind: 'check:string:min'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:string:max'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:string:length'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:string:regex'; re: RegExp; opts?: CheckOpts | undefined }
  | { kind: 'check:string:email'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:phone'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:ip'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:creditcard'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:url'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:uuid'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:cuid2'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:ulid'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:nanoid'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:emoji'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:base64'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:base64url'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:jwt'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:cuid'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:cidr'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:duration'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:e164'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:iso:date'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:iso:datetime'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:iso:time'; opts?: CheckOpts | undefined }
  | { kind: 'check:string:starts-with'; s: string; opts?: CheckOpts | undefined }
  | { kind: 'check:string:ends-with'; s: string; opts?: CheckOpts | undefined }
  | { kind: 'check:string:includes'; s: string; opts?: CheckOpts | undefined }
  | { kind: 'check:string:to-lower-case' }
  | { kind: 'check:string:to-upper-case' }
  | { kind: 'check:string:trim' }
  | { kind: 'check:string:nonempty'; opts?: CheckOpts | undefined }

// ─── Number checks ─────────────────────────────────────────────────────────

export type NumberCheckOp =
  | { kind: 'check:number:min'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:number:max'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:number:gt'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:number:lt'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:number:safe'; opts?: CheckOpts | undefined }
  | { kind: 'check:number:int'; opts?: CheckOpts | undefined }
  | { kind: 'check:number:finite'; opts?: CheckOpts | undefined }
  | { kind: 'check:number:positive'; opts?: CheckOpts | undefined }
  | { kind: 'check:number:negative'; opts?: CheckOpts | undefined }
  | { kind: 'check:number:non-negative'; opts?: CheckOpts | undefined }
  | { kind: 'check:number:non-positive'; opts?: CheckOpts | undefined }
  | { kind: 'check:number:between'; lo: number; hi: number; opts?: CheckOpts | undefined }
  | { kind: 'check:number:multiple-of'; n: number; opts?: CheckOpts | undefined }

// ─── Array checks ──────────────────────────────────────────────────────────

export type ArrayCheckOp =
  | { kind: 'check:array:min'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:array:max'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:array:length'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:array:nonempty'; opts?: CheckOpts | undefined }

// ─── Collection (Set / Map) size checks ──────────────────────────────────────
// Both Set and Map expose `.size`, so one op family covers both.
export type CollectionCheckOp =
  | { kind: 'check:collection:min'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:collection:max'; n: number; opts?: CheckOpts | undefined }
  | { kind: 'check:collection:size'; n: number; opts?: CheckOpts | undefined }

// ─── Date checks ───────────────────────────────────────────────────────────

export type DateCheckOp =
  | { kind: 'check:date:min'; d: Date; opts?: CheckOpts | undefined }
  | { kind: 'check:date:max'; d: Date; opts?: CheckOpts | undefined }

// ─── BigInt checks ─────────────────────────────────────────────────────────

export type BigIntCheckOp =
  | { kind: 'check:bigint:min'; n: bigint; opts?: CheckOpts | undefined }
  | { kind: 'check:bigint:max'; n: bigint; opts?: CheckOpts | undefined }
  | { kind: 'check:bigint:positive'; opts?: CheckOpts | undefined }
  | { kind: 'check:bigint:negative'; opts?: CheckOpts | undefined }
  | { kind: 'check:bigint:multiple-of'; n: bigint; opts?: CheckOpts | undefined }
  | { kind: 'check:bigint:gt'; n: bigint; opts?: CheckOpts | undefined }
  | { kind: 'check:bigint:lt'; n: bigint; opts?: CheckOpts | undefined }
  | { kind: 'check:bigint:between'; lo: bigint; hi: bigint; opts?: CheckOpts | undefined }

// ─── Modifiers ─────────────────────────────────────────────────────────────

export type ModifierOp =
  | { kind: 'optional' }
  | { kind: 'nullable' }
  | { kind: 'nullish' }
  | { kind: 'default'; value: unknown }
  | { kind: 'brand' }
// `describe` and `field` are metadata-only — they don't participate in
// the parse pipeline. Kept separately so the compiler can skip them.

export type DescribeOp = { kind: 'describe'; text: string }

export type FieldMetaOp = { kind: 'field-meta'; meta: Readonly<Record<string, unknown>> }

// ─── Transform + Refine ────────────────────────────────────────────────────

export type TransformOp = {
  kind: 'transform'
  fn: (value: unknown) => unknown | Promise<unknown>
}

export type RefineOp = {
  kind: 'refine'
  fn: (value: unknown) => boolean | Promise<boolean>
  opts: {
    code?: string
    message: string
    key?: string
    params?: Readonly<Record<string, unknown>>
    fallback?: string
  }
}

/**
 * A server-only check (`.serverCheck(key)`). The schema carries only the
 * registry KEY + the issue opts — never the (possibly heavy/async/privileged)
 * implementation. The actual validator is `installServerCheck`-ed behind
 * `@pyreon/validate/server`, so it stays out of the client bundle. On the
 * client the key is unregistered → the check is a NO-OP that records a
 * `pending` entry; on the server the registered fn runs (with parse context).
 */
export type ServerCheckOp = {
  kind: 'serverCheck'
  /** Registry key — the link between the shared schema and the server-installed validator. */
  key: string
  opts: {
    code?: string
    message: string
    /** i18n key for the issue (distinct from the registry `key` above). */
    key?: string
    params?: Readonly<Record<string, unknown>>
    fallback?: string
  }
}

/**
 * `.catch(fallback)` — on parse FAILURE, discard the issues this schema
 * produced and substitute a fallback instead of erroring. `value` is either a
 * static fallback or a function of the raw input. Always the LAST op so it sees
 * the issues from every preceding step.
 */
export type CatchOp = {
  kind: 'catch'
  value: unknown | ((input: unknown) => unknown)
}

// ─── Shared options ────────────────────────────────────────────────────────

/**
 * Per-check customization. Lets users override the default `code` /
 * `key` / `params` / `fallback` / `message` for any built-in check.
 *
 * @example
 * ```ts
 * s.string().min(2, { key: 'profile.name.too-short', fallback: 'Name too short' })
 * ```
 */
export interface CheckOpts {
  readonly code?: string
  readonly message?: string
  readonly key?: string
  readonly params?: Readonly<Record<string, unknown>>
  readonly fallback?: string
}

// ─── Parse context ─────────────────────────────────────────────────────────

/**
 * Threaded through the parse closure — accumulates issues and tracks
 * the current path. Mutated in place for perf (single allocation per
 * parse, not per check).
 */
export interface ParseCtx {
  issues: PyreonIssue[]
  path: PathSegment[]
  /**
   * Server-only checks (`.serverCheck`) encountered whose validator is NOT
   * installed (the client) — the "valid so far, pending server" contract.
   * Surfaced on `Result.pending` so the form/UX layer can defer the field's
   * verdict and show a "checking…" affordance.
   */
  pending?: PendingCheck[]
  /**
   * Opaque server context (DB handle, request, session, …) threaded by
   * `parseAsync(input, { context })` to `serverCheck` validators. `undefined`
   * on the client (server-only checks are no-ops there).
   */
  context?: unknown
}

/** A server-only check deferred on the client (its validator wasn't installed). */
export interface PendingCheck {
  readonly path: ReadonlyArray<PathSegment>
  readonly key: string
}

/**
 * Shared, NEVER-mutated empty-path sentinel. `makeCtx` starts every parse's
 * `path` here so a parse that never descends into a keyed position (a scalar,
 * or a flat object/array the JIT validates with path elision) allocates ZERO
 * path arrays — halving the per-parse ctx allocation (measured ~2× throughput
 * on scalar/flat-object valid parses, the dominant shapes). READS work
 * directly on the sentinel (`.slice()` / spread of an empty array). The ONLY
 * places that MUTATE `path` — the composition interpreters' key/index
 * push/pop, the union path-restore splice, and the JIT's flush / format-check
 * wrappers — go through {@link mutablePath} first, which swaps the sentinel
 * for a fresh per-parse array on first write. FROZEN so a missed write site
 * throws loudly (caught by the test + differential-fuzz suite) rather than
 * silently corrupting the shared sentinel across parses. Typed as the mutable
 * `PathSegment[]` (the ctx field's type) — a deliberate, safe lie, since
 * nothing ever writes through this reference.
 */
export const EMPTY_PATH: PathSegment[] = Object.freeze([]) as unknown as PathSegment[]

/**
 * Return a WRITABLE `ctx.path`, swapping the shared {@link EMPTY_PATH}
 * sentinel for a fresh per-parse array on first mutation. Call before any
 * `push`/`splice`; subsequent reads + the paired `pop` see the real array.
 */
export function mutablePath(ctx: ParseCtx): PathSegment[] {
  if (ctx.path === EMPTY_PATH) ctx.path = []
  return ctx.path
}

export function makeCtx(): ParseCtx {
  return { issues: [], path: EMPTY_PATH }
}
