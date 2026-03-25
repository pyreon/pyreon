/**
 * Server package benchmark — measures SSR handler throughput.
 *
 * Tests:
 *   - Template processing: processTemplate vs processCompiledTemplate
 *   - buildScripts vs buildScriptsFast
 *   - Full handler throughput (requests/sec at various complexities)
 *
 * Usage: bun scripts/bench-server.ts
 */

import type { ComponentFn, VNode } from "../packages/core/core/src/index"
import { h } from "../packages/core/core/src/index"
import { RouterProvider, RouterView } from "../packages/core/router/src/components"
import { createRouter } from "../packages/core/router/src/router"
import type { RouteRecord } from "../packages/core/router/src/types"
import {
  buildClientEntryTag,
  buildScripts,
  buildScriptsFast,
  compileTemplate,
  DEFAULT_TEMPLATE,
  processCompiledTemplate,
  processTemplate,
} from "../packages/core/server/src/html"
import { createHandler } from "../packages/core/server/src/handler"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Text(text: string): ComponentFn {
  return () => h("div", null, text)
}

// ─── Benchmark harness ───────────────────────────────────────────────────────

interface BenchResult {
  label: string
  opsPerSec: number
  avgNs: number
}

function bench(label: string, fn: () => void, durationMs = 2000): BenchResult {
  for (let i = 0; i < 1000; i++) fn()
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

async function benchAsync(
  label: string,
  fn: () => Promise<void>,
  durationMs = 3000,
): Promise<BenchResult> {
  for (let i = 0; i < 50; i++) await fn()
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    await fn()
    ops++
  }
  const elapsed = performance.now() - start
  return {
    label,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgNs: Math.round((elapsed / ops) * 1_000_000),
  }
}

// ─── Template processing benchmarks ──────────────────────────────────────────

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyreon-head-->
</head>
<body>
  <div id="app"><!--pyreon-app--></div>
  <!--pyreon-scripts-->
</body>
</html>`

const SAMPLE_DATA = {
  head: '<title>Test</title>\n  <meta name="description" content="A test page">',
  app: '<div><h1>Hello World</h1><p>This is a test page with some content.</p></div>',
  scripts: '<script type="module" src="/src/entry-client.ts"></script>',
}

const SAMPLE_LOADER_DATA = {
  "/": { posts: [{ id: 1, title: "Hello" }, { id: 2, title: "World" }] },
  "/about": { team: ["Alice", "Bob", "Charlie"] },
}

function benchTemplateProcessing(): BenchResult[] {
  const compiled = compileTemplate(TEMPLATE)

  const original = bench("processTemplate (3x replace)", () => {
    processTemplate(TEMPLATE, SAMPLE_DATA)
  })

  const fast = bench("processCompiledTemplate", () => {
    processCompiledTemplate(compiled, SAMPLE_DATA)
  })

  return [original, fast]
}

function benchBuildScripts(): BenchResult[] {
  const clientEntry = "/src/entry-client.ts"
  const clientEntryTag = buildClientEntryTag(clientEntry)

  const original = bench("buildScripts (original)", () => {
    buildScripts(clientEntry, SAMPLE_LOADER_DATA)
  })

  const fast = bench("buildScriptsFast (pre-built)", () => {
    buildScriptsFast(clientEntryTag, SAMPLE_LOADER_DATA)
  })

  const noData = bench("buildScripts (no loader data)", () => {
    buildScripts(clientEntry, null)
  })

  const noDataFast = bench("buildScriptsFast (no data)", () => {
    buildScriptsFast(clientEntryTag, null)
  })

  return [original, fast, noData, noDataFast]
}

// ─── Full handler throughput ─────────────────────────────────────────────────

async function benchHandler(
  label: string,
  routes: RouteRecord[],
  url: string,
  App: ComponentFn,
): Promise<BenchResult> {
  const handler = createHandler({
    App,
    routes,
    template: TEMPLATE,
  })

  return benchAsync(label, async () => {
    const req = new Request(`http://localhost${url}`)
    const res = await handler(req)
    await res.text()
  })
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log("Server Package Benchmark (Bun)")
console.log(`${"=".repeat(70)}\n`)

// Section 1: Template processing
console.log("── Template Processing ─────────────────────────────────────────────")
console.log(
  `${"test".padEnd(36)}${"ops/sec".padStart(14)}${"avg ns/op".padStart(14)}`,
)
console.log("-".repeat(64))

for (const r of benchTemplateProcessing()) {
  console.log(
    `${r.label.padEnd(36)}${r.opsPerSec.toLocaleString().padStart(14)}${r.avgNs.toLocaleString().padStart(14)}`,
  )
}

// Section 2: buildScripts
console.log("\n── Script Building ─────────────────────────────────────────────────")
console.log(
  `${"test".padEnd(36)}${"ops/sec".padStart(14)}${"avg ns/op".padStart(14)}`,
)
console.log("-".repeat(64))

for (const r of benchBuildScripts()) {
  console.log(
    `${r.label.padEnd(36)}${r.opsPerSec.toLocaleString().padStart(14)}${r.avgNs.toLocaleString().padStart(14)}`,
  )
}

// Section 3: Full handler throughput
console.log("\n── Full Handler Throughput (req/sec) ────────────────────────────────")
console.log(
  `${"test".padEnd(36)}${"req/sec".padStart(14)}${"avg ms/req".padStart(14)}`,
)
console.log("-".repeat(64))

// Simple: 1 route, minimal component
const simpleRoutes: RouteRecord[] = [{ path: "/", component: Text("Home") }]
const SimpleApp: ComponentFn = () => h(RouterView, null)

// Medium: 10 routes, nav with links
const mediumRoutes: RouteRecord[] = []
for (let i = 0; i < 10; i++) {
  mediumRoutes.push({ path: i === 0 ? "/" : `/page-${i}`, component: Text(`Page ${i}`) })
}
const MediumApp: ComponentFn = () =>
  h("div", null, h("nav", null, h("a", { href: "/" }, "Home")), h(RouterView, null))

// Nested: 5-deep layout nesting
const nestedRoutes: RouteRecord[] = [
  {
    path: "/",
    component: (() => h("div", { class: "l0" }, h(RouterView, null))) as ComponentFn,
    children: [
      {
        path: "a",
        component: (() => h("div", { class: "l1" }, h(RouterView, null))) as ComponentFn,
        children: [
          {
            path: "b",
            component: (() => h("div", { class: "l2" }, h(RouterView, null))) as ComponentFn,
            children: [
              {
                path: "c",
                component: (() =>
                  h("div", { class: "l3" }, h(RouterView, null))) as ComponentFn,
                children: [{ path: "d", component: Text("Deep leaf") }],
              },
            ],
          },
        ],
      },
    ],
  },
]
const NestedApp: ComponentFn = () => h(RouterView, null)

const handlerResults = [
  await benchHandler("simple (1 route)", simpleRoutes, "/", SimpleApp),
  await benchHandler("medium (10 routes)", mediumRoutes, "/page-5", MediumApp),
  await benchHandler("nested (5 deep)", nestedRoutes, "/a/b/c/d", NestedApp),
]

for (const r of handlerResults) {
  const rps = r.opsPerSec.toLocaleString()
  const ms = (r.avgNs / 1_000_000).toFixed(3)
  console.log(`${r.label.padEnd(36)}${rps.padStart(14)}${ms.padStart(14)}`)
}

console.log()
