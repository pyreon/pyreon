import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/http` rule.
 *
 * `api.get(`/users/${id}`)` splices a raw value into a URL. If `id` ever
 * contains `/`, `?`, `#`, or `..` it escapes its path segment and the
 * request goes somewhere else entirely — `id = '1/../admin'` reaches
 * `/admin`. It is the URL-shaped sibling of SQL string concatenation, and
 * it is silent: the request succeeds, just against the wrong resource.
 *
 * The client already has the safe form. `params` runs every value through
 * `encodeURIComponent`, so the same input becomes `1%2F..%2Fadmin` and
 * stays one segment:
 *
 *     api.get('/users/:id', { params: { id } })
 *
 * ## Precision
 *
 * Fires only on a MEMBER call whose method is an HTTP verb and whose
 * first argument is a template literal WITH at least one interpolation.
 * A template literal with no expressions (`` api.get(`/users`) ``) is
 * just a string and is not flagged.
 *
 * Not auto-fixable, deliberately: rewriting to `params` requires naming
 * each placeholder, and a generated name (`:p0`) would be worse than the
 * developer choosing one. The message shows the shape instead.
 *
 * Known limit: the rule matches by method name, so a non-HTTP object with
 * a `.get()` taking a template literal is a possible false positive. That
 * is why it is opt-in and dependency-gated — it only runs in projects that
 * actually depend on `@pyreon/http`.
 */
const REQUEST_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'request',
])

export const noUnencodedPathInterpolation: Rule = {
  meta: {
    id: 'pyreon/no-unencoded-path-interpolation',
    category: 'http',
    description:
      'Interpolating a value into an HTTP path skips URL encoding — a value containing "/" escapes its segment. Use the `params` option.',
    severity: 'warn',
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
        if (callee?.type !== 'MemberExpression') return
        if (callee.property?.type !== 'Identifier') return
        if (!REQUEST_METHODS.has(callee.property.name)) return

        // `request(method, path, …)` puts the path second.
        const pathIndex = callee.property.name === 'request' ? 1 : 0
        const pathArg = node.arguments?.[pathIndex]
        if (pathArg?.type !== 'TemplateLiteral') return
        if (!Array.isArray(pathArg.expressions) || pathArg.expressions.length === 0) return

        context.report({
          message:
            'Interpolating into an HTTP path skips URL encoding — a value containing "/" or "?" ' +
            'escapes its segment and the request silently reaches a different resource. ' +
            "Use a placeholder instead: `api.get('/users/:id', { params: { id } })`, which " +
            'encodeURIComponent-encodes every value.',
          span: getSpan(pathArg),
        })
      },
    }
    return callbacks
  },
}
