/**
 * Build-summary integration — a REAL vite build of the fixture app, asserting
 * the branded end-of-build summary prints EXACTLY ONCE per top-level build:
 *
 *   - hybrid ssr builds run zero's recursive inner sub-builds, whose
 *     re-instantiated plugin chains include buildSummaryPlugin too — the
 *     `build.ssr` / `innerBuildFlagSet()` gates must keep those silent
 *     (the "exactly once" assertions are the lock);
 *   - `buildSummary: false` opts out entirely.
 *
 * Bisect-verified: removing the gates in buildSummaryPlugin.closeBundle
 * multiplies the "Build complete" count; removing the plugin zeroes it.
 */
import { cp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'
import type { ZeroConfig } from '../../types'

// A PRIVATE COPY of the shared fixture: vitest runs test FILES in parallel,
// and building the shared fixture-build/ root directly races
// build-post-step.test.ts on dist/ AND on the nested-build temp entry files
// (__pyreon-zero-ssr-entry.js) written into the fixture root. The copy is a
// SIBLING directory (not a tmpdir) so node_modules resolution for the nested
// ssr-entry's `@pyreon/zero/server` import walks up into the monorepo exactly
// like the original. Gitignored; removed in afterAll.
const FIXTURE_SRC = resolve(import.meta.dirname, 'fixture-build')
const FIXTURE = resolve(import.meta.dirname, 'fixture-build-summary-run')
const DIST = join(FIXTURE, 'dist')

async function buildFixture(zeroConfig: ZeroConfig & { buildSummary?: boolean }): Promise<string[]> {
  const lines: string[] = []
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  try {
    await build({
      root: FIXTURE,
      configFile: false,
      logLevel: 'error',
      plugins: zeroPlugin(zeroConfig),
      resolve: { conditions: ['bun'] },
      build: { outDir: 'dist', emptyOutDir: true },
    })
  } finally {
    logSpy.mockRestore()
  }
  return lines
}

beforeAll(async () => {
  await rm(FIXTURE, { recursive: true, force: true })
  await cp(FIXTURE_SRC, FIXTURE, { recursive: true })
})

beforeEach(async () => {
  await rm(DIST, { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await rm(FIXTURE, { recursive: true, force: true })
})

describe('build summary — real build', () => {
  it(
    'mode "ssr": prints the summary exactly once, with assets + server bundle',
    async () => {
      const lines = await buildFixture({ mode: 'ssr' })
      const text = lines.join('\n')

      expect(text).toContain('▲ pyreon zero')
      expect(text).toContain('Client assets')
      expect(text).toContain('gzip')
      expect(text).toContain('Server bundle')
      expect(text).toContain('server/entry-server.js')

      // EXACTLY once — the recursive inner sub-builds' plugin chains carry
      // their own buildSummaryPlugin and must stay silent.
      const completions = lines.filter((l) => l.includes('Build complete'))
      expect(completions).toHaveLength(1)
    },
    120_000,
  )

  it(
    'buildSummary: false opts out',
    async () => {
      const lines = await buildFixture({ mode: 'ssr', buildSummary: false })
      const text = lines.join('\n')
      expect(text).not.toContain('▲ pyreon zero')
      expect(text).not.toContain('Build complete')
    },
    120_000,
  )
})
