import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isTestFile } from '../../utils/file-roles'

const DOM_METHODS = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
])

export const noDomInSetup: Rule = {
  meta: {
    id: 'pyreon/no-dom-in-setup',
    category: 'lifecycle',
    description: 'Warn when DOM query methods are used outside onMount or effect.',
    severity: 'warn',
    fixable: false,
    schema: {
      exemptPaths: 'string[]',
    },
  },
  create(context) {
    // A test's `document.querySelector(...)` assertion is not component setup —
    // skip test files (consistent with the SSR/browser-API rules), and honor
    // the configurable `exemptPaths` a consumer sets for DOM-only trees.
    if (isTestFile(context.getFilePath())) return {}
    if (isPathExempt(context)) return {}
    let safeDepth = 0
    function isSafeContextCall(node: any): boolean {
      // Lifecycle + effect hooks only run post-mount in a browser.
      // `onUnmount` / `onCleanup` fire after the component has mounted so
      // the DOM exists. `renderEffect` is the signal-system equivalent of
      // `effect`. `requestAnimationFrame` only schedules its callback
      // inside a browser frame, so its body is always post-setup execution.
      return (
        isCallTo(node, 'onMount') ||
        isCallTo(node, 'onUnmount') ||
        isCallTo(node, 'onCleanup') ||
        isCallTo(node, 'effect') ||
        isCallTo(node, 'renderEffect') ||
        isCallTo(node, 'requestAnimationFrame')
      )
    }
    // `if (typeof document === 'undefined') return|throw` at the head of a
    // function makes the rest of the body implicitly browser-safe — the
    // SSR path bailed out. Same heuristic as `no-window-in-ssr`.
    function isNegatedTypeofDocument(test: any): boolean {
      if (!test) return false
      if (
        test.type === 'BinaryExpression' &&
        (test.operator === '===' || test.operator === '==') &&
        test.left?.type === 'UnaryExpression' &&
        test.left.operator === 'typeof' &&
        test.left.argument?.type === 'Identifier' &&
        (test.left.argument.name === 'document' || test.left.argument.name === 'window')
      )
        return true
      return false
    }
    // `if (isServer) return|throw` / `if (!isClient) return|throw` — the canonical
    // `@pyreon/reactivity` SSR primitive (`isServer === typeof document === 'undefined'`).
    // Recognised by NAME, the same convention `no-window-in-ssr` / `dev-guard-warnings`
    // use (a lightweight walker can't resolve imports). This keeps the rule consistent
    // with `pyreon/prefer-isserver`, which pushes these very `typeof` guards TO `isServer`
    // — without it the two rules contradict (prefer-isserver says "use isServer", then
    // no-dom-in-setup flags the now-"unguarded" DOM access).
    function isSsrPrimitiveGuard(test: any): boolean {
      if (test?.type === 'Identifier' && test.name === 'isServer') return true
      if (
        test?.type === 'UnaryExpression' &&
        test.operator === '!' &&
        test.argument?.type === 'Identifier' &&
        test.argument.name === 'isClient'
      )
        return true
      return false
    }
    function isEarlyReturnDocumentGuard(stmt: any): boolean {
      if (!stmt || stmt.type !== 'IfStatement') return false
      if (!isNegatedTypeofDocument(stmt.test) && !isSsrPrimitiveGuard(stmt.test)) return false
      const c = stmt.consequent
      const isTerminator = (s: any): boolean =>
        s?.type === 'ReturnStatement' || s?.type === 'ThrowStatement'
      if (isTerminator(c)) return true
      if (c?.type === 'BlockStatement' && c.body.length === 1 && isTerminator(c.body[0]))
        return true
      return false
    }
    // Per-function depth bumps from early-return guards — popped on exit.
    const earlyReturnStack: number[] = []
    function pushFunctionScope(node: any) {
      const body = node?.body
      const stmts = body?.type === 'BlockStatement' ? body.body : null
      let bumps = 0
      if (stmts && stmts.length > 0 && isEarlyReturnDocumentGuard(stmts[0])) {
        bumps = 1
        safeDepth++
      }
      earlyReturnStack.push(bumps)
    }
    function popFunctionScope() {
      const bumps = earlyReturnStack.pop() ?? 0
      if (bumps > 0) safeDepth -= bumps
    }
    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: pushFunctionScope,
      'FunctionDeclaration:exit': popFunctionScope,
      FunctionExpression: pushFunctionScope,
      'FunctionExpression:exit': popFunctionScope,
      ArrowFunctionExpression: pushFunctionScope,
      'ArrowFunctionExpression:exit': popFunctionScope,
      CallExpression(node: any) {
        if (isSafeContextCall(node)) safeDepth++

        if (safeDepth > 0) return

        // Check for document.querySelector() etc.
        const callee = node.callee
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'Identifier' &&
          callee.object.name === 'document' &&
          callee.property?.type === 'Identifier' &&
          DOM_METHODS.has(callee.property.name)
        ) {
          context.report({
            message: `\`document.${callee.property.name}()\` outside \`onMount\`/\`effect\` — DOM is not available during SSR or setup phase.`,
            span: getSpan(node),
          })
        }
      },
      'CallExpression:exit'(node: any) {
        if (isSafeContextCall(node)) safeDepth--
      },
    }
    return callbacks
  },
}
