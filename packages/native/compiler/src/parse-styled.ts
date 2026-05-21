// `styled()` template-literal source → StyleIR parser.
//
// Second of the three compiler-input parsers (after `parseTheme`).
// The emit-style side (`emit-style.ts` → ViewModifier / Modifier)
// was written first; this is the input side.
//
// Recognises the canonical `@pyreon/styler` shape:
//
//   const Card = styled('div')\`
//     background: red;
//     padding: 16px;
//     border-radius: 8px;
//   \`
//
// Produces a StyleIR carrying the static CSS declarations + warnings
// for everything we can't compile-resolve. Per the PMTC plan §"Same
// styles": the IR captures declarative shape; per-target emitters
// (`emit-style.ts`) render it idiomatically.
//
// ## Supported shape
//
// - **Variable declaration**: `const X = styled('tag')\`...\`` →
//   StyleIR with name=X, properties from the CSS body.
// - **Tag forms**:
//   * `styled('div')` — string literal tag
//   * `styled(Component)` — identifier (warns; we don't follow it)
//   * `styled('div', { ... })` — second-arg options ignored
//   * `styled('div').attrs(...)` etc. — chain head must be styled()
// - **Generic type params**: `styled('div')<Props>\`...\`` — TS-only,
//   the parser skips TSInstantiationExpression layers transparently.
//
// ## CSS declaration parsing
//
// Static `property: value;` pairs become StyleProperty entries.
// Interpolations:
//
//   * `${(p) => p.theme.color.primary}` — recognised as a TOKEN REF
//     when the arrow-body is a member chain rooted on `<param>.theme`.
//     Emits as `{ kind: 'token', group: 'color', entry: 'primary' }`.
//     Two-level only (`p.theme.X.Y`); deeper chains warn + skip.
//   * Any other interpolation → warn + skip the declaration.
//
// Phase 1 scope: static props + theme-token interpolations cover the
// load-bearing styler patterns. The full property-function shape
// (`${(p) => p.disabled ? 'gray' : 'red'}`) is deferred — handling
// ternaries is itself a Phase-2-shaped feature.

import { parseSync, type ParseResult } from 'oxc-parser'
import type { StyleIR, StyleProperty, StyleValue } from './emit-style'

export interface ParseStyledResult {
  /** Successfully-parsed styled() declarations, ready for emit. */
  styles: StyleIR[]
  /** Non-fatal notes (unrecognised interpolations, skipped chains). */
  warnings: string[]
}

/**
 * Parse a TypeScript source containing `styled()` declarations and
 * produce a `StyleIR` per declaration. Each top-level
 * `(export) const X = styled('tag')\`...\`` becomes one StyleIR entry.
 *
 * Throws on parse error; collects warnings for emit-side decisions
 * (unrecognised interpolation kinds, unsupported tag forms).
 */
export function parseStyled(source: string, filename = 'styled.tsx'): ParseStyledResult {
  const parsed: ParseResult = parseSync(filename, source)
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]
    throw new Error(
      `[parse-styled] failed to parse ${filename}: ${first?.message ?? 'unknown parse error'}`,
    )
  }
  const styles: StyleIR[] = []
  const warnings: string[] = []
  walkProgram(parsed.program as AnyNode, styles, warnings)
  return { styles, warnings }
}

// ─── Internal helpers ────────────────────────────────────────────────

// oxc-parser's typed AST is rich; matching the convention in `parse.ts`
// we walk it loosely via `any` to keep the parser readable. The
// alternative — pinning to `{ type: string; [k: string]: unknown }` —
// makes the oxc `Program` type fail to assign here (TS2352), which is
// noise for an internal-only IR walker. The tradeoff is intentional.
//
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

function walkProgram(program: AnyNode, styles: StyleIR[], warnings: string[]): void {
  const body = (program as { body?: AnyNode[] }).body ?? []
  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration') {
      collectDeclarations(stmt, styles, warnings)
    } else if (stmt.type === 'ExportNamedDeclaration') {
      const decl = (stmt as { declaration?: AnyNode }).declaration
      if (decl?.type === 'VariableDeclaration') {
        collectDeclarations(decl, styles, warnings)
      }
    }
  }
}

function collectDeclarations(
  varDecl: AnyNode,
  styles: StyleIR[],
  warnings: string[],
): void {
  const decls = (varDecl as { declarations?: AnyNode[] }).declarations ?? []
  for (const d of decls) {
    const id = (d as { id?: AnyNode }).id
    const init = unwrapTSLayers((d as { init?: AnyNode }).init)
    if (!id || id.type !== 'Identifier') continue
    const name = (id as { name?: string }).name
    if (!name) continue
    if (!init || init.type !== 'TaggedTemplateExpression') continue
    const styled = parseStyledTag((init as { tag?: AnyNode }).tag, warnings)
    if (!styled) continue
    const quasi = (init as { quasi?: AnyNode }).quasi
    if (!quasi || quasi.type !== 'TemplateLiteral') continue
    const properties = parseCssTemplate(quasi, name, warnings)
    styles.push({ name, properties })
  }
}

/**
 * Validate a tagged-template's tag is a `styled(...)` call. Returns
 * the tag-string ('div', 'header', etc.) for warnings; the StyleIR
 * doesn't currently carry the HTML tag (the per-target emit picks
 * the SwiftUI / Compose primitive separately), so the tag is only
 * used for diagnostics.
 */
function parseStyledTag(tagNode: AnyNode | undefined, warnings: string[]): string | null {
  if (!tagNode) return null
  const expr = unwrapTSLayers(tagNode)
  if (!expr || expr.type !== 'CallExpression') return null
  const callee = (expr as { callee?: AnyNode }).callee
  // Bare `styled(...)`.
  if (callee?.type === 'Identifier' && (callee as { name?: string }).name === 'styled') {
    return readTagArg((expr as { arguments?: AnyNode[] }).arguments, warnings)
  }
  // Chain like `styled.div\`...\`` — `styled.div` is a MemberExpression
  // not a call expression. Not used by the canonical @pyreon/styler
  // examples but worth a TODO when the chained form gets supported.
  return null
}

function readTagArg(args: AnyNode[] | undefined, warnings: string[]): string | null {
  if (!args || args.length === 0) return null
  const first = unwrapTSLayers(args[0])
  if (!first) return null
  if (first.type === 'Literal') {
    const v = (first as { value?: unknown }).value
    if (typeof v === 'string') return v
  }
  if (first.type === 'Identifier') {
    warnings.push(
      `[parse-styled] styled(<identifier>) recognised but inner-component is opaque — ` +
        `the IR captures only the tagged-template body`,
    )
    return 'Component'
  }
  return null
}

/**
 * Split a CSS template literal body into property/value pairs. The
 * body comes from oxc's TemplateLiteral with `quasis[]` (raw text
 * segments) interleaved with `expressions[]` (interpolations).
 *
 * The split-by-`;` strategy is intentionally simple — CSS rules
 * inside selectors (`:hover { ... }`) aren't supported in Phase 1.
 * The flat property-list pattern is what the canonical @pyreon/styler
 * usage produces.
 */
function parseCssTemplate(
  quasi: AnyNode,
  declName: string,
  warnings: string[],
): StyleProperty[] {
  const quasis = (quasi as { quasis?: AnyNode[] }).quasis ?? []
  const expressions = (quasi as { expressions?: AnyNode[] }).expressions ?? []

  // Re-interleave quasis + expressions to reconstruct the source. For
  // each segment we either know the static text (quasi) or carry a
  // marker for an expression at that position.
  type Part = { kind: 'text'; value: string } | { kind: 'expr'; node: AnyNode }
  const parts: Part[] = []
  for (let i = 0; i < quasis.length; i++) {
    const q = quasis[i]
    if (q) {
      const cooked = ((q as { value?: { cooked?: string; raw?: string } }).value?.cooked) ?? ''
      parts.push({ kind: 'text', value: cooked })
    }
    const e = expressions[i]
    if (e) parts.push({ kind: 'expr', node: e })
  }

  // Build a normalised representation: walk parts char-by-char,
  // splitting on `;`. Within each declaration, the position of the
  // FIRST `:` splits property name from value.
  type DeclPart = { kind: 'text'; value: string } | { kind: 'expr'; node: AnyNode }
  const declarations: DeclPart[][] = [[]]
  for (const p of parts) {
    if (p.kind === 'expr') {
      declarations[declarations.length - 1]!.push(p)
      continue
    }
    // Split text on `;`.
    let buf = ''
    for (const ch of p.value) {
      if (ch === ';') {
        if (buf.length > 0) declarations[declarations.length - 1]!.push({ kind: 'text', value: buf })
        declarations.push([])
        buf = ''
      } else {
        buf += ch
      }
    }
    if (buf.length > 0) declarations[declarations.length - 1]!.push({ kind: 'text', value: buf })
  }

  const properties: StyleProperty[] = []
  for (const decl of declarations) {
    const prop = parseSingleDecl(decl, declName, warnings)
    if (prop) properties.push(prop)
  }
  return properties
}

function parseSingleDecl(
  parts: ({ kind: 'text'; value: string } | { kind: 'expr'; node: AnyNode })[],
  declName: string,
  warnings: string[],
): StyleProperty | null {
  // Skip purely-empty declarations (trailing `;` or whitespace).
  const isEmpty = parts.every((p) => p.kind === 'text' && p.value.trim() === '')
  if (isEmpty) return null

  // Find the FIRST text-part containing `:` — that's the property/
  // value boundary. CSS property names don't contain `:` so this is
  // safe.
  let colonPartIndex = -1
  let colonOffset = -1
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    if (p.kind === 'text') {
      const idx = p.value.indexOf(':')
      if (idx !== -1) {
        colonPartIndex = i
        colonOffset = idx
        break
      }
    }
  }
  if (colonPartIndex === -1) {
    // No `:` found — likely a stray comment or whitespace.
    warnings.push(
      `[parse-styled] skipped declaration in '${declName}' — no '<prop>: <value>' split found`,
    )
    return null
  }

  // Property name = text before the colon in the colon-containing part.
  // Anything before that part is non-CSS noise we accumulate but most
  // commonly it's whitespace/newlines.
  const before = parts.slice(0, colonPartIndex)
  const colonPart = parts[colonPartIndex]! as { kind: 'text'; value: string }
  const nameRaw = before
    .map((p) => (p.kind === 'text' ? p.value : ''))
    .concat(colonPart.value.slice(0, colonOffset))
    .join('')
  const propName = nameRaw.trim()
  if (!propName || !/^[-a-zA-Z][-a-zA-Z0-9]*$/.test(propName)) {
    warnings.push(
      `[parse-styled] skipped declaration in '${declName}' — invalid property name '${propName}'`,
    )
    return null
  }

  // Value parts = colonPart's tail + everything after.
  const valueParts: typeof parts = []
  const tail = colonPart.value.slice(colonOffset + 1)
  if (tail.length > 0) valueParts.push({ kind: 'text', value: tail })
  for (let i = colonPartIndex + 1; i < parts.length; i++) {
    valueParts.push(parts[i]!)
  }

  return resolveValue(propName, valueParts, declName, warnings)
}

function resolveValue(
  propName: string,
  parts: ({ kind: 'text'; value: string } | { kind: 'expr'; node: AnyNode })[],
  declName: string,
  warnings: string[],
): StyleProperty | null {
  // Case A: all-static — concat text + emit string.
  const allStatic = parts.every((p) => p.kind === 'text')
  if (allStatic) {
    const text = parts.map((p) => (p.kind === 'text' ? p.value : '')).join('').trim()
    if (!text) return null
    const numeric = tryParseNumber(text)
    if (numeric !== null) return { name: propName, value: { kind: 'number', value: numeric } }
    return { name: propName, value: { kind: 'string', value: text } }
  }

  // Case B: a single expression with surrounding whitespace only —
  // try to recognise it as a token ref.
  const onlyExpr = parts.filter((p) => p.kind === 'expr')
  const onlyText = parts.filter((p) => p.kind === 'text')
  const textIsBlank = onlyText.every((p) => p.kind === 'text' && p.value.trim() === '')
  if (onlyExpr.length === 1 && textIsBlank) {
    const exprPart = onlyExpr[0]! as { kind: 'expr'; node: AnyNode }
    const tokenRef = recogniseTokenRef(exprPart.node)
    if (tokenRef) return { name: propName, value: tokenRef }
  }

  warnings.push(
    `[parse-styled] skipped '${declName}.${propName}' — unrecognised interpolation ` +
      `(only static text + simple theme.<group>.<entry> token refs are supported)`,
  )
  return null
}

/**
 * Recognise a token reference in an arrow-function interpolation:
 *
 *   ${(p) => p.theme.color.primary}    → { group: 'color', entry: 'primary' }
 *   ${(props) => props.theme.spacing.md} → { group: 'spacing', entry: 'md' }
 *
 * Deeper chains (`p.theme.color.system.light.base`) → null + warning
 * upstream. Not-arrow shapes → null.
 */
function recogniseTokenRef(node: AnyNode): StyleValue | null {
  if (node.type !== 'ArrowFunctionExpression') return null
  const params = (node as { params?: AnyNode[] }).params ?? []
  if (params.length === 0) return null
  const paramName = readSimpleParamName(params[0])
  if (!paramName) return null
  const body = unwrapTSLayers((node as { body?: AnyNode }).body)
  if (!body) return null
  // Body may be the expression directly (concise arrow) or a
  // BlockStatement with a single return. Handle both.
  let expr: AnyNode | undefined
  if (body.type === 'BlockStatement') {
    const blockBody = (body as { body?: AnyNode[] }).body ?? []
    if (blockBody.length !== 1) return null
    if (blockBody[0]?.type !== 'ReturnStatement') return null
    expr = unwrapTSLayers((blockBody[0] as { argument?: AnyNode }).argument)
  } else {
    expr = body
  }
  if (!expr) return null
  // Walk the member chain: <paramName>.theme.<group>.<entry>
  // Build chain bottom-up.
  const chain: string[] = []
  let cur: AnyNode | undefined = expr
  while (cur && cur.type === 'MemberExpression') {
    const prop = (cur as { property?: AnyNode }).property
    if (!prop || prop.type !== 'Identifier') return null
    chain.unshift((prop as { name?: string }).name ?? '')
    cur = unwrapTSLayers((cur as { object?: AnyNode }).object)
  }
  if (!cur || cur.type !== 'Identifier') return null
  const root = (cur as { name?: string }).name ?? ''
  if (root !== paramName) return null
  // Expect chain == ['theme', group, entry] OR allow optional chaining
  // via ChainExpression — for Phase 1 we accept the 3-element form.
  if (chain.length !== 3 || chain[0] !== 'theme') return null
  return { kind: 'token', group: chain[1]!, entry: chain[2]! }
}

function readSimpleParamName(node: AnyNode | undefined): string | null {
  if (!node) return null
  // `(p)` → Identifier directly.
  if (node.type === 'Identifier') return (node as { name?: string }).name ?? null
  // `(p: Props)` → AssignmentPattern / Identifier with typeAnnotation.
  // oxc emits the Identifier with typeAnnotation; the type doesn't
  // affect the runtime binding name.
  return null
}

function tryParseNumber(s: string): number | null {
  // Match plain integer / decimal (with optional sign). Reject if the
  // remainder has non-whitespace after the number (e.g. `16px`,
  // `100%`) — those are unit-bearing values, emit as string.
  const m = /^([+-]?\d+(?:\.\d+)?)\s*$/.exec(s)
  if (!m) return null
  return Number(m[1])
}

/**
 * Strip TypeScript-only AST layers that wrap an expression without
 * changing its runtime value. Same shape as parse-theme.ts.
 */
function unwrapTSLayers(node: AnyNode | undefined): AnyNode | undefined {
  if (!node) return node
  const TS_WRAPPERS = new Set([
    'TSAsExpression',
    'TSSatisfiesExpression',
    'TSTypeAssertion',
    'TSNonNullExpression',
    'TSInstantiationExpression',
    'ParenthesizedExpression',
  ])
  let cur = node
  for (let i = 0; i < 20; i++) {
    if (!TS_WRAPPERS.has(cur.type)) return cur
    const inner = (cur as { expression?: AnyNode }).expression
    if (!inner) return cur
    cur = inner
  }
  return cur
}
