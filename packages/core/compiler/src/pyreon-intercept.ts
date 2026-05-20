/**
 * Pyreon Pattern Interceptor — detects Pyreon-specific anti-patterns in
 * code that has ALREADY committed to the framework (imports are Pyreon,
 * not React). Complements `react-intercept.ts` — the React detector
 * catches "coming from React" mistakes; this one catches "using Pyreon
 * wrong" mistakes.
 *
 * Catalog of detected patterns (grounded in `.claude/rules/anti-patterns.md`):
 *
 *  - `for-missing-by` — `<For each={...}>` without a `by` prop
 *  - `for-with-key`   — `<For key={...}>` (JSX reserves `key`; the keying
 *                       prop is `by` in Pyreon)
 *  - `props-destructured` — `({ foo }: Props) => <JSX />` destructures at
 *                       the component signature; reading is captured once
 *                       and loses reactivity. Access `props.foo` instead
 *                       or use `splitProps(props, [...])`.
 *  - `props-destructured-body` — `const { foo } = props` written
 *                       SYNCHRONOUSLY in a component body — the body-scope
 *                       companion to `props-destructured`. Same capture-
 *                       once death; nested-function destructures (handler
 *                       / effect / returned accessor) are NOT flagged
 *                       (they re-read `props` per invocation).
 *  - `process-dev-gate` — `typeof process !== 'undefined' &&
 *                       process.env.NODE_ENV !== 'production'` is dead
 *                       code in real Vite browser bundles. Use
 *                       `import.meta.env?.DEV` instead.
 *  - `empty-theme`    — `.theme({})` chain is a no-op; remove it.
 *  - `raw-add-event-listener` — raw `addEventListener(...)` in a component
 *                       or hook body. Use `useEventListener(...)` from
 *                       `@pyreon/hooks` for auto-cleanup.
 *  - `raw-remove-event-listener` — same, for removeEventListener.
 *  - `date-math-random-id` — `Date.now() + Math.random()` / template-concat
 *                       variants. Under rapid operations (paste, clone)
 *                       collision probability is non-trivial. Use a
 *                       monotonic counter.
 *  - `on-click-undefined` — `onClick={undefined}` explicitly; the runtime
 *                       used to crash on this pattern. Omit the prop.
 *  - `signal-write-as-call` — `sig(value)` is a no-op read that ignores
 *                       its argument; the runtime warns in dev. Static
 *                       detector spots it pre-runtime when `sig` was
 *                       declared as `const sig = signal(...)` /
 *                       `computed(...)` and called with ≥1 argument.
 *  - `static-return-null-conditional` — `if (cond) return null` at the
 *                       top of a component body runs ONCE; signal changes
 *                       in `cond` never re-evaluate the early-return.
 *                       Wrap in a returned reactive accessor.
 *  - `as-unknown-as-vnodechild` — defensive `as unknown as VNodeChild`
 *                       cast on JSX returns is unnecessary (`JSX.Element`
 *                       is already assignable to `VNodeChild`).
 *  - `island-never-with-registry-entry` — an `island()` declared with
 *                       `hydrate: 'never'` is also registered in the same
 *                       file's `hydrateIslands({ ... })` call. The whole
 *                       point of `'never'` is shipping zero client JS;
 *                       registering pulls the component module into the
 *                       client bundle graph (the runtime short-circuits
 *                       and never calls the loader, but the bundler still
 *                       includes the import). Drop the registry entry.
 *
 * Two-mode surface mirrors `react-intercept.ts`:
 *  - `detectPyreonPatterns(code)` — diagnostics only
 *  - `hasPyreonPatterns(code)`   — fast regex pre-filter
 *
 * ## fixable: false (invariant)
 *
 * Every Pyreon diagnostic reports `fixable: false` — no exceptions.
 * The `migrate_react` MCP tool only knows React mappings, so claiming
 * a Pyreon code is auto-fixable would mislead a consumer who wires
 * their UX off the flag and finds nothing applies the fix. Flip to
 * `true` ONLY when a companion `migrate_pyreon` tool ships in a
 * subsequent PR. The invariant is locked in
 * `tests/pyreon-intercept.test.ts` under "fixable contract".
 *
 * Designed for three consumers:
 *  1. Compiler pre-pass warnings during build
 *  2. CLI `pyreon doctor`
 *  3. MCP server `validate` tool
 */

import ts from 'typescript'

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type PyreonDiagnosticCode =
  | 'for-missing-by'
  | 'for-with-key'
  | 'props-destructured'
  | 'props-destructured-body'
  | 'process-dev-gate'
  | 'empty-theme'
  | 'raw-add-event-listener'
  | 'raw-remove-event-listener'
  | 'date-math-random-id'
  | 'on-click-undefined'
  | 'signal-write-as-call'
  | 'static-return-null-conditional'
  | 'as-unknown-as-vnodechild'
  | 'island-never-with-registry-entry'
  | 'query-options-as-function'

export interface PyreonDiagnostic {
  /** Machine-readable code for filtering + programmatic handling */
  code: PyreonDiagnosticCode
  /** Human-readable message explaining the issue */
  message: string
  /** 1-based line number */
  line: number
  /** 0-based column */
  column: number
  /** The code as written */
  current: string
  /** The suggested Pyreon fix */
  suggested: string
  /** Whether a mechanical auto-fix is safe */
  fixable: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// Detection context
// ═══════════════════════════════════════════════════════════════════════════════

interface DetectContext {
  sf: ts.SourceFile
  code: string
  diagnostics: PyreonDiagnostic[]
  /**
   * Identifiers bound to `signal(...)` or `computed(...)` calls anywhere in
   * the file. Populated by `collectSignalBindings()` before the main
   * detection walk. Used by `detectSignalWriteAsCall` to flag `sig(value)`
   * patterns that should be `sig.set(value)`.
   */
  signalBindings: Set<string>
  /**
   * Names of `island()` declarations carrying `hydrate: 'never'`. Populated
   * by `collectNeverIslandNames()` before the main detection walk. Used by
   * `detectIslandNeverWithRegistry` to flag entries in
   * `hydrateIslands({ ... })` whose key matches a never-strategy island.
   *
   * Cross-call detection: the never-vs-registry mismatch is only catchable
   * when both sides live in the same source. In real apps the `island()`
   * declarations sit in `src/islands.ts` and the `hydrateIslands()` call
   * sits in `src/entry-client.ts`. The static detector covers the common
   * "all in one file" case (which catches the bug while users are first
   * learning the API); the cross-file case is the territory of `pyreon
   * doctor --check-islands` (separate PR / future scope).
   */
  neverIslandNames: Set<string>
}

function getNodeText(ctx: DetectContext, node: ts.Node): string {
  return ctx.code.slice(node.getStart(ctx.sf), node.getEnd())
}

function pushDiag(
  ctx: DetectContext,
  node: ts.Node,
  code: PyreonDiagnosticCode,
  message: string,
  current: string,
  suggested: string,
  fixable: boolean,
): void {
  const { line, character } = ctx.sf.getLineAndCharacterOfPosition(node.getStart(ctx.sf))
  ctx.diagnostics.push({
    code,
    message,
    line: line + 1,
    column: character,
    current: current.trim(),
    suggested: suggested.trim(),
    fixable,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSX helpers
// ═══════════════════════════════════════════════════════════════════════════════

function getJsxTagName(node: ts.JsxOpeningLikeElement): string {
  const t = node.tagName
  if (ts.isIdentifier(t)) return t.text
  return ''
}

function findJsxAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name) {
      return attr
    }
  }
  return undefined
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: <For> without `by` / with `key`
// ═══════════════════════════════════════════════════════════════════════════════

function detectForKeying(ctx: DetectContext, node: ts.JsxOpeningLikeElement): void {
  if (getJsxTagName(node) !== 'For') return

  const keyAttr = findJsxAttribute(node, 'key')
  if (keyAttr) {
    pushDiag(
      ctx,
      keyAttr,
      'for-with-key',
      '`key` on <For> is reserved by JSX for VNode reconciliation and is extracted before the prop reaches the runtime. In Pyreon, use `by` for list identity.',
      getNodeText(ctx, keyAttr),
      getNodeText(ctx, keyAttr).replace(/^key\b/, 'by'),
      // fixable remains `false` until a `migrate_pyreon` tool exists —
      // today the MCP only ships `migrate_react`, so claiming auto-fix
      // here would mislead consumers building on the flag.
      false,
    )
  }

  const eachAttr = findJsxAttribute(node, 'each')
  const byAttr = findJsxAttribute(node, 'by')
  if (eachAttr && !byAttr && !keyAttr) {
    pushDiag(
      ctx,
      node,
      'for-missing-by',
      '<For each={...}> requires a `by` prop so the keyed reconciler can preserve item identity across reorders. Without `by`, every update remounts the full list.',
      getNodeText(ctx, node),
      '<For each={items} by={(item) => item.id}>',
      false,
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: destructured props in component signature
// ═══════════════════════════════════════════════════════════════════════════════

function containsJsx(node: ts.Node): boolean {
  let found = false
  function walk(n: ts.Node): void {
    if (found) return
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n) ||
      ts.isJsxOpeningElement(n)
    ) {
      found = true
      return
    }
    ts.forEachChild(n, walk)
  }
  ts.forEachChild(node, walk)
  // Also allow expression-body arrow fns
  if (!found) {
    if (
      ts.isArrowFunction(node) &&
      !ts.isBlock(node.body) &&
      (ts.isJsxElement(node.body) ||
        ts.isJsxSelfClosingElement(node.body) ||
        ts.isJsxFragment(node.body))
    ) {
      found = true
    }
  }
  return found
}

function detectPropsDestructured(
  ctx: DetectContext,
  node: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
): void {
  if (!node.parameters.length) return
  const first = node.parameters[0]
  if (!first || !ts.isObjectBindingPattern(first.name)) return
  if (first.name.elements.length === 0) return

  // Heuristic: only flag functions that actually render JSX (component
  // functions), not arbitrary callbacks that happen to destructure an
  // options bag.
  if (!containsJsx(node)) return

  pushDiag(
    ctx,
    first,
    'props-destructured',
    'Destructuring props at the component signature captures the values ONCE during setup — subsequent signal writes in the parent do not update the destructured locals. Access `props.x` directly, or use `splitProps(props, [...])` to carve out a group while preserving reactivity.',
    getNodeText(ctx, first),
    '(props: Props) => /* read props.x directly */',
    false,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: body-scope `const { x } = props` destructure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Strip the wrappers that can sit between `=` and the props identifier
 * (`const { x } = (props as Props)!`) so we can compare the base
 * expression's identity to the component's first-parameter name.
 */
function unwrapInitializer(expr: ts.Expression): ts.Expression {
  let cur = expr
  let prev: ts.Expression | undefined
  while (cur !== prev) {
    prev = cur
    if (ts.isParenthesizedExpression(cur)) cur = cur.expression
    else if (ts.isAsExpression(cur)) cur = cur.expression
    else if (ts.isSatisfiesExpression(cur)) cur = cur.expression
    else if (ts.isNonNullExpression(cur)) cur = cur.expression
  }
  return cur
}

/**
 * Body-scope companion to {@link detectPropsDestructured}. Flags
 * `const { x } = props` (also `let` / `var`, aliases, defaults, rest,
 * nested patterns) written SYNCHRONOUSLY in a component's body.
 *
 * Why this is the footgun: the compiler emits `<C prop={sig()} />` as a
 * getter-shaped reactive prop. `const { x } = props` fires that getter
 * exactly ONCE at setup — `x` is a dead snapshot, never re-reads when
 * the signal changes. `props.x` (live member access inside a tracking
 * scope) or `splitProps(props, ['x'])` preserve the subscription.
 *
 * Precision (zero false positives is the priority — a missed body-scope
 * destructure is acceptable, a wrong one is not):
 *  - Only PascalCase, JSX-rendering functions (`isComponentShapedFunction`
 *    + `containsJsx`) — a plain helper that happens to destructure an
 *    options bag named `props` is NOT a component and is left alone.
 *  - The initializer must be the bare first-parameter identifier
 *    (`= props`), unwrapped through paren / `as` / `satisfies` / `!`.
 *    `const { x } = props.nested` and `= someOtherObject` are NOT
 *    flagged (rarer shapes; out of the canonical scope).
 *  - The destructure must be at the component-body top scope. A nested
 *    function boundary (`onClick` handler, `effect(() => …)`, a returned
 *    reactive accessor) re-reads `props` on each invocation, so those
 *    destructures are reactivity-correct — the walk does NOT descend
 *    into nested functions.
 *  - The first parameter must itself be a plain identifier; the
 *    parameter-destructure shape (`({ x }) => …`) is the existing
 *    `detectPropsDestructured`'s job, not this one.
 */
function detectPropsDestructuredBody(
  ctx: DetectContext,
  node: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
): void {
  if (!isComponentShapedFunction(node)) return
  if (!containsJsx(node)) return
  if (!node.parameters.length) return
  const first = node.parameters[0]
  // First param must be a plain identifier — the destructured-param
  // shape is detectPropsDestructured's domain.
  if (!first || !ts.isIdentifier(first.name)) return
  const paramName = first.name.text
  const body = node.body
  if (!body || !ts.isBlock(body)) return

  function walk(n: ts.Node): void {
    // Do NOT descend into nested functions: a `const { x } = props`
    // inside a handler / effect / returned accessor re-reads on every
    // invocation and is reactivity-correct.
    if (
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isFunctionDeclaration(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isSetAccessorDeclaration(n)
    ) {
      return
    }
    if (
      ts.isVariableDeclaration(n) &&
      ts.isObjectBindingPattern(n.name) &&
      n.name.elements.length > 0 &&
      n.initializer
    ) {
      const base = unwrapInitializer(n.initializer)
      if (ts.isIdentifier(base) && base.text === paramName) {
        pushDiag(
          ctx,
          n,
          'props-destructured-body',
          `Destructuring \`${paramName}\` in the component body captures the values ONCE during setup — the compiler emits signal-driven props as getters, so the destructured locals are dead snapshots that never update when the parent rewrites them. Read \`${paramName}.x\` directly inside the reactive scope (JSX / effect / computed), or use \`splitProps(${paramName}, ['x', ...])\` to carve out a group while preserving reactivity.`,
          getNodeText(ctx, n),
          `// read ${paramName}.x directly, or: const [local] = splitProps(${paramName}, ['x'])`,
          false,
        )
      }
    }
    ts.forEachChild(n, walk)
  }
  for (const stmt of body.statements) walk(stmt)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
// ═══════════════════════════════════════════════════════════════════════════════

function isTypeofProcess(node: ts.Expression): boolean {
  if (!ts.isBinaryExpression(node)) return false
  if (node.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return false
  if (!ts.isTypeOfExpression(node.left)) return false
  if (!ts.isIdentifier(node.left.expression) || node.left.expression.text !== 'process') return false
  return ts.isStringLiteral(node.right) && node.right.text === 'undefined'
}

function isProcessNodeEnvProdGuard(node: ts.Expression): boolean {
  if (!ts.isBinaryExpression(node)) return false
  if (node.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return false
  // process.env.NODE_ENV
  const left = node.left
  if (!ts.isPropertyAccessExpression(left)) return false
  if (!ts.isIdentifier(left.name) || left.name.text !== 'NODE_ENV') return false
  if (!ts.isPropertyAccessExpression(left.expression)) return false
  if (
    !ts.isIdentifier(left.expression.name) ||
    left.expression.name.text !== 'env'
  ) {
    return false
  }
  if (!ts.isIdentifier(left.expression.expression)) return false
  if (left.expression.expression.text !== 'process') return false
  return ts.isStringLiteral(node.right) && node.right.text === 'production'
}

function detectProcessDevGate(ctx: DetectContext, node: ts.BinaryExpression): void {
  if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return
  // left: typeof process !== 'undefined', right: process.env.NODE_ENV !== 'production'
  // (or either side in either order)
  const match =
    (isTypeofProcess(node.left) && isProcessNodeEnvProdGuard(node.right)) ||
    (isTypeofProcess(node.right) && isProcessNodeEnvProdGuard(node.left))
  if (!match) return

  pushDiag(
    ctx,
    node,
    'process-dev-gate',
    'The `typeof process !== "undefined" && process.env.NODE_ENV !== "production"` gate is DEAD CODE in real Vite browser bundles — Vite does not polyfill `process`. Unit tests pass (vitest has `process`) but the warning never fires in production. Use `import.meta.env?.DEV` instead, which Vite literal-replaces at build time.',
    getNodeText(ctx, node),
    'import.meta.env?.DEV === true',
    // No `migrate_pyreon` tool yet — claiming fixable would mislead.
    false,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: .theme({}) empty chain
// ═══════════════════════════════════════════════════════════════════════════════

function detectEmptyTheme(ctx: DetectContext, node: ts.CallExpression): void {
  const callee = node.expression
  if (!ts.isPropertyAccessExpression(callee)) return
  if (!ts.isIdentifier(callee.name) || callee.name.text !== 'theme') return
  if (node.arguments.length !== 1) return
  const arg = node.arguments[0]
  if (!arg || !ts.isObjectLiteralExpression(arg)) return
  if (arg.properties.length !== 0) return

  pushDiag(
    ctx,
    node,
    'empty-theme',
    '`.theme({})` is a no-op chain. If the component needs no base theme, skip `.theme()` entirely rather than calling it with an empty object.',
    getNodeText(ctx, node),
    getNodeText(ctx, callee.expression),
    // No `migrate_pyreon` tool yet — claiming fixable would mislead.
    false,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: @pyreon/query hook options passed as an object literal
// ═══════════════════════════════════════════════════════════════════════════════

// `useQuery` / `useInfiniteQuery` / `useQueries` / `useSuspenseQuery` take
// options as a FUNCTION so `queryKey` (etc.) can read Pyreon signals —
// changing a tracked signal re-runs the options and refetches. An object
// LITERAL is evaluated once at call time, so the query never reacts to
// signal changes. `useMutation` is deliberately NOT flagged: its options
// are a plain object (mutations are imperative, no tracking).
const QUERY_OPTS_HOOKS = new Set([
  'useQuery',
  'useInfiniteQuery',
  'useQueries',
  'useSuspenseQuery',
])

function detectQueryOptionsAsFunction(
  ctx: DetectContext,
  node: ts.CallExpression,
): void {
  if (!ts.isIdentifier(node.expression)) return
  const hook = node.expression.text
  if (!QUERY_OPTS_HOOKS.has(hook)) return
  const arg0 = node.arguments[0]
  // Only the unambiguous object-literal-first-arg shape. An identifier /
  // call / function arg can't be statically proven wrong — stay silent.
  if (!arg0 || !ts.isObjectLiteralExpression(arg0)) return

  const objText = getNodeText(ctx, arg0)
  pushDiag(
    ctx,
    node,
    'query-options-as-function',
    `\`${hook}\` takes options as a FUNCTION so \`queryKey\` can read signals and refetch reactively — an object literal is captured once and never reacts. Wrap it: \`${hook}(() => (...))\`.`,
    getNodeText(ctx, node),
    `${hook}(() => (${objText}))`,
    // No `migrate_pyreon` tool yet — claiming fixable would mislead.
    false,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: raw addEventListener / removeEventListener
// ═══════════════════════════════════════════════════════════════════════════════

function detectRawEventListener(ctx: DetectContext, node: ts.CallExpression): void {
  const callee = node.expression
  if (!ts.isPropertyAccessExpression(callee)) return
  if (!ts.isIdentifier(callee.name)) return
  const method = callee.name.text
  if (method !== 'addEventListener' && method !== 'removeEventListener') return

  // Only flag when the target is `window` / `document` / an identifier
  // that looks like a DOM element. Property-access chains (e.g.
  // `editor.dom.addEventListener`) are generally CodeMirror / framework
  // hosts — leave those alone.
  const target = callee.expression
  const targetName = ts.isIdentifier(target)
    ? target.text
    : ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.name)
      ? target.name.text
      : ''

  const flagTargets = new Set(['window', 'document', 'body', 'el', 'element', 'node', 'target'])
  if (!flagTargets.has(targetName)) return

  if (method === 'addEventListener') {
    pushDiag(
      ctx,
      node,
      'raw-add-event-listener',
      'Raw `addEventListener` in a component / hook body bypasses Pyreon\'s lifecycle cleanup — listeners leak on unmount. Use `useEventListener` from `@pyreon/hooks` for auto-cleanup.',
      getNodeText(ctx, node),
      'useEventListener(target, event, handler)',
      false,
    )
  } else {
    pushDiag(
      ctx,
      node,
      'raw-remove-event-listener',
      'Raw `removeEventListener` is the symptom of manual listener management. Replace the paired `addEventListener` with `useEventListener` from `@pyreon/hooks` — it registers the cleanup automatically.',
      getNodeText(ctx, node),
      'useEventListener(target, event, handler) // cleanup is automatic',
      false,
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: Date.now() + Math.random() for IDs
// ═══════════════════════════════════════════════════════════════════════════════

function isCallTo(node: ts.Node, object: string, method: string): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === object &&
    ts.isIdentifier(node.expression.name) &&
    node.expression.name.text === method
  )
}

function subtreeHas(node: ts.Node, predicate: (n: ts.Node) => boolean): boolean {
  let found = false
  function walk(n: ts.Node): void {
    if (found) return
    if (predicate(n)) {
      found = true
      return
    }
    ts.forEachChild(n, walk)
  }
  walk(node)
  return found
}

function detectDateMathRandomId(ctx: DetectContext, node: ts.Expression): void {
  const hasDate = subtreeHas(node, (n) => isCallTo(n, 'Date', 'now'))
  if (!hasDate) return
  const hasRandom = subtreeHas(node, (n) => isCallTo(n, 'Math', 'random'))
  if (!hasRandom) return

  pushDiag(
    ctx,
    node,
    'date-math-random-id',
    'Combining `Date.now()` + `Math.random()` for unique IDs is collision-prone under rapid operations (paste, clone) — `Date.now()` returns the same value within a millisecond and `Math.random().toString(36).slice(2, 6)` has only ~1.67M combinations. Use a monotonic counter instead.',
    getNodeText(ctx, node),
    'let _counter = 0; const nextId = () => String(++_counter)',
    false,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: onClick={undefined}
// ═══════════════════════════════════════════════════════════════════════════════

function detectOnClickUndefined(ctx: DetectContext, node: ts.JsxAttribute): void {
  if (!ts.isIdentifier(node.name)) return
  const attrName = node.name.text
  if (!attrName.startsWith('on') || attrName.length < 3) return
  if (!node.initializer || !ts.isJsxExpression(node.initializer)) return
  const expr = node.initializer.expression
  if (!expr) return
  const isExplicitUndefined =
    (ts.isIdentifier(expr) && expr.text === 'undefined') ||
    expr.kind === ts.SyntaxKind.VoidExpression

  if (!isExplicitUndefined) return

  pushDiag(
    ctx,
    node,
    'on-click-undefined',
    `\`${attrName}={undefined}\` explicitly passes undefined as a listener. Pyreon's runtime guards against this, but the cleanest pattern is to omit the attribute entirely or use a conditional: \`${attrName}={condition ? handler : undefined}\`.`,
    getNodeText(ctx, node),
    `/* omit ${attrName} when the handler is not defined */`,
    // No `migrate_pyreon` tool yet — claiming fixable would mislead.
    false,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: signal-write-as-call (sig(value) instead of sig.set(value))
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Walks the file and collects every identifier bound to a `signal(...)` or
 * `computed(...)` call. Only `const` declarations are tracked — `let`/`var`
 * may be reassigned to non-signal values, so a use-site call wouldn't be a
 * reliable signal-write.
 *
 * The collection is intentionally scope-blind: a name shadowed in a nested
 * scope (`const x = signal(0); function f() { const x = 5; x(7) }`) would
 * produce a false positive on `x(7)`. That tradeoff is acceptable because
 * (1) shadowing a signal name with a non-signal is itself unusual and
 * (2) the detector message points at exactly the wrong-shape call so a
 * human reviewer can dismiss the rare false positive in seconds.
 */
function collectSignalBindings(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  function isSignalFactoryCall(init: ts.Expression | undefined): boolean {
    if (!init || !ts.isCallExpression(init)) return false
    const callee = init.expression
    if (!ts.isIdentifier(callee)) return false
    return callee.text === 'signal' || callee.text === 'computed'
  }
  function walk(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      // Only `const` — find the parent VariableDeclarationList to check.
      const list = node.parent
      if (
        ts.isVariableDeclarationList(list) &&
        (list.flags & ts.NodeFlags.Const) !== 0 &&
        isSignalFactoryCall(node.initializer)
      ) {
        names.add(node.name.text)
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return names
}

function detectSignalWriteAsCall(ctx: DetectContext, node: ts.CallExpression): void {
  if (ctx.signalBindings.size === 0) return
  const callee = node.expression
  if (!ts.isIdentifier(callee)) return
  if (!ctx.signalBindings.has(callee.text)) return
  // `sig()` (zero args) is a READ — that's the intended Pyreon API.
  if (node.arguments.length === 0) return
  // `sig.set(x)` / `sig.update(fn)` / `sig.peek()` — the proper write/read
  // surface — go through PropertyAccess, not direct CallExpression on the
  // identifier. So if we got here, the call is `sig(value)` or
  // `sig(value, ..)` which is the buggy shape.
  pushDiag(
    ctx,
    node,
    'signal-write-as-call',
    `\`${callee.text}(value)\` does NOT write the signal — \`signal()\` is the read-only callable surface and ignores its arguments. Use \`${callee.text}.set(value)\` to assign or \`${callee.text}.update((prev) => …)\` to derive from the previous value. Pyreon's runtime warns about this pattern in dev, but the warning fires AFTER the silent no-op.`,
    getNodeText(ctx, node),
    `${callee.text}.set(${node.arguments.map((a) => getNodeText(ctx, a)).join(', ')})`,
    false,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: static-return-null-conditional in component bodies
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * `if (cond) return null` at the top of a component body runs ONCE — Pyreon
 * components mount and never re-execute their function bodies. A signal
 * change inside `cond` therefore never re-evaluates the condition; the
 * component is permanently stuck on whichever branch the first run picked.
 *
 * The fix is to wrap the conditional in a returned reactive accessor:
 *   return (() => { if (!cond()) return null; return <div /> })
 *
 * Detection:
 *  - The function contains JSX (i.e. it's a component)
 *  - The function body has an `IfStatement` whose `thenStatement` is
 *    `return null` (either bare `return null` or `{ return null }`)
 *  - The `if` is at the function body's top level, NOT inside a returned
 *    arrow / IIFE (those are reactive scopes — flagging them would be a
 *    false positive)
 */
function returnsNullStatement(stmt: ts.Statement): boolean {
  if (ts.isReturnStatement(stmt)) {
    const expr = stmt.expression
    return !!expr && expr.kind === ts.SyntaxKind.NullKeyword
  }
  if (ts.isBlock(stmt)) {
    return stmt.statements.length === 1 && returnsNullStatement(stmt.statements[0]!)
  }
  return false
}

/**
 * Returns true if the function looks like a top-level component:
 *  - `function PascalName(...) { ... }` (FunctionDeclaration with PascalCase id), OR
 *  - `const PascalName = (...) => { ... }` (arrow inside a VariableDeclaration whose name is PascalCase).
 *
 * Anonymous nested arrows — most importantly the reactive accessor
 * `return (() => { if (!cond()) return null; return <div /> })` — are
 * NOT considered components here, even when they contain JSX. Without
 * this filter the detector would fire on the very pattern the
 * diagnostic recommends as the fix.
 */
function isComponentShapedFunction(
  node: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
): boolean {
  if (ts.isFunctionDeclaration(node)) {
    return !!node.name && /^[A-Z]/.test(node.name.text)
  }
  // Arrow / FunctionExpression: check VariableDeclaration parent.
  const parent = node.parent
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return /^[A-Z]/.test(parent.name.text)
  }
  return false
}

function detectStaticReturnNullConditional(
  ctx: DetectContext,
  node: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
): void {
  // Only component-shaped functions (must render JSX AND be named with
  // PascalCase) — see isComponentShapedFunction for why the name check
  // matters: it filters out the reactive-accessor-as-fix pattern.
  if (!isComponentShapedFunction(node)) return
  if (!containsJsx(node)) return
  const body = node.body
  if (!body || !ts.isBlock(body)) return

  for (const stmt of body.statements) {
    if (!ts.isIfStatement(stmt)) continue
    if (!returnsNullStatement(stmt.thenStatement)) continue
    // Found `if (cond) return null` at top-level component body scope.
    pushDiag(
      ctx,
      stmt,
      'static-return-null-conditional',
      'Pyreon components run ONCE — `if (cond) return null` at the top of a component body is evaluated exactly once at mount. Reading a signal inside `cond` will NOT re-trigger the early return when the signal changes; the component is stuck on whichever branch the first run picked. Wrap the conditional in a returned reactive accessor: `return (() => { if (!cond()) return null; return <div /> })` — the accessor re-runs whenever its tracked signals change.',
      getNodeText(ctx, stmt),
      'return (() => { if (!cond()) return null; return <JSX /> })',
      false,
    )
    // Only flag the FIRST occurrence per component to avoid noise on
    // chained early-returns (often a single mistake, not three).
    return
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: `expr as unknown as VNodeChild`
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * `JSX.Element` (which is what JSX evaluates to) is already assignable to
 * `VNodeChild`. The `as unknown as VNodeChild` double-cast is unnecessary
 * — it's been showing up in `@pyreon/ui-primitives` as a defensive habit
 * carried over from earlier framework versions. The cast is never load-
 * bearing today; removing it never changes runtime behavior. Pure cosmetic
 * but a useful proxy for non-idiomatic Pyreon code in primitives.
 */
function detectAsUnknownAsVNodeChild(ctx: DetectContext, node: ts.AsExpression): void {
  // Outer cast: `... as VNodeChild`
  const outerType = node.type
  if (!ts.isTypeReferenceNode(outerType)) return
  if (!ts.isIdentifier(outerType.typeName) || outerType.typeName.text !== 'VNodeChild') return
  // Inner: `<expr> as unknown`
  const inner = node.expression
  if (!ts.isAsExpression(inner)) return
  if (inner.type.kind !== ts.SyntaxKind.UnknownKeyword) return

  pushDiag(
    ctx,
    node,
    'as-unknown-as-vnodechild',
    '`as unknown as VNodeChild` is unnecessary — `JSX.Element` (the type produced by JSX) is already assignable to `VNodeChild`. Remove the double cast; it is pure noise that hides genuine type issues if they ever appear at this site.',
    getNodeText(ctx, node),
    getNodeText(ctx, inner.expression),
    false,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Island never-with-registry detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pre-pass: walk the source for `island(loader, { name: 'X', hydrate: 'never' })`
 * call expressions and collect the `name` field of each never-strategy island.
 *
 * Recognized shape (mirrors `@pyreon/vite-plugin`'s `scanIslandDeclarations`):
 *
 *   island(() => import('./X'), { name: 'X', hydrate: 'never' })
 *
 * Edge cases the AST-walker deliberately doesn't cover (unrecognized calls
 * fall through and don't populate the set — false-negatives, not false
 * positives):
 *
 *   - Loader is a variable, not an inline arrow
 *   - Name is a variable / template / spread, not a string literal
 *   - Options come from a spread (`island(loader, opts)`)
 *
 * The same rules apply on the registry side (`detectIslandNeverWithRegistry`):
 * unrecognized keys won't match. Both halves are syntactic — a semantic
 * cross-package audit lives in `pyreon doctor --check-islands` (separate PR).
 */
function collectNeverIslandNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  function walk(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'island' &&
      node.arguments.length >= 2
    ) {
      const opts = node.arguments[1]
      if (opts && ts.isObjectLiteralExpression(opts)) {
        let nameVal: string | undefined
        let hydrateVal: string | undefined
        for (const prop of opts.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const key = prop.name
          const keyText = ts.isIdentifier(key)
            ? key.text
            : ts.isStringLiteral(key)
              ? key.text
              : ''
          if (keyText === 'name' && ts.isStringLiteral(prop.initializer)) {
            nameVal = prop.initializer.text
          } else if (keyText === 'hydrate' && ts.isStringLiteral(prop.initializer)) {
            hydrateVal = prop.initializer.text
          }
        }
        if (nameVal && hydrateVal === 'never') {
          names.add(nameVal)
        }
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return names
}

/**
 * Flag entries in `hydrateIslands({ X: () => import('./X'), ... })` whose
 * key matches an `island()` name declared with `hydrate: 'never'` in the
 * same file. Each matching entry produces one diagnostic at the property's
 * location so the IDE highlights exactly which key needs to go.
 */
function detectIslandNeverWithRegistry(ctx: DetectContext, node: ts.CallExpression): void {
  if (ctx.neverIslandNames.size === 0) return
  const callee = node.expression
  if (!ts.isIdentifier(callee) || callee.text !== 'hydrateIslands') return
  const arg = node.arguments[0]
  if (!arg || !ts.isObjectLiteralExpression(arg)) return
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue
    const key = prop.name
    const keyText = ts.isIdentifier(key)
      ? key.text
      : ts.isStringLiteral(key)
        ? key.text
        : ''
    if (!keyText || !ctx.neverIslandNames.has(keyText)) continue
    pushDiag(
      ctx,
      prop,
      'island-never-with-registry-entry',
      `island "${keyText}" was declared with \`hydrate: 'never'\` and MUST NOT be registered in \`hydrateIslands({ ... })\`. The whole point of the \`'never'\` strategy is shipping zero client JS — registering pulls the component module into the client bundle graph (the runtime short-circuits never-strategy before the registry lookup, but the bundler still includes the import). Drop this entry; the framework handles never-strategy islands at SSR with no client-side wiring.`,
      getNodeText(ctx, prop),
      `// remove the "${keyText}" entry — never-strategy islands need no registry entry`,
      false,
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Visitor
// ═══════════════════════════════════════════════════════════════════════════════

function visitNode(ctx: DetectContext, node: ts.Node): void {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    detectForKeying(ctx, node)
  }
  if (
    ts.isArrowFunction(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node)
  ) {
    detectPropsDestructured(ctx, node)
    detectPropsDestructuredBody(ctx, node)
    detectStaticReturnNullConditional(ctx, node)
  }
  if (ts.isBinaryExpression(node)) {
    detectProcessDevGate(ctx, node)
    detectDateMathRandomId(ctx, node)
  }
  if (ts.isTemplateExpression(node)) {
    detectDateMathRandomId(ctx, node)
  }
  if (ts.isCallExpression(node)) {
    detectEmptyTheme(ctx, node)
    detectRawEventListener(ctx, node)
    detectSignalWriteAsCall(ctx, node)
    detectIslandNeverWithRegistry(ctx, node)
    detectQueryOptionsAsFunction(ctx, node)
  }
  if (ts.isJsxAttribute(node)) {
    detectOnClickUndefined(ctx, node)
  }
  if (ts.isAsExpression(node)) {
    detectAsUnknownAsVNodeChild(ctx, node)
  }
}

function visit(ctx: DetectContext, node: ts.Node): void {
  ts.forEachChild(node, (child) => {
    visitNode(ctx, child)
    visit(ctx, child)
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

export function detectPyreonPatterns(code: string, filename = 'input.tsx'): PyreonDiagnostic[] {
  const sf = ts.createSourceFile(filename, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const ctx: DetectContext = {
    sf,
    code,
    diagnostics: [],
    signalBindings: collectSignalBindings(sf),
    neverIslandNames: collectNeverIslandNames(sf),
  }
  visit(ctx, sf)
  // Sort by (line, column) for stable ordering when multiple patterns fire.
  ctx.diagnostics.sort((a, b) => a.line - b.line || a.column - b.column)
  return ctx.diagnostics
}

/** Fast regex pre-filter — returns true if the code is worth a full AST walk. */
export function hasPyreonPatterns(code: string): boolean {
  return (
    /\bFor\b[^=]*\beach\s*=/.test(code) ||
    /\btypeof\s+process\b/.test(code) ||
    /\.theme\s*\(\s*\{\s*\}\s*\)/.test(code) ||
    /\b(?:add|remove)EventListener\s*\(/.test(code) ||
    (/\bDate\.now\s*\(/.test(code) && /\bMath\.random\s*\(/.test(code)) ||
    /on[A-Z]\w*\s*=\s*\{\s*undefined\s*\}/.test(code) ||
    // Bounded `{0,500}` / `{1,500}` quantifiers — this is a pre-filter
    // scan before the precise AST walker, so losing detector recall on
    // a pathologically long single-line input is acceptable.
    /=\s*\(\s*\{[^}]{1,500}\}\s*[:)]/.test(code) ||
    // props-destructured-body: `const { … } = <ident>` anywhere.
    /\b(?:const|let|var)\s+\{[^}]{0,500}\}\s*=\s*[A-Za-z_$]/.test(code) ||
    // signal-write-as-call: `const X = signal(` declaration anywhere
    /\b(?:signal|computed)\s*[<(]/.test(code) ||
    // static-return-null-conditional: `if (...) return null` anywhere.
    // `[\s{]*` (single class) instead of `\s*\{?\s*` (overlapping
    // quantifiers) — the latter is polynomial on long whitespace runs.
    /\bif\s*\([^)]{1,500}\)[\s{]{0,20}return\s+null\b/.test(code) ||
    // as-unknown-as-vnodechild
    /\bas\s+unknown\s+as\s+VNodeChild\b/.test(code) ||
    // query-options-as-function: a query hook called with an object literal
    /\b(?:useQuery|useInfiniteQuery|useQueries|useSuspenseQuery)\s*\(\s*\{/.test(
      code,
    ) ||
    // island-never-with-registry-entry: a never-strategy declaration AND a
    // hydrateIslands call must both appear in the same source for the bug
    // shape to trigger. Pre-filter on EITHER half — the AST walker fast-
    // exits when the never-island set is empty.
    (/\bisland\s*\(/.test(code) && /\bhydrate\s*:\s*['"]never['"]/.test(code))
  )
}
