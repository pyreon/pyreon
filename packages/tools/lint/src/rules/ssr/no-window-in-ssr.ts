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
    // Identifiers that are member-property names (`x.addEventListener`),
    // object-property keys (`{ document: 1 }`), or import-specifier names
    // are NOT global references — pre-collected when their containing
    // node is visited, then skipped when the bare Identifier visitor fires.
    // Same root cause as `inTypeofExpr`: the previous `parent.type ===
    // 'MemberExpression'` check was inert (oxc visitor doesn't pass parent).
    const skipPropertyNodes = new WeakSet<any>()
    // Identifiers inside TypeScript type-position nodes (`let x: Window`,
    // `interface X { y: Document }`, `type T = Navigator`, generics, etc.)
    // are type references — they're erased at compile time. Track via depth
    // counter on any `TS*` node entry; identifiers visited while depth > 0
    // are skipped.
    let inTsTypePos = 0

    // Track `const isBrowser = typeof window !== 'undefined'` (or any
    // const whose initializer is a typeof check). Treats `if (isBrowser)`
    // the same as `if (typeof window !== 'undefined')` — the universal
    // browser-detection idiom. Set captured at module scope; lookups by name.
    const typeofBoundConsts = new Set<string>()
    function isPositiveTypeofCheck(expr: any): boolean {
      if (!expr) return false
      // `typeof X !== 'undefined'` (or `!=`) — the POSITIVE form: body is
      // the browser-safe branch.
      if (
        expr.type === 'BinaryExpression' &&
        (expr.operator === '!==' || expr.operator === '!=') &&
        expr.left?.type === 'UnaryExpression' &&
        expr.left.operator === 'typeof'
      )
        return true
      // Bare `typeof X` as truthiness check (rare).
      if (expr.type === 'UnaryExpression' && expr.operator === 'typeof') return true
      return false
    }
    /** Used by VariableDeclaration to decide whether to bind a const. */
    function isTypeofCheckForBinding(expr: any): boolean {
      if (!expr) return false
      if (
        expr.type === 'BinaryExpression' &&
        expr.left?.type === 'UnaryExpression' &&
        expr.left.operator === 'typeof'
      )
        return true
      if (expr.type === 'UnaryExpression' && expr.operator === 'typeof') return true
      return false
    }
    /**
     * `if (test) { … }` — does the test indicate the body is the
     * BROWSER-SAFE branch? Only positive forms qualify here. Negated
     * forms (`typeof X === 'undefined'`, `!isBrowser`) are early-return
     * guards handled separately.
     */
    function testIsTypeofGuard(test: any): boolean {
      if (!test) return false
      if (isPositiveTypeofCheck(test)) return true
      // `if (isBrowser)` — bound from a typeof, body is browser-safe.
      if (test.type === 'Identifier' && typeofBoundConsts.has(test.name)) return true
      return false
    }

    // Track functions that begin with an early-return on a NEGATED typeof
    // guard: `if (typeof window === 'undefined') return …` or
    // `if (!isBrowser) return`. After such a guard, the rest of the
    // function body is implicitly typeof-guarded (the SSR path bailed).
    // We use enter/exit on function nodes to bracket the guard zone.
    function isNegatedTypeofExpr(test: any): boolean {
      if (!test) return false
      // `typeof X === 'undefined'` — explicit equality form
      if (
        test.type === 'BinaryExpression' &&
        (test.operator === '===' || test.operator === '==') &&
        test.left?.type === 'UnaryExpression' &&
        test.left.operator === 'typeof'
      )
        return true
      // `!isBrowser` where isBrowser is bound from typeof
      if (
        test.type === 'UnaryExpression' &&
        test.operator === '!' &&
        test.argument?.type === 'Identifier' &&
        typeofBoundConsts.has(test.argument.name)
      )
        return true
      // `typeof X === 'undefined' || typeof Y === 'undefined'` — chained
      // SSR bailouts (common when a feature needs multiple browser APIs).
      // Both sides must be negated-typeof checks.
      if (test.type === 'LogicalExpression' && test.operator === '||') {
        return isNegatedTypeofExpr(test.left) && isNegatedTypeofExpr(test.right)
      }
      return false
    }
    function isEarlyReturnTypeofGuard(stmt: any): boolean {
      if (!stmt || stmt.type !== 'IfStatement') return false
      if (!isNegatedTypeofExpr(stmt.test)) return false
      // Consequent must be a return (bare or in a single-statement block).
      const c = stmt.consequent
      if (c?.type === 'ReturnStatement') return true
      if (c?.type === 'BlockStatement' && c.body.length === 1 && c.body[0]?.type === 'ReturnStatement')
        return true
      return false
    }
    // Per-function counter of how many typeofGuardDepth bumps were
    // contributed by early-return guards inside this function — popped on
    // function exit to keep the depth balanced.
    const earlyReturnStack: number[] = []
    function pushFunctionScope() {
      earlyReturnStack.push(0)
    }
    function popFunctionScope() {
      const bumps = earlyReturnStack.pop() ?? 0
      typeofGuardDepth -= bumps
    }
    function noteEarlyReturnGuardVisit() {
      typeofGuardDepth++
      if (earlyReturnStack.length > 0) {
        earlyReturnStack[earlyReturnStack.length - 1]!++
      }
    }

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        // const isBrowser = typeof window !== 'undefined'
        for (const decl of node.declarations ?? []) {
          if (decl.id?.type === 'Identifier' && isTypeofCheckForBinding(decl.init)) {
            typeofBoundConsts.add(decl.id.name)
          }
        }
      },
      FunctionDeclaration: pushFunctionScope,
      'FunctionDeclaration:exit': popFunctionScope,
      FunctionExpression: pushFunctionScope,
      'FunctionExpression:exit': popFunctionScope,
      ArrowFunctionExpression: pushFunctionScope,
      'ArrowFunctionExpression:exit': popFunctionScope,
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
        // `if (typeof X !== 'undefined') { … browser-only … }` —
        // body-scoped typeof guard.
        if (testIsTypeofGuard(node.test)) typeofGuardDepth++
        // `if (typeof X === 'undefined') return` — early-return guard.
        // Bumps the guard depth FROM HERE through the rest of the
        // enclosing function (popped at function exit). Done at IfStatement
        // visit (not function enter) so `typeofBoundConsts` is already
        // populated by any `const isBrowser = …` above this if.
        else if (isEarlyReturnTypeofGuard(node)) noteEarlyReturnGuardVisit()
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
      // TypeScript type-position nodes — identifiers inside these are
      // type references (erased at compile), not runtime accesses. Cover
      // the common entry points; depth counter handles any nested
      // `TSTypeAnnotation` etc.
      TSTypeAnnotation(_n: any) { inTsTypePos++ },
      'TSTypeAnnotation:exit'(_n: any) { inTsTypePos-- },
      TSTypeReference(_n: any) { inTsTypePos++ },
      'TSTypeReference:exit'(_n: any) { inTsTypePos-- },
      TSTypeAliasDeclaration(_n: any) { inTsTypePos++ },
      'TSTypeAliasDeclaration:exit'(_n: any) { inTsTypePos-- },
      TSInterfaceDeclaration(_n: any) { inTsTypePos++ },
      'TSInterfaceDeclaration:exit'(_n: any) { inTsTypePos-- },
      TSTypeParameter(_n: any) { inTsTypePos++ },
      'TSTypeParameter:exit'(_n: any) { inTsTypePos-- },
      MemberExpression(node: any) {
        // `x.addEventListener` — `addEventListener` is the property name, not
        // a global. Pre-mark so the Identifier visitor skips it.
        if (!node.computed && node.property?.type === 'Identifier') {
          skipPropertyNodes.add(node.property)
        }
      },
      Property(node: any) {
        // `{ document: 1 }` — `document` is a key, not a global ref.
        if (!node.computed && node.key?.type === 'Identifier') {
          skipPropertyNodes.add(node.key)
        }
      },
      ImportSpecifier(node: any) {
        if (node.imported?.type === 'Identifier') skipPropertyNodes.add(node.imported)
        if (node.local?.type === 'Identifier' && node.local !== node.imported)
          skipPropertyNodes.add(node.local)
      },
      ImportDefaultSpecifier(node: any) {
        if (node.local?.type === 'Identifier') skipPropertyNodes.add(node.local)
      },
      ImportNamespaceSpecifier(node: any) {
        if (node.local?.type === 'Identifier') skipPropertyNodes.add(node.local)
      },
      Identifier(node: any) {
        if (safeDepth > 0 || typeofGuardDepth > 0 || inTypeofExpr > 0 || inTsTypePos > 0) return
        if (skipPropertyNodes.has(node)) return
        if (!BROWSER_GLOBALS.has(node.name)) return

        context.report({
          message: `Browser global \`${node.name}\` used outside \`onMount\`/\`effect\`/typeof guard — this will fail during SSR. Wrap in \`onMount(() => { ... })\`.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
