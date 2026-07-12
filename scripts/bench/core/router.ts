/**
 * Route matching benchmark — resolveRoute() vs popular routers at 10/50/200
 * route tables, brought up to the repo's fundamentals-bench objectivity
 * standard (per-cell process isolation, pooled CI95, tie markers).
 *
 * Routers compared (REAL installed deps — no shims):
 *   - @pyreon/router   — compiled segments + static map + first-segment dispatch
 *   - find-my-way      — radix tree (Fastify)
 *   - hono             — SmartRouter (RegExpRouter mega-regex + Trie fallback)
 *   - radix3           — radix tree (unjs / Nitro / H3 / Nuxt)
 *   - react-router     — matchRoutes (React Router v7+)
 *   - @tanstack/router — tree-based matching (TanStack Router)
 *   - vue-router       — router.resolve (Vue Router v4+)
 *   - path-to-regexp   — pre-compiled linear scan (Next.js pages-router shape)
 *
 * OBJECTIVITY CONTRACT (mirrors packages/fundamentals/validate/bench):
 *   1. `NODE_ENV=production` forced before imports — several routers gate
 *      dev-only warnings/instrumentation on it.
 *   2. INPUT ROTATION: every timed loop cycles through 8 path VARIANTS of the
 *      scenario shape (different ids / files / misses). A constant input lets
 *      JSC/V8 hoist loop-invariant work and hands an unfair win to whichever
 *      library the JIT happens to specialize — rotation forces every library
 *      to do real per-call work. (Bench lesson from the 2026-07 loop.)
 *   3. CORRECTNESS GATE before timing: for every size × scenario × variant,
 *      every router must match the EXPECTED route (verified by route
 *      identity, not just "non-null") and extract the expected param value.
 *      A router that "wins" by matching the wrong route or skipping param
 *      extraction is caught here.
 *   4. PER-CELL PROCESS ISOLATION: each (size|scenario|lib) cell runs in
 *      fresh `bun` child processes so one library's IC/JIT pollution can't
 *      skew another's numbers; samples POOLED across PROCS=3 independent
 *      processes so the CI covers process-level jitter.
 *   5. Median of pooled samples + seeded BOOTSTRAP 95% CI; a competitor
 *      whose CI overlaps the winner's is marked 🤝 tied.
 *   6. No forced GC — Bun.gc(true) causes JSC jettison→re-tier bimodality
 *      (fake losses). Warmup amortizes compile/JIT (Hono's SmartRouter picks
 *      + builds its RegExpRouter on first match; TanStack/Vue precompute).
 *   7. Machine stamp printed with results.
 *
 * HONEST LIMITS (author-judge): written + judged by the Pyreon authors. All
 * routers are exercised through their public match/resolve APIs, but they do
 * different amounts of WORK per call — Pyreon's resolveRoute returns a full
 * ResolvedRoute (params + parsed query + merged meta + matched chain),
 * find-my-way/radix3 return a handler + params, Vue resolve builds a full
 * location object. The comparison is "cost of the library's canonical
 * match entry point", not a claim of identical per-call work.
 *
 * Usage:
 *   bun scripts/bench/core/router.ts            # full protocol run (~6-9 min)
 *   bun scripts/bench/core/router.ts --quick    # 1 process/cell, fewer runs
 *   bun scripts/bench/core/router.ts --cell K   # internal worker mode
 */

process.env.NODE_ENV = 'production'

import {
  createRootRoute,
  createRoute,
  createMemoryHistory as createTanStackHistory,
  createRouter as createTanStackRouter,
} from '@tanstack/react-router'
import FindMyWay from 'find-my-way'
import { Hono } from 'hono'
import { match as ptrMatch } from 'next/dist/compiled/path-to-regexp'
import { createRouter as createRadix3 } from 'radix3'
import { matchRoutes } from 'react-router'
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router'
import { resolveRoute } from '../../../packages/core/router/src/match'
import type { RouteRecord } from '../../../packages/core/router/src/types'

// ─── Route tables (shared across all routers) ─────────────────────────────────

const Noop = () => null
const VueNoop = { template: '<div/>' }

interface RouteDef {
  /** Route id — used for identity-verified correctness (route.name / handler tag) */
  rid: string
  /** Pattern for Pyreon (`:param`, `:splat*`, `(.*)`) */
  pattern: string
  /** Flat pattern for find-my-way / hono (`:param`, trailing `*`) */
  flat: string
}

function generateTable(count: number): { pyreonRoutes: RouteRecord[]; flatDefs: RouteDef[] } {
  const pyreonRoutes: RouteRecord[] = []
  const flatDefs: RouteDef[] = []
  const addFlat = (rid: string, pattern: string, flat = pattern) =>
    flatDefs.push({ rid, pattern, flat })

  pyreonRoutes.push({ path: '/', name: 'root', component: Noop })
  addFlat('root', '/')
  for (const p of ['/about', '/pricing', '/contact', '/terms']) {
    pyreonRoutes.push({ path: p, name: p.slice(1), component: Noop })
    addFlat(p.slice(1), p)
  }

  pyreonRoutes.push({ path: '/user/:id', name: 'user', component: Noop })
  addFlat('user', '/user/:id')
  pyreonRoutes.push({ path: '/post/:id/comment/:commentId', name: 'comment', component: Noop })
  addFlat('comment', '/post/:id/comment/:commentId')

  // Nested (Pyreon nests; flattened for the others)
  pyreonRoutes.push({
    path: '/admin',
    name: 'admin',
    component: Noop,
    children: [
      { path: 'dashboard', name: 'admin-dashboard', component: Noop },
      {
        path: 'users',
        name: 'admin-users',
        component: Noop,
        children: [{ path: ':id/settings', name: 'admin-user-settings', component: Noop }],
      },
    ],
  })
  addFlat('admin-dashboard', '/admin/dashboard')
  addFlat('admin-user-settings', '/admin/users/:id/settings')

  // Splat
  pyreonRoutes.push({ path: '/files/:path*', name: 'files', component: Noop })
  flatDefs.push({ rid: 'files', pattern: '/files/:path*', flat: '/files/*' })

  // Pad to size with the same static/dynamic/nested mix the app-shaped table uses
  let i = pyreonRoutes.length
  while (i < count) {
    if (i % 3 === 0) {
      const p = `/page-${i}`
      pyreonRoutes.push({ path: p, name: `page-${i}`, component: Noop })
      addFlat(`page-${i}`, p)
    } else if (i % 3 === 1) {
      const p = `/entity-${i}/:id`
      pyreonRoutes.push({ path: p, name: `entity-${i}`, component: Noop })
      addFlat(`entity-${i}`, p)
    } else {
      pyreonRoutes.push({
        path: `/group-${i}`,
        name: `group-${i}`,
        component: Noop,
        children: [
          { path: 'list', name: `group-${i}-list`, component: Noop },
          { path: ':id', name: `group-${i}-item`, component: Noop },
        ],
      })
      addFlat(`group-${i}-list`, `/group-${i}/list`)
      addFlat(`group-${i}-item`, `/group-${i}/:id`)
    }
    i++
  }

  // Wildcard fallback (all routers get an equivalent catch-all)
  pyreonRoutes.push({ path: '(.*)', name: 'catchall', component: Noop })

  return { pyreonRoutes, flatDefs }
}

// ─── Scenarios: 8 rotated variants each, with expected route id + param ──────

interface Variant {
  path: string
  /** Expected matched route id (identity gate) */
  rid: string
  /** Expected param VALUE that must appear in the extracted params (if any) */
  param?: string
}

interface Scenario {
  name: string
  variants: Variant[]
}

function scenarios(count: number): Scenario[] {
  const statics: Variant[] = [
    { path: '/', rid: 'root' },
    { path: '/about', rid: 'about' },
    { path: '/pricing', rid: 'pricing' },
    { path: '/contact', rid: 'contact' },
    { path: '/terms', rid: 'terms' },
    { path: '/about', rid: 'about' },
    { path: '/pricing', rid: 'pricing' },
    { path: '/terms', rid: 'terms' },
  ]
  // At larger sizes, rotate late-table statics in (positional bias check)
  if (count >= 50) {
    const late: Variant[] = []
    for (let i = count - 1; i >= 10 && late.length < 3; i--) {
      if (i % 3 === 0) late.push({ path: `/page-${i}`, rid: `page-${i}` })
    }
    statics.splice(5, late.length, ...late)
  }

  const ids = ['1', '42', '999', '7', '123456', 'abc', 'x-1', '0']
  return [
    { name: 'static', variants: statics },
    {
      name: 'dynamic (1 param)',
      variants: ids.map((id) => ({ path: `/user/${id}`, rid: 'user', param: id })),
    },
    {
      name: 'dynamic (2 params)',
      variants: ids.map((id, i) => ({
        path: `/post/${id}/comment/c${i}`,
        rid: 'comment',
        param: id,
      })),
    },
    {
      name: 'nested static (2 deep)',
      variants: Array.from({ length: 8 }, () => ({
        path: '/admin/dashboard',
        rid: 'admin-dashboard',
      })),
    },
    {
      name: 'nested dynamic (3 deep)',
      variants: ids.map((id) => ({
        path: `/admin/users/${id}/settings`,
        rid: 'admin-user-settings',
        param: id,
      })),
    },
    {
      name: 'splat',
      variants: ids.map((id, i) => ({
        path: `/files/docs/${2020 + i}/report-${id}.pdf`,
        rid: 'files',
      })),
    },
    {
      name: 'miss → catch-all',
      variants: ids.map((id) => ({ path: `/zzz-${id}/nope`, rid: 'catchall' })),
    },
  ]
}

// ─── Router adapters: build once, match(path) + verify(path, variant) ────────

type Lib =
  | 'Pyreon'
  | 'find-my-way'
  | 'Hono'
  | 'radix3'
  | 'React Router'
  | 'TanStack'
  | 'Vue Router'
  | 'Next.js*'

const LIBS: Lib[] = [
  'Pyreon',
  'find-my-way',
  'Hono',
  'radix3',
  'React Router',
  'TanStack',
  'Vue Router',
  'Next.js*',
]

interface Adapter {
  match: (path: string) => unknown
  /** Return the matched route id + extracted params for the correctness gate */
  inspect: (path: string) => { rid: string | null; params: Record<string, unknown> }
}

function toTanStackPath(flat: string): string {
  if (flat.endsWith('/*')) return flat.replace('/*', '/$')
  return flat.replace(/:(\w+)\*/g, '$').replace(/:(\w+)/g, (_m, name) => `$${name}`)
}

/**
 * Build ONE lib's adapter. Lazy per-lib on purpose: each worker process
 * benchmarks a single (size|scenario|lib) cell — building all 8 routers'
 * 200-route tables per spawn multiplied worker setup time ~8× for nothing
 * (and warming OTHER libs' code in the same process would erode the very
 * isolation the per-cell spawn buys).
 */
function buildAdapter(count: number, lib: Lib): Adapter {
  return buildersByLib[lib](generateTable(count))
}

type Table = { pyreonRoutes: RouteRecord[]; flatDefs: RouteDef[] }

const buildersByLib: Record<Lib, (t: Table) => Adapter> = {
  Pyreon: buildPyreon,
  'find-my-way': buildFindMyWay,
  Hono: buildHono,
  radix3: buildRadix3,
  'React Router': buildReactRouter,
  TanStack: buildTanStack,
  'Vue Router': buildVue,
  'Next.js*': buildNextJs,
}

function buildPyreon({ pyreonRoutes }: Table): Adapter {
  // Pyreon
  return {
    match: (p) => resolveRoute(p, pyreonRoutes),
    inspect: (p) => {
      const r = resolveRoute(p, pyreonRoutes)
      const leaf = r.matched[r.matched.length - 1]
      return { rid: leaf?.name ?? null, params: r.params }
    },
  }
}

function buildFindMyWay({ flatDefs }: Table): Adapter {
  // find-my-way — tag each handler with its rid
  const fmw = FindMyWay()
  for (const d of flatDefs) {
    const handler = () => null
    ;(handler as unknown as { rid: string }).rid = d.rid
    fmw.on('GET', d.flat, handler)
  }
  {
    const handler = () => null
    ;(handler as unknown as { rid: string }).rid = 'catchall'
    fmw.on('GET', '/*', handler)
  }
  return {
    match: (p) => fmw.find('GET', p),
    inspect: (p) => {
      const res = fmw.find('GET', p)
      return {
        rid: res ? ((res.handler as unknown as { rid?: string }).rid ?? null) : null,
        params: (res?.params ?? {}) as Record<string, unknown>,
      }
    },
  }
}

function buildHono({ flatDefs }: Table): Adapter {
  // Hono — SmartRouter; handlers tagged with rid
  const app = new Hono()
  for (const d of flatDefs) {
    const handler = Object.assign((c: { text: (s: string) => unknown }) => c.text(''), {
      rid: d.rid,
    })
    app.get(d.flat, handler as never)
  }
  app.get('/*', Object.assign((c: { text: (s: string) => unknown }) => c.text(''), { rid: 'catchall' }) as never)
  const honoRouter = app.router
  return {
    match: (p) => honoRouter.match('GET', p),
    inspect: (p) => {
      // hono Result<T> = [[ [ [handler, routeMeta], ParamIndexMap ], ... ], stash?]
      // — RegExpRouter puts param VALUES in the stash (res[1]) with the
      // ParamIndexMap mapping name→stash index; TrieRouter puts the value
      // directly. Multiple entries return in registration order (middleware
      // semantics) — the FIRST is the specific route (catch-all registered
      // last).
      const res = honoRouter.match('GET', p) as [
        Array<[[unknown, unknown], Record<string, number | string>]>,
        (Array<string | null> | undefined)?,
      ]
      const first = res[0][0]
      if (!first) return { rid: null, params: {} }
      const [handlerRecord, paramMap] = first
      const handler = handlerRecord[0]
      const stash = res[1]
      const params: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(paramMap ?? {})) {
        params[k] = stash && typeof v === 'number' ? stash[v] : v
      }
      return { rid: (handler as { rid?: string }).rid ?? null, params }
    },
  }
}

function buildRadix3({ flatDefs }: Table): Adapter {
  const radix = createRadix3()
  for (const d of flatDefs) {
    const path = d.flat.endsWith('/*') ? `${d.flat.slice(0, -1)}**` : d.flat
    radix.insert(path, { rid: d.rid })
  }
  radix.insert('/**', { rid: 'catchall' })
  return {
    match: (p) => radix.lookup(p),
    inspect: (p) => {
      const res = radix.lookup(p) as { rid?: string; params?: Record<string, unknown> } | null
      return { rid: res?.rid ?? null, params: res?.params ?? {} }
    },
  }
}

function buildReactRouter({ flatDefs }: Table): Adapter {
  // React Router uses `/*` natively for splat routes, which is exactly the
  // flat token (`/files/*`) — so no transform is needed (unlike radix3 `/**`,
  // TanStack `/$`, solid `/:splat(.*)*`). Pass `d.flat` through directly.
  const rrRoutes = flatDefs.map((d) => ({
    path: d.flat,
    element: null,
    rid: d.rid,
  }))
  rrRoutes.push({ path: '*', element: null, rid: 'catchall' })
  return {
    match: (p) => matchRoutes(rrRoutes, p),
    inspect: (p) => {
      const res = matchRoutes(rrRoutes, p)
      const leaf = res?.[res.length - 1]
      return {
        rid: leaf ? ((leaf.route as { rid?: string }).rid ?? null) : null,
        params: (leaf?.params ?? {}) as Record<string, unknown>,
      }
    },
  }
}

function buildTanStack({ flatDefs }: Table): Adapter {
  const rootRoute = createRootRoute()
  const tsIdToRid = new Map<string, string>()
  const childRoutes = flatDefs.map((d) => {
    const tsPath = toTanStackPath(d.flat)
    tsIdToRid.set(`/${tsPath.replace(/^\//, '')}`, d.rid)
    return createRoute({ getParentRoute: () => rootRoute, path: tsPath })
  })
  // Root splat catch-all — every other router gets one; the OLD harness
  // omitted TanStack's, so its "wildcard" rows timed a cheap MISS instead
  // of a catch-all match (caught by the identity-verified gate).
  childRoutes.push(createRoute({ getParentRoute: () => rootRoute, path: '$' }))
  const routeTree = rootRoute.addChildren(childRoutes)
  const tanstackRouter = createTanStackRouter({
    routeTree,
    history: createTanStackHistory({ initialEntries: ['/'] }),
  })
  return {
    match: (p) => tanstackRouter.matchRoutes(p),
    inspect: (p) => {
      const res = tanstackRouter.matchRoutes(p) as Array<{
        routeId: string
        params: Record<string, unknown>
      }>
      const leaf = res[res.length - 1]
      if (!leaf) return { rid: null, params: {} }
      // routeId is the TanStack path form; map back to rid (catch-all = '/$')
      const rid = tsIdToRid.get(leaf.routeId) ?? (leaf.routeId === '/$' ? 'catchall' : null)
      return { rid, params: leaf.params }
    },
  }
}

function buildVue({ flatDefs }: Table): Adapter {
  const vueRoutes = flatDefs.map((d) => ({
    path: d.flat.endsWith('/*')
      ? d.flat.replace('/*', '/:splat(.*)*')
      : d.flat,
    component: VueNoop,
    meta: { rid: d.rid },
  }))
  vueRoutes.push({ path: '/:pathMatch(.*)*', component: VueNoop, meta: { rid: 'catchall' } })
  const vueRouter = createVueRouter({ history: createMemoryHistory(), routes: vueRoutes })
  return {
    match: (p) => vueRouter.resolve(p),
    inspect: (p) => {
      const res = vueRouter.resolve(p)
      const leaf = res.matched[res.matched.length - 1]
      return {
        rid: (leaf?.meta as { rid?: string } | undefined)?.rid ?? null,
        params: res.params as Record<string, unknown>,
      }
    },
  }
}

function buildNextJs({ flatDefs }: Table): Adapter {
  // path-to-regexp linear scan (Next.js pages-router shape)
  const toPtr = (flat: string) => (flat.endsWith('/*') ? `${flat.slice(0, -2)}/(.*)` : flat)
  const matchers = flatDefs.map((d) => ({ rid: d.rid, match: ptrMatch(toPtr(d.flat)) }))
  matchers.push({ rid: 'catchall', match: ptrMatch('/(.*)') })
  const ptrScan = (p: string): { rid: string; params: Record<string, unknown> } | false => {
    for (const m of matchers) {
      const result = m.match(p)
      if (result) return { rid: m.rid, params: result.params as Record<string, unknown> }
    }
    return false
  }
  return {
    match: (p) => ptrScan(p),
    inspect: (p) => {
      const res = ptrScan(p)
      return res === false ? { rid: null, params: {} } : res
    },
  }
}

// ─── Timing core (worker) ─────────────────────────────────────────────────────

const now = () => Number(process.hrtime.bigint())

/**
 * Time-budgeted sampling: warm up for ~`warmupMs`, calibrate the per-run
 * iteration count to ~`runMs` of work, then take `runs` timed windows.
 * Fixed iteration counts are unusable across libraries whose per-op cost
 * spans 6ns → 450µs (a 20k-iter window is 0.1ms for one lib and 9s for
 * another); time-budgeted windows give every library the same number of
 * samples with comparable window lengths.
 */
function measureSamples(
  fn: () => void,
  { warmupMs = 300, runMs = 25, runs = 12 } = {},
): number[] {
  // Warmup — amortize JIT/compile (Hono builds its matchers on first match).
  let warmIters = 0
  const warmEnd = now() + warmupMs * 1e6
  while (now() < warmEnd) {
    for (let i = 0; i < 64; i++) fn()
    warmIters += 64
  }
  // Calibrate iterations per timed window (~runMs each, min 256 iters).
  const calibT0 = now()
  for (let i = 0; i < 256; i++) fn()
  const perOp = (now() - calibT0) / 256
  const iters = Math.max(256, Math.round((runMs * 1e6) / perOp))
  void warmIters
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    const t1 = now()
    samples.push((t1 - t0) / iters) // ns/op
  }
  return samples
}

// ─── Seeded bootstrap CI95 (orchestrator) ─────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function median(xs: number[]): number {
  const c = [...xs].sort((a, b) => a - b)
  return c[Math.floor(c.length / 2)]!
}

function bootstrapCI95(samples: number[], resamples = 1000): { lo: number; hi: number } {
  const rnd = mulberry32(0x9047e5)
  const meds: number[] = []
  for (let r = 0; r < resamples; r++) {
    const pick: number[] = []
    for (let i = 0; i < samples.length; i++) pick.push(samples[Math.floor(rnd() * samples.length)]!)
    meds.push(median(pick))
  }
  meds.sort((a, b) => a - b)
  return { lo: meds[Math.floor(resamples * 0.025)]!, hi: meds[Math.floor(resamples * 0.975)]! }
}

// ─── Worker mode: run ONE (size|scenario|lib) cell ────────────────────────────

const SIZES = [10, 50, 200]

const cellArg = process.argv.indexOf('--cell')
if (cellArg !== -1) {
  const key = process.argv[cellArg + 1]!
  const [sizeStr, scenarioName, lib] = key.split('|') as [string, string, Lib]
  const size = Number(sizeStr)
  const adapter = buildAdapter(size, lib)
  const sc = scenarios(size).find((x) => x.name === scenarioName)
  if (!sc) throw new Error(`unknown scenario ${scenarioName}`)
  const matchFn = adapter.match
  const paths = sc.variants.map((v) => v.path)
  let i = 0
  // Rotate the 8 variants through the timed loop (see OBJECTIVITY CONTRACT #2)
  const fn = () => {
    void matchFn(paths[i]!)
    i = (i + 1) & 7
  }
  const quick = process.argv.includes('--quick')
  const samples = measureSamples(fn, quick ? { warmupMs: 150, runMs: 10, runs: 8 } : {})
  process.stdout.write(JSON.stringify({ samples }))
  process.exit(0)
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
  version: string
}

const QUICK = process.argv.includes('--quick')
const PROCS = QUICK ? 1 : 3

// Correctness gate — identity-verified, all sizes × scenarios × variants × libs
{
  let checked = 0
  for (const size of SIZES) {
    const adapters = Object.fromEntries(
      LIBS.map((l) => [l, buildAdapter(size, l)]),
    ) as Record<Lib, Adapter>
    for (const sc of scenarios(size)) {
      for (const v of sc.variants) {
        for (const lib of LIBS) {
          const { rid, params } = adapters[lib].inspect(v.path)
          if (rid !== v.rid) {
            throw new Error(
              `[correctness] size=${size} ${sc.name} ${lib}: "${v.path}" matched "${rid}" — expected "${v.rid}"`,
            )
          }
          if (v.param !== undefined) {
            const values = Object.values(params).map((x) => String(x))
            if (!values.includes(v.param)) {
              throw new Error(
                `[correctness] size=${size} ${sc.name} ${lib}: "${v.path}" params ${JSON.stringify(params)} missing expected value "${v.param}"`,
              )
            }
          }
          checked++
        }
      }
    }
  }
  console.log(`✓ correctness gate passed — ${checked} (size × scenario × variant × lib) cells agree\n`)
}

interface CellResult {
  median: number
  lo: number
  hi: number
}

const fmtNs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}µs` : `${n.toFixed(0)}ns`)
const opsPerSec = (ns: number) => Math.round(1e9 / ns)
const fmtOps = (n: number) => n.toLocaleString('en-US')

console.log('Router Matching Benchmark (protocol run)')
console.log(
  `Bun ${Bun.version} · ${process.platform}/${process.arch} · NODE_ENV=production · ` +
    `${PROCS} process(es) pooled per cell · median ns/op ± bootstrap CI95 · 🤝 = CI overlaps winner`,
)
console.log('* Next.js uses path-to-regexp internally (pre-compiled, linear scan)')
console.log('AUTHOR-JUDGE CAVEAT: written + judged by the Pyreon authors — see file header.\n')

const allJson: unknown[] = []

for (const size of SIZES) {
  const scs = scenarios(size)
  const rows: Array<{ scenario: string; cells: Record<Lib, CellResult> }> = []

  for (const sc of scs) {
    const cells = {} as Record<Lib, CellResult>
    for (const lib of LIBS) {
      const key = `${size}|${sc.name}|${lib}`
      const pooled: number[] = []
      for (let p = 0; p < PROCS; p++) {
        const proc = Bun.spawnSync(
          ['bun', import.meta.path, '--cell', key, ...(QUICK ? ['--quick'] : [])],
          { env: { ...process.env, NODE_ENV: 'production' } },
        )
        if (proc.exitCode !== 0) {
          throw new Error(
            `cell worker failed: ${key}\n${new TextDecoder().decode(proc.stderr)}`,
          )
        }
        const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as {
          samples: number[]
        }
        pooled.push(...samples)
      }
      const { lo, hi } = bootstrapCI95(pooled)
      cells[lib] = { median: median(pooled), lo, hi }
    }
    rows.push({ scenario: sc.name, cells })
    console.error(`  measured ${size} routes × ${sc.name}`)
  }

  // ── Per-size table ──
  console.log(`Route table: ${size} routes`)
  const LABEL_W = 26
  const COL_W = 15
  console.log(`  ${'test (ns/op)'.padEnd(LABEL_W)}${LIBS.map((l) => l.padStart(COL_W)).join('')}`)
  console.log(`  ${'-'.repeat(LABEL_W + COL_W * LIBS.length)}`)

  for (const r of rows) {
    const meds = LIBS.map((l) => r.cells[l].median)
    const min = Math.min(...meds)
    const winner = LIBS[meds.indexOf(min)]!
    const w = r.cells[winner]
    const line = LIBS.map((l) => {
      const c = r.cells[l]
      const tied = l !== winner && c.lo <= w.hi && c.hi >= w.lo
      const mark = l === winner ? '★' : tied ? '🤝' : ''
      return `${mark}${fmtNs(c.median)}`.padStart(COL_W)
    }).join('')
    console.log(`  ${r.scenario.padEnd(LABEL_W)}${line}`)
  }

  // ── Averages (ops/sec of the mean ns — keeps run-all.ts extractor contract:
  // "average" line, first number = Pyreon ops/sec) ──
  const avgNs = LIBS.map(
    (l) => rows.reduce((t, r) => t + r.cells[l].median, 0) / rows.length,
  )
  const avgOps = avgNs.map((ns) => opsPerSec(ns))
  console.log(`  ${'-'.repeat(LABEL_W + COL_W * LIBS.length)}`)
  console.log(
    `  ${'average'.padEnd(LABEL_W)}${avgOps.map((o) => fmtOps(o).padStart(COL_W)).join('')}`,
  )
  const best = Math.min(...avgNs)
  console.log(
    `  ${'vs best'.padEnd(LABEL_W)}${avgNs.map((ns) => `${(ns / best).toFixed(2)}x`.padStart(COL_W)).join('')}`,
  )

  // Per-size verdict counts (row wins + ties)
  const wins: Record<string, number> = {}
  for (const r of rows) {
    const meds = LIBS.map((l) => r.cells[l].median)
    const min = Math.min(...meds)
    const winner = LIBS[meds.indexOf(min)]!
    const w = r.cells[winner]
    const tiedSet = LIBS.filter((l) => r.cells[l].lo <= w.hi && r.cells[l].hi >= w.lo)
    const label = tiedSet.length > 1 ? `🤝 ${tiedSet.join('=')}` : winner
    wins[label] = (wins[label] ?? 0) + 1
  }
  console.log(
    `  ${'row verdicts'.padEnd(LABEL_W)}${Object.entries(wins)
      .map(([k, v]) => `${k}×${v}`)
      .join(' · ')}`,
  )
  console.log()

  allJson.push({
    size,
    rows: rows.map((r) => ({
      scenario: r.scenario,
      cells: Object.fromEntries(
        LIBS.map((l) => [
          l,
          { ...r.cells[l], opsPerSec: opsPerSec(r.cells[l].median) },
        ]),
      ),
    })),
  })
}

console.log(
  JSON.stringify({
    meta: {
      bun: Bun.version,
      platform: `${process.platform}/${process.arch}`,
      isolation: `per-cell, ${PROCS} process(es) pooled`,
      ci: 'bootstrap-95 (seeded)',
      rotation: '8 path variants cycled per timed loop',
    },
    sizes: allJson,
  }),
)
