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
export function chartsViteAlias(): Record<string, string> {
  const target = resolveTslibEs6()
  return target ? { tslib: target } : {}
}

function resolveTslibEs6(): string | null {
  const candidates: string[] = []

  // Prefer resolving via echarts itself — bun's nested layout has tslib
  // as a sibling of echarts inside .bun/echarts@x.y.z/node_modules/.
  try {
    const echartsPkg = createRequire(import.meta.url).resolve('echarts/package.json')
    candidates.push(path.resolve(path.dirname(echartsPkg), '../tslib/tslib.es6.js'))
  } catch {
    // echarts not installed at this resolution root — try walks below.
  }

  // Walk up from this file looking for hoisted tslib (npm/pnpm/yarn).
  let dir = path.dirname(new URL(import.meta.url).pathname)
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
