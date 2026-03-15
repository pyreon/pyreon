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

import ts from "typescript"

export interface CompilerWarning {
  /** Warning message */
  message: string
  /** Source file line number (1-based) */
  line: number
  /** Source file column number (0-based) */
  column: number
  /** Warning code for filtering */
  code: "signal-call-in-jsx" | "missing-key-on-for" | "signal-in-static-prop"
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
const SKIP_PROPS = new Set(["key", "ref"])
// Event handler pattern: onClick, onInput, onMouseEnter, …
const EVENT_RE = /^on[A-Z]/

export function transformJSX(code: string, filename = "input.tsx"): TransformResult {
  const scriptKind =
    filename.endsWith(".tsx") || filename.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TSX // default to TSX so JSX is always parsed

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

  function warn(node: ts.Node, message: string, warnCode: CompilerWarning["code"]): void {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    warnings.push({ message, line: line + 1, column: character, code: warnCode })
  }

  // ── Static hoisting state ─────────────────────────────────────────────────
  type Hoist = { name: string; text: string }
  const hoists: Hoist[] = []
  let hoistIdx = 0
  let needsTplImport = false

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
    replacements.push({ start, end, text: `() => ${code.slice(start, end)}` })
  }

  function walk(node: ts.Node): void {
    // ── Template emission ──────────────────────────────────────────────────────
    // Try to convert JSX element trees (≥ 1 DOM elements) to _tpl() calls.
    // Must be checked before attribute/expression handling to avoid double-processing.
    if (ts.isJsxElement(node)) {
      const elemCount = templateElementCount(node)
      if (elemCount >= 1) {
        const tplCall = buildTemplateCall(node)
        if (tplCall) {
          const start = node.getStart(sf)
          const end = node.getEnd()
          // If child of another JSX element/fragment, wrap in expression container
          const parent = node.parent
          const needsBraces = parent && (ts.isJsxElement(parent) || ts.isJsxFragment(parent))
          replacements.push({
            start,
            end,
            text: needsBraces ? `{${tplCall}}` : tplCall,
          })
          needsTplImport = true
          return // skip children — template handles everything
        }
      }
    }

    // ── Warnings for common mistakes ────────────────────────────────────────────
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const tagName = ts.isIdentifier(opening.tagName) ? opening.tagName.text : ""

      // Warn: <For each={...}> without a by prop
      if (tagName === "For") {
        const hasBy = opening.attributes.properties.some(
          (p) => ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "by",
        )
        if (!hasBy) {
          warn(
            opening.tagName,
            `<For> without a "by" prop will use index-based diffing, which is slower and may cause bugs with stateful children. Add by={(item) => item.id} for efficient keyed reconciliation.`,
            "missing-key-on-for",
          )
        }
      }
    }

    // ── JSX attribute ──────────────────────────────────────────────────────────
    if (ts.isJsxAttribute(node)) {
      const name = ts.isIdentifier(node.name) ? node.name.text : ""

      // Component elements (uppercase tag) receive plain values — don't wrap their props.
      // DOM elements (lowercase tag) use applyProps which expects reactive functions.
      // AST: JsxAttribute → JsxAttributes → JsxOpeningElement | JsxSelfClosingElement
      const openingEl = node.parent.parent as ts.JsxOpeningElement | ts.JsxSelfClosingElement
      const tagName = ts.isIdentifier(openingEl.tagName) ? openingEl.tagName.text : ""
      const isComponentElement =
        tagName.length > 0 && tagName.charAt(0) !== tagName.charAt(0).toLowerCase()

      if (
        !isComponentElement &&
        !SKIP_PROPS.has(name) &&
        !EVENT_RE.test(name) &&
        node.initializer &&
        ts.isJsxExpression(node.initializer)
      ) {
        const expr = node.initializer.expression
        if (expr) {
          // Try to hoist static JSX attribute values
          const hoistName = maybeHoist(expr)
          if (hoistName) {
            replacements.push({ start: expr.getStart(sf), end: expr.getEnd(), text: hoistName })
          } else if (shouldWrap(expr)) {
            wrap(expr)
          }
        }
      }

      // Do NOT recurse deeper — the value is fully handled above.
      return
    }

    // ── JSX expression in child position ───────────────────────────────────────
    // At this point we know it's NOT inside a JsxAttribute (those return early).
    if (ts.isJsxExpression(node)) {
      const expr = node.expression
      if (expr) {
        // Try to hoist static JSX children (e.g. {<span>Hello</span>} → {_$h0})
        const hoistName = maybeHoist(expr)
        if (hoistName) {
          replacements.push({ start: expr.getStart(sf), end: expr.getEnd(), text: hoistName })
        } else if (shouldWrap(expr)) {
          wrap(expr)
        }
      }

      // Do NOT recurse into the expression — see "Known limitation" above.
      return
    }

    ts.forEachChild(node, walk)
  }

  walk(sf)

  if (replacements.length === 0 && hoists.length === 0) return { code, warnings }

  // Apply replacements from right to left so earlier positions stay valid
  replacements.sort((a, b) => b.start - a.start)

  let result = code
  for (const r of replacements) {
    result = result.slice(0, r.start) + r.text + result.slice(r.end)
  }

  // Prepend module-scope hoisted static VNode declarations
  if (hoists.length > 0) {
    const preamble = hoists.map((h) => `const ${h.name} = /*@__PURE__*/ ${h.text}\n`).join("")
    result = preamble + result
  }

  // Prepend template imports if _tpl() was emitted
  if (needsTplImport) {
    result =
      `import { _tpl } from "@pyreon/runtime-dom";\nimport { _bind } from "@pyreon/reactivity";\n` +
      result
  }

  return { code: result, usesTemplates: needsTplImport, warnings }

  // ── Template emission helpers (closures over sf, code) ──────────────────────

  /**
   * Count DOM elements in a JSX subtree. Returns -1 if the tree is not
   * eligible for template emission (contains components, spread attrs,
   * fragments, or unsupported child patterns).
   */
  function templateElementCount(node: ts.JsxElement | ts.JsxSelfClosingElement): number {
    const tag = jsxTagName(node)
    if (!tag || !isLowerCase(tag)) return -1

    // Bail on spread attributes or key prop
    const attrs = jsxAttrs(node)
    for (const attr of attrs) {
      if (ts.isJsxSpreadAttribute(attr)) return -1
      if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === "key")
        return -1
    }

    let count = 1

    if (ts.isJsxElement(node)) {
      for (const child of node.children) {
        if (ts.isJsxText(child)) continue

        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
          const childCount = templateElementCount(child)
          if (childCount === -1) return -1
          count += childCount
          continue
        }

        if (ts.isJsxExpression(child)) {
          if (!child.expression) continue // empty expression (comment)
          // Expression containing nested JSX → bail (too complex)
          if (containsJSXInExpr(child.expression)) return -1
          continue
        }

        if (ts.isJsxFragment(child)) {
          // Inline fragment children if all are template-eligible
          const fragCount = templateFragmentCount(child)
          if (fragCount === -1) return -1
          count += fragCount
          continue
        }

        // Unknown → bail
        return -1
      }
    }

    return count
  }

  /**
   * Count template-eligible elements inside a fragment.
   * Returns -1 if any child is not template-eligible.
   */
  function templateFragmentCount(frag: ts.JsxFragment): number {
    let count = 0
    for (const child of frag.children) {
      if (ts.isJsxText(child)) continue

      if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
        const childCount = templateElementCount(child)
        if (childCount === -1) return -1
        count += childCount
        continue
      }

      if (ts.isJsxExpression(child)) {
        if (!child.expression) continue
        if (containsJSXInExpr(child.expression)) return -1
        continue
      }

      if (ts.isJsxFragment(child)) {
        const fragCount = templateFragmentCount(child)
        if (fragCount === -1) return -1
        count += fragCount
        continue
      }

      return -1
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

    function nextVar(): string {
      return `__e${varIdx++}`
    }
    function nextDisp(): string {
      const name = `__d${dispIdx++}`
      disposerNames.push(name)
      return name
    }

    /** Process attributes on an element, returning the HTML attribute string. */
    function processAttrs(el: ts.JsxElement | ts.JsxSelfClosingElement, varName: string): string {
      let htmlAttrs = ""
      const attrs = jsxAttrs(el)

      for (const attr of attrs) {
        if (!ts.isJsxAttribute(attr)) continue
        const attrName = ts.isIdentifier(attr.name) ? attr.name.text : ""
        if (attrName === "key") continue

        const htmlAttrName = JSX_TO_HTML_ATTR[attrName] ?? attrName

        if (attrName === "ref") {
          emitRef(attr, varName)
          continue
        }

        if (EVENT_RE.test(attrName)) {
          emitEventListener(attr, attrName, varName)
          continue
        }

        if (!attr.initializer) {
          htmlAttrs += ` ${htmlAttrName}`
          continue
        }

        if (ts.isStringLiteral(attr.initializer)) {
          htmlAttrs += ` ${htmlAttrName}="${escapeHtmlAttr(attr.initializer.text)}"`
          continue
        }

        if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          htmlAttrs += emitAttrExpression(attr.initializer.expression, htmlAttrName, varName)
        }
      }

      return htmlAttrs
    }

    /** Emit bind line for a ref attribute. */
    function emitRef(attr: ts.JsxAttribute, varName: string): void {
      if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        bindLines.push(`${sliceExpr(attr.initializer.expression)}.current = ${varName}`)
      }
    }

    /** Emit addEventListener bind line for an event handler attribute. */
    function emitEventListener(attr: ts.JsxAttribute, attrName: string, varName: string): void {
      const eventName = (attrName[2] ?? "").toLowerCase() + attrName.slice(3)
      if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        bindLines.push(
          `${varName}.addEventListener("${eventName}", ${sliceExpr(attr.initializer.expression)})`,
        )
      }
    }

    /** Emit bind line or HTML for an expression attribute value. Returns HTML to append. */
    function emitAttrExpression(
      exprNode: ts.Expression,
      htmlAttrName: string,
      varName: string,
    ): string {
      const expr = sliceExpr(exprNode)

      // Static literal → bake into HTML
      if (isStatic(exprNode)) {
        if (ts.isStringLiteral(exprNode))
          return ` ${htmlAttrName}="${escapeHtmlAttr(exprNode.text)}"`
        if (ts.isNumericLiteral(exprNode)) return ` ${htmlAttrName}="${exprNode.text}"`
        if (exprNode.kind === ts.SyntaxKind.TrueKeyword) return ` ${htmlAttrName}`
        return "" // false/null/undefined → omit
      }

      // Reactive (contains calls) → _bind
      if (containsCall(exprNode)) {
        const d = nextDisp()
        if (htmlAttrName === "class") {
          bindLines.push(`const ${d} = _bind(() => { ${varName}.className = ${expr} })`)
        } else {
          bindLines.push(
            `const ${d} = _bind(() => { ${varName}.setAttribute("${htmlAttrName}", ${expr}) })`,
          )
        }
      } else {
        // One-time set (no calls = not reactive)
        if (htmlAttrName === "class") {
          bindLines.push(`${varName}.className = ${expr}`)
        } else {
          bindLines.push(`${varName}.setAttribute("${htmlAttrName}", ${expr})`)
        }
      }

      return ""
    }

    /** Analyze flat children to determine indexing strategy. */
    function analyzeChildren(flatChildren: FlatChild[]): {
      useMixed: boolean
      useMultiExpr: boolean
    } {
      let hasElemChild = false
      let hasNonElemChild = false
      let exprCount = 0
      for (const child of flatChildren) {
        if (child.kind === "element") hasElemChild = true
        if (child.kind === "expression") {
          hasNonElemChild = true
          exprCount++
        }
        if (child.kind === "text") hasNonElemChild = true
      }
      return {
        useMixed: hasElemChild && hasNonElemChild,
        useMultiExpr: exprCount > 1,
      }
    }

    /** Emit bind lines for a reactive text expression child. */
    function emitReactiveTextChild(
      expr: string,
      varName: string,
      parentRef: string,
      childNodeIdx: number,
      needsPlaceholder: boolean,
    ): string {
      const tVar = `__t${varIdx++}`
      const d = nextDisp()
      bindLines.push(`const ${tVar} = document.createTextNode("")`)
      if (needsPlaceholder) {
        bindLines.push(
          `${parentRef}.replaceChild(${tVar}, ${parentRef}.childNodes[${childNodeIdx}])`,
        )
      } else {
        bindLines.push(`${varName}.appendChild(${tVar})`)
      }
      bindLines.push(`const ${d} = _bind(() => { ${tVar}.data = ${expr} })`)
      return needsPlaceholder ? "<!>" : ""
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
        const tVar = `__t${varIdx++}`
        bindLines.push(`const ${tVar} = document.createTextNode(${expr})`)
        bindLines.push(
          `${parentRef}.replaceChild(${tVar}, ${parentRef}.childNodes[${childNodeIdx}])`,
        )
        return "<!>"
      }
      bindLines.push(`${varName}.textContent = ${expr}`)
      return ""
    }

    /** Process children of a JsxElement, returning the children HTML. */
    function processChildren(el: ts.JsxElement, varName: string, accessor: string): string | null {
      const flatChildren = flattenChildren(el.children)
      const { useMixed, useMultiExpr } = analyzeChildren(flatChildren)
      const parentRef = accessor === "__root" ? "__root" : varName

      let html = ""
      let childNodeIdx = 0

      for (const child of flatChildren) {
        if (child.kind === "text") {
          html += escapeHtmlText(child.text)
          childNodeIdx++
          continue
        }

        if (child.kind === "element") {
          const childAccessor = useMixed
            ? `${parentRef}.childNodes[${childNodeIdx}]`
            : `${parentRef}.children[${child.elemIdx}]`
          const childHtml = processElement(child.node, childAccessor)
          if (childHtml === null) return null
          html += childHtml
          childNodeIdx++
          continue
        }

        if (child.kind === "expression") {
          const expr = sliceExpr(child.expression)
          const needsPlaceholder = useMixed || useMultiExpr
          if (containsCall(child.expression)) {
            html += emitReactiveTextChild(expr, varName, parentRef, childNodeIdx, needsPlaceholder)
          } else {
            html += emitStaticTextChild(expr, varName, parentRef, childNodeIdx, needsPlaceholder)
          }
          childNodeIdx++
        }
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

      // Assign a variable if this element has dynamic parts
      const hasDynamic = elementHasDynamic(el)
      let varName: string
      if (accessor === "__root") {
        varName = "__root"
      } else if (hasDynamic) {
        varName = nextVar()
        bindLines.push(`const ${varName} = ${accessor}`)
      } else {
        varName = accessor
      }

      const htmlAttrs = processAttrs(el, varName)
      let html = `<${tag}${htmlAttrs}>`

      if (ts.isJsxElement(el)) {
        const childHtml = processChildren(el, varName, accessor)
        if (childHtml === null) return null
        html += childHtml
      }

      if (!VOID_ELEMENTS.has(tag)) {
        html += `</${tag}>`
      }

      return html
    }

    const html = processElement(node, "__root")
    if (html === null) return null

    // Build bind function body
    const escaped = html.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

    if (bindLines.length === 0 && disposerNames.length === 0) {
      return `_tpl("${escaped}", () => null)`
    }

    let body = bindLines.map((l) => `  ${l}`).join("\n")
    if (disposerNames.length > 0) {
      body += `\n  return () => { ${disposerNames.map((d) => `${d}()`).join("; ")} }`
    } else {
      body += "\n  return null"
    }

    return `_tpl("${escaped}", (__root) => {\n${body}\n})`
  }

  /** Flat child descriptor for template children processing */
  type FlatChild =
    | { kind: "text"; text: string }
    | { kind: "element"; node: ts.JsxElement | ts.JsxSelfClosingElement; elemIdx: number }
    | { kind: "expression"; expression: ts.Expression }

  /**
   * Flatten JSX children, inlining fragment children and stripping whitespace-only text.
   * Returns a flat array of child descriptors with element indices pre-computed.
   */
  function flattenChildren(children: ts.NodeArray<ts.JsxChild>): FlatChild[] {
    const result: FlatChild[] = []
    let elemIdx = 0

    function addChildren(kids: ts.NodeArray<ts.JsxChild>): void {
      for (const child of kids) {
        if (ts.isJsxText(child)) {
          const trimmed = child.text.replace(/\n\s*/g, "").trim()
          if (trimmed) result.push({ kind: "text", text: trimmed })
          continue
        }

        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
          result.push({ kind: "element", node: child, elemIdx })
          elemIdx++
          continue
        }

        if (ts.isJsxExpression(child)) {
          if (!child.expression) continue // empty expression (comment)
          result.push({ kind: "expression", expression: child.expression })
          continue
        }

        if (ts.isJsxFragment(child)) {
          // Inline fragment children as if they were direct children
          addChildren(child.children)
        }
      }
    }

    addChildren(children)
    return result
  }

  /** Check if an element has any dynamic attributes, events, ref, or expression children */
  function elementHasDynamic(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
    const attrs = jsxAttrs(node)
    for (const attr of attrs) {
      if (!ts.isJsxAttribute(attr)) continue
      const name = ts.isIdentifier(attr.name) ? attr.name.text : ""
      if (name === "ref") return true
      if (EVENT_RE.test(name)) return true
      if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        if (!isStatic(attr.initializer.expression)) return true
      }
    }
    if (ts.isJsxElement(node)) {
      for (const child of node.children) {
        if (ts.isJsxExpression(child) && child.expression) return true
      }
    }
    return false
  }

  /** Slice expression source from the original code */
  function sliceExpr(expr: ts.Expression): string {
    return code.slice(expr.getStart(sf), expr.getEnd())
  }

  /** Get tag name string */
  function jsxTagName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
    const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName
    return ts.isIdentifier(tag) ? tag.text : ""
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
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

const JSX_TO_HTML_ATTR: Record<string, string> = {
  className: "class",
  htmlFor: "for",
}

function isLowerCase(s: string): boolean {
  return s.length > 0 && s[0] === s[0]!.toLowerCase()
}

/** Check if an expression subtree contains JSX nodes */
function containsJSXInExpr(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
    return true
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false
  return ts.forEachChild(node, containsJSXInExpr) ?? false
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
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
}

function shouldWrap(node: ts.Expression): boolean {
  // Already a function — user explicitly wrapped or it's a callback
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false
  // Static literal — no signals involved
  if (isStatic(node)) return false
  // Only wrap if the expression tree contains a call — signal reads are always
  // function calls (e.g. `count()`, `name()`). Plain identifiers, object literals
  // like `style={{ color: "red" }}`, array literals, and member accesses are
  // left as-is to avoid unnecessary reactive wrappers.
  return containsCall(node)
}

function containsCall(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) return true
  if (ts.isTaggedTemplateExpression(node)) return true
  // Don't recurse into nested functions — they're self-contained
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return false
  return ts.forEachChild(node, containsCall) ?? false
}
