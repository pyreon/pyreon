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
 * FIDELITY CONTRACT (fixed 2026-06): the ROUTES ARRAY is built ONCE per
 * scenario (module-level in real apps — zero's `virtual:zero/routes`),
 * while the router + vnode tree are created fresh PER RENDER (the real
 * per-request SSR shape). The previous loop rebuilt the routes array per
 * iteration, which defeated the router's WeakMap-cached route index and
 * timed a full route-table recompile (~0.5µs/route) on every render —
 * links-100 read 149µs/render of which ~96% was cold compile, not SSR.
 * Real handlers hit the warm index; the honest links-100 number is ~4µs.
 *
 * Usage: bun scripts/bench/core/runtime-server.ts
 */

import type { ComponentFn, VNode } from '../../../packages/core/core/src/index'
import { h } from '../../../packages/core/core/src/index'
import {
  RouterLink,
  RouterProvider,
  RouterView,
} from '../../../packages/core/router/src/components'
import { createRouter } from '../../../packages/core/router/src/router'
import type { RouteRecord } from '../../../packages/core/router/src/types'
import { renderToString } from '../../../packages/core/runtime-server/src/index'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Text(text: string): ComponentFn {
  return () => h('div', null, text)
}

// ─── Scenario 1: Empty ──────────────────────────────────────────────────────

const _emptyRoutes: RouteRecord[] = [
  { path: '/', component: () => h('div', null, 'hello') },
]
function buildEmpty(): { makeApp: () => VNode; label: string } {
  return {
    label: 'empty',
    makeApp: () => {
      const router = createRouter({ routes: _emptyRoutes, mode: 'history', url: '/' })
      return h(RouterProvider, { router }, h(RouterView, null))
    },
  }
}

// ─── Scenario 2: Simple (5 routes, 5 links) ─────────────────────────────────

const _simpleRoutes: RouteRecord[] = [
  { path: '/', component: Text('Home') },
  { path: '/about', component: Text('About') },
  { path: '/pricing', component: Text('Pricing') },
  { path: '/blog', component: Text('Blog') },
  { path: '/contact', component: Text('Contact') },
]
function buildSimple(): { makeApp: () => VNode; label: string } {
  const paths = _simpleRoutes.map((r) => r.path)
  const Nav: ComponentFn = () => h('nav', null, ...paths.map((p) => h(RouterLink, { to: p }, p)))
  const Layout: ComponentFn = (props) => h('div', null, h(Nav, null), props.children as VNode)
  return {
    label: 'simple (5 routes)',
    makeApp: () => {
      const router = createRouter({ routes: _simpleRoutes, mode: 'history', url: '/' })
      return h(RouterProvider, { router }, h(Layout, null, h(RouterView, null)))
    },
  }
}

// ─── Scenario 3: Links-100 ──────────────────────────────────────────────────

const _links100Routes: RouteRecord[] = (() => {
  const routes: RouteRecord[] = []
  for (let i = 0; i < 100; i++) {
    routes.push({ path: `/page/${i}`, component: Text(`Page ${i}`) })
  }
  routes.push({ path: '(.*)', component: Text('404') }) // Catch-all
  return routes
})()
function buildLinks100(): { makeApp: () => VNode; label: string } {
  return {
    label: 'links-100',
    makeApp: () => {
      // Vnodes (incl. the 100 RouterLinks) are created fresh per render —
      // JSX runs per request in real apps. Only the routes table is shared.
      const links: VNode[] = []
      for (let i = 0; i < 100; i++) {
        links.push(h(RouterLink, { to: `/page/${i}` }, `Page ${i}`))
      }
      const Nav: ComponentFn = () => h('nav', null, ...links)
      const Layout: ComponentFn = (props) => h('div', null, h(Nav, null), props.children as VNode)
      const router = createRouter({ routes: _links100Routes, mode: 'history', url: '/page/0' })
      return h(RouterProvider, { router }, h(Layout, null, h(RouterView, null)))
    },
  }
}

// ─── Scenario 4: Layouts-26 with params ─────────────────────────────────────

function buildLayouts26(): { makeApp: () => VNode; label: string } {
  // Build 26 levels of nested layouts, each with a :param
  const Leaf: ComponentFn = () => h('div', { className: 'leaf' }, 'Leaf content')

  function makeLayout(depth: number): ComponentFn {
    return () =>
      h(
        'div',
        { className: `layout-${depth}` },
        h('h2', null, `Level ${depth}`),
        h('div', { className: 'content' }, h(RouterView, null)),
      )
  }

  // Build nested route tree: /l0/:p0/l1/:p1/.../l25/:p25
  function buildNested(depth: number): RouteRecord[] {
    if (depth >= 26) {
      return [{ path: 'leaf', component: Leaf }]
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
  segments.push('leaf')
  const url = `/${segments.join('/')}`

  return {
    label: 'layouts-26-params',
    makeApp: () => {
      const router = createRouter({ routes, mode: 'history', url })
      return h(RouterProvider, { router }, h(RouterView, null))
    },
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
  buildApp: () => { makeApp: () => VNode; label: string },
  durationMs = 3000,
): Promise<BenchResult> {
  // Scenario setup ONCE (routes table = module-level in real apps);
  // `makeApp` runs per render: fresh router + fresh vnode tree — the
  // real per-request SSR shape (see fidelity contract in the header).
  const { makeApp } = buildApp()
  // Warmup — 50 renders
  for (let i = 0; i < 50; i++) {
    await renderToString(makeApp())
  }

  // Timed
  let ops = 0
  let totalBytes = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    const html = await renderToString(makeApp())
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
  { build: buildEmpty, label: 'empty' },
  { build: buildSimple, label: 'simple (5 routes)' },
  { build: buildLinks100, label: 'links-100' },
  { build: buildLayouts26, label: 'layouts-26-params' },
]

console.log('SSR Throughput Benchmark (Bun)')
console.log(`${'='.repeat(70)}\n`)

console.log(
  `${'scenario'.padEnd(26)}${'renders/sec'.padStart(14)}${'avg ms'.padStart(12)}${'avg bytes'.padStart(14)}`,
)
console.log('-'.repeat(66))

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
