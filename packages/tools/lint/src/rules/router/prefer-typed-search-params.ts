import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { extractImportInfo } from '../../utils/imports'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/router` best-practice rule.
 *
 * Hand-parsing the query string with `new URLSearchParams(...)` inside
 * a routed component throws away the router's typed, reactive search
 * params. `useTypedSearchParams({ page: 'number', q: 'string' })`
 * returns auto-coerced, structurally-shared values that re-render only
 * when the tracked param actually changes — the manual
 * `new URLSearchParams(location.search).get('page')` path is stringly
 * typed, not reactive, and re-coerces on every read.
 *
 * Conservative, zero-false-positive shape: fires ONLY on a literal
 * `new URLSearchParams(` construction in a file that ALSO imports from
 * `@pyreon/router`. Anything else (a bare `URLSearchParams` reference,
 * a non-router file, a `.get()` on an existing instance) is left alone
 * — the router import is the proof the file is router-aware, so the
 * suggestion is always applicable.
 *
 * Stays completely silent in projects that don't depend on
 * `@pyreon/router` (no noise, no config).
 */
export const preferTypedSearchParams: Rule = {
  meta: {
    id: 'pyreon/prefer-typed-search-params',
    category: 'router',
    description:
      'In @pyreon/router projects, parse query strings via useTypedSearchParams instead of constructing URLSearchParams manually.',
    severity: 'info',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    if (!isProjectDependency(context.getFilePath(), '@pyreon/router')) {
      return {}
    }

    let importsRouter = false

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (info && info.source === '@pyreon/router') {
          importsRouter = true
        }
      },
      NewExpression(node: any) {
        if (!importsRouter) return
        const callee = node.callee
        if (
          !callee ||
          callee.type !== 'Identifier' ||
          callee.name !== 'URLSearchParams'
        ) {
          return
        }

        context.report({
          message:
            'Manual `new URLSearchParams(...)` in a routed file — use `useTypedSearchParams({ page: \'number\', q: \'string\' })` from @pyreon/router for auto-coerced, reactive, structurally-shared search params.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
