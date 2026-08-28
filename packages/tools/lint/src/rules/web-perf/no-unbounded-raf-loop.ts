import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A `requestAnimationFrame` whose returned id is thrown away.
 *
 * `requestAnimationFrame(step)` as a bare statement discards the handle, so
 * there is nothing to pass to `cancelAnimationFrame`. When `step` re-schedules
 * itself — the ordinary animation-loop shape — the loop outlives whatever
 * started it: still running, still holding every value its closure captured,
 * still waking the main thread on a page the user has left.
 *
 * This repo catalogues the exact bug and the exact fix: store the id
 * (`_frameId = requestAnimationFrame(fn)`), cancel the previous one before
 * starting a new one, and cancel in `dispose()`.
 *
 * Detected on `ExpressionStatement` rather than by inspecting a parent,
 * because oxc visitor callbacks are not given one — a `parent?.type` guard
 * there silently evaluates to `undefined` and the rule never fires. Three
 * rules in this package shipped broken that way.
 */

function isRafCall(expr: any): string | null {
  const callee = expr?.callee
  if (!callee) return null
  if (callee.type === 'Identifier' && String(callee.name) === 'requestAnimationFrame') {
    return 'requestAnimationFrame'
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.property?.type === 'Identifier' &&
    String(callee.property.name) === 'requestAnimationFrame'
  ) {
    return 'requestAnimationFrame'
  }
  return null
}

/** Every identifier passed to a nested `requestAnimationFrame` in this subtree. */
function rescheduledNames(node: any, out: Set<string>, depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 12) return
  if (node.type === 'CallExpression' && isRafCall(node) !== null) {
    const cb = node.arguments?.[0]
    if (cb?.type === 'Identifier') out.add(String(cb.name))
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue
    const v = (node as Record<string, unknown>)[key]
    if (Array.isArray(v)) {
      for (const x of v) rescheduledNames(x, out, depth + 1)
    } else if (v && typeof v === 'object') rescheduledNames(v, out, depth + 1)
  }
}

/**
 * Is this a self-scheduling loop — a callback that schedules ITSELF?
 *
 * Not merely "contains a nested rAF": a double-rAF (`raf(() => raf(fn))`) is
 * the idiomatic "after the next paint" wait and it terminates. This repo's
 * own `nextFrame` batcher is exactly that shape, and an earlier cut of this
 * rule flagged it. The leak needs SELF-reference — `function step() { …
 * requestAnimationFrame(step) }` — which is what never ends.
 */
function isSelfScheduling(cb: any): boolean {
  const selfName =
    cb?.type === 'Identifier'
      ? String(cb.name)
      : (cb?.type === 'FunctionExpression' || cb?.type === 'FunctionDeclaration') &&
          cb.id?.type === 'Identifier'
        ? String(cb.id.name)
        : null
  if (selfName === null) return false
  const scheduled = new Set<string>()
  rescheduledNames(cb, scheduled)
  return scheduled.has(selfName)
}

export const noUnboundedRafLoop: Rule = {
  meta: {
    id: 'pyreon/no-unbounded-raf-loop',
    category: 'web-perf',
    description:
      'A `requestAnimationFrame` whose id is discarded can never be cancelled — a self-scheduling callback then outlives its component, holding its whole closure.',
    severity: 'warn',
    appliesTo: ['client', 'shared'],
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      ExpressionStatement(node: any) {
        const expr = node?.expression
        if (expr?.type !== 'CallExpression') return
        if (isRafCall(expr) === null) return
        // Two narrowings, both measured. A ONE-SHOT frame that discards its
        // id is ordinary — the framework's transition code flips a class next
        // frame that way (14 findings). And a nested double-rAF terminates —
        // `nextFrame` in kinetic is exactly that (1 finding). Only a callback
        // that schedules ITSELF never ends.
        if (!isSelfScheduling(expr.arguments?.[0])) return

        context.report({
          message:
            'The frame id from `requestAnimationFrame` is discarded here, so this frame can never be cancelled. If the callback re-schedules itself, the loop outlives its component — still running, still holding everything its closure captured. Assign the id (`const id = requestAnimationFrame(fn)`) and `cancelAnimationFrame(id)` on unmount.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
