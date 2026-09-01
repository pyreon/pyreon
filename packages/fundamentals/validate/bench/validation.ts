#!/usr/bin/env bun
/**
 * Validation-library comparison benchmark — Pyreon `s` vs the six most-used
 * TypeScript validators, in seven entries (Zod appears twice: interpreted, and
 * through the compiler it shipped in 4.5). Three of them JIT-compile.
 *
 *   pyreon    @pyreon/validate `s`      (JIT: lazy codegen on first parse)
 *   zod       zod 4                     (interpreted)
 *   zod-c     zod 4 `z.compile(schema)` (JIT — new in Zod 4.5)
 *   valibot   valibot 1                 (interpreted, tree-shakeable)
 *   arktype   arktype 2                 (JIT at schema-definition time)
 *   typebox   @sinclair/typebox         (JIT via `TypeCompiler.Compile`)
 *   typia     typia 14                  (AHEAD-OF-TIME: codegen from a TS type)
 *   yup       yup 1                     (interpreted)
 *   joi       joi 18                    (interpreted)
 *
 * plus ONE control row that is not a competitor:
 *
 *   pyreon-legacy-is  `parse(i).ok` — what `.is()` did before the verdict-only
 *                     JIT, so the before/after of that change is measured in
 *                     THIS run rather than against an older one. Excluded from
 *                     every winner and tie set.
 *
 * DELIBERATELY NOT INCLUDED, so the omissions are choices rather than gaps:
 * `superstruct` (2.0.2, last published 2024, does not implement Standard Schema)
 * and `effect/Schema` (Standard Schema only through an explicit adapter, and its
 * schema surface is not expressible in the same terms as the others without
 * changing what each cell measures). Both can be added — the lib table is the
 * only thing that would change — but neither is a JIT competitor, which is the
 * question this suite exists to answer.
 *
 * TWO AXES, because these libraries do not all return the same thing:
 *
 *   parse — produce a validated OUTPUT value. Pyreon/Zod/Valibot/Yup/Joi
 *           return a new (stripped/cast) object; ArkType returns the input
 *           ALIASED on success (it does not clone, so it structurally pays
 *           less — a standing, disclosed asymmetry). TypeBox has no
 *           output-producing equivalent to these, so it does NOT run on this
 *           axis rather than be given a cheaper call and scored against it.
 *   check — boolean verdict only, each library's cheapest such API:
 *           pyreon `.is`, valibot `v.is`, arktype `.allows`,
 *           typebox `.Check`, yup `.isValidSync`, joi `.validate().error`.
 *           **Zod has no boolean-only API** (neither interpreted nor
 *           compiled), so its `check` cells run a full `safeParse().success`
 *           — it is doing strictly more work there, and that is a property
 *           of Zod's API surface, not a trick of this harness. Called out
 *           again in the printed footer so no one quotes that row blind.
 *
 * Methodology (the repo's fundamentals-bench standard):
 *  - NODE_ENV=production before any import.
 *  - Equivalent schema semantics across every library, expressed in each
 *    one's OWN idiom. Casting is disabled where a library casts by default
 *    (yup `strict: true`, joi `convert: false`) — otherwise they would
 *    ACCEPT inputs the others reject and the row would compare different
 *    work. TypeBox has no built-in `email`, so the scenarios that need one
 *    register a format explicitly; that regex is OURS, not TypeBox's, and
 *    is labelled at the bottom of the report.
 *  - CORRECTNESS GATE before timing: every library must agree on the verdict
 *    for every scenario, on BOTH axes, for every entry of every rotated
 *    input pool. A bench of disagreeing schemas measures different work, so
 *    a disagreement is a hard failure, never a skipped row.
 *  - PER-CELL PROCESS ISOLATION: every (scenario × path × axis × lib) cell
 *    runs in FRESH `bun` child processes, so one library's V8 IC/JIT
 *    pollution can never skew another's numbers.
 *  - ROUND-ROBIN process scheduling across the libraries in a row, so a load
 *    burst on a shared machine spreads over every library instead of landing
 *    on whichever one happened to be running its whole cell at the time.
 *    Verified to matter: running cells library-by-library under contention
 *    produced a Pyreon cell of 155ns against its own 5ns on the interleaved
 *    schedule.
 *  - SAMPLES POOLED ACROSS PROCS (=3) INDEPENDENT PROCESSES per cell: a
 *    within-process CI understates run-to-run variance, so pooling makes the
 *    CI cover process-level jitter and unstable rows correctly surface as
 *    ties instead of coin-flip verdicts.
 *  - Median of the pooled samples + a seeded BOOTSTRAP 95% CI over them;
 *    rows where a competitor's CI overlaps the winner's are marked 🤝 tied
 *    (a bare multiplier like 1.1× may be inside noise).
 *  - Both VALID and INVALID input paths (error-path cost differs a lot).
 *  - SETUP COST is reported separately: an ahead-of-time compiler
 *    (`z.compile`, `TypeCompiler.Compile`) buys its steady-state speed with
 *    a one-off cost that a short-lived process or a cold serverless
 *    invocation may never amortize. Reporting only steady-state would hide
 *    the whole tradeoff those libraries are making.
 *
 * HONEST LIMIT (author-judge): this benchmark is written and judged by the
 * Pyreon authors — same structural caveat as the DOM suite. Only an
 * independent third-party benchmark fully resolves it. Every scenario,
 * input, and competitor call form is in this one file for review.
 *
 * Run: bun bench/validation.ts                 (all libs, both axes)
 *      bun bench/validation.ts --libs pyreon,zod-c,typebox
 *      bun bench/validation.ts --axis check
 *      bun bench/validation.ts --only du.
 *      bun bench/validation.ts --cell K        (internal worker mode)
 */
process.env.NODE_ENV = 'production'

import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'
import { Type, FormatRegistry, type TSchema } from '@sinclair/typebox'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import * as yup from 'yup'
import Joi from 'joi'
// Pre-compiled ahead of time — typia builds its validators from a TYPE at
// COMPILE time and cannot construct them at runtime like every other entry
// here. See `bench/typia/README.md` for why the emitted file is checked in
// and what limits the drift risk.
import * as typiaGen from './typia/generated.js'
import { s } from '../src/v1'

// ─── libraries ─────────────────────────────────────────────────────────
const ALL_LIBS = [
  'pyreon',
  'pyreon-legacy-is',
  'zod',
  'zod-c',
  'valibot',
  'arktype',
  'typebox',
  'typia',
  'yup',
  'joi',
] as const
type Lib = (typeof ALL_LIBS)[number]

/** A library bound to one scenario's schema: the two call forms we time. */
interface Bound {
  /** produce a validated output value (undefined ⇒ this lib skips the parse axis) */
  parse?: (i: unknown) => unknown
  /** cheapest boolean verdict */
  check: (i: unknown) => boolean
}

// TypeBox ships no `email` validator; register the same shape the other
// libraries accept so the correctness gate can pass. DISCLOSED in the footer:
// this regex is ours, so a TypeBox email cell measures our scanner, not theirs.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
FormatRegistry.Set('email', (x) => EMAIL_RE.test(x))

const YUP_OPTS = { strict: true, abortEarly: false } as const
const JOI_OPTS = { convert: false, abortEarly: false } as const

// ─── timing core (worker) ──────────────────────────────────────────────
const now = () => Number(process.hrtime.bigint())

/**
 * Timed batches with an AUTO-SCALED iteration count.
 *
 * A fixed `iters` cannot serve this benchmark: the libraries here span three
 * orders of magnitude per op (ArkType ~16ns, yup ~15µs on the same cell), so
 * one constant either starves the fast libraries of resolution or makes the
 * slow ones take minutes per cell. Instead a short pilot estimates ns/op and
 * `iters` is chosen so every batch runs for roughly the same WALL time —
 * equal timing resolution for every library, bounded cost for the slow ones.
 *
 * `iters` is clamped to a floor so a very fast op still averages over enough
 * work to clear the clock's granularity.
 */
const BATCH_TARGET_NS = 25_000_000 // ~25ms per timed run

/**
 * DEAD-CODE SINK — load-bearing, not decoration.
 *
 * A timed loop that calls a validator with a LOOP-INVARIANT input and then
 * discards the result is a loop-invariant computation, and V8 is entitled to
 * hoist it out of the loop or drop it entirely. That is not hypothetical
 * here: with the batch size raised, ArkType's `string.email` cell fell from
 * ~22ns/op to ~4ns/op and its INVALID cell to ~3ns/op — below the cost of
 * the regex test the check must perform, i.e. the work had stopped
 * happening. A benchmark in that state reports whichever library the
 * optimizer managed to delete the most of.
 *
 * Every measured call therefore feeds its result into this sink through a
 * comparison against a sentinel no validator can ever return, and the sink
 * is written to stdout by the worker. The result is observable, so the call
 * cannot be elided; the added cost is one compare and a never-taken branch.
 */
const NEVER_RETURNED = Symbol('pyreon.bench.sink')
let SINK = 0

function measureSamples(fn: () => void, { warmup = 5_000, runs = 12 } = {}): number[] {
  // Warm up to `warmup` iterations, but stop early once ~150ms has elapsed —
  // a 300µs/op library would otherwise spend a minute here for no extra JIT
  // benefit. A floor of 200 iterations keeps every library properly tiered up.
  const wStart = now()
  for (let i = 0; i < warmup; i++) {
    fn()
    if (i >= 200 && (i & 63) === 0 && now() - wStart > 150_000_000) break
  }

  // pilot: estimate ns/op so the timed batches can be sized
  const pilotIters = 200
  const p0 = now()
  for (let i = 0; i < pilotIters; i++) fn()
  const perOp = Math.max((now() - p0) / pilotIters, 1)
  const iters = Math.max(1_000, Math.min(200_000, Math.round(BATCH_TARGET_NS / perOp)))

  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    const t1 = now()
    samples.push((t1 - t0) / iters) // ns/op
  }
  return samples
}

// ─── seeded bootstrap CI95 (orchestrator) ──────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function median(xs: number[]): number {
  const c = [...xs].sort((a, b) => a - b)
  return c[Math.floor(c.length / 2)]!
}

function bootstrapCI95(samples: number[], resamples = 1000): { lo: number; hi: number } {
  const rnd = mulberry32(0xbe9c4)
  const meds: number[] = []
  for (let r = 0; r < resamples; r++) {
    const pick: number[] = []
    for (let i = 0; i < samples.length; i++) pick.push(samples[Math.floor(rnd() * samples.length)]!)
    meds.push(median(pick))
  }
  meds.sort((a, b) => a - b)
  return { lo: meds[Math.floor(resamples * 0.025)]!, hi: meds[Math.floor(resamples * 0.975)]! }
}

// ─── per-library binders ───────────────────────────────────────────────
// Each takes that library's OWN schema object and returns the call forms we
// time. Written out per library so every competitor's idiomatic call form is
// reviewable in one place.
const bind = {
  pyreon: (S: { parse(i: unknown): { ok: boolean }; is(i: unknown): boolean }): Bound => ({
    parse: (i) => S.parse(i),
    check: (i) => S.is(i),
  }),
  /**
   * IN-RUN CONTROL for the verdict-JIT change — not a competitor.
   *
   * Before the verdict-only JIT, `.is()` ran the PARSE validator and threw its
   * issues away, so `parse(i).ok` is that path plus one `Result` object. It is
   * therefore a slight OVER-estimate of the old `.is()`, and the row is here
   * so the before/after delta is measured in the SAME run, interleaved with
   * every other cell — a delta taken against a benchmark run at another time
   * folds machine drift into the number, which on a shared machine can be
   * larger than the effect. Excluded from the winner/tie verdict, since it is
   * a second measurement of Pyreon rather than a distinct library.
   */
  'pyreon-legacy-is': (S: { parse(i: unknown): { ok: boolean } }): Bound => ({
    check: (i) => S.parse(i).ok,
  }),
  zod: (S: z.ZodType): Bound => ({
    parse: (i) => S.safeParse(i),
    // Zod exposes no boolean-only API — this is a full safeParse. Disclosed.
    check: (i) => S.safeParse(i).success,
  }),
  'zod-c': (S: z.ZodType): Bound => {
    const c = z.compile(S) // ahead-of-time; setup cost measured separately
    return { parse: (i) => c.safeParse(i), check: (i) => c.safeParse(i).success }
  },
  valibot: (S: v.GenericSchema): Bound => ({
    parse: (i) => v.safeParse(S, i),
    check: (i) => v.is(S, i),
  }),
  arktype: (S: { (i: unknown): unknown; allows(i: unknown): boolean }): Bound => ({
    // NOTE: on success ArkType returns the input ALIASED (no clone), so it
    // structurally pays less than the cloning libraries on the parse axis.
    parse: (i) => S(i),
    check: (i) => S.allows(i),
  }),
  /**
   * typia's "schema" is a PAIR of already-compiled functions, because its
   * validators are generated from a TypeScript type at build time.
   *
   * `check` uses `createIs`; `parse` uses `plain.createValidateClone`, which
   * allocates a stripped clone and reports errors — the honest analogue of
   * `safeParse`. `typia.validate` would return the input BY REFERENCE and be
   * measuring strictly less work, and `typia.is` under a parse heading would
   * skip the allocation AND the error collection.
   *
   * NOTE on the check axis: `createIs` IGNORES unknown properties where
   * zod/valibot STRIP them. Every scenario input here is exact-shaped, so all
   * libraries agree (the correctness gate proves it), but on an input
   * carrying extra keys `createIs` answers a slightly different question.
   */
  typia: (S: TypiaPair): Bound => ({
    parse: (i) => S.validate(i),
    check: (i) => S.is(i),
  }),
  typebox: (S: TSchema): Bound => {
    const c = TypeCompiler.Compile(S) // ahead-of-time; setup cost measured separately
    // No output-producing equivalent — `check` axis only (see file header).
    return { check: (i) => c.Check(i) }
  },
  yup: (S: yup.Schema): Bound => ({
    parse: (i) => {
      try {
        return S.validateSync(i, YUP_OPTS)
      } catch (e) {
        return e
      }
    },
    check: (i) => S.isValidSync(i, YUP_OPTS),
  }),
  joi: (S: Joi.Schema): Bound => ({
    parse: (i) => S.validate(i, JOI_OPTS),
    check: (i) => S.validate(i, JOI_OPTS).error === undefined,
  }),
} as const

// ─── scenarios ─────────────────────────────────────────────────────────
/** Per-library schema for one scenario. Every library states its own idiom. */
/** typia's pre-compiled pair for one scenario. */
interface TypiaPair {
  is: (i: unknown) => boolean
  validate: (i: unknown) => { success: boolean }
}

interface SchemaSet {
  pyreon: Parameters<(typeof bind)['pyreon']>[0]
  zod: z.ZodType
  valibot: v.GenericSchema
  arktype: Parameters<(typeof bind)['arktype']>[0]
  typebox: TSchema
  typia: TypiaPair
  yup: yup.Schema
  joi: Joi.Schema
}

interface Scenario {
  name: string
  schemas: SchemaSet
  valid: unknown
  invalid?: unknown
  /**
   * Optional ROTATED input pools — the worker cycles through the pool so the
   * parse site sees EVERY variant (for a discriminated union: every tag). A
   * single constant input lets the engine branch-predict one dispatch arm and
   * keep every IC monomorphic — unrealistically flattering for ALL libraries
   * and structurally unable to measure the dispatch itself.
   */
  validPool?: unknown[]
  invalidPool?: unknown[]
}

/**
 * Every scenario rotates over a POOL of distinct inputs, and that is a
 * CORRECTNESS property of the measurement, not a realism nicety.
 *
 * With one constant input the call is loop-invariant, so V8 may hoist it out
 * of the timed loop and compute it once. Measured directly: ArkType's
 * `string.email` cell read ~3ns/op — below the cost of the regex test the
 * check has to perform — while Pyreon and TypeBox, whose validators V8 did
 * not manage to hoist, kept reporting their real ~28ns. The table was
 * ranking how inlinable each library was, not how fast. Feeding a result
 * sink does NOT fix this (a hoisted value still satisfies the sink); only
 * varying the input does.
 *
 * Pool entries are SAME-SHAPE, different-value, so the object maps stay
 * monomorphic and every entry does the identical amount of validation work
 * — the pool defeats hoisting without changing what is being measured.
 * Every entry passes through the correctness gate.
 */
const POOL = 8
const pooled = <T>(make: (i: number) => T): T[] => Array.from({ length: POOL }, (_, i) => make(i))

function scenarios(): Scenario[] {
  const out: Scenario[] = []
  const add = (
    name: string,
    schemas: SchemaSet,
    validPool: unknown[],
    invalidPool?: unknown[],
  ) => {
    out.push({
      name,
      schemas,
      valid: validPool[0],
      invalid: invalidPool?.[0],
      validPool,
      invalidPool,
    })
  }

  // Scenario 1 — single string + email
  add(
    'string.email',
    {
      pyreon: s.string().email(),
      zod: z.string().email(),
      valibot: v.pipe(v.string(), v.email()),
      arktype: type('string.email'),
      typebox: Type.String({ format: 'email' }),
      typia: { is: typiaGen.isStringEmail, validate: typiaGen.validateStringEmail },
      yup: yup.string().required().email(),
      joi: Joi.string().email({ tlds: false }).required(),
    },
    pooled((i) => `user${i}@example${i}.com`),
    pooled((i) => `not-an-email-${i}`),
  )

  // Scenario 2 — number with int + range
  add(
    'number.int.range',
    {
      pyreon: s.number().int().min(0).max(150),
      zod: z.number().int().min(0).max(150),
      valibot: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
      arktype: type('0 <= number.integer <= 150'),
      typebox: Type.Integer({ minimum: 0, maximum: 150 }),
      typia: { is: typiaGen.isNumberRange, validate: typiaGen.validateNumberRange },
      yup: yup.number().required().integer().min(0).max(150),
      joi: Joi.number().integer().min(0).max(150).required(),
    },
    pooled((i) => i * 17 + 3),
    pooled((i) => 200 + i * 11),
  )

  // Scenario 3 — realistic nested user object
  add(
    'object.user',
    {
      pyreon: s.object({
        name: s.string().min(2),
        age: s.number().int().min(0).max(150),
        email: s.string().email(),
        tags: s.array(s.string()),
      }),
      zod: z.object({
        name: z.string().min(2),
        age: z.number().int().min(0).max(150),
        email: z.string().email(),
        tags: z.array(z.string()),
      }),
      valibot: v.object({
        name: v.pipe(v.string(), v.minLength(2)),
        age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
        email: v.pipe(v.string(), v.email()),
        tags: v.array(v.string()),
      }),
      arktype: type({
        name: 'string >= 2',
        age: '0 <= number.integer <= 150',
        email: 'string.email',
        tags: 'string[]',
      }),
      typebox: Type.Object({
        name: Type.String({ minLength: 2 }),
        age: Type.Integer({ minimum: 0, maximum: 150 }),
        email: Type.String({ format: 'email' }),
        tags: Type.Array(Type.String()),
      }),
      typia: { is: typiaGen.isUser, validate: typiaGen.validateUser },
      yup: yup.object({
        name: yup.string().required().min(2),
        age: yup.number().required().integer().min(0).max(150),
        email: yup.string().required().email(),
        tags: yup.array().of(yup.string().required()).required(),
      }),
      joi: Joi.object({
        name: Joi.string().min(2).required(),
        age: Joi.number().integer().min(0).max(150).required(),
        email: Joi.string().email({ tlds: false }).required(),
        tags: Joi.array().items(Joi.string()).required(),
      }),
    },
    pooled((i) => ({
      name: `Ada${i}`,
      age: 20 + i,
      email: `ada${i}@example.com`,
      tags: ['a', 'b', 'c'],
    })),
    pooled((i) => ({ name: 'A', age: 900 + i, email: `nope${i}`, tags: ['a', 42] })),
  )

  // Scenario 4 — array of 20 user objects (bulk)
  add(
    'array.20-objects',
    {
      pyreon: s.array(s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150) })),
      zod: z.array(z.object({ name: z.string().min(2), age: z.number().int().min(0).max(150) })),
      valibot: v.array(
        v.object({
          name: v.pipe(v.string(), v.minLength(2)),
          age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
        }),
      ),
      arktype: type({ name: 'string >= 2', age: '0 <= number.integer <= 150' }).array(),
      typebox: Type.Array(
        Type.Object({
          name: Type.String({ minLength: 2 }),
          age: Type.Integer({ minimum: 0, maximum: 150 }),
        }),
      ),
      typia: { is: typiaGen.isNameAgeArray, validate: typiaGen.validateNameAgeArray },
      yup: yup
        .array()
        .of(
          yup.object({
            name: yup.string().required().min(2),
            age: yup.number().required().integer().min(0).max(150),
          }),
        )
        .required(),
      joi: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().min(2).required(),
            age: Joi.number().integer().min(0).max(150).required(),
          }),
        )
        .required(),
    },
    pooled((k) => Array.from({ length: 20 }, (_, i) => ({ name: `User${k}-${i}`, age: 20 + ((i + k) % 50) }))),
  )

  // Scenario 5 — deeply nested object (object → object → object)
  add(
    'object.deep-nested',
    {
      pyreon: s.object({
        id: s.number().int(),
        user: s.object({
          name: s.string().min(2),
          address: s.object({ city: s.string().min(1), zip: s.string().length(5) }),
        }),
      }),
      zod: z.object({
        id: z.number().int(),
        user: z.object({
          name: z.string().min(2),
          address: z.object({ city: z.string().min(1), zip: z.string().length(5) }),
        }),
      }),
      valibot: v.object({
        id: v.pipe(v.number(), v.integer()),
        user: v.object({
          name: v.pipe(v.string(), v.minLength(2)),
          address: v.object({
            city: v.pipe(v.string(), v.minLength(1)),
            zip: v.pipe(v.string(), v.length(5)),
          }),
        }),
      }),
      arktype: type({
        id: 'number.integer',
        user: { name: 'string >= 2', address: { city: 'string >= 1', zip: 'string == 5' } },
      }),
      typebox: Type.Object({
        id: Type.Integer(),
        user: Type.Object({
          name: Type.String({ minLength: 2 }),
          address: Type.Object({
            city: Type.String({ minLength: 1 }),
            zip: Type.String({ minLength: 5, maxLength: 5 }),
          }),
        }),
      }),
      typia: { is: typiaGen.isDeep, validate: typiaGen.validateDeep },
      yup: yup.object({
        id: yup.number().required().integer(),
        user: yup
          .object({
            name: yup.string().required().min(2),
            address: yup
              .object({
                city: yup.string().required().min(1),
                zip: yup.string().required().length(5),
              })
              .required(),
          })
          .required(),
      }),
      joi: Joi.object({
        id: Joi.number().integer().required(),
        user: Joi.object({
          name: Joi.string().min(2).required(),
          address: Joi.object({
            city: Joi.string().min(1).required(),
            zip: Joi.string().length(5).required(),
          }).required(),
        }).required(),
      }),
    },
    pooled((i) => ({
      id: i + 1,
      user: { name: `Ada${i}`, address: { city: `Paris${i}`, zip: `7500${i}` } },
    })),
    pooled((i) => ({ id: i + 1.5, user: { name: 'A', address: { city: '', zip: '7' } } })),
  )

  // Scenario 6 — object with an array-of-objects field (API list payload)
  add(
    'object.array-of-objects',
    {
      pyreon: s.object({
        page: s.number().int().min(0),
        items: s.array(
          s.object({ id: s.number().int(), title: s.string().min(1), done: s.boolean() }),
        ),
      }),
      zod: z.object({
        page: z.number().int().min(0),
        items: z.array(
          z.object({ id: z.number().int(), title: z.string().min(1), done: z.boolean() }),
        ),
      }),
      valibot: v.object({
        page: v.pipe(v.number(), v.integer(), v.minValue(0)),
        items: v.array(
          v.object({
            id: v.pipe(v.number(), v.integer()),
            title: v.pipe(v.string(), v.minLength(1)),
            done: v.boolean(),
          }),
        ),
      }),
      arktype: type({
        page: 'number.integer >= 0',
        items: type({ id: 'number.integer', title: 'string >= 1', done: 'boolean' }).array(),
      }),
      typebox: Type.Object({
        page: Type.Integer({ minimum: 0 }),
        items: Type.Array(
          Type.Object({
            id: Type.Integer(),
            title: Type.String({ minLength: 1 }),
            done: Type.Boolean(),
          }),
        ),
      }),
      typia: { is: typiaGen.isPage, validate: typiaGen.validatePage },
      yup: yup.object({
        page: yup.number().required().integer().min(0),
        items: yup
          .array()
          .of(
            yup.object({
              id: yup.number().required().integer(),
              title: yup.string().required().min(1),
              done: yup.boolean().required(),
            }),
          )
          .required(),
      }),
      joi: Joi.object({
        page: Joi.number().integer().min(0).required(),
        items: Joi.array()
          .items(
            Joi.object({
              id: Joi.number().integer().required(),
              title: Joi.string().min(1).required(),
              done: Joi.boolean().required(),
            }),
          )
          .required(),
      }),
    },
    pooled((k) => ({
      page: k,
      items: Array.from({ length: 20 }, (_, i) => ({
        id: i + k,
        title: `Item ${k}-${i}`,
        done: (i + k) % 2 === 0,
      })),
    })),
  )

  // Scenario 7 — discriminated union (3 members, ROTATED tags). Inputs cycle
  // through every member on the valid path, and through the three failure
  // modes (member-field fail / unknown tag / non-object) on the invalid path
  // — so the discriminant DISPATCH is actually measured (a constant tag lets
  // branch prediction + monomorphic ICs hide it for every library).
  // Cycles every member tag AND every failure mode, with values varying per
  // entry so no call is loop-invariant (see the POOL note above).
  const duValid = pooled((i) =>
    i % 3 === 0
      ? { kind: 'circle', radius: 1.5 + i }
      : i % 3 === 1
        ? { kind: 'rect', w: 3 + i, h: 4 + i }
        : { kind: 'label', text: `hi${i}`, size: 12 + i },
  )
  const duInvalid = pooled((i) =>
    i % 3 === 0
      ? { kind: 'circle', radius: `x${i}` } // dispatched member's field fails
      : i % 3 === 1
        ? { kind: `nope${i}`, w: 3, h: 4 } // unknown discriminator tag
        : `not-an-object-${i}`, // not an object at all
  )
  add(
    'du.3-member',
    {
      pyreon: s.discriminatedUnion('kind', [
        s.object({ kind: s.literal('circle'), radius: s.number() }),
        s.object({ kind: s.literal('rect'), w: s.number(), h: s.number() }),
        s.object({ kind: s.literal('label'), text: s.string(), size: s.number() }),
      ]),
      zod: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('circle'), radius: z.number() }),
        z.object({ kind: z.literal('rect'), w: z.number(), h: z.number() }),
        z.object({ kind: z.literal('label'), text: z.string(), size: z.number() }),
      ]),
      valibot: v.variant('kind', [
        v.object({ kind: v.literal('circle'), radius: v.number() }),
        v.object({ kind: v.literal('rect'), w: v.number(), h: v.number() }),
        v.object({ kind: v.literal('label'), text: v.string(), size: v.number() }),
      ]),
      arktype: type({ kind: "'circle'", radius: 'number' })
        .or({ kind: "'rect'", w: 'number', h: 'number' })
        .or({ kind: "'label'", text: 'string', size: 'number' }),
      typebox: Type.Union([
        Type.Object({ kind: Type.Literal('circle'), radius: Type.Number() }),
        Type.Object({ kind: Type.Literal('rect'), w: Type.Number(), h: Type.Number() }),
        Type.Object({ kind: Type.Literal('label'), text: Type.String(), size: Type.Number() }),
      ]),
      typia: { is: typiaGen.isShape, validate: typiaGen.validateShape },
      yup: yup.lazy((value: unknown) => {
        const k = (value as { kind?: string } | null | undefined)?.kind
        if (k === 'circle') {
          return yup.object({ kind: yup.string().required(), radius: yup.number().required() })
        }
        if (k === 'rect') {
          return yup.object({
            kind: yup.string().required(),
            w: yup.number().required(),
            h: yup.number().required(),
          })
        }
        if (k === 'label') {
          return yup.object({
            kind: yup.string().required(),
            text: yup.string().required(),
            size: yup.number().required(),
          })
        }
        return yup.mixed().test('unknown-tag', 'unknown discriminator', () => false)
      }) as unknown as yup.Schema,
      joi: Joi.alternatives()
        .match('one')
        .try(
          Joi.object({ kind: Joi.string().valid('circle').required(), radius: Joi.number().required() }),
          Joi.object({
            kind: Joi.string().valid('rect').required(),
            w: Joi.number().required(),
            h: Joi.number().required(),
          }),
          Joi.object({
            kind: Joi.string().valid('label').required(),
            text: Joi.string().required(),
            size: Joi.number().required(),
          }),
        ),
    },
    duValid,
    duInvalid,
  )

  return out
}

type Axis = 'parse' | 'check'

/**
 * Which entry of `SchemaSet` a library reads. `zod-c` deliberately compiles
 * the SAME `zod` schema — that is exactly what a Zod user opting into
 * `z.compile` does, and it keeps the two Zod rows comparing one schema
 * through two execution strategies rather than two hand-written schemas.
 */
function schemaKey(lib: Lib): keyof SchemaSet {
  if (lib === 'zod-c') return 'zod'
  if (lib === 'pyreon-legacy-is') return 'pyreon'
  return lib
}

/** Bind one library to one scenario, or `null` when it skips this axis. */
function boundFor(sc: Scenario, lib: Lib, axis: Axis): ((i: unknown) => unknown) | null {
  const b = bind[lib](sc.schemas[schemaKey(lib)] as never)
  if (axis === 'parse') return b.parse ?? null
  return b.check
}

/** Verdict extractor — always available (that is what the `check` axis is). */
function verdictFor(sc: Scenario, lib: Lib): (i: unknown) => boolean {
  return bind[lib](sc.schemas[schemaKey(lib)] as never).check
}

// ─── worker mode: run ONE (scenario|path|axis|lib) cell in this process ─
const cellArg = process.argv.indexOf('--cell')
if (cellArg !== -1) {
  const key = process.argv[cellArg + 1]!
  const [scName, path, axis, lib] = key.split('|') as [string, 'valid' | 'invalid', Axis, Lib]
  const sc = scenarios().find((x) => x.name === scName)
  if (!sc) throw new Error(`unknown scenario ${scName}`)
  const pool = path === 'valid' ? (sc.validPool ?? [sc.valid]) : (sc.invalidPool ?? [sc.invalid])
  const run = boundFor(sc, lib, axis)
  if (!run) throw new Error(`${lib} does not run the ${axis} axis`)
  let samples: number[]
  if (pool.length === 1) {
    const input = pool[0]
    samples = measureSamples(() => {
      if (run(input) === (NEVER_RETURNED as unknown)) SINK++
    })
  } else {
    // rotated pool — cycle so the dispatch site sees every variant
    let k = 0
    const n = pool.length
    samples = measureSamples(() => {
      if (run(pool[k]) === (NEVER_RETURNED as unknown)) SINK++
      k = k + 1 === n ? 0 : k + 1
    })
  }
  // `sink` is reported so the consuming comparison above is observably used
  process.stdout.write(JSON.stringify({ samples, sink: SINK }))
  process.exit(0)
}

// ─── setup-cost worker: time schema construction + any AOT compile ──────
const setupArg = process.argv.indexOf('--setup')
if (setupArg !== -1) {
  const key = process.argv[setupArg + 1]!
  const [scName, lib] = key.split('|') as [string, Lib]
  // AHEAD-OF-TIME COMPILE COST — only the two libraries that expose an
  // explicit compile CALL can be measured this way, and only they need to be:
  // they are the ones asking you to trade a one-off cost for steady-state
  // speed. Pyreon compiles lazily on first parse and ArkType at schema
  // DEFINITION time, so neither has a separable step to time here; they report
  // `—` rather than a number that would not mean the same thing.
  //
  // (An earlier version timed "build the scenario, then bind", which rebuilt
  // EVERY library's schema on every iteration — so all nine columns read
  // ~1.4ms of shared construction and the per-library compile was invisible.
  // Uniform numbers across libraries that do very different amounts of work
  // were the tell.)
  const sc = scenarios().find((x) => x.name === scName)!
  const schema = sc.schemas[schemaKey(lib)]
  const compile =
    lib === 'zod-c'
      ? () => void z.compile(schema as z.ZodType)
      : lib === 'typebox'
        ? () => void TypeCompiler.Compile(schema as TSchema)
        : null
  if (compile === null) {
    process.stdout.write(JSON.stringify({ ms: null }))
    process.exit(0)
  }
  for (let i = 0; i < 5; i++) compile() // warm
  const runs: number[] = []
  for (let r = 0; r < 9; r++) {
    const t0 = now()
    compile()
    runs.push((now() - t0) / 1e6) // ms
  }
  process.stdout.write(JSON.stringify({ ms: median(runs) }))
  process.exit(0)
}

// ─── orchestrator ──────────────────────────────────────────────────────
declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
}

const argValue = (flag: string): string | null => {
  const i = process.argv.indexOf(flag)
  return i === -1 ? null : process.argv[i + 1]!
}

const only = argValue('--only')
const axisFilter = argValue('--axis') as Axis | null
const libFilter = argValue('--libs')
const LIBS: Lib[] = libFilter
  ? (libFilter.split(',').map((x) => x.trim()) as Lib[])
  : [...ALL_LIBS]
for (const l of LIBS) {
  if (!ALL_LIBS.includes(l)) throw new Error(`unknown lib "${l}" — known: ${ALL_LIBS.join(',')}`)
}
const AXES: Axis[] = axisFilter ? [axisFilter] : ['parse', 'check']

// Correctness gate: every library must agree on every scenario's verdicts —
// including every entry of a rotated input pool — on BOTH axes. A library
// that disagrees is measuring different work, so this is a hard failure.
{
  for (const sc of scenarios()) {
    for (const lib of LIBS) {
      const verdict = verdictFor(sc, lib)
      const parse = boundFor(sc, lib, 'parse')
      for (const input of sc.validPool ?? [sc.valid]) {
        if (!verdict(input)) throw new Error(`[correctness] ${sc.name}: ${lib} rejects a VALID input`)
      }
      for (const input of sc.invalidPool ?? (sc.invalid !== undefined ? [sc.invalid] : [])) {
        if (verdict(input)) throw new Error(`[correctness] ${sc.name}: ${lib} accepts an INVALID input`)
      }
      // The parse axis must agree with the check axis for the same library —
      // otherwise its two cells are validating different things.
      if (parse) {
        for (const input of sc.validPool ?? [sc.valid]) {
          if (parseSucceeded(lib, parse(input)) !== true) {
            throw new Error(`[correctness] ${sc.name}: ${lib} parse REJECTS a valid input`)
          }
        }
        for (const input of sc.invalidPool ?? (sc.invalid !== undefined ? [sc.invalid] : [])) {
          if (parseSucceeded(lib, parse(input)) !== false) {
            throw new Error(`[correctness] ${sc.name}: ${lib} parse ACCEPTS an invalid input`)
          }
        }
      }
    }
  }
  console.log(`✓ correctness gate passed — ${LIBS.length} libraries agree on every scenario, both axes\n`)
}

/** Did this library's parse-axis return value represent success? */
function parseSucceeded(lib: Lib, out: unknown): boolean {
  switch (lib) {
    case 'pyreon':
    case 'pyreon-legacy-is':
      return (out as { ok: boolean }).ok
    case 'zod':
    case 'zod-c':
    case 'valibot':
      return (out as { success: boolean }).success
    case 'arktype':
      return !(out instanceof type.errors)
    case 'yup':
      return !(out instanceof Error)
    case 'joi':
      return (out as { error?: unknown }).error === undefined
    case 'typebox':
      return out as boolean
    case 'typia':
      return (out as { success: boolean }).success
  }
}

interface CellResult {
  median: number
  lo: number
  hi: number
}
interface Row {
  scenario: string
  axis: Axis
  path: 'valid' | 'invalid'
  cells: Partial<Record<Lib, CellResult>>
}

/** independent processes pooled per cell — the CI must cover process-level jitter */
const PROCS = 3

function runWorker(args: string[]): string {
  const proc = Bun.spawnSync(['bun', import.meta.path, ...args], {
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (proc.exitCode !== 0) {
    throw new Error(`worker failed (${args.join(' ')}): ${new TextDecoder().decode(proc.stderr)}`)
  }
  return new TextDecoder().decode(proc.stdout)
}


const rows: Row[] = []
for (const sc of scenarios()) {
  if (only && !sc.name.startsWith(only)) continue
  const paths: Array<'valid' | 'invalid'> =
    sc.invalid !== undefined ? ['valid', 'invalid'] : ['valid']
  for (const axis of AXES) {
    for (const path of paths) {
      const cells: Partial<Record<Lib, CellResult>> = {}
      const active = LIBS.filter((l) => boundFor(sc, l, axis) !== null)
      const pools = new Map<Lib, number[]>(active.map((l) => [l, []]))
      // ROUND-ROBIN the processes across libraries: process 1 for every
      // library, then process 2, and so on — NOT all three of one library's
      // processes back to back. On a shared machine a load burst lasts longer
      // than a single cell, so running a library's whole cell consecutively
      // lets a burst land on one library and miss the others, which shows up
      // as a lopsided row rather than as noise. Interleaving spreads any burst
      // across every library in the row, so contention widens the CIs — and
      // widened CIs read as 🤝 ties, which is the conservative failure.
      for (let p = 0; p < PROCS; p++) {
        for (const lib of active) {
          const key = `${sc.name}|${path}|${axis}|${lib}`
          const out = JSON.parse(runWorker(['--cell', key])) as { samples: number[]; sink?: number }
          if (out.sink === undefined) throw new Error(`worker returned no DCE sink for ${key}`)
          pools.get(lib)!.push(...out.samples)
        }
      }
      for (const lib of active) {
        const samplePool = pools.get(lib)!
        const { lo, hi } = bootstrapCI95(samplePool)
        cells[lib] = { median: median(samplePool), lo, hi }
      }
      rows.push({ scenario: sc.name, axis, path, cells })
      console.error(`  measured ${sc.name} × ${axis} × ${path}`)
    }
  }
}

// ─── setup cost (schema construction + any ahead-of-time compile) ───────
const setup: Array<{ scenario: string; ms: Partial<Record<Lib, number | null>> }> = []
for (const sc of scenarios()) {
  if (only && !sc.name.startsWith(only)) continue
  const ms: Partial<Record<Lib, number | null>> = {}
  for (const lib of LIBS) {
    const { ms: got } = JSON.parse(runWorker(['--setup', `${sc.name}|${lib}`])) as { ms: number | null }
    ms[lib] = got
  }
  setup.push({ scenario: sc.name, ms })
}

// ─── output ───────────────────────────────────────────────────────────
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}µs` : `${n.toFixed(0)}ns`)
const opsPerSec = (ns: number) => Math.round(1e9 / ns).toLocaleString('en-US')

console.log(`\nValidation benchmark — ${LIBS.join(' / ')}`)
console.log(
  `versions: zod ${z.core?.version ? `${z.core.version.major}.${z.core.version.minor}.${z.core.version.patch}` : '4'}, valibot 1, arktype 2, typebox 0.34, typia 14, yup 1, joi 18`,
)
console.log(
  `Node ${process.version}, ${process.platform} ${process.arch}, NODE_ENV=${process.env.NODE_ENV}`,
)
console.log(
  `Per-cell isolation, ${PROCS} processes pooled per cell · median ns/op ±95% bootstrap CI · 🤝 = CI overlaps the winner (tied within noise)`,
)
console.log(
  'AUTHOR-JUDGE CAVEAT: written + judged by the Pyreon authors — see the file header.\n',
)

const W = 17
const jsonRows: unknown[] = []
for (const axis of AXES) {
  const axisRows = rows.filter((r) => r.axis === axis)
  if (axisRows.length === 0) continue
  const present = LIBS.filter((l) => axisRows.some((r) => r.cells[l]))
  console.log(`\n### axis: ${axis} ${axis === 'parse' ? '(produce a validated output value)' : '(boolean verdict only)'}\n`)
  const head = ['scenario', 'path', ...present, 'verdict']
  console.log(head.map((h, i) => h.padEnd(i === 0 ? 24 : W)).join(''))
  console.log('─'.repeat(24 + W * (present.length + 1) + 20))
  for (const r of axisRows) {
    const got = present.filter((l) => r.cells[l])
    // The control row is a second measurement of Pyreon, not a competitor —
    // it must not be able to win a row or join a tie set.
    const rank = got.filter((l) => l !== 'pyreon-legacy-is')
    const meds = Object.fromEntries(rank.map((l) => [l, r.cells[l]!.median])) as Record<Lib, number>
    const min = Math.min(...Object.values(meds))
    const winner = rank.find((l) => meds[l] === min)!
    const w = r.cells[winner]!
    const tied = rank.filter((l) => r.cells[l]!.lo <= w.hi && r.cells[l]!.hi >= w.lo)
    const verdict = tied.length > 1 ? `🤝 ${tied.join('=')}` : winner
    const cell = (l: Lib) => {
      const c = r.cells[l]
      if (!c) return '—'.padEnd(W)
      return `${fmt(c.median)}(${(c.median / min).toFixed(1)}x)`.padEnd(W)
    }
    console.log(
      r.scenario.padEnd(24) + r.path.padEnd(W) + present.map(cell).join('') + verdict,
    )
    jsonRows.push({
      scenario: r.scenario,
      axis,
      path: r.path,
      winner,
      tied: tied.length > 1 ? tied : undefined,
      cells: Object.fromEntries(
        got.map((l) => [l, { ...r.cells[l]!, opsPerSec: opsPerSec(r.cells[l]!.median) }]),
      ),
    })
  }
}

const AOT: Lib[] = LIBS.filter((l) => l === 'zod-c' || l === 'typebox')
if (AOT.length > 0) {
  console.log(`\n### ahead-of-time compile cost — the explicit compile CALL only (ms, median of 9)\n`)
  console.log(['scenario', ...AOT].map((h, i) => h.padEnd(i === 0 ? 24 : 12)).join(''))
  console.log('─'.repeat(24 + 12 * (AOT.length + 1)))
  for (const s0 of setup) {
    console.log(
      s0.scenario.padEnd(24) +
        AOT.map((l) => (s0.ms[l] == null ? '—' : s0.ms[l]!.toFixed(3)).padEnd(12)).join(''),
    )
  }
  console.log(
    '\nPyreon (lazy, on first parse) and ArkType (at schema definition) have no\n' +
      'separable compile call to time here, so they are absent rather than shown\n' +
      'as a number measuring something else.',
  )
}

console.log(`
NOTES — read these before quoting any number above.
  · parse axis: ArkType returns the input ALIASED on success (no clone), so it
    structurally does less work than the cloning libraries. TypeBox has no
    output-producing equivalent and is absent from this axis by design.
  · check axis: Zod exposes no boolean-only API, so its cells run a full
    safeParse(). That is Zod's API surface, not a harness artifact.
  · TypeBox has no built-in email validator; the email scenarios register a
    format whose regex is OURS. Those TypeBox cells measure our scanner.
  · yup runs with { strict: true } and joi with { convert: false } — both cast
    by default, which would make them ACCEPT inputs every other library
    rejects, i.e. a different amount of work.
  · setup cost is per schema, paid once. A long-lived server amortizes it; a
    cold serverless invocation or a short CLI run may not.
  · MACHINE LOAD: record it when you save a run. Contention inflates every
    absolute figure and widens every CI, which turns real differences into 🤝
    ties — conservative, but it means a tie under load is "could not
    distinguish", not "equal". Ratios survive contention far better than
    absolutes because the round-robin schedule spreads a burst across the
    whole row.
`)

console.log(
  JSON.stringify(
    {
      meta: {
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        libs: LIBS,
        axes: AXES,
        isolation: `per-cell, ${PROCS} processes pooled`,
        ci: 'bootstrap-95 (seeded)',
      },
      rows: jsonRows,
      setup,
    },
    null,
    0,
  ),
)
