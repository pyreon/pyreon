import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated frontend best-practice rule.
 *
 * In a project that depends on `@pyreon/zero`, a raw `<img src=...>`
 * misses the framework's image optimization: lazy loading, responsive
 * `srcset`, and the blur-up placeholder that `<Image>` from
 * `@pyreon/zero` provides. This rule stays completely silent in
 * projects that do NOT depend on `@pyreon/zero` (no noise, no config),
 * and never flags an existing `<Image>`.
 */
export const preferZeroImage: Rule = {
  meta: {
    id: 'pyreon/prefer-zero-image',
    category: 'frontend',
    description: 'In @pyreon/zero projects, prefer the optimized `<Image>` over a raw `<img>`.',
    severity: 'info',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    // Dependency gate: only active when the linted project declares
    // `@pyreon/zero`. Computed once per file (cheap, cached upstream).
    if (!isProjectDependency(context.getFilePath(), '@pyreon/zero')) {
      return {}
    }

    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier' || name.name !== 'img') return

        // Only flag elements that actually carry a `src` (a bare
        // placeholder `<img>` with no source is not the target shape).
        if (!hasJSXAttribute(node, 'src')) return

        context.report({
          message:
            'Raw `<img src=...>` in a @pyreon/zero project — prefer `<Image>` from `@pyreon/zero` for automatic lazy-load, responsive `srcset`, and a blur-up placeholder.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
