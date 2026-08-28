import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A catch block that throws a NEW error without passing the original as `cause`.
 *
 * `catch (e) { throw new Error('failed to load config') }` replaces the stack
 * that says WHERE it broke with one that says where you noticed. The original
 * error — the ENOENT, the parse position, the socket reset — is gone, and the
 * message that survives is the least informative one in the chain.
 *
 * `new Error(msg, { cause: e })` keeps both, and every modern runtime prints
 * the chain. This is the swallowed-context half of the error-handling shapes
 * this repo's catalog documents repeatedly.
 *
 * Quiet when the original is preserved some other way — as `{ cause }`, passed
 * positionally to a custom error class, or interpolated into the message —
 * because the goal is preserved context, not a particular spelling.
 */

/** Error constructors whose signature is known to accept `{ cause }`. */
const BUILTIN_ERRORS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
])

export const requireErrorCause: Rule = {
  meta: {
    id: 'pyreon/require-error-cause',
    category: 'js',
    description:
      'Re-throwing inside `catch` without `{ cause }` discards the original error — the surviving stack points at where you noticed, not where it broke.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    /** Names bound by each enclosing catch clause. */
    const caught: string[] = []

    const callbacks: VisitorCallbacks = {
      CatchClause(node: any) {
        caught.push(node?.param?.type === 'Identifier' ? String(node.param.name) : '')
      },
      'CatchClause:exit'() {
        caught.pop()
      },
      ThrowStatement(node: any) {
        if (caught.length === 0) return
        const bound = caught[caught.length - 1]
        if (!bound) return

        const arg = node?.argument
        if (arg?.type !== 'NewExpression') return
        if (arg.callee?.type !== 'Identifier') return
        // Only the BUILT-IN error constructors, which all accept
        // `{ cause }`. A custom class has its own signature — `@pyreon/http`
        // deliberately converts an abort into `new TimeoutError(ms, request)`,
        // and there is no options slot to put a cause in. Telling the author
        // to pass one they cannot pass is the false positive that gets a rule
        // switched off; if the class should carry a cause, that is a change to
        // the class, not to this call site.
        if (!BUILTIN_ERRORS.has(String(arg.callee.name))) return

        const args = arg.arguments ?? []
        // A custom error class often takes the cause POSITIONALLY —
        // `new ResponseValidationError(cause, raw, request)`. The original is
        // preserved there just as well as in `{ cause }`, and flagging it was
        // a false positive on every such class in this repo.
        const passedPositionally = args.some(
          (a: any) => a?.type === 'Identifier' && String(a.name) === bound,
        )
        if (passedPositionally) return
        const opts = args[1]
        if (opts?.type === 'ObjectExpression') {
          const hasCause = (opts.properties ?? []).some(
            (p: any) =>
              p.type === 'Property' && p.key?.type === 'Identifier' && String(p.key.name) === 'cause',
          )
          if (hasCause) return
        }
        // Interpolating the original into the message preserves it too.
        const first = args[0]
        if (first?.type === 'TemplateLiteral') {
          const mentions = (first.expressions ?? []).some(
            (e: any) => e?.type === 'Identifier' && String(e.name) === bound,
          )
          if (mentions) return
        }

        context.report({
          message: `Re-throwing without \`{ cause: ${bound} }\` discards the original error — the stack that survives points at this line, not at what actually failed. Use \`new Error(message, { cause: ${bound} })\`.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
