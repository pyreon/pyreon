import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * Returns a `resolve.alias` entry that fixes the recurring tslib bug
 * triggered by importing `@pyreon/charts` (which transitively imports
 * `echarts`) into a Vite-bundled app.
 *
 * The bug: tslib's `package.json` `exports` map points the `import`
 * condition at `./modules/index.js`, which destructures TypeScript
 * helpers from a `__toESM(require_tslib())` default — but the helpers
 * live as TOP-LEVEL `var`s on the CJS factory, NOT as properties of
 * `module.exports.default`. The destructure reads `undefined` and the
 * page throws `TypeError: Cannot destructure property '__extends' of
 * '__toESM(...).default' as it is undefined` the moment ECharts loads.
 *
 * Aliasing `tslib` to the flat-ESM `tslib.es6.js` sidesteps the broken
 * indirection entirely.
 *
 * Usage:
 *
 *   // vite.config.ts
 *   import { chartsViteAlias } from '@pyreon/charts/vite'
 *
 *   export default defineConfig({
 *     resolve: { alias: { ...chartsViteAlias() } },
 *   })
 *
 * No-op (`{}`) if tslib can't be located in any common install layout —
 * apps that don't actually use `@pyreon/charts` won't break their config.
 *
 * Tracking upstream: microsoft/tslib#189.
 */
/**
 * @param fromDir — resolution root. Defaults to this file's own directory
 *   (the real-world case: a consumer's `vite.config.ts` calls
 *   `chartsViteAlias()` with no args). Accepting an override makes the `{}`
 *   no-tslib fallback testable by pointing at a tslib-free directory.
 */
export function chartsViteAlias(
  fromDir: string = path.dirname(new URL(import.meta.url).pathname),
): Record<string, string> {
  const target = resolveTslibEs6(fromDir)
  return target ? { tslib: target } : {}
}

/**
 * @internal — exported for testing only.
 *
 * Resolve the flat-ESM `tslib.es6.js` reachable from `fromDir`. Returns the
 * absolute path, or `null` if tslib can't be located in any common layout.
 * Takes `fromDir` as a parameter (rather than reading `import.meta.url`
 * directly) so the not-found / `return null` path is testable by pointing it
 * at a tslib-free directory — mirroring `resolveTslibEsmEntry` in
 * `@pyreon/vitest-config`. (Bun + vitest cannot reliably mock the `node:fs`
 * `existsSync` binding inside a workspace `src` file, so the seam is the
 * `fromDir` argument, not a mocked fs.)
 */
export function resolveTslibEs6(fromDir: string): string | null {
  const candidates: string[] = []

  // Prefer resolving via echarts itself — bun's nested layout has tslib
  // as a sibling of echarts inside .bun/echarts@x.y.z/node_modules/.
  // Root the require at `fromDir`'s package.json so a fromDir with no
  // reachable echarts (e.g. a tmp fixture) throws → no echarts candidate.
  try {
    const echartsPkg = createRequire(path.join(fromDir, 'package.json')).resolve(
      'echarts/package.json',
    )
    candidates.push(path.resolve(path.dirname(echartsPkg), '../tslib/tslib.es6.js'))
  } catch {
    // echarts not installed at this resolution root — try walks below.
  }

  // Walk up from `fromDir` looking for hoisted tslib (npm/pnpm/yarn).
  let dir = fromDir
  for (let i = 0; i < 12; i++) {
    candidates.push(path.join(dir, 'node_modules', 'tslib', 'tslib.es6.js'))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}
