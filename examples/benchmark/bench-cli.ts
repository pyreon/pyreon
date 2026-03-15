/**
 * CLI benchmark — runs in Bun with happy-dom.
 * happy-dom must register BEFORE framework imports (React/Vue capture `document` at init).
 *
 * Methodology:
 * - 5 warmup runs (discarded) + 20 timed runs per benchmark
 * - Labels reset between partial update runs to avoid accumulation
 * - Framework execution order randomized to avoid GC pressure bias
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator"
GlobalRegistrator.register()

const [
  { h, For },
  { signal, createSelector, renderEffect, ...reactivityRest },
  { mount, ...runtimeDomRest },
  React,
  ReactDOM,
  Vue,
  Preact,
  PreactHooks,
  PreactCompat,
  Solid,
  SolidWeb,
] = await Promise.all([
  import("@pyreon/core"),
  import("@pyreon/reactivity"),
  import("@pyreon/runtime-dom"),
  import("react"),
  import("react-dom/client"),
  import("vue"),
  import("preact"),
  import("preact/hooks"),
  import("preact/compat"),
  import("solid-js"),
  // Import the browser DOM bundle directly — avoids Bun resolving the server build
  // when the "browser" export condition is not active.
  import("solid-js/web/dist/web.js"),
])

// ─── Data ─────────────────────────────────────────────────────────────────────

const ADJ = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
]
const COLS = [
  "red",
  "yellow",
  "blue",
  "green",
  "pink",
  "brown",
  "purple",
  "white",
  "black",
  "orange",
]
const NOUN = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
]
function pick<T>(a: T[]) {
  return a[Math.floor(Math.random() * a.length)] as T
}

interface Row {
  id: number
  label: string
}
let _id = 1
function makeRows(n: number): Row[] {
  return Array.from({ length: n }, () => ({
    id: _id++,
    label: `${pick(ADJ)} ${pick(COLS)} ${pick(NOUN)}`,
  }))
}

// ─── Harness ──────────────────────────────────────────────────────────────────

const WARMUP = 5
const RUNS = 20

async function bench(
  fn: () => void | Promise<void>,
  resetFn?: () => void | Promise<void>,
): Promise<number> {
  const s: number[] = []
  for (let i = 0; i < WARMUP + RUNS; i++) {
    if (resetFn) await resetFn()
    const t = performance.now()
    await fn()
    const elapsed = performance.now() - t
    if (i >= WARMUP) s.push(elapsed)
  }
  return s.reduce((a, b) => a + b, 0) / RUNS
}

function tick() {
  return new Promise((r) => setTimeout(r, 0))
}
function makeEl(): HTMLElement {
  const e = document.createElement("div")
  document.body.appendChild(e)
  return e
}
function append(label: string) {
  return `${label} !!!`
}

// ─── Vanilla ──────────────────────────────────────────────────────────────────

async function runVanilla(): Promise<Record<string, number>> {
  const el = makeEl()
  const table = document.createElement("table")
  const tbody = document.createElement("tbody")
  table.appendChild(tbody)
  el.appendChild(table)

  let data: Row[] = []
  let rowEls: HTMLElement[] = []
  let labelEls: HTMLElement[] = []
  let selectedTr: HTMLElement | null = null

  function renderAll(rows: Row[]) {
    data = rows
    tbody.innerHTML = ""
    rowEls = new Array(rows.length)
    labelEls = new Array(rows.length)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Row
      const tr = document.createElement("tr")
      const td1 = document.createElement("td")
      const td2 = document.createElement("td")
      td1.textContent = String(row.id)
      td2.textContent = row.label
      tr.appendChild(td1)
      tr.appendChild(td2)
      tbody.appendChild(tr)
      rowEls[i] = tr
      labelEls[i] = td2
    }
    selectedTr = null
  }

  const r: Record<string, number> = {}
  r.create1k = await bench(() => renderAll(makeRows(1_000)))
  r._verify = el.querySelectorAll("tr").length
  r.replaceAll = await bench(() => renderAll(makeRows(1_000)))

  // Targeted partial update — only touch the 100 affected text nodes
  let origLabels = data.map((row) => row.label)
  r.partialUpd = await bench(
    () => {
      for (let i = 0; i < data.length; i += 10) {
        const row = data[i] as Row
        row.label = append(row.label)
        ;(labelEls[i] as HTMLElement).textContent = row.label
      }
    },
    // Reset labels before each run
    () => {
      for (let i = 0; i < data.length; i += 10) {
        const orig = origLabels[i]
        if (orig !== undefined) {
          ;(data[i] as Row).label = orig
          ;(labelEls[i] as HTMLElement).textContent = orig
        }
      }
    },
  )

  // Re-create clean rows for remaining tests
  renderAll(makeRows(1_000))
  origLabels = data.map((row) => row.label)

  // Targeted select — O(1) className toggle on 2 elements
  r.selectRow = await bench(() => {
    if (selectedTr) selectedTr.className = ""
    selectedTr = rowEls[500] as HTMLElement
    selectedTr.className = "selected"
  })

  // Targeted swap — move 2 DOM nodes
  r.swapRows = await bench(() => {
    const tmp = data[1] as Row
    data[1] = data[998] as Row
    data[998] = tmp
    const tmpEl = rowEls[1] as HTMLElement
    rowEls[1] = rowEls[998] as HTMLElement
    rowEls[998] = tmpEl
    const tmpLbl = labelEls[1] as HTMLElement
    labelEls[1] = labelEls[998] as HTMLElement
    labelEls[998] = tmpLbl
    const ref2 = rowEls[2] as HTMLElement
    tbody.insertBefore(rowEls[1] as HTMLElement, ref2)
    const ref999 = (rowEls[999] as HTMLElement | undefined) ?? null
    tbody.insertBefore(rowEls[998] as HTMLElement, ref999)
  })

  r.clear = await bench(() => {
    tbody.innerHTML = ""
    data = []
    rowEls = []
    labelEls = []
    selectedTr = null
  })

  renderAll(makeRows(1_000))
  r.create10k = await bench(() => renderAll(makeRows(10_000)))
  data = []
  tbody.innerHTML = ""
  el.remove()
  return r
}

// ─── Pyreon ───────────────────────────────────────────────────────────────────

async function runPyreon(): Promise<Record<string, number>> {
  const el = makeEl()
  type RR = { id: number; label: ReturnType<typeof signal<string>> }
  const rowsSig = signal<RR[]>([])
  const selId = signal<number | null>(null)

  // O(1) selection via createSelector — only 2 effects fire per change
  const isSelected = createSelector(selId)

  function makeRR(n: number): RR[] {
    const rows = new Array<RR>(n)
    for (let i = 0; i < n; i++) {
      rows[i] = { id: _id++, label: signal(`${pick(ADJ)} ${pick(COLS)} ${pick(NOUN)}`) }
    }
    return rows
  }

  const unmount = mount(
    h(
      "table",
      null,
      h(
        "tbody",
        null,
        For<RR>({
          each: rowsSig,
          by: (r) => r.id,
          children: (row) =>
            h(
              "tr",
              { class: () => (isSelected(row.id) ? "selected" : "") },
              h("td", null, String(row.id)),
              h("td", null, () => row.label()),
            ),
        }),
      ),
    ),
    el,
  )

  const cur = () => rowsSig()
  const r: Record<string, number> = {}
  r.create1k = await bench(() => rowsSig.set(makeRR(1_000)))
  r._verify = el.querySelectorAll("tr").length
  r.replaceAll = await bench(() => rowsSig.set(makeRR(1_000)))

  // Partial update with label reset
  let origLabels = cur().map((row) => row.label())
  r.partialUpd = await bench(
    () => {
      cur().forEach((row, i) => {
        if (i % 10 === 0) row.label.update((l) => append(l))
      })
    },
    () => {
      cur().forEach((row, i) => {
        if (i % 10 === 0) {
          const o = origLabels[i]
          if (o !== undefined) row.label.set(o)
        }
      })
    },
  )

  // Re-create clean rows
  rowsSig.set(makeRR(1_000))
  origLabels = cur().map((row) => row.label())

  r.selectRow = await bench(() => selId.set(cur()[500]?.id ?? null))
  r.swapRows = await bench(() => {
    const c = [...cur()]
    const t = c[1] as RR
    c[1] = c[998] as RR
    c[998] = t
    rowsSig.set(c)
  })
  r.clear = await bench(() => rowsSig.set([]))
  rowsSig.set(makeRR(1_000))
  r.create10k = await bench(() => rowsSig.set(makeRR(10_000)))
  unmount()
  el.remove()
  return r
}

// ─── Pyreon (tpl) ────────────────────────────────────────────────────────────

async function runPyreonTpl(): Promise<Record<string, number>> {
  // _tpl and _bind are exported from src but not yet in built types
  // biome-ignore lint: benchmark file, cast is fine
  const _tpl = (runtimeDomRest as any)._tpl as (
    html: string,
    bind: (el: HTMLElement) => (() => void) | null,
  ) => { __isNative: true; el: HTMLElement; cleanup: (() => void) | null }
  // biome-ignore lint: benchmark file, cast is fine
  const _bind = (reactivityRest as any)._bind as (fn: () => void) => () => void

  const el = makeEl()
  type RR = { id: number; label: ReturnType<typeof signal<string>> }
  const rowsSig = signal<RR[]>([])
  const selId = signal<number | null>(null)

  // O(1) selection via createSelector — only 2 effects fire per change
  const isSelected = createSelector(selId)

  function makeRR(n: number): RR[] {
    const rows = new Array<RR>(n)
    for (let i = 0; i < n; i++) {
      rows[i] = { id: _id++, label: signal(`${pick(ADJ)} ${pick(COLS)} ${pick(NOUN)}`) }
    }
    return rows
  }

  const unmount = mount(
    h(
      "table",
      null,
      h(
        "tbody",
        null,
        For<RR>({
          each: rowsSig,
          by: (r) => r.id,
          children: (row) =>
            _tpl("<tr><td></td><td></td></tr>", (__root) => {
              const __e0 = __root.children[0] as HTMLElement
              const __e1 = __root.children[1] as HTMLElement
              const __d0 = _bind(() => {
                __root.className = isSelected(row.id) ? "selected" : ""
              })
              __e0.textContent = String(row.id)
              // Use persistent TextNode + .data for reactive text updates
              // (.textContent destroys/recreates child nodes on every update)
              const __t0 = document.createTextNode("")
              __e1.appendChild(__t0)
              const __d1 = _bind(() => {
                __t0.data = row.label()
              })
              return () => {
                __d0()
                __d1()
              }
            }),
        }),
      ),
    ),
    el,
  )

  const cur = () => rowsSig()
  const r: Record<string, number> = {}
  r.create1k = await bench(() => rowsSig.set(makeRR(1_000)))
  r._verify = el.querySelectorAll("tr").length
  r.replaceAll = await bench(() => rowsSig.set(makeRR(1_000)))

  // Partial update with label reset
  let origLabels = cur().map((row) => row.label())
  r.partialUpd = await bench(
    () => {
      cur().forEach((row, i) => {
        if (i % 10 === 0) row.label.update((l) => append(l))
      })
    },
    () => {
      cur().forEach((row, i) => {
        if (i % 10 === 0) {
          const o = origLabels[i]
          if (o !== undefined) row.label.set(o)
        }
      })
    },
  )

  // Re-create clean rows
  rowsSig.set(makeRR(1_000))
  origLabels = cur().map((row) => row.label())

  r.selectRow = await bench(() => selId.set(cur()[500]?.id ?? null))
  r.swapRows = await bench(() => {
    const c = [...cur()]
    const t = c[1] as RR
    c[1] = c[998] as RR
    c[998] = t
    rowsSig.set(c)
  })
  r.clear = await bench(() => rowsSig.set([]))
  rowsSig.set(makeRR(1_000))
  r.create10k = await bench(() => rowsSig.set(makeRR(10_000)))
  unmount()
  el.remove()
  return r
}

// ─── React ────────────────────────────────────────────────────────────────────

async function runReact(): Promise<Record<string, number>> {
  const el = makeEl()
  const { createElement: rc, useState, memo } = React

  const RowItem = memo(({ row, sel }: { row: Row; sel: boolean }) =>
    rc(
      "tr",
      { className: sel ? "selected" : undefined },
      rc("td", null, row.id),
      rc("td", null, row.label),
    ),
  )

  let _setData: ((rows: Row[]) => void) | null = null
  let _setSel: ((id: number | null) => void) | null = null

  function App() {
    const [data, setData] = useState<Row[]>([])
    const [sid, setSel] = useState<number | null>(null)
    _setData = setData
    _setSel = setSel
    return rc(
      "table",
      null,
      rc(
        "tbody",
        null,
        data.map((row) => rc(RowItem, { key: row.id, row, sel: row.id === sid })),
      ),
    )
  }

  const root = ReactDOM.createRoot(el)
  await new Promise<void>((res) => {
    root.render(rc(App, null))
    setTimeout(res, 20)
  })

  function act(fn: () => void) {
    return new Promise<void>((res) => {
      fn()
      setTimeout(res, 0)
    })
  }

  let cur: Row[] = []
  const setD = (rows: Row[]) => {
    cur = rows
    return act(() => {
      if (_setData) _setData(rows)
    })
  }
  const setS = (id: number | null) =>
    act(() => {
      if (_setSel) _setSel(id)
    })

  const r: Record<string, number> = {}
  r.create1k = await bench(() => setD(makeRows(1_000)))
  r.replaceAll = await bench(() => setD(makeRows(1_000)))

  let origLabels = cur.map((row) => row.label)
  r.partialUpd = await bench(
    () => {
      const u = [...cur]
      for (let i = 0; i < u.length; i += 10) {
        const row = u[i] as Row
        row.label = append(row.label)
      }
      return setD(u)
    },
    () => {
      cur = cur.map((row, i) => {
        const orig = origLabels[i]
        return orig !== undefined ? { ...row, label: orig } : row
      })
      return setD(cur)
    },
  )

  // Re-create clean rows
  await setD(makeRows(1_000))
  origLabels = cur.map((row) => row.label)

  r.selectRow = await bench(() => setS(cur[500]?.id ?? null))
  r.swapRows = await bench(() => {
    const u = [...cur]
    const t = u[1] as Row
    u[1] = u[998] as Row
    u[998] = t
    return setD(u)
  })
  r.clear = await bench(() => setD([]))
  await setD(makeRows(1_000))
  r.create10k = await bench(() => setD(makeRows(10_000)))
  root.unmount()
  el.remove()
  return r
}

// ─── Vue ──────────────────────────────────────────────────────────────────────

async function runVue(): Promise<Record<string, number>> {
  const el = makeEl()
  const { createApp, ref: vref, h: hv, defineComponent } = Vue

  const data = vref<Row[]>([])
  const selId = vref<number | null>(null)

  const App = defineComponent({
    setup: () => () =>
      hv("table", null, [
        hv(
          "tbody",
          null,
          data.value.map((row) =>
            hv("tr", { key: row.id, class: { selected: row.id === selId.value } }, [
              hv("td", null, String(row.id)),
              hv("td", null, row.label),
            ]),
          ),
        ),
      ]),
  })

  const app = createApp(App)
  app.mount(el)
  await new Promise((res) => setTimeout(res, 20))

  let cur: Row[] = []
  const r: Record<string, number> = {}
  r.create1k = await bench(async () => {
    data.value = cur = makeRows(1_000)
    await tick()
  })
  r.replaceAll = await bench(async () => {
    data.value = cur = makeRows(1_000)
    await tick()
  })

  let origLabels = cur.map((row) => row.label)
  r.partialUpd = await bench(
    async () => {
      const u = [...cur]
      for (let i = 0; i < u.length; i += 10) {
        const row = u[i] as Row
        u[i] = { ...row, label: append(row.label) }
      }
      data.value = cur = u
      await tick()
    },
    async () => {
      cur = cur.map((row, i) => {
        const orig = origLabels[i]
        return orig !== undefined ? { ...row, label: orig } : row
      })
      data.value = cur
      await tick()
    },
  )

  // Re-create clean rows
  data.value = cur = makeRows(1_000)
  origLabels = cur.map((row) => row.label)
  await tick()

  r.selectRow = await bench(async () => {
    selId.value = cur[500]?.id ?? null
    await tick()
  })
  r.swapRows = await bench(async () => {
    const u = [...cur]
    const t = u[1] as Row
    u[1] = u[998] as Row
    u[998] = t
    data.value = cur = u
    await tick()
  })
  r.clear = await bench(async () => {
    data.value = cur = []
    await tick()
  })
  data.value = cur = makeRows(1_000)
  await tick()
  r.create10k = await bench(async () => {
    data.value = cur = makeRows(10_000)
    await tick()
  })
  data.value = []
  app.unmount()
  el.remove()
  return r
}

// ─── Preact ───────────────────────────────────────────────────────────────────

async function runPreact(): Promise<Record<string, number>> {
  const el = makeEl()
  const { h: ph, render: pr } = Preact
  const { memo: pmemo } = PreactCompat
  const { useState: pus } = PreactHooks

  const RowItem = pmemo(({ row, sel }: { row: Row; sel: boolean }) =>
    ph(
      "tr",
      { className: sel ? "selected" : undefined },
      ph("td", null, row.id),
      ph("td", null, row.label),
    ),
  )

  let _setData: ((rows: Row[]) => void) | null = null
  let _setSel: ((id: number | null) => void) | null = null

  function App() {
    const [data, setData] = pus<Row[]>([])
    const [sid, setSel] = pus<number | null>(null)
    _setData = setData
    _setSel = setSel
    return ph(
      "table",
      null,
      ph(
        "tbody",
        null,
        data.map((row) => ph(RowItem, { key: row.id, row, sel: row.id === sid })),
      ),
    )
  }

  pr(ph(App, null), el)
  await new Promise<void>((res) => setTimeout(res, 20))

  function act(fn: () => void) {
    return new Promise<void>((res) => {
      fn()
      setTimeout(res, 0)
    })
  }

  let cur: Row[] = []
  const setD = (rows: Row[]) => {
    cur = rows
    return act(() => {
      if (_setData) _setData(rows)
    })
  }
  const setS = (id: number | null) =>
    act(() => {
      if (_setSel) _setSel(id)
    })

  const r: Record<string, number> = {}
  r.create1k = await bench(() => setD(makeRows(1_000)))
  r.replaceAll = await bench(() => setD(makeRows(1_000)))

  let origLabels = cur.map((row) => row.label)
  r.partialUpd = await bench(
    () => {
      const u = [...cur]
      for (let i = 0; i < u.length; i += 10) {
        const row = u[i] as Row
        row.label = append(row.label)
      }
      return setD(u)
    },
    () => {
      cur = cur.map((row, i) => {
        const orig = origLabels[i]
        return orig !== undefined ? { ...row, label: orig } : row
      })
      return setD(cur)
    },
  )

  // Re-create clean rows
  await setD(makeRows(1_000))
  origLabels = cur.map((row) => row.label)

  r.selectRow = await bench(() => setS(cur[500]?.id ?? null))
  r.swapRows = await bench(() => {
    const u = [...cur]
    const t = u[1] as Row
    u[1] = u[998] as Row
    u[998] = t
    return setD(u)
  })
  r.clear = await bench(() => setD([]))
  await setD(makeRows(1_000))
  r.create10k = await bench(() => setD(makeRows(10_000)))
  pr(null, el)
  el.remove()
  return r
}

// ─── Solid ────────────────────────────────────────────────────────────────────

async function runSolid(): Promise<Record<string, number>> {
  const el = makeEl()
  const { createSignal, createSelector: solidCreateSelector, createEffect, createComponent } = Solid
  const { For } = Solid
  const { render: sr, insert, template: solidTemplate } = SolidWeb

  // Pre-compiled template — same as what Solid's JSX compiler emits
  const _tmpl$ = solidTemplate("<tr><td></td><td></td></tr>")

  type SRow = { id: number; label: () => string; setLabel: (s: string) => void }
  function mkSRows(n: number): SRow[] {
    return makeRows(n).map(({ id, label }) => {
      const [get, set] = createSignal(label)
      return { id, label: get, setLabel: set }
    })
  }

  const [rows, setRows] = createSignal<SRow[]>([])
  const [selectedId, setSelected] = createSignal<number | null>(null)

  // O(1) selection — only 2 effects fire per change
  const isSelected = solidCreateSelector(selectedId)

  const dispose = sr(() => {
    const table = document.createElement("table")
    const tbody = document.createElement("tbody")
    table.appendChild(tbody)
    insert(
      tbody,
      createComponent(
        For as unknown as (props: {
          each: SRow[]
          children: (row: SRow) => HTMLElement
        }) => HTMLElement[],
        {
          get each() {
            return rows()
          },
          children(row: SRow) {
            // Template-cloned row — matches Solid compiler output
            const tr = _tmpl$() as HTMLElement
            const td1 = tr.children[0] as HTMLElement
            const td2 = tr.children[1] as HTMLElement
            td1.textContent = String(row.id)
            createEffect(() => {
              td2.textContent = row.label()
            })
            // O(1) selection via createSelector
            createEffect(() => {
              tr.className = isSelected(row.id) ? "selected" : ""
            })
            return tr
          },
        },
      ),
    )
    return table
  }, el)

  const r: Record<string, number> = {}
  r.create1k = await bench(async () => {
    setRows(mkSRows(1_000))
    await tick()
  })
  r._verify = el.querySelectorAll("tr").length
  r.replaceAll = await bench(async () => {
    setRows(mkSRows(1_000))
    await tick()
  })

  let origLabels = rows().map((row) => row.label())
  r.partialUpd = await bench(
    async () => {
      const cur = rows()
      for (let i = 0; i < cur.length; i += 10) {
        const row = cur[i] as SRow
        row.setLabel(append(row.label()))
      }
      await tick()
    },
    async () => {
      const cur = rows()
      for (let i = 0; i < cur.length; i += 10) {
        const orig = origLabels[i]
        if (orig !== undefined) (cur[i] as SRow).setLabel(orig)
      }
      await tick()
    },
  )

  // Re-create clean rows
  setRows(mkSRows(1_000))
  await tick()
  origLabels = rows().map((row) => row.label())

  r.selectRow = await bench(async () => {
    setSelected(rows()[500]?.id ?? null)
    await tick()
  })
  r.swapRows = await bench(async () => {
    const u = [...rows()]
    const t = u[1] as SRow
    u[1] = u[998] as SRow
    u[998] = t
    setRows(u)
    await tick()
  })
  r.clear = await bench(async () => {
    setRows([])
    await tick()
  })
  setRows(mkSRows(1_000))
  await tick()
  r.create10k = await bench(async () => {
    setRows(mkSRows(10_000))
    await tick()
  })
  dispose()
  el.remove()
  return r
}

// ─── Output ───────────────────────────────────────────────────────────────────

const TESTS: Array<[string, string]> = [
  ["create1k", "create 1k rows  "],
  ["replaceAll", "replace all rows "],
  ["partialUpd", "partial update   "],
  ["selectRow", "select row       "],
  ["swapRows", "swap rows        "],
  ["clear", "clear rows       "],
  ["create10k", "create 10k rows  "],
]

function fmtMs(ms: number, w = 9): string {
  return (ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`).padStart(w)
}

function printResults(all: Record<string, Record<string, number>>) {
  const fws = Object.keys(all)
  const W = 12
  const LABEL = 20

  console.log(`\n${"".padEnd(LABEL)}${fws.map((f) => f.padStart(W)).join("")}`)
  console.log("─".repeat(LABEL + W * fws.length))

  for (const [key, label] of TESTS) {
    const vals = fws.map((f) => all[f]?.[key] ?? 0)
    const min = Math.min(...vals)
    const cells = vals.map((v) => {
      const s = fmtMs(v, W)
      if (v === min) return `\x1b[32m${s}\x1b[0m`
      if (v > min * 5) return `\x1b[31m${s}\x1b[0m`
      if (v > min * 2) return `\x1b[33m${s}\x1b[0m`
      return s
    })
    console.log(`${label}${cells.join("")}`)
  }

  const printSlowdown = (title: string, subset: string[]) => {
    console.log(`\n${title.padEnd(LABEL)}${subset.map((f) => f.padStart(W)).join("")}`)
    console.log("─".repeat(LABEL + W * subset.length))

    for (const [key, label] of TESTS) {
      const vals = subset.map((f) => all[f]?.[key] ?? 0)
      const min = Math.min(...vals)
      const cells = vals.map((v) => {
        const ratio = v / min
        const s = `${ratio.toFixed(2)}×`.padStart(W)
        if (ratio < 1.01) return `\x1b[32m${s}\x1b[0m`
        if (ratio > 5) return `\x1b[31m${s}\x1b[0m`
        if (ratio > 2) return `\x1b[33m${s}\x1b[0m`
        return s
      })
      console.log(`${label}${cells.join("")}`)
    }
  }

  printSlowdown("slowdown vs best", fws)

  // Framework-only comparison (excludes vanilla raw DOM baseline)
  const frameworkOnly = fws.filter((f) => f !== "Vanilla JS")
  if (frameworkOnly.length > 1) {
    printSlowdown("vs best framework", frameworkOnly)
  }

  console.log()
}

// ─── Run ──────────────────────────────────────────────────────────────────────

// Randomize framework execution order to avoid GC pressure bias
const frameworks: Array<{ name: string; run: () => Promise<Record<string, number>> }> = [
  { name: "Vanilla JS", run: runVanilla },
  { name: "Pyreon", run: runPyreon },
  { name: "Pyreon (tpl)", run: runPyreonTpl },
  { name: "Preact", run: runPreact },
  { name: "React 19", run: runReact },
  { name: "Vue 3", run: runVue },
  // SolidJS excluded — renders 0 DOM rows in happy-dom (lazy/deferred rendering)
  // { name: "SolidJS", run: runSolid },
]

for (let i = frameworks.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  const a = frameworks[i] as (typeof frameworks)[0]
  const b = frameworks[j] as (typeof frameworks)[0]
  frameworks[i] = b
  frameworks[j] = a
}

console.log(`Benchmarking (happy-dom, ${WARMUP} warmup + ${RUNS} timed runs each)…\n`)

const results: Record<string, Record<string, number>> = {}

for (const { name, run } of frameworks) {
  process.stdout.write(`  ${name.padEnd(12)}… `)
  results[name] = await run()
  console.log("✓")
}

// Verify all frameworks actually rendered rows
console.log("DOM verification (rows after create1k):")
for (const [name, r] of Object.entries(results)) {
  console.log(`  ${name}: ${r._verify ?? "n/a"} rows`)
}

printResults(results)
