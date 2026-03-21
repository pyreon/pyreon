/**
 * Compiler benchmark — measures the real Vite 8 transform pipeline.
 *
 * In Vite 8, the actual flow for a .tsx file is:
 *   1. Pyreon plugin (enforce: "pre") — reactive wrapping + static hoisting
 *   2. OXC (Vite built-in)           — JSX → jsx() function calls
 *
 * This benchmark measures:
 *   - OXC only            — baseline (what React/Preact pay on Vite 8)
 *   - Pyreon + OXC        — full pipeline (what Pyreon pays on Vite 8)
 *   - Pyreon overhead     — the extra cost of reactive analysis
 *
 * Also compares other bundler transforms for reference:
 *   - esbuild  — Go-based (Vite 5, tsup)
 *   - SWC      — Rust-based (Next.js, Turbopack)
 *   - Babel    — JS-based (legacy, Solid's compiler)
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

function printTable(title: string, results: BenchResult[]) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 72 - title.length - 4))}`)
  console.log(`${"transform".padEnd(36)}${"ops/sec".padStart(14)}${"avg ns/op".padStart(14)}`)
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

// ─── Transform functions ─────────────────────────────────────────────────────

function pyreonReactivePass(code: string): string {
  return transformJSX(code, "bench.tsx").code
}

function oxcJsxPass(code: string): string {
  return oxc.transformSync("bench.tsx", code, OXC_OPTS).code
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

function benchVitePipeline(code: string): BenchResult[] {
  const results: BenchResult[] = []

  // What React/Preact pay on Vite 8 — just OXC
  results.push(bench("OXC only (React on Vite 8)", () => oxcJsxPass(code)))

  // What Pyreon pays — reactive pass then OXC
  results.push(
    bench("Pyreon + OXC (Pyreon on Vite 8)", () => {
      const reactiveCode = pyreonReactivePass(code)
      oxcJsxPass(reactiveCode)
    }),
  )

  // Just the reactive pass (to show the overhead)
  results.push(bench("  └─ Pyreon reactive pass only", () => pyreonReactivePass(code)))

  return results
}

function benchAlternatives(code: string): BenchResult[] {
  return [
    bench("esbuild (Vite 5)", () =>
      esbuild.transformSync(code, {
        loader: "tsx",
        jsx: "automatic",
        jsxImportSource: "@pyreon/core",
      }),
    ),
    bench("SWC (Next.js)", () => swcTransform(code, SWC_OPTS)),
    bench("Babel (Solid, legacy)", () => babel.transformSync(code, BABEL_OPTS)),
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

console.log("Compiler Benchmark — Vite 8 Pipeline")
console.log(`${"=".repeat(72)}`)
console.log()
console.log("Pipeline: Pyreon plugin (enforce: pre) → OXC (Vite built-in)")
console.log("React/Preact on Vite 8 = OXC only (no reactive pass)")
console.log("Pyreon on Vite 8 = Pyreon reactive pass + OXC JSX transform")

printStats()

const sizes = [
  ["Small (1 element)", SMALL],
  ["Medium (todo app)", MEDIUM],
  ["Large (10 rows)", LARGE_10],
  ["Large (50 rows)", LARGE_50],
  ["Large (100 rows)", LARGE_100],
] as const

// Vite 8 pipeline comparison
console.log("\n\n▸ Vite 8 Pipeline (Pyreon vs React/Preact)")
console.log("─".repeat(72))
for (const [label, code] of sizes) {
  printTable(label, benchVitePipeline(code))
}

// Other bundler transforms for reference
console.log("\n\n▸ Other Bundler Transforms (reference)")
console.log("─".repeat(72))
for (const [label, code] of sizes) {
  printTable(label, benchAlternatives(code))
}

console.log()
