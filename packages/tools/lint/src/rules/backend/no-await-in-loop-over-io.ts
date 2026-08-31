import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isApiRouteFile } from '../../utils/file-roles'

/**
 * `await` on I/O inside a loop, where the iterations do not depend on each
 * other.
 *
 * N sequential round-trips instead of one concurrent batch. On a request path
 * that is the difference between a handler that answers in 40ms and one that
 * answers in two seconds, and it degrades linearly with data nobody controls.
 *
 * `Promise.all(items.map(...))` is the fix when the work is independent. When
 * it is NOT independent — each pass feeding the next, a rate limit, a
 * transaction — sequential is correct, which is why this is a warning rather
 * than an error and why the message says so.
 *
 * Only awaits on a call that LOOKS like I/O are reported (`fetch`, or a method
 * whose name suggests a network or database hop). An `await` on a resolved
 * value in a loop is cheap and not worth a finding.
 *
 * And only inside an actual REQUEST PATH, which is the correction that made
 * this rule usable: `appliesTo: ['server']` alone is too broad, because the
 * role resolver calls build tooling server-role too. Run against this repo
 * without the handler gate it reported 15 findings, every one of them an SSG
 * plugin, a template engine or a scanner — code that is legitimately
 * sequential and never serves a request. The siblings in this group
 * (`no-sync-fs-in-request-path`, `no-floating-promise-in-handler`) already
 * draw the line this way.
 */
const HANDLER_EXPORTS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'handler', 'loader', 'serverLoader', 'action', 'onRequest',
])
const IO_ISH = /^(fetch|get|post|put|patch|delete|query|find|insert|update|save|load|send|read|write)/i

function isIoCall(node: any): boolean {
  if (node?.type !== 'CallExpression') return false
  const c = node.callee
  if (c?.type === 'Identifier') return IO_ISH.test(String(c.name))
  if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier') {
    return IO_ISH.test(String(c.property.name))
  }
  return false
}

export const noAwaitInLoopOverIo: Rule = {
  meta: {
    id: 'pyreon/no-await-in-loop-over-io',
    category: 'backend',
    description:
      'An awaited I/O call inside a loop runs N sequential round-trips where `Promise.all` would run one batch — on a request path that scales linearly with data nobody controls.',
    severity: 'warn',
    appliesTo: ['server'],
    fixable: false,
  },
  create(context) {
    // An api route serves requests by definition; anywhere else needs a
    // handler export to prove it.
    let servesRequests = isApiRouteFile(context.getFilePath())
    let loopDepth = 0
    // A nested function inside the loop breaks the sequencing — its awaits are
    // that function's, not this loop's iteration.
    let fnDepthAtLoop: number[] = []
    let fnDepth = 0

    const enterLoop = () => {
      loopDepth++
      fnDepthAtLoop.push(fnDepth)
    }
    const exitLoop = () => {
      loopDepth--
      fnDepthAtLoop.pop()
    }
    const enterFn = () => {
      fnDepth++
    }
    const exitFn = () => {
      fnDepth--
    }

    const callbacks: VisitorCallbacks = {
      ForStatement: enterLoop,
      'ForStatement:exit': exitLoop,
      ForOfStatement: enterLoop,
      'ForOfStatement:exit': exitLoop,
      ForInStatement: enterLoop,
      'ForInStatement:exit': exitLoop,
      WhileStatement: enterLoop,
      'WhileStatement:exit': exitLoop,

      FunctionDeclaration: enterFn,
      'FunctionDeclaration:exit': exitFn,
      FunctionExpression: enterFn,
      'FunctionExpression:exit': exitFn,
      ArrowFunctionExpression: enterFn,
      'ArrowFunctionExpression:exit': exitFn,

      ExportNamedDeclaration(node: any) {
        const d = node?.declaration
        if (d?.type === 'FunctionDeclaration' && d.id?.type === 'Identifier') {
          if (HANDLER_EXPORTS.has(String(d.id.name))) servesRequests = true
          return
        }
        if (d?.type === 'VariableDeclaration') {
          for (const decl of (d.declarations ?? []) as any[]) {
            if (decl?.id?.type === 'Identifier' && HANDLER_EXPORTS.has(String(decl.id.name))) {
              servesRequests = true
            }
          }
        }
      },

      AwaitExpression(node: any) {
        if (!servesRequests) return
        if (loopDepth === 0) return
        // Only awaits in the loop's OWN body, not inside a callback declared
        // there — those run on their own schedule.
        if (fnDepth !== fnDepthAtLoop[fnDepthAtLoop.length - 1]) return
        if (!isIoCall(node.argument)) return
        context.report({
          message:
            'This awaits I/O once per iteration, so N items cost N sequential round-trips. When the iterations are independent, `await Promise.all(items.map(...))` makes it one. When they are NOT — each pass feeding the next, a rate limit, a transaction — sequential is correct and this warning is the wrong call; say so in a comment and move on.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
