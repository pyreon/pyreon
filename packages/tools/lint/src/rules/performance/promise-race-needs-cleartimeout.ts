import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Find every descendant CallExpression that looks like
 * `Promise.race([<work>, new Promise((_, reject) => setTimeout(...))])`.
 *
 * Returns the array of matching call nodes — typically 0 or 1 per
 * try block, but a single block CAN contain multiple races (rare).
 */
function findRaceWithTimeoutCalls(root: any): any[] {
  const matches: any[] = []
  function walk(node: any): void {
    if (!node || typeof node !== 'object') return

    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      node.callee.object?.type === 'Identifier' &&
      node.callee.object.name === 'Promise' &&
      node.callee.property?.type === 'Identifier' &&
      node.callee.property.name === 'race'
    ) {
      const args = node.arguments ?? []
      const firstArg = args[0]
      if (firstArg?.type === 'ArrayExpression') {
        // Look for ANY entry that is `new Promise((_, reject) =>
        // setTimeout(...))`. Conservative match — we don't try to
        // detect inline anonymous timeouts in deeply-nested arrow
        // bodies, just the canonical `new Promise(...setTimeout...)`
        // shape that the four real-world cases (#734 isr, #735
        // ssg-plugin ×2) use.
        for (const entry of firstArg.elements ?? []) {
          if (isTimeoutPromiseShape(entry)) {
            matches.push(node)
            break
          }
        }
      }
    }

    for (const key in node) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue
      const child = node[key]
      if (Array.isArray(child)) {
        for (const c of child) walk(c)
      } else if (child && typeof child === 'object' && typeof child.type === 'string') {
        walk(child)
      }
    }
  }
  walk(root)
  return matches
}

/**
 * Match `new Promise((_, reject) => setTimeout(...))` — the canonical
 * "timeout branch" shape used in every real case from the leak hunts.
 */
function isTimeoutPromiseShape(node: any): boolean {
  if (!node || node.type !== 'NewExpression') return false
  if (node.callee?.type !== 'Identifier' || node.callee.name !== 'Promise') return false
  const args = node.arguments ?? []
  if (args.length < 1) return false
  const executor = args[0]
  if (executor.type !== 'ArrowFunctionExpression' && executor.type !== 'FunctionExpression') {
    return false
  }
  // Check the executor body contains setTimeout
  return containsSetTimeoutCall(executor.body)
}

function containsSetTimeoutCall(body: any): boolean {
  if (!body || typeof body !== 'object') return false
  if (
    body.type === 'CallExpression' &&
    body.callee?.type === 'Identifier' &&
    body.callee.name === 'setTimeout'
  ) {
    return true
  }
  for (const key in body) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    const child = body[key]
    if (Array.isArray(child)) {
      for (const c of child) {
        if (containsSetTimeoutCall(c)) return true
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      if (containsSetTimeoutCall(child)) return true
    }
  }
  return false
}

/**
 * Walk down a block and check if it contains a `clearTimeout(...)` call.
 */
function containsClearTimeout(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'clearTimeout'
  ) {
    return true
  }
  for (const key in node) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const c of child) {
        if (containsClearTimeout(c)) return true
      }
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      if (containsClearTimeout(child)) return true
    }
  }
  return false
}

export const promiseRaceNeedsCleartimeout: Rule = {
  meta: {
    id: 'pyreon/promise-race-needs-cleartimeout',
    category: 'performance',
    description:
      'Flag `Promise.race([work, setTimeout-reject])` without a corresponding `clearTimeout` in a `finally` block — the timer leaks until it fires when `work` wins the race.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      TryStatement(node: any) {
        // Find any Promise.race-with-timeout calls INSIDE this try's
        // block (NOT in nested try blocks — those have their own
        // finally requirement and will be visited separately).
        const raceCalls = findRaceWithTimeoutCalls(node.block)
        if (raceCalls.length === 0) return

        // The finalizer (finally block) must exist AND contain a
        // clearTimeout call. Otherwise the success path leaks the
        // setTimeout closure until it fires later.
        const finalizer = node.finalizer
        const hasCleanup = finalizer ? containsClearTimeout(finalizer) : false
        if (hasCleanup) return

        for (const race of raceCalls) {
          context.report({
            message:
              '`Promise.race` with a `setTimeout` rejection branch — capture the timer id and call `clearTimeout(id)` in a `finally` block. Without it, every successful race leaks the timer + rejection closure until the timeout fires.',
            span: getSpan(race),
          })
        }
      },
    }
    return callbacks
  },
}
