/**
 * Deep audit: the fs-router special-file machinery (`_layout` / `_error` /
 * `_loading` / `_404` / `(group)` dirs), verified EMPIRICALLY — real route
 * files on disk → `generateRouteModule` → real `import()` of the generated
 * module → real `createRouter` → assertions on the resolved `matched` chain.
 * No mock trees, no generated-string grepping for the core claims.
 *
 * The bug this locks (downstream report, root-caused): `parseFilePath`
 * stripped `(group)` segments from `dirPath`, so `(app)/_layout.tsx` landed
 * on the SAME tree node as the root `_layout.tsx` and `placeRoute`'s
 * last-wins assignment silently clobbered one of them — the group layout
 * rendered NOTHING (RouterView → RouterView → page, no layout DOM). The same
 * collision hit `_error`/`_loading`/`_404` inside groups, and sibling groups
 * clobbered each other's specials.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateRouteModule, parseFileRoutes } from '../fs-router'
import { expandRoutesForLocales } from '../i18n-routing'

// Temp routes live INSIDE the package so vite-node can transform them.
const TMP_ROOT = join(__dirname, '.tmp-group-layout-routes')
let seq = 0
const dirs: string[] = []

function makeRoutesDir(files: Record<string, string>): string {
  const dir = join(TMP_ROOT, `case-${seq++}`)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  dirs.push(dir)
  return dir
}

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true })
  dirs.length = 0
})

const page = (marker: string) =>
  `export default function Page() { return ${JSON.stringify(marker)} }\nPage.marker = ${JSON.stringify(marker)}\nexport const __marker = ${JSON.stringify(marker)}\n`
const layout = (marker: string) =>
  `export function layout() { return ${JSON.stringify(marker)} }\nlayout.marker = ${JSON.stringify(marker)}\n`
const special = (marker: string) =>
  `export default function Special() { return ${JSON.stringify(marker)} }\nSpecial.marker = ${JSON.stringify(marker)}\n`

/** Generate + import the route module, return the routes array. */
async function loadRoutes(dir: string, files: string[]) {
  const code = generateRouteModule(files, dir, { staticImports: true })
  const modPath = join(dir, '__routes.ts')
  writeFileSync(modPath, code)
  const mod = await import(/* @vite-ignore */ modPath)
  return mod.routes
}

async function resolveChain(dir: string, files: string[], url: string) {
  const { createRouter } = await import('@pyreon/router')
  const routes = await loadRoutes(dir, files)
  const router = createRouter({ routes, mode: 'history', url })
  const route = router.currentRoute()
  return { route, matched: route?.matched ?? [] }
}

const markerOf = (rec: { component?: unknown }) =>
  (rec.component as { marker?: string } | undefined)?.marker

describe('group layouts — the downstream bug (chain-level proof)', () => {
  it('(app)/_layout wraps its group pages UNDER the root layout: root → group → page', async () => {
    const files = ['_layout.ts', 'index.ts', '(app)/_layout.ts', '(app)/dashboard.ts']
    const dir = makeRoutesDir({
      '_layout.ts': layout('root-layout'),
      'index.ts': page('home'),
      '(app)/_layout.ts': layout('app-layout'),
      '(app)/dashboard.ts': page('dashboard'),
    })
    const { matched } = await resolveChain(dir, files, '/dashboard')
    expect(matched.map(markerOf)).toEqual(['root-layout', 'app-layout', 'dashboard'])
    // URL-invisibility: the group never appears in the path.
    expect(matched[matched.length - 1]!.path).toBe('/dashboard')
  })

  it('root pages are NOT wrapped by a sibling group layout', async () => {
    const files = ['_layout.ts', 'index.ts', '(app)/_layout.ts', '(app)/dashboard.ts']
    const dir = makeRoutesDir({
      '_layout.ts': layout('root-layout'),
      'index.ts': page('home'),
      '(app)/_layout.ts': layout('app-layout'),
      '(app)/dashboard.ts': page('dashboard'),
    })
    const { matched } = await resolveChain(dir, files, '/')
    expect(matched.map(markerOf)).toEqual(['root-layout', 'home'])
  })

  it('SIBLING groups each keep their own layout (pre-fix they clobbered each other)', async () => {
    const files = [
      '_layout.ts',
      '(app)/_layout.ts',
      '(app)/a.ts',
      '(marketing)/_layout.ts',
      '(marketing)/b.ts',
    ]
    const dir = makeRoutesDir({
      '_layout.ts': layout('root-layout'),
      '(app)/_layout.ts': layout('app-layout'),
      '(app)/a.ts': page('a'),
      '(marketing)/_layout.ts': layout('marketing-layout'),
      '(marketing)/b.ts': page('b'),
    })
    const a = await resolveChain(dir, files, '/a')
    expect(a.matched.map(markerOf)).toEqual(['root-layout', 'app-layout', 'a'])
    const b = await resolveChain(dir, files, '/b')
    expect(b.matched.map(markerOf)).toEqual(['root-layout', 'marketing-layout', 'b'])
  })

  it('a LAYOUT-LESS group is purely organizational — pages flatten to the parent chain', async () => {
    const files = ['_layout.ts', '(misc)/about.ts']
    const dir = makeRoutesDir({
      '_layout.ts': layout('root-layout'),
      '(misc)/about.ts': page('about'),
    })
    const { matched } = await resolveChain(dir, files, '/about')
    expect(matched.map(markerOf)).toEqual(['root-layout', 'about'])
  })

  it('nested: (app)/admin/_layout under (app)/_layout → root → app → admin → page', async () => {
    const files = [
      '_layout.ts',
      '(app)/_layout.ts',
      '(app)/admin/_layout.ts',
      '(app)/admin/users.ts',
    ]
    const dir = makeRoutesDir({
      '_layout.ts': layout('root-layout'),
      '(app)/_layout.ts': layout('app-layout'),
      '(app)/admin/_layout.ts': layout('admin-layout'),
      '(app)/admin/users.ts': page('users'),
    })
    const { matched } = await resolveChain(dir, files, '/admin/users')
    expect(matched.map(markerOf)).toEqual(['root-layout', 'app-layout', 'admin-layout', 'users'])
  })

  it('dynamic route inside a group resolves + is wrapped by the group layout', async () => {
    const files = ['(shop)/_layout.ts', '(shop)/[id].ts']
    const dir = makeRoutesDir({
      '(shop)/_layout.ts': layout('shop-layout'),
      '(shop)/[id].ts': page('product'),
    })
    const { route, matched } = await resolveChain(dir, files, '/42')
    expect(matched.map(markerOf)).toEqual(['shop-layout', 'product'])
    expect(route?.params).toMatchObject({ id: '42' })
  })

  it('group _error/_loading wire onto the GROUP subtree, root specials onto root pages', async () => {
    const files = [
      '_layout.ts',
      '_error.ts',
      'index.ts',
      '(app)/_layout.ts',
      '(app)/_error.ts',
      '(app)/dashboard.ts',
    ]
    const dir = makeRoutesDir({
      '_layout.ts': layout('root-layout'),
      '_error.ts': special('root-error'),
      'index.ts': page('home'),
      '(app)/_layout.ts': layout('app-layout'),
      '(app)/_error.ts': special('app-error'),
      '(app)/dashboard.ts': page('dashboard'),
    })
    const dash = await resolveChain(dir, files, '/dashboard')
    const dashLeaf = dash.matched[dash.matched.length - 1] as { errorComponent?: unknown }
    expect((dashLeaf.errorComponent as { marker?: string })?.marker).toBe('app-error')
    const home = await resolveChain(dir, files, '/')
    const homeLeaf = home.matched[home.matched.length - 1] as { errorComponent?: unknown }
    expect((homeLeaf.errorComponent as { marker?: string })?.marker).toBe('root-error')
  })
})

describe('group layouts × i18n (prefix-except-default)', () => {
  it('the ROOT layout is not duplicated per locale, but a GROUP layout IS', () => {
    const routes = parseFileRoutes([
      '_layout.tsx',
      '(app)/_layout.tsx',
      '(app)/dashboard.tsx',
    ])
    const expanded = expandRoutesForLocales(routes, {
      locales: ['en', 'de'],
      defaultLocale: 'en',
      strategy: 'prefix-except-default',
    })
    const layouts = expanded.filter((r) => r.isLayout)
    // root layout: exactly ONE copy (unprefixed — hierarchical match covers /de/*)
    expect(layouts.filter((r) => r.dirPath === '').length).toBe(1)
    // group layout: unprefixed copy AND a de-prefixed copy (its subtree is
    // duplicated under de/(app) — without the copy the de subtree has no layout)
    expect(layouts.filter((r) => r.dirPath === '(app)').length).toBe(1)
    expect(layouts.filter((r) => r.dirPath === 'de/(app)').length).toBe(1)
  })
})
