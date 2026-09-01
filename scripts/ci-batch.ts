#!/usr/bin/env bun
/**
 * Pack CI matrix cells into a bounded number of BATCHES.
 *
 * ## Why
 *
 * A matrix cell is not free. Every cell pays, before it runs a single test:
 * a runner queue wait, `actions/checkout`, `setup-pyreon` (bun + two cache
 * restores) and — for e2e — a Playwright browser install. Measured on run
 * 31023199747 (a normal PR, 73 jobs):
 *
 *   e2e (cssvars)       35s setup :  8s test   (81% overhead)
 *   e2e (islands)       52s setup : 14s test   (79%)
 *   e2e (ui-regression) 49s setup : 30s test   (62%)
 *   e2e (core)          47s setup : 89s test   (34%)
 *
 * Across 25 e2e cells that is ~19 minutes of runner time spent re-doing the
 * same setup to run ~8 minutes of tests.
 *
 * The queue side is worse, because the runner pool is SHARED across every
 * in-flight branch. That same run: 1,732 minutes of summed queue wait against
 * 87 minutes of summed work — a 19.8x tax — with a median cell waiting 30.6
 * minutes for a slot it then used for under a minute.
 *
 * Splitting one job into N gains wall-clock ONLY while runners are free. Under
 * contention the cells serialise through the queue anyway, so the split buys
 * nothing and costs N setups plus N queue entries. Fanning out 73 jobs also
 * makes the contention worse for every OTHER branch — the pool is shared, so
 * job count is a cost borne repo-wide, not just by the PR that spends it.
 *
 * Batching keeps the isolation that matters (a batch still reports its own
 * check, `fail-fast: false` still stops one batch killing another, each
 * member still runs as its own process) while cutting the fixed per-cell cost
 * by the batch factor.
 *
 * ## Weights are for BALANCE only — never for correctness
 *
 * Batches are packed longest-processing-time-first, which needs a per-item
 * cost estimate. `WEIGHTS` holds measured seconds; anything absent gets
 * `DEFAULT_WEIGHT`. A stale or missing weight can only make batches
 * lopsided (a slower wall-clock) — it can never drop an item or change what
 * runs. Every input item appears in exactly one batch, which is asserted.
 */

/** Measured wall-seconds per cell (run 31023199747 + prior runs), used only
 *  to balance batches. Unknown items fall back to DEFAULT_WEIGHT. */
const WEIGHTS: Record<string, number> = {
  // ── e2e suites ──
  core: 89,
  'ui-regression': 30,
  islands: 14,
  'collab-board': 25,
  cssvars: 8,
  'ssg-i18n-prefix': 20,
  'ssg-i18n': 20,
  'ssg-subpath': 18,
  'ssr-node': 25,
  'isr-node': 25,
  'zero-hmr': 20,
  'zero-islands': 20,
  'app-showcase': 40,
  compat: 35,
  'sync-yjs-demo': 20,
  'sync-ws-relay': 30,
  'perf-dashboard': 20,
  // ── typecheck categories ──
  examples: 222,
  fundamentals: 94,
  tools: 80,
  'ui-system': 64,
  zero: 56,
  internals: 30,
  native: 40,
  ui: 30,
  // ── test categories (native is the slow tail) ──
  'native-rest': 332,
  'native-compiler-1': 120,
  'native-compiler-2': 120,
  // ── scaffold-smoke cells (run 31084707225; a scaffolded app's cold
  //    `bun install` + `vite build` — monorepo-vercel auto-skips on a
  //    version-ahead workspace, hence the outlier) ──
  'cpa-smoke-app-vercel': 366,
  'cpa-smoke-app-static': 359,
  'cpa-smoke-blog-cloudflare': 373,
  'cpa-smoke-dashboard-vercel-full': 370,
  'cpa-smoke-dashboard-node-supabase': 372,
  'cpa-smoke-monorepo-vercel': 35,
}

/** Cells with no measured weight — mid-range so an unknown never dominates
 *  nor disappears into a batch. */
export const DEFAULT_WEIGHT = 45

export function weightOf(name: string): number {
  return WEIGHTS[name] ?? DEFAULT_WEIGHT
}

/**
 * Pack `items` into at most `maxBatches` groups, balancing total weight.
 *
 * Longest-processing-time-first: sort descending, then repeatedly place the
 * next item into the lightest batch. Simple, deterministic, and within 4/3 of
 * optimal for this shape — far more than good enough when the alternative is
 * paying a fresh setup per item.
 *
 * Fewer items than batches simply yields fewer batches (never empty ones).
 */
export function batchByWeight(items: readonly string[], maxBatches: number): string[][] {
  if (maxBatches < 1) throw new Error('[ci-batch] maxBatches must be >= 1')
  if (items.length === 0) return []
  const n = Math.min(maxBatches, items.length)
  const bins: { weight: number; items: string[] }[] = Array.from({ length: n }, () => ({
    weight: 0,
    items: [],
  }))
  // Sort by weight desc, then name, so the packing is stable across runs —
  // a matrix that reshuffles per run would defeat check-name continuity.
  const sorted = [...items].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b))
  for (const item of sorted) {
    let lightest = bins[0]!
    for (const bin of bins) if (bin.weight < lightest.weight) lightest = bin
    lightest.items.push(item)
    lightest.weight += weightOf(item)
  }
  // Keep each batch's members in stable name order for readable logs.
  return bins.map((b) => b.items.sort((a, c) => a.localeCompare(c))).filter((b) => b.length > 0)
}

/** A matrix entry: a stable cell name plus the space-separated members. */
export interface BatchEntry {
  name: string
  members: string
}

/**
 * Build the GitHub Actions matrix `include` array.
 *
 * The cell NAME is derived from its members so a batch is self-describing in
 * the checks list (`e2e (core+islands)`), and truncated so a wide batch does
 * not produce an unreadable check name.
 */
export function toMatrix(batches: readonly (readonly string[])[]): BatchEntry[] {
  return batches.map((members) => {
    const label = members.join('+')
    return {
      name: label.length <= 48 ? label : `${members[0]}+${members.length - 1} more`,
      members: members.join(' '),
    }
  })
}

/**
 * Batch, then emit the matrix — the one call sites use.
 *
 * `isolate` names cells that must stay in a batch of their own. That is not a
 * performance knob: the `native-*` test cells key a compile-verdict cache on
 * their own category (`native-verdicts-ci-<os>-<category>-…`), and the three
 * cells derive DISJOINT verdict sets. Merging one into a mixed batch would
 * make its cache key ambiguous and silently turn every lookup into a miss —
 * so isolation here preserves correctness of a cache, not speed.
 */
export function buildBatchedMatrix(
  items: readonly string[],
  maxBatches: number,
  isolate: readonly string[] = [],
): BatchEntry[] {
  const isolated = items.filter((i) => isolate.includes(i))
  const batchable = items.filter((i) => !isolate.includes(i))
  const batches = [...batchByWeight(batchable, maxBatches), ...isolated.map((i) => [i])]
  // Invariant: batching NEVER drops or duplicates an item. A silently-lost
  // cell is a silently-skipped check, which is the one failure mode this
  // whole file must not introduce.
  const packed = batches.flat().sort()
  const input = [...items].sort()
  if (packed.length !== input.length || packed.some((v, i) => v !== input[i])) {
    throw new Error(
      `[ci-batch] batching lost or duplicated items — in: ${input.join(',')} out: ${packed.join(',')}`,
    )
  }
  return toMatrix(batches)
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// bun scripts/ci-batch.ts --items='["a","b","c"]' --max=4 [--isolate=x,y]
if (import.meta.main) {
  const arg = (k: string): string | undefined =>
    process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
  const raw = arg('items') ?? '[]'
  const max = Number(arg('max') ?? '4')
  const isolate = (arg('isolate') ?? '').split(',').filter(Boolean)
  let items: string[]
  try {
    items = JSON.parse(raw) as string[]
  } catch {
    // oxlint-disable-next-line no-console
    console.error(`[ci-batch] --items is not valid JSON: ${raw}`)
    process.exit(1)
  }
  // oxlint-disable-next-line no-console
  console.log(JSON.stringify(buildBatchedMatrix(items, max, isolate)))
}
