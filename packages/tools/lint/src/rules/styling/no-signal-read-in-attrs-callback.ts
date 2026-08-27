import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Dependency-gated `@pyreon/rocketstyle` rule.
 *
 * rocketstyle `.attrs()` callbacks run ONCE at component setup (the
 * documented contract — see `.claude/rules/code-style.md` "Severity-driven
 * live-region roles use the `.attrs((props) => …)` CALLBACK form"). A
 * zero-arg call of a signal/computed binding inside the callback —
 * `.attrs((props, theme) => ({ 'aria-expanded': open() ? 'true' : 'false' }))`
 * — therefore captures a DEAD value: the signal changes, the attr never
 * updates, and nothing errors. Real-world shape: an upstream ui-collapse
 * that never collapsed because its `.attrs()` read the collapse signal
 * directly.
 *
 * Fires on: a zero-arg CallExpression of a binding declared same-file as
 * `const x = signal(...)` / `const x = computed(...)`, in the IMMEDIATE
 * body of the function passed to a `.attrs(...)` member call.
 *
 * Does NOT fire on:
 *   - `props.*` / `theme.*` reads (member access / member calls — the
 *     documented legitimate `.attrs()` inputs)
 *   - calls WITH arguments (not a signal read)
 *   - identifiers not tracked to a same-file signal/computed `const`
 *   - the `.attrs({...})` object form (no callback)
 *   - reads inside a NESTED function defined within the callback (an
 *     event handler re-runs per invocation and reads a fresh value —
 *     only the once-at-setup immediate scope is dead)
 *
 * Bindings are collected in a single top-down pass (same discipline as
 * `no-signal-call-write`): oxc visits VariableDeclaration in document
 * order before the use sites that follow it. A signal declared BELOW the
 * `.attrs()` call is not tracked — conservative false-negative, never a
 * false positive.
 *
 * oxc visitor callbacks get NO parent pointer, so "inside the attrs
 * callback" is tracked by pre-marking the callback function node in a
 * WeakSet at the `.attrs(...)` CallExpression visit (parents are visited
 * before children) and maintaining a function-scope stack via
 * enter/exit callbacks.
 *
 * Stays completely silent in projects that don't depend on
 * `@pyreon/rocketstyle` (dep-gated, zero noise, zero config).
 */
function isFunctionExprNode(node: any): boolean {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  )
}

export const noSignalReadInAttrsCallback: Rule = {
  meta: {
    id: 'pyreon/no-signal-read-in-attrs-callback',
    category: 'styling',
    description:
      'Disallow signal/computed reads inside rocketstyle .attrs() callbacks — the callback runs once at setup, so the read captures a dead value that never updates.',
    severity: 'warn',
    requiresDependency: '@pyreon/rocketstyle',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}
    if (!isProjectDependency(context.getFilePath(), '@pyreon/rocketstyle')) {
      return {}
    }

    const bindings = new Set<string>()
    const attrsCallbacks = new WeakSet<object>()
    // Stack of function scopes: `true` = the current immediate scope is
    // an `.attrs()` callback body (runs once at setup); `false` = any
    // other function, including handlers DEFINED inside an attrs
    // callback (those re-run per invocation and read fresh values).
    const fnStack: boolean[] = []

    const inAttrsImmediateScope = () => fnStack[fnStack.length - 1] === true

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        if (node.kind !== 'const') return
        for (const decl of node.declarations ?? []) {
          if (decl?.type !== 'VariableDeclarator') continue
          if (decl.id?.type !== 'Identifier') continue
          const init = decl.init
          if (!init) continue
          if (!isCallTo(init, 'signal') && !isCallTo(init, 'computed')) continue
          bindings.add(decl.id.name)
        }
      },
      CallExpression(node: any) {
        const callee = node.callee
        // Pre-mark `.attrs(fn)` callbacks — the parent CallExpression is
        // visited before its argument function, so the mark is in place
        // when the function's own enter callback fires.
        if (
          callee?.type === 'MemberExpression' &&
          callee.property?.type === 'Identifier' &&
          callee.property.name === 'attrs'
        ) {
          const arg0 = node.arguments?.[0]
          if (isFunctionExprNode(arg0)) attrsCallbacks.add(arg0)
        }

        if (!inAttrsImmediateScope()) return
        // Member calls (`props.active()`, `theme.spacing()`) are the
        // legitimate `.attrs()` inputs — only bare identifiers qualify.
        if (!callee || callee.type !== 'Identifier') return
        if (!bindings.has(callee.name)) return
        // A call WITH arguments is not a signal read.
        if (node.arguments && node.arguments.length > 0) return

        const name = callee.name
        context.report({
          message:
            `rocketstyle .attrs() callbacks run ONCE at setup — \`${name}()\` here captures a dead value that never updates. ` +
            `Pass the value as a prop at the use site (\`<Comp x={${name}()} />\` — the rocketstyle pipeline keeps compiler-emitted reactive props live), or move the read into an event handler / the component body.`,
          span: getSpan(node),
        })
      },
      ArrowFunctionExpression(node: any) {
        fnStack.push(attrsCallbacks.has(node))
      },
      'ArrowFunctionExpression:exit'() {
        fnStack.pop()
      },
      FunctionExpression(node: any) {
        fnStack.push(attrsCallbacks.has(node))
      },
      'FunctionExpression:exit'() {
        fnStack.pop()
      },
      FunctionDeclaration() {
        fnStack.push(false)
      },
      'FunctionDeclaration:exit'() {
        fnStack.pop()
      },
    }
    return callbacks
  },
}
