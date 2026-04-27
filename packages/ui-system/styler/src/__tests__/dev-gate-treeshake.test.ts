import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '..')

// Bundle-level regression test for the styler dev-gate fix.
//
// Background — the shape of the problem:
//   `process.env.NODE_ENV !== 'production'` is dead code in real Vite
//   browser bundles because Vite does not polyfill `process`. The
//   `console.warn` calls inside the gate were silently dropped in
//   production, which masked malformed-CSS bugs (insertRule failures
//   produced no diagnostic — empty <style> tag, classes assigned, no
//   console output).
//
// The fix is to use bundler-agnostic `process.env.NODE_ENV !== 'production'`
// — every modern bundler auto-replaces `process.env.NODE_ENV` at consumer
// build time. This test bundles `sheet.ts` through Vite's production build
// and asserts the dev-warning strings are GONE. It also bundles in dev
// mode and asserts the strings are PRESENT, so a source-level deletion
// can't trivially pass the prod test.
//
// Mirrors `packages/core/runtime-dom/src/tests/dev-gate-treeshake.test.ts`.

const DEV_WARNING_STRINGS = [
  '[styler] Failed to insert CSS rule:',
  '[styler] Failed to insert @keyframes rule:',
  '[styler] Failed to insert global CSS rule:',
]

async function bundleWithVite(entry: string, dev: boolean): Promise<string> {
  const outDir = mkdtempSync(path.join(tmpdir(), 'pyreon-styler-treeshake-'))
  try {
    await build({
      mode: dev ? 'development' : 'production',
      logLevel: 'error',
      configFile: false,
      resolve: { conditions: ['bun'] },
      define: {
        'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
      },
      build: {
        // PINNED minifier — see runtime-dom's tree-shake test for rationale.
        minify: dev ? false : 'esbuild',
        target: 'esnext',
        write: true,
        outDir,
        emptyOutDir: true,
        lib: {
          entry,
          formats: ['es'],
          fileName: 'out',
        },
        rollupOptions: {
          external: [],
        },
      },
    })
    return readFileSync(path.join(outDir, 'out.js'), 'utf8')
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

describe('styler dev-warning gate (Vite production bundle)', () => {
  it('sheet.ts → dev warnings eliminated in Vite production bundle', async () => {
    const code = await bundleWithVite(path.join(SRC, 'sheet.ts'), false)
    for (const warn of DEV_WARNING_STRINGS) {
      expect(code, `"${warn}" survived prod tree-shake`).not.toContain(warn)
    }
    expect(code.length).toBeGreaterThan(0)
  }, 10000)

  it('sheet.ts → dev warnings PRESERVED in Vite dev bundle (sanity)', async () => {
    const code = await bundleWithVite(path.join(SRC, 'sheet.ts'), true)
    for (const warn of DEV_WARNING_STRINGS) {
      expect(code, `"${warn}" missing from dev bundle (did source change?)`).toContain(warn)
    }
  }, 10000)
})
