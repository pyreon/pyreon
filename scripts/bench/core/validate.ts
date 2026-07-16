/**
 * Validation benchmark — measures parse ops for `@pyreon/validate`'s `s`
 * runtime vs the three dominant Standard-Schema validators, under a
 * MULTI-SCHEMA (megamorphic) workload.
 *
 * Compares:
 *   - @pyreon/validate  — Pyreon's `s` validator (compile-on-first-parse + JIT)
 *   - zod@4             — the de-facto reference (v4 precompiles on build)
 *   - valibot@1         — pipe/action model, tree-shake-first
 *   - arktype@2         — type-DSL with an aggressive JIT (perf leader on valid-parse)
 *
 * Usage: bun scripts/bench/core/validate.ts          (orchestrator)
 *        bun scripts/bench/core/validate.ts <lib>    (child cell — internal)
 *
 * ROLE SPLIT vs the package protocol bench
 * (packages/fundamentals/validate/bench/validation.ts): the package bench
 * isolates each (scenario × lib) in its own process — per-cell MONOmorphic
 * micro conditions. THIS bench is the complement: each lib's child process
 * warms and runs ALL 12 (shape × path) cells INTERLEAVED, so the adapter call
 * sites hold MEGAMORPHIC IC state — the "app validating many schema shapes"
 * workload. Scalar rows here therefore show the multi-schema story, not the
 * single-schema hot loop (that monomorphic case lives in the package bench
 * and in CLAUDE.md's documented ArkType bare-scalar residual).
 *
 * OBJECTIVITY CONTRACT (2026-07 rewrite — the previous harness had three
 * defects that fabricated cross-lib verdicts: a single CONSTANT closed-over
 * input per cell → JSC loop-invariant hoisting faked single-digit-ns parses;
 * all four libs timed in ONE process → cross-lib JIT/IC/GC pollution; and a
 * single duration-run → no variance signal at all):
 *   1. `NODE_ENV=production` forced before any library loads.
 *   2. Idiomatic schema per library, expressing the SAME validation goal.
 *   3. ROTATED INPUT POOLS — every (shape × path) cell cycles 8 distinct
 *      inputs, so no loop-invariant hoisting and the dispatch/branch sites
 *      see real variety. The correctness gate asserts all four libs agree on
 *      EVERY pool entry (a validator that "wins" by not validating is caught).
 *   4. PER-LIB PROCESS ISOLATION — one fresh `bun` child per lib (×3 pooled),
 *      shapes interleaved WITHIN the child (megamorphic by design, see above),
 *      but no cross-LIB pollution and no forced GC.
 *   5. Pooled samples per cell → median + seeded-free bootstrap 95% CI + `🤝`
 *      CI-overlap tie markers. ns/ops are machine-dependent — the RATIO and
 *      the verdict are the portable signal.
 *   6. AUTHOR-JUDGE disclosed: written + judged by the framework authors.
 */

process.env.NODE_ENV = 'production'

import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import { s } from '../../../packages/fundamentals/validate/src/index'

declare const Bun: {
  version: string
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; exitCode: number }
}

// ─── Schemas (idiomatic per lib, same validation goal) ─────────────────────────

// A) small object — name(min 2) / age(int 0..150) / email / active(bool)
const pyrUser = s.object({
  name: s.string().min(2),
  age: s.number().int().between(0, 150),
  email: s.string().email(),
  active: s.boolean(),
})
const zUser = z.object({
  name: z.string().min(2),
  age: z.number().int().min(0).max(150),
  email: z.email(),
  active: z.boolean(),
})
const vUser = v.object({
  name: v.pipe(v.string(), v.minLength(2)),
  age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
  email: v.pipe(v.string(), v.email()),
  active: v.boolean(),
})
const aUser = type({
  name: 'string >= 2',
  age: '0 <= number.integer <= 150',
  email: 'string.email',
  active: 'boolean',
})

// B) nested object — record with a nested user + string[] tags
const pyrNested = s.object({ id: s.number().int(), owner: pyrUser, tags: s.array(s.string()) })
const zNested = z.object({ id: z.number().int(), owner: zUser, tags: z.array(z.string()) })
const vNested = v.object({ id: v.pipe(v.number(), v.integer()), owner: vUser, tags: v.array(v.string()) })
const aNested = type({ id: 'number.integer', owner: aUser, tags: 'string[]' })

// C) array of 20 users
const pyrArr = s.array(pyrUser)
const zArr = z.array(zUser)
const vArr = v.array(vUser)
const aArr = aUser.array()

// D) discriminated union
const pyrDU = s.discriminatedUnion('kind', [
  s.object({ kind: s.literal('circle'), radius: s.number() }),
  s.object({ kind: s.literal('rect'), w: s.number(), h: s.number() }),
])
const zDU = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('circle'), radius: z.number() }),
  z.object({ kind: z.literal('rect'), w: z.number(), h: z.number() }),
])
const vDU = v.variant('kind', [
  v.object({ kind: v.literal('circle'), radius: v.number() }),
  v.object({ kind: v.literal('rect'), w: v.number(), h: v.number() }),
])
const aDU = type({ kind: "'circle'", radius: 'number' }).or({ kind: "'rect'", w: 'number', h: 'number' })

// E) scalars — trivial validation where per-parse overhead dominates. Under
// THIS bench's megamorphic workload they measure the multi-schema story; the
// single-schema monomorphic hot loop is the package bench's territory.
const pyrStr = s.string()
const zStr = z.string()
const vStr = v.string()
const aStr = type('string')

const pyrInt = s.number().int().between(0, 150)
const zInt = z.number().int().min(0).max(150)
const vInt = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150))
const aInt = type('0 <= number.integer <= 150')

// ─── Rotated input pools (8 per cell; gate asserts agreement on EVERY entry) ───

const mkUser = (name: string, age: number, email: string, active: boolean) => ({ name, age, email, active })

const USER_VALID = [
  mkUser('Alice', 30, 'alice@example.com', true),
  mkUser('Bob', 0, 'bob@site.org', false),
  mkUser('Carol-Anne', 150, 'c.anne+tag@mail.co', true),
  mkUser('Dee', 47, 'dee@x.io', false),
  mkUser('Evelyn', 88, 'e_v@corp.net', true),
  mkUser('Fu', 12, 'fu@a.dev', true),
  mkUser('Grace', 63, 'grace.h@lab.edu', false),
  mkUser('Hank', 101, 'hank99@z.com', true),
]
const USER_INVALID = [
  mkUser('A', 30, 'alice@example.com', true), // name too short
  mkUser('Bob', 999, 'bob@site.org', false), // age over max
  mkUser('Carol', -1, 'carol@mail.co', true), // age under min
  mkUser('Dee', 47.5, 'dee@x.io', false), // age non-int
  mkUser('Evelyn', 88, 'not-an-email', true), // bad email
  { name: 'Fu', age: 12, email: 'fu@a.dev', active: 'yes' } as unknown, // bool type
  { name: 42, age: 12, email: 'g@a.dev', active: true } as unknown, // name type
  mkUser('Hank', 200, 'plainaddr', true), // two failures
]

const NESTED_VALID = USER_VALID.map((u, i) => ({ id: i + 1, owner: u, tags: ['x', `t${i}`, 'z'].slice(0, (i % 3) + 1) }))
const NESTED_INVALID = [
  { id: 1.5, owner: USER_VALID[0], tags: ['x'] }, // id non-int
  { id: 2, owner: USER_INVALID[0], tags: ['x'] }, // bad nested owner
  { id: 3, owner: USER_VALID[1], tags: ['x', 2] }, // bad tag type
  { id: 4, owner: USER_INVALID[4], tags: [] }, // bad nested email
  { id: 5.01, owner: USER_VALID[2], tags: ['a', 'b'] },
  { id: 6, owner: USER_INVALID[5], tags: ['a'] },
  { id: 7, owner: USER_VALID[3], tags: [3] as unknown as string[] },
  { id: 8, owner: USER_INVALID[7], tags: ['ok'] },
]

const ARR_VALID = Array.from({ length: 8 }, (_, k) =>
  Array.from({ length: 20 }, (__, i) => USER_VALID[(i + k) % USER_VALID.length]),
)
const ARR_INVALID = Array.from({ length: 8 }, (_, k) =>
  Array.from({ length: 20 }, (__, i) =>
    i === ((k * 3) % 20) ? USER_INVALID[k % USER_INVALID.length] : USER_VALID[(i + k) % USER_VALID.length],
  ),
)

const DU_VALID = [
  { kind: 'rect', w: 3, h: 4 },
  { kind: 'circle', radius: 2.5 },
  { kind: 'rect', w: 10, h: 1 },
  { kind: 'circle', radius: 0 },
  { kind: 'rect', w: 0.5, h: 9 },
  { kind: 'circle', radius: 123 },
  { kind: 'rect', w: 7, h: 7 },
  { kind: 'circle', radius: 1e3 },
]
const DU_INVALID = [
  { kind: 'rect', w: 'x', h: 4 }, // bad member field
  { kind: 'tri', a: 1 }, // unknown tag
  { kind: 'circle', radius: 'big' }, // bad member field
  { radius: 2 }, // missing tag
  { kind: 'rect', h: 4 }, // missing field
  { kind: 'circle' }, // missing field
  { kind: 'rect', w: 1, h: 'y' },
  'rect' as unknown, // not an object
]

const STR_VALID = ['hello world', '', 'pyreon', 'a'.repeat(64), 'ünïcode ✓', 'x', 'query string', '42']
const STR_INVALID = [42, null, true, {}, [], 3.5, -1, 0]

const INT_VALID = [0, 30, 150, 7, 88, 42, 111, 1]
const INT_INVALID = [999, -1, 3.5, 151, 1e9, -100, 200, 0.001]

// ─── Adapters (each returns boolean ok — never throws) ────────────────────────

const ARK_ERR = type.errors
const adapters = {
  pyreon: { user: pyrUser, nested: pyrNested, arr: pyrArr, du: pyrDU, str: pyrStr, int: pyrInt, run: (sch: any, x: unknown) => sch.parse(x).ok },
  zod: { user: zUser, nested: zNested, arr: zArr, du: zDU, str: zStr, int: zInt, run: (sch: any, x: unknown) => sch.safeParse(x).success },
  valibot: { user: vUser, nested: vNested, arr: vArr, du: vDU, str: vStr, int: vInt, run: (sch: any, x: unknown) => v.safeParse(sch, x).success },
  arktype: { user: aUser, nested: aNested, arr: aArr, du: aDU, str: aStr, int: aInt, run: (sch: any, x: unknown) => !(sch(x) instanceof ARK_ERR) },
} as const

type LibName = keyof typeof adapters
type ShapeKey = 'str' | 'int' | 'user' | 'nested' | 'arr' | 'du'

const CELLS: { title: string; key: ShapeKey; path: 'valid' | 'invalid'; pool: readonly unknown[] }[] = [
  { title: 'Scalar string', key: 'str', path: 'valid', pool: STR_VALID },
  { title: 'Scalar string', key: 'str', path: 'invalid', pool: STR_INVALID },
  { title: 'Scalar int (0..150)', key: 'int', path: 'valid', pool: INT_VALID },
  { title: 'Scalar int (0..150)', key: 'int', path: 'invalid', pool: INT_INVALID },
  { title: 'Small object (5 fields)', key: 'user', path: 'valid', pool: USER_VALID },
  { title: 'Small object (5 fields)', key: 'user', path: 'invalid', pool: USER_INVALID },
  { title: 'Nested object', key: 'nested', path: 'valid', pool: NESTED_VALID },
  { title: 'Nested object', key: 'nested', path: 'invalid', pool: NESTED_INVALID },
  { title: 'Array of 20 objects', key: 'arr', path: 'valid', pool: ARR_VALID },
  { title: 'Array of 20 objects', key: 'arr', path: 'invalid', pool: ARR_INVALID },
  { title: 'Discriminated union', key: 'du', path: 'valid', pool: DU_VALID },
  { title: 'Discriminated union', key: 'du', path: 'invalid', pool: DU_INVALID },
]

// ─── Child mode: `bun validate.ts <lib>` → { "<key>.<path>": samples[] } ──────
// All 12 cells warm INTERLEAVED first (megamorphic IC state at the adapter's
// call sites — the bench's whole point), then timing runs are taken ROUND-ROBIN
// across cells (run r of EVERY cell before run r+1 of any) so GC debt and JIT
// tier movements spread evenly across all cells instead of piling onto
// whichever cell happens to be timed after an allocation-heavy one (sequential
// per-cell timing produced 5–8× CI upper tails on the object cells). A sink
// defeats DCE.

const now = () => Number(process.hrtime.bigint())
let sink = 0

function childRun(lib: LibName): Record<string, number[]> {
  const a = adapters[lib]
  const cellFns = CELLS.map((c) => {
    const sch = a[c.key]
    const pool = c.pool
    const n = pool.length
    return (i: number) => {
      sink += a.run(sch, pool[i % n]) ? 1 : 0
    }
  })

  // Interleaved megamorphic warmup — every cell advances together.
  for (let i = 0; i < 6_000; i++) {
    for (const fn of cellFns) fn(i)
  }

  const RUNS = 11
  const out: Record<string, number[]> = {}
  for (const cell of CELLS) out[`${cell.key}.${cell.path}`] = []
  for (let r = 0; r < RUNS; r++) {
    for (let c = 0; c < CELLS.length; c++) {
      const cell = CELLS[c]!
      const fn = cellFns[c]!
      // Array cells are ~50× heavier per op — scale iters to keep wall time sane.
      const iters = cell.key === 'arr' ? 2_000 : 20_000
      const t0 = now()
      for (let i = 0; i < iters; i++) fn(i)
      out[`${cell.key}.${cell.path}`]!.push((now() - t0) / iters)
    }
  }
  return out
}

const childLib = process.argv[2] as LibName | undefined
if (childLib) {
  if (!(childLib in adapters)) throw new Error(`unknown lib: ${childLib}`)
  process.stdout.write(JSON.stringify(childRun(childLib)))
  process.exit(0)
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

function assertCorrect(): void {
  for (const [lib, a] of Object.entries(adapters)) {
    for (const cell of CELLS) {
      const expect = cell.path === 'valid'
      for (const input of cell.pool) {
        if (a.run(a[cell.key], input) !== expect) {
          throw new Error(
            `[validate-bench] correctness FAIL: ${lib} ${cell.key}.${cell.path} on ${JSON.stringify(input)?.slice(0, 80)}`,
          )
        }
      }
    }
  }
  console.log('  ✓ correctness gate passed (all 4 libs agree on EVERY pool entry of every cell)')
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[sorted.length >> 1] as number
}

function bootstrapCI(samples: number[], resamples = 2_000): [number, number] {
  const meds: number[] = []
  const n = samples.length
  for (let r = 0; r < resamples; r++) {
    const re: number[] = []
    for (let i = 0; i < n; i++) re.push(samples[(Math.random() * n) | 0] as number)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[(resamples * 0.025) | 0] as number, meds[(resamples * 0.975) | 0] as number]
}

const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]

console.log('\n=== @pyreon/validate parse benchmark — MULTI-SCHEMA (megamorphic) workload ===')
console.log(`  Bun ${Bun.version} · ${process.platform}/${process.arch} · NODE_ENV=production`)
console.log('  Per-LIB process isolation ×3 pooled · shapes interleaved within each lib (megamorphic ICs)')
console.log('  Rotated 8-input pools per cell · median ns/op + bootstrap CI95 · 🤝 = CI-overlap tie')
console.log('  AUTHOR-JUDGE disclosed. The per-cell MONOmorphic micro conditions live in the package')
console.log('  protocol bench (packages/fundamentals/validate/bench/validation.ts).')
assertCorrect()

const PROCS = 3
const LIBS = Object.keys(adapters) as LibName[]

// lib → cell → pooled samples
const pooled: Record<LibName, Record<string, number[]>> = {} as never
for (const lib of LIBS) {
  const agg: Record<string, number[]> = {}
  for (let p = 0; p < PROCS; p++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, lib], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0) throw new Error(`child failed for lib "${lib}"`)
    const r = JSON.parse(new TextDecoder().decode(proc.stdout)) as Record<string, number[]>
    for (const [cell, samples] of Object.entries(r)) (agg[cell] ??= []).push(...samples)
  }
  pooled[lib] = agg
}

const fmtOps = (nsPerOp: number) => Math.round(1e9 / nsPerOp).toLocaleString('en-US')

for (const cell of CELLS) {
  const id = `${cell.key}.${cell.path}`
  const stats = LIBS.map((lib) => {
    const samples = pooled[lib][id]!
    return { lib, med: median(samples), ci: bootstrapCI(samples) }
  }).sort((a, b) => a.med - b.med)
  const best = stats[0]!
  console.log(`\n  ${cell.title} — ${cell.path} input`)
  for (const st of stats) {
    const rel =
      st === best
        ? '1.00× 🥇'
        : `${(st.med / best.med).toFixed(2)}× slower${overlaps(st.ci, best.ci) ? ' 🤝(CI-tied w/ leader)' : ''}`
    console.log(
      `    ${st.lib.padEnd(10)} ${fmtOps(st.med).padStart(12)} ops/s   ${`${st.med.toFixed(1)}ns [${st.ci[0].toFixed(1)}–${st.ci[1].toFixed(1)}]`.padStart(28)}   ${rel}`,
    )
  }
}
console.log('')
