import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isApiRouteFile } from '../../utils/file-roles'

/**
 * A promise created and dropped inside a server-side function.
 *
 * On the client a floating promise is usually a missed loading state. On the
 * server it is a dropped failure: the handler returns 200, the rejection
 * surfaces as an unhandled rejection in a log nobody is reading, and the work
 * may not have happened. The request said it succeeded.
 *
 * Reports an await-able call used as a whole expression statement. `void`-ing
 * it is accepted as an explicit "I meant to drop this", which is exactly the
 * signal the rule wants — the intent becomes visible in the source.
 */

/** Names that read as async work rather than a fire-and-forget local helper. */
/** Exports that mean "this file answers a request". */
const HANDLER_EXPORTS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'handler', 'loader', 'serverLoader', 'action', 'onRequest',
])

/**
 * Verbs that read as remote work. Deliberately excludes `read`/`write`/`load`/
 * `sync`/`flush`/`emit`, which are just as often synchronous helpers — with the
 * handler gate doing the coarse filtering, the name list only has to avoid the
 * obviously-sync words rather than carry the whole burden.
 */
const ASYNC_ISH = /^(fetch|send|save|persist|publish|enqueue|notify|insert|upsert|commit|dispatch)/i

export const noFloatingPromiseInHandler: Rule = {
  meta: {
    id: 'pyreon/no-floating-promise-in-handler',
    category: 'backend',
    description:
      'A dropped promise in a server function is a dropped failure — the handler returns success while the rejection lands in a log as an unhandled rejection.',
    severity: 'warn',
    appliesTo: ['server'],
    fixable: false,
  },
  create(context) {
    const pending: Array<{ name: string; span: { start: number; end: number } }> = []
    let servesRequests = isApiRouteFile(context.getFilePath())
    let functionDepth = 0
    const enter = () => {
      functionDepth++
    }
    const exit = () => {
      functionDepth--
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,
      ExpressionStatement(node: any) {
        if (functionDepth === 0) return
        const expr = node?.expression
        if (!expr || expr.type !== 'CallExpression') return

        const callee = expr.callee
        // `.then(...)` / `.catch(...)` chains handle themselves.
        if (
          callee?.type === 'MemberExpression' &&
          callee.property?.type === 'Identifier' &&
          ['then', 'catch', 'finally'].includes(String(callee.property.name))
        ) {
          return
        }

        const name =
          callee?.type === 'Identifier'
            ? String(callee.name)
            : callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier'
              ? String(callee.property.name)
              : null
        if (name === null || !ASYNC_ISH.test(name)) return

        pending.push({ name, span: getSpan(node) })
      },
      ExportNamedDeclaration(node: any) {
        const d = node?.declaration
        const named =
          d?.type === 'FunctionDeclaration' && d.id?.type === 'Identifier'
            ? String(d.id.name)
            : d?.type === 'VariableDeclaration'
              ? (d.declarations ?? [])
                  .map((x: any) => (x.id?.type === 'Identifier' ? String(x.id.name) : ''))
                  .find((n: string) => HANDLER_EXPORTS.has(n))
              : undefined
        if (named && HANDLER_EXPORTS.has(named)) servesRequests = true
      },
      'Program:exit'() {
        if (!servesRequests) return
        for (const f of pending) {
          context.report({
            message: `\`${f.name}(…)\` looks like async work but its promise is dropped — on the server that is a dropped FAILURE: the handler returns success and the rejection becomes an unhandled rejection in a log nobody is reading. \`await\` it, return it, or \`void\` it to say the drop is deliberate.`,
            span: f.span,
          })
        }
      },
    }
    return callbacks
  },
}
