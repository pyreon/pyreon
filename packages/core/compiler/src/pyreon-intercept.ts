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
 *
 * Two-mode surface mirrors `react-intercept.ts`:
 *  - `detectPyreonPatterns(code)` — diagnostics only
 *  - `hasPyreonPatterns(code)`   — fast regex pre-filter
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
  | 'process-dev-gate'
  | 'empty-theme'
  | 'raw-add-event-listener'
  | 'raw-remove-event-listener'
  | 'date-math-random-id'
  | 'on-click-undefined'

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
      true,
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
    true,
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
    true,
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
    true,
  )
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
  }
  if (ts.isJsxAttribute(node)) {
    detectOnClickUndefined(ctx, node)
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
  const ctx: DetectContext = { sf, code, diagnostics: [] }
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
    /=\s*\(\s*\{[^}]+\}\s*[:)]/.test(code)
  )
}
