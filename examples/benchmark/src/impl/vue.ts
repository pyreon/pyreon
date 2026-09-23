/**
 * Vue 3 benchmark — reactive refs + a COMPILED template.
 *
 * The row table is `ROWS_VUE_TEMPLATE` (`vue-templates.ts`), compiled at build
 * time by the `vue-templates` plugin in vite.config.ts with the exact option
 * set `@vue/compiler-sfc` uses for a `<template>` block. That is what a Vue app
 * built with its own toolchain ships, and it matters for speed: the compiled
 * render carries `KEYED_FRAGMENT` on the `v-for`, `CLASS` on each `<tr>` and
 * `TEXT` on each `<td>`, plus block tracking — so a select / partial-update
 * re-render patches only the dynamic parts. The previous hand-written `h()`
 * arm had no patch flags and full-diffed every row's props on every update.
 */
import { createApp, defineComponent, nextTick, ref, shallowRef, triggerRef } from 'vue'
import { render as rowsRender } from 'virtual:rows-vue-render'
import type { BenchSuite, Row } from '../runner'
import { bench, buildRows, expectRows, expectRowsWithSelected, resetRng } from '../runner'

export async function runVue(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'Vue 3', container, results: [] }

  // shallowRef, not ref: Vue's own performance guide ("Reduce Reactivity
  // Overhead for Large Immutable Structures") prescribes it for a list that is
  // REPLACED rather than mutated field-by-field, which is exactly this workload
  // — no row object is ever mutated in place (partial-update rebuilds them).
  // Deep `ref` would allocate a Proxy per row on every build, a tax Pyreon and
  // Solid do not pay, inflating our published create-10k and append multipliers.
  const rows = shallowRef<Row[]>([])
  const selectedId = ref<number | null>(null)

  const App = defineComponent({
    // Compiled template — `{{ row.id }}` hands the raw number to Vue's own
    // `toDisplayString` (see runner.ts "Row-id rendering rule").
    render: rowsRender,
    setup() {
      return { rows, selectedId }
    },
  })

  const app = createApp(App)
  app.mount(container)
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
