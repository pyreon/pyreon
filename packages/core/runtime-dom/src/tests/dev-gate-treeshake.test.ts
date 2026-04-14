import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '..')

// Bundle-level regression test for the T1.1 C-2 finding.
//
// Background — the shape of the problem from PR #227 bring-up:
//   Raw `esbuild --minify` preserves chained `__DEV__ && cond &&
//   console.warn(...)` patterns even when `import.meta.env.DEV` is
//   defined to `false`. That tempted a pattern-rewrite across all
//   Pyreon sources.
//
// What the C-2 investigation actually found:
//   Pyreon's real consumer path is Vite (which uses Rolldown under the
//   hood plus its own import.meta.env replacement + tree-shake passes).
//   Vite's production build DOES eliminate the chained patterns
//   correctly — the raw esbuild baseline was misleading. Raw Rolldown
//   alone also doesn't replicate Vite's behavior because Rolldown's
//   `define` doesn't rewrite optional-chain access paths.
//
// This test bundles a runtime-dom entry through Vite's production
// build and asserts dev-warning strings are GONE. If Vite's handling
// ever regresses, this catches it.
//
// Scope note: the existing `dev-gate-pattern.test.ts` is the cheap
// source-level guard (grep for `typeof process`, require `import.meta.env.DEV`).
// This test is the expensive end-to-end guard for the bundle path.

interface FileContract {
  file: string
  /** Dev-warning strings that MUST be eliminated from the prod bundle. */
  devWarningStrings: string[]
}

const FILES_UNDER_TEST: FileContract[] = [
  {
    file: 'nodes.ts',
    devWarningStrings: [
      '[Pyreon] <For> `by` function returned null/undefined',
      '[Pyreon] Duplicate key',
    ],
  },
]

async function bundleWithVite(entry: string, dev: boolean): Promise<string> {
  const outDir = mkdtempSync(path.join(tmpdir(), 'pyreon-vite-treeshake-'))
  try {
    // Vite library-mode build with explicit minify. `define` on
    // `import.meta.env` isn't usually needed (Vite sets it automatically
    // based on mode), but `mode: 'production'` flips DEV to false.
    await build({
      mode: dev ? 'development' : 'production',
      logLevel: 'error',
      configFile: false,
      resolve: { conditions: ['bun'] },
      // Explicit define — Vite in lib mode doesn't always apply the
      // default production env replacement, so we set it ourselves.
      define: {
        'import.meta.env.DEV': JSON.stringify(dev),
        'import.meta.env': JSON.stringify({ DEV: dev, PROD: !dev, MODE: dev ? 'development' : 'production' }),
      },
      build: {
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
        // Bundle everything — we want the tested file's strings visible
        // in the output, not aliased to an external import.
        rollupOptions: {
          external: ['@pyreon/core', '@pyreon/reactivity', '@pyreon/runtime-server'],
        },
      },
    })
    const outPath = path.join(outDir, 'out.js')
    const fs = await import('node:fs')
    return fs.readFileSync(outPath, 'utf8')
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

describe('runtime-dom dev-warning gate (Vite production bundle)', () => {
  for (const { file, devWarningStrings } of FILES_UNDER_TEST) {
    it(`${file} → dev warnings eliminated in Vite production bundle`, async () => {
      const code = await bundleWithVite(path.join(SRC, file), false)

      for (const warn of devWarningStrings) {
        expect(code, `"${warn}" survived prod tree-shake`).not.toContain(warn)
      }
      expect(code.length).toBeGreaterThan(0)
    }, 30_000)

    it(`${file} → dev warnings PRESERVED in Vite dev bundle (sanity)`, async () => {
      // Gate for the eliminated-when-prod test: if the strings were
      // deleted from source entirely, the previous test would pass
      // trivially. Bundling in dev mode should keep them.
      if (devWarningStrings.length === 0) return

      const code = await bundleWithVite(path.join(SRC, file), true)

      for (const warn of devWarningStrings) {
        expect(code, `"${warn}" missing from dev bundle (did source change?)`).toContain(warn)
      }
    }, 30_000)
  }
})
