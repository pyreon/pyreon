/**
 * Compiler benchmark — measures JSX transform throughput.
 *
 * Tests transformJSX() at varying input sizes and complexity levels,
 * compared to raw Babel JSX transform (automatic runtime).
 *
 * Usage: bun scripts/bench-compiler.ts
 */

import * as babel from "@babel/core"
import babelJsx from "@babel/plugin-transform-react-jsx"
import { transformJSX } from "../packages/compiler/src/index"

// ─── Benchmark harness ───────────────────────────────────────────────────────

interface BenchResult {
  label: string
  opsPerSec: number
  avgNs: number
}

function bench(label: string, fn: () => void, durationMs = 2000): BenchResult {
  for (let i = 0; i < 100; i++) fn()
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    fn()
    ops++
  }
  const elapsed = performance.now() - start
  return {
    label,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgNs: Math.round((elapsed / ops) * 1_000_000),
  }
}

function printSection(title: string, results: BenchResult[]) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 64 - title.length - 4))}`)
  console.log(`${"test".padEnd(36)}${"ops/sec".padStart(14)}${"avg ns/op".padStart(14)}`)
  console.log("-".repeat(64))
  for (const r of results) {
    console.log(
      `${r.label.padEnd(36)}${r.opsPerSec.toLocaleString().padStart(14)}${r.avgNs.toLocaleString().padStart(14)}`,
    )
  }
}

// ─── Test inputs ─────────────────────────────────────────────────────────────

/** Minimal component — single element with text */
const SMALL = `
import { signal } from "@pyreon/reactivity"

const count = signal(0)

function Counter() {
  return <div class="counter">{count()}</div>
}
`

/** Medium component — conditional rendering, event handlers, multiple elements */
const MEDIUM = `
import { signal } from "@pyreon/reactivity"

const items = signal([])
const filter = signal("all")

function TodoList() {
  return (
    <div class="todo-app">
      <header>
        <h1>Todos</h1>
        <input
          type="text"
          placeholder="What needs to be done?"
          onKeyDown={(e) => {
            if (e.key === "Enter") addTodo(e.target.value)
          }}
        />
      </header>
      <section class="main">
        <ul class="todo-list">
          {items().map((item) => (
            <li class={item.done ? "completed" : ""}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggleTodo(item.id)}
              />
              <span>{item.text}</span>
              <button onClick={() => removeTodo(item.id)}>x</button>
            </li>
          ))}
        </ul>
      </section>
      <footer>
        <span>{items().filter((i) => !i.done).length} items left</span>
        <div class="filters">
          <button onClick={() => filter.set("all")}>All</button>
          <button onClick={() => filter.set("active")}>Active</button>
          <button onClick={() => filter.set("done")}>Done</button>
        </div>
      </footer>
    </div>
  )
}
`

/** Large component — deeply nested, many elements and expressions */
function generateLarge(rows: number): string {
  const lines = [
    `import { signal } from "@pyreon/reactivity"`,
    `const data = signal([])`,
    `function DataGrid() {`,
    `  return (`,
    `    <div class="grid">`,
    `      <table>`,
    `        <thead><tr><th>ID</th><th>Name</th><th>Value</th><th>Actions</th></tr></thead>`,
    `        <tbody>`,
  ]
  for (let i = 0; i < rows; i++) {
    lines.push(`          <tr class={data()[${i}]?.selected ? "selected" : ""}>`)
    lines.push(`            <td>{data()[${i}]?.id}</td>`)
    lines.push(`            <td>{data()[${i}]?.name}</td>`)
    lines.push(`            <td>{data()[${i}]?.value.toFixed(2)}</td>`)
    lines.push(`            <td><button onClick={() => select(${i})}>Select</button></td>`)
    lines.push(`          </tr>`)
  }
  lines.push(`        </tbody>`)
  lines.push(`      </table>`)
  lines.push(`    </div>`)
  lines.push(`  )`)
  lines.push(`}`)
  return lines.join("\n")
}

const LARGE_10 = generateLarge(10)
const LARGE_50 = generateLarge(50)
const LARGE_100 = generateLarge(100)

// ─── Babel config ────────────────────────────────────────────────────────────

const BABEL_OPTS: babel.TransformOptions = {
  plugins: [[babelJsx, { runtime: "automatic", importSource: "@pyreon/core" }]],
  parserOpts: { plugins: ["jsx", "typescript"] },
  filename: "bench.tsx",
  configFile: false,
  babelrc: false,
}

function babelTransform(code: string): void {
  babel.transformSync(code, BABEL_OPTS)
}

function pyreonTransform(code: string): void {
  transformJSX(code, "bench.tsx")
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

function benchSmall(): BenchResult[] {
  return [
    bench("Pyreon small", () => pyreonTransform(SMALL)),
    bench("Babel small", () => babelTransform(SMALL)),
  ]
}

function benchMedium(): BenchResult[] {
  return [
    bench("Pyreon medium (todo app)", () => pyreonTransform(MEDIUM)),
    bench("Babel medium (todo app)", () => babelTransform(MEDIUM)),
  ]
}

function benchLarge10(): BenchResult[] {
  return [
    bench("Pyreon large (10 rows)", () => pyreonTransform(LARGE_10)),
    bench("Babel large (10 rows)", () => babelTransform(LARGE_10)),
  ]
}

function benchLarge50(): BenchResult[] {
  return [
    bench("Pyreon large (50 rows)", () => pyreonTransform(LARGE_50)),
    bench("Babel large (50 rows)", () => babelTransform(LARGE_50)),
  ]
}

function benchLarge100(): BenchResult[] {
  return [
    bench("Pyreon large (100 rows)", () => pyreonTransform(LARGE_100)),
    bench("Babel large (100 rows)", () => babelTransform(LARGE_100)),
  ]
}

// ─── Input stats ─────────────────────────────────────────────────────────────

function printStats() {
  console.log("\n── Input Sizes ────────────────────────────────────────────────────")
  const inputs = [
    ["small", SMALL],
    ["medium (todo)", MEDIUM],
    ["large (10 rows)", LARGE_10],
    ["large (50 rows)", LARGE_50],
    ["large (100 rows)", LARGE_100],
  ] as const
  console.log(`${"input".padEnd(24)}${"lines".padStart(8)}${"bytes".padStart(10)}`)
  console.log("-".repeat(42))
  for (const [name, code] of inputs) {
    const lines = code.split("\n").length
    const bytes = new TextEncoder().encode(code).length
    console.log(
      `${name.padEnd(24)}${lines.toString().padStart(8)}${bytes.toLocaleString().padStart(10)}`,
    )
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log("Compiler Benchmark (Bun)")
console.log("Pyreon JSX Transform vs Babel JSX Transform")
console.log(`${"=".repeat(70)}`)

printStats()
printSection("Small Component (1 element)", benchSmall())
printSection("Medium Component (todo app)", benchMedium())
printSection("Large Component (10 rows)", benchLarge10())
printSection("Large Component (50 rows)", benchLarge50())
printSection("Large Component (100 rows)", benchLarge100())

console.log()
