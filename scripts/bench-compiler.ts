/**
 * Compiler benchmark — measures JSX transform throughput.
 *
 * Compares:
 *   - @pyreon/compiler  — Pyreon's reactive JSX transform (Babel-based + smart wrapping)
 *   - esbuild           — Go-based bundler/transformer (used by Vite 5, tsup)
 *   - @swc/core         — Rust-based transformer (used by Next.js, Turbopack)
 *   - oxc-transform     — Rust-based transformer (used by Vite 6+, Rolldown)
 *   - @babel/core       — JS-based transformer (legacy baseline)
 *
 * All configured with automatic JSX runtime targeting @pyreon/core.
 *
 * Usage: bun scripts/bench-compiler.ts
 */

import * as babel from "@babel/core"
import babelJsx from "@babel/plugin-transform-react-jsx"
import { transformSync as swcTransform } from "@swc/core"
import * as esbuild from "esbuild"
import { transformJSX } from "../packages/compiler/src/index"

// oxc-transform uses CJS exports
const oxc = require("oxc-transform") as {
  transformSync: (
    filename: string,
    code: string,
    opts: { jsx: { runtime: string; importSource: string } },
  ) => { code: string }
}

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
  const COL = 16
  const labels = ["Pyreon", "esbuild", "SWC", "OXC", "Babel"]
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 96 - title.length - 4))}`)
  console.log(`  ${labels.map((l) => l.padStart(COL)).join("")}`)
  console.log(`  ${"-".repeat(COL * labels.length)}`)

  // Results should be in order: Pyreon, esbuild, SWC, OXC, Babel
  const values = results.map((r) => r.opsPerSec.toLocaleString().padStart(COL)).join("")
  console.log(`  ${values}`)
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

// ─── Transform configs ──────────────────────────────────────────────────────

const BABEL_OPTS: babel.TransformOptions = {
  plugins: [[babelJsx, { runtime: "automatic", importSource: "@pyreon/core" }]],
  parserOpts: { plugins: ["jsx", "typescript"] },
  filename: "bench.tsx",
  configFile: false,
  babelrc: false,
}

const SWC_OPTS = {
  jsc: {
    parser: { syntax: "typescript" as const, tsx: true },
    transform: { react: { runtime: "automatic" as const, importSource: "@pyreon/core" } },
  },
  filename: "bench.tsx",
}

const OXC_OPTS = { jsx: { runtime: "automatic", importSource: "@pyreon/core" } }

function pyreonTransform(code: string): void {
  transformJSX(code, "bench.tsx")
}

function esbuildTransform(code: string): void {
  esbuild.transformSync(code, {
    loader: "tsx",
    jsx: "automatic",
    jsxImportSource: "@pyreon/core",
  })
}

function swcDoTransform(code: string): void {
  swcTransform(code, SWC_OPTS)
}

function oxcTransform(code: string): void {
  oxc.transformSync("bench.tsx", code, OXC_OPTS)
}

function babelTransform(code: string): void {
  babel.transformSync(code, BABEL_OPTS)
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

function benchSize(code: string): BenchResult[] {
  return [
    bench("Pyreon", () => pyreonTransform(code)),
    bench("esbuild", () => esbuildTransform(code)),
    bench("SWC", () => swcDoTransform(code)),
    bench("OXC", () => oxcTransform(code)),
    bench("Babel", () => babelTransform(code)),
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
console.log("Pyreon · esbuild · SWC · OXC · Babel")
console.log(`${"=".repeat(96)}`)

printStats()
printSection("Small (1 element)", benchSize(SMALL))
printSection("Medium (todo app)", benchSize(MEDIUM))
printSection("Large (10 rows)", benchSize(LARGE_10))
printSection("Large (50 rows)", benchSize(LARGE_50))
printSection("Large (100 rows)", benchSize(LARGE_100))

console.log()
