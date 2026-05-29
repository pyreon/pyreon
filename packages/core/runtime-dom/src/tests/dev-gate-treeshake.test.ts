import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '..')

// Bundle-level regression test for the dev-warning gate.
//
// runtime-dom uses bundler-agnostic `process.env.NODE_ENV !== 'production'`
// for dev gates — the cross-bundler library convention used by React, Vue,
// Preact, Solid, MobX, Redux. Every modern bundler (Vite, Webpack/Next.js,
// esbuild, Rollup, Parcel, Bun) auto-replaces `process.env.NODE_ENV` at
// consumer build time. This test bundles each representative runtime-dom
// file through Vite's production build and asserts dev-warning strings
// are GONE from the output — proving literal-replacement + dead-code
// elimination work end-to-end.
//
// The test uses Vite because that's Pyreon's reference consumer pipeline
// today; the same files under Webpack / esbuild / Rollup etc. tree-shake
// equivalently because they all replace `process.env.NODE_ENV`. Vite is
// just the most-tested path.
//
// Scope note: `dev-gate-pattern.test.ts` is the cheap source-level guard
// (grep for the broken patterns, require bare `process.env.NODE_ENV`).
// This test is the expensive end-to-end guard for the bundle path.

interface FileContract {
  file: string
  /** Dev-warning strings that MUST be eliminated from the prod bundle. */
  devWarningStrings: string[]
}

// Coverage strategy: pick representative files across the runtime-dom
// dev-gate landscape so a regression in any of the typical patterns is
// caught. `nodes.ts` covers the chained `&&` form (the original
// problem). `mount.ts` covers the simple `if (__DEV__)` form across
// multiple Portal/VNode call sites. `props.ts` covers attribute-validation
// warnings inside small inline `if (__DEV__) { ... }` blocks.
// `transition.ts` covers a single `if (__DEV__) { console.warn() }`.
//
// These four files exercise every shape of dev gate currently used in
// runtime-dom; if the contract holds for all of them, it holds for the
// rest of the file set.
const FILES_UNDER_TEST: FileContract[] = [
  {
    file: 'nodes.ts',
    devWarningStrings: [
      '[Pyreon] <For> `by` function returned null/undefined',
      '[Pyreon] Duplicate key',
    ],
  },
  {
    file: 'mount.ts',
    devWarningStrings: [
      '[Pyreon] <Portal> received a falsy `target`',
      '[Pyreon] <Portal> target must be a DOM node',
      '[Pyreon] Invalid VNode type',
      'is a void element and cannot have children',
    ],
  },
  {
    file: 'props.ts',
    devWarningStrings: ['[Pyreon] Event handler', '[Pyreon] Blocked unsafe URL'],
  },
  {
    file: 'transition.ts',
    devWarningStrings: ['[Pyreon] Transition child is a component'],
  },
]

async function bundleWithVite(entry: string, dev: boolean): Promise<string> {
  const outDir = mkdtempSync(path.join(tmpdir(), 'pyreon-vite-treeshake-'))
  try {
    // Vite library-mode build with explicit minify. The bundler-agnostic
    // gate uses `process.env.NODE_ENV` — Vite's library mode doesn't apply
    // the default replacement automatically, so we set it ourselves to
    // match what every modern bundler does at consumer build time.
    await build({
      mode: dev ? 'development' : 'production',
      logLevel: 'error',
      configFile: false,
      resolve: { conditions: ['bun'] },
      define: {
        'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
      },
      build: {
        // PINNED minifier: 'esbuild' is what Pyreon's reference consumers
        // (Zero, the example apps) effectively use. If a future Vite
        // version flips the default to oxc-minify or terser, behavior
        // could differ silently — pinning keeps this test honest.
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
    }, 5000)

    it(`${file} → dev warnings PRESERVED in Vite dev bundle (sanity)`, async () => {
      // Gate for the eliminated-when-prod test: if the strings were
      // deleted from source entirely, the previous test would pass
      // trivially. Bundling in dev mode should keep them.
      if (devWarningStrings.length === 0) return

      const code = await bundleWithVite(path.join(SRC, file), true)

      for (const warn of devWarningStrings) {
        expect(code, `"${warn}" missing from dev bundle (did source change?)`).toContain(warn)
      }
    }, 5000)
  }
})

// ─── Non-Vite consumer correctness (bare-gate pattern, post-#900) ────────────
//
// Pyreon's source uses the bundler-agnostic bare gate
// `process.env.NODE_ENV !== 'production'` — see `pyreon/no-process-dev-gate`
// lint rule for enforcement. Under esbuild's `platform: 'browser'` defaults
// (no explicit `define`), esbuild auto-replaces `process.env.NODE_ENV` with
// `"development"` so the gate folds to `true` AND the minifier
// dead-code-eliminates the warn body even without consumer config.
//
// Test claim: a raw esbuild bundle for the browser platform strips the
// dev-warning bodies entirely. Pre-#900 (with `__DEV__` alias) this
// happened only when consumers explicitly set `define: NODE_ENV=production`.
// After #900, esbuild's defaults handle it for non-Vite consumers too —
// strictly better, no runtime gate even needed.

describe('non-Vite consumer correctness (bare-gate pattern)', () => {
  it('raw esbuild bundle (browser platform): dev-warn bodies are stripped by esbuild defaults', async () => {
    const { build } = await import('esbuild')
    const result = await build({
      entryPoints: [path.join(SRC, 'nodes.ts')],
      bundle: true,
      write: false,
      minify: true,
      format: 'esm',
      platform: 'browser',
      external: ['@pyreon/core', '@pyreon/reactivity', '@pyreon/runtime-server'],
      // Intentionally no `define` — simulates a non-Vite consumer.
      // esbuild's browser platform defaults `process.env.NODE_ENV` to
      // `"development"`, so the bare gate folds to `true` and the
      // minifier eliminates the warn body as dead branch under
      // dead-code analysis.
    })
    const code = result.outputFiles[0]?.text ?? ''
    // Bodies stripped (esbuild's default replacement + minifier).
    expect(code).not.toContain('Duplicate key')
    expect(code).not.toContain('console.warn')
  }, 5000)
})
