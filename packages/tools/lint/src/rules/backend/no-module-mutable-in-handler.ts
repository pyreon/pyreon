import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Per-request state written to a module-level binding.
 *
 * A module is evaluated once per process and shared by every concurrent
 * request. Writing request state to it means request B overwrites request A's
 * value between A's write and A's read — so A finishes using B's user, B's
 * locale, B's tenant. It is a data-leak shape, not merely a race, and it is
 * almost impossible to reproduce locally because it needs concurrency.
 *
 * The framework's answer is `runWithRequestContext`, which isolates per-request
 * state in AsyncLocalStorage so concurrent requests cannot see each other's.
 *
 * Only assignments to a module-level `let`/`var` from inside a handler are
 * reported. A module-level `const` cache that is only READ, or written once at
 * module scope, is the correct boot-time pattern and is untouched.
 */
const HANDLER_EXPORTS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'handler', 'loader', 'serverLoader', 'action', 'onRequest',
])

export const noModuleMutableInHandler: Rule = {
  meta: {
    id: 'pyreon/no-module-mutable-in-handler',
    category: 'backend',
    description:
      'Request state written to a module-level binding is shared by every concurrent request — one request overwrites another between its own write and read, so a handler finishes using someone else’s data.',
    severity: 'error',
    appliesTo: ['server'],
    fixable: false,
  },
  create(context) {
    /** Module-level `let`/`var` names — the only ones that can be reassigned. */
    const moduleMutable = new Set<string>()
    let fnDepth = 0
    /** Are we inside a request handler? */
    let handlerDepth = 0

    const enterFn = (node: any, isHandler: boolean) => {
      fnDepth++
      if (isHandler) handlerDepth++
      ;(node as { __h?: boolean }).__h = isHandler
    }
    const exitFn = (node: any) => {
      fnDepth--
      if ((node as { __h?: boolean }).__h === true) handlerDepth--
    }

    const namedHandler = (node: any): boolean => {
      const id = node?.id
      return id?.type === 'Identifier' && HANDLER_EXPORTS.has(String(id.name))
    }

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        if (fnDepth > 0) return // not module scope
        const kind = String(node?.kind ?? '')
        if (kind !== 'let' && kind !== 'var') return
        for (const d of (node.declarations ?? []) as any[]) {
          if (d?.id?.type === 'Identifier') moduleMutable.add(String(d.id.name))
        }
      },

      FunctionDeclaration(node: any) {
        enterFn(node, namedHandler(node))
      },
      'FunctionDeclaration:exit': exitFn,
      FunctionExpression(node: any) {
        enterFn(node, false)
      },
      'FunctionExpression:exit': exitFn,
      ArrowFunctionExpression(node: any) {
        enterFn(node, false)
      },
      'ArrowFunctionExpression:exit': exitFn,

      // `export const POST = async (req) => {...}` — the arrow IS the handler.
      VariableDeclarator(node: any) {
        if (fnDepth !== 0) return
        const id = node?.id
        const init = node?.init
        if (id?.type !== 'Identifier' || !HANDLER_EXPORTS.has(String(id.name))) return
        if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
          ;(init as { __handlerRoot?: boolean }).__handlerRoot = true
        }
      },

      AssignmentExpression(node: any) {
        if (handlerDepth === 0) return
        const left = node?.left
        if (left?.type !== 'Identifier') return
        const name = String(left.name)
        if (!moduleMutable.has(name)) return
        context.report({
          message: `\`${name}\` is a module-level binding, so it is shared by every concurrent request — request B overwrites it between request A's write and A's read, and A finishes using B's data. That is a data leak, not just a race, and it needs concurrency to reproduce so it will not show up locally. Use \`runWithRequestContext\` to isolate per-request state.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
