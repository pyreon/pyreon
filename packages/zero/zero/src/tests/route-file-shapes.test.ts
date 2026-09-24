import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertRouteFileShapes, detectRouteExports, invalidateRouteScanCache, parseFileRoutes } from '../fs-router'
import { zeroPlugin } from '../vite-plugin'

function check(files: Record<string, string>): void {
  const exp = new Map(Object.entries(files).map(([f, src]) => [f, detectRouteExports(src, f)]))
  assertRouteFileShapes(parseFileRoutes(Object.keys(files), 'ssr', exp))
}

describe('route file shape diagnostics', () => {
  it('accepts well-formed pages, layouts and specials', () => {
    expect(() =>
      check({
        'index.tsx': 'export default function Home() { return null }',
        '_layout.tsx': 'export function layout() { return null }',
        '_error.tsx': 'const E = () => null\nexport { E as default }',
        'posts.tsx': 'export default () => null\nexport async function loader() { return 1 }',
        'feed.tsx': 'export default () => null\nexport const loader = async () => 1',
      }),
    ).not.toThrow()
  })

  it('WARNS (does not fail) for a route file without a default export — helpers colocate there', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(() => check({ 'about.tsx': 'export function About() { return null }' })).not.toThrow()
      expect(warn.mock.calls.flat().join(' ')).toMatch(/"about\.tsx" has no default export/)
    } finally {
      warn.mockRestore()
    }
  })

  it('names a default-only layout (layouts use the `layout` export)', () => {
    expect(() => check({ '_layout.tsx': 'export default function L() { return null }' })).toThrow(
      /"_layout\.tsx": a _layout file must `export function layout\(\)`.*default export is not used/s,
    )
  })

  it('names a literal (non-callable) loader', () => {
    expect(() => check({ 'p.tsx': "export default () => null\nexport const loader = { data: 1 }" })).toThrow(
      /"p\.tsx": `loader` is a value, not a function/,
    )
  })
})

describe('shipped entry: the routes virtual module fails naming the file', () => {
  const ROOT = join(__dirname, '.tmp-route-shapes')
  afterEach(() => {
    invalidateRouteScanCache()
    rmSync(ROOT, { recursive: true, force: true })
  })

  it('zero plugin load() rejects instead of serving an app that spins', async () => {
    mkdirSync(join(ROOT, 'src', 'routes'), { recursive: true })
    writeFileSync(join(ROOT, 'src', 'routes', 'about.ts'), 'export default () => null\nexport const loader = { a: 1 }\n')
    const main = zeroPlugin({ mode: 'spa' }).find((p) => p.name === 'pyreon-zero')!
    const hook = <T>(h: unknown) => (typeof h === 'function' ? h : (h as { handler: T }).handler) as T
    hook<(c: unknown) => void>(main.configResolved).call(main, {
      root: ROOT,
      plugins: [{ name: 'pyreon' }],
      server: {},
      define: {},
      base: '/',
      build: {},
    })
    const load = hook<(id: string, o?: unknown) => Promise<unknown>>(main.load)
    const id = hook<(id: string) => string>(main.resolveId).call(main, 'virtual:zero/routes')
    await expect(load.call(main, id, {})).rejects.toThrow(/"about\.ts": `loader` is a value/)
  })
})
