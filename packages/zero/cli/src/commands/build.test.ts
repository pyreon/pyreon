/**
 * End-invariant regression tests for `zero build` — the single-owner
 * SSR pipeline (the 0.43.x duplicate-post-step defect).
 *
 * Pre-fix, `zero build` ran a SECOND owner on top of the zero plugin:
 * its own `vite build --ssr → dist/server` pass, its own prerender
 * pass, and its own `adapter.build() → dist/output`, each in a bare
 * swallow-all `catch`. Observed against this exact fixture:
 *
 *   - zero-config (no user `src/entry-server.ts`): NO `dist/server`,
 *     NO `dist/output` (the adapter's validate throw was swallowed),
 *     the plugin's post-step buried at `dist/client/server/...` plus a
 *     nested `dist/client/client/` adapter tree — and a green
 *     "Build completed".
 *   - with a user entry: FOUR copies of `entry-server.js` across
 *     `dist/client/server`, `dist/server`, `dist/output/server`,
 *     `dist/output/client/server`; the deployed `dist/output` server
 *     had NO `template.html` next to its entry, so it served
 *     `src="/src/entry-client.ts"` (the DEV template fallback) and the
 *     page never hydrated in production.
 *
 * Post-fix the CLI delegates the ENTIRE pipeline to the plugin (one
 * `vite build`), and these tests lock the end invariants: exactly ONE
 * server bundle, `template.html` next to THE deployed entry (carrying
 * the hashed production script, not the dev entry), the adapter staged
 * ONCE into ONE tree, and no `dist/output` / nested duplicate trees.
 *
 * NOTE (lib-needing): the fixture's `vite.config.ts` is loaded by a
 * real `loadConfigFromFile`, which resolves `@pyreon/zero/server` via
 * the Node condition → `packages/zero/zero/lib/`. A stale lib tests
 * stale plugin code — `bun scripts/bootstrap.ts` refreshes it (CI's
 * test cells restore the Bootstrap job's lib/ output).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { build, runBuild } from './build'

const FIXTURE = resolve(import.meta.dirname, '__fixtures__', 'ssr-app')
const DIST = join(FIXTURE, 'dist')

/** Recursively collect files named `name` under `dir`. */
function findFilesNamed(dir: string, name: string): string[] {
  if (!existsSync(dir)) return []
  const hits: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      hits.push(...findFilesNamed(full, name))
    } else if (entry === name) {
      hits.push(full)
    }
  }
  return hits
}

afterAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  // Synthetic SSR entry is cleaned by the plugin's finally; sweep it in
  // case a crashed run left it behind.
  await rm(join(FIXTURE, '__pyreon-zero-ssr-entry.js'), { force: true })
})

describe('zero build — single-owner SSR pipeline end invariants', () => {
  it(
    'zero-config SSR app: one delegated build produces the full deployable tree',
    async () => {
      await rm(DIST, { recursive: true, force: true })

      await runBuild(FIXTURE)

      // Invariant 1 — exactly ONE server bundle in the whole tree.
      // Pre-fix: 0 copies for zero-config apps at the documented
      // locations (post-step buried under dist/client/server), and 4
      // copies with a user entry.
      const serverBundles = findFilesNamed(DIST, 'entry-server.js')
      expect(serverBundles).toEqual([join(DIST, 'server', 'entry-server.js')])

      // Invariant 2 — template.html sits NEXT TO the deployed entry.
      const template = join(DIST, 'server', 'template.html')
      expect(existsSync(template)).toBe(true)

      // Invariant 3 — the staged template is the BUILT client
      // index.html (hashed production script), not the dev shell. A
      // server booted from this tree hydrates; the dev fallback
      // (`/src/entry-client.ts`) 404s in production and never hydrates.
      const templateHtml = readFileSync(template, 'utf-8')
      expect(templateHtml).toContain('/assets/')
      expect(templateHtml).not.toContain('/src/entry-client.ts')

      // Invariant 4 — the adapter ran ONCE into ONE tree: the node
      // adapter's runner + staged client copy live at the dist root,
      // and the runner points at THE server bundle from invariant 1.
      expect(existsSync(join(DIST, 'index.js'))).toBe(true)
      expect(readFileSync(join(DIST, 'index.js'), 'utf-8')).toContain('./server/entry-server.js')
      expect(existsSync(join(DIST, 'client', 'index.html'))).toBe(true)

      // Invariant 5 — the duplicated trees of the two-owner flow are
      // GONE: no `dist/output`, no plugin post-step nested under a
      // client subdir, no `dist/client/client`.
      expect(existsSync(join(DIST, 'output'))).toBe(false)
      expect(existsSync(join(DIST, 'client', 'server'))).toBe(false)
      expect(existsSync(join(DIST, 'client', 'client'))).toBe(false)

      // Invariant 6 — the synthetic SSR entry was cleaned up.
      expect(existsSync(join(FIXTURE, '__pyreon-zero-ssr-entry.js'))).toBe(false)
    },
    180_000,
  )

  it('build failures surface: console.error + non-zero exit (no swallow)', async () => {
    // A project whose vite.config.ts throws — the build must NOT
    // report success. Pre-fix shape: per-step bare `catch {}` blocks
    // turned missing-artifact failures into a green "Build completed".
    const dir = await mkdtemp(join(tmpdir(), 'zero-cli-broken-'))
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called')
    }) as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await writeFile(join(dir, 'vite.config.ts'), 'throw new Error("broken config")\n')
      await expect(build(dir)).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(errorSpy).toHaveBeenCalledWith('Build failed:', expect.stringContaining('broken config'))
    } finally {
      exitSpy.mockRestore()
      errorSpy.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
