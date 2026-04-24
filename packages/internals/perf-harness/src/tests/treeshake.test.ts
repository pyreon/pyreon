/**
 * Prod tree-shake regression test for perf-harness counter emissions.
 *
 * Contract:
 *   Every counter write in a framework package is gated on
 *   `(import.meta as ViteMeta).env?.DEV === true`. In a Vite production
 *   bundle `import.meta.env.DEV` is replaced with the literal `false`,
 *   the gate folds to `if (false)`, esbuild's minifier proves the
 *   branch is unreachable, and tree-shaking drops the entire call
 *   tree — including the counter NAME string and the `__pyreon_count__`
 *   identifier.
 *
 * What this catches:
 *   - A dev gate that was removed by mistake, leaving the counter call
 *     unconditionally in the source (then reference-alive in prod).
 *   - A Vite / Rolldown / esbuild behavior change that stops eliminating
 *     this shape of dead code.
 *   - A non-Vite bundler in the consumer's path producing different
 *     behavior (documented in CLAUDE.md as "Vite is primary supported
 *     bundler", but this test proves it for the counter path).
 *
 * Same pattern + rationale as
 * `packages/core/runtime-dom/src/tests/dev-gate-treeshake.test.ts`.
 * See that file for the longer history of the dev-gate drift problem.
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
  // runtime-server is NOT in this list — it's a server package with a
  // `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
  // dev gate. The `typeof process` half can't be folded at build time
  // (runtime check), so even with `process.env.NODE_ENV` defined as
  // `"production"`, esbuild keeps the gate + counter strings in the bundle.
  // For server code the contract is RUNTIME gating, not tree-shake —
  // `runtime-server-runtime-gate.test.ts` verifies that NODE_ENV=production
  // skips the counter call at execution time.
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
        'import.meta.env.DEV': 'false',
        'import.meta.env': JSON.stringify({
          DEV: false,
          PROD: true,
          MODE: 'production',
        }),
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
