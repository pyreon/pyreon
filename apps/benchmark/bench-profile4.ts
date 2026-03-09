import { GlobalRegistrator } from "@happy-dom/global-registrator"
GlobalRegistrator.register()

const { h, For } = await import("@pyreon/core")
const { signal } = await import("@pyreon/reactivity")
const { mount } = await import("@pyreon/runtime-dom")

let _id = 1
const el = document.createElement("div"); document.body.appendChild(el)
const rowsSig = signal<{ id: number; label: ReturnType<typeof signal<string>> }[]>([])
const toR = (row: { id: number; label: string }) => ({ id: row.id, label: signal(row.label) })
const makeRows = (n: number) => Array.from({ length: n }, () => ({ id: _id++, label: "row"+_id }))

mount(
  h("table", null, h("tbody", null, For({
    each: rowsSig,
    key: (r) => r.id,
    children: (row) => h("tr", null, h("td", null, String(row.id)), h("td", null, () => row.label())),
  }))),
  el,
)

// Warm up
rowsSig.set(makeRows(100).map(toR))
rowsSig.set([])

// Test: create 1000 rows
const t0 = performance.now()
rowsSig.set(makeRows(1000).map(toR))
const t1 = performance.now()
console.log(`create 1k: ${(t1-t0).toFixed(1)}ms, rows=${el.querySelectorAll("tr").length}`)

// Test: replaceAll (new 1000 rows)
const rows1 = makeRows(1000).map(toR)
const t2 = performance.now()
rowsSig.set(rows1)
const t3 = performance.now()
console.log(`replaceAll: ${(t3-t2).toFixed(1)}ms, rows=${el.querySelectorAll("tr").length}`)

// Test: clear
const t4 = performance.now()
rowsSig.set([])
const t5 = performance.now()
console.log(`clear: ${(t5-t4).toFixed(1)}ms, rows=${el.querySelectorAll("tr").length}`)

// --- Isolate DOM ops ---
// Test: how expensive is querySelector("tr") on 1000-row table?
rowsSig.set(makeRows(1000).map(toR))
const t6 = performance.now()
const cnt = el.querySelectorAll("tr").length
const t7 = performance.now()
console.log(`querySelectorAll("tr") on 1k rows: ${(t7-t6).toFixed(1)}ms, count=${cnt}`)

// Test: how expensive is just range.deleteContents on 1k trs with 2 tds each?
const tbody = document.createElement("tbody")
document.body.appendChild(tbody)
const trs: HTMLElement[] = []
for (let i = 0; i < 1000; i++) {
  const tr = document.createElement("tr")
  tr.appendChild(document.createElement("td")).textContent = String(i)
  tr.appendChild(document.createElement("td")).textContent = "label"+i
  tbody.appendChild(tr)
  trs.push(tr)
}
const t8 = performance.now()
const range = document.createRange()
range.setStart(tbody, 0)
range.setEnd(tbody, tbody.childNodes.length)
range.deleteContents()
const t9 = performance.now()
console.log(`range.deleteContents() 1k tr>td+td: ${(t9-t8).toFixed(1)}ms`)
