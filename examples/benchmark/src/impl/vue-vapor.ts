/**
 * Vue 3.6 Vapor (release candidate) — the row board on Vue's new Vapor mode.
 *
 * Vapor drops the virtual DOM: a `<script setup vapor>` SFC compiles to cloned
 * templates plus per-binding effects, close in shape to Solid and Pyreon. This
 * arm runs the SAME ops, data model and markup as `vue.ts` (shallowRef rows,
 * one ref for the selected id, `{ selected: … }` class), so the stable and RC
 * arms differ only in the renderer.
 *
 * The component is a real SFC compiled at BUILD time by the RC's own
 * `compiler-sfc` (`vite.config.ts`, `virtual:rows-vue-vapor`) in production
 * inline-template mode — exactly what a Vapor app ships. Its refs live inside
 * `<script setup>` so the compiled template reads them with `.value` directly;
 * `onRowsVaporReady` hands the suite the same refs to drive. The runtime is
 * the RC's `vue.runtime-with-vapor` build, installed under the `vue-rc` alias
 * so the stable Vue 3 arm is untouched.
 */
import { createVaporApp, nextTick, triggerRef } from 'virtual:vue-vapor-runtime'
import RowsVapor, { onRowsVaporReady } from 'virtual:rows-vue-vapor'
import type { BenchSuite, Row } from '../runner'
import { bench, buildRows, expectRows, expectRowsWithSelected, resetRng } from '../runner'

export async function runVueVapor(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'Vue 3.6 Vapor (RC)', container, results: [] }

  const handles = new Promise<{ rows: { value: Row[] }; selectedId: { value: number | null } }>((r) =>
    onRowsVaporReady(r),
  )
  const app = createVaporApp(RowsVapor)
  app.mount(container)
  const { rows, selectedId } = await handles
  await nextTick()

  let currentRows: Row[] = []

  await bench(
    'create 1,000 rows',
    suite,
    async () => {
      rows.value = currentRows = buildRows(1_000)
      await nextTick()
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'replace all rows',
    suite,
    async () => {
      rows.value = currentRows = buildRows(1_000)
      await nextTick()
    },
    { verify: expectRows(1_000) },
  )

  let originalLabels: string[] = currentRows.map((r) => r.label)
  await bench(
    'partial update (every 10th)',
    suite,
    async () => {
      const updated = [...currentRows]
      for (let i = 0; i < updated.length; i += 10) {
        const row = updated[i]
        if (row) updated[i] = { ...row, label: `${row.label} !!!` }
      }
      rows.value = currentRows = updated
      await nextTick()
    },
    {
      // Reset labels before each run
      reset: async () => {
        currentRows = currentRows.map((row, i) => {
          const orig = originalLabels[i]
          return orig !== undefined ? { ...row, label: orig } : row
        })
        rows.value = currentRows
        await nextTick()
      },
      verify: expectRows(1_000),
    },
  )

  // Re-create clean rows for remaining tests
  rows.value = currentRows = buildRows(1_000)
  originalLabels = currentRows.map((r) => r.label)
  await nextTick()

  await bench(
    'select row',
    suite,
    async () => {
      selectedId.value = currentRows[Math.floor(currentRows.length / 2)]?.id ?? null
      await nextTick()
    },
    {
      // deselect (untimed) so each timed run does a REAL selection,
      // not a no-op re-select of the already-selected row
      reset: async () => {
        selectedId.value = null
        await nextTick()
      },
      verify: expectRowsWithSelected(1_000, 1),
    },
  )

  await bench(
    'swap rows',
    suite,
    async () => {
      const updated = [...currentRows]
      if (updated.length >= 999) {
        const tmp = updated[1] as Row
        updated[1] = updated[998] as Row
        updated[998] = tmp
      }
      rows.value = currentRows = updated
      await nextTick()
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'remove row',
    suite,
    async () => {
      // Targeted removal — splice the reactive array in place (Vue's
      // idiomatic single-row removal; keyed render patches one <tr>).
      // The instrumented splice forwards to the raw target array, so
      // `currentRows` stays in sync without reassignment.
      rows.value.splice(500, 1)
      triggerRef(rows) // shallowRef: in-place mutation needs an explicit trigger
      await nextTick()
    },
    {
      // restore a full 1,000-row table (untimed) so each timed run removes
      // from the same 1,000-row shape, not a shrinking list
      reset: async () => {
        rows.value = currentRows = buildRows(1_000)
        await nextTick()
      },
      verify: expectRows(999),
    },
  )

  await bench(
    'clear rows',
    suite,
    async () => {
      rows.value = currentRows = []
      await nextTick()
    },
    {
      // repopulate 1000 rows (untimed) so each timed run clears a FULL list,
      // not an already-empty one (median was 0µs without this)
      reset: async () => {
        rows.value = currentRows = buildRows(1_000)
        await nextTick()
      },
      verify: expectRows(0),
    },
  )

  rows.value = currentRows = buildRows(1_000)
  await nextTick()

  await bench(
    'create 10,000 rows',
    suite,
    async () => {
      rows.value = currentRows = buildRows(10_000)
      await nextTick()
    },
    { verify: expectRows(10_000) },
  )

  await bench(
    'append 1,000 to 10,000 rows',
    suite,
    async () => {
      // Idiomatic append — push the new rows into the reactive array;
      // keyed render appends 1,000 <tr> without touching the existing
      // 10,000. The instrumented push forwards to the raw target array,
      // so `currentRows` stays in sync without reassignment.
      rows.value.push(...buildRows(1_000))
      triggerRef(rows) // shallowRef: in-place mutation needs an explicit trigger
      await nextTick()
    },
    {
      // restore the table to exactly 10,000 rows (untimed) so each timed
      // run appends to the same 10,000-row shape
      reset: async () => {
        rows.value = currentRows = buildRows(10_000)
        await nextTick()
      },
      verify: expectRows(11_000),
    },
  )

  rows.value = []
  app.unmount()

  return suite
}
