/**
 * @pyreon/permissions vs CASL — objective head-to-head.
 *
 * Run: `bun run bench:casl` (sets NODE_ENV=production).
 *
 * Objectivity contract (see .claude/plans/fundamentals-benchmarks.md):
 *  - NODE_ENV=production (shell-set) before either library loads.
 *  - Idiomatic per library — Pyreon `createPermissions(map)` + `can('a.b')` flat
 *    hierarchical string keys; CASL `AbilityBuilder(createMongoAbility)` +
 *    `ability.can(action, subject)`.
 *  - CORRECTNESS GATE asserts both return the SAME boolean for every check.
 *  - PER-OP PROCESS ISOLATION (each op in a fresh `bun` child).
 *  - DISCLOSURE: the two MODELS differ — Pyreon is flat hierarchical string keys
 *    (`'posts.read'`) with `*`/`**` wildcards; CASL is (action, subject) pairs
 *    with `manage`/`all` wildcards + MongoDB-condition matching (a richer,
 *    different shape). The bench measures the COMMON op both answer: "is this
 *    permission granted?" (a boolean check). CASL has no `all`/`any` batch
 *    primitive, so the multi-check op compares Pyreon's `can.all` to N sequential
 *    `ability.can` calls (the idiomatic CASL way) — flagged.
 *  - Median ns/op over warmup + N runs; a `sink` defeats DCE.
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

const now = () => Number(process.hrtime.bigint())
function measure(fn: () => void, { warmup = 2_000, iters = 20_000, runs = 11 } = {}): number {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    samples.push((now() - t0) / iters)
  }
  samples.sort((a, b) => a - b)
  return samples[samples.length >> 1] as number
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

// ─── child mode ──────────────────────────────────────────────────────────────
const childOp = process.argv[2]
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  const impl = spec.make()
  const out: Record<string, number> = {}
  for (const name of IMPLS) out[name] = measure(impl[name])
  process.stdout.write(JSON.stringify(out))
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

declare const Bun: {
  spawnSync: (cmd: string[], opts: { env: Record<string, string | undefined> }) => { stdout: Uint8Array; exitCode: number }
}
interface Row {
  op: string
  pyreon: number
  casl: number
  note?: string
}
const rows: Row[] = []
for (const op of OP_ORDER) {
  const proc = Bun.spawnSync(['bun', import.meta.path, op], { env: { ...process.env, NODE_ENV: 'production' } })
  if (proc.exitCode !== 0) throw new Error(`child failed for op "${op}"`)
  const r = JSON.parse(new TextDecoder().decode(proc.stdout)) as Record<ImplName, number>
  rows.push({ op, pyreon: r.pyreon, casl: r.casl, note: OPS[op]?.note })
}

console.log(`=== @pyreon/permissions vs CASL (${process.platform}/${process.arch}, NODE_ENV=production, per-op isolated, median ns/op) ===\n`)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(`${pad('op', 36)} ${padL('pyreon', 9)} ${padL('casl', 9)} ${padL('ratio', 14)}   note`)
console.log('─'.repeat(150))
for (const r of rows) {
  const ratio = r.casl / r.pyreon
  const ratioStr = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`
  console.log(`${pad(r.op, 36)} ${padL(r.pyreon.toFixed(0), 9)} ${padL(r.casl.toFixed(0), 9)} ${padL(ratioStr, 14)}   ${r.note ?? ''}`)
}
console.log(`\n(ratio = CASL ÷ Pyreon; >1 ⇒ Pyreon faster. Median 11×20k, each op in a fresh process. ns machine-dependent — the ratio is the portable signal. The two libraries' permission MODELS differ — see header.)`)
console.log(
  `(READ THE FAMILY LABEL. \`(memo hit)\` rows are a Pyreon cache read vs a CASL rule match — they measure repeated-check throughput, NOT resolution, and MUST NOT be quoted as a resolver comparison. \`(uncached)\` rows are the resolver race: Pyreon's memo is disabled there by a predicate in the map, so both sides fully resolve every call. The CASL column is the same work in both families — a large gap between a memo-hit row and its uncached twin IS the memo's contribution.)`,
)
