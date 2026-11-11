/**
 * React Pattern Interceptor — detects React/Vue patterns in code and provides
 * structured diagnostics with exact fix suggestions for AI-assisted migration.
 *
 * Two modes:
 *  - `detectReactPatterns(code)` — returns diagnostics only (non-destructive)
 *  - `migrateReactCode(code)` — applies auto-fixes and returns transformed code
 *
 * Designed for three consumers:
 *  1. Compiler pre-pass (warnings during build)
 *  2. CLI `pyreon doctor` (project-wide scanning)
 *  3. MCP server `migrate_react` / `validate` tools (AI agent integration)
 */

import ts from 'typescript'
import { filterSuppressed } from './detector-suppression'
import { assertClassicTs } from './ts'

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type ReactDiagnosticCode =
  | 'react-import'
  | 'react-dom-import'
  | 'react-router-import'
  | 'use-state'
  | 'use-effect-mount'
  | 'use-effect-deps'
  | 'use-effect-no-deps'
  | 'use-memo'
  | 'use-callback'
  | 'use-ref-dom'
  | 'use-ref-box'
  | 'use-reducer'
  | 'use-layout-effect'
  | 'memo-wrapper'
  | 'forward-ref'
  | 'class-name-prop'
  | 'html-for-prop'
  | 'on-change-input'
  | 'dangerously-set-inner-html'
  | 'dot-value-signal'
  | 'array-map-jsx'
  | 'key-on-for-child'
  | 'create-context-import'
  | 'use-context-import'

export interface ReactDiagnostic {
  /** Machine-readable code for filtering and programmatic handling */
  code: ReactDiagnosticCode
  /** Human-readable message explaining the issue */
  message: string
  /** 1-based line number */
  line: number
  /** 0-based column */
  column: number
  /** The code as written */
  current: string
  /** The suggested Pyreon equivalent */
  suggested: string
  /** Whether migrateReactCode can auto-fix this */
  fixable: boolean
}

export interface MigrationChange {
  type: 'replace' | 'remove' | 'add'
  line: number
  description: string
}

export interface MigrationResult {
  /** Transformed source code */
  code: string
  /** All detected patterns (including unfixable ones) */
  diagnostics: ReactDiagnostic[]
  /** Description of changes applied */
  changes: MigrationChange[]
  /**
   * Patterns left unconverted (or converted with a caveat), each with the
   * reason and what to write instead. An empty list means every React pattern
   * the migrator recognised was rewritten into Pyreon that updates.
   */
  manual: MigrationNote[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// React Hook → Pyreon mapping
// ═══════════════════════════════════════════════════════════════════════════════

interface HookMapping {
  pyreonFn: string
  pyreonImport: string
  description: string
  example: string
}

const _REACT_HOOK_MAP: Record<string, HookMapping> = {
  useState: {
    pyreonFn: 'signal',
    pyreonImport: '@pyreon/reactivity',
    description: 'Signals are callable functions — read: count(), write: count.set(5)',
    example:
      'const count = signal(0)\n// Read: count()  Write: count.set(5)  Update: count.update(n => n + 1)',
  },
  useEffect: {
    pyreonFn: 'effect',
    pyreonImport: '@pyreon/reactivity',
    description: 'Effects auto-track signal dependencies — no dependency array needed',
    example: 'effect(() => {\n  console.log(count()) // auto-subscribes to count\n})',
  },
  useLayoutEffect: {
    pyreonFn: 'effect',
    pyreonImport: '@pyreon/reactivity',
    description: 'Pyreon effects run synchronously after signal updates',
    example: 'effect(() => {\n  // runs sync after signal changes\n})',
  },
  useMemo: {
    pyreonFn: 'computed',
    pyreonImport: '@pyreon/reactivity',
    description: 'Computed values auto-track dependencies and memoize',
    example: 'const doubled = computed(() => count() * 2)',
  },
  useCallback: {
    pyreonFn: '(plain function)',
    pyreonImport: '',
    description:
      'Not needed — Pyreon components run once, so closures never go stale. Use a plain function',
    example: 'const handleClick = () => doSomething(count())',
  },
  useReducer: {
    pyreonFn: 'signal',
    pyreonImport: '@pyreon/reactivity',
    description: 'Use signal with update() for reducer-like patterns',
    example:
      'const state = signal(initialState)\nconst dispatch = (action) => state.update(s => reducer(s, action))',
  },
}

/** React import sources → Pyreon equivalents */
const IMPORT_REWRITES: Record<string, string | null> = {
  react: '@pyreon/core',
  'react-dom': '@pyreon/runtime-dom',
  'react-dom/client': '@pyreon/runtime-dom',
  'react-dom/server': '@pyreon/runtime-server',
  'react-router': '@pyreon/router',
  'react-router-dom': '@pyreon/router',
}

/** JSX attribute rewrites (React → standard HTML) */
const JSX_ATTR_REWRITES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Detection (diagnostic-only, no modifications)
// ═══════════════════════════════════════════════════════════════════════════════

interface DetectContext {
  sf: ts.SourceFile
  code: string
  diagnostics: ReactDiagnostic[]
  reactImportedHooks: Set<string>
  /**
   * Identifiers bound to a signal factory (`const x = signal(...)` /
   * `computed(...)` / `useSignal(...)` / `createSignal(...)`) anywhere in the
   * file. Only `const` declarations are tracked — `let`/`var` may be
   * reassigned to a non-signal value, so a `.value` write through them
   * wouldn't be a reliable signal-write. The collection is scope-blind for
   * the same reason `collectSignalBindings` in `pyreon-intercept.ts` is — the
   * rare shadow-a-signal-name case is acceptable noise; the precision win is
   * eliminating the `input.value = ''` / `cell.value = x` / `o.value = y`
   * false-positive class entirely.
   */
  signalBindings: Set<string>
}

/**
 * Collects every identifier bound to a signal factory call. Mirrors
 * `pyreon-intercept.ts:collectSignalBindings` but also recognises the
 * `useSignal` / `createSignal` aliases (Solid / hook-style) so the React
 * detector — which runs on cross-framework migration input — doesn't miss a
 * genuine `mySignal.value = x` written by someone coming from Solid/Vue.
 */
function collectDetectSignalBindings(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  function isSignalFactoryCall(init: ts.Expression | undefined): boolean {
    if (!init || !ts.isCallExpression(init)) return false
    const callee = init.expression
    if (!ts.isIdentifier(callee)) return false
    return (
      callee.text === 'signal' ||
      callee.text === 'computed' ||
      callee.text === 'useSignal' ||
      callee.text === 'createSignal'
    )
  }
  function walk(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
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

function detectGetNodeText(ctx: DetectContext, node: ts.Node): string {
  return ctx.code.slice(node.getStart(ctx.sf), node.getEnd())
}

function detectDiag(
  ctx: DetectContext,
  node: ts.Node,
  diagCode: ReactDiagnosticCode,
  message: string,
  current: string,
  suggested: string,
  fixable: boolean,
): void {
  const { line, character } = ctx.sf.getLineAndCharacterOfPosition(node.getStart(ctx.sf))
  ctx.diagnostics.push({
    code: diagCode,
    message,
    line: line + 1,
    column: character,
    current: current.trim(),
    suggested: suggested.trim(),
    fixable,
  })
}

function detectImportDeclaration(ctx: DetectContext, node: ts.ImportDeclaration): void {
  if (!node.moduleSpecifier) return
  const source = (node.moduleSpecifier as ts.StringLiteral).text
  const pyreonSource = IMPORT_REWRITES[source]

  if (pyreonSource !== undefined) {
    if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const spec of node.importClause.namedBindings.elements) {
        ctx.reactImportedHooks.add(spec.name.text)
      }
    }

    const diagCode = source.startsWith('react-router')
      ? 'react-router-import'
      : source.startsWith('react-dom')
        ? 'react-dom-import'
        : 'react-import'

    detectDiag(
      ctx,
      node,
      diagCode,
      `Import from '${source}' is a React package. Use Pyreon equivalent.`,
      detectGetNodeText(ctx, node),
      pyreonSource
        ? `import { ... } from "${pyreonSource}"`
        : 'Remove this import — not needed in Pyreon',
      true,
    )
  }
}

function detectUseState(ctx: DetectContext, node: ts.CallExpression): void {
  const parent = node.parent
  if (
    ts.isVariableDeclaration(parent) &&
    parent.name &&
    ts.isArrayBindingPattern(parent.name) &&
    parent.name.elements.length >= 1
  ) {
    const firstEl = parent.name.elements[0]
    const valueName =
      firstEl && ts.isBindingElement(firstEl) ? (firstEl.name as ts.Identifier).text : 'value'
    const initArg = node.arguments[0] ? detectGetNodeText(ctx, node.arguments[0]) : 'undefined'

    detectDiag(
      ctx,
      node,
      'use-state',
      `useState is a React API. In Pyreon, use signal(). Read: ${valueName}(), Write: ${valueName}.set(x)`,
      detectGetNodeText(ctx, parent),
      `${valueName} = signal(${initArg})`,
      true,
    )
  } else {
    detectDiag(
      ctx,
      node,
      'use-state',
      'useState is a React API. In Pyreon, use signal().',
      detectGetNodeText(ctx, node),
      'signal(initialValue)',
      true,
    )
  }
}

function callbackHasCleanup(callbackArg: ts.Expression): boolean {
  if (!ts.isArrowFunction(callbackArg) && !ts.isFunctionExpression(callbackArg)) return false
  const body = callbackArg.body
  if (!ts.isBlock(body)) return false
  for (const stmt of body.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) return true
  }
  return false
}

function detectUseEffect(ctx: DetectContext, node: ts.CallExpression): void {
  const hookName = (node.expression as ts.Identifier).text
  const depsArg = node.arguments[1]
  const callbackArg = node.arguments[0]

  if (depsArg && ts.isArrayLiteralExpression(depsArg) && depsArg.elements.length === 0) {
    const hasCleanup = callbackArg ? callbackHasCleanup(callbackArg) : false

    detectDiag(
      ctx,
      node,
      'use-effect-mount',
      `${hookName} with empty deps [] means "run once on mount". Use onMount() in Pyreon.`,
      detectGetNodeText(ctx, node),
      hasCleanup
        ? 'onMount(() => {\n  // setup...\n  return () => { /* cleanup */ }\n})'
        : 'onMount(() => {\n  // setup...\n})',
      true,
    )
  } else if (depsArg && ts.isArrayLiteralExpression(depsArg)) {
    detectDiag(
      ctx,
      node,
      'use-effect-deps',
      `${hookName} with dependency array. In Pyreon, effect() auto-tracks dependencies — no array needed.`,
      detectGetNodeText(ctx, node),
      'effect(() => {\n  // reads are auto-tracked\n})',
      true,
    )
  } else if (!depsArg) {
    detectDiag(
      ctx,
      node,
      'use-effect-no-deps',
      `${hookName} with no dependency array. In Pyreon, use effect() — it auto-tracks signal reads.`,
      detectGetNodeText(ctx, node),
      'effect(() => {\n  // runs when accessed signals change\n})',
      true,
    )
  }
}

function detectUseMemo(ctx: DetectContext, node: ts.CallExpression): void {
  const computeFn = node.arguments[0]
  const computeText = computeFn ? detectGetNodeText(ctx, computeFn) : '() => value'

  detectDiag(
    ctx,
    node,
    'use-memo',
    'useMemo is a React API. In Pyreon, use computed() — dependencies auto-tracked.',
    detectGetNodeText(ctx, node),
    `computed(${computeText})`,
    true,
  )
}

function detectUseCallback(ctx: DetectContext, node: ts.CallExpression): void {
  const callbackFn = node.arguments[0]
  const callbackText = callbackFn ? detectGetNodeText(ctx, callbackFn) : '() => {}'

  detectDiag(
    ctx,
    node,
    'use-callback',
    'useCallback is not needed in Pyreon. Components run once, so closures never go stale. Use a plain function.',
    detectGetNodeText(ctx, node),
    callbackText,
    true,
  )
}

function detectUseRef(ctx: DetectContext, node: ts.CallExpression): void {
  const arg = node.arguments[0]
  const isNullInit =
    arg &&
    (arg.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(arg) && arg.text === 'undefined'))

  if (isNullInit) {
    detectDiag(
      ctx,
      node,
      'use-ref-dom',
      'useRef(null) for DOM refs. In Pyreon, use createRef() from @pyreon/core.',
      detectGetNodeText(ctx, node),
      'createRef()',
      true,
    )
  } else {
    const initText = arg ? detectGetNodeText(ctx, arg) : 'undefined'
    detectDiag(
      ctx,
      node,
      'use-ref-box',
      'useRef for a mutable value. In Pyreon, a plain { current } object is the same non-reactive box (use signal() only if the UI should update when it changes).',
      detectGetNodeText(ctx, node),
      `{ current: ${initText} }`,
      true,
    )
  }
}

function detectUseReducer(ctx: DetectContext, node: ts.CallExpression): void {
  detectDiag(
    ctx,
    node,
    'use-reducer',
    'useReducer is a React API. In Pyreon, use signal() with update() for reducer patterns.',
    detectGetNodeText(ctx, node),
    'const state = signal(initialState)\nconst dispatch = (action) => state.update(s => reducer(s, action))',
    true,
  )
}

function isCallToReactDot(callee: ts.Expression, methodName: string): boolean {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'React' &&
    callee.name.text === methodName
  )
}

function detectMemoWrapper(ctx: DetectContext, node: ts.CallExpression): void {
  const callee = node.expression
  const isMemo =
    (ts.isIdentifier(callee) && callee.text === 'memo') || isCallToReactDot(callee, 'memo')

  if (isMemo) {
    const inner = node.arguments[0]
    const innerText = inner ? detectGetNodeText(ctx, inner) : 'Component'

    detectDiag(
      ctx,
      node,
      'memo-wrapper',
      'memo() is not needed in Pyreon. Components run once — only signals trigger updates, not re-renders.',
      detectGetNodeText(ctx, node),
      innerText,
      true,
    )
  }
}

function detectForwardRef(ctx: DetectContext, node: ts.CallExpression): void {
  const callee = node.expression
  const isForwardRef =
    (ts.isIdentifier(callee) && callee.text === 'forwardRef') ||
    isCallToReactDot(callee, 'forwardRef')

  if (isForwardRef) {
    detectDiag(
      ctx,
      node,
      'forward-ref',
      'forwardRef is not needed in Pyreon. Pass ref as a regular prop.',
      detectGetNodeText(ctx, node),
      '// Just pass ref as a prop:\nconst MyInput = (props) => <input ref={props.ref} />',
      true,
    )
  }
}

/**
 * Is this `<input>` a TEXT-like control, i.e. one where `change` fires on blur?
 *
 * Absent or unrecognised `type` counts as text, because that is what the
 * browser defaults to. A non-literal type (`type={t()}`) is unknowable
 * statically and is treated as text so the advice still reaches the common
 * case rather than going silent.
 */
function isTextLikeInput(jsxElement: ts.Node): boolean {
  const COMMITTED_ON_SELECT = new Set([
    'checkbox',
    'radio',
    'file',
    'range',
    'color',
    'date',
    'datetime-local',
    'month',
    'week',
    'time',
    'submit',
    'reset',
    'button',
    'image',
    'hidden',
  ])
  // The caller hands over what `findParentJsxElement` returns, which for a
  // non-self-closing `<input …></input>` is the OPENING element — it carries
  // the attributes directly. Reading only the self-closing and full-element
  // shapes left that case with no `type` probe, so `<input type="checkbox">`
  // written with a closing tag was reported as text-like.
  const attrs = ts.isJsxSelfClosingElement(jsxElement)
    ? jsxElement.attributes
    : ts.isJsxOpeningElement(jsxElement)
      ? jsxElement.attributes
      : ts.isJsxElement(jsxElement)
        ? jsxElement.openingElement.attributes
        : undefined
  if (!attrs) return true
  for (const a of attrs.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== 'type') continue
    const init = a.initializer
    if (init && ts.isStringLiteral(init)) return !COMMITTED_ON_SELECT.has(init.text)
    return true
  }
  return true
}

function detectJsxAttributes(ctx: DetectContext, node: ts.JsxAttribute): void {
  const attrName = (node.name as ts.Identifier).text

  if (attrName in JSX_ATTR_REWRITES) {
    const htmlAttr = JSX_ATTR_REWRITES[attrName] as string
    detectDiag(
      ctx,
      node,
      attrName === 'className' ? 'class-name-prop' : 'html-for-prop',
      `'${attrName}' is a React JSX attribute. Use '${htmlAttr}' in Pyreon (standard HTML).`,
      detectGetNodeText(ctx, node),
      detectGetNodeText(ctx, node).replace(attrName, htmlAttr),
      true,
    )
  }

  if (attrName === 'onChange') {
    const jsxElement = findParentJsxElement(node)
    if (jsxElement) {
      const tagName = getJsxTagName(jsxElement)
      // `change` fires on BLUR only for text-like controls. On a checkbox,
      // radio, file, range, color or date picker -- and on `<select>` -- it
      // fires the moment the value is committed, which is exactly what the
      // author wants, and `input` is the wrong advice there. The detector used
      // to flag all three tags unconditionally and told `RadioGroupBase` to
      // rewrite a correct handler on its hidden native radio.
      if (tagName === 'textarea' || (tagName === 'input' && isTextLikeInput(jsxElement))) {
        detectDiag(
          ctx,
          node,
          'on-change-input',
          `onChange on <${tagName}> fires on blur in Pyreon (native DOM behavior). For keypress-by-keypress updates, use onInput.`,
          detectGetNodeText(ctx, node),
          detectGetNodeText(ctx, node).replace('onChange', 'onInput'),
          true,
        )
      }
    }
  }

  // `dangerouslySetInnerHTML` is deliberately NOT flagged. Pyreon ships BOTH
  // props with different contracts: this one is raw (React semantics, the
  // author owns sanitization) and `innerHTML` is the SANITIZED path. They are
  // not interchangeable, and the old advice to "use innerHTML in Pyreon" was
  // actively harmful -- it silently changes the value through a sanitizer, and
  // `innerHTML` THROWS during SSR (`throwSsrInnerHtmlUnsupported`), so taking
  // the suggestion breaks server rendering outright.
}

function detectDotValueSignal(ctx: DetectContext, node: ts.PropertyAccessExpression): void {
  const varName = (node.expression as ts.Identifier).text
  // Precision gate: only flag `X.value = …` when X is actually a tracked
  // signal binding. Without this, the detector false-positived on every
  // DOM-element / data-object `.value` write — `input.value = ''`,
  // `cell.value = x`, `o.value = y`, `ref.current.value = z` (the receiver
  // there is the `.current` PropertyAccess, already excluded by
  // `isDotValueAccess` requiring an Identifier receiver). Require positive
  // evidence the receiver is a `const X = signal(...)` / `computed(...)` /
  // `useSignal(...)` / `createSignal(...)` binding before emitting.
  if (!ctx.signalBindings.has(varName)) return
  const parent = node.parent
  if (ts.isBinaryExpression(parent) && parent.left === node) {
    detectDiag(
      ctx,
      node,
      'dot-value-signal',
      `'${varName}.value' looks like a Vue ref pattern. Pyreon signals are callable functions. Use ${varName}.set(x) to write.`,
      detectGetNodeText(ctx, parent),
      `${varName}.set(${detectGetNodeText(ctx, parent.right)})`,
      false,
    )
  }
}

/**
 * Whether an inline `.map` callback renders JSX: an arrow / function whose
 * result (expression body, or any `return` in its own body) is JSX, possibly
 * behind parentheses, `as`, `!`, a conditional or `&&` / `||` / `??`.
 * `undefined` when the callback is not inline (`items.map(renderRow)`), so
 * the caller decides what an unknown callback means.
 */
function mapCallbackRendersJsx(callback: ts.Expression | undefined): boolean | undefined {
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return undefined
  }
  const isJsx = (e: ts.Expression): boolean => {
    let cur: ts.Expression = e
    while (
      ts.isParenthesizedExpression(cur) ||
      ts.isAsExpression(cur) ||
      ts.isNonNullExpression(cur) ||
      ts.isSatisfiesExpression(cur)
    ) {
      cur = cur.expression
    }
    if (ts.isJsxElement(cur) || ts.isJsxSelfClosingElement(cur) || ts.isJsxFragment(cur)) return true
    if (ts.isConditionalExpression(cur)) return isJsx(cur.whenTrue) || isJsx(cur.whenFalse)
    if (ts.isBinaryExpression(cur)) {
      const op = cur.operatorToken.kind
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return isJsx(cur.left) || isJsx(cur.right)
      }
    }
    return false
  }
  const body = callback.body
  if (!ts.isBlock(body)) return isJsx(body)
  let found = false
  const visit = (n: ts.Node): void => {
    if (found) return
    // A nested function's `return` belongs to that function, not the callback.
    if (ts.isFunctionLike(n)) return
    if (ts.isReturnStatement(n) && n.expression && isJsx(n.expression)) {
      found = true
      return
    }
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(body, visit)
  return found
}

function detectArrayMapJsx(ctx: DetectContext, node: ts.CallExpression): void {
  const parent = node.parent
  // Only a `.map()` RENDERED as children is the React list habit:
  // `<ul>{items.map((i) => <li/>)}</ul>`. An attribute value that maps data
  // (`rows={lines.map((l) => [l.item, l.qty])}`) and a callback that returns
  // no JSX are ordinary array code and were false positives (#4363). A
  // callback that is not inline (`items.map(renderRow)`) is still reported in
  // child position: it is rendered either way.
  if (
    ts.isJsxExpression(parent) &&
    (ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent)) &&
    mapCallbackRendersJsx(node.arguments[0]) !== false
  ) {
    const arrayExpr = detectGetNodeText(
      ctx,
      (node.expression as ts.PropertyAccessExpression).expression,
    )
    const mapCallback = node.arguments[0]
    const mapCallbackText = mapCallback
      ? detectGetNodeText(ctx, mapCallback)
      : 'item => <li>{item}</li>'

    detectDiag(
      ctx,
      node,
      'array-map-jsx',
      'Array.map() in JSX is not reactive in Pyreon. Use <For> for efficient keyed list rendering.',
      detectGetNodeText(ctx, node),
      `<For each={${arrayExpr}} by={item => item.id}>\n  {${mapCallbackText}}\n</For>`,
      false,
    )
  }
}

function isCallToHook(node: ts.Node, hookName: string): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === hookName
  )
}

function isCallToEffectHook(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === 'useEffect' || node.expression.text === 'useLayoutEffect')
  )
}

function isMapCallExpression(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.name) &&
    node.expression.name.text === 'map'
  )
}

function isDotValueAccess(node: ts.Node): node is ts.PropertyAccessExpression {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === 'value' &&
    ts.isIdentifier(node.expression)
  )
}

function detectVisitNode(ctx: DetectContext, node: ts.Node): void {
  if (ts.isImportDeclaration(node)) detectImportDeclaration(ctx, node)
  if (isCallToHook(node, 'useState')) detectUseState(ctx, node)
  if (isCallToEffectHook(node)) detectUseEffect(ctx, node)
  if (isCallToHook(node, 'useMemo')) detectUseMemo(ctx, node)
  if (isCallToHook(node, 'useCallback')) detectUseCallback(ctx, node)
  if (isCallToHook(node, 'useRef')) detectUseRef(ctx, node)
  if (isCallToHook(node, 'useReducer')) detectUseReducer(ctx, node)
  if (ts.isCallExpression(node)) detectMemoWrapper(ctx, node)
  if (ts.isCallExpression(node)) detectForwardRef(ctx, node)
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) detectJsxAttributes(ctx, node)
  if (isDotValueAccess(node)) detectDotValueSignal(ctx, node)
  if (isMapCallExpression(node)) detectArrayMapJsx(ctx, node)
}

function detectVisit(ctx: DetectContext, node: ts.Node): void {
  ts.forEachChild(node, (child) => {
    detectVisitNode(ctx, child)
    detectVisit(ctx, child)
  })
}

export function detectReactPatterns(code: string, filename = 'input.tsx'): ReactDiagnostic[] {
  assertClassicTs()
  const sf = ts.createSourceFile(filename, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const ctx: DetectContext = {
    sf,
    code,
    diagnostics: [],
    reactImportedHooks: new Set<string>(),
    signalBindings: collectDetectSignalBindings(sf),
  }

  detectVisit(ctx, sf)
  // Same escape hatch as the pyreon detectors — one comment convention for
  // every finding a user sees, whichever matcher produced it.
  return filterSuppressed(ctx.diagnostics, code, 'react-patterns')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Migration (detection + auto-fix)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The migrator rewrites React into Pyreon that UPDATES. Renaming the hooks is the
// easy half; the other half is every place the React code relied on the
// component body re-running:
//
//   - a `useState` value becomes a signal, so every READ becomes `count()` and
//     every setter call becomes `count.set(v)` / `count.update(fn)`;
//   - a `useMemo` value becomes a `computed`, read the same way;
//   - a body-level `const` derived from state becomes a `computed` (the body runs
//     once, so a plain `const` would freeze at its first value);
//   - a component whose RETURN reads state outside JSX returns an accessor.
//
// Every reference is resolved lexically, so a parameter or local that shadows a
// state name is left alone. Anything the migrator cannot convert safely stays in
// place, keeps its React import, and is listed in `manual` with the reason.
// Edits are non-overlapping spans; a structural edit (deleting a deps array,
// unwrapping `memo(...)`) swallows the edits inside the span it removes.

type Edit = { start: number; end: number; text: string; seq: number; swallow: boolean }

/** Marks a note's position while edits are applied; never present in the output. */
const NOTE_MARK = '\u0000'

/** A pattern the migrator left unconverted (or converted with a caveat). */
export interface MigrationNote {
  /** 1-based line in the MIGRATED code */
  line: number
  /** 0-based column in the MIGRATED code */
  column: number
  /** What was not converted, and why */
  message: string
  /** What to write instead */
  suggested: string
}

/** How a React (or React DOM / React Router) export converts. */
type HookRole =
  | 'state'
  | 'reducer'
  | 'effect'
  | 'memo'
  | 'callback'
  | 'ref'
  | 'memoWrapper'
  | 'forwardRef'
  | 'createRoot'

type SpecifierPlan =
  | { kind: 'structural'; role: HookRole }
  | { kind: 'same'; from: string }
  | { kind: 'rename'; name: string; from: string }

const REACT_SPECIFIERS: Record<string, SpecifierPlan> = {
  // Rewritten at their call sites, by role.
  useState: { kind: 'structural', role: 'state' },
  useReducer: { kind: 'structural', role: 'reducer' },
  useEffect: { kind: 'structural', role: 'effect' },
  useLayoutEffect: { kind: 'structural', role: 'effect' },
  useMemo: { kind: 'structural', role: 'memo' },
  useCallback: { kind: 'structural', role: 'callback' },
  useRef: { kind: 'structural', role: 'ref' },
  memo: { kind: 'structural', role: 'memoWrapper' },
  forwardRef: { kind: 'structural', role: 'forwardRef' },
  createRoot: { kind: 'structural', role: 'createRoot' },
  // Same name, same contract.
  createContext: { kind: 'same', from: '@pyreon/core' },
  useContext: { kind: 'same', from: '@pyreon/core' },
  Fragment: { kind: 'same', from: '@pyreon/core' },
  Suspense: { kind: 'same', from: '@pyreon/core' },
  lazy: { kind: 'same', from: '@pyreon/core' },
  hydrateRoot: { kind: 'same', from: '@pyreon/runtime-dom' },
  useNavigate: { kind: 'same', from: '@pyreon/router' },
  useParams: { kind: 'same', from: '@pyreon/router' },
  // Renamed.
  Link: { kind: 'rename', name: 'RouterLink', from: '@pyreon/router' },
  NavLink: { kind: 'rename', name: 'RouterLink', from: '@pyreon/router' },
  Outlet: { kind: 'rename', name: 'RouterView', from: '@pyreon/router' },
}

/** Why a React export without a plan is left alone. */
const UNSUPPORTED_REASONS: Record<string, string> = {
  useSearchParams:
    "Pyreon's useSearchParams() returns [get accessor, set(updates)] rather than React Router's [URLSearchParams, setter]",
  useLocation: 'Pyreon has no useLocation(); read the current route from useRoute()()',
}

/** The conversion role of a React export, if it is rewritten at its call sites. */
function roleOf(name: string): HookRole | undefined {
  const plan = REACT_SPECIFIERS[name]
  return plan?.kind === 'structural' ? plan.role : undefined
}

type BindingKind =
  | { kind: 'signal' } // read → x()
  | { kind: 'setter'; signal: string } // setX(v) → x.set(v)
  | { kind: 'replace'; text: string } // forwardRef's ref param → props.ref

interface ReactImportBinding {
  /** The import, or undefined for a snippet's un-imported global (`useState(0)` with no import) */
  decl: ts.ImportDeclaration | undefined
  /** The import-clause node that declares the local name */
  node: ts.ImportSpecifier | ts.ImportClause | ts.NamespaceImport | undefined
  local: string
  /** React's own export name (e.g. useState), or '*' for a default/namespace import */
  canonical: string
  typeOnly: boolean
  /** Reference identifiers that the migrator rewrote or consumed */
  converted: Set<ts.Node>
}

class ReactMigrator {
  readonly sf: ts.SourceFile
  readonly code: string
  readonly edits: Edit[] = []
  readonly changes: MigrationChange[] = []
  /** Notes, positioned in the INPUT until `run()` maps them onto the output */
  readonly manual: MigrationNote[] = []
  private readonly noteOffsets: number[] = []
  private seq = 0
  /** Pyreon imports the output needs: module → names (value imports) */
  private readonly needed = new Map<string, Set<string>>()
  private readonly neededTypes = new Map<string, Set<string>>()
  private readonly reactImports = new Map<ts.Node, ReactImportBinding>()
  /** Un-imported React names in a snippet, by name */
  private readonly globals = new Map<string, ReactImportBinding>()
  /** Declaration identifier → how references to it are rewritten */
  private readonly bindings = new Map<ts.Identifier, BindingKind>()
  /** Every identifier node that is a value reference, with its resolved declaration */
  private refs: Array<{ id: ts.Identifier; decl: ts.Identifier | undefined }> = []
  /** Type-position references (`React.FC`, `ReactNode`) — they keep their React import */
  private typeRefs: Array<{ id: ts.Identifier; decl: ts.Identifier | undefined }> = []
  private readonly scopeCache = new Map<ts.Node, ts.Identifier[]>()
  /** Functions that call a converted state hook (component bodies or custom hooks) */
  private readonly hookFunctions = new Set<ts.FunctionLikeDeclaration>()
  /** Return statements that become `return () => (…)` */
  private readonly accessorReturns = new Set<ts.ReturnStatement>()
  /** Body-level consts that become `computed(() => …)` */
  private readonly derivedConsts = new Set<ts.VariableDeclaration>()
  /** Bindings whose value is a DOM ref (`createRef()`) */
  private readonly domRefs = new Set<ts.Identifier>()

  constructor(sf: ts.SourceFile, code: string) {
    this.sf = sf
    this.code = code
  }

  // ── small helpers ────────────────────────────────────────────────────────────

  private text(node: ts.Node): string {
    return this.code.slice(node.getStart(this.sf), node.getEnd())
  }

  private pos(node: ts.Node): { line: number; column: number } {
    const lc = this.sf.getLineAndCharacterOfPosition(node.getStart(this.sf))
    return { line: lc.line + 1, column: lc.character }
  }

  private edit(start: number, end: number, text: string, swallow = false): void {
    this.edits.push({ start, end, text, seq: this.seq++, swallow })
  }

  private replaceNode(node: ts.Node, text: string, swallow = false): void {
    this.edit(node.getStart(this.sf), node.getEnd(), text, swallow)
  }

  private change(
    node: ts.Node,
    description: string,
    type: MigrationChange['type'] = 'replace',
  ): void {
    this.changes.push({ type, line: this.pos(node).line, description })
  }

  private note(node: ts.Node, message: string, suggested: string): void {
    this.manual.push({ ...this.pos(node), message, suggested })
    this.noteOffsets.push(node.getStart(this.sf))
  }

  private need(module: string, name: string, typeOnly = false): void {
    const map = typeOnly ? this.neededTypes : this.needed
    let set = map.get(module)
    if (!set) {
      set = new Set()
      map.set(module, set)
    }
    set.add(name)
  }

  /** Source text of `node` with the edits already registered inside it applied. */
  private rendered(node: ts.Node): string {
    return this.applyRange(node.getStart(this.sf), node.getEnd())
  }

  // ── lexical scope resolution ─────────────────────────────────────────────────

  private static bindingNames(name: ts.BindingName, out: ts.Identifier[]): void {
    if (ts.isIdentifier(name)) {
      out.push(name)
      return
    }
    for (const el of name.elements) {
      if (!ts.isOmittedExpression(el)) ReactMigrator.bindingNames(el.name, out)
    }
  }

  /** Identifiers a scope node declares directly. */
  private declarationsOf(scope: ts.Node): ts.Identifier[] {
    const cached = this.scopeCache.get(scope)
    if (cached) return cached
    const out: ts.Identifier[] = []
    if (ts.isFunctionLike(scope)) {
      for (const p of scope.parameters) ReactMigrator.bindingNames(p.name, out)
      if ((ts.isFunctionExpression(scope) || ts.isClassExpression(scope)) && scope.name) {
        out.push(scope.name)
      }
    }
    const statements =
      ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope)
        ? scope.statements
        : ts.isCaseClause(scope) || ts.isDefaultClause(scope)
          ? scope.statements
          : undefined
    if (statements) {
      for (const s of statements) {
        if (ts.isVariableStatement(s)) {
          for (const d of s.declarationList.declarations) ReactMigrator.bindingNames(d.name, out)
        } else if (
          (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) &&
          s.name
        ) {
          out.push(s.name)
        } else if (ts.isImportDeclaration(s) && s.importClause) {
          const clause = s.importClause
          if (clause.name) out.push(clause.name)
          const nb = clause.namedBindings
          if (nb && ts.isNamespaceImport(nb)) out.push(nb.name)
          if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) out.push(el.name)
        }
      }
    }
    if (
      (ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) &&
      scope.initializer &&
      ts.isVariableDeclarationList(scope.initializer)
    ) {
      for (const d of scope.initializer.declarations) ReactMigrator.bindingNames(d.name, out)
    }
    if (ts.isCatchClause(scope) && scope.variableDeclaration) {
      ReactMigrator.bindingNames(scope.variableDeclaration.name, out)
    }
    this.scopeCache.set(scope, out)
    return out
  }

  /** The declaration identifier `id` refers to, or undefined (a global). */
  private resolve(id: ts.Identifier): ts.Identifier | undefined {
    let node: ts.Node | undefined = id.parent
    while (node) {
      for (const d of this.declarationsOf(node)) if (d.text === id.text) return d
      node = node.parent
    }
    return undefined
  }

  /** True when `id` is a VALUE reference (not a property name, declaration, type, label…). */
  private static isValueReference(id: ts.Identifier): boolean {
    const p = id.parent
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false
    if (ts.isQualifiedName(p)) return false
    if (
      (ts.isPropertyAssignment(p) ||
        ts.isMethodDeclaration(p) ||
        ts.isPropertyDeclaration(p) ||
        ts.isPropertySignature(p) ||
        ts.isMethodSignature(p) ||
        ts.isGetAccessorDeclaration(p) ||
        ts.isSetAccessorDeclaration(p) ||
        ts.isEnumMember(p)) &&
      p.name === id
    ) {
      return false
    }
    if (ts.isJsxAttribute(p)) return false
    if (ts.isBindingElement(p) && (p.propertyName === id || p.name === id)) return false
    if (
      (ts.isVariableDeclaration(p) ||
        ts.isParameter(p) ||
        ts.isFunctionDeclaration(p) ||
        ts.isFunctionExpression(p) ||
        ts.isClassDeclaration(p) ||
        ts.isClassExpression(p) ||
        ts.isEnumDeclaration(p) ||
        ts.isInterfaceDeclaration(p) ||
        ts.isTypeAliasDeclaration(p) ||
        ts.isTypeParameterDeclaration(p)) &&
      p.name === id
    ) {
      return false
    }
    if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p)) return false
    if (ts.isNamespaceImport(p)) return false
    if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false
    if (
      (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) &&
      p.tagName === id &&
      /^[a-z]/.test(id.text)
    ) {
      return false // intrinsic element
    }
    // Anything inside a type annotation is a type reference.
    for (let a: ts.Node | undefined = p; a; a = a.parent) {
      if (ts.isTypeNode(a) && !ts.isExpressionWithTypeArguments(a)) return false
      if (ts.isStatement(a) || ts.isSourceFile(a)) break
    }
    return true
  }

  /** `X` in `X`, `X<T>` or `X.Y` as a type. */
  private static isTypeReference(id: ts.Identifier): boolean {
    const p = id.parent
    if (ts.isTypeReferenceNode(p) && p.typeName === id) return true
    if (ts.isQualifiedName(p) && p.left === id) return true
    if (ts.isTypeQueryNode(p) && p.exprName === id) return true
    return false
  }

  private collectReferences(): void {
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        if (ReactMigrator.isValueReference(node)) {
          this.refs.push({ id: node, decl: this.resolve(node) })
        } else if (ReactMigrator.isTypeReference(node)) {
          const decl = this.resolve(node)
          if (decl && this.reactImports.has(decl)) this.typeRefs.push({ id: node, decl })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(this.sf)
  }

  private referencesTo(decl: ts.Identifier): ts.Identifier[] {
    return this.refs.filter((r) => r.decl === decl).map((r) => r.id)
  }

  // ── React imports ────────────────────────────────────────────────────────────

  private collectReactImports(): void {
    for (const stmt of this.sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
      if (!(stmt.moduleSpecifier.text in IMPORT_REWRITES)) continue
      const clause = stmt.importClause
      if (!clause) continue // side-effect import: removed below
      const typeOnlyDecl = clause.isTypeOnly
      const add = (
        node: ReactImportBinding['node'],
        nameNode: ts.Identifier,
        canonical: string,
        typeOnly: boolean,
      ): void => {
        this.reactImports.set(nameNode, {
          decl: stmt,
          node,
          local: nameNode.text,
          canonical,
          typeOnly,
          converted: new Set(),
        })
      }
      if (clause.name) add(clause, clause.name, '*', typeOnlyDecl)
      const nb = clause.namedBindings
      if (nb && ts.isNamespaceImport(nb)) add(nb, nb.name, '*', typeOnlyDecl)
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          add(el, el.name, (el.propertyName ?? el.name).text, typeOnlyDecl || el.isTypeOnly)
        }
      }
    }
  }

  /**
   * The React export an expression names — useState for useState or
   * `React.useState` — with the identifier nodes that make up the reference.
   */
  private reactName(
    expr: ts.Expression,
  ): { name: string; binding: ReactImportBinding; refNode: ts.Identifier } | undefined {
    if (ts.isIdentifier(expr)) {
      const b = this.reactBindingOf(expr)
      if (b && b.canonical !== '*') return { name: b.canonical, binding: b, refNode: expr }
      return undefined
    }
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
      const b = this.reactBindingOf(expr.expression)
      if (b && b.canonical === '*')
        return { name: expr.name.text, binding: b, refNode: expr.expression }
    }
    return undefined
  }

  /**
   * The React import an identifier refers to. A snippet pasted without its
   * imports (`const [n, setN] = useState(0)`) is common input for an AI tool,
   * so an UNDECLARED identifier named like a React export (or `React`) counts too.
   */
  private reactBindingOf(id: ts.Identifier): ReactImportBinding | undefined {
    const decl = this.resolve(id)
    if (decl) return this.reactImports.get(decl)
    const name = id.text
    if (name !== 'React' && !(name in REACT_SPECIFIERS)) return undefined
    let b = this.globals.get(name)
    if (!b) {
      b = {
        decl: undefined,
        node: undefined,
        local: name,
        canonical: name === 'React' ? '*' : name,
        typeOnly: false,
        converted: new Set(),
      }
      this.globals.set(name, b)
    }
    return b
  }

  /** Replace a React callee/tag reference (useState or React.useState) with `text`. */
  private replaceReactRef(expr: ts.Expression, text: string): void {
    this.markConverted(expr)
    this.replaceNode(expr, text)
  }

  /** Record that a React callee (a hook, possibly React.-qualified) was consumed by a conversion. */
  private markConverted(expr: ts.Expression): void {
    const r = this.reactName(expr)!
    r.binding.converted.add(r.refNode)
  }

  // ── analysis: which bindings become signals ─────────────────────────────────

  private enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
    for (let a = node.parent; a; a = a.parent) {
      if (
        ts.isFunctionDeclaration(a) ||
        ts.isFunctionExpression(a) ||
        ts.isArrowFunction(a) ||
        ts.isMethodDeclaration(a)
      ) {
        return a
      }
    }
    return undefined
  }

  private collectBindings(): void {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const r = this.reactName(node.expression)
        const role = r && roleOf(r.name)
        if (role === 'state' || role === 'reducer') this.analyzeStateHook(node, role)
        if (role === 'memo') this.analyzeMemo(node)
        if (role === 'ref') this.analyzeRef(node)
        if (role === 'forwardRef') this.analyzeForwardRef(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(this.sf)
  }

  /** `const [a, setA] = useState(…)` / `const [s, dispatch] = useReducer(…)`. */
  private stateDeclaration(
    call: ts.CallExpression,
  ):
    | { decl: ts.VariableDeclaration; name: string; value?: ts.Identifier; second?: ts.Identifier }
    | undefined {
    const decl = call.parent
    if (!ts.isVariableDeclaration(decl) || decl.initializer !== call) return undefined
    if (!ts.isArrayBindingPattern(decl.name) || decl.name.elements.length > 2) return undefined
    const [first, second] = decl.name.elements
    const ident = (el: ts.ArrayBindingElement | undefined): ts.Identifier | undefined | null => {
      if (!el || ts.isOmittedExpression(el)) return undefined
      if (el.dotDotDotToken || el.initializer || !ts.isIdentifier(el.name)) return null
      return el.name
    }
    const value = ident(first)
    const setter = ident(second)
    if (value === null || setter === null || (!value && !setter)) return undefined
    // `const [, setCount] = useState(0)` still needs a signal to write to.
    let name = value?.text
    if (!name) {
      const base = setter!.text.replace(/^set(?=[A-Z])/, '')
      name = base.charAt(0).toLowerCase() + base.slice(1)
      if (name === setter!.text || new RegExp(`\\b${name}\\b`).test(this.code))
        name = `${name}State`
    }
    return { decl, name, ...(value ? { value } : {}), ...(setter ? { second: setter } : {}) }
  }

  private analyzeStateHook(call: ts.CallExpression, role: 'state' | 'reducer'): void {
    const shape = this.stateDeclaration(call)
    if (!shape) return // reported as manual in `convertStateHook`
    if (shape.value) this.bindings.set(shape.value, { kind: 'signal' })
    if (shape.second && role === 'state') {
      this.bindings.set(shape.second, { kind: 'setter', signal: shape.name })
    }
    // A module-level hook (a pasted snippet) has no body that re-runs.
    const fn = this.enclosingFunction(call)
    if (fn) this.hookFunctions.add(fn)
  }

  private analyzeMemo(call: ts.CallExpression): void {
    const decl = call.parent
    const fn = this.enclosingFunction(call)
    if (ts.isVariableDeclaration(decl) && decl.initializer === call && ts.isIdentifier(decl.name)) {
      this.bindings.set(decl.name, { kind: 'signal' })
      if (fn) this.hookFunctions.add(fn)
    }
  }

  private analyzeRef(call: ts.CallExpression): void {
    const decl = call.parent
    if (isEmptyRefInit(call) && ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
      this.domRefs.add(decl.name)
    }
  }

  private analyzeForwardRef(call: ts.CallExpression): void {
    const fn = call.arguments[0]
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return
    const [props, ref] = fn.parameters
    if (
      fn.parameters.length === 2 &&
      props &&
      ref &&
      ts.isIdentifier(props.name) &&
      ts.isIdentifier(ref.name)
    ) {
      this.bindings.set(ref.name, { kind: 'replace', text: `${props.name.text}.ref` })
    }
  }

  /**
   * Reads of a signal at SETUP level (not inside a nested function, not inside
   * JSX — the compiler wraps those) ran on every render in React but run once
   * in Pyreon. A body-level `const` becomes a `computed`; the component's
   * `return` becomes an accessor; anything else is reported.
   */
  private analyzeSetupReads(): void {
    for (let changed = true; changed;) {
      changed = false
      for (const ref of this.refs) {
        const kind = ref.decl ? this.bindings.get(ref.decl) : undefined
        if (!kind || kind.kind !== 'signal') continue
        const site = this.setupSite(ref.id)
        if (!site) continue
        if (site.kind === 'derived' && !this.derivedConsts.has(site.decl)) {
          this.derivedConsts.add(site.decl)
          this.bindings.set(site.decl.name as ts.Identifier, { kind: 'signal' })
          changed = true
        } else if (site.kind === 'return') {
          this.accessorReturns.add(site.stmt)
        }
      }
    }
    const reported = new Set<ts.Node>()
    for (const ref of this.refs) {
      const kind = ref.decl ? this.bindings.get(ref.decl) : undefined
      if (!kind || kind.kind !== 'signal') continue
      const site = this.setupSite(ref.id)
      if (!site || site.kind !== 'manual' || reported.has(site.stmt)) continue
      reported.add(site.stmt)
      this.note(
        site.stmt,
        `\`${ref.id.text}\` is read once, when the component is set up. React re-ran this on every render; Pyreon does not, so this line will not see later changes.`,
        site.hook
          ? `return the signal itself (\`${ref.id.text}\`) and call it where the value is used`
          : `move the read into JSX, a computed(() => …), or wrap the branch in <Show when={() => …}>`,
      )
    }
  }

  private setupSite(
    id: ts.Identifier,
  ):
    | { kind: 'derived'; decl: ts.VariableDeclaration }
    | { kind: 'return'; stmt: ts.ReturnStatement }
    | { kind: 'manual'; stmt: ts.Node; hook: boolean }
    | undefined {
    let stmt: ts.Statement | undefined
    for (let a: ts.Node = id; a.parent; a = a.parent) {
      const p = a.parent
      if (ts.isFunctionLike(p) || ts.isClassLike(p)) {
        // Reached the function that owns this statement.
        // A hook binding is declared by a statement, so its function has a
        // block body and `stmt` is that body's direct child.
        if (!stmt || !this.hookFunctions.has(p as ts.FunctionLikeDeclaration)) return undefined
        return this.classifySetupStatement(stmt, id, isHookName(p))
      }
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p))
        return undefined
      if (ts.isCallExpression(p) && this.isOnceArgument(p, a)) return undefined
      if (ts.isStatement(a)) stmt = a
    }
    return undefined
  }

  /** `useState(init)` / `useRef(init)` / `useReducer(r, init)` read their argument once by design. */
  private isOnceArgument(call: ts.CallExpression, arg: ts.Node): boolean {
    const r = this.reactName(call.expression)
    const role = r && roleOf(r.name)
    if (role === 'state' || role === 'ref' || role === 'reducer') {
      return call.arguments.some((a) => a === arg)
    }
    // A deps array is deleted by the conversion.
    if (role === 'effect' || role === 'memo' || role === 'callback') {
      return call.arguments[1] === arg
    }
    return false
  }

  private classifySetupStatement(
    stmt: ts.Statement,
    id: ts.Identifier,
    hook: boolean,
  ):
    | { kind: 'derived'; decl: ts.VariableDeclaration }
    | { kind: 'return'; stmt: ts.ReturnStatement }
    | { kind: 'manual'; stmt: ts.Node; hook: boolean } {
    if (ts.isVariableStatement(stmt) && (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      const decl = stmt.declarationList.declarations.find(
        (d) => d.initializer && d.initializer.pos <= id.pos && id.end <= d.initializer.end,
      )
      if (decl && ts.isIdentifier(decl.name) && decl.initializer) {
        const r = ts.isCallExpression(decl.initializer)
          ? this.reactName(decl.initializer.expression)
          : undefined
        // A hook result (`useMemo(…)` etc.) is converted on its own.
        if (!r) return { kind: 'derived', decl }
      }
    }
    if (ts.isReturnStatement(stmt) && stmt.expression && !hook) return { kind: 'return', stmt }
    return { kind: 'manual', stmt, hook }
  }

  // ── edits: references ────────────────────────────────────────────────────────

  private rewriteReferences(): void {
    for (const { id, decl } of this.refs) {
      const kind = decl ? this.bindings.get(decl) : undefined
      if (!kind) continue
      if (kind.kind === 'signal') this.rewriteSignalRead(id)
      else if (kind.kind === 'setter') this.rewriteSetter(id, kind.signal)
      else this.replaceNode(id, kind.text)
    }
  }

  private rewriteSignalRead(id: ts.Identifier): void {
    const p = id.parent
    if (ts.isShorthandPropertyAssignment(p) && p.name === id) {
      this.replaceNode(id, `${id.text}: ${id.text}()`)
      return
    }
    this.replaceNode(id, `${id.text}()`)
  }

  private rewriteSetter(id: ts.Identifier, signal: string): void {
    const p = id.parent
    if (ts.isCallExpression(p) && p.expression === id) {
      const arg = p.arguments[0]
      const isUpdater = arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))
      this.replaceNode(id, `${signal}.${isUpdater ? 'update' : 'set'}`)
      return
    }
    // Passed as a value (e.g. a callback prop): keep React's contract, which
    // accepts a value or an updater function.
    const text = `((next) => (typeof next === 'function' ? ${signal}.update(next) : ${signal}.set(next)))`
    if (ts.isShorthandPropertyAssignment(p) && p.name === id) {
      this.replaceNode(id, `${id.text}: ${text}`)
    } else {
      this.replaceNode(id, text)
    }
  }

  // ── edits: structural ────────────────────────────────────────────────────────

  private convertCalls(): void {
    const visit = (node: ts.Node): void => {
      ts.forEachChild(node, visit) // inner first, so `rendered()` sees inner edits
      if (!ts.isCallExpression(node)) return
      const r = this.reactName(node.expression)
      if (r) {
        switch (roleOf(r.name)) {
          case 'state':
          case 'reducer':
            this.convertStateHook(node, r.name)
            break
          case 'effect':
            this.convertEffect(node, r.name)
            break
          case 'memo':
            this.convertMemo(node)
            break
          case 'callback':
            this.convertCallback(node)
            break
          case 'ref':
            this.convertRef(node)
            break
          case 'memoWrapper':
            this.convertMemoWrapper(node)
            break
          case 'forwardRef':
            this.convertForwardRef(node)
            break
        }
        return
      }
      // createRoot(el).render(node) → mount(node, el)
      const callee = node.expression
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'render' &&
        ts.isCallExpression(callee.expression)
      ) {
        const inner = callee.expression
        const ir = this.reactName(inner.expression)
        const container = inner.arguments[0]
        const root = node.arguments[0]
        if (ir?.name === 'createRoot' && container && root) {
          ir.binding.converted.add(ir.refNode)
          this.replaceNode(node, `mount(${this.rendered(root)}, ${this.rendered(container)})`, true)
          this.need('@pyreon/runtime-dom', 'mount')
          this.change(node, 'createRoot(el).render(app) → mount(app, el)')
        }
      }
    }
    visit(this.sf)
  }

  private convertStateHook(call: ts.CallExpression, hook: string): void {
    const shape = this.stateDeclaration(call)
    if (!shape) {
      this.note(
        call,
        `${hook}() is only converted in the \`const [value, setValue] = ${hook}(…)\` shape inside a function.`,
        roleOf(hook) === 'state'
          ? 'const value = signal(initial) — read value(), write value.set(v)'
          : 'const state = signal(initial)',
      )
      return
    }
    const value = shape.name
    this.need('@pyreon/reactivity', 'signal')
    if (roleOf(hook) === 'state') {
      this.edit(shape.decl.name.getStart(this.sf), shape.decl.name.getEnd(), value)
      this.replaceReactRef(call.expression, 'signal')
      const init = call.arguments[0]
      if (!init) {
        this.edit(call.arguments.pos, call.arguments.end, 'undefined')
        if (call.typeArguments?.[0]) {
          const t = call.typeArguments[0]
          this.replaceNode(t, `${this.text(t)} | undefined`)
        }
      } else if (
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
        init.parameters.length === 0
      ) {
        // Lazy initializer: React calls it once; a signal would store the function.
        if (ts.isArrowFunction(init) && !ts.isBlock(init.body)) {
          this.replaceNode(init, this.rendered(init.body), true)
        } else {
          this.replaceNode(init, `(${this.rendered(init)})()`, true)
        }
      }
      this.change(
        call,
        `useState → signal: ${value}${shape.second ? ` (reads → ${value}(), ${shape.second.text}(v) → ${value}.set(v))` : ''}`,
      )
      return
    }
    // useReducer(reducer, initialArg, init?)
    const [reducer, initialArg, initFn] = call.arguments
    if (!reducer || !initialArg) {
      this.note(
        call,
        'useReducer() needs a reducer and an initial state to convert.',
        'const state = signal(initial)',
      )
      return
    }
    const initCallee =
      initFn && (ts.isIdentifier(initFn) ? this.rendered(initFn) : `(${this.rendered(initFn)})`)
    const init = initCallee
      ? `${initCallee}(${this.rendered(initialArg)})`
      : this.rendered(initialArg)
    let reducerName = this.rendered(reducer)
    let prelude = ''
    if (!ts.isIdentifier(reducer)) {
      reducerName = `${value}Reducer`
      prelude = `${reducerName} = ${this.rendered(reducer)}, `
    }
    const dispatch = shape.second
      ? `, ${shape.second.text} = (action: Parameters<typeof ${reducerName}>[1]) => ${value}.update((state) => ${reducerName}(state, action))`
      : ''
    this.replaceNode(shape.decl, `${prelude}${value} = signal(${init})${dispatch}`, true)
    this.markConverted(call.expression)
    this.change(
      call,
      `useReducer → signal: ${value}${shape.second ? ` + ${shape.second.text}(action)` : ''}`,
    )
  }

  private deleteTrailingArgs(call: ts.CallExpression, keep: ts.Expression): void {
    const last = call.arguments[call.arguments.length - 1]
    if (last && last !== keep) this.edit(keep.getEnd(), last.getEnd(), '', true)
  }

  private convertEffect(call: ts.CallExpression, hook: string): void {
    const [cb, deps] = call.arguments
    if (!cb) return
    const once = deps && ts.isArrayLiteralExpression(deps) && deps.elements.length === 0
    if (once) {
      this.replaceReactRef(call.expression, 'onMount')
      this.need('@pyreon/core', 'onMount')
      this.deleteTrailingArgs(call, cb)
      this.change(call, `${hook}(fn, []) → onMount(fn)`)
      return
    }
    // React runs an effect AFTER the DOM is attached. A Pyreon `effect` runs at
    // setup, before mount — fine unless it touches a DOM ref, which would still
    // be null. Those start in onMount.
    const readsDomRef = this.refs.some(
      (r) => r.decl && this.domRefs.has(r.decl) && r.id.pos >= cb.pos && r.id.end <= cb.end,
    )
    this.need('@pyreon/reactivity', 'effect')
    if (readsDomRef) {
      const handle = this.freshName('stopEffect')
      const indent = this.indentOf(call)
      this.replaceReactRef(call.expression, `onMount(() => {\n${indent}  const ${handle} = effect`)
      this.edit(
        call.getEnd(),
        call.getEnd(),
        `\n${indent}  return () => ${handle}.dispose()\n${indent}})`,
      )
      this.need('@pyreon/core', 'onMount')
    } else {
      this.replaceReactRef(call.expression, 'effect')
    }
    this.deleteTrailingArgs(call, cb)
    this.change(call, `${hook} → effect (dependencies tracked from the signals it reads)`)
    if (deps && ts.isArrayLiteralExpression(deps)) this.checkDeps(call, cb, deps, hook)
  }

  /** A Pyreon effect tracks every signal it reads; flag reads React's deps array did not list. */
  private checkDeps(
    call: ts.CallExpression,
    cb: ts.Expression,
    deps: ts.ArrayLiteralExpression,
    hook: string,
  ): void {
    const listed = new Set(deps.elements.filter(ts.isIdentifier).map((e) => e.text))
    const extra = new Set<string>()
    for (const r of this.refs) {
      if (!r.decl || r.id.pos < cb.pos || r.id.end > cb.end) continue
      if (this.bindings.get(r.decl)?.kind === 'signal' && !listed.has(r.id.text))
        extra.add(r.id.text)
    }
    if (extra.size === 0) return
    const names = [...extra].join(', ')
    this.note(
      call,
      `This ${hook} now also re-runs when ${names} change${extra.size === 1 ? 's' : ''} — its deps array did not list ${extra.size === 1 ? 'it' : 'them'}. Pyreon effects track every signal they read.`,
      `read ${[...extra].map((n) => `${n}.peek()`).join(' / ')} instead if the effect must not re-run on ${names}`,
    )
  }

  private convertMemo(call: ts.CallExpression): void {
    const fn = call.arguments[0]
    if (!fn) return
    this.replaceReactRef(call.expression, 'computed')
    this.need('@pyreon/reactivity', 'computed')
    this.deleteTrailingArgs(call, fn)
    const decl = call.parent
    if (!(ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name))) {
      this.note(
        call,
        'This useMemo() result is not bound to a const, so its reads could not be rewritten.',
        'const value = computed(() => …) — read value()',
      )
    }
    this.change(call, 'useMemo → computed (dependencies tracked from the signals it reads)')
  }

  private convertCallback(call: ts.CallExpression): void {
    const fn = call.arguments[0]
    if (!fn) return
    this.markConverted(call.expression)
    this.edit(call.getStart(this.sf), fn.getStart(this.sf), '', true)
    this.edit(fn.getEnd(), call.getEnd(), '', true)
    this.change(call, 'useCallback → plain function (components run once)')
  }

  private convertRef(call: ts.CallExpression): void {
    const arg = call.arguments[0]
    if (isEmptyRefInit(call)) {
      this.replaceReactRef(call.expression, 'createRef')
      this.need('@pyreon/core', 'createRef')
      if (arg) this.edit(call.arguments.pos, call.arguments.end, '', true)
      this.change(call, 'useRef(null) → createRef()')
      return
    }
    if (!arg) return
    // A mutable box. React's useRef never triggers a re-render, and neither
    // does a plain object — a signal would break every `.current` access.
    this.markConverted(call.expression)
    const t = call.typeArguments?.[0]
    this.edit(
      call.getStart(this.sf),
      arg.getStart(this.sf),
      t ? '({ current: ' : '{ current: ',
      true,
    )
    this.edit(arg.getEnd(), call.getEnd(), t ? ` } as { current: ${this.text(t)} })` : ' }', true)
    this.change(call, 'useRef(value) → { current: value } (a plain mutable box, as in React)')
  }

  private convertMemoWrapper(call: ts.CallExpression): void {
    const inner = call.arguments[0]
    if (!inner) return
    this.markConverted(call.expression)
    this.edit(call.getStart(this.sf), inner.getStart(this.sf), '', true)
    this.edit(inner.getEnd(), call.getEnd(), '', true)
    this.change(call, 'Removed memo() wrapper (components run once)', 'remove')
  }

  private convertForwardRef(call: ts.CallExpression): void {
    const fn = call.arguments[0]
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
      this.note(
        call,
        'forwardRef() is only unwrapped around an inline (props, ref) => … function.',
        'const Comp = (props) => <input ref={props.ref} />',
      )
      return
    }
    const [props, ref] = fn.parameters
    if (fn.parameters.length === 2 && props && ref && !ts.isIdentifier(props.name)) {
      this.note(
        call,
        'forwardRef() with destructured props is not unwrapped: the ref must be read as props.ref.',
        'const Comp = (props) => <input ref={props.ref} />',
      )
      return
    }
    this.markConverted(call.expression)
    this.edit(call.getStart(this.sf), fn.getStart(this.sf), '', true)
    this.edit(fn.getEnd(), call.getEnd(), '', true)
    if (props && ref) {
      // `(props, ref)` → `(props: P & { ref?: Ref<T> })`; reads of `ref` → `props.ref`.
      const [refType, propsType] = call.typeArguments ?? []
      const refInner = refType
        ? this.text(refType)
        : ref.type && ts.isTypeReferenceNode(ref.type) && ref.type.typeArguments?.[0]
          ? this.text(ref.type.typeArguments[0])
          : undefined
      const refProp = refInner ? `{ ref?: Ref<${refInner}> }` : undefined
      if (refProp) this.need('@pyreon/core', 'Ref', true)
      if (props.type) {
        if (refProp) this.edit(props.type.getEnd(), ref.getEnd(), ` & ${refProp}`, true)
        else this.edit(props.getEnd(), ref.getEnd(), '', true)
      } else {
        const typeText = propsType
          ? `${this.text(propsType)}${refProp ? ` & ${refProp}` : ''}`
          : refProp
        this.edit(props.name.getEnd(), ref.getEnd(), typeText ? `: ${typeText}` : '', true)
      }
    }
    this.change(call, 'Removed forwardRef wrapper (the ref arrives as props.ref)', 'remove')
  }

  /** Leading whitespace of the line `node` starts on. */
  private indentOf(node: ts.Node): string {
    const start = node.getStart(this.sf)
    const lineStart = this.code.lastIndexOf('\n', start - 1) + 1
    return /^[ \t]*/.exec(this.code.slice(lineStart, start))![0]
  }

  private freshName(base: string): string {
    let name = base
    for (let i = 2; this.code.includes(name); i++) name = `${base}${i}`
    return name
  }

  // ── edits: setup-level reads ─────────────────────────────────────────────────

  private convertSetupReads(): void {
    for (const decl of this.derivedConsts) {
      const init = decl.initializer!
      // An object literal needs parens to stay an expression body.
      const paren = ts.isObjectLiteralExpression(skipParens(init))
      this.edit(
        init.getStart(this.sf),
        init.getStart(this.sf),
        paren ? 'computed(() => (' : 'computed(() => ',
      )
      this.edit(init.getEnd(), init.getEnd(), paren ? '))' : ')')
      this.need('@pyreon/reactivity', 'computed')
      this.change(
        decl,
        `${(decl.name as ts.Identifier).text}: derived from state → computed (the body runs once)`,
      )
    }
    for (const stmt of this.accessorReturns) {
      const expr = stmt.expression!
      this.edit(expr.getStart(this.sf), expr.getStart(this.sf), '() => (')
      this.edit(expr.getEnd(), expr.getEnd(), ')')
      this.change(stmt, 'return reads state outside JSX → return an accessor (the body runs once)')
    }
  }

  // ── edits: JSX attributes and plain React references ─────────────────────────

  private convertJsxAndReferences(): void {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) this.convertJsxAttribute(node)
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'Provider' &&
        !ts.isJsxClosingElement(node.parent)
      ) {
        const r = this.reactNameOfContext(node.expression)
        if (r) {
          this.note(
            node,
            'Pyreon contexts have no .Provider component.',
            `provide(${this.text(node.expression)}, value) in the providing component's setup`,
          )
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(this.sf)

    // Plain (non-structural) React references: same-name and renamed exports.
    for (const { id } of this.refs) {
      const b = this.reactBindingOf(id)
      if (!b || b.typeOnly) continue
      let name = b.canonical
      let refNode: ts.Node = id
      if (name === '*') {
        const p = id.parent
        if (!(ts.isPropertyAccessExpression(p) && p.expression === id)) continue
        name = p.name.text
        refNode = p
      }
      const plan = REACT_SPECIFIERS[name]
      if (!plan || plan.kind === 'structural') continue
      if (name === 'Fragment' && this.convertFragmentTag(refNode)) {
        b.converted.add(id)
        continue
      }
      if (plan.kind === 'same') {
        this.need(plan.from, name)
        if (refNode !== id) this.replaceNode(refNode, name)
      } else {
        this.need(plan.from, plan.name)
        this.replaceNode(refNode, plan.name)
        if (name === 'NavLink' && ts.isJsxOpeningLikeElement(id.parent)) {
          this.note(
            id.parent,
            'NavLink → RouterLink: RouterLink sets an active class itself; a className/style FUNCTION prop is not supported.',
            '<RouterLink to="…" activeClass="active">',
          )
        }
      }
      b.converted.add(id)
    }
  }

  /**
   * `<Fragment>…</Fragment>` → `<>…</>`. Pyreon's Fragment is a symbol for
   * `h()`, not a JSX component. Returns false for a non-tag use or a keyed
   * Fragment (left in place and reported).
   */
  private convertFragmentTag(ref: ts.Node): boolean {
    const el = ref.parent
    if (
      !(ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el) || ts.isJsxClosingElement(el))
    ) {
      return false
    }
    if (el.tagName !== ref) return false
    if (ts.isJsxClosingElement(el)) {
      const opening = (el.parent as ts.JsxElement).openingElement
      if (opening.attributes.properties.length > 0) return false
      this.replaceNode(el, '</>')
      return true
    }
    if (el.attributes.properties.length > 0) {
      this.note(
        el,
        'A <Fragment> with props (e.g. key) has no Pyreon JSX equivalent; <> takes no props.',
        'drop the key (For keys rows with by={…}) and use <>…</>',
      )
      return false
    }
    this.replaceNode(el, ts.isJsxSelfClosingElement(el) ? '<></>' : '<>')
    if (ts.isJsxOpeningElement(el)) this.change(el, '<Fragment> → <>')
    return true
  }

  /** `X` in `X.Provider` when X was created by React's createContext. */
  private reactNameOfContext(expr: ts.Expression): boolean {
    if (!ts.isIdentifier(expr)) return false
    const decl = this.resolve(expr)
    const v = decl?.parent
    if (!v || !ts.isVariableDeclaration(v) || !v.initializer || !ts.isCallExpression(v.initializer))
      return false
    return this.reactName(v.initializer.expression)?.name === 'createContext'
  }

  private convertJsxAttribute(node: ts.JsxAttribute): void {
    const attrName = (node.name as ts.Identifier).text
    if (attrName in JSX_ATTR_REWRITES) {
      const htmlAttr = JSX_ATTR_REWRITES[attrName] as string
      this.replaceNode(node.name, htmlAttr)
      this.change(node, `${attrName} → ${htmlAttr}`)
    }
    if (attrName === 'onChange') {
      const el = findParentJsxElement(node)
      const tag = el ? getJsxTagName(el) : ''
      // Same rule as the detector: only where `change` fires on blur.
      if (el && (tag === 'textarea' || (tag === 'input' && isTextLikeInput(el)))) {
        this.replaceNode(node.name, 'onInput')
        this.change(
          node,
          `onChange on <${tag}> → onInput (fires per keystroke, as React's onChange did)`,
        )
      }
    }
    // `dangerouslySetInnerHTML` is left as is: Pyreon supports it with React's
    // raw semantics, while `innerHTML` is the SANITIZED path and throws in SSR.
  }

  // ── imports ──────────────────────────────────────────────────────────────────

  private rewriteImports(): void {
    const byDecl = new Map<ts.ImportDeclaration, ReactImportBinding[]>()
    for (const b of this.reactImports.values()) {
      if (!b.decl) continue
      const list = byDecl.get(b.decl) ?? []
      list.push(b)
      byDecl.set(b.decl, list)
    }
    // A snippet's un-imported React names that stayed unconverted.
    for (const b of this.globals.values()) {
      const first = this.refs.find(
        (r) => !r.decl && r.id.text === b.local && !b.converted.has(r.id),
      )?.id
      if (!first || this.manual.some((n) => n.line === this.pos(first).line)) continue
      const name =
        b.canonical === '*' && ts.isPropertyAccessExpression(first.parent)
          ? this.text(first.parent)
          : b.local
      this.note(
        first,
        UNSUPPORTED_REASONS[name] ?? `This use of \`${name}\` could not be converted.`,
        'rewrite it by hand; the MCP get_api tool documents the Pyreon API',
      )
    }
    const kept = new Set<ReactImportBinding>()
    for (const [decl, b] of this.reactImports) {
      const open = [
        ...this.referencesTo(decl as ts.Identifier).filter((id) => !b.converted.has(id)),
        ...this.typeRefs.filter((r) => r.decl === decl).map((r) => r.id),
      ].sort((x, y) => x.pos - y.pos)
      if (open.length === 0) continue
      kept.add(b)
      const first = open[0]!
      if (this.manual.some((n) => n.line === this.pos(first).line)) continue
      const typeUse = b.typeOnly || this.typeRefs.some((r) => r.id === first)
      const name =
        b.canonical !== '*'
          ? b.canonical
          : ts.isQualifiedName(first.parent) || ts.isPropertyAccessExpression(first.parent)
            ? this.text(first.parent)
            : b.local
      const reason = typeUse
        ? `\`${name}\` is a React type; there is no automatic Pyreon equivalent.`
        : (UNSUPPORTED_REASONS[name] ??
          (REACT_SPECIFIERS[name]
            ? `This use of \`${name}\` could not be converted.`
            : `\`${name}\` has no automatic Pyreon conversion.`))
      this.note(
        first,
        `${reason} Its React import is kept so the remaining work stays visible.`,
        'rewrite it by hand; the MCP get_api tool documents the Pyreon API',
      )
    }
    // Side-effect imports and declarations with nothing left.
    for (const stmt of this.sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
      if (!(stmt.moduleSpecifier.text in IMPORT_REWRITES)) continue
      const bindings = byDecl.get(stmt) ?? []
      const keep = bindings.filter((b) => kept.has(b))
      if (keep.length === bindings.length && bindings.length > 0) continue
      const start = stmt.getStart(this.sf)
      if (keep.length === 0) {
        this.edit(start, stmt.getEnd(), '', true)
        this.change(stmt, `Removed import from '${stmt.moduleSpecifier.text}'`, 'remove')
        continue
      }
      const clause = stmt.importClause!
      const def = keep.find((b) => b.node === clause)
      const ns = keep.find((b) => b.node !== undefined && ts.isNamespaceImport(b.node))
      const named = keep.flatMap((b) =>
        b.node && ts.isImportSpecifier(b.node) ? [this.text(b.node)] : [],
      )
      const parts = [
        def ? def.local : '',
        ns ? `* as ${ns.local}` : '',
        named.length ? `{ ${named.join(', ')} }` : '',
      ]
        .filter(Boolean)
        .join(', ')
      const typeKw = clause.isTypeOnly ? 'type ' : ''
      this.edit(
        start,
        stmt.getEnd(),
        `import ${typeKw}${parts} from ${this.text(stmt.moduleSpecifier)}`,
        true,
      )
    }

    // Add the Pyreon imports, reusing names a file already imports.
    const existing = new Map<string, Set<string>>()
    for (const stmt of this.sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
      const nb = stmt.importClause?.namedBindings
      if (!nb || !ts.isNamedImports(nb)) continue
      const set = existing.get(stmt.moduleSpecifier.text) ?? new Set()
      for (const el of nb.elements) set.add(el.name.text)
      existing.set(stmt.moduleSpecifier.text, set)
    }
    const lines: string[] = []
    const modules = new Set([...this.needed.keys(), ...this.neededTypes.keys()])
    for (const mod of [...modules].sort()) {
      const have = existing.get(mod) ?? new Set()
      const values = [...(this.needed.get(mod) ?? [])].filter((n) => !have.has(n)).sort()
      const types = [...(this.neededTypes.get(mod) ?? [])]
        .filter((n) => !have.has(n) && !values.includes(n))
        .sort()
      const specs = [...values, ...types.map((t) => `type ${t}`)]
      if (specs.length > 0) lines.push(`import { ${specs.join(', ')} } from "${mod}"`)
    }
    if (lines.length === 0) return
    const imports = this.sf.statements.filter(ts.isImportDeclaration)
    const lastImport = imports[imports.length - 1]
    if (lastImport) {
      this.edit(lastImport.getEnd(), lastImport.getEnd(), `\n${lines.join('\n')}`)
    } else {
      // After any directive prologue ('use client').
      let at = 0
      for (const s of this.sf.statements) {
        if (ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression)) at = s.getEnd()
        else break
      }
      this.edit(at, at, at === 0 ? `${lines.join('\n')}\n\n` : `\n${lines.join('\n')}\n`)
    }
  }

  // ── apply ────────────────────────────────────────────────────────────────────

  private apply(): string {
    return this.applyRange(0, this.code.length)
  }

  /** `code[from, to)` with every registered edit inside it applied. */
  private applyRange(from: number, to: number): string {
    const inRange = this.edits.filter((e) => e.start >= from && e.end <= to)
    const swallowers = inRange.filter((e) => e.swallow && e.end > e.start)
    const swallowed = (e: Edit): boolean =>
      swallowers.some((s) => {
        if (s === e) return false
        if (e.end === e.start) return s.start < e.start && e.start < s.end
        if (!(s.start <= e.start && e.end <= s.end)) return false
        // Identical spans: the later structural edit was built from the earlier one.
        return s.start !== e.start || s.end !== e.end || s.seq > e.seq
      })
    const live = inRange
      .filter((e) => !swallowed(e))
      .sort(
        (a, b) =>
          a.start - b.start ||
          Number(a.end !== a.start) - Number(b.end !== b.start) ||
          a.seq - b.seq,
      )
    let out = ''
    let last = from
    for (const e of live) {
      if (e.start < last) {
        throw new Error(
          `[Pyreon] migrateReactCode: two rewrites overlap at offset ${e.start}. Please report this input at https://github.com/pyreon/pyreon/issues.`,
        )
      }
      out += this.code.slice(last, e.start) + e.text
      last = e.end
    }
    return out + this.code.slice(last, to)
  }

  /**
   * Mark each note's position in the output with a sentinel. The caller
   * resolves the sentinels (after its own whitespace clean-up) to the line and
   * column the user sees in the MIGRATED code, then strips them.
   */
  private markNotes(): void {
    this.noteOffsets.forEach((offset, i) =>
      this.edit(offset, offset, `${NOTE_MARK}${i}${NOTE_MARK}`),
    )
  }

  run(): string {
    this.collectReactImports()
    this.collectReferences()
    this.collectBindings()
    this.analyzeSetupReads()
    this.rewriteReferences()
    this.convertCalls()
    this.convertSetupReads()
    this.convertJsxAndReferences()
    this.rewriteImports()
    this.markNotes()
    return this.apply()
  }
}

function skipParens(e: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(e) ? skipParens(e.expression) : e
}

function isHookName(fn: ts.Node): boolean {
  const name =
    (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name
      ? fn.name.text
      : ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)
        ? fn.parent.name.text
        : ''
  return /^use[A-Z0-9]/.test(name)
}

function isEmptyRefInit(call: ts.CallExpression): boolean {
  const arg = call.arguments[0]
  return (
    !arg ||
    arg.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(arg) && arg.text === 'undefined')
  )
}

export function migrateReactCode(code: string, filename = 'input.tsx'): MigrationResult {
  assertClassicTs()
  const sf = ts.createSourceFile(filename, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const diagnostics = detectReactPatterns(code, filename)
  const migrator = new ReactMigrator(sf, code)
  let out = migrator.run()
  // A removed first-line import must not leave the file starting with a blank line.
  if (!code.startsWith('\n')) out = out.replace(/^\n+/, '')
  out = out.replace(/\n{3,}/g, '\n\n')
  // Resolve note sentinels to positions in the migrated code, then drop them.
  const markRe = new RegExp(`${NOTE_MARK}(\\d+)${NOTE_MARK}`, 'g')
  let clean = ''
  let last = 0
  for (let m = markRe.exec(out); m; m = markRe.exec(out)) {
    clean += out.slice(last, m.index)
    last = m.index + m[0].length
    const lineStart = clean.lastIndexOf('\n') + 1
    const note = migrator.manual[Number(m[1])]!
    note.line = clean.split('\n').length
    note.column = clean.length - lineStart
  }
  clean += out.slice(last)
  migrator.changes.sort((a, b) => a.line - b.line)
  migrator.manual.sort((a, b) => a.line - b.line || a.column - b.column)
  return { code: clean, diagnostics, changes: migrator.changes, manual: migrator.manual }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function findParentJsxElement(
  node: ts.Node,
): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
  let current = node.parent
  while (current) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      return current
    }
    // Don't cross component boundaries
    if (ts.isJsxElement(current)) {
      return current.openingElement
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      return null
    }
    current = current.parent
  }
  return null
}

function getJsxTagName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  const tagName = node.tagName
  if (ts.isIdentifier(tagName)) {
    return tagName.text
  }
  return ''
}

// ═══════════════════════════════════════════════════════════════════════════════
// Quick scan (regex-based, for fast pre-filtering)
// ═══════════════════════════════════════════════════════════════════════════════

/** Fast regex check — returns true if code likely contains React patterns worth analyzing */
export function hasReactPatterns(code: string): boolean {
  return (
    /\bfrom\s+['"]react/.test(code) ||
    /\bfrom\s+['"]react-dom/.test(code) ||
    /\bfrom\s+['"]react-router/.test(code) ||
    /\buseState\s*[<(]/.test(code) ||
    /\buseEffect\s*\(/.test(code) ||
    /\buseMemo\s*\(/.test(code) ||
    /\buseCallback\s*\(/.test(code) ||
    /\buseRef\s*[<(]/.test(code) ||
    /\buseReducer\s*[<(]/.test(code) ||
    /\bReact\.memo\b/.test(code) ||
    /\bforwardRef\s*[<(]/.test(code) ||
    /\bclassName[=\s]/.test(code) ||
    /\bhtmlFor[=\s]/.test(code) ||
    /\.value\s*=/.test(code)
  )
}

// Error-diagnosis catalog moved to the browser-safe `./diagnose` module
// (no `typescript` import) so it can load in the browser. Re-exported here so
// existing `from './react-intercept'` consumers + the package index keep working.
export { diagnoseError, type ErrorDiagnosis } from './diagnose'
