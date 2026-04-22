/**
 * JSX transform — wraps dynamic JSX expressions in `() =>` so the Pyreon runtime
 * receives reactive getters instead of eagerly-evaluated snapshot values.
 *
 * Rules:
 *  - `<div>{expr}</div>`          → `<div>{() => expr}</div>`   (child)
 *  - `<div class={expr}>`         → `<div class={() => expr}>`  (prop)
 *  - `<button onClick={fn}>`      → unchanged                   (event handler)
 *  - `<div>{() => expr}</div>`    → unchanged                   (already wrapped)
 *  - `<div>{"literal"}</div>`     → unchanged                   (static)
 *
 * Static VNode hoisting:
 *  - Fully static JSX in expression containers is hoisted to module scope:
 *    `{<span>Hello</span>}` → `const _$h0 = <span>Hello</span>` + `{_$h0}`
 *  - Hoisted nodes are created ONCE at module initialisation, not per-instance.
 *  - A JSX node is static if: all props are string literals / booleans / static
 *    values, and all children are text nodes or other static JSX nodes.
 *
 * Template emission:
 *  - JSX element trees with ≥ 1 DOM elements (no components, no spread attrs on
 *    inner elements) are compiled to `_tpl(html, bindFn)` calls instead of nested
 *    `h()` calls.
 *  - The HTML string is parsed once via <template>.innerHTML, then cloneNode(true)
 *    for each instance (~5-10x faster than sequential createElement calls).
 *  - Static attributes are baked into the HTML string; dynamic attributes and
 *    text content use renderEffect in the bind function.
 *
 * Implementation: Rust native binary (napi-rs) when available, JS fallback via oxc-parser.
 */

import { parseSync } from 'oxc-parser'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ─── Native binary auto-detection ────────────────────────────────────────────
// Try to load the Rust napi-rs binary for 3.7-8.2x faster transforms.
// Falls back to the JS implementation below if the binary isn't available
// (wrong platform, CI environment, WASM runtime like StackBlitz, etc.)
//
// Uses createRequire for ESM compatibility — __dirname and require() don't
// exist in ESM modules.
type NativeTransformFn = (code: string, filename: string, ssr: boolean) => TransformResult
let nativeTransformJsx: NativeTransformFn | null = null

try {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  const nativeRequire = createRequire(import.meta.url)
  const nativePath = join(__dirname, '..', 'native', 'pyreon-compiler.node')
  const native = nativeRequire(nativePath) as { transformJsx: NativeTransformFn }
  nativeTransformJsx = native.transformJsx
} catch {
  // Native binary not available — JS fallback will be used
}

export interface CompilerWarning {
  /** Warning message */
  message: string
  /** Source file line number (1-based) */
  line: number
  /** Source file column number (0-based) */
  column: number
  /** Warning code for filtering */
  code:
    | 'signal-call-in-jsx'
    | 'missing-key-on-for'
    | 'signal-in-static-prop'
    | 'circular-prop-derived'
}

export interface TransformResult {
  /** Transformed source code (JSX preserved, only expression containers modified) */
  code: string
  /** Whether the output uses _tpl/_re template helpers (needs auto-import) */
  usesTemplates?: boolean
  /** Compiler warnings for common mistakes */
  warnings: CompilerWarning[]
}

// Props that should never be wrapped in a reactive getter
const SKIP_PROPS = new Set(['key', 'ref'])
// Event handler pattern: onClick, onInput, onMouseEnter, …
const EVENT_RE = /^on[A-Z]/
// Events delegated to the container — must match runtime DELEGATED_EVENTS set
const DELEGATED_EVENTS = new Set([
  'click', 'dblclick', 'contextmenu', 'focusin', 'focusout', 'input',
  'change', 'keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove',
  'mouseover', 'mouseout', 'pointerdown', 'pointerup', 'pointermove',
  'pointerover', 'pointerout', 'touchstart', 'touchend', 'touchmove',
  'submit',
])

export interface TransformOptions {
  /**
   * Compile for server-side rendering. When true, the compiler skips the
   * `_tpl()` template optimization and falls back to plain `h()` calls so
   * `@pyreon/runtime-server` can walk the VNode tree. Default: false.
   */
  ssr?: boolean

  /**
   * Known signal variable names from resolved imports.
   * The Vite plugin maintains a cross-module signal export registry and
   * passes imported signal names here so the compiler can auto-call them
   * in JSX even though the `signal()` declaration is in another file.
   *
   * @example
   * // store.ts: export const count = signal(0)
   * // component.tsx: import { count } from './store'
   * transformJSX(code, 'component.tsx', { knownSignals: ['count'] })
   * // {count} in JSX → {() => count()}
   */
  knownSignals?: string[]
}

// ─── oxc ESTree helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any // ESTree node — untyped for speed, matches the lint package approach

function getLang(filename: string): 'tsx' | 'jsx' {
  if (filename.endsWith('.jsx')) return 'jsx'
  // Default to tsx so JSX is always parsed — matches the original TypeScript
  // parser behavior which forced ScriptKind.TSX for all files.
  return 'tsx'
}

/** Binary search for line/column from byte offset. */
function makeLineIndex(code: string): (offset: number) => { line: number; column: number } {
  const lineStarts = [0]
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') lineStarts.push(i + 1)
  }
  return (offset: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (lineStarts[mid]! <= offset) lo = mid + 1
      else hi = mid - 1
    }
    return { line: lo, column: offset - lineStarts[lo - 1]! }
  }
}

/** Iterate all direct children of an ESTree node via known property keys. */
function forEachChild(node: N, cb: (child: N) => void): void {
  if (!node || typeof node !== 'object') return
  const keys = Object.keys(node)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    // Skip metadata fields for speed
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
    const val = node[key]
    if (Array.isArray(val)) {
      for (let j = 0; j < val.length; j++) {
        const item = val[j]
        if (item && typeof item === 'object' && item.type) cb(item)
      }
    } else if (val && typeof val === 'object' && val.type) {
      cb(val)
    }
  }
}

// ─── JSX element helpers ────────────────────────────────────────────────────

function jsxTagName(node: N): string {
  const opening = node.openingElement
  if (!opening) return ''
  const name = opening.name
  return name?.type === 'JSXIdentifier' ? name.name : ''
}

function isSelfClosing(node: N): boolean {
  return node.type === 'JSXElement' && node.openingElement?.selfClosing === true
}

function jsxAttrs(node: N): N[] {
  return node.openingElement?.attributes ?? []
}

function jsxChildren(node: N): N[] {
  return node.children ?? []
}

// ─── Main transform ─────────────────────────────────────────────────────────

export function transformJSX(
  code: string,
  filename = 'input.tsx',
  options: TransformOptions = {},
): TransformResult {
  // Try Rust native binary first (3.7-8.2x faster).
  // Per-call try/catch: if the native binary panics on an edge case
  // (bad UTF-8, unexpected AST shape), fall back gracefully instead
  // of crashing the Vite dev server.
  if (nativeTransformJsx) {
    try {
      return nativeTransformJsx(code, filename, options.ssr === true)
    } catch {
      // Native transform failed — fall through to JS implementation
    }
  }
  return transformJSX_JS(code, filename, options)
}

/** JS fallback implementation — used when the native binary isn't available. */
export function transformJSX_JS(
  code: string,
  filename = 'input.tsx',
  options: TransformOptions = {},
): TransformResult {
  const ssr = options.ssr === true

  let program: N
  try {
    const result = parseSync(filename, code, {
      sourceType: 'module',
      lang: getLang(filename),
    })
    program = result.program
  } catch {
    return { code, warnings: [] }
  }

  const locate = makeLineIndex(code)

  type Replacement = { start: number; end: number; text: string }
  const replacements: Replacement[] = []
  const warnings: CompilerWarning[] = []

  function warn(node: N, message: string, warnCode: CompilerWarning['code']): void {
    const { line, column } = locate(node.start as number)
    warnings.push({ message, line, column, code: warnCode })
  }

  // ── Parent + children maps (built once, eliminates repeated Object.keys) ──
  const parentMap = new WeakMap<object, N>()
  const childrenMap = new WeakMap<object, N[]>()

  /** Build parent pointers + cached children arrays for the entire AST. */
  function buildMaps(node: N): void {
    const kids: N[] = []
    const keys = Object.keys(node)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
      const val = node[key]
      if (Array.isArray(val)) {
        for (let j = 0; j < val.length; j++) {
          const item = val[j]
          if (item && typeof item === 'object' && item.type) kids.push(item)
        }
      } else if (val && typeof val === 'object' && val.type) {
        kids.push(val)
      }
    }
    childrenMap.set(node, kids)
    for (let i = 0; i < kids.length; i++) {
      parentMap.set(kids[i]!, node)
      buildMaps(kids[i]!)
    }
  }
  buildMaps(program)

  function findParent(node: N): N | undefined {
    return parentMap.get(node)
  }

  /** Fast child iteration using pre-computed children array. */
  function forEachChildFast(node: N, cb: (child: N) => void): void {
    const kids = childrenMap.get(node)
    if (!kids) return
    for (let i = 0; i < kids.length; i++) cb(kids[i]!)
  }

  // ── Static hoisting state ─────────────────────────────────────────────────
  type Hoist = { name: string; text: string }
  const hoists: Hoist[] = []
  let hoistIdx = 0
  let needsTplImport = false
  let needsRpImport = false
  let needsBindTextImportGlobal = false
  let needsBindDirectImportGlobal = false
  let needsBindImportGlobal = false
  let needsApplyPropsImportGlobal = false
  let needsMountSlotImportGlobal = false

  function maybeHoist(node: N): string | null {
    if (
      (node.type === 'JSXElement' || node.type === 'JSXFragment') &&
      isStaticJSXNode(node)
    ) {
      const name = `_$h${hoistIdx++}`
      const text = code.slice(node.start as number, node.end as number)
      hoists.push({ name, text })
      return name
    }
    return null
  }

  function wrap(expr: N): void {
    const start = expr.start as number
    const end = expr.end as number
    const sliced = sliceExpr(expr)
    const text = expr.type === 'ObjectExpression'
      ? `() => (${sliced})`
      : `() => ${sliced}`
    replacements.push({ start, end, text })
  }

  function hoistOrWrap(expr: N): void {
    const hoistName = maybeHoist(expr)
    if (hoistName) {
      replacements.push({ start: expr.start as number, end: expr.end as number, text: hoistName })
    } else if (shouldWrap(expr)) {
      wrap(expr)
    }
  }

  // ── Template emit ─────────────────────────────────────────────────────────

  function tryTemplateEmit(node: N): boolean {
    if (ssr) return false
    if (isSelfClosing(node)) return false
    const elemCount = templateElementCount(node, true)
    if (elemCount < 1) return false
    const tplCall = buildTemplateCall(node)
    if (!tplCall) return false
    const start = node.start as number
    const end = node.end as number
    const parent = findParent(node)
    const needsBraces = parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')
    replacements.push({ start, end, text: needsBraces ? `{${tplCall}}` : tplCall })
    needsTplImport = true
    return true
  }

  function checkForWarnings(node: N): void {
    const tagName = jsxTagName(node)
    if (tagName !== 'For') return
    const hasBy = jsxAttrs(node).some(
      (p: N) => p.type === 'JSXAttribute' && p.name?.type === 'JSXIdentifier' && p.name.name === 'by',
    )
    if (!hasBy) {
      warn(
        node.openingElement?.name ?? node,
        `<For> without a "by" prop will use index-based diffing, which is slower and may cause bugs with stateful children. Add by={(item) => item.id} for efficient keyed reconciliation.`,
        'missing-key-on-for',
      )
    }
  }

  function handleJsxAttribute(node: N, parentElement: N): void {
    const name = node.name?.type === 'JSXIdentifier' ? node.name.name : ''
    if (SKIP_PROPS.has(name) || EVENT_RE.test(name)) return
    if (!node.value || node.value.type !== 'JSXExpressionContainer') return
    const expr = node.value.expression
    if (!expr || expr.type === 'JSXEmptyExpression') return

    const tagName = jsxTagName(parentElement)
    const isComponent = tagName.length > 0 && tagName.charAt(0) !== tagName.charAt(0).toLowerCase()

    if (isComponent) {
      const isSingleJsx = expr.type === 'JSXElement' || expr.type === 'JSXFragment'
      if (isSingleJsx) {
        walkNode(expr)
        return
      }
      const hoistName = maybeHoist(expr)
      if (hoistName) {
        replacements.push({ start: expr.start as number, end: expr.end as number, text: hoistName })
      } else if (shouldWrap(expr)) {
        const start = expr.start as number
        const end = expr.end as number
        const sliced = sliceExpr(expr)
        const inner = expr.type === 'ObjectExpression' ? `(${sliced})` : sliced
        replacements.push({ start, end, text: `_rp(() => ${inner})` })
        needsRpImport = true
      }
    } else {
      hoistOrWrap(expr)
    }
  }

  function handleJsxExpression(node: N): void {
    const expr = node.expression
    if (!expr || expr.type === 'JSXEmptyExpression') return
    const hoistName = maybeHoist(expr)
    if (hoistName) {
      replacements.push({ start: expr.start as number, end: expr.end as number, text: hoistName })
      return
    }
    if (shouldWrap(expr)) {
      wrap(expr)
      return
    }
    walkNode(expr)
  }

  // ── Prop-derived variable tracking (collected during the single walk) ─────
  const propsNames = new Set<string>()
  const propDerivedVars = new Map<string, { start: number; end: number }>()

  // ── Signal variable tracking (for auto-call in JSX) ──────────────────────
  // Tracks `const x = signal(...)` declarations. In JSX expressions, bare
  // references to these identifiers are auto-called: `{x}` → `{x()}`.
  // This makes signals look like plain JS variables in templates while
  // maintaining fine-grained reactivity.
  const signalVars = new Set<string>(options.knownSignals)

  // ── Scope-aware signal shadowing ──────────────────────────────────────────
  // When a function/block declares a variable with the same name as a signal
  // (e.g. `const show = 'text'` shadowing module-scope `const show = signal(false)`),
  // that name is NOT a signal within that scope. The shadowedSignals set tracks
  // names that are currently shadowed by a closer non-signal declaration.
  const shadowedSignals = new Set<string>()

  /** Check if an identifier name is an active (non-shadowed) signal variable. */
  function isActiveSignal(name: string): boolean {
    return signalVars.has(name) && !shadowedSignals.has(name)
  }

  /** Find variable declarations and parameters in a function that shadow signal names. */
  function findShadowingNames(node: N): string[] {
    const shadows: string[] = []
    // Check function parameters
    for (const param of node.params ?? []) {
      if (param.type === 'Identifier' && signalVars.has(param.name)) {
        shadows.push(param.name)
      }
      // Handle destructured parameters: ({ name }) => ...
      if (param.type === 'ObjectPattern') {
        for (const prop of param.properties ?? []) {
          const val = prop.value ?? prop.key
          if (val?.type === 'Identifier' && signalVars.has(val.name)) {
            shadows.push(val.name)
          }
        }
      }
      // Handle array destructured parameters: ([a, b]) => ...
      if (param.type === 'ArrayPattern') {
        for (const el of param.elements ?? []) {
          if (el?.type === 'Identifier' && signalVars.has(el.name)) {
            shadows.push(el.name)
          }
        }
      }
    }
    // Check top-level variable declarations in the function body
    const body = node.body
    const stmts = body?.body ?? body?.statements
    if (!Array.isArray(stmts)) return shadows
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations ?? []) {
          if (decl.id?.type === 'Identifier' && signalVars.has(decl.id.name)) {
            // Only shadow if it's NOT a signal() call
            if (!decl.init || !isSignalCall(decl.init)) {
              shadows.push(decl.id.name)
            }
          }
        }
      }
    }
    return shadows
  }

  function readsFromProps(node: N): boolean {
    if (node.type === 'MemberExpression' && node.object?.type === 'Identifier') {
      if (propsNames.has(node.object.name)) return true
    }
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (readsFromProps(child)) found = true
    })
    return found
  }

  /** Check if an expression references any prop-derived variable. */
  function referencesPropDerived(node: N): boolean {
    if (node.type === 'Identifier' && propDerivedVars.has(node.name)) {
      const p = findParent(node)
      if (p && p.type === 'MemberExpression' && p.property === node && !p.computed) return false
      return true
    }
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (referencesPropDerived(child)) found = true
    })
    return found
  }

  /** Collect prop-derived variable info from a VariableDeclaration node.
   *  Called inline during the single-pass walk when we encounter a declaration. */
  function collectPropDerivedFromDecl(node: N, callbackDepth: number): void {
    if (node.type !== 'VariableDeclaration') return
    for (const decl of node.declarations ?? []) {
      // splitProps: const [own, rest] = splitProps(props, [...])
      if (decl.id?.type === 'ArrayPattern' && decl.init?.type === 'CallExpression') {
        const callee = decl.init.callee
        if (callee?.type === 'Identifier' && callee.name === 'splitProps') {
          for (const el of decl.id.elements ?? []) {
            if (el?.type === 'Identifier') propsNames.add(el.name)
          }
        }
      }
      if (node.kind !== 'const') continue
      if (callbackDepth > 0) continue
      if (decl.id?.type === 'Identifier' && decl.init) {
        if (isStatefulCall(decl.init)) {
          // Track signal() declarations for auto-call in JSX
          if (isSignalCall(decl.init)) signalVars.add(decl.id.name)
          continue
        }
        // Direct prop read OR transitive (references another prop-derived var)
        if (readsFromProps(decl.init) || referencesPropDerived(decl.init)) {
          propDerivedVars.set(decl.id.name, { start: decl.init.start as number, end: decl.init.end as number })
        }
      }
    }
  }

  /** Detect component functions and register their first param as a props name.
   *  Called inline during the walk when entering a function. */
  function maybeRegisterComponentProps(node: N): void {
    if (
      (node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') &&
      (node.params?.length ?? 0) > 0
    ) {
      const parent = findParent(node)
      // Skip callback functions (arguments to calls like .map, .filter)
      if (parent && parent.type === 'CallExpression' && (parent.arguments ?? []).includes(node)) return
      const firstParam = node.params[0]
      if (firstParam?.type === 'Identifier') {
        let hasJSX = false
        function checkJSX(n: N): void {
          if (hasJSX) return
          if (n.type === 'JSXElement' || n.type === 'JSXFragment') { hasJSX = true; return }
          forEachChildFast(n, checkJSX)
        }
        forEachChildFast(node, checkJSX)
        if (hasJSX) propsNames.add(firstParam.name)
      }
    }
  }

  // ── String-based transitive resolution ─────────────────────────────────────
  const resolvedCache = new Map<string, string>()
  const resolving = new Set<string>()
  const warnedCycles = new Set<string>()

  function resolveVarToString(varName: string, sourceNode?: N): string {
    if (resolvedCache.has(varName)) return resolvedCache.get(varName)!
    if (resolving.has(varName)) {
      const cycleKey = [...resolving, varName].sort().join(',')
      if (!warnedCycles.has(cycleKey)) {
        warnedCycles.add(cycleKey)
        const chain = [...resolving, varName].join(' → ')
        warn(
          sourceNode ?? program,
          `[Pyreon] Circular prop-derived const reference: ${chain}. ` +
            `The cyclic identifier \`${varName}\` will use its captured value ` +
            `instead of being reactively inlined. Break the cycle by reading ` +
            `from \`props.*\` directly or restructuring the derivation chain.`,
          'circular-prop-derived',
        )
      }
      return varName
    }
    resolving.add(varName)
    const span = propDerivedVars.get(varName)!
    const rawText = code.slice(span.start, span.end)
    const resolved = resolveIdentifiersInText(rawText, span.start, sourceNode)
    resolving.delete(varName)
    resolvedCache.set(varName, resolved)
    return resolved
  }

  function resolveIdentifiersInText(text: string, baseOffset: number, sourceNode?: N): string {
    const endOffset = baseOffset + text.length
    const idents: { start: number; end: number; name: string }[] = []

    // Walk the AST to find identifiers in the span, passing parent context
    // to skip non-reference positions (property names, declarations, etc.)
    function findIdents(node: N, parent: N | null): void {
      const nodeStart = node.start as number
      const nodeEnd = node.end as number
      if (nodeStart >= endOffset || nodeEnd <= baseOffset) return
      if (node.type === 'Identifier' && propDerivedVars.has(node.name)) {
        if (parent) {
          if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) { /* skip */ }
          else if (parent.type === 'VariableDeclarator' && parent.id === node) { /* skip */ }
          else if (parent.type === 'Property' && parent.key === node && !parent.computed) { /* skip */ }
          else if (parent.type === 'Property' && parent.shorthand) { /* skip */ }
          else if (nodeStart >= baseOffset && nodeEnd <= endOffset) {
            idents.push({ start: nodeStart, end: nodeEnd, name: node.name })
          }
        } else if (nodeStart >= baseOffset && nodeEnd <= endOffset) {
          idents.push({ start: nodeStart, end: nodeEnd, name: node.name })
        }
      }
      forEachChildFast(node, (child) => findIdents(child, node))
    }
    findIdents(program, null)

    if (idents.length === 0) return text

    idents.sort((a, b) => a.start - b.start)
    const parts: string[] = []
    let lastPos = baseOffset
    for (const id of idents) {
      parts.push(code.slice(lastPos, id.start))
      parts.push(`(${resolveVarToString(id.name, sourceNode)})`)
      lastPos = id.end
    }
    parts.push(code.slice(lastPos, endOffset))
    return parts.join('')
  }

  // ── Analysis helpers with memoization (Phase 3) ────────────────────────────
  // Cache results keyed by node.start (unique per node in a file).
  // Eliminates redundant subtree traversals for containsCall + accessesProps.
  const _isDynamicCache = new Map<number, boolean>()

  /** Fused isDynamic: checks both containsCall and accessesProps in one traversal. */
  function isDynamic(node: N): boolean {
    const key = node.start as number
    const cached = _isDynamicCache.get(key)
    if (cached !== undefined) return cached
    const result = _isDynamicImpl(node)
    _isDynamicCache.set(key, result)
    return result
  }

  function _isDynamicImpl(node: N): boolean {
    // Call expression (non-pure)
    if (node.type === 'CallExpression') {
      if (!isPureStaticCall(node)) return true
    }
    if (node.type === 'TaggedTemplateExpression') return true
    // Props access
    if (node.type === 'MemberExpression' && !node.computed && node.object?.type === 'Identifier') {
      if (propsNames.has(node.object.name)) return true
    }
    // Prop-derived variable reference
    if (node.type === 'Identifier' && propDerivedVars.has(node.name)) {
      const parent = findParent(node)
      if (parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
        // This is a property name position, not a reference — fall through
      } else {
        return true
      }
    }
    // Signal variable reference — treated as dynamic (will be auto-called)
    if (node.type === 'Identifier' && isActiveSignal(node.name)) {
      const parent = findParent(node)
      if (parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
        // Property name position — not a reference
      } else if (parent && parent.type === 'CallExpression' && parent.callee === node) {
        // Already being called: signal() — don't double-flag
      } else {
        return true
      }
    }
    // Don't recurse into nested functions
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return false
    // Recurse into children
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (isDynamic(child)) found = true
    })
    return found
  }

  /** accessesProps — kept for sliceExpr's quick check (does this need resolution?) */
  function accessesProps(node: N): boolean {
    if (node.type === 'MemberExpression' && !node.computed && node.object?.type === 'Identifier') {
      if (propsNames.has(node.object.name)) return true
    }
    if (node.type === 'Identifier' && propDerivedVars.has(node.name)) {
      const parent = findParent(node)
      if (parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return false
      return true
    }
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (child.type === 'ArrowFunctionExpression' || child.type === 'FunctionExpression') return
      if (accessesProps(child)) found = true
    })
    return found
  }

  function shouldWrap(node: N): boolean {
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return false
    if (isStatic(node)) return false
    if (node.type === 'CallExpression' && isPureStaticCall(node)) return false
    return isDynamic(node)
  }

  // ── Single unified walk (Phase 2) ─────────────────────────────────────────
  // Merges the old 3-pass architecture (scanForPropDerivedVars + transitive
  // resolution + JSX walk) into one top-down traversal. Works because `const`
  // declarations have a temporal dead zone — they're always before their use.
  let _callbackDepth = 0

  function walkNode(node: N): void {
    // ── Component function detection (was pass 1) ──
    const isFunction = node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression'
    let scopeShadows: string[] | null = null
    if (isFunction) {
      // Track callback nesting for prop-derived var exclusion
      const parent = findParent(node)
      const isCallbackArg = parent && parent.type === 'CallExpression' && (parent.arguments ?? []).includes(node)
      if (isCallbackArg) _callbackDepth++
      // Register component props (only for non-callback functions with JSX)
      maybeRegisterComponentProps(node)
      // Track signal name shadowing for scope awareness
      if (signalVars.size > 0) {
        scopeShadows = findShadowingNames(node)
        for (const name of scopeShadows) shadowedSignals.add(name)
      }
    }

    // ── Variable declaration collection (was pass 1 + 2) ──
    if (node.type === 'VariableDeclaration') {
      collectPropDerivedFromDecl(node, _callbackDepth)
    }

    // ── JSX processing (was pass 3) ──
    if (node.type === 'JSXElement') {
      if (!isSelfClosing(node) && tryTemplateEmit(node)) {
        // Template emitted — don't recurse into this subtree (JSXElement is never a function)
        return
      }
      checkForWarnings(node)
      for (const attr of jsxAttrs(node)) {
        if (attr.type === 'JSXAttribute') handleJsxAttribute(attr, node)
      }
      for (const child of jsxChildren(node)) {
        if (child.type === 'JSXExpressionContainer') handleJsxExpression(child)
        else walkNode(child)
      }
      // Note: JSXElement is never a function, so no callback depth or scope cleanup needed here
      return
    }
    if (node.type === 'JSXExpressionContainer') {
      handleJsxExpression(node)
      // Note: JSXExpressionContainer is never a function, no scope cleanup needed
      return
    }

    // Generic descent
    forEachChildFast(node, walkNode)

    // Restore callback depth after leaving function
    if (isFunction) {
      const parent = findParent(node)
      if (parent && parent.type === 'CallExpression' && (parent.arguments ?? []).includes(node)) _callbackDepth--
    }
    // Restore signal shadowing
    if (scopeShadows) for (const name of scopeShadows) shadowedSignals.delete(name)
  }

  walkNode(program)

  if (replacements.length === 0 && hoists.length === 0) return { code, warnings }

  replacements.sort((a, b) => a.start - b.start)
  const parts: string[] = []
  let lastPos = 0
  for (const r of replacements) {
    parts.push(code.slice(lastPos, r.start))
    parts.push(r.text)
    lastPos = r.end
  }
  parts.push(code.slice(lastPos))
  let result = parts.join('')

  if (hoists.length > 0) {
    const preamble = hoists.map((h) => `const ${h.name} = /*@__PURE__*/ ${h.text}\n`).join('')
    result = preamble + result
  }

  if (needsTplImport) {
    const runtimeDomImports = ['_tpl']
    if (needsBindDirectImportGlobal) runtimeDomImports.push('_bindDirect')
    if (needsBindTextImportGlobal) runtimeDomImports.push('_bindText')
    if (needsApplyPropsImportGlobal) runtimeDomImports.push('_applyProps')
    if (needsMountSlotImportGlobal) runtimeDomImports.push('_mountSlot')
    const reactivityImports = needsBindImportGlobal
      ? `\nimport { _bind } from "@pyreon/reactivity";`
      : ''
    result =
      `import { ${runtimeDomImports.join(', ')} } from "@pyreon/runtime-dom";${reactivityImports}\n` +
      result
  }

  if (needsRpImport) {
    result = `import { _rp } from "@pyreon/core";\n` + result
  }

  return { code: result, usesTemplates: needsTplImport, warnings }

  // ── Template emission helpers ─────────────────────────────────────────────

  function hasBailAttr(node: N, isRoot = false): boolean {
    for (const attr of jsxAttrs(node)) {
      if (attr.type === 'JSXSpreadAttribute') {
        if (isRoot) continue
        return true
      }
      if (attr.type === 'JSXAttribute' && attr.name?.type === 'JSXIdentifier' && attr.name.name === 'key')
        return true
    }
    return false
  }

  function countChildForTemplate(child: N): number {
    if (child.type === 'JSXText') return 0
    if (child.type === 'JSXElement') return templateElementCount(child)
    if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return 0
      return containsJSXInExpr(expr) ? -1 : 0
    }
    if (child.type === 'JSXFragment') return templateFragmentCount(child)
    return -1
  }

  function templateElementCount(node: N, isRoot = false): number {
    const tag = jsxTagName(node)
    if (!tag || !isLowerCase(tag)) return -1
    if (hasBailAttr(node, isRoot)) return -1
    if (isSelfClosing(node)) return 1
    let count = 1
    for (const child of jsxChildren(node)) {
      const c = countChildForTemplate(child)
      if (c === -1) return -1
      count += c
    }
    return count
  }

  function templateFragmentCount(frag: N): number {
    let count = 0
    for (const child of jsxChildren(frag)) {
      const c = countChildForTemplate(child)
      if (c === -1) return -1
      count += c
    }
    return count
  }

  function buildTemplateCall(node: N): string | null {
    const bindLines: string[] = []
    const disposerNames: string[] = []
    let varIdx = 0
    let dispIdx = 0
    const reactiveBindExprs: string[] = []
    let needsBindTextImport = false
    let needsBindDirectImport = false
    let needsApplyPropsImport = false
    let needsMountSlotImport = false

    function nextVar(): string { return `__e${varIdx++}` }
    function nextDisp(): string {
      const name = `__d${dispIdx++}`
      disposerNames.push(name)
      return name
    }
    function nextTextVar(): string { return `__t${varIdx++}` }

    function resolveElementVar(accessor: string, hasDynamic: boolean): string {
      if (accessor === '__root') return '__root'
      if (hasDynamic) {
        const v = nextVar()
        bindLines.push(`const ${v} = ${accessor}`)
        return v
      }
      return accessor
    }

    function emitRef(attr: N, varName: string): void {
      if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return
      const expr = attr.value.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return
      if (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') {
        bindLines.push(`(${sliceExpr(expr)})(${varName})`)
      } else {
        bindLines.push(
          `{ const __r = ${sliceExpr(expr)}; if (typeof __r === "function") __r(${varName}); else if (__r) __r.current = ${varName} }`,
        )
      }
    }

    function emitEventListener(attr: N, attrName: string, varName: string): void {
      const eventName = (attrName[2] ?? '').toLowerCase() + attrName.slice(3)
      if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return
      const expr = attr.value.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return
      const handler = sliceExpr(expr)
      if (DELEGATED_EVENTS.has(eventName)) {
        bindLines.push(`${varName}.__ev_${eventName} = ${handler}`)
      } else {
        bindLines.push(`${varName}.addEventListener("${eventName}", ${handler})`)
      }
    }

    function staticAttrToHtml(exprNode: N, htmlAttrName: string): string | null {
      if (!isStatic(exprNode)) return null
      // String literal
      if ((exprNode.type === 'Literal' || exprNode.type === 'StringLiteral') && typeof exprNode.value === 'string')
        return ` ${htmlAttrName}="${escapeHtmlAttr(exprNode.value)}"`
      // Numeric literal
      if ((exprNode.type === 'Literal' || exprNode.type === 'NumericLiteral') && typeof exprNode.value === 'number')
        return ` ${htmlAttrName}="${exprNode.value}"`
      // Boolean true
      if ((exprNode.type === 'Literal' || exprNode.type === 'BooleanLiteral') && exprNode.value === true)
        return ` ${htmlAttrName}`
      return '' // false/null/undefined → omit
    }

    function tryDirectSignalRef(exprNode: N): string | null {
      let inner = exprNode
      if (inner.type === 'ArrowFunctionExpression' && inner.body?.type !== 'BlockStatement') {
        inner = inner.body
      }
      if (inner.type !== 'CallExpression') return null
      if ((inner.arguments?.length ?? 0) > 0) return null
      const callee = inner.callee
      if (callee?.type === 'Identifier') return sliceExpr(callee)
      return null
    }

    function unwrapAccessor(exprNode: N): { expr: string; isReactive: boolean } {
      if (exprNode.type === 'ArrowFunctionExpression' && exprNode.body?.type !== 'BlockStatement') {
        return { expr: sliceExpr(exprNode.body), isReactive: true }
      }
      if (exprNode.type === 'ArrowFunctionExpression' || exprNode.type === 'FunctionExpression') {
        return { expr: `(${sliceExpr(exprNode)})()`, isReactive: true }
      }
      return { expr: sliceExpr(exprNode), isReactive: isDynamic(exprNode) }
    }

    function attrSetter(htmlAttrName: string, varName: string, expr: string): string {
      if (htmlAttrName === 'class') return `${varName}.className = ${expr}`
      if (htmlAttrName === 'style') return `${varName}.style.cssText = ${expr}`
      return `${varName}.setAttribute("${htmlAttrName}", ${expr})`
    }

    function emitDynamicAttr(_expr: string, exprNode: N, htmlAttrName: string, varName: string): void {
      const { expr, isReactive } = unwrapAccessor(exprNode)
      if (!isReactive) {
        bindLines.push(attrSetter(htmlAttrName, varName, expr))
        return
      }
      const directRef = tryDirectSignalRef(exprNode)
      if (directRef) {
        needsBindDirectImport = true
        const d = nextDisp()
        const updater =
          htmlAttrName === 'class'
            ? `(v) => { ${varName}.className = v == null ? "" : String(v) }`
            : htmlAttrName === 'style'
              ? `(v) => { if (typeof v === "string") ${varName}.style.cssText = v; else if (v) Object.assign(${varName}.style, v) }`
              : `(v) => { ${varName}.setAttribute("${htmlAttrName}", v == null ? "" : String(v)) }`
        bindLines.push(`const ${d} = _bindDirect(${directRef}, ${updater})`)
        return
      }
      reactiveBindExprs.push(attrSetter(htmlAttrName, varName, expr))
    }

    function emitAttrExpression(exprNode: N, htmlAttrName: string, varName: string): string {
      const staticHtml = staticAttrToHtml(exprNode, htmlAttrName)
      if (staticHtml !== null) return staticHtml
      if (htmlAttrName === 'style' && exprNode.type === 'ObjectExpression') {
        bindLines.push(`Object.assign(${varName}.style, ${sliceExpr(exprNode)})`)
        return ''
      }
      emitDynamicAttr(sliceExpr(exprNode), exprNode, htmlAttrName, varName)
      return ''
    }

    function tryEmitSpecialAttr(attr: N, attrName: string, varName: string): boolean {
      if (attrName === 'ref') { emitRef(attr, varName); return true }
      if (EVENT_RE.test(attrName)) { emitEventListener(attr, attrName, varName); return true }
      return false
    }

    function attrInitializerToHtml(attr: N, htmlAttrName: string, varName: string): string {
      if (!attr.value) return ` ${htmlAttrName}`
      // JSX string attribute: class="foo"
      if (attr.value.type === 'StringLiteral' || (attr.value.type === 'Literal' && typeof attr.value.value === 'string'))
        return ` ${htmlAttrName}="${escapeHtmlAttr(attr.value.value)}"`
      if (attr.value.type === 'JSXExpressionContainer') {
        const expr = attr.value.expression
        if (expr && expr.type !== 'JSXEmptyExpression') return emitAttrExpression(expr, htmlAttrName, varName)
      }
      return ''
    }

    function processOneAttr(attr: N, varName: string): string {
      if (attr.type === 'JSXSpreadAttribute') {
        const expr = sliceExpr(attr.argument)
        needsApplyPropsImport = true
        if (isDynamic(attr.argument)) {
          reactiveBindExprs.push(`_applyProps(${varName}, ${expr})`)
        } else {
          bindLines.push(`_applyProps(${varName}, ${expr})`)
        }
        return ''
      }
      if (attr.type !== 'JSXAttribute') return ''
      const attrName = attr.name?.type === 'JSXIdentifier' ? attr.name.name : ''
      if (attrName === 'key') return ''
      if (tryEmitSpecialAttr(attr, attrName, varName)) return ''
      return attrInitializerToHtml(attr, JSX_TO_HTML_ATTR[attrName] ?? attrName, varName)
    }

    function processAttrs(el: N, varName: string): string {
      let htmlAttrs = ''
      for (const attr of jsxAttrs(el)) htmlAttrs += processOneAttr(attr, varName)
      return htmlAttrs
    }

    function emitReactiveTextChild(
      expr: string, exprNode: N, varName: string,
      parentRef: string, childNodeIdx: number, needsPlaceholder: boolean,
    ): string {
      const tVar = nextTextVar()
      bindLines.push(`const ${tVar} = document.createTextNode("")`)
      if (needsPlaceholder) {
        bindLines.push(`${parentRef}.replaceChild(${tVar}, ${parentRef}.childNodes[${childNodeIdx}])`)
      } else {
        bindLines.push(`${varName}.appendChild(${tVar})`)
      }
      const directRef = tryDirectSignalRef(exprNode)
      if (directRef) {
        needsBindTextImport = true
        const d = nextDisp()
        bindLines.push(`const ${d} = _bindText(${directRef}, ${tVar})`)
      } else {
        needsBindImportGlobal = true
        const d = nextDisp()
        bindLines.push(`const ${d} = _bind(() => { ${tVar}.data = ${expr} })`)
      }
      return needsPlaceholder ? '<!>' : ''
    }

    function emitStaticTextChild(
      expr: string, varName: string,
      parentRef: string, childNodeIdx: number, needsPlaceholder: boolean,
    ): string {
      if (needsPlaceholder) {
        const tVar = nextTextVar()
        bindLines.push(`const ${tVar} = document.createTextNode(${expr})`)
        bindLines.push(`${parentRef}.replaceChild(${tVar}, ${parentRef}.childNodes[${childNodeIdx}])`)
        return '<!>'
      }
      bindLines.push(`${varName}.textContent = ${expr}`)
      return ''
    }

    type FlatChild =
      | { kind: 'text'; text: string }
      | { kind: 'element'; node: N; elemIdx: number }
      | { kind: 'expression'; expression: N }

    function classifyJsxChild(
      child: N, out: FlatChild[],
      elemIdxRef: { value: number },
      recurse: (kids: N[]) => void,
    ): void {
      if (child.type === 'JSXText') {
        const raw = child.value ?? child.raw ?? ''
        const trimmed = raw.replace(/\n\s*/g, '').trim()
        if (trimmed) out.push({ kind: 'text', text: trimmed })
        return
      }
      if (child.type === 'JSXElement') {
        out.push({ kind: 'element', node: child, elemIdx: elemIdxRef.value++ })
        return
      }
      if (child.type === 'JSXExpressionContainer') {
        const expr = child.expression
        if (expr && expr.type !== 'JSXEmptyExpression') out.push({ kind: 'expression', expression: expr })
        return
      }
      if (child.type === 'JSXFragment') recurse(jsxChildren(child))
    }

    function flattenChildren(children: N[]): FlatChild[] {
      const flatList: FlatChild[] = []
      const elemIdxRef = { value: 0 }
      function addChildren(kids: N[]): void {
        for (const child of kids) classifyJsxChild(child, flatList, elemIdxRef, addChildren)
      }
      addChildren(children)
      return flatList
    }

    function analyzeChildren(flatChildren: FlatChild[]): { useMixed: boolean; useMultiExpr: boolean } {
      const hasElem = flatChildren.some((c) => c.kind === 'element')
      const hasNonElem = flatChildren.some((c) => c.kind !== 'element')
      const exprCount = flatChildren.filter((c) => c.kind === 'expression').length
      return { useMixed: hasElem && hasNonElem, useMultiExpr: exprCount > 1 }
    }

    function attrIsDynamic(attr: N): boolean {
      if (attr.type !== 'JSXAttribute') return false
      const name = attr.name?.type === 'JSXIdentifier' ? attr.name.name : ''
      if (name === 'ref') return true
      if (EVENT_RE.test(name)) return true
      if (!attr.value || attr.value.type !== 'JSXExpressionContainer') return false
      const expr = attr.value.expression
      return expr && expr.type !== 'JSXEmptyExpression' ? !isStatic(expr) : false
    }

    function elementHasDynamic(node: N): boolean {
      if (jsxAttrs(node).some(attrIsDynamic)) return true
      if (!isSelfClosing(node)) {
        return jsxChildren(node).some((c: N) =>
          c.type === 'JSXExpressionContainer' && c.expression && c.expression.type !== 'JSXEmptyExpression',
        )
      }
      return false
    }

    function processOneChild(
      child: FlatChild, varName: string, parentRef: string,
      useMixed: boolean, useMultiExpr: boolean, childNodeIdx: number,
    ): string | null {
      if (child.kind === 'text') return escapeHtmlText(child.text)
      if (child.kind === 'element') {
        const childAccessor = useMixed
          ? `${parentRef}.childNodes[${childNodeIdx}]`
          : `${parentRef}.children[${child.elemIdx}]`
        return processElement(child.node, childAccessor)
      }
      const needsPlaceholder = useMixed || useMultiExpr
      const { expr, isReactive } = unwrapAccessor(child.expression)
      if (isChildrenExpression(child.expression, expr)) {
        needsMountSlotImport = true
        const placeholder = `${parentRef}.childNodes[${childNodeIdx}]`
        const d = nextDisp()
        bindLines.push(`const ${d} = _mountSlot(${expr}, ${parentRef}, ${placeholder})`)
        return '<!>'
      }
      if (isReactive) {
        return emitReactiveTextChild(expr, child.expression, varName, parentRef, childNodeIdx, needsPlaceholder)
      }
      return emitStaticTextChild(expr, varName, parentRef, childNodeIdx, needsPlaceholder)
    }

    function processChildren(el: N, varName: string, accessor: string): string | null {
      const flatChildren = flattenChildren(jsxChildren(el))
      const { useMixed, useMultiExpr } = analyzeChildren(flatChildren)
      const parentRef = accessor === '__root' ? '__root' : varName
      let html = ''
      let childNodeIdx = 0
      for (const child of flatChildren) {
        const childHtml = processOneChild(child, varName, parentRef, useMixed, useMultiExpr, childNodeIdx)
        if (childHtml === null) return null
        html += childHtml
        childNodeIdx++
      }
      return html
    }

    function processElement(el: N, accessor: string): string | null {
      const tag = jsxTagName(el)
      if (!tag) return null
      const varName = resolveElementVar(accessor, elementHasDynamic(el))
      const htmlAttrs = processAttrs(el, varName)
      let html = `<${tag}${htmlAttrs}>`
      if (!isSelfClosing(el)) {
        const childHtml = processChildren(el, varName, accessor)
        if (childHtml === null) return null
        html += childHtml
      }
      if (!VOID_ELEMENTS.has(tag)) html += `</${tag}>`
      return html
    }

    const html = processElement(node, '__root')
    if (html === null) return null

    if (needsBindTextImport) needsBindTextImportGlobal = true
    if (needsBindDirectImport) needsBindDirectImportGlobal = true
    if (needsApplyPropsImport) needsApplyPropsImportGlobal = true
    if (needsMountSlotImport) needsMountSlotImportGlobal = true

    const escaped = html.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

    if (reactiveBindExprs.length > 0) {
      needsBindImportGlobal = true
      const combinedName = nextDisp()
      const combinedBody = reactiveBindExprs.join('; ')
      bindLines.push(`const ${combinedName} = _bind(() => { ${combinedBody} })`)
    }

    if (bindLines.length === 0 && disposerNames.length === 0) {
      return `_tpl("${escaped}", () => null)`
    }

    let body = bindLines.map((l) => `  ${l}`).join('\n')
    if (disposerNames.length > 0) {
      body += `\n  return () => { ${disposerNames.map((d) => `${d}()`).join('; ')} }`
    } else {
      body += '\n  return null'
    }

    return `_tpl("${escaped}", (__root) => {\n${body}\n})`
  }

  function sliceExpr(expr: N): string {
    let result: string
    if (propDerivedVars.size > 0 && accessesProps(expr)) {
      const start = expr.start as number
      const end = expr.end as number
      result = resolveIdentifiersInText(code.slice(start, end), start, expr)
    } else {
      result = code.slice(expr.start as number, expr.end as number)
    }

    // Auto-call signal variables: replace bare `x` with `x()` in the expression.
    // Only applies to identifiers that are NOT already being called (not `x()`).
    if (signalVars.size > 0 && signalVars.size > shadowedSignals.size && referencesSignalVar(expr)) {
      result = autoCallSignals(result, expr)
    }

    return result
  }

  /** Check if an expression references any tracked signal variable. */
  function referencesSignalVar(node: N): boolean {
    if (node.type === 'Identifier' && isActiveSignal(node.name)) {
      const parent = findParent(node)
      if (parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return false
      if (parent && parent.type === 'CallExpression' && parent.callee === node) return false // already called
      return true
    }
    let found = false
    forEachChildFast(node, (child) => {
      if (found) return
      if (child.type === 'ArrowFunctionExpression' || child.type === 'FunctionExpression') return
      if (referencesSignalVar(child)) found = true
    })
    return found
  }

  /** Auto-insert () after signal variable references in the expression source.
   *  Uses the AST to find exact Identifier positions — never scans raw text. */
  function autoCallSignals(text: string, expr: N): string {
    const start = expr.start as number
    // Collect signal identifier positions that need auto-calling
    const idents: { start: number; end: number }[] = []

    function findSignalIdents(node: N): void {
      if ((node.start as number) >= start + text.length || (node.end as number) <= start) return
      if (node.type === 'Identifier' && isActiveSignal(node.name)) {
        const parent = findParent(node)
        // Skip property name positions (obj.name)
        if (parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return
        // Skip if already being called: signal()
        if (parent && parent.type === 'CallExpression' && parent.callee === node) return
        // Skip declaration positions
        if (parent && parent.type === 'VariableDeclarator' && parent.id === node) return
        // Skip object property keys and shorthand properties ({ name } or { name: val })
        // Inserting () after a shorthand key produces name() which is a method shorthand — invalid
        if (parent && (parent.type === 'Property' || parent.type === 'ObjectProperty')) {
          if (parent.shorthand) return // { name } — can't auto-call without breaking syntax
          if (parent.key === node && !parent.computed) return // { name: val } — key position
        }
        idents.push({ start: node.start as number, end: node.end as number })
      }
      forEachChildFast(node, findSignalIdents)
    }
    findSignalIdents(expr)

    if (idents.length === 0) return text

    // Sort by position and insert () after each identifier
    idents.sort((a, b) => a.start - b.start)
    const parts: string[] = []
    let lastPos = start
    for (const id of idents) {
      parts.push(code.slice(lastPos, id.end))
      parts.push('()')  // auto-call
      lastPos = id.end
    }
    parts.push(code.slice(lastPos, start + text.length))
    return parts.join('')
  }
}

// ─── Module-scope constants and helpers ─────────────────────────────────────

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const JSX_TO_HTML_ATTR: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
}

const STATEFUL_CALLS = new Set([
  'signal', 'computed', 'effect', 'batch',
  'createContext', 'createReactiveContext',
  'useContext', 'useRef', 'createRef',
  'useForm', 'useQuery', 'useMutation',
  'defineStore', 'useStore',
])

function isStatefulCall(node: N): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee?.type === 'Identifier') return STATEFUL_CALLS.has(callee.name)
  return false
}

/** Check if a call expression creates a callable reactive value (`signal(...)` or `computed(...)`). */
function isSignalCall(node: N): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  return callee?.type === 'Identifier' && (callee.name === 'signal' || callee.name === 'computed')
}

function isChildrenExpression(node: N, expr: string): boolean {
  if (node.type === 'MemberExpression' && !node.computed && node.property?.type === 'Identifier' && node.property.name === 'children') return true
  if (node.type === 'Identifier' && node.name === 'children') return true
  if (expr.endsWith('.children') || expr === 'children') return true
  return false
}

function isLowerCase(s: string): boolean {
  return s.length > 0 && s[0] === s[0]?.toLowerCase()
}

function containsJSXInExpr(node: N): boolean {
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true
  let found = false
  forEachChild(node, (child) => {
    if (found) return
    if (containsJSXInExpr(child)) found = true
  })
  return found
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function escapeHtmlText(s: string): string {
  return s.replace(/&(?!(?:#\d+|#x[\da-fA-F]+|[a-zA-Z]\w*);)/g, '&amp;').replace(/</g, '&lt;')
}

function isStaticJSXNode(node: N): boolean {
  if (node.type === 'JSXElement' && node.openingElement?.selfClosing) {
    return isStaticAttrs(node.openingElement.attributes ?? [])
  }
  if (node.type === 'JSXFragment') {
    return (node.children ?? []).every(isStaticChild)
  }
  if (node.type === 'JSXElement') {
    return isStaticAttrs(node.openingElement?.attributes ?? []) && (node.children ?? []).every(isStaticChild)
  }
  return false
}

function isStaticAttrs(attrs: N[]): boolean {
  return attrs.every((prop: N) => {
    if (prop.type !== 'JSXAttribute') return false
    if (!prop.value) return true
    if (prop.value.type === 'StringLiteral' || (prop.value.type === 'Literal' && typeof prop.value.value === 'string')) return true
    if (prop.value.type === 'JSXExpressionContainer') {
      const expr = prop.value.expression
      if (!expr || expr.type === 'JSXEmptyExpression') return true
      return isStatic(expr)
    }
    return false
  })
}

function isStaticChild(child: N): boolean {
  if (child.type === 'JSXText') return true
  if (child.type === 'JSXElement') return isStaticJSXNode(child)
  if (child.type === 'JSXFragment') return isStaticJSXNode(child)
  if (child.type === 'JSXExpressionContainer') {
    const expr = child.expression
    if (!expr || expr.type === 'JSXEmptyExpression') return true
    return isStatic(expr)
  }
  return false
}

function isStatic(node: N): boolean {
  if (node.type === 'Literal') return true
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral' || node.type === 'NullLiteral') return true
  if (node.type === 'TemplateLiteral' && (node.expressions?.length ?? 0) === 0) return true
  // Note: `undefined` is an Identifier in ESTree, not a keyword literal.
  // It is NOT treated as static — it goes through the dynamic attr path.
  return false
}

const PURE_CALLS = new Set([
  'Math.max', 'Math.min', 'Math.abs', 'Math.floor', 'Math.ceil', 'Math.round',
  'Math.pow', 'Math.sqrt', 'Math.random', 'Math.trunc', 'Math.sign',
  'Number.parseInt', 'Number.parseFloat', 'Number.isNaN', 'Number.isFinite',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'String.fromCharCode', 'String.fromCodePoint',
  'Object.keys', 'Object.values', 'Object.entries', 'Object.assign',
  'Object.freeze', 'Object.create',
  'Array.from', 'Array.isArray', 'Array.of',
  'JSON.stringify', 'JSON.parse',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'Date.now',
])

function isPureStaticCall(node: N): boolean {
  const callee = node.callee
  let name = ''
  if (callee?.type === 'Identifier') {
    name = callee.name
  } else if (callee?.type === 'MemberExpression' && !callee.computed && callee.object?.type === 'Identifier' && callee.property?.type === 'Identifier') {
    name = `${callee.object.name}.${callee.property.name}`
  }
  if (!PURE_CALLS.has(name)) return false
  return (node.arguments ?? []).every((arg: N) => arg.type !== 'SpreadElement' && isStatic(arg))
}