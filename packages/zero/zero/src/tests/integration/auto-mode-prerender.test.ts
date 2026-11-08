/**
 * Real-build regression: every route whose RESOLVED render mode is static
 * prerenders, however that mode was reached — inferred by `mode: 'auto'`,
 * set by a `routeRules` glob, or declared in the file.
 *
 * The hybrid pass (app mode 'ssr'/'isr') used to be gated by a scan for a
 * literal `export const renderMode = 'ssg' | 'spa'` in some route file. An
 * app whose static routes were inferred (`mode: 'auto'`) or rule-declared
 * had no such literal, so the gate skipped the pass: the build's mode
 * table printed `○ ssg` for those routes while dist/ held no HTML for them
 * and they fell back to SSR at runtime. Separately, `applyModeInference`
 * stamped the inferred mode on every undeclared page as if the FILE had
 * declared it, so it beat a `routeRules` entry the mode table honoured.
 *
 * Runs actual `vite build`s of `fixture-auto-mode` with the zero plugin
 * built inline from src (`configFile: false`), so the code under test is
 * the current source.
 */
import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { zeroPlugin, type ZeroUserConfig } from '../../vite-plugin'

const FIXTURE = resolve(import.meta.dirname, 'fixture-auto-mode')
const DIST = join(FIXTURE, 'dist')

async function buildFixture(zeroConfig: ZeroUserConfig): Promise<void> {
  // `mode: 'auto'` resolves the app pipeline from `<cwd>/src/routes` at
  // plugin-factory time, so the fixture has to be the cwd while the plugin
  // array is built (vitest workers cannot `process.chdir`).
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(FIXTURE)
  let plugins: ReturnType<typeof zeroPlugin>
  try {
    plugins = zeroPlugin(zeroConfig)
  } finally {
    cwd.mockRestore()
  }
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    plugins,
    resolve: { conditions: ['bun'] },
    build: { outDir: 'dist', emptyOutDir: true },
  })
}

const NOT_PRERENDERED = '(no prerendered HTML for this URL)'

/** The prerendered page for a URL, or {@link NOT_PRERENDERED}. */
function prerendered(urlPath: string): string {
  const file = join(DIST, 'client', ...urlPath.split('/').filter(Boolean), 'index.html')
  return existsSync(file) ? readFileSync(file, 'utf-8') : NOT_PRERENDERED
}

function ssgManifest(): string[] {
  const file = join(DIST, 'client', '_pyreon-ssg-paths.json')
  if (!existsSync(file)) return []
  return (JSON.parse(readFileSync(file, 'utf-8')) as { paths: string[] }).paths
}

beforeEach(async () => {
  await rm(DIST, { recursive: true, force: true })
  // The mode table and the "mode: 'auto' → 'ssr'" banner are noise here.
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssr-entry.js'), { force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssg-entry.js'), { force: true })
})

describe('hybrid prerender follows the resolved per-route mode', () => {
  it("mode 'auto': inferred-ssg routes prerender, inferred-ssr routes do not, routeRules beat inference", async () => {
    await buildFixture({ mode: 'auto', routeRules: { '/ruled': { renderMode: 'ssg' } } })

    // A loader exists, so the app pipeline is the server one.
    expect(existsSync(join(DIST, 'server', 'entry-server.js'))).toBe(true)

    // No loader → inferred 'ssg' → prerendered with its content.
    expect(prerendered('/')).toContain('AUTO_INFERRED_SSG_HOME')
    // getStaticPaths wins over the loader → inferred 'ssg' → prerendered.
    expect(prerendered('/blog/hello')).toContain('AUTO_INFERRED_SSG_POST')
    // A routeRules entry outranks inference (file > rule > inferred).
    expect(prerendered('/ruled')).toContain('RULE_DECLARED_SSG')
    // Loader → inferred 'ssr' → served by the server, not prerendered.
    expect(prerendered('/posts')).toBe(NOT_PRERENDERED)

    // The runtime serves static-first from this manifest.
    expect(ssgManifest().sort()).toEqual(['/', '/blog/hello', '/ruled'])
  }, 180_000)

  it("mode 'ssr': a routeRules 'ssg' entry prerenders with no renderMode export anywhere", async () => {
    // Runs AFTER the 'auto' build in the same process on purpose: the SSG
    // pass imports the freshly built renderer, and an import keyed only on
    // its path returned the previous build's module (every route stamped
    // by the 'auto' build) — the manifest then listed '/' and
    // '/blog/hello' too.
    await buildFixture({ mode: 'ssr', routeRules: { '/ruled': { renderMode: 'ssg' } } })

    expect(prerendered('/ruled')).toContain('RULE_DECLARED_SSG')
    expect(prerendered('/posts')).toBe(NOT_PRERENDERED)
    expect(ssgManifest()).toEqual(['/ruled'])
  }, 180_000)
})
