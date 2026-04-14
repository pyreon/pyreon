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
    // The rule fires when `navigate()` / `router.push()` runs synchronously
    // as part of rendering the component — the infinite-render-loop case.
    //
    // The render path consists of the component body itself PLUS any nested
    // function that is called synchronously from the render body (IIFEs,
    // locally-bound fns that are invoked immediately). Nested functions
    // that are stored (assigned to a const, returned, passed as a callback
    // to an event handler / setTimeout / .then) are deferred execution and
    // don't contribute to the render-loop bug.
    let componentBodyDepth = 0
    // Depth inside a nested non-component function AT ALL — used to scope
    // call-tracking (we only record nested-fn calls while inside a
    // component body, not in module-level code).
    let nestedFnDepth = 0
    // Arrow/Function expressions that are the direct init of a PascalCase
    // `VariableDeclarator` (= component assignment) — marked so the
    // ArrowFn/FunctionExpression visitor knows to NOT count them as nested.
    const componentInits = new WeakSet<any>()
    // Names of locally-bound nested fns (e.g. `const fn = () => router.push(...)`)
    // whose body contains a dangerous navigation call. Populated during the
    // nested fn's walk; checked on synchronous `fn()` calls in the render
    // body. Stack-scoped to the enclosing component so nested components
    // don't leak bindings.
    const dangerousBindings: Array<Set<string>> = []
    // When we're inside a nested fn whose binding might be dangerous, mark
    // the current nested fn as "contains navigate" if we see one.
    const nestedFnStack: Array<{ containsNavigate: boolean; bindingName: string | null }> = []

    function isComponentFunctionDecl(node: any): boolean {
      return /^[A-Z]/.test(node.id?.name ?? '')
    }

    function enterNestedFn(node: any, bindingName: string | null) {
      nestedFnDepth++
      nestedFnStack.push({ containsNavigate: false, bindingName })
    }
    function exitNestedFn() {
      nestedFnDepth--
      const frame = nestedFnStack.pop()
      if (!frame) return
      if (frame.containsNavigate && frame.bindingName && dangerousBindings.length > 0) {
        dangerousBindings[dangerousBindings.length - 1]!.add(frame.bindingName)
      }
    }

    function isNavigateCall(node: any): boolean {
      return isCallTo(node, 'navigate') || isMemberCallTo(node, 'router', 'push')
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration(node: any) {
        if (isComponentFunctionDecl(node)) {
          componentBodyDepth++
          dangerousBindings.push(new Set())
        } else if (componentBodyDepth > 0) {
          enterNestedFn(node, node.id?.type === 'Identifier' ? node.id.name : null)
        }
      },
      'FunctionDeclaration:exit'(node: any) {
        if (isComponentFunctionDecl(node)) {
          componentBodyDepth--
          dangerousBindings.pop()
        } else if (componentBodyDepth > 0) {
          exitNestedFn()
        }
      },
      VariableDeclarator(node: any) {
        if (
          /^[A-Z]/.test(node.id?.name ?? '') &&
          (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
        ) {
          componentBodyDepth++
          dangerousBindings.push(new Set())
          componentInits.add(node.init)
        }
      },
      'VariableDeclarator:exit'(node: any) {
        if (
          /^[A-Z]/.test(node.id?.name ?? '') &&
          (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
        ) {
          componentBodyDepth--
          dangerousBindings.pop()
        }
      },
      ArrowFunctionExpression(node: any) {
        if (componentInits.has(node)) return
        if (componentBodyDepth > 0) {
          // Binding name comes from the parent VariableDeclarator if the
          // arrow is its init — e.g. `const fn = () => …`. Parent is not
          // passed by oxc, so we rely on order: `VariableDeclarator` visits
          // before its init. We patch the binding name in a pre-visitor pass.
          enterNestedFn(node, bindingAssignmentNames.get(node) ?? null)
        }
      },
      'ArrowFunctionExpression:exit'(node: any) {
        if (componentInits.has(node)) return
        if (componentBodyDepth > 0) exitNestedFn()
      },
      FunctionExpression(node: any) {
        if (componentInits.has(node)) return
        if (componentBodyDepth > 0) {
          enterNestedFn(node, bindingAssignmentNames.get(node) ?? null)
        }
      },
      'FunctionExpression:exit'(node: any) {
        if (componentInits.has(node)) return
        if (componentBodyDepth > 0) exitNestedFn()
      },
      CallExpression(node: any) {
        if (componentBodyDepth <= 0) return

        // Direct `navigate()` / `router.push()` call. At render-body depth
        // (nestedFnDepth === 0) it's the classic infinite-loop bug. Inside
        // a nested fn, mark the enclosing frame as dangerous (so a later
        // sync call of that fn's binding re-surfaces the issue).
        if (isNavigateCall(node)) {
          if (nestedFnDepth === 0) {
            context.report({
              message:
                'Imperative navigation at the top level of a component — this runs on every render and causes infinite loops. Move inside `onMount`, `effect`, or an event handler.',
              span: getSpan(node),
            })
          } else if (nestedFnStack.length > 0) {
            nestedFnStack[nestedFnStack.length - 1]!.containsNavigate = true
          }
          return
        }

        // Sync invocation (at render-body depth) of a locally-bound fn
        // whose body contains `navigate()`. `const fn = () => router.push();
        // fn()` IS the infinite-loop bug — the previous rewrite missed it.
        if (
          nestedFnDepth === 0 &&
          node.callee?.type === 'Identifier' &&
          dangerousBindings.length > 0 &&
          dangerousBindings[dangerousBindings.length - 1]!.has(node.callee.name)
        ) {
          context.report({
            message:
              'Synchronous call of a nested function that performs imperative navigation — this runs during render and causes infinite loops. Move the call inside `onMount`, `effect`, or an event handler.',
            span: getSpan(node),
          })
        }
      },
    }

    // Pre-walk: for each `VariableDeclarator` whose init is an ArrowFn or
    // FunctionExpression, stash the binding name against the init node so
    // the ArrowFn/FunctionExpression visitor can retrieve it without needing
    // parent-in-visitor (oxc doesn't pass parent).
    const bindingAssignmentNames = new WeakMap<any, string>()
    callbacks.VariableDeclaration = (node: any) => {
      for (const decl of node.declarations ?? []) {
        if (
          decl.id?.type === 'Identifier' &&
          (decl.init?.type === 'ArrowFunctionExpression' ||
            decl.init?.type === 'FunctionExpression')
        ) {
          bindingAssignmentNames.set(decl.init, decl.id.name)
        }
      }
    }
    return callbacks
  },
}
