/**
 * A private package's `exports` map must point at files that EXIST.
 *
 * ── The bug this locks out ────────────────────────────────────────────────
 *
 * The three private `packages/ui/*` packages declared
 *
 *   "exports": { ".": { "bun": "./src/index.ts",
 *                       "import": "./lib/index.js",
 *                       "types": "./lib/types/index.d.ts" } }
 *
 * while their `build` script was, verbatim, `echo 'private package — consumed
 * via bun condition'`. So `lib/` was never produced and two of the three
 * conditions named files that could not exist.
 *
 * Bun resolves these through the `bun` condition, which is why nothing broke
 * for day-to-day work. Everything ELSE — Node, `tsc` for a downstream package,
 * Vite's SSR external resolution — takes `import`/`types` and fails with
 * `Failed to resolve entry for package "@pyreon/ui-theme"`.
 *
 * The damage was not theoretical and not loud. Atlas loads a project's modules
 * through Vite to read rocketstyle chains; every file in `@pyreon/ui-components`
 * threw on import, and the discovery pass swallowed each throw as "nothing to
 * introspect". The result was a catalog reporting 7 components for a 108-
 * component package, with no error anywhere. Fixing the exports maps took it to
 * 108 components / 1090 scenarios / 67 with real variant axes.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *
 * A package that ships SOURCE points every condition at source — the shape the
 * `packages/internals/*` packages already use. An `exports` map is a contract
 * with every resolver, not just the one the repo happens to run.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '../../../../..')

/** Private packages whose `build` is a no-op, i.e. they are consumed as source. */
const SOURCE_CONSUMED = [
  'packages/ui/theme',
  'packages/ui/components',
  'packages/ui/primitives',
  'packages/internals/test-utils',
  'packages/internals/manifest',
  'packages/internals/vitest-config',
]

const readPkg = (dir: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO_ROOT, dir, 'package.json'), 'utf8')) as Record<string, unknown>

/** Every string leaf of an exports map, with the condition that produced it. */
function conditionTargets(exports: unknown, path = ''): { condition: string; target: string }[] {
  if (typeof exports === 'string') return [{ condition: path || '.', target: exports }]
  if (typeof exports !== 'object' || exports === null) return []
  return Object.entries(exports as Record<string, unknown>).flatMap(([key, value]) =>
    conditionTargets(value, path ? `${path}.${key}` : key),
  )
}

describe('private source-consumed packages: exports must resolve', () => {
  for (const dir of SOURCE_CONSUMED) {
    it(`${dir} — every exports condition names a file that exists`, () => {
      const pkg = readPkg(dir)
      const targets = conditionTargets(pkg.exports)
      expect(targets.length, `${dir} declares no exports`).toBeGreaterThan(0)

      for (const { condition, target } of targets) {
        const file = join(REPO_ROOT, dir, target.replace(/^\.\//, ''))
        expect(
          existsSync(file),
          `${dir} exports \`${condition}\` → \`${target}\`, which does not exist. ` +
            `Its build is a no-op, so a \`lib/\` target can never appear — point the ` +
            `condition at source, as packages/internals/* do. Anything resolving through ` +
            `this condition (Node, tsc, Vite SSR) fails today, and the failure is silent ` +
            `in tooling that treats an unloadable module as an empty one.`,
        ).toBe(true)
      }
    })
  }

  it('a no-op build and a lib/ target are contradictory — assert the pairing directly', () => {
    // The narrower invariant, stated on its own so a future package that adds a
    // REAL build is not caught by it: only a package whose build produces
    // nothing is forbidden from naming `lib/`.
    for (const dir of SOURCE_CONSUMED) {
      const pkg = readPkg(dir)
      const build = (pkg.scripts as Record<string, string> | undefined)?.build ?? ''
      const producesNothing = build === '' || build.startsWith('echo ')
      if (!producesNothing) continue
      const libTargets = conditionTargets(pkg.exports).filter((t) => t.target.includes('/lib/'))
      expect(
        libTargets.map((t) => `${t.condition} → ${t.target}`),
        `${dir} has a no-op build (\`${build}\`) but points at lib/`,
      ).toEqual([])
    }
  })
})
