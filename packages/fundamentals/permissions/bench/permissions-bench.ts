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
 */
process.env.NODE_ENV = 'production'

import { AbilityBuilder, createMongoAbility } from '@casl/ability'
import { createPermissions } from '../src/index'

// ─── permission setup (equivalent grants per library) ────────────────────────
// Granted: read+write on Post; a broad subtree grant on Admin. NOT granted:
// delete on Post.
const pyr = createPermissions({
  'posts.read': true,
  'posts.write': true,
  'admin.**': true, // subtree grant (any depth below `admin`)
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
  'exact allow': {
    make: () => ({
      pyreon: () => {
        sink += pyr('posts.read') ? 1 : 0
      },
      casl: () => {
        sink += ability.can('read', 'Post') ? 1 : 0
      },
    }),
  },
  'exact deny': {
    make: () => ({
      pyreon: () => {
        sink += pyr('posts.delete') ? 0 : 1
      },
      casl: () => {
        sink += ability.can('delete', 'Post') ? 0 : 1
      },
    }),
  },
  'wildcard / broad grant': {
    note: 'Pyreon walks ancestors to `admin.**`; CASL matches the `manage` rule',
    make: () => ({
      pyreon: () => {
        sink += pyr('admin.users.ban') ? 1 : 0
      },
      casl: () => {
        sink += ability.can('ban', 'Admin') ? 1 : 0
      },
    }),
  },
  'multi-check (all)': {
    note: 'CASL has no batch primitive — Pyreon `can.all` vs N sequential `ability.can`',
    make: () => ({
      pyreon: () => {
        sink += pyr.all('posts.read', 'posts.write') ? 1 : 0
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
  assert(pyr('posts.read') === ability.can('read', 'Post') && pyr('posts.read') === true, 'exact allow')
  assert(pyr('posts.delete') === ability.can('delete', 'Post') && pyr('posts.delete') === false, 'exact deny')
  assert(pyr('admin.users.ban') === ability.can('ban', 'Admin') && pyr('admin.users.ban') === true, 'wildcard')
  const pAll = pyr.all('posts.read', 'posts.write')
  const cAll = ability.can('read', 'Post') && ability.can('write', 'Post')
  assert(pAll === cAll && pAll === true, 'multi-check all')
  console.log('✓ correctness gate passed — both grant systems agree on every check\n')
}

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
console.log(`${pad('op', 24)} ${padL('pyreon', 9)} ${padL('casl', 9)} ${padL('ratio', 14)}   note`)
console.log('─'.repeat(110))
for (const r of rows) {
  const ratio = r.casl / r.pyreon
  const ratioStr = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`
  console.log(`${pad(r.op, 24)} ${padL(r.pyreon.toFixed(0), 9)} ${padL(r.casl.toFixed(0), 9)} ${padL(ratioStr, 14)}   ${r.note ?? ''}`)
}
console.log(`\n(ratio = CASL ÷ Pyreon; >1 ⇒ Pyreon faster. Median 11×20k, each op in a fresh process. ns machine-dependent — the ratio is the portable signal. The two libraries' permission MODELS differ — see header.)`)
