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
 *  - JSX element trees with ≥ 2 DOM elements (no components, no spread attrs)
 *    are compiled to `_tpl(html, bindFn)` calls instead of nested `h()` calls.
 *  - The HTML string is parsed once via <template>.innerHTML, then cloneNode(true)
 *    for each instance (~5-10x faster than sequential createElement calls).
 *  - Static attributes are baked into the HTML string; dynamic attributes and
 *    text content use renderEffect in the bind function.
 *
 * Implementation: TypeScript parser for positions + magic-string replacements.
 * No extra runtime dependencies — `typescript` is already in devDependencies.
 *
 * Known limitation (v0): expressions inside *nested* JSX within a child
 * expression container are not individually wrapped. They are still reactive
 * because the outer wrapper re-evaluates the whole subtree, just at a coarser
 * granularity. Fine-grained nested wrapping is planned for a future pass.
 */

import ts from 'typescript'

export interface CompilerWarning {
  /** Warning message */
  message: string
  /** Source file line number (1-based) */
  line: number
  /** Source file column number (0-based) */
  column: number
  /** Warning code for filtering */
  code: 'signal-call-in-jsx' | 'missing-key-on-for' | 'signal-in-static-prop'
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
  'click',
  'dblclick',
  'contextmenu',
  'focusin',
  'focusout',
  'input',
  'change',
  'keydown',
  'keyup',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerover',
  'pointerout',
  'touchstart',
  'touchend',
  'touchmove',
  'submit',
])

export function transformJSX(code: string, filename = 'input.tsx'): TransformResult {
  const scriptKind =
    filename.endsWith('.tsx') || filename.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TSX // default to TSX so JSX is always parsed

  const sf = ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    scriptKind,
  )

  type Replacement = { start: number; end: number; text: string }
  const replacements: Replacement[] = []
  const warnings: CompilerWarning[] = []

  function warn(node: ts.Node, message: string, warnCode: CompilerWarning['code']): void {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    warnings.push({ message, line: line + 1, column: character, code: warnCode })
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

  /**
   * If `node` is a fully-static JSX element/fragment, register a module-scope
   * hoist for it and return the generated variable name. Otherwise return null.
   */
  function maybeHoist(node: ts.Node): string | null {
    if (
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) &&
      isStaticJSXNode(node as ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment)
    ) {
      const name = `_$h${hoistIdx++}`
      const text = code.slice(node.getStart(sf), node.getEnd())
      hoists.push({ name, text })
      return name
    }
    return null
  }

  function wrap(expr: ts.Expression): void {
    const start = expr.getStart(sf)
    const end = expr.getEnd()
    replacements.push({ start, end, text: `() => ${sliceExpr(expr)}` })
  }

  /** Try to hoist or wrap an expression, pushing a replacement if needed. */
  function hoistOrWrap(expr: ts.Expression): void {
    const hoistName = maybeHoist(expr)
    if (hoistName) {
      replacements.push({ start: expr.getStart(sf), end: expr.getEnd(), text: hoistName })
    } else if (shouldWrap(expr)) {
      wrap(expr)
    }
  }

  // ── walk sub-handlers ───────────────────────────────────────────────────────

  /** Try to emit a template for a JsxElement. Returns true if handled. */
  function tryTemplateEmit(node: ts.JsxElement): boolean {
    const elemCount = templateElementCount(node, /* isRoot */ true)
    if (elemCount < 1) return false
    const tplCall = buildTemplateCall(node)
    if (!tplCall) return false
    const start = node.getStart(sf)
    const end = node.getEnd()
    const parent = node.parent
    const needsBraces = parent && (ts.isJsxElement(parent) || ts.isJsxFragment(parent))
    replacements.push({ start, end, text: needsBraces ? `{${tplCall}}` : tplCall })
    needsTplImport = true
    return true
  }

  /** Emit warnings for common JSX mistakes (e.g. <For> without by). */
  function checkForWarnings(node: ts.JsxElement | ts.JsxSelfClosingElement): void {
    const opening = ts.isJsxElement(node) ? node.openingElement : node
    const tagName = ts.isIdentifier(opening.tagName) ? opening.tagName.text : ''
    if (tagName !== 'For') return
    const hasBy = opening.attributes.properties.some(
      (p) => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === 'by',
    )
    if (!hasBy) {
      warn(
        opening.tagName,
        `<For> without a "by" prop will use index-based diffing, which is slower and may cause bugs with stateful children. Add by={(item) => item.id} for efficient keyed reconciliation.`,
        'missing-key-on-for',
      )
    }
  }

  /** Handle a JSX attribute node — wrap or hoist its value if needed.
   *
   * Both DOM and component props are processed:
   * - DOM props: () => expr — applyProp creates renderEffect
   * - Component props: _rp(() => expr) — makeReactiveProps converts to getters
   *
   * The _rp() brand distinguishes compiler wrappers from user-written accessor
   * props (like Show's when, For's each) so makeReactiveProps only converts
   * compiler-emitted wrappers.
   */
  function handleJsxAttribute(node: ts.JsxAttribute): void {
    const name = ts.isIdentifier(node.name) ? node.name.text : ''
    if (SKIP_PROPS.has(name) || EVENT_RE.test(name)) return
    if (!node.initializer || !ts.isJsxExpression(node.initializer)) return
    const expr = node.initializer.expression
    if (!expr) return

    const openingEl = node.parent.parent as ts.JsxOpeningElement | ts.JsxSelfClosingElement
    const tagName = ts.isIdentifier(openingEl.tagName) ? openingEl.tagName.text : ''
    const isComponent = tagName.length > 0 && tagName.charAt(0) !== tagName.charAt(0).toLowerCase()

    if (isComponent) {
      // Component prop: wrap with _rp() brand so makeReactiveProps recognizes it.
      //
      // EXCEPTION: If the expression is a single JSX element (not a conditional),
      // do NOT wrap the outer expression. The JSX element is created once (stable VNode).
      // Its own inner props will be wrapped individually via recursive walk().
      // This prevents remounting: <Icon name={x()} /> stays one Icon instance,
      // only its name prop updates reactively.
      const isSingleJsx = ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)
      if (isSingleJsx) {
        // Don't wrap — recurse into the JSX element's attributes instead
        ts.forEachChild(expr, walk)
        return
      }

      const hoistName = maybeHoist(expr)
      if (hoistName) {
        replacements.push({ start: expr.getStart(sf), end: expr.getEnd(), text: hoistName })
      } else if (shouldWrap(expr)) {
        const start = expr.getStart(sf)
        const end = expr.getEnd()
        replacements.push({ start, end, text: `_rp(() => ${sliceExpr(expr)})` })
        needsRpImport = true
      }
    } else {
      // DOM prop: standard () => expr wrapping
      hoistOrWrap(expr)
    }
  }

  /** Handle a JSX expression in child position — wrap, hoist, or recurse. */
  function handleJsxExpression(node: ts.JsxExpression): void {
    const expr = node.expression
    if (!expr) return
    const hoistName = maybeHoist(expr)
    if (hoistName) {
      replacements.push({ start: expr.getStart(sf), end: expr.getEnd(), text: hoistName })
      return
    }
    if (shouldWrap(expr)) {
      wrap(expr)
      return
    }
    // Not hoisted, not wrapped (e.g., arrow function in For callback).
    // Recurse into the expression body to find nested JSX elements
    // that should be compiled to _tpl() calls.
    ts.forEachChild(expr, walk)
  }

  // ── Prop-derived variable tracking ─────────────────────────────────────────
  // Pre-pass: find variables derived from props/splitProps results inside
  // component functions. These are inlined at JSX use sites so the compiler's
  // existing wrapping makes them reactive.
  //
  // Example:
  //   const align = props.alignX ?? 'left'
  //   return <div class={align}>  ← inlined to: class={props.alignX ?? 'left'}
  //                                 ← compiler wraps: class={() => props.alignX ?? 'left'}

  /** Names that refer to the props object or splitProps results. */
  const propsNames = new Set<string>()

  /** Map of variable name → AST node of the original expression.
   *  Using AST nodes instead of text avoids all string manipulation edge cases. */
  const propDerivedVars = new Map<string, ts.Expression>()

  /** Check if an expression reads from a tracked props-like object. */
  function readsFromProps(node: ts.Node): boolean {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      return propsNames.has(node.expression.text)
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
      return propsNames.has(node.expression.text)
    }
    // Check children recursively — e.g. props.x ?? 'default'
    let found = false
    ts.forEachChild(node, (child) => {
      if (found) return
      if (readsFromProps(child)) found = true
    })
    return found
  }

  /** Pre-pass: scan a function body for prop-derived variable declarations.
   *  callbackDepth tracks nesting inside callback arguments (map, filter, etc.)
   *  to avoid tracking variables declared inside callbacks as prop-derived. */
  let _callbackDepth = 0
  function scanForPropDerivedVars(node: ts.Node): void {
    // Track callback nesting — don't track vars inside callbacks
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node))) {
      const parent = node.parent
      if (parent && ts.isCallExpression(parent) && parent.arguments.includes(node as any)) {
        _callbackDepth++
        ts.forEachChild(node, scanForPropDerivedVars)
        _callbackDepth--
        return
      }
    }
    // Track the function's first parameter as a props name.
    // Only for COMPONENT functions — not callbacks like .map(item => <div>...)
    // Heuristic: component functions are named declarations, const assignments,
    // or export defaults — NOT inline arguments to calls like .map(), .filter().
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))
      && node.parameters.length > 0) {

      // Skip functions that are arguments to a call (map/filter callbacks)
      const parent = node.parent
      if (parent && ts.isCallExpression(parent) && parent.arguments.includes(node as any)) {
        ts.forEachChild(node, scanForPropDerivedVars)
        return
      }

      const firstParam = node.parameters[0]!
      if (ts.isIdentifier(firstParam.name)) {
        // Check if this function returns JSX (is a component)
        let hasJSX = false
        ts.forEachChild(node, function checkJSX(n) {
          if (hasJSX) return
          if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
            hasJSX = true
            return
          }
          ts.forEachChild(n, checkJSX)
        })
        if (hasJSX) propsNames.add(firstParam.name.text)
      }
    }

    // Track splitProps results: const [own, rest] = splitProps(props, [...])
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isArrayBindingPattern(decl.name) && decl.initializer
          && ts.isCallExpression(decl.initializer)) {
          const callee = decl.initializer.expression
          if (ts.isIdentifier(callee) && callee.text === 'splitProps') {
            for (const el of decl.name.elements) {
              if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
                propsNames.add(el.name.text)
              }
            }
          }
        }

        // Track: const x = props.y ?? z  OR  const x = own.y
        // Skip let/var — mutable variables can be reassigned, unsafe to inline
        // Skip declarations inside callbacks (map, filter, etc.)
        if (!(node.declarationList.flags & ts.NodeFlags.Const)) continue
        if (_callbackDepth > 0) continue
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          if (readsFromProps(decl.initializer)) {
            propDerivedVars.set(decl.name.text, decl.initializer)
          }
        }
      }
    }

    ts.forEachChild(node, scanForPropDerivedVars)
  }

  // Run pre-pass
  scanForPropDerivedVars(sf)

  // Transitive resolution: if const b = a + 1 where a is prop-derived,
  // then b is also prop-derived. Store its AST node.
  // Fixed-point iteration until no new variables are added.
  let changed = true
  while (changed) {
    changed = false
    sf.forEachChild(function scanTransitive(node) {
      if (!ts.isVariableStatement(node)) { ts.forEachChild(node, scanTransitive); return }
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
        const varName = decl.name.text
        if (propDerivedVars.has(varName)) continue
        if (node.declarationList.flags & ts.NodeFlags.Let) continue
        let usesPropVar = false
        ts.forEachChild(decl.initializer, function check(n) {
          if (usesPropVar) return
          if (ts.isIdentifier(n) && propDerivedVars.has(n.text)) {
            const parent = n.parent
            if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) return
            usesPropVar = true
          }
          ts.forEachChild(n, check)
        })
        if (usesPropVar) {
          propDerivedVars.set(varName, decl.initializer)
          changed = true
        }
      }
    })
  }

  // Resolve transitive AST: for each prop-derived var, recursively replace
  // references to other prop-derived vars in its AST with their resolved nodes.
  // Uses ts.visitNode for correct AST transformation — no string manipulation.
  function resolveExprTransitive(node: ts.Expression, excludeVar?: string): ts.Expression {
    return ts.visitNode(node, function visit(n: ts.Node): ts.Node {
      if (ts.isIdentifier(n) && propDerivedVars.has(n.text) && n.text !== excludeVar) {
        const parent = n.parent
        // Skip property name after dot: obj.sizes
        if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) {
          return n
        }
        // Skip JSX attribute name: sizes={...}
        if (parent && ts.isJsxAttribute(parent) && parent.name === n) {
          return n
        }
        // Skip shorthand property assignment: { sizes }
        if (parent && ts.isShorthandPropertyAssignment(parent)) {
          return n
        }
        const resolved = propDerivedVars.get(n.text)!
        return ts.factory.createParenthesizedExpression(
          resolveExprTransitive(resolved, n.text),
        )
      }
      return ts.visitEachChild(n, visit, undefined as any)
    }) as ts.Expression
  }

  /** Print an AST expression back to source text. */
  const printer = ts.createPrinter({ removeComments: false })

  /**
   * Enhanced dynamic check — combines containsCall with props awareness.
   * Returns true if an expression is reactive (contains signal calls,
   * accesses props members, or references prop-derived variables).
   */
  function isDynamic(node: ts.Node): boolean {
    if (containsCall(node)) return true
    return accessesProps(node)
  }

  /** Check if an expression accesses a tracked props object or a prop-derived variable. */
  function accessesProps(node: ts.Node): boolean {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      if (propsNames.has(node.expression.text)) return true
    }
    if (ts.isIdentifier(node) && propDerivedVars.has(node.text)) {
      const parent = node.parent
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) return false
      return true
    }
    let found = false
    ts.forEachChild(node, (child) => {
      if (found) return
      if (ts.isArrowFunction(child) || ts.isFunctionExpression(child)) return
      if (accessesProps(child)) found = true
    })
    return found
  }

  function shouldWrap(node: ts.Expression): boolean {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false
    if (isStatic(node)) return false
    if (ts.isCallExpression(node) && isPureStaticCall(node)) return false
    return isDynamic(node)
  }

  function walk(node: ts.Node): void {
    if (ts.isJsxElement(node) && tryTemplateEmit(node)) return
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) checkForWarnings(node)
    if (ts.isJsxAttribute(node)) {
      handleJsxAttribute(node)
      return
    }
    if (ts.isJsxExpression(node)) {
      handleJsxExpression(node)
      return
    }
    ts.forEachChild(node, walk)
  }

  walk(sf)

  if (replacements.length === 0 && hoists.length === 0) return { code, warnings }

  // Apply replacements left-to-right via string builder — O(n) single join
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

  // Prepend module-scope hoisted static VNode declarations
  if (hoists.length > 0) {
    const preamble = hoists.map((h) => `const ${h.name} = /*@__PURE__*/ ${h.text}\n`).join('')
    result = preamble + result
  }

  // Prepend template imports if _tpl() was emitted
  if (needsTplImport) {
    const runtimeDomImports = ['_tpl']
    if (needsBindDirectImportGlobal) runtimeDomImports.push('_bindDirect')
    if (needsBindTextImportGlobal) runtimeDomImports.push('_bindText')
    if (needsApplyPropsImportGlobal) runtimeDomImports.push('_applyProps')
    const reactivityImports = needsBindImportGlobal
      ? `\nimport { _bind } from "@pyreon/reactivity";`
      : ''
    result =
      `import { ${runtimeDomImports.join(', ')} } from "@pyreon/runtime-dom";${reactivityImports}\n` +
      result
  }

  // Prepend _rp import if reactive component props were emitted
  if (needsRpImport) {
    result = `import { _rp } from "@pyreon/core";\n` + result
  }

  return { code: result, usesTemplates: needsTplImport, warnings }

  // ── Template emission helpers (closures over sf, code) ──────────────────────

  /**
   * Check if attributes prevent template emission.
   * - `key` always bails (VNode reconciliation prop)
   * - Spread on inner elements bails (too complex to merge in _bind)
   * - Spread on root element is allowed — applied via applyProps in _bind
   */
  function hasBailAttr(node: ts.JsxElement | ts.JsxSelfClosingElement, isRoot = false): boolean {
    for (const attr of jsxAttrs(node)) {
      if (ts.isJsxSpreadAttribute(attr)) {
        // Allow spread on root element — handled in buildTemplateCall
        if (isRoot) continue
        return true
      }
      if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === 'key')
        return true
    }
    return false
  }

  /**
   * Count template-eligible elements for a single JSX child.
   * Returns 0 for skippable children, -1 for bail, positive for element count.
   */
  function countChildForTemplate(child: ts.JsxChild): number {
    if (ts.isJsxText(child)) return 0
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
      return templateElementCount(child)
    if (ts.isJsxExpression(child)) {
      if (!child.expression) return 0
      return containsJSXInExpr(child.expression) ? -1 : 0
    }
    if (ts.isJsxFragment(child)) return templateFragmentCount(child)
    return -1
  }

  /**
   * Count DOM elements in a JSX subtree. Returns -1 if the tree is not
   * eligible for template emission.
   */
  function templateElementCount(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    isRoot = false,
  ): number {
    const tag = jsxTagName(node)
    if (!tag || !isLowerCase(tag)) return -1
    if (hasBailAttr(node, isRoot)) return -1
    if (!ts.isJsxElement(node)) return 1

    let count = 1
    for (const child of node.children) {
      const c = countChildForTemplate(child)
      if (c === -1) return -1
      count += c
    }
    return count
  }

  /** Count template-eligible elements inside a fragment. */
  function templateFragmentCount(frag: ts.JsxFragment): number {
    let count = 0
    for (const child of frag.children) {
      const c = countChildForTemplate(child)
      if (c === -1) return -1
      count += c
    }
    return count
  }

  /**
   * Build the complete `_tpl("html", (__root) => { ... })` call string
   * for a template-eligible JSX element tree. Returns null if codegen fails.
   */
  function buildTemplateCall(node: ts.JsxElement | ts.JsxSelfClosingElement): string | null {
    const bindLines: string[] = []
    const disposerNames: string[] = []
    let varIdx = 0
    let dispIdx = 0
    // Reactive expressions that will be combined into a single _bind call
    const reactiveBindExprs: string[] = []
    let needsBindTextImport = false
    let needsBindDirectImport = false
    let needsApplyPropsImport = false

    function nextVar(): string {
      return `__e${varIdx++}`
    }
    function nextDisp(): string {
      const name = `__d${dispIdx++}`
      disposerNames.push(name)
      return name
    }
    function nextTextVar(): string {
      return `__t${varIdx++}`
    }

    /** Resolve the variable name for an element given its accessor path. */
    function resolveElementVar(accessor: string, hasDynamic: boolean): string {
      if (accessor === '__root') return '__root'
      if (hasDynamic) {
        const v = nextVar()
        bindLines.push(`const ${v} = ${accessor}`)
        return v
      }
      return accessor
    }

    /** Emit bind line for a ref attribute. */
    function emitRef(attr: ts.JsxAttribute, varName: string): void {
      if (!attr.initializer || !ts.isJsxExpression(attr.initializer)) return
      if (!attr.initializer.expression) return
      bindLines.push(`${sliceExpr(attr.initializer.expression)}.current = ${varName}`)
    }

    /** Emit event handler bind line — delegated (expando) or addEventListener. */
    function emitEventListener(attr: ts.JsxAttribute, attrName: string, varName: string): void {
      const eventName = (attrName[2] ?? '').toLowerCase() + attrName.slice(3)
      if (!attr.initializer || !ts.isJsxExpression(attr.initializer)) return
      if (!attr.initializer.expression) return
      const handler = sliceExpr(attr.initializer.expression)
      if (DELEGATED_EVENTS.has(eventName)) {
        // Delegated: store handler as expando property — container listener picks it up
        bindLines.push(`${varName}.__ev_${eventName} = ${handler}`)
      } else {
        bindLines.push(`${varName}.addEventListener("${eventName}", ${handler})`)
      }
    }

    /** Return HTML string for a static attribute expression, or null if not static. */
    function staticAttrToHtml(exprNode: ts.Expression, htmlAttrName: string): string | null {
      if (!isStatic(exprNode)) return null
      if (ts.isStringLiteral(exprNode)) return ` ${htmlAttrName}="${escapeHtmlAttr(exprNode.text)}"`
      if (ts.isNumericLiteral(exprNode)) return ` ${htmlAttrName}="${exprNode.text}"`
      if (exprNode.kind === ts.SyntaxKind.TrueKeyword) return ` ${htmlAttrName}`
      return '' // false/null/undefined → omit
    }

    /**
     * Try to extract a direct signal reference from an expression.
     * Returns the callee text (e.g. "count" or "row.label") if the expression
     * is a single call with no arguments, otherwise null.
     */
    function tryDirectSignalRef(exprNode: ts.Expression): string | null {
      let inner = exprNode
      // Unwrap concise arrow: () => expr
      if (ts.isArrowFunction(inner) && !ts.isBlock(inner.body)) {
        inner = inner.body as ts.Expression
      }
      if (!ts.isCallExpression(inner)) return null
      if (inner.arguments.length > 0) return null
      const callee = inner.expression
      // Only match simple identifiers: count() → _bindText(count, node)
      // Property access like obj.method() is NOT safe — detaching the method
      // loses `this` context (e.g. value.toLocaleString becomes unbound).
      if (ts.isIdentifier(callee)) {
        return sliceExpr(callee)
      }
      return null
    }

    /** Unwrap a reactive accessor expression for use inside _bind(). */
    function unwrapAccessor(exprNode: ts.Expression): { expr: string; isReactive: boolean } {
      // Concise arrow: () => value() → unwrap to "value()"
      if (ts.isArrowFunction(exprNode) && !ts.isBlock(exprNode.body)) {
        return { expr: sliceExpr(exprNode.body as ts.Expression), isReactive: true }
      }
      // Block-body arrow/function: invoke it
      if (ts.isArrowFunction(exprNode) || ts.isFunctionExpression(exprNode)) {
        return { expr: `(${sliceExpr(exprNode)})()`, isReactive: true }
      }
      return { expr: sliceExpr(exprNode), isReactive: isDynamic(exprNode) }
    }

    /** Build a setter expression for an attribute. */
    function attrSetter(htmlAttrName: string, varName: string, expr: string): string {
      if (htmlAttrName === 'class') return `${varName}.className = ${expr}`
      if (htmlAttrName === 'style') return `${varName}.style.cssText = ${expr}`
      return `${varName}.setAttribute("${htmlAttrName}", ${expr})`
    }

    /** Emit bind line for a dynamic (non-static) attribute. */
    function emitDynamicAttr(
      _expr: string,
      exprNode: ts.Expression,
      htmlAttrName: string,
      varName: string,
    ): void {
      const { expr, isReactive } = unwrapAccessor(exprNode)

      if (!isReactive) {
        bindLines.push(attrSetter(htmlAttrName, varName, expr))
        return
      }

      // Direct signal binding for bare signal calls (e.g. class={() => active()})
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

    /** Emit bind line or HTML for an expression attribute value. */
    function emitAttrExpression(
      exprNode: ts.Expression,
      htmlAttrName: string,
      varName: string,
    ): string {
      const staticHtml = staticAttrToHtml(exprNode, htmlAttrName)
      if (staticHtml !== null) return staticHtml

      // style={{...}} → Object.assign(el.style, {...}) for object expressions
      if (htmlAttrName === 'style' && ts.isObjectLiteralExpression(exprNode)) {
        bindLines.push(`Object.assign(${varName}.style, ${sliceExpr(exprNode)})`)
        return ''
      }

      emitDynamicAttr(sliceExpr(exprNode), exprNode, htmlAttrName, varName)
      return ''
    }

    /** Emit side-effects for special attrs (ref, event). Returns true if handled. */
    function tryEmitSpecialAttr(attr: ts.JsxAttribute, attrName: string, varName: string): boolean {
      if (attrName === 'ref') {
        emitRef(attr, varName)
        return true
      }
      if (EVENT_RE.test(attrName)) {
        emitEventListener(attr, attrName, varName)
        return true
      }
      return false
    }

    /** Convert an attribute initializer to HTML. Returns empty string for side-effect-only attrs. */
    function attrInitializerToHtml(
      attr: ts.JsxAttribute,
      htmlAttrName: string,
      varName: string,
    ): string {
      if (!attr.initializer) return ` ${htmlAttrName}`
      if (ts.isStringLiteral(attr.initializer))
        return ` ${htmlAttrName}="${escapeHtmlAttr(attr.initializer.text)}"`
      if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression)
        return emitAttrExpression(attr.initializer.expression, htmlAttrName, varName)
      return ''
    }

    /** Process a single attribute, returning HTML to append. */
    function processOneAttr(attr: ts.JsxAttributeLike, varName: string): string {
      // Spread attribute: apply all props at runtime
      if (ts.isJsxSpreadAttribute(attr)) {
        const expr = sliceExpr(attr.expression)
        // Use runtime-dom's applyProps which handles class, style, events, etc.
        needsApplyPropsImport = true
        if (isDynamic(attr.expression)) {
          reactiveBindExprs.push(`_applyProps(${varName}, ${expr})`)
        } else {
          bindLines.push(`_applyProps(${varName}, ${expr})`)
        }
        return ''
      }
      if (!ts.isJsxAttribute(attr)) return ''
      const attrName = ts.isIdentifier(attr.name) ? attr.name.text : ''
      if (attrName === 'key') return ''
      if (tryEmitSpecialAttr(attr, attrName, varName)) return ''
      return attrInitializerToHtml(attr, JSX_TO_HTML_ATTR[attrName] ?? attrName, varName)
    }

    /** Process all attributes on an element, returning the HTML attribute string. */
    function processAttrs(el: ts.JsxElement | ts.JsxSelfClosingElement, varName: string): string {
      let htmlAttrs = ''
      for (const attr of jsxAttrs(el)) htmlAttrs += processOneAttr(attr, varName)
      return htmlAttrs
    }

    /** Emit bind lines for a reactive text expression child. */
    function emitReactiveTextChild(
      expr: string,
      exprNode: ts.Expression,
      varName: string,
      parentRef: string,
      childNodeIdx: number,
      needsPlaceholder: boolean,
    ): string {
      const tVar = nextTextVar()
      bindLines.push(`const ${tVar} = document.createTextNode("")`)
      if (needsPlaceholder) {
        bindLines.push(
          `${parentRef}.replaceChild(${tVar}, ${parentRef}.childNodes[${childNodeIdx}])`,
        )
      } else {
        bindLines.push(`${varName}.appendChild(${tVar})`)
      }
      // Direct signal binding: bypass effect system entirely
      const directRef = tryDirectSignalRef(exprNode)
      if (directRef) {
        needsBindTextImport = true
        const d = nextDisp()
        bindLines.push(`const ${d} = _bindText(${directRef}, ${tVar})`)
      } else {
        // Each reactive text child gets its own _bind — independent tracking.
        // When r.name() changes, r.email()'s _bind doesn't re-run.
        needsBindImportGlobal = true
        const d = nextDisp()
        bindLines.push(`const ${d} = _bind(() => { ${tVar}.data = ${expr} })`)
      }
      return needsPlaceholder ? '<!>' : ''
    }

    /** Emit bind lines for a static text expression child. */
    function emitStaticTextChild(
      expr: string,
      varName: string,
      parentRef: string,
      childNodeIdx: number,
      needsPlaceholder: boolean,
    ): string {
      if (needsPlaceholder) {
        const tVar = nextTextVar()
        bindLines.push(`const ${tVar} = document.createTextNode(${expr})`)
        bindLines.push(
          `${parentRef}.replaceChild(${tVar}, ${parentRef}.childNodes[${childNodeIdx}])`,
        )
        return '<!>'
      }
      bindLines.push(`${varName}.textContent = ${expr}`)
      return ''
    }

    /** Process a single flat child, returning the HTML contribution or null on failure. */
    function processOneChild(
      child: FlatChild,
      varName: string,
      parentRef: string,
      useMixed: boolean,
      useMultiExpr: boolean,
      childNodeIdx: number,
    ): string | null {
      if (child.kind === 'text') return escapeHtmlText(child.text)
      if (child.kind === 'element') {
        const childAccessor = useMixed
          ? `${parentRef}.childNodes[${childNodeIdx}]`
          : `${parentRef}.children[${child.elemIdx}]`
        return processElement(child.node, childAccessor)
      }
      // expression
      const needsPlaceholder = useMixed || useMultiExpr
      const { expr, isReactive } = unwrapAccessor(child.expression)
      if (isReactive) {
        return emitReactiveTextChild(
          expr,
          child.expression,
          varName,
          parentRef,
          childNodeIdx,
          needsPlaceholder,
        )
      }
      return emitStaticTextChild(expr, varName, parentRef, childNodeIdx, needsPlaceholder)
    }

    /** Process children of a JsxElement, returning the children HTML. */
    function processChildren(el: ts.JsxElement, varName: string, accessor: string): string | null {
      const flatChildren = flattenChildren(el.children)
      const { useMixed, useMultiExpr } = analyzeChildren(flatChildren)
      const parentRef = accessor === '__root' ? '__root' : varName

      let html = ''
      let childNodeIdx = 0

      for (const child of flatChildren) {
        const childHtml = processOneChild(
          child,
          varName,
          parentRef,
          useMixed,
          useMultiExpr,
          childNodeIdx,
        )
        if (childHtml === null) return null
        html += childHtml
        childNodeIdx++
      }

      return html
    }

    /** Process a single DOM element for template emission. Returns the HTML string or null. */
    function processElement(
      el: ts.JsxElement | ts.JsxSelfClosingElement,
      accessor: string,
    ): string | null {
      const tag = jsxTagName(el)
      if (!tag) return null

      const varName = resolveElementVar(accessor, elementHasDynamic(el))
      const htmlAttrs = processAttrs(el, varName)
      let html = `<${tag}${htmlAttrs}>`

      if (ts.isJsxElement(el)) {
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

    // Build bind function body
    const escaped = html.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

    // Emit combined _bind for reactive attribute/text expressions that
    // weren't handled by _bindText. This merges N separate _bind calls into
    // one — saving N-1 closures + deps arrays per template instance.
    // Emit a single combined _bind for all reactive attribute/text expressions
    // that weren't handled by _bindText. Merges N separate _bind calls into one —
    // saving N-1 closures + deps arrays per template instance.
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

  /** Flat child descriptor for template children processing */
  type FlatChild =
    | { kind: 'text'; text: string }
    | { kind: 'element'; node: ts.JsxElement | ts.JsxSelfClosingElement; elemIdx: number }
    | { kind: 'expression'; expression: ts.Expression }

  /** Classify a single JSX child into a FlatChild descriptor. */
  function classifyJsxChild(
    child: ts.JsxChild,
    out: FlatChild[],
    elemIdxRef: { value: number },
    recurse: (kids: ts.NodeArray<ts.JsxChild>) => void,
  ): void {
    if (ts.isJsxText(child)) {
      const trimmed = child.text.replace(/\n\s*/g, '').trim()
      if (trimmed) out.push({ kind: 'text', text: trimmed })
      return
    }
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      out.push({ kind: 'element', node: child, elemIdx: elemIdxRef.value++ })
      return
    }
    if (ts.isJsxExpression(child)) {
      if (child.expression) out.push({ kind: 'expression', expression: child.expression })
      return
    }
    if (ts.isJsxFragment(child)) recurse(child.children)
  }

  /**
   * Flatten JSX children, inlining fragment children and stripping whitespace-only text.
   * Returns a flat array of child descriptors with element indices pre-computed.
   */
  function flattenChildren(children: ts.NodeArray<ts.JsxChild>): FlatChild[] {
    const flatList: FlatChild[] = []
    const elemIdxRef = { value: 0 }

    function addChildren(kids: ts.NodeArray<ts.JsxChild>): void {
      for (const child of kids) classifyJsxChild(child, flatList, elemIdxRef, addChildren)
    }

    addChildren(children)
    return flatList
  }

  /** Analyze flat children to determine indexing strategy. */
  function analyzeChildren(flatChildren: FlatChild[]): {
    useMixed: boolean
    useMultiExpr: boolean
  } {
    const hasElem = flatChildren.some((c) => c.kind === 'element')
    const hasNonElem = flatChildren.some((c) => c.kind !== 'element')
    const exprCount = flatChildren.filter((c) => c.kind === 'expression').length
    return { useMixed: hasElem && hasNonElem, useMultiExpr: exprCount > 1 }
  }

  /** Check if a single attribute is dynamic (has ref, event, or non-static expression). */
  function attrIsDynamic(attr: ts.JsxAttributeLike): boolean {
    if (!ts.isJsxAttribute(attr)) return false
    const name = ts.isIdentifier(attr.name) ? attr.name.text : ''
    if (name === 'ref') return true
    if (EVENT_RE.test(name)) return true
    if (!attr.initializer || !ts.isJsxExpression(attr.initializer)) return false
    const expr = attr.initializer.expression
    return expr ? !isStatic(expr) : false
  }

  /** Check if an element has any dynamic attributes, events, ref, or expression children */
  function elementHasDynamic(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
    if (jsxAttrs(node).some(attrIsDynamic)) return true
    if (ts.isJsxElement(node)) {
      return node.children.some((c) => ts.isJsxExpression(c) && c.expression !== undefined)
    }
    return false
  }

  /** Slice expression source from the original code.
   *  Resolves any prop-derived identifiers found anywhere in the expression
   *  via AST transformation — handles template literals, ternaries, etc. */
  function sliceExpr(expr: ts.Expression): string {
    // Quick check: does this expression contain any prop-derived references?
    if (propDerivedVars.size > 0 && accessesProps(expr)) {
      const resolved = resolveExprTransitive(expr)
      return printer.printNode(ts.EmitHint.Expression, resolved, sf)
    }
    return code.slice(expr.getStart(sf), expr.getEnd())
  }

  /** Get tag name string */
  function jsxTagName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
    const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName
    return ts.isIdentifier(tag) ? tag.text : ''
  }

  /** Get attribute list */
  function jsxAttrs(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
  ): ts.NodeArray<ts.JsxAttributeLike> {
    return ts.isJsxElement(node)
      ? node.openingElement.attributes.properties
      : node.attributes.properties
  }
}

// ─── Template constants ──────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const JSX_TO_HTML_ATTR: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
}

function isLowerCase(s: string): boolean {
  return s.length > 0 && s[0] === s[0]?.toLowerCase()
}

/** Check if an expression subtree contains JSX nodes */
function containsJSXInExpr(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
    return true
  return ts.forEachChild(node, containsJSXInExpr) ?? false
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

// ─── Static JSX analysis ──────────────────────────────────────────────────────

type StaticJSXNode = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment

function isStaticJSXNode(node: StaticJSXNode): boolean {
  if (ts.isJsxSelfClosingElement(node)) {
    return isStaticAttrs(node.attributes)
  }
  if (ts.isJsxFragment(node)) {
    return node.children.every(isStaticChild)
  }
  // JsxElement
  return isStaticAttrs(node.openingElement.attributes) && node.children.every(isStaticChild)
}

function isStaticAttrs(attrs: ts.JsxAttributes): boolean {
  return attrs.properties.every((prop) => {
    // Spread attribute — always dynamic
    if (!ts.isJsxAttribute(prop)) return false
    // Boolean shorthand: <input disabled />
    if (!prop.initializer) return true
    // String literal: class="foo"
    if (ts.isStringLiteral(prop.initializer)) return true
    // Must be JsxExpression — the only remaining JsxAttributeValue type
    const expr = (prop.initializer as ts.JsxExpression).expression
    return expr ? isStatic(expr) : true
  })
}

function isStaticChild(child: ts.JsxChild): boolean {
  // Plain text content
  if (ts.isJsxText(child)) return true
  // Nested JSX elements
  if (ts.isJsxSelfClosingElement(child)) return isStaticJSXNode(child)
  if (ts.isJsxElement(child)) return isStaticJSXNode(child)
  if (ts.isJsxFragment(child)) return isStaticJSXNode(child)
  // Must be JsxExpression — the only remaining JsxChild type
  const expr = (child as ts.JsxExpression).expression
  return expr ? isStatic(expr) : true
}

// ─── General helpers ──────────────────────────────────────────────────────────

function isStatic(node: ts.Expression): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword
  )
  // Note: object/array literals are NOT static — they need runtime application
  // (e.g., style={{ color: "red" }} requires Object.assign at runtime).
}

/** Known pure global functions that don't read signals. */
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

/** Check if a call expression calls a known pure function with static args. */
function isPureStaticCall(node: ts.CallExpression): boolean {
  const callee = node.expression
  let name = ''

  if (ts.isIdentifier(callee)) {
    name = callee.text
  } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    name = `${callee.expression.text}.${callee.name.text}`
  }

  if (!PURE_CALLS.has(name)) return false
  // Pure call with all static arguments → result is static
  return node.arguments.every((arg) => !ts.isSpreadElement(arg) && isStatic(arg))
}

function containsCall(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) {
    // Skip pure calls with static args
    if (isPureStaticCall(node as ts.CallExpression)) return false
    return true
  }
  if (ts.isTaggedTemplateExpression(node)) return true
  // Don't recurse into nested functions — they're self-contained
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false
  return ts.forEachChild(node, containsCall) ?? false
}
