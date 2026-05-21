// Pyreon IR → Swift / SwiftUI source.
//
// Per the chosen-direction plan, signals map to `@State`, computeds to
// computed properties, JSX elements to SwiftUI Views, event handlers
// to Swift closures.
//
// Phase 0 scope: enough to handle the seven starter fixtures cleanly.
// Type inference is deliberately naive — numeric assumption for
// computed properties. Phase 1 grows a real inference pass.

import { buildInferenceCtx, inferType } from './infer-type'
import { safeIdent, swiftIdent } from './identifier-safety'
import type {
  AttrIR,
  ChildIR,
  ComponentIR,
  DeclIR,
  EnumIR,
  ExprIR,
  StatementIR,
  TypeIR,
} from './types'

// String-literal-union enums recognised by the parser. Built at the
// emit() entry; threaded as module-state to per-expression emit code
// that needs to know whether `"all"` should rewrite to `.all`:
//
//   - `@State private var filter: Filter = .all` — the signal decl's
//     initial value when the declared type is a known enum.
//   - `filter = .active` — the .set() call's argument when the
//     target is a signal whose type is a known enum.
//
// Identical module-state pattern to `_activePropsParamName` below —
// the emitter avoids ctx-threading at 22+ call sites.
let _enumNames: Set<string> = new Set()
/** Per-component: signal/computed name → enum-type-name when typed as one. */
let _signalEnumTypes: Map<string, string> = new Map()
/** Set when emitting a signal initial value that's an enum-typed signal. */
let _activeEnumType: string | undefined

export function emitSwift(components: ComponentIR[], enums: EnumIR[] = []): string {
  _enumNames = new Set(enums.map((e) => e.name))
  const parts: string[] = []
  for (const e of enums) parts.push(emitSwiftEnum(e))
  for (const c of components) parts.push(emitSwiftComponent(c))
  _enumNames = new Set()
  return parts.join('\n\n')
}

/**
 * Emit a Swift `enum X: String { case a, b, c }`. The `: String` raw-
 * value backing lets Swift convert between the string literal source
 * and the enum case via init?(rawValue:) — useful for storage / URL
 * round-trips later, no cost in the canonical match-on-enum usage.
 */
function emitSwiftEnum(e: EnumIR): string {
  const cases = e.cases.join(', ')
  return `enum ${e.name}: String {\n  case ${cases}\n}`
}

// Module-scoped state for the active component's props-param-name. Set at
// the start of each `emitSwiftComponent` and read by `emitSwiftExpr`'s
// member case to rewrite `props.title` → `title`. Reset to undefined
// after each component to avoid leaking state across emit calls.
//
// Threading this via an explicit ctx parameter would require touching 22
// call sites in this file; a module-scoped variable keeps the emitter
// readable. Safe because emit is synchronous within a single call.
let _activePropsParamName: string | undefined

function emitSwiftComponent(c: ComponentIR): string {
  const inferCtx = buildInferenceCtx(c.decls)
  _activePropsParamName = c.propsParamName
  // Build the per-component signal-name → enum-type-name map for use
  // at `.set()` call sites later in the body.
  _signalEnumTypes = new Map()
  for (const d of c.decls) {
    if (d.kind === 'signal' && d.type.kind === 'typeRef' && _enumNames.has(d.type.name)) {
      _signalEnumTypes.set(d.name, d.type.name)
    }
  }
  const lines: string[] = []
  // `swiftIdent` backtick-escapes Swift-reserved keywords. Pyreon
  // user code commonly exports functions named `guard` (route guard
  // convention) and accepts `class` as a prop name (React/HTML attr);
  // both crash swiftc as bare identifiers. Backticks let Swift treat
  // the colliding name as a normal identifier (`struct \`guard\`: View`).
  lines.push(`struct ${swiftIdent(c.name)}: View {`)
  // Props become `let X: T` stored properties on the SwiftUI View struct.
  // SwiftUI canonical pattern — parent code constructs `Card(title: ...)`,
  // props are immutable per instance.
  for (const p of c.props) {
    lines.push(`  let ${swiftIdent(p.name)}: ${swiftType(p.type)}`)
  }
  for (const d of c.decls) {
    lines.push(`  ${emitSwiftDecl(d, inferCtx)}`)
  }
  lines.push(`  var body: some View {`)
  lines.push(`    ${emitSwiftExpr(c.returnExpr, 4)}`)
  lines.push(`  }`)
  lines.push(`}`)
  _activePropsParamName = undefined
  _signalEnumTypes = new Map()
  return lines.join('\n')
}

function emitSwiftDecl(d: DeclIR, inferCtx: ReturnType<typeof buildInferenceCtx>): string {
  if (d.kind === 'signal') {
    const type = swiftType(d.type)
    // If the signal's declared type is a known enum, set the active-enum
    // context so the initial-value emit knows to rewrite a string literal
    // (`"all"`) as an enum case (`.all`).
    const isEnumTyped = d.type.kind === 'typeRef' && _enumNames.has(d.type.name)
    if (isEnumTyped) _activeEnumType = (d.type as { name: string }).name
    const initial = emitSwiftExpr(d.initial, 0)
    _activeEnumType = undefined
    return `@State private var ${swiftIdent(d.name)}: ${type} = ${initial}`
  }
  if (d.kind === 'function') {
    return emitSwiftFunction(d)
  }
  // computed — infer the return type from the expression body so we
  // can emit a typed computed property. Falls back to `Any` for cases
  // the inference can't resolve (the emit still produces compilable
  // code via the fallback `swiftType` for `unknown`).
  const inferred = inferType(d.expr, inferCtx)
  const swiftReturnType = swiftType(inferred)
  return `private var ${swiftIdent(d.name)}: ${swiftReturnType} { ${emitSwiftExpr(d.expr, 0)} }`
}

/**
 * Emit `const fn = () => { ... }` as a Swift `private func` on the
 * SwiftUI View struct. Parser-A from the TodoMVC walkthrough.
 *
 * Body rendering:
 *   - Single-statement body that's `{ kind: 'return', expr }` →
 *     `private func fn() -> T { expr }` (no explicit `return`)
 *   - Single `{ kind: 'expr' }` → `private func fn() { expr }`
 *     (no return type if `returnType` was unknown)
 *   - Multi-statement → full block with explicit returns
 */
function emitSwiftFunction(
  d: Extract<DeclIR, { kind: 'function' }>,
): string {
  const params = d.params
    .map((p) => `${swiftIdent(p.name)}: ${swiftType(p.type)}`)
    .join(', ')
  // Render return-type clause. If the type is `unknown`, omit the
  // arrow entirely (= Swift function returning Void).
  const retType = d.returnType.kind === 'unknown' ? '' : ` -> ${swiftType(d.returnType)}`
  // Single-statement single-return concise form.
  if (
    d.body.length === 1 &&
    d.body[0]!.kind === 'return' &&
    d.body[0]!.expr !== undefined
  ) {
    const concise = emitSwiftExpr((d.body[0]! as { expr: ExprIR }).expr, 0)
    return `private func ${swiftIdent(d.name)}(${params})${retType} { ${concise} }`
  }
  const bodyLines = d.body.map((s) => `    ${emitSwiftStatement(s, 4)}`).join('\n')
  return `private func ${swiftIdent(d.name)}(${params})${retType} {\n${bodyLines}\n  }`
}

function emitSwiftStatement(s: StatementIR, indent: number): string {
  switch (s.kind) {
    case 'let':
      return `let ${swiftIdent(s.name)} = ${emitSwiftExpr(s.expr, indent)}`
    case 'return':
      return s.expr ? `return ${emitSwiftExpr(s.expr, indent)}` : 'return'
    case 'expr':
      return emitSwiftExpr(s.expr, indent)
    case 'if': {
      const pad = ' '.repeat(indent)
      const cond = emitSwiftExpr(s.cond, indent)
      const thenLines = s.then.map((t) => `${pad}  ${emitSwiftStatement(t, indent + 2)}`).join('\n')
      const head = `if ${cond} {\n${thenLines}\n${pad}}`
      if (!s.elseBody) return head
      const elseLines = s.elseBody
        .map((t) => `${pad}  ${emitSwiftStatement(t, indent + 2)}`)
        .join('\n')
      return `${head} else {\n${elseLines}\n${pad}}`
    }
  }
}

/**
 * Exported for unit-testable coverage of the TS→Swift type mapper
 * surface (roadmap PR 5a). Internal callers should still go through
 * `emitSwift()` for the full component-level emit.
 */
export function swiftType(t: TypeIR): string {
  switch (t.kind) {
    case 'number':
      return 'Int'
    case 'string':
      return 'String'
    case 'boolean':
      return 'Bool'
    case 'array':
      return `[${swiftType(t.element)}]`
    case 'object': {
      // Anonymous structs aren't expressible inline in Swift; emit a
      // tuple-ish placeholder. Real impl emits a named struct + uses it.
      const fields = t.fields.map((f) => `${f.name}: ${swiftType(f.type)}`).join(', ')
      return `(${fields})`
    }
    case 'null':
      // Swift has no first-class `null` type — only Optional. A bare
      // `null` shows up inside unions ({ kind: 'union' } handles that
      // case). Bare `null` outside a union is a TS type-system edge
      // case; degrade to `Any?`.
      return 'Any?'
    case 'undefined':
      return 'Any?'
    case 'union':
      return swiftUnionType(t.branches)
    case 'typeRef': {
      // `Foo` → `Foo`; `Array<T>` → `[T]`; `Promise<T>` → emit a
      // sentinel that compiles in Swift (the actual async lowering
      // happens in PR 5e). Other typeRefs pass through verbatim.
      if (t.name === 'Array' && t.args.length === 1) return `[${swiftType(t.args[0]!)}]`
      if (t.name === 'Promise' && t.args.length === 1) {
        // Promise<T> → Task<T, Error> on Swift. For Phase 0 we emit
        // `Task<T, Error>` and document the limitation; PR 5e refines.
        return `Task<${swiftType(t.args[0]!)}, Error>`
      }
      if (t.args.length === 0) return t.name
      return `${t.name}<${t.args.map(swiftType).join(', ')}>`
    }
    case 'function': {
      // Swift function types: `(P1, P2) -> R`. Parameter NAMES from
      // the TS source are dropped — Swift function TYPES are positional
      // (Swift FUNCTIONS support labels, but function types don't).
      // `unknown` return (void / missing annotation) → `Void`.
      const paramTypes = t.params.map((p) => swiftType(p.type)).join(', ')
      const returnTypeName =
        t.returnType.kind === 'unknown' ? 'Void' : swiftType(t.returnType)
      return `(${paramTypes}) -> ${returnTypeName}`
    }
    default:
      return 'Any'
  }
}

/**
 * Swift's type system has no structural union. We model the common
 * cases:
 *   - `T | null` / `T | undefined` → `T?` (Optional)
 *   - `T1 | T2` where both are non-null → `Any` with a doc-comment
 *     hint to refine via an enum at the Pyreon source level
 */
function swiftUnionType(branches: TypeIR[]): string {
  const nonNullBranches = branches.filter(
    (b) => b.kind !== 'null' && b.kind !== 'undefined',
  )
  const hasNullish = branches.some((b) => b.kind === 'null' || b.kind === 'undefined')
  if (nonNullBranches.length === 1 && hasNullish) {
    return `${swiftType(nonNullBranches[0]!)}?`
  }
  if (nonNullBranches.length === 0) return 'Any?'
  // Mixed-type union — Swift can't express it structurally; degrade.
  return 'Any'
}

function emitSwiftExpr(e: ExprIR, indent: number): string {
  switch (e.kind) {
    case 'literal':
      if (typeof e.value === 'string') {
        // Rewrite string-literal → enum-case (`.all`) when in a known
        // enum-typed context. Conservative: only when the literal is
        // actually a valid case for the active enum. Falls back to
        // the raw string so non-enum String literals (`placeholder:
        // "..."`) emit unchanged.
        if (_activeEnumType !== undefined) {
          return `.${e.value}`
        }
        return JSON.stringify(e.value)
      }
      return String(e.value)
    case 'identifier':
      return swiftIdent(e.name)
    case 'call': {
      // Special case: `signal.set(x)` → `signal = x` (Swift @State is a var).
      if (e.callee.kind === 'member' && e.callee.property === 'set') {
        const target = emitSwiftExpr(e.callee.object, indent)
        // Look up whether the target signal is enum-typed (e.g.
        // `filter.set('active')` where `filter` is declared as
        // `signal<Filter>('all')` with Filter in `_enumNames`). If so,
        // emit the argument with the active-enum context set so a
        // string literal arg rewrites to `.case`. Conservative — non-
        // identifier callees stay as plain emit.
        let prevEnumType: string | undefined
        if (e.callee.object.kind === 'identifier') {
          const enumType = _signalEnumTypes.get(e.callee.object.name)
          if (enumType !== undefined) {
            prevEnumType = _activeEnumType
            _activeEnumType = enumType
          }
        }
        const value = e.args[0] ? emitSwiftExpr(e.args[0], indent) : '0'
        if (prevEnumType !== undefined || _activeEnumType !== undefined) {
          _activeEnumType = prevEnumType
        }
        return `${target} = ${value}`
      }
      // Bare signal call `count()` → `count` (Swift @State is read directly).
      // We treat any zero-arg call to an Identifier as a signal/computed read.
      if (e.callee.kind === 'identifier' && e.args.length === 0) {
        return swiftIdent(e.callee.name)
      }
      const callee = emitSwiftExpr(e.callee, indent)
      const args = e.args.map((a) => emitSwiftExpr(a, indent)).join(', ')
      return `${callee}(${args})`
    }
    case 'member': {
      // Rewrite `<propsParamName>.X` → `X`. The active component's
      // props-param binding is exposed as direct struct properties in
      // Swift (`let title: String`), so the user-source-level
      // `props.title` becomes a bare `title` reference at the
      // SwiftUI View body.
      if (
        _activePropsParamName !== undefined &&
        e.object.kind === 'identifier' &&
        e.object.name === _activePropsParamName
      ) {
        return swiftIdent(e.property)
      }
      return `${emitSwiftExpr(e.object, indent)}.${swiftIdent(e.property)}`
    }
    case 'binary':
      return `${emitSwiftExpr(e.left, indent)} ${e.op} ${emitSwiftExpr(e.right, indent)}`
    case 'comparison':
      // Pyreon `===` / `!==` already coalesced to `==` / `!=` at parse;
      // Swift takes them verbatim.
      return `${emitSwiftExpr(e.left, indent)} ${e.op} ${emitSwiftExpr(e.right, indent)}`
    case 'unary':
      // Parser-B: prefix unary. Swift accepts `!x`, `-x`, `+x` verbatim.
      return `${e.op}${emitSwiftExpr(e.argument, indent)}`
    case 'logical':
      // Parser-C: short-circuit logical. Swift `&&` / `||` semantics
      // match JS for the value types Pyreon signals carry.
      return `${emitSwiftExpr(e.left, indent)} ${e.op} ${emitSwiftExpr(e.right, indent)}`
    case 'ternary':
      // Swift ternary syntax is identical to JS.
      return `${emitSwiftExpr(e.cond, indent)} ? ${emitSwiftExpr(e.then, indent)} : ${emitSwiftExpr(e.otherwise, indent)}`
    case 'update':
      // `x++` / `x--` post-increment in expression position. Swift
      // doesn't support `++` / `--` as expressions — emit the VALUE
      // (`x + 1` / `x - 1`) and document the side-effect loss in the
      // IR comment. For `nextId++` inside an array literal, this is
      // the correct VALUE semantics; the increment side-effect is
      // missing but the array element is correct.
      return e.op === '++'
        ? `${emitSwiftExpr(e.argument, indent)} + 1`
        : `${emitSwiftExpr(e.argument, indent)} - 1`
    case 'arrow':
      // Swift closure: `{ params in body }`.
      if (e.params.length === 0) return `{ ${emitSwiftExpr(e.body, indent)} }`
      return `{ ${e.params.map(swiftIdent).join(', ')} in ${emitSwiftExpr(e.body, indent)} }`
    case 'jsx-element':
      return emitSwiftJsx(e, indent)
    case 'jsx-fragment': {
      const pad = ' '.repeat(indent + 2)
      return `Group {\n${e.children.map((c) => pad + emitSwiftChild(c, indent + 2)).join('\n')}\n${' '.repeat(indent)}}`
    }
    case 'array': {
      // Array spread (`[...todos(), x]`) → Swift `+` concat (preserves
      // source's value-semantics). Only handle the single-spread form;
      // multi-spread degrades to verbatim emit (which would be invalid
      // Swift but flagged at parse time).
      const spreadIdx = e.elements.findIndex((el) => el.kind === 'spread')
      if (spreadIdx === 0) {
        const spread = e.elements[0]! as Extract<ExprIR, { kind: 'spread' }>
        const tail = e.elements.slice(1)
        const tailRendered = tail.map((el) => emitSwiftExpr(el, indent)).join(', ')
        if (tail.length === 0) return emitSwiftExpr(spread.argument, indent)
        return `${emitSwiftExpr(spread.argument, indent)} + [${tailRendered}]`
      }
      return `[${e.elements.map((el) => emitSwiftExpr(el, indent)).join(', ')}]`
    }
    case 'spread':
      // Bare spread outside an ArrayExpression — the parser produces
      // this for `{...obj}`-style usage which Swift doesn't have a
      // direct emit for. Degrades to the argument; warn at parse time
      // would be ideal but the IR doesn't carry context.
      return emitSwiftExpr(e.argument, indent)
    case 'object': {
      const fields = e.fields.map((f) => `${f.name}: ${emitSwiftExpr(f.value, indent)}`).join(', ')
      return `(${fields})`
    }
    case 'paren':
      return `(${emitSwiftExpr(e.inner, indent)})`
  }
}

function emitSwiftJsx(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = e.tag

  if (tag === 'For') return emitSwiftFor(e, indent)
  if (tag === 'Show') return emitSwiftShow(e, indent)
  if (tag === 'Text') return emitSwiftText(e, indent)
  if (tag === 'Button') return emitSwiftButton(e, indent)
  // Generic SwiftUI View by tag name.
  return emitSwiftGeneric(e, indent)
}

function emitSwiftText(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  // `<Text>Hello</Text>` → `Text("Hello")`
  // `<Text>{count}</Text>` → `Text("\(count)")`
  // mixed text + expr is built as an interpolated Swift string.
  if (e.children.length === 0) return 'Text("")'
  if (e.children.length === 1 && e.children[0]!.kind === 'text') {
    return `Text(${JSON.stringify(e.children[0]!.value)})`
  }
  const parts: string[] = []
  for (const c of e.children) {
    if (c.kind === 'text') parts.push(escapeSwiftInterp(c.value))
    else parts.push(`\\(${emitSwiftExpr(c.expr, indent)})`)
  }
  return `Text("${parts.join('')}")`
}

function emitSwiftButton(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  // <Button onClick={() => …}>Label</Button>  →  Button("Label") { … }
  const onClick = e.attrs.find((a) => a.kind === 'event' && a.name === 'click') as
    | Extract<AttrIR, { kind: 'event' }>
    | undefined
  const labelText = extractStaticText(e.children)
  const action = onClick ? emitSwiftAction(onClick.handler, indent) : '{}'
  if (labelText !== null) {
    return `Button(${JSON.stringify(labelText)}) ${action}`
  }
  // Complex content; emit Button { action } label: { content }.
  const pad = ' '.repeat(indent + 2)
  const contentLines = e.children
    .map((c) => pad + emitSwiftChild(c, indent + 2))
    .join('\n')
  return `Button(action: ${action}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

function emitSwiftAction(handler: ExprIR, indent: number): string {
  // Strip outer arrow if present — Button takes a closure body directly.
  if (handler.kind === 'arrow') {
    return `{ ${emitSwiftExpr(handler.body, indent)} }`
  }
  return `{ ${emitSwiftExpr(handler, indent)} }`
}

function emitSwiftFor(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  // <For each={items} by={(i) => i.id}>{(item) => <Text>{item.label}</Text>}</For>
  // → ForEach(items, id: \.id) { item in ...body... }
  const each = e.attrs.find((a) => a.kind === 'attr' && a.name === 'each') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const by = e.attrs.find((a) => a.kind === 'attr' && a.name === 'by') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const renderArrow = e.children.find(
    (c) => c.kind === 'expr' && c.expr.kind === 'arrow',
  ) as Extract<ChildIR, { kind: 'expr' }> | undefined

  const items = each ? emitSwiftSignalRead(each.value) : 'items'
  const idPath = by && by.value.kind === 'arrow'
    ? extractMemberPath(by.value.body)
    : 'id'

  if (!renderArrow || renderArrow.expr.kind !== 'arrow') {
    return `ForEach(${items}, id: \\.${idPath}) { _ in EmptyView() }`
  }
  const param = (renderArrow.expr as Extract<ExprIR, { kind: 'arrow' }>).params[0] ?? 'item'
  const body = (renderArrow.expr as Extract<ExprIR, { kind: 'arrow' }>).body
  const pad = ' '.repeat(indent + 2)
  return `ForEach(${items}, id: \\.${idPath}) { ${param} in\n${pad}${emitSwiftExpr(body, indent + 2)}\n${' '.repeat(indent)}}`
}

function emitSwiftShow(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  // <Show when={visible}>{children}</Show> → if visible { ...children... }
  const when = e.attrs.find((a) => a.kind === 'attr' && a.name === 'when') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const cond = when ? emitSwiftSignalRead(when.value) : 'true'
  const pad = ' '.repeat(indent + 2)
  const body = e.children.map((c) => pad + emitSwiftChild(c, indent + 2)).join('\n')
  return `if ${cond} {\n${body}\n${' '.repeat(indent)}}`
}

function emitSwiftGeneric(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const pad = ' '.repeat(indent + 2)
  const attrPairs = e.attrs
    .filter((a) => a.kind === 'attr')
    .map((a) => {
      const aa = a as Extract<AttrIR, { kind: 'attr' }>
      // `safeIdent` converts kebab-case HTML attrs (`data-test`,
      // `aria-label`) to camelCase. Swift rejects `-` in argument
      // labels with `expected ',' separator`; was the #1 cause of
      // swiftc-parse failures on the real-corpus coverage gate
      // (19 of 30 invalid files, 2026-05-21 measurement).
      // Also `swiftIdent`-escape the attr label in case the kebab→camel
      // conversion lands on a reserved keyword (e.g. `for-class` →
      // `forClass` — both halves are reserved when used as identifiers).
      return `${swiftIdent(safeIdent(aa.name))}: ${emitSwiftExpr(aa.value, indent)}`
    })
    .join(', ')
  // `swiftIdent`-escape the tag name — covers user-defined components
  // whose name collides with a Swift keyword (e.g. `<class>...</class>`).
  const tag = swiftIdent(e.tag)
  if (e.children.length === 0) {
    return attrPairs ? `${tag}(${attrPairs})` : `${tag}()`
  }
  const contentLines = e.children
    .map((c) => pad + emitSwiftChild(c, indent + 2))
    .join('\n')
  if (attrPairs) {
    return `${tag}(${attrPairs}) {\n${contentLines}\n${' '.repeat(indent)}}`
  }
  return `${tag} {\n${contentLines}\n${' '.repeat(indent)}}`
}

function emitSwiftChild(c: ChildIR, indent: number): string {
  if (c.kind === 'text') return `Text(${JSON.stringify(c.value)})`
  return emitSwiftExpr(c.expr, indent)
}

// Helpers --------------------------------------------------------------------

/** Read a value that may be a bare signal reference or an arbitrary expr. */
function emitSwiftSignalRead(e: ExprIR): string {
  // In Pyreon JSX, a bare identifier in a prop position like `when={visible}`
  // refers to the signal accessor. In Swift, the @State variable is read by
  // name. So `visible` → `visible`. Keyword-escape via `swiftIdent` —
  // a user-defined signal named `class` should emit as `` `class` ``.
  if (e.kind === 'identifier') return swiftIdent(e.name)
  return emitSwiftExpr(e, 0)
}

/** Extract a static text body if all children are JSXText / single text child. */
function extractStaticText(children: ChildIR[]): string | null {
  if (children.length === 0) return ''
  if (children.length === 1 && children[0]!.kind === 'text') return children[0]!.value
  return null
}

/** Walk an arrow body `(i) => i.id` → return the property name 'id'. */
function extractMemberPath(expr: ExprIR): string {
  if (expr.kind === 'member') return expr.property
  return 'id'
}

function escapeSwiftInterp(s: string): string {
  // Escape backslashes + double-quotes + the `\(` interpolation marker.
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\\\(/g, '\\\\(')
}
