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

/** React specifiers that map to specific Pyreon imports */
const SPECIFIER_REWRITES: Record<string, { name: string; from: string }> = {
  useState: { name: 'signal', from: '@pyreon/reactivity' },
  useEffect: { name: 'effect', from: '@pyreon/reactivity' },
  useLayoutEffect: { name: 'effect', from: '@pyreon/reactivity' },
  useMemo: { name: 'computed', from: '@pyreon/reactivity' },
  useReducer: { name: 'signal', from: '@pyreon/reactivity' },
  useRef: { name: 'signal', from: '@pyreon/reactivity' },
  createContext: { name: 'createContext', from: '@pyreon/core' },
  useContext: { name: 'useContext', from: '@pyreon/core' },
  Fragment: { name: 'Fragment', from: '@pyreon/core' },
  Suspense: { name: 'Suspense', from: '@pyreon/core' },
  lazy: { name: 'lazy', from: '@pyreon/core' },
  memo: { name: '', from: '' }, // removed, not needed
  forwardRef: { name: '', from: '' }, // removed, not needed
  createRoot: { name: 'mount', from: '@pyreon/runtime-dom' },
  hydrateRoot: { name: 'hydrateRoot', from: '@pyreon/runtime-dom' },
  // React Router
  useNavigate: { name: 'useRouter', from: '@pyreon/router' },
  useParams: { name: 'useRoute', from: '@pyreon/router' },
  useLocation: { name: 'useRoute', from: '@pyreon/router' },
  Link: { name: 'RouterLink', from: '@pyreon/router' },
  NavLink: { name: 'RouterLink', from: '@pyreon/router' },
  Outlet: { name: 'RouterView', from: '@pyreon/router' },
  useSearchParams: { name: 'useSearchParams', from: '@pyreon/router' },
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
      'useRef for mutable values. In Pyreon, use signal() — it works the same way but is reactive.',
      detectGetNodeText(ctx, node),
      `signal(${initText})`,
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
    false,
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
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
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

  if (attrName === 'dangerouslySetInnerHTML') {
    detectDiag(
      ctx,
      node,
      'dangerously-set-inner-html',
      'dangerouslySetInnerHTML is React-specific. Use innerHTML prop in Pyreon.',
      detectGetNodeText(ctx, node),
      'innerHTML={htmlString}',
      true,
    )
  }
}

function detectDotValueSignal(ctx: DetectContext, node: ts.PropertyAccessExpression): void {
  const varName = (node.expression as ts.Identifier).text
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

function detectArrayMapJsx(ctx: DetectContext, node: ts.CallExpression): void {
  const parent = node.parent
  if (ts.isJsxExpression(parent)) {
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
  const sf = ts.createSourceFile(filename, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const ctx: DetectContext = {
    sf,
    code,
    diagnostics: [],
    reactImportedHooks: new Set<string>(),
  }

  detectVisit(ctx, sf)
  return ctx.diagnostics
}

// ═══════════════════════════════════════════════════════════════════════════════
// Migration (detection + auto-fix)
// ═══════════════════════════════════════════════════════════════════════════════

type Replacement = { start: number; end: number; text: string }

interface MigrateContext {
  sf: ts.SourceFile
  code: string
  replacements: Replacement[]
  changes: MigrationChange[]
  pyreonImports: Map<string, Set<string>>
  importsToRemove: Set<ts.ImportDeclaration>
  specifierRewrites: Map<ts.ImportSpecifier, { name: string; from: string }>
}

function migrateAddImport(ctx: MigrateContext, source: string, specifier: string): void {
  if (!source || !specifier) return
  let specs = ctx.pyreonImports.get(source)
  if (!specs) {
    specs = new Set()
    ctx.pyreonImports.set(source, specs)
  }
  specs.add(specifier)
}

function migrateReplace(ctx: MigrateContext, node: ts.Node, text: string): void {
  ctx.replacements.push({ start: node.getStart(ctx.sf), end: node.getEnd(), text })
}

function migrateGetNodeText(ctx: MigrateContext, node: ts.Node): string {
  return ctx.code.slice(node.getStart(ctx.sf), node.getEnd())
}

function migrateGetLine(ctx: MigrateContext, node: ts.Node): number {
  return ctx.sf.getLineAndCharacterOfPosition(node.getStart(ctx.sf)).line + 1
}

function migrateImportDeclaration(ctx: MigrateContext, node: ts.ImportDeclaration): void {
  if (!node.moduleSpecifier) return
  const source = (node.moduleSpecifier as ts.StringLiteral).text
  if (!(source in IMPORT_REWRITES)) return

  if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
    for (const spec of node.importClause.namedBindings.elements) {
      const name = spec.name.text
      const rewrite = SPECIFIER_REWRITES[name]
      if (rewrite) {
        if (rewrite.name) {
          migrateAddImport(ctx, rewrite.from, rewrite.name)
        }
        ctx.specifierRewrites.set(spec, rewrite)
      }
    }
  }
  ctx.importsToRemove.add(node)
}

function migrateUseState(ctx: MigrateContext, node: ts.CallExpression): void {
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
    const initArg = node.arguments[0] ? migrateGetNodeText(ctx, node.arguments[0]) : 'undefined'

    const declStart = parent.getStart(ctx.sf)
    const declEnd = parent.getEnd()
    ctx.replacements.push({
      start: declStart,
      end: declEnd,
      text: `${valueName} = signal(${initArg})`,
    })
    migrateAddImport(ctx, '@pyreon/reactivity', 'signal')
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: `useState → signal: ${valueName}`,
    })
  }
}

function migrateUseEffect(ctx: MigrateContext, node: ts.CallExpression): void {
  const depsArg = node.arguments[1]
  const callbackArg = node.arguments[0]
  const hookName = (node.expression as ts.Identifier).text

  if (
    depsArg &&
    ts.isArrayLiteralExpression(depsArg) &&
    depsArg.elements.length === 0 &&
    callbackArg
  ) {
    const callbackText = migrateGetNodeText(ctx, callbackArg)
    migrateReplace(ctx, node, `onMount(${callbackText})`)
    migrateAddImport(ctx, '@pyreon/core', 'onMount')
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: `${hookName}(fn, []) → onMount(fn)`,
    })
  } else if (callbackArg) {
    const callbackText = migrateGetNodeText(ctx, callbackArg)
    migrateReplace(ctx, node, `effect(${callbackText})`)
    migrateAddImport(ctx, '@pyreon/reactivity', 'effect')
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: `${hookName} → effect (auto-tracks deps)`,
    })
  }
}

function migrateUseMemo(ctx: MigrateContext, node: ts.CallExpression): void {
  const computeFn = node.arguments[0]
  if (computeFn) {
    migrateReplace(ctx, node, `computed(${migrateGetNodeText(ctx, computeFn)})`)
    migrateAddImport(ctx, '@pyreon/reactivity', 'computed')
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: 'useMemo → computed (auto-tracks deps)',
    })
  }
}

function migrateUseCallback(ctx: MigrateContext, node: ts.CallExpression): void {
  const callbackFn = node.arguments[0]
  if (callbackFn) {
    migrateReplace(ctx, node, migrateGetNodeText(ctx, callbackFn))
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: 'useCallback → plain function (not needed in Pyreon)',
    })
  }
}

function migrateUseRef(ctx: MigrateContext, node: ts.CallExpression): void {
  const arg = node.arguments[0]
  const isNullInit =
    arg &&
    (arg.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(arg) && arg.text === 'undefined'))

  if (isNullInit || !arg) {
    migrateReplace(ctx, node, 'createRef()')
    migrateAddImport(ctx, '@pyreon/core', 'createRef')
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: 'useRef(null) → createRef()',
    })
  } else {
    migrateReplace(ctx, node, `signal(${migrateGetNodeText(ctx, arg)})`)
    migrateAddImport(ctx, '@pyreon/reactivity', 'signal')
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: 'useRef(value) → signal(value)',
    })
  }
}

function migrateMemoWrapper(ctx: MigrateContext, node: ts.CallExpression): void {
  const callee = node.expression
  const isMemo =
    (ts.isIdentifier(callee) && callee.text === 'memo') || isCallToReactDot(callee, 'memo')

  if (isMemo && node.arguments[0]) {
    migrateReplace(ctx, node, migrateGetNodeText(ctx, node.arguments[0]))
    ctx.changes.push({
      type: 'remove',
      line: migrateGetLine(ctx, node),
      description: 'Removed memo() wrapper (not needed in Pyreon)',
    })
  }
}

function migrateForwardRef(ctx: MigrateContext, node: ts.CallExpression): void {
  const callee = node.expression
  const isForwardRef =
    (ts.isIdentifier(callee) && callee.text === 'forwardRef') ||
    isCallToReactDot(callee, 'forwardRef')

  if (isForwardRef && node.arguments[0]) {
    migrateReplace(ctx, node, migrateGetNodeText(ctx, node.arguments[0]))
    ctx.changes.push({
      type: 'remove',
      line: migrateGetLine(ctx, node),
      description: 'Removed forwardRef wrapper (pass ref as normal prop in Pyreon)',
    })
  }
}

function migrateJsxAttributes(ctx: MigrateContext, node: ts.JsxAttribute): void {
  const attrName = (node.name as ts.Identifier).text

  if (attrName in JSX_ATTR_REWRITES) {
    const htmlAttr = JSX_ATTR_REWRITES[attrName] as string
    ctx.replacements.push({
      start: node.name.getStart(ctx.sf),
      end: node.name.getEnd(),
      text: htmlAttr,
    })
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: `${attrName} → ${htmlAttr}`,
    })
  }

  if (attrName === 'onChange') {
    const jsxElement = findParentJsxElement(node)
    if (jsxElement) {
      const tagName = getJsxTagName(jsxElement)
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        ctx.replacements.push({
          start: node.name.getStart(ctx.sf),
          end: node.name.getEnd(),
          text: 'onInput',
        })
        ctx.changes.push({
          type: 'replace',
          line: migrateGetLine(ctx, node),
          description: `onChange on <${tagName}> → onInput (native DOM events)`,
        })
      }
    }
  }

  if (attrName === 'dangerouslySetInnerHTML') {
    migrateDangerouslySetInnerHTML(ctx, node)
  }
}

function migrateDangerouslySetInnerHTML(ctx: MigrateContext, node: ts.JsxAttribute): void {
  if (!node.initializer || !ts.isJsxExpression(node.initializer) || !node.initializer.expression) {
    return
  }
  const expr = node.initializer.expression
  if (!ts.isObjectLiteralExpression(expr)) return

  const htmlProp = expr.properties.find(
    (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === '__html',
  ) as ts.PropertyAssignment | undefined

  if (htmlProp) {
    const valueText = migrateGetNodeText(ctx, htmlProp.initializer)
    migrateReplace(ctx, node, `innerHTML={${valueText}}`)
    ctx.changes.push({
      type: 'replace',
      line: migrateGetLine(ctx, node),
      description: 'dangerouslySetInnerHTML → innerHTML',
    })
  }
}

function applyReplacements(code: string, ctx: MigrateContext): string {
  // Remove React import declarations
  for (const imp of ctx.importsToRemove) {
    ctx.replacements.push({ start: imp.getStart(ctx.sf), end: imp.getEnd(), text: '' })
    ctx.changes.push({
      type: 'remove',
      line: ctx.sf.getLineAndCharacterOfPosition(imp.getStart(ctx.sf)).line + 1,
      description: 'Removed React import',
    })
  }

  // Sort descending for dedup (outermost replacements win over inner overlapping ones)
  ctx.replacements.sort((a, b) => b.start - a.start)

  // Deduplicate overlapping replacements (keep the outermost / first added)
  const applied = new Set<string>()
  const deduped: Replacement[] = []
  for (const r of ctx.replacements) {
    const key = `${r.start}:${r.end}`
    let overlaps = false
    for (const d of deduped) {
      if (r.start < d.end && r.end > d.start) {
        overlaps = true
        break
      }
    }
    if (!overlaps && !applied.has(key)) {
      applied.add(key)
      deduped.push(r)
    }
  }

  // Re-sort ascending for string builder — O(n) single join
  deduped.sort((a, b) => a.start - b.start)
  const parts: string[] = []
  let lastPos = 0
  for (const r of deduped) {
    parts.push(code.slice(lastPos, r.start))
    parts.push(r.text)
    lastPos = r.end
  }
  parts.push(code.slice(lastPos))
  return parts.join('')
}

function insertPyreonImports(code: string, pyreonImports: Map<string, Set<string>>): string {
  if (pyreonImports.size === 0) return code

  const importLines: string[] = []
  const sorted = [...pyreonImports.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [source, specs] of sorted) {
    const specList = [...specs].sort().join(', ')
    importLines.push(`import { ${specList} } from "${source}"`)
  }
  const importBlock = importLines.join('\n')

  const lastImportEnd = findLastImportEnd(code)
  if (lastImportEnd > 0) {
    return `${code.slice(0, lastImportEnd)}\n${importBlock}${code.slice(lastImportEnd)}`
  }
  return `${importBlock}\n\n${code}`
}

function migrateVisitNode(ctx: MigrateContext, node: ts.Node): void {
  if (ts.isImportDeclaration(node)) migrateImportDeclaration(ctx, node)
  if (isCallToHook(node, 'useState')) migrateUseState(ctx, node)
  if (isCallToEffectHook(node)) migrateUseEffect(ctx, node)
  if (isCallToHook(node, 'useMemo')) migrateUseMemo(ctx, node)
  if (isCallToHook(node, 'useCallback')) migrateUseCallback(ctx, node)
  if (isCallToHook(node, 'useRef')) migrateUseRef(ctx, node)
  if (ts.isCallExpression(node)) migrateMemoWrapper(ctx, node)
  if (ts.isCallExpression(node)) migrateForwardRef(ctx, node)
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) migrateJsxAttributes(ctx, node)
}

function migrateVisit(ctx: MigrateContext, node: ts.Node): void {
  ts.forEachChild(node, (child) => {
    migrateVisitNode(ctx, child)
    migrateVisit(ctx, child)
  })
}

export function migrateReactCode(code: string, filename = 'input.tsx'): MigrationResult {
  const sf = ts.createSourceFile(filename, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const diagnostics = detectReactPatterns(code, filename)

  const ctx: MigrateContext = {
    sf,
    code,
    replacements: [],
    changes: [],
    pyreonImports: new Map(),
    importsToRemove: new Set(),
    specifierRewrites: new Map(),
  }

  migrateVisit(ctx, sf)

  let result = applyReplacements(code, ctx)
  result = insertPyreonImports(result, ctx.pyreonImports)

  // Clean up empty lines from removed imports
  result = result.replace(/\n{3,}/g, '\n\n')

  return { code: result, diagnostics, changes: ctx.changes }
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

function findLastImportEnd(code: string): number {
  const importRe = /^import\s.+$/gm
  let lastEnd = 0
  let match: RegExpExecArray | null
  while (true) {
    match = importRe.exec(code)
    if (!match) break
    lastEnd = match.index + match[0].length
  }
  return lastEnd
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

// ═══════════════════════════════════════════════════════════════════════════════
// Error pattern database (for MCP diagnose tool)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ErrorDiagnosis {
  cause: string
  fix: string
  fixCode?: string | undefined
  related?: string | undefined
}

interface ErrorPattern {
  pattern: RegExp
  diagnose: (match: RegExpMatchArray) => ErrorDiagnosis
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /Cannot read properties of undefined \(reading '(set|update|peek|subscribe)'\)/,
    diagnose: (m) => ({
      cause: `Calling .${m[1]}() on undefined. The signal variable is likely out of scope, misspelled, or not yet initialized.`,
      fix: 'Check that the signal is defined and in scope. Signals must be created with signal() before use.',
      fixCode: `const mySignal = signal(initialValue)\nmySignal.${m[1]}(newValue)`,
    }),
  },
  {
    pattern: /(\w+) is not a function/,
    diagnose: (m) => ({
      cause: `'${m[1]}' is not callable. If this is a signal, you need to call it: ${m[1]}()`,
      fix: 'Pyreon signals are callable functions. Read: signal(), Write: signal.set(value)',
      fixCode: `// Read value:\nconst value = ${m[1]}()\n// Set value:\n${m[1]}.set(newValue)`,
    }),
  },
  {
    pattern: /Cannot find module '(@pyreon\/\w[\w-]*)'/,
    diagnose: (m) => ({
      cause: `Package ${m[1]} is not installed.`,
      fix: `Run: bun add ${m[1]}`,
      fixCode: `bun add ${m[1]}`,
    }),
  },
  {
    pattern: /Cannot find module 'react'/,
    diagnose: () => ({
      cause: "Importing from 'react' in a Pyreon project.",
      fix: 'Replace React imports with Pyreon equivalents.',
      fixCode:
        '// Instead of:\nimport { useState } from "react"\n// Use:\nimport { signal } from "@pyreon/reactivity"',
    }),
  },
  {
    pattern: /Property '(\w+)' does not exist on type 'Signal<\w+>'/,
    diagnose: (m) => ({
      cause: `Accessing .${m[1]} on a signal. Pyreon signals don't have a .${m[1]} property.`,
      fix:
        m[1] === 'value'
          ? 'Pyreon signals are callable functions, not .value getters. Call signal() to read, signal.set() to write.'
          : `Signals have these methods: .set(), .update(), .peek(), .subscribe(). '${m[1]}' is not one of them.`,
      fixCode:
        m[1] === 'value' ? '// Read: mySignal()\n// Write: mySignal.set(newValue)' : undefined,
    }),
  },
  {
    pattern: /Type '(\w+)' is not assignable to type 'VNode'/,
    diagnose: (m) => ({
      cause: `Component returned ${m[1]} instead of VNode. Components must return JSX, null, or a string.`,
      fix: 'Make sure your component returns a JSX element, null, or a string.',
      fixCode: 'const MyComponent = (props) => {\n  return <div>{props.children}</div>\n}',
    }),
  },
  {
    pattern: /onMount callback must return/,
    diagnose: () => ({
      cause: 'onMount expects a callback that optionally returns a CleanupFn.',
      fix: 'Return a cleanup function, or return nothing.',
      fixCode: 'onMount(() => {\n  // setup code\n})',
    }),
  },
  {
    pattern: /Expected 'by' prop on <For>/,
    diagnose: () => ({
      cause: "<For> requires a 'by' prop for efficient keyed reconciliation.",
      fix: 'Add a by prop that returns a unique key for each item.',
      fixCode:
        '<For each={items()} by={item => item.id}>\n  {item => <li>{item.name}</li>}\n</For>',
    }),
  },
  {
    pattern: /useHook.*outside.*component/i,
    diagnose: () => ({
      cause:
        'Hook called outside a component function. Pyreon hooks must be called during component setup.',
      fix: 'Move the hook call inside a component function body.',
    }),
  },
  {
    pattern: /Hydration mismatch/,
    diagnose: () => ({
      cause: "Server-rendered HTML doesn't match client-rendered output.",
      fix: 'Ensure SSR and client render the same initial content. Check for browser-only APIs (window, document) in SSR code.',
      related: "Use typeof window !== 'undefined' checks or onMount() for client-only code.",
    }),
  },
]

/** Diagnose an error message and return structured fix information */
export function diagnoseError(error: string): ErrorDiagnosis | null {
  for (const { pattern, diagnose } of ERROR_PATTERNS) {
    const match = error.match(pattern)
    if (match) {
      return diagnose(match)
    }
  }
  return null
}
