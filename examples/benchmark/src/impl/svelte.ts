/**
 * Svelte 5 benchmark — compiled .svelte component using runes ($state).
 *
 * Svelte 5's `$state(...)` is a signals-based reactivity primitive
 * (push-based subscription graph) — directly comparable to Pyreon's
 * `signal()` and Solid's `createSignal()`. The compiler emits
 * direct DOM update code (template cloning, surgical text node
 * updates) — comparable to Solid's `template()` and Pyreon's
 * `_tpl` / `_bindText` compiled forms.
 *
 * The `.svelte` template is bundled via `@sveltejs/vite-plugin-svelte`
 * at build time, so the measured runtime cost matches what real
 * Svelte 5 users ship.
 */
import { mount, unmount, flushSync } from 'svelte'
import type { BenchSuite, Row } from '../runner'
import { bench, buildRows, expectRows, expectRowsWithSelected, resetRng, tick } from '../runner'
import Bench from './Bench.svelte'
import { state, type SvelteRow } from './bench-state.svelte'

// `flushSync()` forces Svelte's queued effects (DOM updates) to apply
// immediately. Svelte 5 batches updates by default — without flushSync,
// the DOM wouldn't reflect the mutation by the time we measure.
// `tick()` after is the layout flush (same as every other framework).
async function commit(): Promise<void> {
  flushSync()
  await tick()
}

export async function runSvelte(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'Svelte 5', container, results: [] }

  // Mount the compiled component. `mount()` is Svelte 5's idiomatic
  // entry point (replaces Svelte 4's `new Component({ target })`).
  const app = mount(Bench, { target: container })

  // Reset state in case the harness reused the module between runs.
  state.rows = []
  state.selectedId = null
  await commit()

  let currentRows: SvelteRow[] = []

  const setRows = async (rows: SvelteRow[]) => {
    state.rows = rows
    await commit()
  }

  const setSelected = async (id: number | null) => {
    state.selectedId = id
    await commit()
  }

  // Adapt the runner's Row type (id + label) to Svelte's. Identical
  // shape — just keeps the type system honest about the per-framework
  // type parameter.
  const toSvelteRows = (rows: Row[]): SvelteRow[] => rows.map((r) => ({ id: r.id, label: r.label }))

  await bench(
    'create 1,000 rows',
    suite,
    async () => {
      currentRows = toSvelteRows(buildRows(1_000))
      await setRows(currentRows)
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'replace all rows',
    suite,
    async () => {
      currentRows = toSvelteRows(buildRows(1_000))
      await setRows(currentRows)
    },
    { verify: expectRows(1_000) },
  )

  let originalLabels: string[] = currentRows.map((row) => row.label)
  await bench(
    'partial update (every 10th)',
    suite,
    async () => {
      const updated = [...currentRows]
      for (let i = 0; i < updated.length; i += 10) {
        const row = updated[i]
        if (row) updated[i] = { ...row, label: `${row.label} !!!` }
      }
      currentRows = updated
      await setRows(currentRows)
    },
    {
      // Reset labels before each run
      reset: async () => {
        currentRows = currentRows.map((row, i) => {
          const orig = originalLabels[i]
          return orig !== undefined ? { ...row, label: orig } : row
        })
        await setRows(currentRows)
      },
      verify: expectRows(1_000),
    },
  )

  // Re-create clean rows for remaining tests
  currentRows = toSvelteRows(buildRows(1_000))
  await setRows(currentRows)
  originalLabels = currentRows.map((row) => row.label)

  await bench(
    'select row',
    suite,
    async () => {
      await setSelected(currentRows[Math.floor(currentRows.length / 2)]?.id ?? null)
    },
    { verify: expectRowsWithSelected(1_000, 1) },
  )

  await bench(
    'swap rows',
    suite,
    async () => {
      const updated = [...currentRows]
      if (updated.length >= 999) {
        const tmp = updated[1]
        const b = updated[998]
        if (tmp && b) {
          updated[1] = b
          updated[998] = tmp
        }
      }
      currentRows = updated
      await setRows(currentRows)
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'clear rows',
    suite,
    async () => {
      currentRows = []
      await setRows([])
    },
    { verify: expectRows(0) },
  )

  currentRows = toSvelteRows(buildRows(1_000))
  await setRows(currentRows)

  await bench(
    'create 10,000 rows',
    suite,
    async () => {
      currentRows = toSvelteRows(buildRows(10_000))
      await setRows(currentRows)
    },
    { verify: expectRows(10_000) },
  )

  await setRows([])
  unmount(app)

  return suite
}
