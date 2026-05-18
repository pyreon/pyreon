import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/query` best-practice rule.
 *
 * `useQuery` / `useInfiniteQuery` / `useQueries` / `useSuspenseQuery`
 * take their options as a FUNCTION (not an object) so `queryKey` and
 * other fields can read Pyreon signals — changing a tracked signal
 * re-runs the observer options and refetches automatically. Passing a
 * plain object literal evaluates `queryKey` exactly once at setup and
 * silently breaks reactive refetching.
 *
 * `useMutation` is deliberately NOT flagged — mutations are imperative
 * and its options ARE a plain object by design.
 *
 * Only a direct object-literal first argument is flagged. An identifier
 * or a call expression as the first arg is out of scope (the rule can't
 * prove its shape without type/dataflow analysis, so it stays silent —
 * conservative, zero false positives).
 *
 * Stays completely silent in projects that don't depend on
 * `@pyreon/query` (no noise, no config).
 */
const REACTIVE_OPTION_HOOKS = new Set([
  'useQuery',
  'useInfiniteQuery',
  'useQueries',
  'useSuspenseQuery',
])

export const queryOptionsAsFunction: Rule = {
  meta: {
    id: 'pyreon/query-options-as-function',
    category: 'query',
    description:
      'In @pyreon/query projects, pass useQuery/useInfiniteQuery/useQueries/useSuspenseQuery options as a function, not an object literal.',
    severity: 'error',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    if (!isProjectDependency(context.getFilePath(), '@pyreon/query')) {
      return {}
    }

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node.callee
        if (!callee || callee.type !== 'Identifier') return
        if (!REACTIVE_OPTION_HOOKS.has(callee.name)) return

        const args = node.arguments
        if (!args || args.length === 0) return
        const firstArg = args[0]
        if (!firstArg || firstArg.type !== 'ObjectExpression') return

        context.report({
          message: `\`${callee.name}(...)\` options must be a FUNCTION, not an object literal — wrap it as \`() => ({ ... })\` so \`queryKey\` (and other fields) can read Pyreon signals and refetch reactively.`,
          span: getSpan(firstArg),
        })
      },
    }
    return callbacks
  },
}
