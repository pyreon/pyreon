/**
 * JSX transform — wraps dynamic JSX expressions in `() =>` so the Nova runtime
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
 * Implementation: TypeScript parser for positions + magic-string replacements.
 * No extra runtime dependencies — `typescript` is already in devDependencies.
 *
 * Known limitation (v0): expressions inside *nested* JSX within a child
 * expression container are not individually wrapped. They are still reactive
 * because the outer wrapper re-evaluates the whole subtree, just at a coarser
 * granularity. Fine-grained nested wrapping is planned for a future pass.
 */

import ts from "typescript"

export interface TransformResult {
  /** Transformed source code (JSX preserved, only expression containers modified) */
  code: string
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

  // ── Static hoisting state ─────────────────────────────────────────────────
  type Hoist = { name: string; text: string }
  const hoists: Hoist[] = []
  let hoistIdx = 0

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
    // ── JSX attribute ──────────────────────────────────────────────────────────
    if (ts.isJsxAttribute(node)) {
      const name = ts.isIdentifier(node.name) ? node.name.text : ""

      // Component elements (uppercase tag) receive plain values — don't wrap their props.
      // DOM elements (lowercase tag) use applyProps which expects reactive functions.
      // AST: JsxAttribute → JsxAttributes → JsxOpeningElement | JsxSelfClosingElement
      const openingEl = node.parent.parent as ts.JsxOpeningElement | ts.JsxSelfClosingElement
      const tagName = ts.isIdentifier(openingEl.tagName) ? openingEl.tagName.text : ""
      const isComponentElement = tagName.length > 0 && tagName.charAt(0) !== tagName.charAt(0).toLowerCase()

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

  if (replacements.length === 0 && hoists.length === 0) return { code }

  // Apply replacements from right to left so earlier positions stay valid
  replacements.sort((a, b) => b.start - a.start)

  let result = code
  for (const r of replacements) {
    result = result.slice(0, r.start) + r.text + result.slice(r.end)
  }

  // Prepend module-scope hoisted static VNode declarations
  if (hoists.length > 0) {
    const preamble = hoists.map(h => `const ${h.name} = /*@__PURE__*/ ${h.text}\n`).join("")
    result = preamble + result
  }

  return { code: result }
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
  return attrs.properties.every(prop => {
    // Spread attribute — always dynamic
    if (!ts.isJsxAttribute(prop)) return false
    // Boolean shorthand: <input disabled />
    if (!prop.initializer) return true
    // String literal: class="foo"
    if (ts.isStringLiteral(prop.initializer)) return true
    // Expression: class={...}
    if (ts.isJsxExpression(prop.initializer)) {
      const expr = prop.initializer.expression
      return expr ? isStatic(expr) : true
    }
    return false
  })
}

function isStaticChild(child: ts.JsxChild): boolean {
  // Plain text content
  if (ts.isJsxText(child)) return true
  // Nested JSX elements
  if (ts.isJsxSelfClosingElement(child)) return isStaticJSXNode(child)
  if (ts.isJsxElement(child)) return isStaticJSXNode(child)
  if (ts.isJsxFragment(child)) return isStaticJSXNode(child)
  // Expression container: {expr}
  if (ts.isJsxExpression(child)) {
    const expr = child.expression
    return expr ? isStatic(expr) : true
  }
  return false
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
