/**
 * @pyreon/i18n vs i18next — objective head-to-head.
 *
 * Run: `bun run bench:i18next` (sets NODE_ENV=production).
 *
 * Objectivity contract (see .claude/plans/fundamentals-benchmarks.md):
 *  - NODE_ENV=production (shell-set) before either library loads.
 *  - Idiomatic per library — i18next is the REFERENCE Pyreon mirrors, so the
 *    key conventions are identical by design: `{{name}}` interpolation,
 *    `key_one`/`key_other` plural suffixes with `{ count }`, and a built-in
 *    Intl `number` / date formatter reachable from `t()` via inline format
 *    specs (i18next ≥21.3 ships these in core — no plugin).
 *  - CORRECTNESS GATE asserts both produce identical output for `t` /
 *    interpolation / plural / number, and (for date) both format the same
 *    instant — see the date DISCLOSURE below.
 *  - PER-(OP × LIBRARY) PROCESS ISOLATION — each cell runs in a fresh child
 *    in which ONLY that library's path is warmed + timed (it used to be one
 *    child per op timing Pyreon FIRST, then the competitor, in the same
 *    process — an order bias against whichever ran second or first).
 *  - DISCLOSURE: i18next's `init()` is ASYNC + runs a plugin/format pipeline;
 *    `t` resolution walks that pipeline. Pyreon's `t` is a direct reactive
 *    lookup. For `date`, the two libraries' DEFAULT `Intl.DateTimeFormat`
 *    options differ (Pyreon defaults to `{dateStyle:'medium', timeStyle:'short'}`;
 *    i18next uses the locale default) — so the date op is not byte-identical;
 *    the gate asserts both format the SAME instant (both contain the year), and
 *    the op is flagged. `number` IS byte-identical (both `Intl.NumberFormat(en)`).
 *  - DISCLOSURE (escaping): i18next HTML-escapes interpolated values BY DEFAULT
 *    (an XSS-safety feature); Pyreon's `t` does NOT escape. The bench sets
 *    i18next `escapeValue: false` so both produce the SAME (raw) output — an
 *    apples-to-apples interpolation-SPEED comparison, not a security-posture one.
 *    Note this is the CONSERVATIVE choice toward Pyreon: it gives i18next its
 *    FASTER (non-escaping) path, so a realistic i18next app (escaping ON) would
 *    be somewhat slower than measured here — Pyreon's interpolation win is if
 *    anything understated, never inflated. (Verified empirically: Pyreon outputs
 *    `<b>Ada</b>` raw, identical to i18next esc=off; i18next esc=on escapes it.)
 *  - Impl order rotated per round; samples pooled over ${BENCH_ROUNDS:-4}
 *    rounds → median ns/op + seeded bootstrap CI95; CI overlap = 🤝 tie.
 *    A `sink` (written out by every child) defeats DCE. `--quick` = a
 *    correctness/structure smoke with meaningless timings.
 */
process.env.NODE_ENV = 'production'

import { cpus, loadavg } from 'node:os'
import i18next from 'i18next'
import { createI18n } from '../src/index'

// ─── shared message catalog (identical keys/values per library convention) ───
const MESSAGES = {
  greeting: 'Hello there, friend',
  hello: 'Hello {{name}}, welcome back',
  items_one: '{{count}} item in your cart',
  items_other: '{{count}} items in your cart',
  price: 'Total: {{val, number}}',
  when: 'Updated {{val, datetime}}',
}
const FIXED_DATE = new Date(Date.UTC(2026, 0, 15, 9, 30))

// Pyreon instance.
const pyr = createI18n({ locale: 'en', messages: { en: MESSAGES } })

// i18next instance (own instance, not the global singleton) — async init awaited.
const i18 = i18next.createInstance()
await i18.init({
  lng: 'en',
  resources: { en: { translation: MESSAGES } },
  // escapeValue:false → both libraries output raw (symmetric work). i18next
  // escapes by default (XSS-safety); Pyreon's t does not. Disabling it here is
  // the conservative choice — it gives i18next its faster non-escaping path. See
  // the escaping DISCLOSURE in the header.
  interpolation: { escapeValue: false },
})

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
const IMPLS = ['pyreon', 'i18next'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => void>

const OPS: Record<string, { note?: string; make: () => Impl }> = {
  't (plain lookup)': {
    make: () => ({
      pyreon: () => {
        sink += pyr.t('greeting').length
      },
      i18next: () => {
        sink += i18.t('greeting').length
      },
    }),
  },
  'interpolation {{name}}': {
    make: () => ({
      pyreon: () => {
        sink += pyr.t('hello', { name: 'Ada' }).length
      },
      i18next: () => {
        sink += i18.t('hello', { name: 'Ada' }).length
      },
    }),
  },
  'plural {count}': {
    make: () => {
      let i = 0
      return {
        pyreon: () => {
          i++
          sink += pyr.t('items', { count: i }).length
        },
        i18next: () => {
          i++
          sink += i18.t('items', { count: i }).length
        },
      }
    },
  },
  'number ({{v, number}})': {
    note: 'byte-identical (both Intl.NumberFormat(en))',
    make: () => ({
      pyreon: () => {
        sink += pyr.t('price', { val: 1234.5 }).length
      },
      i18next: () => {
        sink += i18.t('price', { val: 1234.5 }).length
      },
    }),
  },
  'date ({{v, datetime}})': {
    note: 'default Intl.DateTimeFormat options differ per library — not byte-identical',
    make: () => ({
      pyreon: () => {
        sink += pyr.t('when', { val: FIXED_DATE }).length
      },
      i18next: () => {
        sink += i18.t('when', { val: FIXED_DATE }).length
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
  assert(pyr.t('greeting') === i18.t('greeting'), 't plain')
  assert(pyr.t('hello', { name: 'Ada' }) === i18.t('hello', { name: 'Ada' }), 'interpolation')
  assert(pyr.t('items', { count: 1 }) === i18.t('items', { count: 1 }), 'plural one')
  assert(pyr.t('items', { count: 5 }) === i18.t('items', { count: 5 }), 'plural other')
  assert(pyr.t('price', { val: 1234.5 }) === i18.t('price', { val: 1234.5 }), `number (p="${pyr.t('price', { val: 1234.5 })}" i="${i18.t('price', { val: 1234.5 })}")`)
  // date: defaults differ per library; assert both formatted the SAME instant.
  const pd = pyr.t('when', { val: FIXED_DATE })
  const id = i18.t('when', { val: FIXED_DATE })
  assert(pd.includes('2026') && id.includes('2026'), `date both format the instant (p="${pd}" i="${id}")`)
  console.log('✓ correctness gate passed — t/interpolation/plural/number byte-identical; date formats the same instant (defaults differ)\n')
}

const cells = runIsolatedCells(OP_ORDER, IMPLS)
const notes: Record<string, string | undefined> = {}
for (const op of OP_ORDER) notes[op] = OPS[op]?.note
printPairTable({
  title: '@pyreon/i18n vs i18next',
  ops: OP_ORDER,
  cells,
  pyreon: 'pyreon',
  competitor: 'i18next',
  competitorLabel: 'i18next',
  notes,
  opWidth: 26,
})
console.log(
  `\n(verdict = i18next ÷ pyreon median, printed only when the CI95s do NOT overlap. ns is machine-dependent — the ratio is the portable signal.)`,
)
