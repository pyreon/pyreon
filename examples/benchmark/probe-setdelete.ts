/**
 * V8 `Set.delete(closure)` mechanism probe — NOT a framework benchmark.
 *
 * The dispose ablation attributes ~24µs of Pyreon's 36µs on-CPU teardown to
 * removing effect closures from their signals' `_s` subscriber Sets. This
 * probe asks the mechanism question that decides which levers exist:
 *
 *   1. What does one `Set.delete(fn)` actually cost at the subscriber-set
 *      sizes real components produce (1, 2, 4)?
 *   2. Does V8's shrink-on-delete (rehash when deleted >= capacity/2) make
 *      DRAINING a small set disproportionately expensive vs deleting the same
 *      number of keys from large sets?
 *   3. Is `clear()` on a fully-drained set cheaper than deleting its members?
 *   4. How does an ARRAY swap-remove by index (Solid's storage) compare?
 *
 * Each arm does the SAME total number of removals (TOTAL), so the arms are
 * directly comparable. Run in the bench page so it is the same V8 the
 * framework numbers came from.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = process.env.DP_PORT ?? '4188'
const preview = spawn('bunx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForLoadState('networkidle')

  const out = await page.evaluate(() => {
    const TOTAL = 1000 // removals per arm — matches 500 rows x 2 subscriptions
    const REPS = 200

    const mkFns = (n: number): (() => void)[] =>
      Array.from({ length: n }, () => {
        // A distinct closure per entry, like a real effect's `run`.
        let x = 0
        return () => {
          x++
        }
      })

    const median = (a: number[]): number => {
      const s = [...a].sort((p, q) => p - q)
      return s[Math.floor(s.length / 2)] as number
    }

    /** Drain `count`-sized Sets until TOTAL keys are removed. */
    const armDrainSets = (setSize: number): number => {
      const nSets = TOTAL / setSize
      const times: number[] = []
      for (let r = 0; r < REPS; r++) {
        const fns: (() => void)[][] = []
        const sets: Set<() => void>[] = []
        for (let i = 0; i < nSets; i++) {
          const f = mkFns(setSize)
          const s = new Set(f)
          fns.push(f)
          sets.push(s)
        }
        const t0 = performance.now()
        for (let i = 0; i < nSets; i++) {
          const s = sets[i] as Set<() => void>
          const f = fns[i] as (() => void)[]
          for (let j = 0; j < setSize; j++) s.delete(f[j] as () => void)
        }
        times.push(performance.now() - t0)
      }
      return (median(times) * 1e6) / TOTAL // ns per removal
    }

    /** Delete TOTAL keys from a few LARGE sets (no per-set shrink storm). */
    const armDeleteFromLarge = (setSize: number, deleteFraction: number): number => {
      const perSet = Math.floor(setSize * deleteFraction)
      const nSets = Math.max(1, Math.round(TOTAL / perSet))
      const times: number[] = []
      for (let r = 0; r < REPS; r++) {
        const fns: (() => void)[][] = []
        const sets: Set<() => void>[] = []
        for (let i = 0; i < nSets; i++) {
          const f = mkFns(setSize)
          sets.push(new Set(f))
          fns.push(f)
        }
        const t0 = performance.now()
        for (let i = 0; i < nSets; i++) {
          const s = sets[i] as Set<() => void>
          const f = fns[i] as (() => void)[]
          for (let j = 0; j < perSet; j++) s.delete(f[j] as () => void)
        }
        times.push(performance.now() - t0)
      }
      return (median(times) * 1e6) / (nSets * perSet)
    }

    /** clear() a fully-drained set instead of deleting each member. */
    const armClearSets = (setSize: number): number => {
      const nSets = TOTAL / setSize
      const times: number[] = []
      for (let r = 0; r < REPS; r++) {
        const sets: Set<() => void>[] = []
        for (let i = 0; i < nSets; i++) sets.push(new Set(mkFns(setSize)))
        const t0 = performance.now()
        for (let i = 0; i < nSets; i++) (sets[i] as Set<() => void>).clear()
        times.push(performance.now() - t0)
      }
      return (median(times) * 1e6) / TOTAL
    }

    /** Solid-shape: swap-remove from an observers ARRAY by stored index. */
    const armArraySwapRemove = (size: number): number => {
      const nArrs = TOTAL / size
      const times: number[] = []
      for (let r = 0; r < REPS; r++) {
        const arrs: (() => void)[][] = []
        const slots: number[][] = []
        for (let i = 0; i < nArrs; i++) {
          arrs.push(mkFns(size))
          slots.push(Array.from({ length: size }, (_, k) => k))
        }
        const t0 = performance.now()
        for (let i = 0; i < nArrs; i++) {
          const a = arrs[i] as (() => void)[]
          const sl = slots[i] as number[]
          for (let j = size - 1; j >= 0; j--) {
            const idx = sl[j] as number
            const last = a.pop() as () => void
            if (idx < a.length) a[idx] = last
          }
        }
        times.push(performance.now() - t0)
      }
      return (median(times) * 1e6) / TOTAL
    }

    // Warm every arm before measuring.
    for (let w = 0; w < 3; w++) {
      armDrainSets(2)
      armDeleteFromLarge(1000, 1)
      armClearSets(2)
      armArraySwapRemove(2)
    }

    return {
      drain1: armDrainSets(1),
      drain2: armDrainSets(2),
      drain4: armDrainSets(4),
      drain10: armDrainSets(10),
      large1000_full: armDeleteFromLarge(1000, 1),
      large1000_10pct: armDeleteFromLarge(1000, 0.1),
      clear1: armClearSets(1),
      clear2: armClearSets(2),
      arraySwap2: armArraySwapRemove(2),
      arraySwap1: armArraySwapRemove(1),
    }
  })

  console.log('\n=== V8 Set.delete(closure) mechanism probe — ns per removal ===')
  console.log('(1000 removals per arm, median of 200 reps)\n')
  const row = (k: string, label: string) =>
    console.log(`${(out as Record<string, number>)[k]!.toFixed(1).padStart(8)} ns   ${label}`)
  row('drain1', 'DRAIN size-1 sets  (1000 sets x 1 delete)   ← 1 subscriber')
  row('drain2', 'DRAIN size-2 sets  (500 sets x 2 deletes)   ← the benched shape')
  row('drain4', 'DRAIN size-4 sets  (250 sets x 4 deletes)')
  row('drain10', 'DRAIN size-10 sets (100 sets x 10 deletes)')
  row('large1000_full', 'DRAIN one size-1000 set (1000 deletes)')
  row('large1000_10pct', 'delete 10% of size-1000 sets (no drain)')
  row('clear1', 'clear() size-1 sets  (1000 clears)')
  row('clear2', 'clear() size-2 sets  (500 clears, 1000 keys)')
  row('arraySwap1', 'ARRAY swap-remove, size-1  ← Solid storage')
  row('arraySwap2', 'ARRAY swap-remove, size-2  ← Solid storage')
} finally {
  await browser.close()
  preview.kill()
}
