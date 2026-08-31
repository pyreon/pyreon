import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A server-side `fetch` that ignores the inbound request's abort signal.
 *
 * The client hangs up — navigates away, times out, closes the tab — and the
 * handler carries on: the upstream call completes, its response is parsed, and
 * whatever it triggers still happens, for a response nobody will read. Under
 * load that is a connection pool spent on abandoned work, and it is invisible
 * because nothing errors.
 *
 * Forwarding costs one property: `fetch(url, { signal: req.signal })`. The
 * platform then aborts the outbound call when the inbound one dies.
 *
 * Only reported when an inbound request object is actually in scope — a
 * handler parameter named like a request. A `fetch` in a script with no
 * request to forward has nothing to forward, and flagging it would be noise.
 */
const REQUEST_PARAM = /^(req|request|ctx|context|event)$/i

/** Does this options object mention `signal`? */
function mentionsSignal(node: any): boolean {
  if (node?.type !== 'ObjectExpression') return false
  return (node.properties ?? []).some(
    (p: any) =>
      (p?.type === 'Property' &&
        ((p.key?.type === 'Identifier' && String(p.key.name) === 'signal') ||
          (p.key?.type === 'Literal' && String(p.key.value) === 'signal'))) ||
      p?.type === 'SpreadElement',
  )
}

export const requireRequestSignalForwarding: Rule = {
  meta: {
    id: 'pyreon/require-request-signal-forwarding',
    category: 'backend',
    description:
      "An outbound fetch that ignores the inbound request's abort signal keeps working after the client hangs up — a connection spent on a response nobody will read.",
    severity: 'warn',
    appliesTo: ['server'],
    fixable: false,
  },
  create(context) {
    /** Names of request-ish parameters currently in scope. */
    const scopes: string[][] = []
    const enter = (node: any) => {
      const names: string[] = []
      for (const p of (node?.params ?? []) as any[]) {
        if (p?.type === 'Identifier' && REQUEST_PARAM.test(String(p.name))) names.push(String(p.name))
      }
      scopes.push(names)
    }
    const exit = () => scopes.pop()
    const inScope = (): string | null => {
      for (let i = scopes.length - 1; i >= 0; i--) {
        const s = scopes[i]
        if (s && s.length > 0) return s[0] as string
      }
      return null
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,

      CallExpression(node: any) {
        if (node?.callee?.type !== 'Identifier' || String(node.callee.name) !== 'fetch') return
        const reqName = inScope()
        if (reqName === null) return // nothing to forward
        const opts = (node.arguments ?? [])[1]
        if (opts !== undefined && (opts.type !== 'ObjectExpression' || mentionsSignal(opts))) return
        context.report({
          message: `This outbound \`fetch\` ignores \`${reqName}.signal\`, so when the client hangs up the upstream call carries on — the response is fetched and parsed for nobody, and under load that is a connection spent on abandoned work. Nothing errors, which is why it goes unnoticed. Pass \`{ signal: ${reqName}.signal }\`.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
