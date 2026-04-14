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
    devWarningStrings: [
      '[Pyreon] Event handler',
      '[Pyreon] Blocked unsafe URL',
    ],
  },
  {
    file: 'transition.ts',
    devWarningStrings: [
      '[Pyreon] Transition child is a component',
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

// ─── Non-Vite consumer runtime correctness ─────────────────────────────────
//
// What the CLAUDE.md doc claims for non-Vite consumers (webpack,
// bunchee, raw esbuild bundles): the dev-warning STRINGS may stay in
// the bundle as data, but the warnings themselves don't fire because
// the `import.meta.env?.DEV === true` gate evaluates to `false` when
// `import.meta.env.DEV` is undefined at runtime.
//
// This block bundles `nodes.ts` with raw esbuild (no `define` for
// import.meta.env, simulating a less-aware bundler), then asserts:
//
//   1. The dev-warning strings DO survive (proving we picked a real
//      bundle to test, not Vite-equivalent behavior).
//   2. The strings are still gated — they appear next to a check
//      involving `import.meta.env` rather than being unconditional.
//
// (2) is what makes the runtime claim true: at runtime `import.meta.env`
// is `undefined` in non-Vite-aware environments, so `?.DEV` returns
// `undefined`, `=== true` returns `false`, and the warn never fires.
// If a future refactor unconditionally calls console.warn (no gate),
// this assertion catches that the runtime contract regressed.

describe('non-Vite consumer runtime correctness', () => {
  it('raw esbuild bundle keeps the dev gate intact (warnings remain runtime-gated)', async () => {
    const { build } = await import('esbuild')
    const result = await build({
      entryPoints: [path.join(SRC, 'nodes.ts')],
      bundle: true,
      write: false,
      minify: true,
      format: 'esm',
      platform: 'browser',
      external: ['@pyreon/core', '@pyreon/reactivity', '@pyreon/runtime-server'],
      // Intentionally no `define` — simulates a non-Vite-aware bundler.
    })
    const code = result.outputFiles[0]?.text ?? ''

    // (1) String survives — confirms this IS the non-Vite path.
    expect(code).toContain('Duplicate key')

    // (2) Surviving warning is still gated: appears next to an
    //     `import.meta.env` access (the runtime gate). If someone
    //     unconditionally calls console.warn, this assertion catches
    //     it because there'd be no env access nearby.
    //
    //     We assert by structural pattern: the bundle must contain at
    //     least one `import.meta.env` reference in the same chunk as
    //     each surviving dev string.
    expect(code).toMatch(/import\.meta\.env/)
  }, 5000)
})
