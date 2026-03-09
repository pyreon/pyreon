/**
 * SolidJS benchmark — fine-grained reactivity + keyed list diffing.
 *
 * Uses solid-js without JSX: createComponent() mirrors what the Solid
 * compiler emits for <For>. Each row gets a createSignal for its label
 * so partial updates only touch the changed text nodes — same model as
 * Nova's per-row signal.
 *
 * Solid renders synchronously, so await tick() is just a layout flush.
 */
import { createSignal, createEffect, createComponent } from "solid-js"
import { For } from "solid-js"
import { render, insert } from "solid-js/web"
import type { BenchSuite } from "../runner"
import { bench, buildRowsWith, tick } from "../runner"

type SolidRow = { id: number; label: () => string; setLabel: (s: string) => void }

function mkRows(n: number): SolidRow[] {
  return buildRowsWith<SolidRow>(n, (id, label) => {
    const [get, set] = createSignal(label)
    return { id, label: get, setLabel: set }
  })
}

export async function runSolid(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: "SolidJS", container, results: [] }

  const [rows, setRows] = createSignal<SolidRow[]>([])
  const [selectedId, setSelected] = createSignal<number | null>(null)

  const dispose = render(() => {
    const table = document.createElement("table")
    const tbody = document.createElement("tbody")
    table.appendChild(tbody)

    insert(
      tbody,
      createComponent(For as unknown as (props: {
        each: SolidRow[]
        children: (row: SolidRow) => HTMLElement
      }) => HTMLElement[], {
        get each() { return rows() },
        children(row: SolidRow) {
          const tr = document.createElement("tr")
          const td1 = document.createElement("td")
          const td2 = document.createElement("td")
          td1.textContent = String(row.id)
          tr.appendChild(td1)
          tr.appendChild(td2)
          // Reactive label — only this row's td2 updates when label changes
          createEffect(() => { td2.textContent = row.label() })
          // Reactive selection — all rows subscribe to selectedId (idiomatic Solid)
          createEffect(() => {
            tr.className = row.id === selectedId() ? "selected" : ""
          })
          return tr
        },
      }),
    )

    return table
  }, container)

  await bench("create 1,000 rows", suite, async () => {
    setRows(mkRows(1_000))
    await tick()
  })

  await bench("replace all rows", suite, async () => {
    setRows(mkRows(1_000))
    await tick()
  })

  await bench("partial update (every 10th)", suite, async () => {
    const cur = rows()
    for (let i = 0; i < cur.length; i += 10) {
      cur[i]?.setLabel(`${cur[i]?.label() ?? ""} !!!`)
    }
    await tick()
  })

  await bench("select row", suite, async () => {
    const r = rows()
    setSelected(r[Math.floor(r.length / 2)]?.id ?? null)
    await tick()
  })

  await bench("swap rows", suite, async () => {
    const updated = [...rows()]
    if (updated.length >= 999) {
      const tmp = updated[1]
      const b = updated[998]
      if (tmp && b) { updated[1] = b; updated[998] = tmp }
    }
    setRows(updated)
    await tick()
  })

  await bench("clear rows", suite, async () => {
    setRows([])
    await tick()
  })

  setRows(mkRows(1_000))
  await tick()

  await bench("create 10,000 rows", suite, async () => {
    setRows(mkRows(10_000))
    await tick()
  })

  setRows([])
  dispose()

  return suite
}
