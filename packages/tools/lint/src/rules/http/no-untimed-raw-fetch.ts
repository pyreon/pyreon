import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/http` rule.
 *
 * This is deliberately NOT a "prefer our client" style rule. It targets
 * one concrete defect: **`fetch` has no default timeout**. A request to a
 * host that accepts the connection and then never responds stays pending
 * forever — the promise never settles, the loading spinner never stops,
 * and any `await` behind it is wedged for the life of the page. There is
 * no browser-level deadline to fall back on.
 *
 * So the rule fires on a raw `fetch()` that passes NEITHER a `signal` nor
 * any options object at all — the shapes with no possible escape. A
 * `fetch(url, { signal })` is fine however that signal was produced, and
 * so is a `fetch` inside a package that legitimately wraps it.
 *
 * Not auto-fixable: the fix is either routing through a client with a
 * deadline (`api.get(url)`) or adding `AbortSignal.timeout(ms)`, and which
 * one is right depends on whether the call site has a client in scope.
 *
 * Severity `info`, opt-in, dependency-gated. Worth being explicit about
 * the trade-off: as an opt-in rule this enforces close to nothing by
 * default. Promoting it to a `recommended` warning would make it real,
 * but that is an opinionated call about a global built-in and should be a
 * deliberate decision rather than a side effect of adding the package.
 */
export const noUntimedRawFetch: Rule = {
  meta: {
    id: 'pyreon/no-untimed-raw-fetch',
    category: 'http',
    description:
      'A raw fetch() with no signal has no deadline — a server that never responds hangs the promise forever.',
    severity: 'info',
    requiresDependency: '@pyreon/http',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}
    if (!isProjectDependency(context.getFilePath(), '@pyreon/http')) return {}

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node.callee
        if (callee?.type !== 'Identifier' || callee.name !== 'fetch') return

        const init = node.arguments?.[1]

        // Anything other than a plain object literal (a spread variable, a
        // call result) may carry a signal the rule cannot see — stay quiet.
        if (init && init.type !== 'ObjectExpression') return

        if (init?.type === 'ObjectExpression') {
          const hasSignal = (init.properties ?? []).some((property: any) => {
            if (property?.type === 'SpreadElement') return true // may contain it
            const key = property?.key
            const name = key?.type === 'Identifier' ? key.name : key?.value
            return name === 'signal'
          })
          if (hasSignal) return
        }

        context.report({
          message:
            '`fetch()` has NO default timeout — if the server accepts the connection and never ' +
            'responds, this promise never settles. Route it through an @pyreon/http client ' +
            '(`api.get(url)`, 30s deadline by default), or pass one explicitly: ' +
            '`fetch(url, { signal: AbortSignal.timeout(30_000) })`.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
