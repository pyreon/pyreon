import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectRoutePaths, writeRouteTypes } from '../route-types-gen'
import type { FileRoute } from '../types'

function route(partial: Partial<FileRoute> & Pick<FileRoute, 'urlPath'>): FileRoute {
  return {
    filePath: `${partial.urlPath}.tsx`,
    dirPath: '',
    depth: 0,
    isLayout: false,
    isError: false,
    isLoading: false,
    isNotFound: false,
    isCatchAll: false,
    renderMode: 'ssr',
    ...partial,
  }
}

describe('typed routes — collectRoutePaths', () => {
  it('keeps page routes, drops layout / error / loading / 404', () => {
    const routes: FileRoute[] = [
      route({ urlPath: '/' }),
      route({ urlPath: '/about' }),
      route({ urlPath: '/posts/:id' }),
      route({ urlPath: '/', isLayout: true }),
      route({ urlPath: '/oops', isError: true }),
      route({ urlPath: '/wait', isLoading: true }),
      route({ urlPath: '/missing', isNotFound: true }),
    ]
    expect(collectRoutePaths(routes)).toEqual(['/', '/about', '/posts/:id'])
  })

  it('returns [] when every route is a non-page boundary', () => {
    expect(
      collectRoutePaths([route({ urlPath: '/', isLayout: true }), route({ urlPath: '/x', isNotFound: true })]),
    ).toEqual([])
  })
})

describe('typed routes — writeRouteTypes (real fs-router scan)', () => {
  let root: string
  let routesDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-typed-routes-'))
    routesDir = join(root, 'src', 'routes')
    mkdirSync(routesDir, { recursive: true })
    writeFileSync(join(routesDir, 'index.tsx'), 'export default function Home() { return null }')
    writeFileSync(join(routesDir, 'about.tsx'), 'export default function About() { return null }')
    writeFileSync(join(routesDir, '_layout.tsx'), 'export default function Layout() { return null }')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('writes src/pyreon-routes.d.ts with the page paths, excluding the layout', async () => {
    const wrote = await writeRouteTypes(routesDir, root, 'ssr')
    expect(wrote).toBe(true)
    const out = join(root, 'src', 'pyreon-routes.d.ts')
    expect(existsSync(out)).toBe(true)
    const dts = readFileSync(out, 'utf-8')
    expect(dts).toContain('declare module "@pyreon/zero"')
    expect(dts).toContain('interface RegisteredRoutes')
    expect(dts).toContain('"/": Record<string, never>')
    expect(dts).toContain('"/about": Record<string, never>')
    // the layout file contributes no navigable path
    expect(dts).not.toMatch(/_layout/)
  })

  it('is a no-op (returns false) when nothing changed', async () => {
    expect(await writeRouteTypes(routesDir, root, 'ssr')).toBe(true)
    expect(await writeRouteTypes(routesDir, root, 'ssr')).toBe(false)
  })

  it('re-writes (returns true) after a route is added', async () => {
    await writeRouteTypes(routesDir, root, 'ssr')
    writeFileSync(join(routesDir, 'contact.tsx'), 'export default function Contact() { return null }')
    expect(await writeRouteTypes(routesDir, root, 'ssr')).toBe(true)
    const dts = readFileSync(join(root, 'src', 'pyreon-routes.d.ts'), 'utf-8')
    expect(dts).toContain('"/contact": Record<string, never>')
  })

  it('swallows a missing routes dir (returns false, no throw)', async () => {
    expect(await writeRouteTypes(join(root, 'does-not-exist'), root, 'ssr')).toBe(false)
  })
})
