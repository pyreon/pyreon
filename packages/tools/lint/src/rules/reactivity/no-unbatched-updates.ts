import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo, isSetCall } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

interface ScopeInfo {
  hasBatch: boolean
  insideBatch: boolean
  node: any
}

/**
 * Detect statements that ALWAYS terminate the enclosing function (return
 * or throw on every path). Used by `maxPathSets` BlockStatement walking
 * to short-circuit subsequent-statement summing: code AFTER an always-
 * returning statement is mutually exclusive with the early-exit path,
 * not additive.
 *
 * Closes the false-positive class where `function f() { if (cond) { x.set(1); return }; y.set(2); z.set(3) }`
 * was over-counted at 3 — the if-consequent's `return` prevents reaching
 * `y.set(2)` / `z.set(3)`, so true max-path is `max(1, 2) = 2`.
 */
function alwaysReturns(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  switch (node.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
      return true
    case 'BlockStatement':
      return (node.body as any[]).some((s: any) => alwaysReturns(s))
    case 'IfStatement':
      return alwaysReturns(node.consequent) && !!node.alternate && alwaysReturns(node.alternate)
    case 'TryStatement': {
      if (node.finalizer && alwaysReturns(node.finalizer)) return true
      const tryReturns = alwaysReturns(node.block)
      const handlerReturns = !node.handler || alwaysReturns(node.handler.body)
      return tryReturns && handlerReturns
    }
    default:
      return false
  }
}

/**
 * LT-3 Bug A: does `node`'s own evaluation contain a top-level `await`
 * (NOT one inside a nested function — that's the nested function's own async
 * boundary)? A statement whose evaluation awaits SPLITS the enclosing block
 * into synchronous microtask segments: code before the await runs in one
 * task, code after it (including the awaiting statement's own trailing work,
 * e.g. `value.set(await fetch())`) resumes in a later task. `batch()` cannot
 * span an `await`, so sets in different segments are NOT batchable together.
 */
function containsTopLevelAwait(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (node.type === 'AwaitExpression') return true
  if (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  ) {
    return false
  }
  for (const key in node) {
    if (key === 'parent') continue
    const val = node[key]
    if (Array.isArray(val)) {
      for (const c of val) if (c && typeof c.type === 'string' && containsTopLevelAwait(c)) return true
    } else if (val && typeof val.type === 'string') {
      if (containsTopLevelAwait(val)) return true
    }
  }
  return false
}

// LT-3 Bug B: constructors whose instances have a `.set(k, v)` method that is
// NOT a signal write — a triple `m.set(...)` on one of these must not be
// flagged as "unbatched signal updates". (`Set`/`WeakSet` use `.add`, so they
// never reach `isSetCall`.) Populated per-file: `nonSignalSetReceivers` records
// the local names bound to `new Map()` etc. It is a module-level `let`
// deliberately RESET at the top of every `create()` — lint runs one file at a
// time synchronously, so there is no cross-file leakage (the reset is the
// contract).
const NON_SIGNAL_SET_CTORS = new Set(['Map', 'WeakMap', 'URLSearchParams', 'Headers', 'FormData'])
let nonSignalSetReceivers = new Set<string>()

/** Is this `.set()` call on a KNOWN non-signal collection receiver? */
function isNonSignalSetCall(node: any): boolean {
  const obj = node?.callee?.object
  if (!obj) return false
  // `m.set(...)` where `m = new Map()`.
  if (obj.type === 'Identifier' && nonSignalSetReceivers.has(obj.name)) return true
  // `new Map().set(...)` — inline construction.
  if (
    obj.type === 'NewExpression' &&
    obj.callee?.type === 'Identifier' &&
    NON_SIGNAL_SET_CTORS.has(obj.callee.name)
  ) {
    return true
  }
  return false
}

/**
 * Count the MAXIMUM `.set()` calls that can fire on ANY SINGLE execution
 * path through `node`. Branching constructs (if / else / switch / try-catch
 * / ternary / logical-and-or) take MAX across mutually-exclusive arms.
 * Sequential statements sum. Nested functions are NOT counted — they
 * become their own execution paths handled by their own scope.
 *
 * **Early-return awareness** in `BlockStatement` walking: when a statement
 * always-returns on one arm (e.g. `if (cond) { ...; return }`), subsequent
 * statements are reachable ONLY via the OTHER arm. The walker splits paths
 * (`pathA = sum-so-far + early-exit-sets`, `pathB = sum-so-far + sets-on-continuation`)
 * and takes MAX, not sum.
 *
 * False positives surfaced by the old shape that motivated the rewrite:
 * - `@pyreon/form` `runValidation` — 3 `errorSig.set()` calls in 3
 *   mutually exclusive branches (validator success / threw / no validator).
 *   Old rule: 3 → flagged. New rule: max-path = 1 → silent.
 * - `@pyreon/query` `use-subscription.ts` `connect()` — !isEnabled early
 *   return + try-catch catch-returns. Real max-path = 2, walker pre-early-
 *   return summed to 3 → flagged. With early-return aware walker: 2 → silent.
 * - `@pyreon/reactivity` `createStore` proxy `set` trap — multiple
 *   `.set()` calls but per-trap-call only one fires (mutex by signal
 *   identity / Object.is dedup). Walker counts because they're sequential
 *   at the syntax level — flagged at that layer with an inline-suppression
 *   rationale (the actual runtime invariant is application-specific).
 */
function maxPathSets(node: any): number {
  if (!node || typeof node !== 'object') return 0
  switch (node.type) {
    case 'BlockStatement': {
      // Walk statements. Track two contributions:
      //   - `cumulative`: max-path through the "continuation" — statements
      //     that fall through to the next iteration.
      //   - `branchMax`: max across already-taken early-exit paths (each
      //     of those paths ends with return/throw, so it doesn't contribute
      //     to `cumulative`'s ongoing sum).
      // Final block contribution: max(cumulative, branchMax).
      const stmts = node.body as any[]
      let cumulative = 0
      let branchMax = 0
      // LT-3 Bug A: max across completed synchronous microtask SEGMENTS. An
      // `await` in a statement closes the current segment (batch() can't span
      // it); the awaiting statement's own sets begin the next segment.
      let segmentMax = 0
      for (const stmt of stmts) {
        // Await boundary: the statements accumulated so far form a completed
        // synchronous segment. Record it and reset — this statement's sets
        // (which resume AFTER the await) start the next segment.
        if (containsTopLevelAwait(stmt)) {
          segmentMax = Math.max(segmentMax, cumulative)
          cumulative = 0
        }
        // Early-exit `if`: consequent always-returns. Subsequent statements
        // reachable ONLY when the if-test is false (fallthrough).
        if (
          stmt.type === 'IfStatement' &&
          alwaysReturns(stmt.consequent) &&
          !stmt.alternate
        ) {
          // Path A — take the if (early exit): sum-so-far + sets in consequent
          branchMax = Math.max(branchMax, cumulative + maxPathSets(stmt.consequent))
          // Path B — fall through: cumulative unchanged (the if contributes 0)
          continue
        }
        // Early-exit `if/else` where consequent always-returns + alternate doesn't.
        if (
          stmt.type === 'IfStatement' &&
          alwaysReturns(stmt.consequent) &&
          stmt.alternate &&
          !alwaysReturns(stmt.alternate)
        ) {
          branchMax = Math.max(branchMax, cumulative + maxPathSets(stmt.consequent))
          cumulative += maxPathSets(stmt.alternate)
          continue
        }
        // Symmetric: alternate always-returns + consequent doesn't.
        if (
          stmt.type === 'IfStatement' &&
          stmt.alternate &&
          alwaysReturns(stmt.alternate) &&
          !alwaysReturns(stmt.consequent)
        ) {
          branchMax = Math.max(branchMax, cumulative + maxPathSets(stmt.alternate))
          cumulative += maxPathSets(stmt.consequent)
          continue
        }
        // Early-exit `try-catch` where catch always-returns (try-success
        // path continues; throw-path early-exits via catch's return).
        if (
          stmt.type === 'TryStatement' &&
          stmt.handler &&
          alwaysReturns(stmt.handler.body) &&
          !alwaysReturns(stmt.block)
        ) {
          // Throw path: try-body sets (up to throw, conservatively all of
          // them) + catch sets + early-exit.
          const tryMax = maxPathSets(stmt.block)
          const catchMax = maxPathSets(stmt.handler.body)
          const finallyMax = maxPathSets(stmt.finalizer)
          branchMax = Math.max(branchMax, cumulative + tryMax + catchMax + finallyMax)
          // Success path: try sets + finally + continue.
          cumulative += tryMax + finallyMax
          continue
        }
        // Regular sequential statement.
        cumulative += maxPathSets(stmt)
        // If THIS statement always-returns unconditionally, subsequent
        // statements are dead — stop walking.
        if (alwaysReturns(stmt)) break
      }
      return Math.max(cumulative, branchMax, segmentMax)
    }
    case 'ExpressionStatement':
      return maxPathSets(node.expression)
    case 'CallExpression':
      // A `.set()` counts as a signal write UNLESS its receiver is a known
      // non-signal collection (`Map`/`URLSearchParams`/… — Bug B).
      return isSetCall(node) && !isNonSignalSetCall(node) ? 1 : 0
    case 'IfStatement':
      return Math.max(maxPathSets(node.consequent), maxPathSets(node.alternate))
    case 'SwitchStatement':
      // Each SwitchCase.consequent is Statement[]. Cases are mutually
      // exclusive (assume no fall-through — conservative for both
      // false-positive AND false-negative directions).
      return Math.max(
        0,
        ...(node.cases as any[]).map((c: any) =>
          (c.consequent as any[]).reduce((s: number, st: any) => s + maxPathSets(st), 0),
        ),
      )
    case 'TryStatement': {
      // try OR catch (mutually exclusive on the throw path) + finally (always runs).
      const tryMax = maxPathSets(node.block)
      const catchMax = node.handler ? maxPathSets(node.handler.body) : 0
      const finallyMax = maxPathSets(node.finalizer)
      return Math.max(tryMax, catchMax) + finallyMax
    }
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      // ONE iteration's body — that's the per-event cost of batching.
      // A loop body with 4 sets benefits from batch() exactly as a
      // straight-line 4-set sequence does.
      return maxPathSets(node.body)
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration':
      // Nested function — separate execution path, handled by its own
      // scope entry. Don't double-count.
      return 0
    case 'VariableDeclaration':
      return (node.declarations as any[]).reduce(
        (sum: number, d: any) => sum + maxPathSets(d.init),
        0,
      )
    case 'ReturnStatement':
      return maxPathSets(node.argument)
    case 'ThrowStatement':
      return maxPathSets(node.argument)
    case 'AwaitExpression':
    case 'YieldExpression':
    case 'UnaryExpression':
      return maxPathSets(node.argument)
    case 'LogicalExpression':
      // `a && b.set()` — short-circuit: only one side fires.
      return Math.max(maxPathSets(node.left), maxPathSets(node.right))
    case 'ConditionalExpression':
      // ternary — mutually exclusive consequent / alternate
      return maxPathSets(node.test) + Math.max(maxPathSets(node.consequent), maxPathSets(node.alternate))
    case 'SequenceExpression':
      return (node.expressions as any[]).reduce(
        (sum: number, e: any) => sum + maxPathSets(e),
        0,
      )
    case 'AssignmentExpression':
      return maxPathSets(node.right)
    case 'LabeledStatement':
      return maxPathSets(node.body)
    default:
      return 0
  }
}

export const noUnbatchedUpdates: Rule = {
  meta: {
    id: 'pyreon/no-unbatched-updates',
    category: 'reactivity',
    description:
      'Warn when 3+ .set() calls can fire on the SAME execution path in a function without batch().',
    severity: 'warn',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}
    const scopeStack: ScopeInfo[] = []
    let batchDepth = 0
    // Reset the per-file non-signal-receiver set (Bug B). Lint is synchronous
    // per file, so a fresh Set here scopes it to this file with no leakage.
    nonSignalSetReceivers = new Set<string>()

    function enterScope(node: any) {
      scopeStack.push({ hasBatch: false, insideBatch: batchDepth > 0, node })
    }

    function exitScope() {
      const scope = scopeStack.pop()
      if (!scope) return
      if (scope.hasBatch || scope.insideBatch) return
      const body = scope.node.body
      const count = maxPathSets(body)
      if (count >= 3) {
        context.report({
          message: `${count} signal \`.set()\` calls can fire on a single execution path without \`batch()\` — wrap in \`batch(() => { ... })\` to collapse N notify cycles into one.`,
          span: getSpan(scope.node),
        })
      }
    }

    const callbacks: VisitorCallbacks = {
      // Bug B: record `const m = new Map()` / `new URLSearchParams()` / … so a
      // `m.set(...)` on it is not counted as a signal write.
      VariableDeclaration(node: any) {
        for (const decl of node.declarations ?? []) {
          if (decl.id?.type !== 'Identifier') continue
          const init = decl.init
          if (
            init?.type === 'NewExpression' &&
            init.callee?.type === 'Identifier' &&
            NON_SIGNAL_SET_CTORS.has(init.callee.name)
          ) {
            nonSignalSetReceivers.add(decl.id.name)
          }
        }
      },
      FunctionDeclaration(node: any) {
        enterScope(node)
      },
      'FunctionDeclaration:exit'() {
        exitScope()
      },
      FunctionExpression(node: any) {
        enterScope(node)
      },
      'FunctionExpression:exit'() {
        exitScope()
      },
      ArrowFunctionExpression(node: any) {
        enterScope(node)
      },
      'ArrowFunctionExpression:exit'() {
        exitScope()
      },
      CallExpression(node: any) {
        const currentScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : undefined
        if (isCallTo(node, 'batch')) {
          batchDepth++
          if (currentScope) {
            currentScope.hasBatch = true
          }
        }
      },
      'CallExpression:exit'(node: any) {
        if (isCallTo(node, 'batch')) {
          batchDepth--
        }
      },
    }
    return callbacks
  },
}
