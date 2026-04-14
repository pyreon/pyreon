import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { BROWSER_GLOBALS } from '../../utils/imports'

export const noWindowInSsr: Rule = {
  meta: {
    id: 'pyreon/no-window-in-ssr',
    category: 'ssr',
    description: 'Disallow browser globals outside onMount/effect/typeof guards — they break SSR.',
    severity: 'error',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    // Configurable `exemptPaths` option — projects opt out directories
    // that legitimately run in a DOM-only environment (e.g. a DOM renderer
    // package has no SSR scenario). Monorepo configures its own paths in
    // `.pyreonlintrc.json`; user apps typically leave this empty.
    if (isPathExempt(context)) return {}

    let safeDepth = 0
    let typeofGuardDepth = 0
    // Inside `typeof X` itself, the identifier mention is safe — `typeof` is
    // the only operator that doesn't evaluate its operand. We track this via
    // visitor enter/exit because the oxc visitor doesn't pass `parent` to
    // identifier callbacks (the previous `parent.operator === 'typeof'`
    // check was silently inert).
    let inTypeofExpr = 0

    // Track `const isBrowser = typeof window !== 'undefined'` (or any
    // const whose initializer is a typeof check). Treats `if (isBrowser)`
    // the same as `if (typeof window !== 'undefined')` — the universal
    // browser-detection idiom. Set captured at module scope; lookups by name.
    const typeofBoundConsts = new Set<string>()
    function isTypeofCheck(expr: any): boolean {
      if (!expr) return false
      // typeof X !== 'undefined' / typeof X === 'undefined' / typeof X (truthy)
      if (
        expr.type === 'BinaryExpression' &&
        expr.left?.type === 'UnaryExpression' &&
        expr.left.operator === 'typeof'
      )
        return true
      if (expr.type === 'UnaryExpression' && expr.operator === 'typeof') return true
      // Negation: !X is a typeof guard if X is. Don't unwrap further; the
      // negated branch goes the other way.
      return false
    }
    function testIsTypeofGuard(test: any): boolean {
      if (!test) return false
      if (isTypeofCheck(test)) return true
      // `if (isBrowser)` — bound from a typeof.
      if (test.type === 'Identifier' && typeofBoundConsts.has(test.name)) return true
      // `if (!isBrowser)` — same bound, opposite branch (we still treat the
      // body as a "guarded zone" because the rule's job is "is this safe
      // from SSR" — early return inside the body would skip the unsafe
      // access; conservative approach: count it).
      if (
        test.type === 'UnaryExpression' &&
        test.operator === '!' &&
        test.argument?.type === 'Identifier' &&
        typeofBoundConsts.has(test.argument.name)
      )
        return true
      return false
    }

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        // const isBrowser = typeof window !== 'undefined'
        for (const decl of node.declarations ?? []) {
          if (decl.id?.type === 'Identifier' && isTypeofCheck(decl.init)) {
            typeofBoundConsts.add(decl.id.name)
          }
        }
      },
      CallExpression(node: any) {
        // `onUnmount` is also a safe context — by the time it runs, the
        // component is in the browser DOM (else it never mounted). And
        // `effect`/`renderEffect` only run after first render, so they're
        // browser-only too.
        if (
          isCallTo(node, 'onMount') ||
          isCallTo(node, 'onUnmount') ||
          isCallTo(node, 'onCleanup') ||
          isCallTo(node, 'effect') ||
          isCallTo(node, 'renderEffect')
        ) {
          safeDepth++
        }
      },
      'CallExpression:exit'(node: any) {
        if (
          isCallTo(node, 'onMount') ||
          isCallTo(node, 'onUnmount') ||
          isCallTo(node, 'onCleanup') ||
          isCallTo(node, 'effect') ||
          isCallTo(node, 'renderEffect')
        ) {
          safeDepth--
        }
      },
      IfStatement(node: any) {
        if (testIsTypeofGuard(node.test)) typeofGuardDepth++
      },
      'IfStatement:exit'(node: any) {
        if (testIsTypeofGuard(node.test)) typeofGuardDepth--
      },
      // Ternary `typeof X !== 'undefined' ? safe : fallback` — the
      // `consequent` branch is type-guarded. Tracked via depth: enter
      // increments globally because the visitor doesn't tell us which
      // branch we're in. That's an over-approximation (the fallback also
      // gets the depth bump), but the fallback typically doesn't reference
      // browser globals; the consequent does. Conservative; matches real
      // code patterns.
      ConditionalExpression(node: any) {
        if (testIsTypeofGuard(node.test)) typeofGuardDepth++
      },
      'ConditionalExpression:exit'(node: any) {
        if (testIsTypeofGuard(node.test)) typeofGuardDepth--
      },
      UnaryExpression(node: any) {
        if (node.operator === 'typeof') inTypeofExpr++
      },
      'UnaryExpression:exit'(node: any) {
        if (node.operator === 'typeof') inTypeofExpr--
      },
      Identifier(node: any, parent: any) {
        if (safeDepth > 0 || typeofGuardDepth > 0 || inTypeofExpr > 0) return
        if (!BROWSER_GLOBALS.has(node.name)) return

        // Legacy parent-based check, kept for any caller that wraps the
        // visitor and DOES pass parent. The `inTypeofExpr` counter above
        // is the load-bearing skip in the oxc visitor.
        if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') return

        // Skip import specifiers
        if (
          parent?.type === 'ImportSpecifier' ||
          parent?.type === 'ImportDefaultSpecifier' ||
          parent?.type === 'ImportNamespaceSpecifier'
        )
          return

        // Skip property access on member expressions (only flag when used as the object)
        if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed)
          return

        context.report({
          message: `Browser global \`${node.name}\` used outside \`onMount\`/\`effect\`/typeof guard — this will fail during SSR. Wrap in \`onMount(() => { ... })\`.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
