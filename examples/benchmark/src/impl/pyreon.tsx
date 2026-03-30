/**
 * Pyreon benchmark — idiomatic signals + For + createSelector.
 *
 * Uses the same patterns a typical Pyreon developer would write:
 * - JSX for VNode creation (compiled to h() calls)
 * - For with keyed children for efficient list diffing
 * - createSelector for O(1) selection (only 2 effects fire per selection change)
 * - Per-row signal for fine-grained label updates
 */
import { For } from '@pyreon/core'
import { createSelector, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { BenchSuite } from '../runner'
import { bench, buildRowsWith, tick } from '../runner'

export async function runPyreon(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'Pyreon', container, results: [] }

  type ReactiveRow = { id: number; label: ReturnType<typeof signal<string>> }
  const rows = signal<ReactiveRow[]>([])
  const selectedId = signal<number | null>(null)

  // O(1) selection — only the deselected and newly selected rows re-run
  const isSelected = createSelector(selectedId)

  const unmount = mount(
    <table>
      <tbody>
        <For each={rows} by={(row: ReactiveRow) => row.id}>
          {(row: ReactiveRow) => (
            <tr class={() => (isSelected(row.id) ? 'selected' : '')}>
              <td>{String(row.id)}</td>
              <td>{() => row.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>,
    container,
  )

  const mkRows = (n: number) =>
    buildRowsWith<ReactiveRow>(n, (id, label) => ({ id, label: signal(label) }))

  await bench('create 1,000 rows', suite, async () => {
    rows.set(mkRows(1_000))
    await tick()
  })

  await bench('replace all rows', suite, async () => {
    rows.set(mkRows(1_000))
    await tick()
  })

  // Capture original labels for reset between partial update runs
  let originalLabels: string[] = rows().map((r) => r.label())
  await bench(
    'partial update (every 10th)',
    suite,
    async () => {
      const current = rows()
      for (let i = 0; i < current.length; i += 10) {
        current[i]?.label.update((l) => `${l} !!!`)
      }
      await tick()
    },
    // Reset labels before each run to avoid accumulation
    () => {
      const current = rows()
      for (let i = 0; i < current.length; i += 10) {
        const orig = originalLabels[i]
        if (orig !== undefined) {
          current[i]?.label.set(orig)
        }
      }
    },
  )

  // Capture original labels for reset (after the partial update bench, rows are dirty)
  // Re-create clean rows for remaining tests
  rows.set(mkRows(1_000))
  originalLabels = rows().map((r) => r.label())
  await tick()

  await bench('select row', suite, async () => {
    const r = rows()
    selectedId.set(r[Math.floor(r.length / 2)]?.id ?? null)
    await tick()
  })

  await bench('swap rows', suite, async () => {
    const current = [...rows()]
    if (current.length >= 999) {
      const a = current[1]
      const b = current[998]
      if (a && b) {
        current[1] = b
        current[998] = a
        rows.set(current)
      }
    }
    await tick()
  })

  await bench('clear rows', suite, async () => {
    rows.set([])
    await tick()
  })

  rows.set(mkRows(1_000))
  await tick()

  await bench('create 10,000 rows', suite, async () => {
    rows.set(mkRows(10_000))
    await tick()
  })

  rows.set([])
  unmount()

  return suite
}
