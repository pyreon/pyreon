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
 *  - PER-OP PROCESS ISOLATION (each op in a fresh `bun` child).
 *  - DISCLOSURE: i18next's `init()` is ASYNC + runs a plugin/format pipeline;
 *    `t` resolution walks that pipeline. Pyreon's `t` is a direct reactive
 *    lookup. For `date`, the two libraries' DEFAULT `Intl.DateTimeFormat`
 *    options differ (Pyreon defaults to `{dateStyle:'medium', timeStyle:'short'}`;
 *    i18next uses the locale default) — so the date op is not byte-identical;
 *    the gate asserts both format the SAME instant (both contain the year), and
 *    the op is flagged. `number` IS byte-identical (both `Intl.NumberFormat(en)`).
 *  - Median ns/op over warmup + N runs; a `sink` defeats DCE.
 */
process.env.NODE_ENV = 'production'

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
  interpolation: { escapeValue: false },
})

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

declare const Bun: {
  spawnSync: (cmd: string[], opts: { env: Record<string, string | undefined> }) => { stdout: Uint8Array; exitCode: number }
}
interface Row {
  op: string
  pyreon: number
  i18next: number
  note?: string
}
const rows: Row[] = []
for (const op of OP_ORDER) {
  const proc = Bun.spawnSync(['bun', import.meta.path, op], { env: { ...process.env, NODE_ENV: 'production' } })
  if (proc.exitCode !== 0) throw new Error(`child failed for op "${op}"`)
  const r = JSON.parse(new TextDecoder().decode(proc.stdout)) as Record<ImplName, number>
  rows.push({ op, pyreon: r.pyreon, i18next: r.i18next, note: OPS[op]?.note })
}

console.log(`=== @pyreon/i18n vs i18next (${process.platform}/${process.arch}, NODE_ENV=production, per-op isolated, median ns/op) ===\n`)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(`${pad('op', 26)} ${padL('pyreon', 9)} ${padL('i18next', 9)} ${padL('ratio', 14)}   note`)
console.log('─'.repeat(110))
for (const r of rows) {
  const ratio = r.i18next / r.pyreon
  const ratioStr = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`
  console.log(`${pad(r.op, 26)} ${padL(r.pyreon.toFixed(0), 9)} ${padL(r.i18next.toFixed(0), 9)} ${padL(ratioStr, 14)}   ${r.note ?? ''}`)
}
console.log(`\n(ratio = i18next ÷ Pyreon; >1 ⇒ Pyreon faster. Median 11×20k, each op in a fresh process. ns machine-dependent — the ratio is the portable signal.)`)
