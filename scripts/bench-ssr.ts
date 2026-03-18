/**
 * SSR throughput benchmark — measures renders/sec for renderToString()
 * with different app complexities.
 *
 * Scenarios mirror TanStack's methodology:
 *   - empty:              minimal component (framework overhead baseline)
 *   - simple:             5 routes, nav with 5 links, simple page
 *   - links-100:          100 RouterLinks to stress link rendering
 *   - layouts-26-params:  26 nested layouts with params
 *
 * Usage: bun scripts/bench-ssr.ts
 */

import type { ComponentFn, VNode } from "../packages/core/src/index"
import { h } from "../packages/core/src/index"
import { RouterLink, RouterProvider, RouterView } from "../packages/router/src/components"
import { createRouter } from "../packages/router/src/router"
import type { RouteRecord } from "../packages/router/src/types"
import { renderToString } from "../packages/runtime-server/src/index"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Text(text: string): ComponentFn {
  return () => h("div", null, text)
}

// ─── Scenario 1: Empty ──────────────────────────────────────────────────────

function buildEmpty(): { app: VNode; label: string } {
  const EmptyPage: ComponentFn = () => h("div", null, "hello")
  const routes: RouteRecord[] = [{ path: "/", component: EmptyPage }]
  const router = createRouter({ routes, mode: "history", url: "/" })
  return {
    label: "empty",
    app: h(RouterProvider, { router }, h(RouterView, null)),
  }
}

// ─── Scenario 2: Simple (5 routes, 5 links) ─────────────────────────────────

function buildSimple(): { app: VNode; label: string } {
  const routes: RouteRecord[] = [
    { path: "/", component: Text("Home") },
    { path: "/about", component: Text("About") },
    { path: "/pricing", component: Text("Pricing") },
    { path: "/blog", component: Text("Blog") },
    { path: "/contact", component: Text("Contact") },
  ]
  const paths = routes.map((r) => r.path)
  const Nav: ComponentFn = () => h("nav", null, ...paths.map((p) => h(RouterLink, { to: p }, p)))
  const Layout: ComponentFn = (props) => h("div", null, h(Nav, null), props.children as VNode)

  const router = createRouter({ routes, mode: "history", url: "/" })
  return {
    label: "simple (5 routes)",
    app: h(RouterProvider, { router }, h(Layout, null, h(RouterView, null))),
  }
}

// ─── Scenario 3: Links-100 ──────────────────────────────────────────────────

function buildLinks100(): { app: VNode; label: string } {
  const routes: RouteRecord[] = []
  const links: VNode[] = []
  for (let i = 0; i < 100; i++) {
    const path = `/page/${i}`
    routes.push({ path, component: Text(`Page ${i}`) })
    links.push(h(RouterLink, { to: path }, `Page ${i}`))
  }
  // Catch-all
  routes.push({ path: "(.*)", component: Text("404") })

  const Nav: ComponentFn = () => h("nav", null, ...links)
  const Layout: ComponentFn = (props) => h("div", null, h(Nav, null), props.children as VNode)

  const router = createRouter({ routes, mode: "history", url: "/page/0" })
  return {
    label: "links-100",
    app: h(RouterProvider, { router }, h(Layout, null, h(RouterView, null))),
  }
}

// ─── Scenario 4: Layouts-26 with params ─────────────────────────────────────

function buildLayouts26(): { app: VNode; label: string } {
  // Build 26 levels of nested layouts, each with a :param
  const Leaf: ComponentFn = () => h("div", { className: "leaf" }, "Leaf content")

  function makeLayout(depth: number): ComponentFn {
    return () =>
      h(
        "div",
        { className: `layout-${depth}` },
        h("h2", null, `Level ${depth}`),
        h("div", { className: "content" }, h(RouterView, null)),
      )
  }

  // Build nested route tree: /l0/:p0/l1/:p1/.../l25/:p25
  function buildNested(depth: number): RouteRecord[] {
    if (depth >= 26) {
      return [{ path: "leaf", component: Leaf }]
    }
    return [
      {
        path: `l${depth}/:p${depth}`,
        component: makeLayout(depth),
        children: buildNested(depth + 1),
      },
    ]
  }

  const routes: RouteRecord[] = buildNested(0)

  // Build the URL: /l0/v0/l1/v1/.../l25/v25/leaf
  const segments: string[] = []
  for (let i = 0; i < 26; i++) {
    segments.push(`l${i}`, `v${i}`)
  }
  segments.push("leaf")
  const url = `/${segments.join("/")}`

  const router = createRouter({ routes, mode: "history", url })
  return {
    label: "layouts-26-params",
    app: h(RouterProvider, { router }, h(RouterView, null)),
  }
}

// ─── Benchmark harness ───────────────────────────────────────────────────────

interface BenchResult {
  label: string
  rendersPerSec: number
  avgMs: number
  avgBytes: number
}

async function benchSSR(
  label: string,
  buildApp: () => { app: VNode; label: string },
  durationMs = 3000,
): Promise<BenchResult> {
  // Warmup — 50 renders
  for (let i = 0; i < 50; i++) {
    const { app } = buildApp()
    await renderToString(app)
  }

  // Timed
  let ops = 0
  let totalBytes = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    const { app } = buildApp()
    const html = await renderToString(app)
    totalBytes += html.length
    ops++
  }
  const elapsed = performance.now() - start

  return {
    label,
    rendersPerSec: Math.round((ops / elapsed) * 1000),
    avgMs: Number.parseFloat((elapsed / ops).toFixed(4)),
    avgBytes: Math.round(totalBytes / ops),
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const scenarios = [
  { build: buildEmpty, label: "empty" },
  { build: buildSimple, label: "simple (5 routes)" },
  { build: buildLinks100, label: "links-100" },
  { build: buildLayouts26, label: "layouts-26-params" },
]

console.log("SSR Throughput Benchmark (Bun)")
console.log(`${"=".repeat(70)}\n`)

console.log(
  `${"scenario".padEnd(26)}${"renders/sec".padStart(14)}${"avg ms".padStart(12)}${"avg bytes".padStart(14)}`,
)
console.log("-".repeat(66))

for (const { build, label } of scenarios) {
  const result = await benchSSR(label, build)
  const rps = result.rendersPerSec.toLocaleString()
  const ms = result.avgMs.toFixed(3)
  const bytes = result.avgBytes.toLocaleString()
  console.log(
    `${result.label.padEnd(26)}${rps.padStart(14)}${ms.padStart(12)}${bytes.padStart(14)}`,
  )
}

console.log()
