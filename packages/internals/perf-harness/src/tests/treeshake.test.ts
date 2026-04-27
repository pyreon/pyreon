/**
 * Prod tree-shake regression test for perf-harness counter emissions.
 *
 * Contract:
 *   Every counter write in a framework package is gated on
 *   `process.env.NODE_ENV !== 'production'` — the bundler-agnostic
 *   library standard used by React, Vue, Preact, Solid. Every modern
 *   bundler (Vite, Webpack/Next.js, esbuild, Rollup, Parcel, Bun)
 *   auto-replaces `process.env.NODE_ENV` at consumer build time. In a
 *   prod build the literal lands as `"production" !== "production"` →
 *   `false`, the gate folds, esbuild's minifier proves the branch is
 *   unreachable, and tree-shaking drops the entire call tree — including
 *   the counter NAME string and the `__pyreon_count__` identifier.
 *
 * What this catches:
 *   - A dev gate that was removed by mistake, leaving the counter call
 *     unconditionally in the source (then reference-alive in prod).
 *   - A Vite / Rolldown / esbuild behavior change that stops eliminating
 *     this shape of dead code.
 *   - A regression to a bundler-coupled pattern (`import.meta.env.DEV` is
 *     Vite-only; `typeof process` is dead in Vite browser bundles). Both
 *     are flagged by the `pyreon/no-process-dev-gate` lint rule, but this
 *     test confirms the contract end-to-end at the bundle level.
 *
 * Same pattern + rationale as
 * `packages/core/runtime-dom/src/tests/dev-gate-treeshake.test.ts`.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(here, '../../../../..')

// One representative file per instrumented layer. The contract is the same
// for every file with a counter emission (the gate is literally identical),
// so exhaustively bundling every instrumented file is overkill — these
// five prove the pipeline works and act as canaries if anything drifts.
const FILES_UNDER_TEST: { layer: string; file: string; counterNames: string[] }[] = [
  {
    layer: 'styler',
    file: 'packages/ui-system/styler/src/resolve.ts',
    counterNames: ['styler.resolve'],
  },
  {
    layer: 'unistyle',
    file: 'packages/ui-system/unistyle/src/styles/styles/index.ts',
    counterNames: ['unistyle.styles', 'unistyle.descriptor'],
  },
  {
    layer: 'reactivity',
    file: 'packages/core/reactivity/src/signal.ts',
    counterNames: ['reactivity.signalCreate', 'reactivity.signalWrite'],
  },
  {
    layer: 'runtime-dom',
    file: 'packages/core/runtime-dom/src/mount.ts',
    counterNames: ['runtime.mountChild'],
  },
  {
    layer: 'runtime-dom-template',
    file: 'packages/core/runtime-dom/src/template.ts',
    counterNames: ['runtime.tpl'],
  },
  {
    layer: 'router',
    file: 'packages/core/router/src/router.ts',
    counterNames: ['router.navigate', 'router.loaderRun', 'router.loaderCache.hit'],
  },
  // runtime-server is NOT in this list — it's a server package that keeps
  // the `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
  // compound (server-only packages are exempt from `pyreon/no-process-dev-gate`
  // because Node always has `process`). The `typeof process` half can't be
  // folded at build time (runtime check), so even with `process.env.NODE_ENV`
  // defined as `"production"`, esbuild keeps the gate + counter strings in
  // the bundle. For server code the contract is RUNTIME gating, not
  // tree-shake — `runtime-server-runtime-gate.test.ts` verifies that
  // NODE_ENV=production skips the counter call at execution time.
]

async function bundleProd(entry: string): Promise<string> {
  const outDir = mkdtempSync(path.join(tmpdir(), 'pyreon-perf-treeshake-'))
  try {
    await build({
      mode: 'production',
      logLevel: 'error',
      configFile: false,
      resolve: { conditions: ['bun'] },
      define: {
        // Bundler-agnostic dev gate: every modern bundler replaces
        // `process.env.NODE_ENV` at consumer build time. We mimic that
        // here so the counter calls fold to `if (false) ...` and
        // tree-shake out of the prod bundle.
        'process.env.NODE_ENV': '"production"',
      },
      build: {
        minify: 'esbuild',
        target: 'esnext',
        write: true,
        outDir,
        emptyOutDir: true,
        lib: { entry, formats: ['es'], fileName: 'out' },
        rollupOptions: {
          // Externalise every workspace dep — we want to see THIS file's
          // strings, not its downstream consumers'.
          external: (id) =>
            id.startsWith('@pyreon/') || (!id.startsWith('.') && !path.isAbsolute(id)),
        },
      },
    })
    return readFileSync(path.join(outDir, 'out.js'), 'utf8')
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

describe('perf-harness counter tree-shake (Vite production bundle)', () => {
  for (const { layer, file, counterNames } of FILES_UNDER_TEST) {
    it(`${layer}: counter strings eliminated in prod`, async () => {
      const entry = path.resolve(REPO_ROOT, file)
      const code = await bundleProd(entry)

      expect(code.length, 'bundle should not be empty').toBeGreaterThan(0)
      expect(code, `"__pyreon_count__" survived prod tree-shake in ${layer}`).not.toContain(
        '__pyreon_count__',
      )
      for (const name of counterNames) {
        expect(code, `"${name}" survived prod tree-shake in ${layer}`).not.toContain(name)
      }
    }, 30000)
  }
})
