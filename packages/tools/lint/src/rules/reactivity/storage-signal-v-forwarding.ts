import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Flag signal-wrapper callables that delegate `.direct` to a base signal
 * but do NOT also forward the internal `_v` field via `Object.defineProperty`.
 *
 * Background: the compiler emits `_bindText(source, textNode)` for JSX
 * shape `{() => signal()}` where `signal` is a callable. `_bindText`'s
 * fast path reads `source._v` directly (skipping the function call) for
 * BOTH the initial render AND every subscriber re-run. A wrapper that
 * delegates `.direct` enables that fast path — but if `_v` is missing,
 * the binding writes `String(undefined)` → `''` and re-writes empty on
 * every change. localStorage / sessionStorage / cookies still update;
 * the DOM stays empty.
 *
 * Bug shipped in `@pyreon/storage` from package inception for ~9 months
 * before being fixed in PR #546. This rule prevents recurrence in:
 *   - Future framework backends (additional `createStorage` callers,
 *     new wrapper helpers extracted from the 4 existing factories)
 *   - User-side custom backends built without `createStorage()`
 *   - Third-party signal-like adapters
 *
 * Detected shapes (per-function scope):
 *   x.direct = y.direct
 *   x.direct = (...) => y.direct(...)
 *   x.direct = function (...) { return y.direct(...) }
 *
 * Acceptable companions (in the same function scope):
 *   Object.defineProperty(x, '_v', { get: () => y._v })
 *   x._v = y._v
 *   Object.defineProperty(x, '_v', { value: ... })
 *
 * Out of scope: cross-function tracking, identifier aliasing
 * (`const w = x; w.direct = …; Object.defineProperty(x, '_v', …)`).
 * The lint heuristic operates at single-function granularity — that's
 * the level the bug originally lived at (createStorageSignal inside
 * `packages/fundamentals/storage/src/local.ts`).
 */

interface ScopeFrame {
  /** Object identifier → AssignmentExpression node for the `.direct =` site */
  directAssigns: Map<string, unknown>
  /** Object identifiers that have `_v` forwarded in this scope */
  vForwards: Set<string>
}

function isDirectDelegation(rhs: any): boolean {
  if (!rhs) return false

  // x.direct = y.direct
  if (rhs.type === 'MemberExpression' && rhs.property?.name === 'direct') {
    return true
  }

  // x.direct = (...) => y.direct(...)
  // x.direct = function (...) { return y.direct(...) }
  if (rhs.type === 'ArrowFunctionExpression' || rhs.type === 'FunctionExpression') {
    const body = rhs.body
    if (!body) return false

    // Arrow with implicit-return expression body
    if (body.type !== 'BlockStatement') {
      return isDirectCall(body)
    }

    // Block body — look for a single `return y.direct(...)` statement
    const stmts = body.body
    if (!stmts || stmts.length !== 1) return false
    const stmt = stmts[0]
    if (stmt.type !== 'ReturnStatement') return false
    return isDirectCall(stmt.argument)
  }

  return false
}

function isDirectCall(expr: any): boolean {
  if (!expr || expr.type !== 'CallExpression') return false
  const callee = expr.callee
  return Boolean(callee && callee.type === 'MemberExpression' && callee.property?.name === 'direct')
}

function getStringLiteralValue(node: any): string | null {
  if (!node) return null
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  // oxc emits StringLiteral for plain string literals
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return node.value
  return null
}

export const storageSignalVForwarding: Rule = {
  meta: {
    id: 'pyreon/storage-signal-v-forwarding',
    category: 'reactivity',
    description:
      'Signal-wrapper callables delegating `.direct` to a base signal must also forward the internal `_v` field. Without forwarding, the compiler-emitted `_bindText` fast path reads `undefined` and renders empty text post-hydration.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const stack: ScopeFrame[] = []

    const enter = () => {
      stack.push({ directAssigns: new Map(), vForwards: new Set() })
    }
    const exit = () => {
      const scope = stack.pop()
      if (!scope) return
      for (const [name, node] of scope.directAssigns) {
        if (scope.vForwards.has(name)) continue
        context.report({
          message:
            `Signal wrapper '${name}' delegates \`.direct\` to a base signal but ` +
            `does not forward \`_v\`. The compiler-emitted \`_bindText\` fast path reads ` +
            `\`${name}._v\` directly — without forwarding, the binding writes ` +
            `\`''\` on initial render AND every subscriber notification, even after ` +
            `\`.set()\` calls. Add: \`Object.defineProperty(${name}, '_v', ` +
            `{ get: () => sig._v, configurable: true })\` in the same scope. Reference: ` +
            `\`packages/fundamentals/storage/src/local.ts:createStorageSignal\` ` +
            `for the canonical shape.`,
          span: getSpan(node as { start: number; end: number }),
        })
      }
    }

    const callbacks: VisitorCallbacks = {
      Program: enter,
      'Program:exit': exit,
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,

      AssignmentExpression(node: any) {
        const scope = stack[stack.length - 1]
        if (!scope) return

        const left = node.left
        if (left?.type !== 'MemberExpression') return
        if (left.object?.type !== 'Identifier') return
        const objName = left.object.name

        const propName = left.property?.name ?? getStringLiteralValue(left.property)

        if (propName === 'direct' && isDirectDelegation(node.right)) {
          scope.directAssigns.set(objName, node)
        } else if (propName === '_v') {
          // Plain `x._v = ...` counts as forwarding (rare but valid)
          scope.vForwards.add(objName)
        }
      },

      CallExpression(node: any) {
        const scope = stack[stack.length - 1]
        if (!scope) return

        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return
        if (callee.object?.type !== 'Identifier' || callee.object.name !== 'Object') return
        if (callee.property?.name !== 'defineProperty') return

        const args = node.arguments
        if (!args || args.length < 2) return

        const target = args[0]
        if (target?.type !== 'Identifier') return

        const propValue = getStringLiteralValue(args[1])
        if (propValue !== '_v') return

        scope.vForwards.add(target.name)
      },
    }

    return callbacks
  },
}
