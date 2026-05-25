import type { Rule, VisitorCallbacks } from '../../types'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * `pyreon/vitest-config-uses-shared` — every per-package `vitest.config.ts`
 * and `vitest.browser.config.ts` must use `defineNodeConfig` /
 * `defineBrowserConfig` from `@pyreon/vitest-config`.
 *
 * Locks in the migration that landed in PRs #914, #916, #919, #921, #922
 * (the test+config hygiene effort). Pre-migration, the 87 vitest configs
 * mixed three merge-order patterns (canonical, reversed, triple-nested),
 * with 9 configs silently running on vitest's 5s default timeout because
 * `sharedConfig` ended up on the wrong side of `mergeConfig`. The
 * documented systemic-flake cause (`testing.md` "Each package has its own
 * `vitest.config.ts` that MUST merge `sharedConfig`...").
 *
 * After the migration, `defineNodeConfig` and `defineBrowserConfig`
 * enforce the canonical merge order by construction — but only if the
 * helper is actually used. This rule prevents regression: a future PR
 * that hand-rolls a merge instead of using the helper fails CI here.
 *
 * **What it checks**: on `vitest.config.ts` or `vitest.browser.config.ts`,
 * the file must import from `@pyreon/vitest-config`. The most common
 * regression shape — `import { mergeConfig } from 'vite'` combined with
 * `import { sharedConfig } from '...vitest.shared'` — is rejected because
 * the root `vitest.shared.ts` was deleted in PR #922.
 *
 * **Scope**: only the two filenames above. The rule never fires on other
 * `vitest.*.ts` files (helper modules, etc.) or on source code.
 *
 * **Limitation by design**: the rule asserts the IMPORT exists, not that
 * the export uses it. A future PR could `import { defineNodeConfig }
 * from '@pyreon/vitest-config'` and then `export default {} as any` and
 * the rule wouldn't catch it. That's acceptable: the rule is a tripwire
 * for the regression shape that actually surfaced empirically, not a
 * complete proof of correctness.
 */
export const vitestConfigUsesShared: Rule = {
  meta: {
    id: 'pyreon/vitest-config-uses-shared',
    category: 'architecture',
    description:
      'Per-package vitest configs must use defineNodeConfig / defineBrowserConfig from @pyreon/vitest-config (locks in PRs #914-#922 migration).',
    severity: 'error',
    fixable: false,
    schema: {
      exemptPaths: 'string[]',
    },
  },
  create(context): VisitorCallbacks {
    const filePath = context.getFilePath()

    // Run only on vitest config files. Anywhere else is a no-op.
    const isNodeConfig = filePath.endsWith('/vitest.config.ts')
    const isBrowserConfig = filePath.endsWith('/vitest.browser.config.ts')
    if (!isNodeConfig && !isBrowserConfig) return {}

    if (isPathExempt(context)) return {}

    let importsFromVitestConfig = false

    return {
      ImportDeclaration(node: {
        source?: { value?: string }
        start?: number
        end?: number
      }) {
        if (node.source?.value === '@pyreon/vitest-config') {
          importsFromVitestConfig = true
        }
      },
      'Program:exit'(node: { start?: number; end?: number }) {
        if (importsFromVitestConfig) return
        const helperName = isBrowserConfig
          ? 'defineBrowserConfig'
          : 'defineNodeConfig'
        context.report({
          message:
            `[Pyreon] ${
              isBrowserConfig ? 'vitest.browser.config.ts' : 'vitest.config.ts'
            } must import \`${helperName}\` from \`@pyreon/vitest-config\`. ` +
            `Hand-rolled vitest configs silently drift the canonical ` +
            `merge order — see PRs #914-#922 for the migration that ` +
            `eliminated this class of bug. Replace the merge chain with ` +
            `\`export default ${helperName}({ category: 'core' | 'fundamentals' | 'ui' | 'tools' | 'zero' | 'internals' })\`.`,
          span: { start: node.start ?? 0, end: node.end ?? 0 },
        })
      },
    }
  },
}
