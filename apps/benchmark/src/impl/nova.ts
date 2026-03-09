/**
 * Nova benchmark — signals + For component + createTemplate.
 *
 * createTemplate() clones a pre-parsed <template> node per row instead of
 * allocating VNodes and calling createElement 3x.
 *
 * Selection is handled by a single effect + DOM Map instead of 10k per-row
 * class effects — O(1) selection with zero per-row effect overhead for class.
 */
import { h, For } from "@pyreon/core"
import { signal, effect } from "@pyreon/reactivity"
import { mount, createTemplate } from "@pyreon/runtime-dom"
import type { BenchSuite } from "../runner"
import { bench, buildRowsWith, tick } from "../runner"

export async function runNova(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: "Nova", container, results: [] }

  type ReactiveRow = { id: number; label: ReturnType<typeof signal<string>> }
  const rows = signal<ReactiveRow[]>([])
  const selectedId = signal<number | null>(null)

  // DOM-level selection: 1 effect instead of 10k — O(1) class updates
  const rowEls = new Map<number, HTMLElement>()
  let prevSelectedEl: HTMLElement | null = null
  const selectionEffect = effect(() => {
    const id = selectedId()
    if (prevSelectedEl) {
      prevSelectedEl.className = ""
      prevSelectedEl = null
    }
    if (id !== null) {
      const el = rowEls.get(id)
      if (el) {
        el.className = "selected"
        prevSelectedEl = el
      }
    }
  })

  // Pre-parse the row HTML once; clone per item instead of 3x createElement.
  // td2 contains a pre-existing text node — cloneNode preserves it, so we skip
  // createTextNode + appendChild per row (saves 2 allocations/DOM ops per row).
  // Returns NativeItem directly — no VNode wrapper, saves 2 more allocations per row.
  // Only 1 subscribe per row (label) — class is handled by the single selectionEffect.
  const rowTemplate = createTemplate<ReactiveRow>(
    "<tr><td></td><td> </td></tr>",
    (el, row) => {
      const td1 = el.firstChild as HTMLElement
      const td2 = td1.nextSibling as HTMLElement
      // Static: id never changes
      td1.textContent = String(row.id)
      // Dynamic label — use pre-cloned text node; static subscribe avoids effect overhead.
      const labelText = td2.firstChild as Text
      labelText.data = row.label.peek()
      const unsub = row.label.subscribe(() => { labelText.data = row.label() })
      // Register with the selection map
      rowEls.set(row.id, el)
      return () => {
        rowEls.delete(row.id)
        if (prevSelectedEl === el) prevSelectedEl = null
        unsub()
      }
    },
  )

  const unmount = mount(
    h(
      "table",
      null,
      h(
        "tbody",
        null,
        For({
          each: rows,
          key: (row) => row.id,
          children: rowTemplate,
        }),
      ),
    ),
    container,
  )

  // buildRowsWith builds ReactiveRows directly — no intermediate Row[] allocation.
  const mkRows = (n: number) => buildRowsWith<ReactiveRow>(n, (id, label) => ({ id, label: signal(label) }))

  await bench("create 1,000 rows", suite, async () => {
    rows.set(mkRows(1_000))
    await tick()
  })

  await bench("replace all rows", suite, async () => {
    rows.set(mkRows(1_000))
    await tick()
  })

  await bench("partial update (every 10th)", suite, async () => {
    const current = rows()
    for (let i = 0; i < current.length; i += 10) {
      current[i]?.label.update((l) => `${l} !!!`)
    }
    await tick()
  })

  await bench("select row", suite, async () => {
    const r = rows()
    selectedId.set(r[Math.floor(r.length / 2)]?.id ?? null)
    await tick()
  })

  await bench("swap rows", suite, async () => {
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

  await bench("clear rows", suite, async () => {
    rows.set([])
    await tick()
  })

  rows.set(mkRows(1_000))
  await tick()

  await bench("create 10,000 rows", suite, async () => {
    rows.set(mkRows(10_000))
    await tick()
  })

  rows.set([])
  selectionEffect.dispose()
  unmount()

  return suite
}
