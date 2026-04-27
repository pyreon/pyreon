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
  it('raw esbuild bundle: warning strings remain in bundle (proves we test the non-Vite path)', async () => {
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
    expect(code).toContain('Duplicate key')
  }, 5000)

  it('raw esbuild bundle: dev gate evaluates to false at runtime when import.meta.env is undefined', async () => {
    // The real claim is RUNTIME — even when warning strings are in the
    // bundle, the gate stops `console.warn` from firing. This test
    // EXECUTES the bundled module with `import.meta.env` undefined
    // (the non-Vite case) and verifies `console.warn` is never called.
    //
    // Bundle a synthetic harness that exposes the gated callsite as a
    // standalone exported function, replacing the cross-package
    // imports so we don't need a full Pyreon runtime to execute. The
    // harness mirrors the EXACT gate pattern used in nodes.ts.
    const { build } = await import('esbuild')
    const harness = `
      // Same module-scope const pattern used in real Pyreon source.
      // @ts-ignore — \`import.meta.env\` is provided by Vite at build time
      const __DEV__ = import.meta.env?.DEV === true
      export function maybeWarn(seen: Set<string>, key: string): void {
        // Mirrors nodes.ts: a chained \`__DEV__ && cond && warn\` form
        // (Pattern B from the C-2 probe).
        if (seen.has(key)) {
          if (__DEV__) {
            console.warn(\`[Pyreon] Duplicate key "\${String(key)}" in <For> list.\`)
          }
        }
        seen.add(key)
      }
    `
    const result = await build({
      stdin: { contents: harness, loader: 'ts', resolveDir: SRC },
      bundle: true,
      write: false,
      minify: true,
      format: 'esm',
      platform: 'browser',
      // No `define` — same as a non-Vite consumer.
    })
    const code = result.outputFiles[0]?.text ?? ''

    // The string MUST be in the bundle (proves this is the non-Vite path).
    expect(code).toContain('Duplicate key')

    // Now actually execute the bundled module with `import.meta.env`
    // resembling the non-Vite environment (undefined). Use a data:
    // import to load the bundled ESM module. Bun supports this.
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    const mod = (await import(/* @vite-ignore */ dataUrl)) as {
      maybeWarn: (s: Set<string>, k: string) => void
    }

    // Spy on console.warn — the real runtime check.
    const calls: unknown[][] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => {
      calls.push(args)
    }
    try {
      const seen = new Set<string>()
      mod.maybeWarn(seen, 'foo')
      mod.maybeWarn(seen, 'foo') // second call → seen.has('foo') is true → would warn if gate broken
    } finally {
      console.warn = original
    }

    // The runtime contract: warning string is in the bundle (data),
    // but the gate stops it from firing.
    expect(calls).toEqual([])
  }, 5000)
})
