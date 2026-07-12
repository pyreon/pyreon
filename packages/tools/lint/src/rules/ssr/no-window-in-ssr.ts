import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isTestFile } from '../../utils/file-roles'
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
    // Test files (`*.test.ts`, `*.browser.test.tsx`, Playwright specs) never
    // run during SSR and legitimately touch `window` (a `page.evaluate`, a
    // happy-dom/browser assertion), so skip them — consistent with every other
    // SSR/env rule (prefer-isserver, no-private-env-in-client, …). Pre-fix this
    // rule was the odd one out and produced ~60% of its findings inside specs.
    if (isTestFile(context.getFilePath())) return {}
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
    // The canonical env flags Pyreon ships from `@pyreon/reactivity` /
    // `@pyreon/core`: `isClient` / `isBrowser` are POSITIVE (`typeof document
    // !== 'undefined'`, true on a browser main thread); `isServer` / `isSSR`
    // are NEGATIVE (true on the server). Populated ONLY when actually IMPORTED
    // from one of those packages (see the ImportDeclaration handler) — NOT for
    // an arbitrary local `const isBrowser = true`, which must still be flagged.
    // An imported positive flag joins `typeofBoundConsts` (so `if (isClient)` /
    // `if (!isClient) return` / `isClient && …` are guards); an imported
    // negative flag joins `negativeGuardConsts` (inverted polarity: `if
    // (isServer) return` bails, `if (!isServer) { … }` is the browser-safe body).
    const negativeGuardConsts = new Set<string>()
    const POSITIVE_ENV_FLAGS = new Set(['isClient', 'isBrowser'])
    const NEGATIVE_ENV_FLAGS = new Set(['isServer', 'isSSR'])
    const ENV_FLAG_SOURCES = new Set(['@pyreon/reactivity', '@pyreon/core'])

    // Member-captured typeof bindings — `this.isSSR = typeof document ===
    // 'undefined'` / `obj.ready = typeof window !== 'undefined'` / class
    // field `isSSR = typeof document === 'undefined'`. Keyed by a
    // normalized member-path string (`this.isSSR`, `obj.ready`). The value
    // records POLARITY so guard recognition is exact:
    //   'positive'  → captured `typeof X !== 'undefined'` (or bare typeof);
    //                  `if (this.k)` is the browser-safe branch,
    //                  `if (!this.k) return` is the SSR early-return.
    //   'negative'  → captured `typeof X === 'undefined'` (the `isSSR`
    //                  idiom — true on the server); `if (!this.k)` is the
    //                  browser-safe branch, `if (this.k) return` is the
    //                  SSR early-return.
    // This extends the const-captured-typeof idiom the rule already
    // supports to member-assignment / class-field captures. It is
    // intentionally separate from `typeofBoundConsts` (which is
    // polarity-naive) so the existing const behaviour is untouched.
    const memberCapturedTypeof = new Map<string, 'positive' | 'negative'>()
    /** Normalize a `this.x` / `obj.x` member path to a stable key. */
    function memberPathKey(node: any): string | null {
      if (!node || node.type !== 'MemberExpression' || node.computed) return null
      if (node.property?.type !== 'Identifier') return null
      const obj = node.object
      if (obj?.type === 'ThisExpression') return `this.${node.property.name}`
      if (obj?.type === 'Identifier') return `${obj.name}.${node.property.name}`
      return null
    }
    /**
     * Polarity of a typeof-check expression used as a captured binding:
     * `typeof X !== 'undefined'` / bare `typeof X` → 'positive';
     * `typeof X === 'undefined'` → 'negative'. Returns null when the
     * expression is not a direct typeof check (we deliberately do NOT
     * recurse into &&/|| here — a captured SSR flag is virtually always a
     * single typeof check, and widening this would risk masking real
     * unguarded uses).
     */
    function typeofCapturePolarity(expr: any): 'positive' | 'negative' | null {
      if (!expr) return null
      if (
        expr.type === 'BinaryExpression' &&
        expr.left?.type === 'UnaryExpression' &&
        expr.left.operator === 'typeof'
      ) {
        if (expr.operator === '!==' || expr.operator === '!=') return 'positive'
        if (expr.operator === '===' || expr.operator === '==') return 'negative'
        return null
      }
      // Bare `typeof X` as a truthiness flag (rare) — string is truthy, so
      // it behaves like the positive form.
      if (expr.type === 'UnaryExpression' && expr.operator === 'typeof') return 'positive'
      return null
    }
    /**
     * Is `test` a body-scoped guard whose body is the BROWSER-SAFE branch,
     * by virtue of a member-captured typeof binding?
     *   positive-bound `this.k`  → `if (this.k) { … }`
     *   negative-bound `this.k`  → `if (!this.k) { … }`
     */
    function testIsMemberTypeofGuard(test: any): boolean {
      if (!test) return false
      // `if (this.k)` — safe when k is positive-bound.
      const directKey = memberPathKey(test)
      if (directKey && memberCapturedTypeof.get(directKey) === 'positive') return true
      // `if (!this.k)` — safe when k is negative-bound (the `isSSR` idiom).
      if (test.type === 'UnaryExpression' && test.operator === '!') {
        const negKey = memberPathKey(test.argument)
        if (negKey && memberCapturedTypeof.get(negKey) === 'negative') return true
      }
      // `if (this.k && other)` / `if (other && this.k)` — AND short-circuits
      // so either side being a member typeof guard protects the body.
      if (test.type === 'LogicalExpression' && test.operator === '&&') {
        return testIsMemberTypeofGuard(test.left) || testIsMemberTypeofGuard(test.right)
      }
      return false
    }
    /**
     * Is `test` an early-return guard condition that, when it fires, means
     * the SSR path bailed — so the rest of the function body (incl. nested
     * closures) only runs in a browser?
     *   positive-bound `this.k`  → `if (!this.k) return`
     *   negative-bound `this.k`  → `if (this.k) return`
     */
    function isMemberNegatedTypeofExpr(test: any): boolean {
      if (!test) return false
      // `if (this.k) return` — early bail when k is negative-bound (isSSR).
      const directKey = memberPathKey(test)
      if (directKey && memberCapturedTypeof.get(directKey) === 'negative') return true
      // `if (!this.k) return` — early bail when k is positive-bound.
      if (test.type === 'UnaryExpression' && test.operator === '!') {
        const negKey = memberPathKey(test.argument)
        if (negKey && memberCapturedTypeof.get(negKey) === 'positive') return true
      }
      return false
    }
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
      // `typeof X === 'function'` / `typeof X === 'object'` — also a
      // POSITIVE existence assertion: the body only runs when the global
      // exists (and is of that type). Common for optional browser APIs:
      // `if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)`,
      // `if (typeof IntersectionObserver === 'function') …`. Only the two
      // string literals that imply existence are accepted — `=== 'undefined'`
      // is the SSR-fallback branch (handled by isNegatedTypeofExpr) and
      // must NOT be treated as positive.
      if (
        expr.type === 'BinaryExpression' &&
        (expr.operator === '===' || expr.operator === '==') &&
        expr.left?.type === 'UnaryExpression' &&
        expr.left.operator === 'typeof' &&
        expr.right?.type === 'Literal' &&
        (expr.right.value === 'function' || expr.right.value === 'object')
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
      // `const useVT = _isBrowser && ... && typeof X === 'function'` — if
      // any term in an AND chain is a typeof check (direct or via another
      // typeof-bound const), the whole expression is typeof-derived: every
      // non-falsy value requires every term to have evaluated truthy.
      if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
        return isTypeofCheckForBinding(expr.left) || isTypeofCheckForBinding(expr.right)
      }
      // `const handler = _isBrowser ? (e) => … : null` / `_isBrowser ? fn()
      // : null` — ternary with a typeof-derived const as test. The non-null
      // branch only exists when the guard is truthy, so the binding is
      // transitively typeof-derived. Same for `_isBrowser ? X : null`
      // where `X` is typeof-derived.
      if (expr.type === 'ConditionalExpression') {
        return isTypeofCheckForBinding(expr.test)
      }
      if (expr.type === 'Identifier' && typeofBoundConsts.has(expr.name)) return true
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
      // `if (this.isReady) { … }` — member-captured positive typeof binding
      // (or `if (!this.isSSR)` for the negative `isSSR` idiom).
      if (testIsMemberTypeofGuard(test)) return true
      // `if (isBrowser)` — bound from a typeof, body is browser-safe.
      if (test.type === 'Identifier' && typeofBoundConsts.has(test.name)) return true
      // `if (!isServer) { … }` — imported negative env flag negated, so the
      // body is the browser-safe branch.
      if (
        test.type === 'UnaryExpression' &&
        test.operator === '!' &&
        test.argument?.type === 'Identifier' &&
        negativeGuardConsts.has(test.argument.name)
      )
        return true
      // `if (isBrowser())` — function whose body returns a typeof check.
      if (
        test.type === 'CallExpression' &&
        test.callee?.type === 'Identifier' &&
        typeofGuardFunctions.has(test.callee.name)
      )
        return true
      // `if (typeofGuard && other)` / `if (other && typeofGuard)` — either
      // side being a typeof guard means the body only runs when the guard
      // is truthy (AND short-circuits). Common in ternary tests like
      // `IS_BROWSER && active() ? <Portal … /> : null`.
      if (test.type === 'LogicalExpression' && test.operator === '&&') {
        return testIsTypeofGuard(test.left) || testIsTypeofGuard(test.right)
      }
      return false
    }
    // Functions whose body is `return <typeof check expr>` — invoked as
    // the convention `isBrowser()` / `isClient()` early-return guards.
    // E.g. `function isBrowser() { return typeof window !== 'undefined' }`.
    // Calls to these functions count as typeof checks for guard analysis.
    // Pre-seeded with conventional names (recognised across module
    // boundaries — same approach as `dev-guard-warnings` recognises
    // `__DEV__`/`IS_DEV`/etc. by name): user-supplied implementations of
    // `isBrowser` / `isClient` / `isServer` / `isSSR` are treated as
    // typeof guards even when imported from another file. Each file's
    // local `function isBrowser() { return typeof window !== 'undefined' }`
    // also adds itself to the set.
    const typeofGuardFunctions = new Set<string>(['isBrowser', 'isClient', 'isServer', 'isSSR'])
    function bodyIsTypeofGuard(body: any): boolean {
      if (!body) return false
      // Arrow concise body: `() => typeof window !== 'undefined'` →
      // body IS the expression directly, not a BlockStatement.
      if (body.type !== 'BlockStatement') return isReturnedTypeofExpr(body)
      // Block body: must be a single `return <expr>` statement.
      const stmts = body.body ?? []
      if (stmts.length !== 1) return false
      const stmt = stmts[0]
      if (stmt?.type !== 'ReturnStatement') return false
      return isReturnedTypeofExpr(stmt.argument)
    }
    function isReturnedTypeofExpr(expr: any): boolean {
      if (!expr) return false
      if (isPositiveTypeofCheck(expr)) return true
      // AND-chain of typeof checks (or typeof-bound consts) — a function
      // returning `typeof window !== 'undefined' && typeof document !== 'undefined'`
      // is still a typeof guard.
      if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
        return isReturnedTypeofExpr(expr.left) && isReturnedTypeofExpr(expr.right)
      }
      // Identifier reference to a previously-bound typeof const.
      if (expr.type === 'Identifier' && typeofBoundConsts.has(expr.name)) return true
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
      // `if (isServer) return` — imported negative env flag (true on the
      // server), so this bare-identifier test IS the SSR early-return bail.
      if (test.type === 'Identifier' && negativeGuardConsts.has(test.name)) return true
      // Member-captured typeof early-return forms:
      //   `if (this.isSSR) return`        (isSSR = typeof X === 'undefined')
      //   `if (!this.isReady) return`     (isReady = typeof X !== 'undefined')
      if (isMemberNegatedTypeofExpr(test)) return true
      // `!isBrowser()` where isBrowser is a typeof-guard function — common
      // SSR pattern in storage adapters: `if (!isBrowser()) return null`.
      if (
        test.type === 'UnaryExpression' &&
        test.operator === '!' &&
        test.argument?.type === 'CallExpression' &&
        test.argument.callee?.type === 'Identifier' &&
        typeofGuardFunctions.has(test.argument.callee.name)
      )
        return true
      // OR-chained early-return bailout: `if (A || typeof X === 'undefined')
      // return`. ANY disjunct being a negated-typeof check is sufficient —
      // for an EARLY-RETURN guard, extra disjuncts only make the bail fire
      // MORE often, never less. After the guard, every disjunct is falsy,
      // so the negated-typeof disjunct's global is guaranteed to exist.
      // Common shape: `if (!el || typeof IntersectionObserver === 'undefined')
      // return` before `new IntersectionObserver(...)`. This is strictly
      // more conservative for SSR-safety than requiring all sides — it can
      // only recognize MORE valid guards, never silence an unguarded use
      // (the used global's own negated-typeof must still be a disjunct, or
      // a bound flag, for `isNegatedTypeofExpr` to return true). Note this
      // widening is confined to early-return guards: `isNegatedTypeofExpr`
      // is only ever called from `isEarlyReturnTypeofGuard`, never from the
      // positive body-guard path.
      if (test.type === 'LogicalExpression' && test.operator === '||') {
        return isNegatedTypeofExpr(test.left) || isNegatedTypeofExpr(test.right)
      }
      return false
    }
    function isEarlyReturnTypeofGuard(stmt: any): boolean {
      if (!stmt || stmt.type !== 'IfStatement') return false
      if (!isNegatedTypeofExpr(stmt.test)) return false
      // Consequent must terminate the function — either a return or a throw
      // (both bail out, leaving the rest of the body — INCLUDING any nested
      // function/closure expressions defined later — implicitly guarded:
      // `typeofGuardDepth` is global and stays bumped until THIS function
      // exits, so it spans nested scopes too).
      //
      // Accepted shapes:
      //   `if (cond) return`                       — bare terminator
      //   `if (cond) { return … }`                 — single-stmt block
      //   `if (cond) { const noop = …; return … }` — block that ENDS with a
      //                                              terminator
      // The third shape is the real-world SSR-fallback idiom: build a noop
      // result then `return` it. The statements before the terminator run
      // ONLY on the SSR path (where the function bails) — they can't
      // un-bail it, so the rest of the body is still browser-only. We only
      // require the LAST statement to be the terminator (every preceding
      // statement is irrelevant to the bail). A non-terminating block is
      // still rejected (the function would fall through to the body in
      // SSR — genuinely unguarded).
      const c = stmt.consequent
      const isTerminator = (s: any): boolean =>
        s?.type === 'ReturnStatement' || s?.type === 'ThrowStatement'
      if (isTerminator(c)) return true
      if (c?.type === 'BlockStatement' && c.body.length >= 1 && isTerminator(c.body.at(-1)))
        return true
      return false
    }
    // Per-function counter of how many typeofGuardDepth bumps were
    // contributed by early-return guards inside this function — popped on
    // function exit to keep the depth balanced.
    const earlyReturnStack: number[] = []
    // Callback nodes (2nd arg of `watch(source, cb)`) pre-marked so the
    // function-scope visitor bumps safeDepth only inside them. The source
    // arg (evaluated at setup) stays unmarked and gets normal analysis.
    const watchCallbackNodes = new WeakSet<any>()
    // Parallel stack recording whether the current function scope bumped
    // safeDepth for being a watch callback. Paired with `popFunctionScope`
    // so the depth is balanced even with nested watch calls.
    const watchCallbackSafeDepthStack: number[] = []
    // Stack of parameter names that shadow browser globals for the current
    // function scope. E.g. `function push(location)` — any `location`
    // identifier inside this function refers to the parameter, not the
    // browser global. Pushed on function enter, popped on exit.
    const shadowedNamesStack: Array<Set<string>> = []
    // Module-level names that shadow browser globals via imports — e.g.
    // `import { history } from '@codemirror/commands'`. Any `history`
    // identifier in the file then refers to the import, not `window.history`.
    // Populated by ImportSpecifier / ImportDefaultSpecifier / ImportNamespaceSpecifier.
    const importShadowedNames = new Set<string>()
    function collectParamNames(params: any[]): Set<string> {
      const names = new Set<string>()
      const walk = (p: any) => {
        if (!p) return
        if (p.type === 'Identifier' && BROWSER_GLOBALS.has(p.name)) names.add(p.name)
        else if (p.type === 'AssignmentPattern') walk(p.left)
        else if (p.type === 'RestElement') walk(p.argument)
        else if (p.type === 'ArrayPattern') for (const el of p.elements ?? []) walk(el)
        else if (p.type === 'ObjectPattern')
          for (const prop of p.properties ?? []) {
            if (prop.type === 'RestElement') walk(prop.argument)
            else walk(prop.value)
          }
      }
      for (const p of params ?? []) walk(p)
      return names
    }
    function isNameShadowed(name: string): boolean {
      for (let i = shadowedNamesStack.length - 1; i >= 0; i--) {
        if (shadowedNamesStack[i]!.has(name)) return true
      }
      return false
    }
    function pushFunctionScope(node?: any) {
      earlyReturnStack.push(0)
      shadowedNamesStack.push(node ? collectParamNames(node.params ?? []) : new Set())
      if (node && watchCallbackNodes.has(node)) {
        safeDepth++
        watchCallbackSafeDepthStack.push(1)
      } else {
        watchCallbackSafeDepthStack.push(0)
      }
    }
    function popFunctionScope() {
      const bumps = earlyReturnStack.pop() ?? 0
      typeofGuardDepth -= bumps
      shadowedNamesStack.pop()
      const watchBump = watchCallbackSafeDepthStack.pop() ?? 0
      if (watchBump > 0) safeDepth -= watchBump
    }
    function noteEarlyReturnGuardVisit() {
      typeofGuardDepth++
      if (earlyReturnStack.length > 0) {
        earlyReturnStack[earlyReturnStack.length - 1]!++
      }
    }

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        for (const decl of node.declarations ?? []) {
          if (decl.id?.type !== 'Identifier') continue
          // const isBrowser = typeof window !== 'undefined'
          if (isTypeofCheckForBinding(decl.init)) {
            typeofBoundConsts.add(decl.id.name)
          }
          // const isBrowser = () => typeof window !== 'undefined'
          // const isBrowser = function () { return typeof window !== 'undefined' }
          if (
            (decl.init?.type === 'ArrowFunctionExpression' ||
              decl.init?.type === 'FunctionExpression') &&
            bodyIsTypeofGuard(decl.init.body)
          ) {
            typeofGuardFunctions.add(decl.id.name)
          }
        }
      },
      // `this.isSSR = typeof document === 'undefined'`
      // `obj.ready = typeof window !== 'undefined'`
      // Captured with polarity so `if (this.isSSR) return` (negative) and
      // `if (this.ready) { … }` (positive) are recognized as guards.
      // Only plain `=` assignments are tracked; compound (`||=` etc.) and
      // computed members are intentionally ignored (not the idiom).
      AssignmentExpression(node: any) {
        if (node.operator !== '=') return
        const key = memberPathKey(node.left)
        if (!key) return
        const polarity = typeofCapturePolarity(node.right)
        if (polarity) memberCapturedTypeof.set(key, polarity)
      },
      // Class field initializer: `class S { isSSR = typeof document === 'undefined' }`
      // — equivalent to `this.isSSR = …` set at construction time. Keyed
      // as `this.<name>` so method-body `if (this.isSSR)` guards resolve.
      PropertyDefinition(node: any) {
        if (node.computed || node.static) return
        if (node.key?.type !== 'Identifier') return
        const polarity = typeofCapturePolarity(node.value)
        if (polarity) memberCapturedTypeof.set(`this.${node.key.name}`, polarity)
      },
      FunctionDeclaration(node: any) {
        // function isBrowser() { return typeof window !== 'undefined' }
        if (node.id?.type === 'Identifier' && bodyIsTypeofGuard(node.body)) {
          typeofGuardFunctions.add(node.id.name)
        }
        pushFunctionScope(node)
      },
      'FunctionDeclaration:exit': popFunctionScope,
      FunctionExpression: pushFunctionScope,
      'FunctionExpression:exit': popFunctionScope,
      ArrowFunctionExpression: pushFunctionScope,
      'ArrowFunctionExpression:exit': popFunctionScope,
      CallExpression(node: any) {
        // `onMount` / `onUnmount` / `onCleanup` / `effect` / `renderEffect` /
        // `requestAnimationFrame` — the whole call's arguments are safe:
        // the callback runs post-mount / in a browser frame, and those
        // hooks accept a single callback arg (no setup-time source).
        if (
          isCallTo(node, 'onMount') ||
          isCallTo(node, 'onUnmount') ||
          isCallTo(node, 'onCleanup') ||
          isCallTo(node, 'effect') ||
          isCallTo(node, 'renderEffect') ||
          isCallTo(node, 'requestAnimationFrame')
        ) {
          safeDepth++
          return
        }
        // `watch(source, cb)` — the SOURCE arg is evaluated synchronously
        // at setup time (to track signals) so browser-global access inside
        // it is NOT safe. Only the CALLBACK arg fires deferred. Pre-mark
        // the second arg so the ArrowFn/FunctionExpression visitor bumps
        // safeDepth only there — not across the whole CallExpression.
        if (isCallTo(node, 'watch')) {
          const cb = node.arguments?.[1]
          if (
            cb?.type === 'ArrowFunctionExpression' ||
            cb?.type === 'FunctionExpression' ||
            cb?.type === 'FunctionDeclaration'
          ) {
            watchCallbackNodes.add(cb)
          }
        }
      },
      'CallExpression:exit'(node: any) {
        if (
          isCallTo(node, 'onMount') ||
          isCallTo(node, 'onUnmount') ||
          isCallTo(node, 'onCleanup') ||
          isCallTo(node, 'effect') ||
          isCallTo(node, 'renderEffect') ||
          isCallTo(node, 'requestAnimationFrame')
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
      ImportDeclaration(node: any) {
        // Recognise Pyreon's canonical env flags as SSR guards — but ONLY when
        // imported from `@pyreon/reactivity` / `@pyreon/core` (the packages that
        // ship them). A local `const isBrowser = true` must still be flagged, so
        // name-alone is deliberately NOT enough. The LOCAL alias is recorded so
        // `import { isServer as srv }` keeps working. ImportDeclaration carries
        // both `source.value` and `specifiers`, so no parent-traversal is needed
        // (oxc passes no parent to child visitors).
        if (typeof node.source?.value !== 'string' || !ENV_FLAG_SOURCES.has(node.source.value)) {
          return
        }
        for (const spec of node.specifiers ?? []) {
          if (spec.type !== 'ImportSpecifier' || spec.imported?.type !== 'Identifier') continue
          const local = spec.local?.name
          if (typeof local !== 'string') continue
          if (POSITIVE_ENV_FLAGS.has(spec.imported.name)) typeofBoundConsts.add(local)
          else if (NEGATIVE_ENV_FLAGS.has(spec.imported.name)) negativeGuardConsts.add(local)
        }
      },
      ImportSpecifier(node: any) {
        if (node.imported?.type === 'Identifier') skipPropertyNodes.add(node.imported)
        if (node.local?.type === 'Identifier' && node.local !== node.imported)
          skipPropertyNodes.add(node.local)
        // Track imported names that shadow a browser global so all later
        // uses of that name in the file are skipped — e.g. `import { history }
        // from '@codemirror/commands'` makes every `history` identifier a
        // CodeMirror reference, not `window.history`.
        if (node.local?.type === 'Identifier' && BROWSER_GLOBALS.has(node.local.name)) {
          importShadowedNames.add(node.local.name)
        }
      },
      ImportDefaultSpecifier(node: any) {
        if (node.local?.type === 'Identifier') {
          skipPropertyNodes.add(node.local)
          if (BROWSER_GLOBALS.has(node.local.name)) importShadowedNames.add(node.local.name)
        }
      },
      ImportNamespaceSpecifier(node: any) {
        if (node.local?.type === 'Identifier') {
          skipPropertyNodes.add(node.local)
          if (BROWSER_GLOBALS.has(node.local.name)) importShadowedNames.add(node.local.name)
        }
      },
      Identifier(node: any) {
        if (safeDepth > 0 || typeofGuardDepth > 0 || inTypeofExpr > 0 || inTsTypePos > 0) return
        if (skipPropertyNodes.has(node)) return
        if (!BROWSER_GLOBALS.has(node.name)) return
        // Skip identifiers shadowed by a parameter of the same name —
        // `function push(location)` inside: every `location` refers to the
        // parameter, not `window.location`.
        if (isNameShadowed(node.name)) return
        // Skip identifiers shadowed by a module-level import binding.
        if (importShadowedNames.has(node.name)) return

        context.report({
          message: `Browser global \`${node.name}\` used outside \`onMount\`/\`effect\`/typeof guard — this will fail during SSR. Wrap in \`onMount(() => { ... })\`.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
