import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Rule, VisitorCallbacks } from '../../types'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * `pyreon/require-browser-smoke-test` — every browser-categorized package
 * must ship at least one `*.browser.test.{ts,tsx}` file under `src/`.
 *
 * Locks in the durability of the T1.1 browser smoke harness (PRs #224,
 * #227, #229, #231). Without this rule, any new browser-running package
 * can quietly ship without a real-browser smoke test and we drift back
 * to the world before T1.1 — where happy-dom silently masks
 * environment-divergence bugs (PR #197 mock-vnode metadata drop, PR
 * #200 `typeof process` dead code, the multi-word event delegation bug
 * fixed alongside PR #231).
 *
 * **What it checks**: when linting a package's `src/index.ts`, the rule
 * looks at the package directory for any file matching
 * `**\/*.browser.test.{ts,tsx}`. If none are found AND the package's
 * name appears in the browser-categorized list, the rule reports an
 * error on `src/index.ts`.
 *
 * **Why src/index.ts only**: the rule needs to fire exactly once per
 * package, not per file. `src/index.ts` is a stable per-package entry
 * point. Files inside the package are not browser-test files
 * themselves, so they get skipped via the path check.
 *
 * **Default browser packages list**: matches the categorization in
 * `.claude/rules/test-environment-parity.md`. Override via the
 * `additionalPackages` option to opt in new packages, or via
 * `exemptPaths` to opt out (e.g. for a brand-new package still under
 * construction).
 *
 * @example Configuration in `.pyreonlintrc.json`
 * ```json
 * {
 *   "rules": {
 *     "pyreon/require-browser-smoke-test": [
 *       "error",
 *       {
 *         "additionalPackages": ["@my-org/my-browser-pkg"],
 *         "exemptPaths": ["packages/experimental/"]
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * **Known limitation — file existence, not test quality.** The rule only
 * checks that at least one `*.browser.test.*` file exists under `src/`;
 * it cannot assess whether the test is meaningful. A package could ship
 * `sanity.browser.test.ts` with `expect(1).toBe(1)` and satisfy the
 * rule. That's accepted by design — the rule is a *gate* against
 * packages shipping with zero smoke coverage, not a quality check.
 * Review the actual test contents on PR. If drive-by one-liner tests
 * become a pattern, add a per-package coverage threshold or a
 * complementary rule that inspects test file contents.
 */

/**
 * Single source of truth for browser-categorized packages lives at
 * `.claude/rules/browser-packages.json`. Loading it lazily here means:
 *
 *   1. Updating the list never requires re-publishing `@pyreon/lint`.
 *   2. The script `scripts/check-browser-smoke.ts` + the human-readable
 *      `.claude/rules/test-environment-parity.md` share the same source,
 *      so they can't drift out of sync silently.
 *
 * The JSON is searched for by walking up from the linted file's directory
 * to the first ancestor containing `.claude/rules/browser-packages.json`.
 * If not found (rule running in a consumer repo that doesn't ship the
 * JSON), the rule falls back to an empty list — `additionalPackages`
 * becomes the only signal and the rule stays opt-in, not a footgun.
 *
 * Cached globally because the list is tiny and lint runs lint thousands
 * of files per invocation.
 */
let _cachedBrowserPackages: Set<string> | null = null

function loadBrowserPackages(fromFile: string): Set<string> {
  if (_cachedBrowserPackages) return _cachedBrowserPackages
  let dir = path.dirname(fromFile)
  // Walk up to /; bounded in practice by the project root.
  for (let i = 0; i < 30; i++) {
    const candidate = path.join(dir, '.claude', 'rules', 'browser-packages.json')
    if (existsSync(candidate)) {
      try {
        const fs = require('node:fs') as typeof import('node:fs')
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
          packages?: unknown
        }
        if (Array.isArray(parsed.packages)) {
          _cachedBrowserPackages = new Set(
            parsed.packages.filter((p): p is string => typeof p === 'string'),
          )
          return _cachedBrowserPackages
        }
      } catch {
        // fall through to empty-list fallback
      }
      break
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  _cachedBrowserPackages = new Set()
  return _cachedBrowserPackages
}

/**
 * Test-only: reset the cached list so unit tests can exercise the
 * filesystem-discovery path multiple times within one process.
 */
export function _resetBrowserPackagesCache(): void {
  _cachedBrowserPackages = null
}

/**
 * Walk a directory looking for `*.browser.test.{ts,tsx}` files. Bails
 * on the first match — we only need to know `at least one exists`,
 * not enumerate them. Skips `node_modules`, `lib`, `dist`, and dot
 * directories so a package's own dependencies don't pollute the check.
 */
function hasBrowserTest(dir: string): boolean {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return false
  }
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'lib' || name === 'dist') {
      continue
    }
    const full = path.join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      if (hasBrowserTest(full)) return true
      continue
    }
    if (/\.browser\.test\.(?:ts|tsx)$/.test(name)) return true
  }
  return false
}

/**
 * Read the package.json `name` field for the directory containing the
 * given src/index.ts file. Returns null if not found.
 */
function readPackageName(srcIndexPath: string): string | null {
  // src/index.ts -> ../package.json
  const pkgPath = path.resolve(path.dirname(srcIndexPath), '..', 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    // Read synchronously; cheap for one file per package per lint run.
    const text = require('node:fs').readFileSync(pkgPath, 'utf8') as string
    const parsed = JSON.parse(text) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  } catch {
    return null
  }
}

export const requireBrowserSmokeTest: Rule = {
  meta: {
    id: 'pyreon/require-browser-smoke-test',
    category: 'architecture',
    description:
      'Every browser-categorized package must ship at least one `*.browser.test.{ts,tsx}` file under `src/`. Locks in the T1.1 browser smoke harness.',
    severity: 'error',
    fixable: false,
    schema: {
      additionalPackages: 'string[]',
      exemptPaths: 'string[]',
    },
  },
  create(context): VisitorCallbacks {
    const filePath = context.getFilePath()

    // Run exactly once per package: only on `<package>/src/index.ts`
    // (or .tsx). Test files in the package are excluded automatically
    // because they don't match this pattern.
    if (
      !filePath.endsWith('/src/index.ts') &&
      !filePath.endsWith('/src/index.tsx')
    ) {
      return {}
    }

    if (isPathExempt(context)) return {}

    const pkgName = readPackageName(filePath)
    if (pkgName == null) return {}

    const options = context.getOptions()
    const additional = Array.isArray(options.additionalPackages)
      ? (options.additionalPackages.filter((s) => typeof s === 'string') as string[])
      : []
    const browserPackages = new Set(loadBrowserPackages(filePath))
    for (const p of additional) browserPackages.add(p)

    if (!browserPackages.has(pkgName)) return {}

    const pkgDir = path.dirname(path.dirname(filePath)) // strip /src/index.ts
    if (hasBrowserTest(pkgDir)) return {}

    return {
      'Program:exit'(node: { start?: number; end?: number }) {
        context.report({
          message:
            `[Pyreon] Browser-categorized package "${pkgName}" has no \`*.browser.test.{ts,tsx}\` file. ` +
            `Add at least one real-browser smoke test under \`src/\` to catch environment-divergence bugs ` +
            `that happy-dom hides (typeof process dead code, real pointer events, computed styles, etc.). ` +
            `See .claude/rules/test-environment-parity.md for the recipe.`,
          span: { start: node.start ?? 0, end: node.end ?? 0 },
        })
      },
    }
  },
}
