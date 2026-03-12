import { GlobalRegistrator } from "@happy-dom/global-registrator"
GlobalRegistrator.register()

const { h, For } = await import("@pyreon/core")
const { signal } = await import("@pyreon/reactivity")
const { mount } = await import("@pyreon/runtime-dom")

let _id = 1
const el = document.createElement("div")
document.body.appendChild(el)
const rowsSig = signal<{ id: number; label: ReturnType<typeof signal<string>> }[]>([])
const selId = signal<number | null>(null)
const toR = (row: { id: number; label: string }) => ({ id: row.id, label: signal(row.label) })
const makeRows = (n: number) => Array.from({ length: n }, () => ({ id: _id++, label: "row" + _id }))

console.log("Mounting...")
mount(
  h(
    "table",
    null,
    h(
      "tbody",
      null,
      For({
        each: rowsSig,
        by: (r) => r.id,
        children: (row) =>
          h(
            "tr",
            { class: () => (selId() === row.id ? "selected" : "") },
            h("td", null, String(row.id)),
            h("td", null, () => row.label()),
          ),
      }),
    ),
  ),
  el,
)
console.log("Mounted OK")

console.log("create1k...")
const t0 = performance.now()
rowsSig.set(makeRows(1000).map(toR))
console.log(
  `create1k: ${(performance.now() - t0).toFixed(1)}ms, rows=${el.querySelectorAll("tr").length}`,
)

console.log("replaceAll...")
const t1 = performance.now()
rowsSig.set(makeRows(1000).map(toR))
console.log(`replaceAll: ${(performance.now() - t1).toFixed(1)}ms`)

console.log("partialUpd...")
const t2 = performance.now()
rowsSig().forEach((row, i) => {
  if (i % 10 === 0) row.label.update((l) => l + " !!!")
})
console.log(`partialUpd: ${(performance.now() - t2).toFixed(1)}ms`)

console.log("selectRow...")
const t3 = performance.now()
selId.set(rowsSig()[500]?.id ?? null)
console.log(`selectRow: ${(performance.now() - t3).toFixed(1)}ms`)

console.log("swapRows...")
const t4 = performance.now()
const c = [...rowsSig()]
const tmp = c[1]!
c[1] = c[998]!
c[998] = tmp
rowsSig.set(c)
console.log(`swapRows: ${(performance.now() - t4).toFixed(1)}ms`)

console.log("clear...")
const t5 = performance.now()
rowsSig.set([])
console.log(`clear: ${(performance.now() - t5).toFixed(1)}ms`)

console.log("create10k...")
rowsSig.set(makeRows(1000).map(toR))
const t6 = performance.now()
rowsSig.set(makeRows(10000).map(toR))
console.log(
  `create10k: ${(performance.now() - t6).toFixed(1)}ms, rows=${el.querySelectorAll("tr").length}`,
)

console.log("ALL DONE")
