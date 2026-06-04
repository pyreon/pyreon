import type { Plugin, PluginBuild } from 'esbuild'
import { describe, expect, it } from 'vitest'

/**
 * Tree-shaking regression lock for `@pyreon/runtime-dom`.
 *
 * The package declares `sideEffects: false` and its optional features
 * (`Transition` / `TransitionGroup` / `KeepAlive`) are re-exported from the main
 * entry for back-compat AND available via subpath exports. A memory audit
 * measured (esbuild prod+gzip) that a `mount`-only import ships ~7.4 KB gz while
 * the full kitchen-sink (incl. those features) is ~9.8 KB — i.e. the optional
 * ~1.2 KB tree-shakes OUT when unused. Nothing gated that: `bundle-budgets`
 * caps the FULL main-entry size, but a top-level side effect introduced into
 * `transition.ts` / `keep-alive.ts` (or a stray eager import of them from the
 * mount path) would silently pull that code into EVERY consumer's bundle, and
 * the full-size budget would never notice.
 *
 * This locks the property directly: a `mount`-only import must NOT carry the
 * Transition/KeepAlive code. Asserted via marker strings unique to those
 * modules (`transitionend`/`animationend` appear 14× in transition.ts and
 * nowhere in the mount/template/hydrate core path; `display: contents` is
 * KeepAlive's wrapper style). The full import is bundled too, to prove the
 * markers are real (the bundler isn't dropping the strings globally) — so the
 * test fails LOUDLY if tree-shaking breaks, not silently if the markers vanish.
 *
 * Bisect-verified: adding a module-eval side effect to transition.ts (which
 * defeats its tree-shaking from the mount-only entry) makes `transitionend`
 * appear in the mount-only bundle → the `.not.toContain` assertions fail.
 */
describe('runtime-dom bundle tree-shaking', () => {
  async function bundle(entryContents: string): Promise<string> {
    const esbuild = await import('esbuild')
    const path = await import('node:path')
    // resolveDir = packages/core/runtime-dom/src (so `./index` + the index's
    // own relative imports resolve). Cross-package `@pyreon/*` deps are
    // externalized — we measure runtime-dom's OWN tree-shaking, not its deps'.
    const srcDir = path.resolve(import.meta.dirname, '..')
    // index.ts imports `{ name, version } from '../package.json'` (the
    // singleton-sentinel diagnostic). The package's `exports` field doesn't
    // expose that subpath, so esbuild can't resolve it — stub it (irrelevant to
    // tree-shake analysis; it carries no Transition/KeepAlive code).
    const stubPkgJson: Plugin = {
      name: 'stub-pkg-json',
      setup(build: PluginBuild) {
        build.onResolve({ filter: /package\.json$/ }, () => ({
          path: 'pkg-json',
          namespace: 'stub-pkg-json',
        }))
        build.onLoad({ filter: /.*/, namespace: 'stub-pkg-json' }, () => ({
          contents: JSON.stringify({ name: '@pyreon/runtime-dom', version: '0.0.0' }),
          loader: 'json',
        }))
      },
    }
    const result = await esbuild.build({
      stdin: { contents: entryContents, loader: 'ts', resolveDir: srcDir },
      bundle: true,
      format: 'esm',
      write: false,
      minify: true, // match Vite prod (string literals are preserved by minify)
      treeShaking: true,
      external: ['@pyreon/*'],
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [stubPkgJson],
    })
    return result.outputFiles[0]?.text ?? ''
  }

  it('a mount-only import tree-shakes out Transition / TransitionGroup / KeepAlive', async () => {
    const mountOnly = await bundle("import { mount } from './index'; globalThis.__x = mount")
    const full = await bundle(
      "import { mount, Transition, TransitionGroup, KeepAlive } from './index';" +
        ' globalThis.__x = [mount, Transition, TransitionGroup, KeepAlive]',
    )

    // Transition / TransitionGroup specific (both modules use these event names).
    expect(mountOnly).not.toContain('transitionend')
    expect(mountOnly).not.toContain('animationend')
    // KeepAlive's wrapper style — unique to keep-alive.ts.
    expect(mountOnly).not.toContain('display: contents')

    // The full import DOES carry them — proves the markers are real (so the
    // `.not.toContain` above is meaningful, not just absent-everywhere).
    expect(full).toContain('transitionend')
    expect(full).toContain('display: contents')

    // Sanity: the full bundle is larger (carries the optional features).
    expect(full.length).toBeGreaterThan(mountOnly.length)
  })
})
