/**
 * Real-build integration tests for the SSR/SSG post-step ownership +
 * adapter failure semantics (the 0.43.x `zero build` duplicate-owner /
 * silent-swallow defect, fixed by making the plugin the ONE owner).
 *
 * Runs ACTUAL `vite build`s of the `fixture-build` app with the zero
 * plugin chain constructed inline from src (`configFile: false`), so
 * the plugin code under test is always the current source — no lib/
 * staleness. Asserts:
 *
 *   1. Happy path (auto node adapter): ONE server bundle at
 *      `dist/server/entry-server.js`, `template.html` staged next to
 *      it carrying the hashed production script, adapter artifacts
 *      staged once into the same tree.
 *   2. An EXPLICITLY-configured adapter whose `build()` throws FAILS
 *      the build (`vite build` rejects) — pre-fix the error was
 *      console-only and the build stayed green with no deploy
 *      artifact (the catalogued "silent-filter" shape).
 *   3. An AUTO-selected adapter whose `build()` throws stays NON-fatal
 *      (console.error + build resolves) — the SSR bundle itself landed
 *      and is usable; the user never asked for adapter output.
 *   4. Same explicit-adapter contract for `mode: 'ssg'`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'
import type { Adapter, ZeroConfig } from '../../types'

// Controllable resolveAdapter override for the AUTO-selected-adapter
// test (config.adapter unset ⇒ resolveAdapter picks node; forcing a
// throwing adapter through the real config isn't possible without
// setting config.adapter, which would make it EXPLICIT). All other
// tests leave `forcedAdapter` null → real behavior.
let forcedAdapter: Adapter | null = null
vi.mock('../../adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../adapters')>()
  return {
    ...actual,
    resolveAdapter: (config: ZeroConfig) =>
      forcedAdapter ?? actual.resolveAdapter(config),
  }
})

const FIXTURE = resolve(import.meta.dirname, 'fixture-build')
const DIST = join(FIXTURE, 'dist')

async function buildFixture(zeroConfig: ZeroConfig): Promise<void> {
  await build({
    root: FIXTURE,
    configFile: false,
    logLevel: 'error',
    plugins: zeroPlugin(zeroConfig),
    resolve: { conditions: ['bun'] },
    build: { outDir: 'dist', emptyOutDir: true },
  })
}

beforeEach(async () => {
  forcedAdapter = null
  await rm(DIST, { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await rm(DIST, { recursive: true, force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssr-entry.js'), { force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssg-entry.js'), { force: true })
})

describe('SSR post-step — plugin as the single owner', () => {
  it(
    'mode "ssr" (auto node adapter): server bundle + template.html + adapter artifacts in ONE tree',
    async () => {
      await buildFixture({ mode: 'ssr' })

      // Server bundle at the canonical location.
      const serverEntry = join(DIST, 'server', 'entry-server.js')
      expect(existsSync(serverEntry)).toBe(true)

      // Production template staged NEXT to the entry, carrying the
      // hashed client script — not the dev `/src/entry-client.ts`
      // fallback (which would server-render but never hydrate).
      const template = join(DIST, 'server', 'template.html')
      expect(existsSync(template)).toBe(true)
      const html = readFileSync(template, 'utf-8')
      expect(html).toContain('/assets/')
      expect(html).not.toContain('/src/entry-client.ts')

      // Node adapter staged once, into the same tree.
      expect(existsSync(join(DIST, 'index.js'))).toBe(true)
      expect(existsSync(join(DIST, 'client', 'index.html'))).toBe(true)
      // No divergent second tree.
      expect(existsSync(join(DIST, 'output'))).toBe(false)
    },
    120_000,
  )

  it(
    'mode "ssr": an EXPLICITLY-configured adapter failure fails the build',
    async () => {
      const boom: Adapter = {
        name: 'boom',
        async build() {
          throw new Error('explicit adapter boom')
        },
        async revalidate() {
          return { regenerated: false }
        },
      }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(buildFixture({ mode: 'ssr', adapter: boom })).rejects.toThrow(
        'explicit adapter boom',
      )
      // The failure is also named on stderr before the throw.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Adapter "boom" failed: explicit adapter boom'),
      )
      // The SSR bundle itself landed before the adapter ran — still on disk.
      expect(existsSync(join(DIST, 'server', 'entry-server.js'))).toBe(true)
    },
    120_000,
  )

  it(
    'mode "ssr": an AUTO-selected adapter failure surfaces but stays non-fatal',
    async () => {
      forcedAdapter = {
        name: 'auto-boom',
        async build() {
          throw new Error('auto adapter boom')
        },
        async revalidate() {
          return { regenerated: false }
        },
      }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // config.adapter UNSET → auto-selected → non-fatal.
      await expect(buildFixture({ mode: 'ssr' })).resolves.toBeUndefined()
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Adapter "auto-boom" failed: auto adapter boom'),
      )
      // The SSR bundle + template are intact and usable by hand-deploys.
      expect(existsSync(join(DIST, 'server', 'entry-server.js'))).toBe(true)
      expect(existsSync(join(DIST, 'server', 'template.html'))).toBe(true)
    },
    120_000,
  )
})

describe('SSG post-step — explicit-adapter failure semantics', () => {
  it(
    'mode "ssg": an EXPLICITLY-configured adapter failure fails the build',
    async () => {
      const boom: Adapter = {
        name: 'ssg-boom',
        async build() {
          throw new Error('ssg adapter boom')
        },
        async revalidate() {
          return { regenerated: false }
        },
      }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(buildFixture({ mode: 'ssg', adapter: boom })).rejects.toThrow(
        'ssg adapter boom',
      )
      // Diagnostics printed before the throw (the adapter failure rides
      // the established errors[] pipeline).
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('(adapter:ssg-boom)'),
        expect.anything(),
      )
      // The prerendered page itself landed BEFORE the adapter ran — the
      // route's SSR'd content is baked into the HTML (proves the throw
      // came from the adapter step, not from an earlier prerender
      // failure), so the dist is diagnosable.
      expect(readFileSync(join(DIST, 'index.html'), 'utf-8')).toContain(
        'Hello from the SSR post-step fixture',
      )
    },
    120_000,
  )
})
