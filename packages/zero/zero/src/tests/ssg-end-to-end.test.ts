/**
 * End-to-end SSG smoke test. Programmatically runs Vite build with `mode:
 * "ssg"` against the real `examples/ssr-showcase` project (which has a
 * complete fs-router setup, layouts, api routes, and multiple pages —
 * exercising every code path the unit tests can't). Asserts:
 *
 *   1. `dist/index.html` exists with home content
 *   2. `dist/about/index.html` exists with about-route content (NOT home)
 *   3. The two HTML files differ — equal output indicates the per-path
 *      router URL isn't being respected (the createServer/createApp
 *      single-router-instance bug this PR fixed for SSG)
 *   4. Cleanup directories are gone after the build
 *
 * This is the regression guard for: api-route filter, middleware-export
 * filter, fresh-router-per-path, file-based synthetic SSR entry, and
 * index.html template injection. Each of these had to be discovered by
 * actually running the build against a real app — none of the unit tests
 * caught them.
 *
 * Skipped in CI because it requires the example to be built/installed and
 * spawns a real Vite build (~5-10s). Run manually:
 *   PYREON_SSG_E2E=1 bun run --cwd packages/zero/zero test ssg-end-to-end
 */

import { existsSync, readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const SHOWCASE_DIR = resolve(here, '../../../../../examples/ssr-showcase')
const SSR_SHOWCASE_VITE_CONFIG = join(SHOWCASE_DIR, 'vite.config.ts')

const ENABLED = process.env.PYREON_SSG_E2E === '1'

// Restore the showcase vite.config.ts we temporarily overwrote — defensive
// even if the test errored out mid-run.
afterAll(async () => {
  if (!ENABLED) return
  const original = `import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon(), zero()],
})
`
  if (existsSync(SSR_SHOWCASE_VITE_CONFIG)) {
    await writeFile(SSR_SHOWCASE_VITE_CONFIG, original, 'utf-8')
  }
  // Best-effort cleanup of dist + synthetic entry.
  await rm(join(SHOWCASE_DIR, 'dist'), { recursive: true, force: true })
  await rm(join(SHOWCASE_DIR, '__pyreon-zero-ssg-entry.js'), { force: true })
})

describe('zero SSG end-to-end (against examples/ssr-showcase)', () => {
  it.runIf(ENABLED && existsSync(SHOWCASE_DIR))(
    'mode: "ssg" produces per-route HTML with route-correct content',
    async () => {
      // Override vite.config.ts to enable SSG mode + paths.
      await writeFile(
        SSR_SHOWCASE_VITE_CONFIG,
        `import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon(), zero({ mode: 'ssg', ssg: { paths: ['/', '/about'] } })],
})
`,
        'utf-8',
      )

      // Wipe any prior dist before building.
      await rm(join(SHOWCASE_DIR, 'dist'), { recursive: true, force: true })

      // Run Vite build programmatically.
      const { build } = await import('vite')
      await build({
        root: SHOWCASE_DIR,
        mode: 'production',
        logLevel: 'error',
      })

      const distDir = join(SHOWCASE_DIR, 'dist')

      // 1. Client index.html (root path) must exist.
      const indexPath = join(distDir, 'index.html')
      expect(existsSync(indexPath), `${indexPath} should exist`).toBe(true)

      // 2. /about must exist as a separate file.
      const aboutPath = join(distDir, 'about', 'index.html')
      expect(existsSync(aboutPath), `${aboutPath} should exist`).toBe(true)

      // 3. Content must be route-correct.
      const aboutHtml = readFileSync(aboutPath, 'utf-8')
      const indexHtml = readFileSync(indexPath, 'utf-8')

      expect(aboutHtml).toContain('about-page')
      expect(aboutHtml).toContain('Pyreon is a signal-based UI framework')
      expect(indexHtml).toContain('home-page')
      expect(indexHtml).toContain('SSR Showcase')

      // 4. The two files must differ — a single shared output indicates
      //    the per-path router URL isn't being respected (the createServer
      //    bug this PR fixed for SSG).
      expect(aboutHtml).not.toEqual(indexHtml)

      // 5. Cleanup paths must be gone.
      expect(existsSync(join(distDir, '.zero-ssg-server'))).toBe(false)
      expect(existsSync(join(SHOWCASE_DIR, '__pyreon-zero-ssg-entry.js'))).toBe(false)
    },
    120_000,
  )

  it.runIf(!ENABLED)('skipped without PYREON_SSG_E2E=1', () => {
    expect(true).toBe(true)
  })
})
