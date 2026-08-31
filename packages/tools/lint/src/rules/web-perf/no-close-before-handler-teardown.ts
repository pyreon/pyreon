import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * `sock.close()` called BEFORE the socket's handlers are detached.
 *
 * `close()` only STARTS the closing handshake. The socket moves to `CLOSING`,
 * and a frame that was already buffered can still be delivered — to a handler
 * that is still attached, which then writes into the scope this teardown has
 * just disposed. Detaching first closes that window: assigning `null` to an
 * event-handler IDL attribute removes it, so a later event has nothing to call.
 *
 * This rule exists because the repo's own catalog asserted the OPPOSITE for a
 * long time — that nulling first makes a queued message "fire a null handler
 * and crash". That is not a real JavaScript behaviour, and the false mechanism
 * had been copied verbatim into `@pyreon/query`'s `use-subscription.ts` as the
 * justification for the wrong order, while `useWebSocket` and `use-sse`
 * independently did it correctly. A wrong reason in a rules file becomes a
 * comment, and a comment becomes precedent.
 *
 * Applies to `EventSource` identically — same handshake-then-deliver shape.
 *
 * Scope, and why it is asymmetric:
 * - the `close()` may sit anywhere inside an earlier statement's subtree —
 *   the real shipped instance guarded it as
 *   `if (ws.readyState === WebSocket.OPEN) { ws.close() }` with the nulls
 *   after, so a same-block-only match found NOTHING on the very defect this
 *   rule was written for. A close that ran before the handlers came off is a
 *   defect no matter what guarded it;
 * - the null assignments must be at the top level of the block, because nulls
 *   that might not run are a DIFFERENT defect (handlers never detached at
 *   all) and guessing between the two produces noise;
 * - the object must be a plain identifier or a dotted path like `this.ws`, so
 *   an expression whose two halves might not be the same object is left
 *   alone.
 */
const SOCKET_HANDLERS = new Set(['onmessage', 'onopen', 'onclose', 'onerror'])

/** A stable textual key for `ws` / `this.ws` / `a.b` — or null if unsupported. */
function objectKey(node: any): string | null {
  if (!node) return null
  if (node.type === 'Identifier') return String(node.name)
  if (node.type === 'ThisExpression') return 'this'
  if (node.type === 'MemberExpression' && node.computed !== true) {
    const o = objectKey(node.object)
    const p = node.property?.type === 'Identifier' ? String(node.property.name) : null
    return o !== null && p !== null ? `${o}.${p}` : null
  }
  return null
}

/**
 * Every `<obj>.close()` inside a statement's subtree, as `[key, node]`.
 *
 * Bounded depth: a teardown guard is shallow, and an unbounded walk over a
 * whole function body would start matching closes from unrelated nested
 * callbacks that do not run in this teardown's order.
 */
function findCloseCalls(node: any, depth = 0, out: [string, any][] = []): [string, any][] {
  if (!node || typeof node !== 'object' || depth > 6) return out
  // Do not descend into a nested function — its body runs later, if ever.
  if (
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'ArrowFunctionExpression'
  ) {
    return out
  }
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.computed !== true &&
    node.callee.property?.type === 'Identifier' &&
    String(node.callee.property.name) === 'close'
  ) {
    const key = objectKey(node.callee.object)
    if (key !== null) out.push([key, node])
  }
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'parent') continue
    const v = (node as Record<string, unknown>)[k]
    if (Array.isArray(v)) for (const c of v) findCloseCalls(c, depth + 1, out)
    else if (v && typeof v === 'object') findCloseCalls(v, depth + 1, out)
  }
  return out
}

export const noCloseBeforeHandlerTeardown: Rule = {
  meta: {
    id: 'pyreon/no-close-before-handler-teardown',
    category: 'web-perf',
    description:
      '`close()` before detaching a socket\'s handlers leaves a window where a buffered frame still fires into a disposed scope — null the handlers first, then close.',
    severity: 'warn',
    appliesTo: ['client', 'shared'],
    fixable: false,
  },
  create(context) {
    /** Per-block: object key -> index of the statement that called close(). */
    const callbacks: VisitorCallbacks = {
      BlockStatement(node: any) {
        const body = (node?.body ?? []) as any[]
        const closedAt = new Map<string, any>()

        for (const stmt of body) {
          // A close() anywhere in this statement's subtree counts — the real
          // instance wrapped it in a readyState guard.
          for (const [key, closeNode] of findCloseCalls(stmt)) {
            if (!closedAt.has(key)) closedAt.set(key, closeNode)
          }

          if (stmt?.type !== 'ExpressionStatement') continue
          const expr = stmt.expression


          // `x.onmessage = null` — only interesting AFTER a close on the same x.
          if (
            expr?.type === 'AssignmentExpression' &&
            String(expr.operator) === '=' &&
            expr.right?.type === 'Literal' &&
            expr.right.value === null &&
            expr.left?.type === 'MemberExpression' &&
            expr.left.computed !== true &&
            expr.left.property?.type === 'Identifier' &&
            SOCKET_HANDLERS.has(String(expr.left.property.name))
          ) {
            const key = objectKey(expr.left.object)
            if (key === null) continue
            const closeNode = closedAt.get(key)
            if (closeNode === undefined) continue
            const handler = String(expr.left.property.name)
            context.report({
              message: `\`${key}.close()\` runs before \`${key}.${handler} = null\`. close() only starts the closing handshake, so a buffered frame can still reach the handler and write into a scope this teardown has already disposed. Detach the handlers FIRST, then call close().`,
              span: getSpan(closeNode),
            })
            // One report per object per block — the whole teardown is one defect.
            closedAt.delete(key)
          }
        }
      },
    }
    return callbacks
  },
}
