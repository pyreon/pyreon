/**
 * zero's half of `globalThis.__PYREON_ROUTER_LOADERS__`:
 *
 *   - `routesDeclareLoadersSync` — the scan that decides the value, which must
 *     answer `true` for every doubt (a wrong `false` breaks a page);
 *   - the plugin's `config()` — defines it for `vite build` only, and never
 *     over a value the user set;
 *   - `createApp` — refuses to start when loaders were compiled out but the
 *     real route table has one (a route defined outside src/routes);
 *   - a real Vite/Rolldown build — the engine actually leaves the bundle.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { routesDeclareLoadersSync } from '../fs-router'

const fs = { existsSync, readdirSync, readFileSync, statSync }
const vitePluginModulePromise = import('../vite-plugin')
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  delete (globalThis as { __PYREON_ROUTER_LOADERS__?: boolean }).__PYREON_ROUTER_LOADERS__
})

/** A project root whose src/routes holds `files` (relative path → source). */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'zero-loaders-flag-'))
  dirs.push(root)
  for (const [rel, src] of Object.entries(files)) {
    const full = join(root, 'src/routes', rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, src)
  }
  return root
}

const PAGE = 'export default function P() { return null }\n'
const WITH_LOADER = `export const loader = async () => 1\n${PAGE}`

describe('routesDeclareLoadersSync', () => {
  it('is false when no route declares a loader', () => {
    const root = project({ 'index.tsx': PAGE, 'about.tsx': PAGE, '_layout.tsx': PAGE })
    expect(routesDeclareLoadersSync(join(root, 'src/routes'), fs)).toBe(false)
  })

  it('is true for a page loader, however deep', () => {
    const root = project({ 'index.tsx': PAGE, 'blog/[slug].tsx': WITH_LOADER })
    expect(routesDeclareLoadersSync(join(root, 'src/routes'), fs)).toBe(true)
  })

  it('is true for a layout loader', () => {
    const root = project({ 'index.tsx': PAGE, '_layout.tsx': WITH_LOADER })
    expect(routesDeclareLoadersSync(join(root, 'src/routes'), fs)).toBe(true)
  })

  it('is true for a .server.ts server-loader sibling', () => {
    const root = project({
      'index.tsx': PAGE,
      'index.server.ts': 'export const loader = async () => 1\n',
    })
    expect(routesDeclareLoadersSync(join(root, 'src/routes'), fs)).toBe(true)
  })

  it('is true when the routes directory is missing (routes defined elsewhere)', () => {
    const root = project({})
    expect(routesDeclareLoadersSync(join(root, 'src/routes'), fs)).toBe(true)
  })

  it('is true when a route file cannot be read', () => {
    const root = project({ 'index.tsx': PAGE })
    const unreadable = {
      ...fs,
      readFileSync: (() => {
        throw new Error('EACCES')
      }) as never,
    }
    expect(routesDeclareLoadersSync(join(root, 'src/routes'), unreadable)).toBe(true)
  })
})

describe('zero plugin — __PYREON_ROUTER_LOADERS__ define', () => {
  const KEY = 'globalThis.__PYREON_ROUTER_LOADERS__'
  async function configFor(root: string, command: 'build' | 'serve', define?: object) {
    const { zeroPlugin } = await vitePluginModulePromise
    const plugins = zeroPlugin()
    const plugin = (Array.isArray(plugins) ? plugins[0] : plugins) as {
      config: (c: object, e: object) => { define: Record<string, string> }
    }
    return plugin.config({ root, ...(define ? { define } : {}) }, { command, mode: 'production' })
      .define
  }

  it('defines false in a build whose routes declare no loader', async () => {
    const d = await configFor(project({ 'index.tsx': PAGE }), 'build')
    expect(d[KEY]).toBe('false')
  })

  it('defines true in a build whose routes declare a loader', async () => {
    const d = await configFor(project({ 'index.tsx': WITH_LOADER }), 'build')
    expect(d[KEY]).toBe('true')
  })

  it('leaves dev alone, so adding a loader mid-session needs no restart', async () => {
    const d = await configFor(project({ 'index.tsx': PAGE }), 'serve')
    expect(KEY in d).toBe(false)
  })

  it('never overrides a value the user defined', async () => {
    const d = await configFor(project({ 'index.tsx': PAGE }), 'build', { [KEY]: 'true' })
    expect(KEY in d).toBe(false)
  })
})

describe('createApp — loaders compiled out but a route has one', () => {
  const Page = () => null
  const set = (v: boolean) => {
    ;(globalThis as { __PYREON_ROUTER_LOADERS__?: boolean }).__PYREON_ROUTER_LOADERS__ = v
  }

  it('throws, naming the fix, for a loader the scan could not see', () => {
    set(false)
    expect(() =>
      createApp({ routes: [{ path: '/', component: Page, loader: async () => 1 }] }),
    ).toThrow(/__PYREON_ROUTER_LOADERS__/)
  })

  it('throws for a nested loader and for a server-loader marker', () => {
    set(false)
    expect(() =>
      createApp({
        routes: [
          {
            path: '/',
            component: Page,
            children: [{ path: 'a', component: Page, loader: async () => 1 }],
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      createApp({ routes: [{ path: '/', component: Page, hasServerLoader: true }] }),
    ).toThrow()
  })

  it('starts normally when no route has a loader, or when loaders are on', () => {
    set(false)
    expect(() => createApp({ routes: [{ path: '/', component: Page }] })).not.toThrow()
    set(true)
    expect(() =>
      createApp({ routes: [{ path: '/', component: Page, loader: async () => 1 }] }),
    ).not.toThrow()
  })
})

describe('real Vite build — the engine leaves the bundle', () => {
  // Markers minification cannot rename: `?path=` is the single-fetch query,
  // which exists only in the router's loader engine; `pendingMinMs` is read
  // only by PendingLoader, on the component side's loader render path.
  async function bundle(value: string | undefined): Promise<string> {
    const { build } = await import('vite')
    const dir = mkdtempSync(join(PKG, '.loaders-flag-'))
    dirs.push(dir)
    const entry = join(dir, 'entry.ts')
    writeFileSync(
      entry,
      `import { createRouter, RouterLink, RouterView } from '@pyreon/router'\nexport const r = [createRouter, RouterLink, RouterView]\n`,
    )
    const out = (await build({
      configFile: false,
      root: dir,
      logLevel: 'silent',
      resolve: { conditions: ['bun', 'import', 'module', 'browser', 'default'] },
      define: {
        'process.env.NODE_ENV': '"production"',
        ...(value === undefined ? {} : { 'globalThis.__PYREON_ROUTER_LOADERS__': value }),
      },
      build: {
        write: false,
        minify: true,
        lib: { entry, formats: ['es'], fileName: 'out' },
        rollupOptions: { external: [/^@pyreon\/(?!router)/, /^@pyreon\/router\/.+/] },
      },
    })) as
      | { output: { type: string; code?: string }[] }[]
      | { output: { type: string; code?: string }[] }
    const outputs = Array.isArray(out) ? out : [out]
    return outputs
      .flatMap((o) => o.output)
      .map((c) => c.code ?? '')
      .join('\n')
  }

  it('keeps the engine when the flag is unset or true', async () => {
    for (const code of [await bundle(undefined), await bundle('true')]) {
      expect(code).toContain('?path=')
      expect(code).toContain('pendingMinMs')
    }
  }, 60_000)

  it('drops the engine when the flag is false', async () => {
    const code = await bundle('false')
    // createRouter itself survived (its default trailingSlash literal) — only the engine went.
    expect(code).toContain('strip')
    expect(code).not.toContain('?path=')
    expect(code).not.toContain('pendingMinMs')
  }, 60_000)
})
