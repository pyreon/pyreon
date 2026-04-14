import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo, isMemberCallTo } from '../../utils/ast'

export const noImperativeNavigateInRender: Rule = {
  meta: {
    id: 'pyreon/no-imperative-navigate-in-render',
    category: 'router',
    description:
      'Error when navigate() or router.push() is called at the top level of a component — causes infinite render loops.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    // The rule fires ONLY when `navigate()` / `router.push()` is evaluated
    // synchronously as part of rendering the component — i.e. directly in
    // the component function body, not inside a nested function (event
    // handler, effect callback, lifecycle hook, ref callback, `.then` etc).
    // Nested functions are deferred execution: they run on user events or
    // after mount, so the navigate call isn't part of the render loop.
    let componentBodyDepth = 0
    // `nestedFnDepth` counts nested ArrowFn/FunctionExpression/FunctionDecl
    // INSIDE a component body — i.e. not the component function itself.
    // When > 0, we're in deferred execution and the rule stays silent.
    let nestedFnDepth = 0
    // Arrow/Function expressions that are the direct init of a PascalCase
    // `VariableDeclarator` (= component assignment) — marked here so the
    // ArrowFn/FunctionExpression visitor knows to NOT count them as nested.
    const componentInits = new WeakSet<any>()

    function isComponentFunctionDecl(node: any): boolean {
      return /^[A-Z]/.test(node.id?.name ?? '')
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration(node: any) {
        if (isComponentFunctionDecl(node)) componentBodyDepth++
        else if (componentBodyDepth > 0) nestedFnDepth++
      },
      'FunctionDeclaration:exit'(node: any) {
        if (isComponentFunctionDecl(node)) componentBodyDepth--
        else if (componentBodyDepth > 0) nestedFnDepth--
      },
      VariableDeclarator(node: any) {
        if (
          /^[A-Z]/.test(node.id?.name ?? '') &&
          (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
        ) {
          componentBodyDepth++
          componentInits.add(node.init)
        }
      },
      'VariableDeclarator:exit'(node: any) {
        if (
          /^[A-Z]/.test(node.id?.name ?? '') &&
          (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
        ) {
          componentBodyDepth--
        }
      },
      ArrowFunctionExpression(node: any) {
        if (componentInits.has(node)) return
        if (componentBodyDepth > 0) nestedFnDepth++
      },
      'ArrowFunctionExpression:exit'(node: any) {
        if (componentInits.has(node)) return
        if (componentBodyDepth > 0) nestedFnDepth--
      },
      FunctionExpression(node: any) {
        if (componentInits.has(node)) return
        if (componentBodyDepth > 0) nestedFnDepth++
      },
      'FunctionExpression:exit'(node: any) {
        if (componentInits.has(node)) return
        if (componentBodyDepth > 0) nestedFnDepth--
      },
      CallExpression(node: any) {
        if (componentBodyDepth <= 0 || nestedFnDepth > 0) return

        if (isCallTo(node, 'navigate') || isMemberCallTo(node, 'router', 'push')) {
          context.report({
            message:
              'Imperative navigation at the top level of a component — this runs on every render and causes infinite loops. Move inside `onMount`, `effect`, or an event handler.',
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
