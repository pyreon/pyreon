/**
 * Vue 3 benchmark — reactive refs + template rendering via h().
 * No JSX transform needed — uses Vue's h() directly.
 */
import { createApp, defineComponent, h, ref } from 'vue'
import type { BenchSuite, Row } from '../runner'
import { bench, buildRows, tick } from '../runner'

export async function runVue(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'Vue 3', container, results: [] }

  const rows = ref<Row[]>([])
  const selectedId = ref<number | null>(null)

  const App = defineComponent({
    setup() {
      return () =>
        h('table', null, [
          h(
            'tbody',
            null,
            rows.value.map((row) =>
              h(
                'tr',
                {
                  key: row.id,
                  class: { selected: row.id === selectedId.value },
                },
                [h('td', null, String(row.id)), h('td', null, row.label)],
              ),
            ),
          ),
        ])
    },
  })

  const app = createApp(App)
  app.mount(container)
  await tick()

  let currentRows: Row[] = []

  await bench('create 1,000 rows', suite, async () => {
    rows.value = currentRows = buildRows(1_000)
    await tick()
  })

  await bench('replace all rows', suite, async () => {
    rows.value = currentRows = buildRows(1_000)
    await tick()
  })

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
      await tick()
    },
    // Reset labels before each run
    async () => {
      currentRows = currentRows.map((row, i) => {
        const orig = originalLabels[i]
        return orig !== undefined ? { ...row, label: orig } : row
      })
      rows.value = currentRows
      await tick()
    },
  )

  // Re-create clean rows for remaining tests
  rows.value = currentRows = buildRows(1_000)
  originalLabels = currentRows.map((r) => r.label)
  await tick()

  await bench('select row', suite, async () => {
    selectedId.value = currentRows[Math.floor(currentRows.length / 2)]?.id ?? null
    await tick()
  })

  await bench('swap rows', suite, async () => {
    const updated = [...currentRows]
    if (updated.length >= 999) {
      const tmp = updated[1] as Row
      updated[1] = updated[998] as Row
      updated[998] = tmp
    }
    rows.value = currentRows = updated
    await tick()
  })

  await bench('clear rows', suite, async () => {
    rows.value = currentRows = []
    await tick()
  })

  rows.value = currentRows = buildRows(1_000)
  await tick()

  await bench('create 10,000 rows', suite, async () => {
    rows.value = currentRows = buildRows(10_000)
    await tick()
  })

  rows.value = []
  app.unmount()

  return suite
}
