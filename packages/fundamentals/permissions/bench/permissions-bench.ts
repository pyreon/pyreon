/**
 * @pyreon/permissions vs CASL — objective head-to-head.
 *
 * Run: `bun run bench:casl` (sets NODE_ENV=production).
 *
 * Objectivity contract:
 *  - NODE_ENV=production (shell-set) before either library loads.
 *  - Idiomatic per library — Pyreon `createPermissions(map)` + `can('a.b')` flat
 *    hierarchical string keys; CASL `AbilityBuilder(createMongoAbility)` +
 *    `ability.can(action, subject)`.
 *  - CORRECTNESS GATE asserts both return the SAME boolean for every check.
 *  - PER-(OP × LIBRARY) PROCESS ISOLATION — each cell runs in a fresh child
 *    in which ONLY that library's path is warmed + timed (it used to be one
 *    child per op timing Pyreon FIRST, then the competitor, in the same
 *    process — an order bias against whichever ran second or first).
 *  - DISCLOSURE: the two MODELS differ — Pyreon is flat hierarchical string keys
 *    (`'posts.read'`) with `*`/`**` wildcards; CASL is (action, subject) pairs
 *    with `manage`/`all` wildcards + MongoDB-condition matching (a richer,
 *    different shape). The bench measures the COMMON op both answer: "is this
 *    permission granted?" (a boolean check). CASL has no `all`/`any` batch
 *    primitive, so the multi-check op compares Pyreon's `can.all` to N sequential
 *    `ability.can` calls (the idiomatic CASL way) — flagged.
 *  - Impl order rotated per round; samples pooled over ${BENCH_ROUNDS:-4}
 *    rounds → median ns/op + seeded bootstrap CI95; CI overlap = 🤝 tie.
 *    A `sink` (written out by every child) defeats DCE. `--quick` = a
 *    correctness/structure smoke with meaningless timings.
 *  - `BENCH_GATE_ONLY=1` runs the correctness gate and exits 0 without timing —
 *    use it to check correctness on a loaded machine, where timings are worthless.
 *
 * ⚠ THE MEMO — read this before quoting any ratio from this file.
 *   `@pyreon/permissions` keeps a per-instance key→boolean memo (`resolveCache`
 *   in src/permissions.ts, capped at RESOLVE_CACHE_CAP). It is consulted ONLY
 *   when the map is all-static booleans AND no per-call `context` is passed. In
 *   a bench that checks the SAME key millions of times, warmup fills the memo
 *   and the timed loop degenerates to `version()` + one `Map.get` — it is NOT
 *   measuring the resolver. CASL has no boolean memo (it caches merged RULE
 *   LISTS, then still matches rules per call), so a memo-hit-vs-full-resolution
 *   comparison flatters Pyreon and is not an apples-to-apples resolver race.
 *   This file therefore reports BOTH families, explicitly labelled:
 *     - `… (memo hit)`      — repeated-check throughput. Honest number for the
 *                             real "same permission checked N times per render"
 *                             pattern, but it is a cache read, NOT a resolve.
 *                             The CASL column is unchanged between families, so
 *                             this row's ratio ≈ "CASL resolve ÷ Pyreon Map.get".
 *     - `… (uncached)`      — the RESOLVER race. Uses a second Pyreon instance
 *                             whose map contains one ownership PREDICATE; a
 *                             single predicate anywhere sets `index.hasPredicate`
 *                             and disables the memo for EVERY key — the shape any
 *                             real app with one `(post) => post.authorId === me`
 *                             rule already has. Both sides then do full
 *                             resolution on every call. Quote THIS family when
 *                             comparing resolution cost.
 */
process.env.NODE_ENV = 'production'

import { cpus, loadavg } from 'node:os'
import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { createPermissions } from '../src/index'

// ─── permission setup (equivalent grants per library) ────────────────────────
// Granted: read+write on Post; a broad subtree grant on Admin. NOT granted:
// delete on Post.
const GRANTS = {
  'posts.read': true,
  'posts.write': true,
  'admin.**': true, // subtree grant (any depth below `admin`)
} as const

const pyr = createPermissions({ ...GRANTS })

// Same grants + ONE ownership predicate. The predicate is NEVER invoked by any
// measured key — its only role is to set `index.hasPredicate`, which turns the
// key→boolean memo OFF for the whole instance (see src/permissions.ts:can). Every
// check below therefore runs the real resolver: exact lookup → `parent.*` →
// nearest-ancestor `**` walk → global. This is the state of any app that has a
// single ownership rule in its permission map.
const pyrUncached = createPermissions({
  ...GRANTS,
  'posts.update': (post: unknown) => (post as { authorId?: number } | undefined)?.authorId === 1,
})

const builder = new AbilityBuilder(createMongoAbility)
builder.can('read', 'Post')
builder.can('write', 'Post')
builder.can('manage', 'Admin') // `manage` = any action (CASL's broad grant)
const ability = builder.build()

// ─── isolated-cell harness ───────────────────────────────────────────────────
// ONE fresh child process per (op × library) — only that library's path is
// warmed/timed in it, so neither library measures after the other's JIT/heap
// debt. The impl order is ROTATED per round (and per op), so neither library
// is systematically first while the machine drifts; samples from every round
// are POOLED → median + SEEDED bootstrap CI95 (reproducible for identical
// samples). Overlapping CIs = 🤝 statistical tie — no winner is read. Same
// shape as the store / rx / http benches. `--quick` (or BENCH_QUICK=1) is a
// structural/correctness smoke only — its timings are meaningless.
declare const Bun: {
  version: string
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
}
const QUICK = process.argv.includes('--quick') || process.env.BENCH_QUICK === '1'
const ROUNDS = QUICK ? 1 : Number(process.env.BENCH_ROUNDS ?? 4)
const now = () => Number(process.hrtime.bigint())

function measureSamples(
  fn: () => void,
  opts: { warmup?: number; iters?: number; runs?: number } = {},
): number[] {
  const warmup = QUICK ? 100 : (opts.warmup ?? 2_000)
  const iters = QUICK ? 500 : (opts.iters ?? 20_000)
  const runs = QUICK ? 3 : (opts.runs ?? 11)
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    samples.push((now() - t0) / iters)
  }
  return samples
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** mulberry32 PRNG — seeded so the CI is reproducible for identical samples. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a — a stable per-cell seed from the cell's label. */
function seedOf(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function bootstrapCI(samples: readonly number[], key: string, B = 2_000): [number, number] {
  const rand = seededRandom(seedOf(key))
  const n = samples.length
  const meds = new Array<number>(B)
  const re = new Array<number>(n)
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) re[i] = samples[(rand() * n) | 0]!
    meds[b] = median(re)
  }
  meds.sort((a, b) => a - b)
  return [meds[(B * 0.025) | 0]!, meds[(B * 0.975) | 0]!]
}

interface Cell {
  median: number
  ci: [number, number]
  n: number
}
const ciOverlap = (a: Cell, b: Cell): boolean => a.ci[0] <= b.ci[1] && b.ci[0] <= a.ci[1]

function runtimeBanner(): string {
  const engine =
    typeof Bun !== 'undefined'
      ? `bun ${Bun.version} (JavaScriptCore)`
      : `node ${process.version} (V8)`
  const load = loadavg()
    .map((l) => l.toFixed(2))
    .join(' ')
  return `${engine} · ${process.platform}/${process.arch} · ${cpus()[0]?.model ?? 'unknown cpu'} · loadavg ${load} · NODE_ENV=${process.env.NODE_ENV}`
}

/** Child argv: `<op> <impl>` (flags such as `--quick` are ignored here). */
const childArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))

function runIsolatedCells<I extends string>(
  ops: readonly string[],
  impls: readonly I[],
): Record<string, Record<I, Cell>> {
  const pooled: Record<string, Record<string, number[]>> = {}
  for (const op of ops) {
    pooled[op] = {}
    for (const impl of impls) pooled[op]![impl] = []
  }
  for (let round = 0; round < ROUNDS; round++) {
    ops.forEach((op, opIndex) => {
      const k = (round + opIndex) % impls.length
      const order = [...impls.slice(k), ...impls.slice(0, k)]
      for (const impl of order) {
        const proc = Bun.spawnSync(
          [process.execPath, import.meta.path, op, impl, ...(QUICK ? ['--quick'] : [])],
          { env: { ...process.env, NODE_ENV: 'production' } },
        )
        if (proc.exitCode !== 0) {
          throw new Error(
            `child failed for (op "${op}", impl "${impl}"):\n${new TextDecoder().decode(proc.stderr)}`,
          )
        }
        const out = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
        pooled[op]![impl]!.push(...out.samples)
      }
    })
  }
  const result: Record<string, Record<I, Cell>> = {}
  for (const op of ops) {
    const row = {} as Record<I, Cell>
    for (const impl of impls) {
      const s = pooled[op]![impl]!
      row[impl] = { median: median(s), ci: bootstrapCI(s, `${op}::${impl}`), n: s.length }
    }
    result[op] = row
  }
  return result
}

/** Two-library table: Pyreon vs one competitor, CI + tie verdict per row. */
function printPairTable<I extends string>(opts: {
  title: string
  ops: readonly string[]
  cells: Record<string, Record<I, Cell>>
  pyreon: I
  competitor: I
  competitorLabel: string
  notes: Record<string, string | undefined>
  opWidth: number
}): void {
  const { ops, cells, pyreon, competitor, competitorLabel, notes, opWidth } = opts
  console.log(`=== ${opts.title} ===`)
  console.log(runtimeBanner())
  console.log(
    `one fresh process per (op × library) · ${ROUNDS} round(s), impl order rotated · pooled median ns/op [seeded bootstrap CI95] · 🤝 = CI overlap (tie)${QUICK ? ' · --quick: TIMINGS MEANINGLESS' : ''}\n`,
  )
  const fmtCell = (c: Cell) => `${c.median.toFixed(0)} [${c.ci[0].toFixed(0)}–${c.ci[1].toFixed(0)}]`
  console.log(
    `${'op'.padEnd(opWidth)} ${'pyreon'.padStart(20)} ${competitorLabel.padStart(20)}  verdict   note`,
  )
  console.log('─'.repeat(opWidth + 80))
  for (const op of ops) {
    const p = cells[op]![pyreon]
    const c = cells[op]![competitor]
    const ratio = c.median / p.median
    const verdict = ciOverlap(p, c)
      ? '🤝 tie'
      : ratio >= 1
        ? `pyreon ${ratio.toFixed(1)}x faster`
        : `pyreon ${(1 / ratio).toFixed(1)}x SLOWER`
    console.log(
      `${op.padEnd(opWidth)} ${fmtCell(p).padStart(20)} ${fmtCell(c).padStart(20)}  ${verdict}   ${notes[op] ?? ''}`,
    )
  }
}

let sink = 0
const IMPLS = ['pyreon', 'casl'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => void>

const OPS: Record<string, { note?: string; make: () => Impl }> = {
  // ── memo-hit family — a Map.get on the Pyreon side, NOT a resolve ──────────
  'exact allow (memo hit)': {
    note: 'Pyreon = memo Map.get (warmup filled it); CASL = full rule match. NOT a resolver race.',
    make: () => ({
      pyreon: () => {
        sink += pyr('posts.read') ? 1 : 0
      },
      casl: () => {
        sink += ability.can('read', 'Post') ? 1 : 0
      },
    }),
  },
  'exact deny (memo hit)': {
    note: 'Pyreon = memo Map.get; CASL = full rule match. NOT a resolver race.',
    make: () => ({
      pyreon: () => {
        sink += pyr('posts.delete') ? 0 : 1
      },
      casl: () => {
        sink += ability.can('delete', 'Post') ? 0 : 1
      },
    }),
  },
  'wildcard / broad grant (memo hit)': {
    note: 'Pyreon = memo Map.get (the ancestor walk to `admin.**` ran ONCE in warmup); CASL = `manage` rule match.',
    make: () => ({
      pyreon: () => {
        sink += pyr('admin.users.ban') ? 1 : 0
      },
      casl: () => {
        sink += ability.can('ban', 'Admin') ? 1 : 0
      },
    }),
  },
  'multi-check all (memo hit)': {
    note: 'CASL has no batch primitive — Pyreon `can.all` (2 memo hits) vs 2 sequential `ability.can`',
    make: () => ({
      pyreon: () => {
        sink += pyr.all('posts.read', 'posts.write') ? 1 : 0
      },
      casl: () => {
        sink += ability.can('read', 'Post') && ability.can('write', 'Post') ? 1 : 0
      },
    }),
  },

  // ── uncached family — the RESOLVER race (memo disabled by a predicate) ─────
  'exact allow (uncached)': {
    note: 'FAIR resolver race — Pyreon memo OFF (map holds one predicate), so both do full resolution.',
    make: () => ({
      pyreon: () => {
        sink += pyrUncached('posts.read') ? 1 : 0
      },
      casl: () => {
        sink += ability.can('read', 'Post') ? 1 : 0
      },
    }),
  },
  'exact deny (uncached)': {
    note: 'FAIR resolver race — a miss walks `parent.*` then the `**` ancestor chain before denying.',
    make: () => ({
      pyreon: () => {
        sink += pyrUncached('posts.delete') ? 0 : 1
      },
      casl: () => {
        sink += ability.can('delete', 'Post') ? 0 : 1
      },
    }),
  },
  'wildcard / broad grant (uncached)': {
    note: 'FAIR resolver race — Pyreon really walks the ancestors to `admin.**` on EVERY call; CASL matches `manage`.',
    make: () => ({
      pyreon: () => {
        sink += pyrUncached('admin.users.ban') ? 1 : 0
      },
      casl: () => {
        sink += ability.can('ban', 'Admin') ? 1 : 0
      },
    }),
  },
  'multi-check all (uncached)': {
    note: 'FAIR resolver race — Pyreon `can.all` (2 full resolves) vs 2 sequential `ability.can`',
    make: () => ({
      pyreon: () => {
        sink += pyrUncached.all('posts.read', 'posts.write') ? 1 : 0
      },
      casl: () => {
        sink += ability.can('read', 'Post') && ability.can('write', 'Post') ? 1 : 0
      },
    }),
  },
}
const OP_ORDER = Object.keys(OPS)

// ─── child mode: measure ONE (op, impl) cell, print JSON ─────────────────────
const [childOp, childImpl] = childArgs
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  if (!childImpl || !(IMPLS as readonly string[]).includes(childImpl)) {
    throw new Error(`unknown impl: ${String(childImpl)}`)
  }
  // `make()` builds both arms' fixtures, but ONLY `childImpl` is warmed + timed.
  const fn = spec.make()[childImpl as ImplName]
  const samples = measureSamples(fn)
  // `sink` is written out so the measured work is observable (no DCE).
  process.stdout.write(JSON.stringify({ samples, sink }))
  process.exit(0)
}

// ─── orchestrator: correctness gate, then spawn one child per op ─────────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
{
  // Both Pyreon instances must agree with CASL on every measured check — the
  // uncached instance must not answer DIFFERENTLY just because its memo is off.
  for (const [label, p] of [
    ['memo', pyr],
    ['uncached', pyrUncached],
  ] as const) {
    assert(p('posts.read') === ability.can('read', 'Post') && p('posts.read') === true, `${label}: exact allow`)
    assert(p('posts.delete') === ability.can('delete', 'Post') && p('posts.delete') === false, `${label}: exact deny`)
    assert(p('admin.users.ban') === ability.can('ban', 'Admin') && p('admin.users.ban') === true, `${label}: wildcard`)
    const pAll = p.all('posts.read', 'posts.write')
    const cAll = ability.can('read', 'Post') && ability.can('write', 'Post')
    assert(pAll === cAll && pAll === true, `${label}: multi-check all`)
  }

  // The `(uncached)` family's whole premise is that `index.hasPredicate` is set,
  // which is derived from "some value in the map is a function". Assert that
  // premise here so a future edit that drops the predicate from the setup turns
  // the resolver rows back into memo hits LOUDLY instead of silently.
  // LIMIT (honest): the memo is closure-private, so this gate proves the INPUT
  // condition (a predicate is in the map), not the memo bypass itself. A change
  // to `can()`'s gating in src/permissions.ts would not be caught here — it is
  // caught by that file's own unit tests.
  assert(
    pyrUncached.entries().some(([, v]) => typeof v === 'function'),
    'uncached instance lost its predicate — the memo would be ON and the resolver rows meaningless',
  )
  assert(
    pyr.entries().every(([, v]) => typeof v !== 'function'),
    'memo instance gained a predicate — the memo-hit rows would no longer be memo hits',
  )

  console.log('✓ correctness gate passed — both grant systems agree on every check\n')
  console.log('  (memo instance: all-static map ⇒ key→boolean memo ACTIVE)')
  console.log('  (uncached instance: 1 predicate in map ⇒ memo BYPASSED, full resolve per call)\n')
}
if (process.env.BENCH_GATE_ONLY) process.exit(0)

const cells = runIsolatedCells(OP_ORDER, IMPLS)
const notes: Record<string, string | undefined> = {}
for (const op of OP_ORDER) notes[op] = OPS[op]?.note
printPairTable({
  title: '@pyreon/permissions vs CASL',
  ops: OP_ORDER,
  cells,
  pyreon: 'pyreon',
  competitor: 'casl',
  competitorLabel: 'casl',
  notes,
  opWidth: 36,
})
console.log(
  `\n(verdict = casl ÷ pyreon median, printed only when the CI95s do NOT overlap. ns is machine-dependent — the ratio is the portable signal.)`,
)
console.log(
  `(READ THE FAMILY LABEL. \`(memo hit)\` rows are a Pyreon cache read vs a CASL rule match — they measure repeated-check throughput, NOT resolution, and MUST NOT be quoted as a resolver comparison. \`(uncached)\` rows are the resolver race: Pyreon's memo is disabled there by a predicate in the map, so both sides fully resolve every call. The CASL column is the same work in both families — a large gap between a memo-hit row and its uncached twin IS the memo's contribution.)`,
)
