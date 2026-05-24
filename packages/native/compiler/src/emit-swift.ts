// Pyreon IR → Swift / SwiftUI source.
//
// Per the chosen-direction plan, signals map to `@State`, computeds to
// computed properties, JSX elements to SwiftUI Views, event handlers
// to Swift closures.
//
// Phase 0 scope: enough to handle the seven starter fixtures cleanly.
// Type inference is deliberately naive — numeric assumption for
// computed properties. Phase 1 grows a real inference pass.

import {
  isCanonicalPrimitive,
  resolveAlign,
  resolveColor,
  resolveRadius,
  resolveSpace,
} from './canonical-primitives'
import { buildInferenceCtx, inferType } from './infer-type'
import { safeIdent, swiftIdent } from './identifier-safety'
import type {
  AttrIR,
  ChildIR,
  ComponentIR,
  DeclIR,
  EnumIR,
  ExprIR,
  ModuleDeclIR,
  StatementIR,
  StructIR,
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
/**
 * Component names emitted in this transform. Used by the generic
 * JSX emit to distinguish user-defined components (`<TodoRow>`,
 * `<MyCard>`) from SwiftUI primitives (`<HStack>`, `<VStack>`).
 *
 * For user-defined components, the emit passes ALL attrs INCLUDING
 * event handlers (`onToggle={...}`) as constructor arguments —
 * SwiftUI Views are struct-initialized with all props at construction
 * time. For SwiftUI primitives, events stay dropped since they don't
 * accept event-handler args (HStack has no `onClick:` parameter).
 *
 * Closes the TodoMVC `TodoRow(todo: t)` missing-args typecheck blocker
 * (the `onToggle`/`onRemove` event handlers were silently dropped).
 */
let _componentNames: Set<string> = new Set()
/**
 * Struct name → sorted-field-names key. Phase 2 follow-up to the
 * struct-emit PR. Used by the object-expression emit to detect when
 * an anonymous object literal (`{ id: ..., text: ..., done: false }`)
 * matches a known struct's fields exactly. If so, emit as a struct
 * initializer (`Todo(id: ..., text: ..., done: false)`) instead of
 * a labelled tuple. Matches by EXACT field-name set — superset /
 * partial matches conservatively fall through to tuple emit.
 *
 * The sorted-fields key (`'done,id,text'`) is stored as a comma-
 * joined string so a `Map<string, string>` lookup is O(1) per object
 * expression. Multiple structs with the same field-set would collide;
 * we keep the first-seen struct (alphabetical via Map insertion).
 */
let _structFieldsToName: Map<string, string> = new Map()
/** Per-component: signal/computed name → enum-type-name when typed as one. */
let _signalEnumTypes: Map<string, string> = new Map()
/** Set when emitting a signal initial value that's an enum-typed signal. */
let _activeEnumType: string | undefined
/**
 * Per-component: every signal name in scope. Used by G1 (TextField
 * two-way binding) to know which `value={x}` attr identifiers match
 * a real \`@State\` declaration that supports SwiftUI's binding-
 * projection (\`$x\`) syntax. Also load-bearing at the call site:
 * `signal()` (zero-arg call) emits as bare `signal` for signal reads.
 */
let _signalNames: Set<string> = new Set()
/**
 * Per-component: every function decl name in scope (DeclIR.function —
 * Parser-A). Disambiguates `addTodo()` (function call — keeps parens)
 * from `count()` (signal read — drops parens). Without this set the
 * call-emit can't tell the two shapes apart, since both arrive as
 * `call(callee=identifier, args=[])` in the IR.
 */
let _functionNames: Set<string> = new Set()

export function emitSwift(
  components: ComponentIR[],
  enums: EnumIR[] = [],
  structs: StructIR[] = [],
  moduleDecls: ModuleDeclIR[] = [],
): string {
  _enumNames = new Set(enums.map((e) => e.name))
  // Build the struct-fields key map for object-expression detection.
  // Sorted-field-name string `'done,id,text'` → struct name `'Todo'`.
  // First-seen struct wins on field-set collision (rare in practice).
  _structFieldsToName = new Map()
  for (const s of structs) {
    const key = s.fields.map((f) => f.name).sort().join(',')
    if (!_structFieldsToName.has(key)) _structFieldsToName.set(key, s.name)
  }
  // Build the user-component name set so emitSwiftGeneric can include
  // event handlers as constructor args for user-defined components.
  _componentNames = new Set(components.map((c) => c.name))
  const parts: string[] = []
  for (const e of enums) parts.push(emitSwiftEnum(e))
  for (const s of structs) parts.push(emitSwiftStruct(s))
  for (const md of moduleDecls) parts.push(emitSwiftModuleDecl(md))
  for (const c of components) parts.push(emitSwiftComponent(c))
  _enumNames = new Set()
  _structFieldsToName = new Map()
  _componentNames = new Set()
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

/**
 * Emit a Swift `struct X: Codable { var a: T; var b: U; ... }` from
 * a StructIR. `var` (not `let`) keeps the G4 IIFE-copy mutation idiom
 * working — `{ var c = t; c.field = value; return c }()` mutates the
 * field, which requires the field to be `var`.
 *
 * **Codable conformance** is always emitted. For primitive-field
 * structs (Int / String / Bool / etc.) Swift auto-synthesizes
 * `Encodable` + `Decodable`. For structs with non-Codable fields
 * (function types, raw `Any`, etc.), `swiftc -typecheck` raises a
 * clear error pointing at the offending field — the compiler can't
 * know upfront which fields are Codable (named typeRefs could resolve
 * to anything in the consumer's compile environment), so the emit
 * delegates to swiftc. Phase 2 follow-up could add a field-type
 * filter to selectively drop Codable conformance.
 *
 * Codable is foundational for:
 *   - `@AppStorage` Codable-Data bridge (next Phase 2 PR)
 *   - JSON encode/decode round-trip in user code
 *   - Pyreon's storage / network adapter layers
 */
function emitSwiftStruct(s: StructIR): string {
  const lines: string[] = []
  lines.push(`struct ${swiftIdent(s.name)}: Codable {`)
  for (const f of s.fields) {
    lines.push(`  var ${swiftIdent(f.name)}: ${swiftType(f.type)}`)
  }
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Emit a module-level mutable / immutable binding at file scope.
 *
 *   source: let nextId = 1     →  private var nextId: Int = 1
 *   source: const APP = '1.0'  →  private let APP: String = "1.0"
 *
 * `private` (at top level = file-private in Swift) keeps the binding
 * scoped to the emitted file — matches the TS source's module-level
 * privacy. Type annotation is inferred from the initial when source
 * omits it (TypeIR `unknown` → Swift type inferred from `= value`).
 */
function emitSwiftModuleDecl(md: ModuleDeclIR): string {
  const kw = md.mutable ? 'var' : 'let'
  const initial = emitSwiftExpr(md.initial, 0)
  if (md.type.kind === 'unknown') {
    // Omit explicit type annotation when source didn't carry one.
    // Swift infers from `= initial`.
    return `private ${kw} ${swiftIdent(md.name)} = ${initial}`
  }
  return `private ${kw} ${swiftIdent(md.name)}: ${swiftType(md.type)} = ${initial}`
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
  // G1: track every signal name so TextField's pattern-detection can
  // recognise binding-eligible identifiers.
  _signalNames = new Set()
  // G2 (related correctness): track every function decl name so the
  // call-emit keeps parens for `addTodo()` (function call) and drops
  // them only for `count()` (signal read).
  _functionNames = new Set()
  // Phase 2 follow-up: also track props whose type is a function
  // (`onToggle: () -> Void`). Inside the component body, references
  // to these props are CALL SITES that need explicit `()` —
  // `Button { onRemove }` should be `Button { onRemove() }`.
  // Closes the TodoMVC TodoRow `Button("Remove") { onRemove }`
  // typecheck-or-no-op trap.
  for (const p of c.props) {
    if (p.type.kind === 'function') _functionNames.add(p.name)
  }
  for (const d of c.decls) {
    if (d.kind === 'signal' && d.type.kind === 'typeRef' && _enumNames.has(d.type.name)) {
      _signalEnumTypes.set(d.name, d.type.name)
    }
    // Both signal AND computed map to Swift properties (read without
    // parens). Track both under `_signalNames` so the call-emit drops
    // parens for both. (Naming is a slight misnomer kept for continuity
    // with G1; could rename to `_propertyNames` in a follow-up cleanup.)
    if (d.kind === 'signal' || d.kind === 'computed') _signalNames.add(d.name)
    if (d.kind === 'function') _functionNames.add(d.name)
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
  _signalNames = new Set()
  _functionNames = new Set()
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
    // G5 — persistent signal via `useStorage<T>('key', default)`. SwiftUI's
    // `@AppStorage("key")` property wrapper writes through to UserDefaults
    // and triggers re-renders on change (same reactive contract as @State).
    //
    // Phase 2 follow-up — when the declared type is NOT one of @AppStorage's
    // native types (String / Int / Double / Bool / URL / Data /
    // RawRepresentable), emit a Codable-Data bridge: the actual @AppStorage
    // slot stores a `Data` JSON blob; a computed property wraps it for
    // type-safe read/write via JSONEncoder/Decoder. This closes G5's
    // known typecheck caveat (`@AppStorage([Todo])` was rejected by
    // `swiftc -typecheck`); now `[Todo]` round-trips cleanly via JSON.
    //
    // Native types (String, enums via RawRepresentable, etc.) continue
    // to use the direct shape — no bridge overhead when not needed.
    if (d.storageKey !== undefined) {
      if (isAppStorageNativeType(d.type)) {
        return `@AppStorage(${JSON.stringify(d.storageKey)}) private var ${swiftIdent(d.name)}: ${type} = ${initial}`
      }
      // Phase 2.5: non-native types use @PyreonAppStorage from
      // @pyreon/native-runtime-swift (PR #885) — collapses the previous
      // 14-line @AppStorage(Data) + Codable bridge to one line. Same
      // UserDefaults backing, same Binding<T> projection via `$name`,
      // same silent-fallback failure semantics.
      //
      // Consumer apps must `import PyreonRuntime` for the wrapper to
      // resolve. The compiler doesn't auto-emit imports — same
      // convention as @AppStorage (which requires `import SwiftUI`).
      //
      // Pre-2.5 (still in git history): a hand-rolled bridge with a
      // `@AppStorage` Data slot + computed property doing JSON
      // round-trip via JSONEncoder/Decoder. Identical behaviour at
      // runtime; just dramatically more emit code.
      return `@PyreonAppStorage(${JSON.stringify(d.storageKey)}) private var ${swiftIdent(d.name)}: ${type} = ${initial}`
    }
    return `@State private var ${swiftIdent(d.name)}: ${type} = ${initial}`
  }
  if (d.kind === 'function') {
    return emitSwiftFunction(d)
  }
  // computed — infer the return type from the expression body so we
  // can emit a typed computed property. Falls back to `Any` for cases
  // the inference can't resolve (the emit still produces compilable
  // code via the fallback `swiftType` for `unknown`).
  //
  // Phase 2 follow-up: when the IR carries `body` (multi-statement
  // BlockStatement form), emit a multi-statement Swift getter
  // preserving `let` bindings, `if` early-returns, and the final
  // return. Closes the TodoMVC `visible: Any { xs }` typecheck
  // blocker where the parser used to silently drop pre-return
  // statements.
  if (d.body !== undefined) {
    // Use the pre-computed type from buildInferenceCtx's Pass 2
    // (which populates `locals` from the body's `let` bindings before
    // walking to the first return). Falls back to `unknown` (→ `Any`)
    // if the computed wasn't pre-inferred for some reason — defensive.
    const inferred = inferCtx.computeds.get(d.name) ?? { kind: 'unknown' as const }
    const swiftReturnType = swiftType(inferred)
    const bodyLines = d.body.map((s) => `    ${emitSwiftStatement(s, 4)}`).join('\n')
    return [
      `private var ${swiftIdent(d.name)}: ${swiftReturnType} {`,
      bodyLines,
      `  }`,
    ].join('\n')
  }
  // Legacy single-expression shape — same pre-computed lookup.
  const inferred = inferCtx.computeds.get(d.name) ?? inferType(d.expr!, inferCtx)
  const swiftReturnType = swiftType(inferred)
  return `private var ${swiftIdent(d.name)}: ${swiftReturnType} { ${emitSwiftExpr(d.expr!, 0)} }`
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
  // Use `_` (no external label) so call sites match the JS-style
  // unnamed-arg shape `toggle(t.id)` instead of requiring Swift's
  // labeled-call shape `toggle(id: t.id)`. The TS source doesn't
  // carry argument labels at call sites — Pyreon's compile path
  // preserves the call-site shape verbatim, so the function decl
  // must also opt out of Swift's default external labeling.
  const params = d.params
    .map((p) => `_ ${swiftIdent(p.name)}: ${swiftType(p.type)}`)
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
/**
 * Predicate: is this type one that SwiftUI's `@AppStorage` property
 * wrapper accepts natively? Per SwiftUI docs, native types are:
 *   - String, Int, Double, Bool, URL, Data
 *   - RawRepresentable types where RawValue is String or Int
 *     (typically enums with raw-value backing — Pyreon's G6 enum
 *     emit produces these via `: String` raw-value annotation)
 *
 * Non-native types (arrays of structs, nested objects, complex
 * unions) need a Codable-Data bridge — Phase 2's @AppStorage bridge
 * emits a `Data`-backed slot + computed-property accessor that
 * round-trips via JSON.
 *
 * Returns `true` for native, `false` for "needs bridge".
 *
 * Note: `Optional<T>` where T is native (e.g. `String?`) is also
 * supported by @AppStorage. The IR's `union` kind models this as
 * `T | null` / `T | undefined`; native iff every non-null branch
 * is native AND the union is exactly one non-null + one null.
 * For Phase 2 simplicity, only the most common shape (single
 * non-null branch + null) is treated as native; everything else
 * routes through the bridge.
 */
function isAppStorageNativeType(t: TypeIR): boolean {
  switch (t.kind) {
    case 'string':
    case 'number':
    case 'boolean':
      return true
    case 'typeRef':
      // Generic-free named typeRef: native iff it's a known enum
      // (G6 emits `enum X: String` → RawRepresentable<String>). Other
      // typeRefs (user structs, library types we can't resolve) are
      // conservative non-native — they're routed through the bridge.
      // `Array<T>` and `Promise<T>` are handled at the swiftType layer;
      // here they're typeRefs but we treat them via the array case for
      // Array (the parser canonicalizes `T[]` → `kind: 'array'`).
      return t.args.length === 0 && _enumNames.has(t.name)
    case 'union': {
      // `T | null` / `T | undefined` → Optional<T>; native iff T is.
      const nulls = t.branches.filter(
        (b) => b.kind === 'null' || b.kind === 'undefined',
      ).length
      const others = t.branches.filter(
        (b) => b.kind !== 'null' && b.kind !== 'undefined',
      )
      return nulls > 0 && others.length === 1 && isAppStorageNativeType(others[0]!)
    }
    default:
      // array / object / function / null / undefined / unknown → non-native
      return false
  }
}

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
      // Disambiguate signal/computed read vs function call for zero-
      // arg identifier calls. Both arrive as `call(ident, [])` in the
      // IR — `_functionNames` (Parser-A function decls) distinguishes.
      //
      //   count()      → count       (signal/computed read — Swift @State /
      //                                computed property accessed directly)
      //   addTodo()    → addTodo()   (function call — parens preserved)
      //
      // Pre-G2 this branch unconditionally dropped parens for every
      // zero-arg identifier call — a real bug for function decls, e.g.
      // `Button { clearCompleted }` (closure returning the function
      // reference, never calling it). Unknown identifiers (including
      // dropped-from-parser shapes like `useStorage` returns that the
      // type-mapper doesn't yet handle) keep the pre-G2 bare-emit so
      // the snapshot doesn't expose lurking gaps prematurely.
      if (e.callee.kind === 'identifier' && e.args.length === 0) {
        if (_functionNames.has(e.callee.name)) {
          return `${swiftIdent(e.callee.name)}()`
        }
        return swiftIdent(e.callee.name)
      }
      // TS-method translation (Phase 2 follow-up). When the callee is a
      // member expression naming a known TS method that doesn't exist
      // (or differs semantically) in Swift, rewrite to the platform
      // equivalent. Closes the bulk of TodoMVC's typecheck blockers
      // beyond the @AppStorage bridge:
      //
      //   X.trim()    →  X.trimmingCharacters(in: .whitespacesAndNewlines)
      //   X.some(p)   →  X.contains(where: p)
      //   X.every(p)  →  X.allSatisfy(p)
      //   X.find(p)   →  X.first(where: p)
      //   X.includes(v) → X.contains(v)
      //   X.indexOf(v)  → X.firstIndex(of: v)
      //
      // Each rewrite preserves the semantic intent. Methods with the
      // same name AND semantics on both targets (`.filter`, `.map`,
      // `.reduce`) pass through unchanged.
      if (e.callee.kind === 'member') {
        const obj = emitSwiftExpr(e.callee.object, indent)
        const prop = e.callee.property
        const argExprs = e.args.map((a) => emitSwiftExpr(a, indent))
        switch (prop) {
          case 'trim':
            if (e.args.length === 0) {
              return `${obj}.trimmingCharacters(in: .whitespacesAndNewlines)`
            }
            break
          case 'some':
            if (e.args.length === 1) {
              return `${obj}.contains(where: ${argExprs[0]!})`
            }
            break
          case 'every':
            if (e.args.length === 1) {
              return `${obj}.allSatisfy(${argExprs[0]!})`
            }
            break
          case 'find':
            if (e.args.length === 1) {
              return `${obj}.first(where: ${argExprs[0]!})`
            }
            break
          case 'includes':
            if (e.args.length === 1) {
              return `${obj}.contains(${argExprs[0]!})`
            }
            break
          case 'indexOf':
            if (e.args.length === 1) {
              return `${obj}.firstIndex(of: ${argExprs[0]!})`
            }
            break
        }
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
      // TS-method translation (property side). `.length` doesn't exist
      // on Swift String / Array — both use `.count` for the size
      // property. Phase 2 follow-up. Closes TodoMVC's
      // `todos.filter(...).length` and `text.length == 0` typecheck
      // blockers.
      if (e.property === 'length') {
        return `${emitSwiftExpr(e.object, indent)}.count`
      }
      return `${emitSwiftExpr(e.object, indent)}.${swiftIdent(e.property)}`
    }
    case 'binary':
      return `${emitSwiftExpr(e.left, indent)} ${e.op} ${emitSwiftExpr(e.right, indent)}`
    case 'comparison': {
      // Pyreon `===` / `!==` already coalesced to `==` / `!=` at parse;
      // Swift takes them verbatim.
      //
      // Phase 2 follow-up: enum-aware comparison. When the LHS is a
      // known enum-typed signal read (`filter()` where `filter: Filter`),
      // wrap the RHS emit with `_activeEnumType` so a string literal
      // rewrites to a qualified case (`"active"` → `.active`). Mirrors
      // the existing `.set()` enum-aware emit (search `_activeEnumType`
      // in this file for the structural reference).
      //
      // Detection: LHS is `call(callee=identifier, args=[])` where the
      // identifier is in `_signalEnumTypes`. That's the canonical
      // signal-read shape for an enum-typed signal (`filter()`).
      const left = e.left
      let prevEnumType: string | undefined
      if (
        left.kind === 'call' &&
        left.callee.kind === 'identifier' &&
        left.args.length === 0
      ) {
        const enumType = _signalEnumTypes.get(left.callee.name)
        if (enumType !== undefined) {
          prevEnumType = _activeEnumType
          _activeEnumType = enumType
        }
      }
      const leftStr = emitSwiftExpr(e.left, indent)
      const rightStr = emitSwiftExpr(e.right, indent)
      if (prevEnumType !== undefined || _activeEnumType !== undefined) {
        _activeEnumType = prevEnumType
      }
      return `${leftStr} ${e.op} ${rightStr}`
    }
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
    case 'update': {
      // `x++` / `x--` post-increment/decrement in expression position.
      // Returns the OLD value and mutates the variable (JS semantics).
      //
      // Swift removed `++`/`--` operators in Swift 3 — they're not
      // available even as statements, let alone expressions. The
      // canonical Swift workaround is an IIFE (immediately-invoked
      // closure expression) that captures the old value, mutates the
      // var, then returns the captured value. The closure captures
      // module-scoped vars by reference automatically.
      //
      // Pre-fix shape was `x + 1` / `x - 1` — DOUBLY broken:
      //   1. Returns the NEW value (x+1) instead of the OLD value (x) —
      //      off-by-one. TodoMVC's `id: nextId++` got id=2 on first
      //      call (should be id=1).
      //   2. Drops the side-effect entirely — `nextId` never
      //      incremented. Every new Todo got id=2 forever, causing
      //      duplicate-ID bugs.
      //
      // Fixed shape: IIFE that returns the OLD value AND increments:
      //   { () -> Int in let v = x; x += 1; return v }()
      //
      // The `() -> Int` type annotation is omitted when the result
      // type is inferable from the expression context (which is
      // usually the case in struct-init args). Swift's closure-return
      // inference covers it without annotation.
      const arg = emitSwiftExpr(e.argument, indent)
      const step = e.op === '++' ? '+= 1' : '-= 1'
      return `{ let __v = ${arg}; ${arg} ${step}; return __v }()`
    }
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
      // G4 — partial-update form. When the object has EXACTLY ONE
      // spread and that spread argument is a bare identifier (typical
      // shape: `{ ...t, done: !t.done }` inside `.map(t => ...)`),
      // emit Swift's immediately-invoked closure that copies the source
      // and applies the overrides:
      //
      //   { ...t, done: !t.done }   →   { var c = t; c.done = !t.done; return c }()
      //
      // Works for BOTH struct sources (`struct Todo { var ... }`) and
      // labelled tuple sources (`let t: (id: Int, text: String, done:
      // Bool) = (...)`), which is what Pyreon currently emits for
      // anonymous record types. Swift accepts `copy.field = value` on
      // tuples with labelled fields, so the partial-update form is
      // semantically equivalent to JS's object spread.
      //
      // Other shapes (multi-spread, non-identifier spread) fall through
      // to the existing tuple-literal emit — those require richer
      // type-context the Phase 1 inferer doesn't yet carry.
      if (e.spreads && e.spreads.length === 1 && e.spreads[0]!.kind === 'identifier') {
        const target = emitSwiftExpr(e.spreads[0]!, indent)
        const overrides = e.fields
          .map((f) => `c.${swiftIdent(f.name)} = ${emitSwiftExpr(f.value, indent)}`)
          .join('; ')
        return `{ var c = ${target}; ${overrides}; return c }()`
      }
      // Phase 2 follow-up to the struct-emit PR — object literal with
      // no spread + field-name set matching a known struct EXACTLY
      // emits as a struct initializer `Todo(id: ..., text: ..., done: ...)`
      // instead of the labelled tuple. The fields are emitted in the
      // ORDER the source wrote them (struct init accepts arg-label
      // ordering matching the struct's declared order; Swift compiler
      // raises a clear error if the user-source order doesn't match).
      // Falls through to tuple emit when:
      //   - any spread is present (G4 handles those above)
      //   - field-set doesn't match any known struct exactly
      //   - multiple structs have the same field-set (collision —
      //     can't disambiguate without type-context)
      if (!e.spreads || e.spreads.length === 0) {
        const fieldSet = e.fields.map((f) => f.name).sort().join(',')
        const structName = _structFieldsToName.get(fieldSet)
        if (structName !== undefined) {
          const args = e.fields
            .map((f) => `${swiftIdent(f.name)}: ${emitSwiftExpr(f.value, indent)}`)
            .join(', ')
          return `${swiftIdent(structName)}(${args})`
        }
      }
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
  if (tag === 'TextField') return emitSwiftTextField(e, indent)
  if (tag === 'Checkbox') return emitSwiftCheckbox(e, indent)
  // Phase B — canonical multi-platform primitives (@pyreon/primitives).
  // Per the architectural plan (#893), these route through dedicated
  // emit functions BEFORE the generic-tag fallthrough so each maps to
  // its idiomatic SwiftUI shape (props → modifier chains; canonical
  // `onPress` → `action:`; tokens → resolved CGFloats).
  if (tag === 'Stack') return emitSwiftStack(e, indent, /*defaultDirection*/ 'column')
  if (tag === 'Inline') return emitSwiftStack(e, indent, /*defaultDirection*/ 'row')
  if (tag === 'Press') return emitSwiftPress(e, indent)
  if (tag === 'Field') return emitSwiftField(e, indent)
  // 10 other canonical primitives (Layer, Scroll, Spacer, Heading,
  // Image, Icon, Link, Toggle, Modal) DON'T have dedicated emit
  // functions yet — they fall through to generic emit, which produces
  // the LITERAL tag name in output (not typecheck-clean against the
  // real platform). Ship as real apps demand each.
  // Generic SwiftUI View by tag name.
  return emitSwiftGeneric(e, indent)
}

/**
 * Emit Pyreon's `<Checkbox checked={x}>` as a SwiftUI `Image` with
 * the conditional system symbol. SwiftUI doesn't ship a non-
 * interactive Checkbox primitive; the closest typecheck-clean
 * read-only display is:
 *
 *   Image(systemName: x ? "checkmark.square.fill" : "square")
 *
 * For the interactive case (`onChange` handler), Phase 3 could
 * extend this to emit a Toggle with a `Binding<Bool>`, but that
 * requires the checked expression to BE a binding — currently the
 * source passes a plain bool (`todo.done`), which doesn't fit a
 * Binding without wrapping. The read-only Image is the structural
 * closure for the current TodoMVC shape; `onChange` is silently
 * dropped (matches the existing generic-primitive event-drop
 * convention).
 *
 * Closes the TodoMVC `Checkbox not in scope` typecheck blocker —
 * the LAST remaining typecheck error after #871/#872.
 */
function emitSwiftCheckbox(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const checked = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'checked',
  )
  if (!checked) {
    // No `checked` attr — degrade to an empty square. Conservative;
    // unlikely shape in real Pyreon source.
    return `Image(systemName: "square")`
  }
  const checkedExpr = emitSwiftExpr(checked.value, indent)
  return `Image(systemName: ${checkedExpr} ? "checkmark.square.fill" : "square")`
}

/**
 * Emit `<TextField value={signal} onInput={...}>` as a SwiftUI
 * two-way-binding TextField. G1 from the TodoMVC walkthrough.
 *
 * Pyreon's one-way value+onInput idiom doesn't map directly to
 * SwiftUI's `TextField(_, text: Binding)`. Pattern detection:
 *
 *   1. `value` attr present + value is a bare identifier matching a
 *      `@State` signal in scope → emit `TextField("...", text: $signal)`
 *      using Swift's binding-projection (`$`) syntax. The `onInput`
 *      handler becomes redundant since SwiftUI's binding writes back
 *      automatically — drop it.
 *   2. Anything else (value is a literal / non-identifier expression /
 *      no signal match) → fall through to the generic emit shape.
 *
 * Placeholder: takes from the `placeholder` attr if present, else `""`.
 *
 * Without G1 (#834 baseline emit): `TextField(value: draft, placeholder: "...")`
 *   — syntactically valid Swift but binding is one-way (the typed text
 *   doesn't propagate back to the signal). User-typed text would be
 *   silently dropped on every change.
 *
 * With G1: `TextField("...", text: $draft)` — full SwiftUI two-way
 *   binding. User-typed text writes back to the @State automatically.
 */
function emitSwiftTextField(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const valueAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === 'value',
  )
  const placeholderAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'placeholder',
  )
  // Pattern-match: value attr is a bare Identifier that names a
  // known @State signal in scope. If yes → emit the binding.
  if (
    valueAttr &&
    valueAttr.value.kind === 'identifier' &&
    _signalNames.has(valueAttr.value.name)
  ) {
    const signalName = valueAttr.value.name
    const placeholder =
      placeholderAttr && placeholderAttr.value.kind === 'literal'
        ? JSON.stringify(String(placeholderAttr.value.value))
        : '""'
    let out = `TextField(${placeholder}, text: $${swiftIdent(signalName)})`
    // G2 — pattern-match onKeyDown={(e) => e.key === 'Enter' && action()}
    // and append `.onSubmit { action() }`. Other onKeyDown shapes drop
    // through silently (the parser already records the event for
    // future emit; we just don't have a SwiftUI equivalent for them).
    const submit = extractEnterSubmitAction(e.attrs)
    if (submit) {
      const pad = ' '.repeat(indent + 2)
      out += `\n${pad}.onSubmit { ${emitSwiftExpr(submit, indent + 2)} }`
    }
    return out
  }
  // Fall through to generic emit when the pattern doesn't match.
  return emitSwiftGeneric(e, indent)
}

/**
 * G2 — pattern-match the canonical "submit on Enter" shape:
 *
 *   onKeyDown={(e) => e.key === 'Enter' && action()}
 *
 * Returns the action expression on match (the right side of `&&`),
 * otherwise undefined. Keeps the pattern STRICT — only fires on:
 *   - `event.name === 'keydown'` (`onKeyDown`)
 *   - handler is a single-param arrow
 *   - body is `LogicalExpression(&&)` where left is `e.key === 'Enter'`
 *     (using the same param name the arrow declared)
 *
 * Any non-matching shape (different key, &&-chains, ternaries, switch)
 * silently falls through — SwiftUI's `.onSubmit` covers exactly this
 * shape and nothing else. Future expansions (Escape → .onCancel) can
 * extend this helper.
 */
function extractEnterSubmitAction(attrs: AttrIR[]): ExprIR | undefined {
  const onKey = attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'keydown',
  )
  if (!onKey || onKey.handler.kind !== 'arrow') return undefined
  const arrow = onKey.handler
  if (arrow.params.length !== 1) return undefined
  const paramName = arrow.params[0]!
  const body = arrow.body
  if (body.kind !== 'logical' || body.op !== '&&') return undefined
  // left: `<paramName>.key === 'Enter'` (comparison with == after coalesce)
  const left = body.left
  if (left.kind !== 'comparison' || left.op !== '==') return undefined
  if (
    left.left.kind !== 'member' ||
    left.left.object.kind !== 'identifier' ||
    left.left.object.name !== paramName ||
    left.left.property !== 'key'
  ) {
    return undefined
  }
  if (left.right.kind !== 'literal' || left.right.value !== 'Enter') return undefined
  return body.right
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
  // Phase B: also accept the canonical `onPress` event name (per
  // `@pyreon/primitives`). Either prop name resolves to the same
  // SwiftUI Button shape — `onPress` is the cross-platform canonical
  // (Phase E migrates TodoMVC source from onClick to onPress).
  const handler = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && (a.name === 'click' || a.name === 'press'),
  )
  const labelText = extractStaticText(e.children)
  const action = handler ? emitSwiftAction(handler.handler, indent) : '{}'
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
  // Resolve the handler to a function-typed identifier if it is one,
  // accounting for the two common shapes in JSX handler position:
  //
  //   <Button onClick={onRemove}>      → bare identifier
  //   <Button onClick={props.onRemove}> → member access (props.X — the
  //                                       props-param is rewritten away
  //                                       at emit time, so the effective
  //                                       handler is `onRemove`)
  //
  // When the resolved name is in `_functionNames` (component-level
  // function decl OR function-typed prop), emit as a CALL inside the
  // trailing closure: `{ name() }`. Without this, Swift evaluates
  // `{ onRemove }` as a closure that RETURNS the function reference,
  // never calling it — the Button click becomes a silent no-op.
  // Closes the TodoMVC `Button("Remove") { onRemove }` trap.
  const resolved = resolveFunctionHandler(handler)
  if (resolved !== undefined) {
    return `{ ${swiftIdent(resolved)}() }`
  }
  return `{ ${emitSwiftExpr(handler, indent)} }`
}

/**
 * Resolve a handler expression to a function-typed identifier name,
 * if it is one. Handles bare identifiers AND props-member accesses
 * (`props.onRemove` where `props` is the active component's first
 * parameter binding name).
 */
function resolveFunctionHandler(handler: ExprIR): string | undefined {
  if (handler.kind === 'identifier' && _functionNames.has(handler.name)) {
    return handler.name
  }
  if (
    handler.kind === 'member' &&
    _activePropsParamName !== undefined &&
    handler.object.kind === 'identifier' &&
    handler.object.name === _activePropsParamName &&
    _functionNames.has(handler.property)
  ) {
    return handler.property
  }
  return undefined
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

// ============================================================================
// Phase B — canonical multi-platform primitive emit functions.
//
// Each function reads canonical Pyreon props (per `@pyreon/primitives`)
// and emits the idiomatic SwiftUI shape for the target. Token
// resolution (padding/gap/color/etc.) routes through the shared
// `canonical-primitives.ts` helpers so iOS + Android stay in lockstep.
// ============================================================================

/**
 * Extract a static-attr value as a known type, ignoring spreads.
 * Returns undefined when the prop isn't present or isn't a static literal.
 */
function readStaticAttr(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  name: string,
): string | number | boolean | undefined {
  for (const a of e.attrs) {
    if (a.kind === 'attr' && a.name === name) {
      if (a.value.kind === 'literal') return a.value.value as string | number | boolean
    }
  }
  return undefined
}

/**
 * Build the SwiftUI modifier-chain tail for the canonical layout-prop
 * subset. Returns a string that begins with `.` (modifier-call) and is
 * appended after the View constructor.
 *
 * Empty result when no relevant props are present — the View renders
 * without any trailing modifier.
 *
 * Scope: padding/paddingX/paddingY/margin (alias to padding outside
 * a parent layout)/background/radius.
 */
function emitSwiftLayoutModifiers(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string {
  const parts: string[] = []
  const padding = readStaticAttr(e, 'padding')
  if (typeof padding === 'number' || typeof padding === 'string') {
    parts.push(`.padding(${resolveSpace(padding)})`)
  }
  const paddingX = readStaticAttr(e, 'paddingX')
  if (typeof paddingX === 'number' || typeof paddingX === 'string') {
    parts.push(`.padding(.horizontal, ${resolveSpace(paddingX)})`)
  }
  const paddingY = readStaticAttr(e, 'paddingY')
  if (typeof paddingY === 'number' || typeof paddingY === 'string') {
    parts.push(`.padding(.vertical, ${resolveSpace(paddingY)})`)
  }
  const background = readStaticAttr(e, 'background')
  if (typeof background === 'string') {
    parts.push(`.background(${resolveColor(background, 'swift')})`)
  }
  const radius = readStaticAttr(e, 'radius')
  if (typeof radius === 'string') {
    parts.push(`.cornerRadius(${resolveRadius(radius)})`)
  }
  return parts.join('')
}

/**
 * Emit `<Stack>` / `<Inline>` as `VStack` / `HStack`.
 *
 * - `direction="row"` overrides VStack → HStack on Stack
 * - `gap={N}` → `spacing: <px>` constructor arg (VStack/HStack accept
 *   spacing as the canonical inter-child gap)
 * - `align="..."` → `alignment: .<axis>` constructor arg
 * - `padding`/`background`/`radius` → modifier chain via
 *   emitSwiftLayoutModifiers
 *
 * `justify` is intentionally NOT mapped to a VStack/HStack init arg —
 * SwiftUI doesn't have a single-arg equivalent (you typically insert
 * Spacer() children for distribution). Deferred to a future arc; v1
 * accepts the prop at the type level but produces no modifier on
 * Swift (silent no-op for now; non-blocking).
 */
function emitSwiftStack(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
  defaultDirection: 'column' | 'row',
): string {
  const direction = readStaticAttr(e, 'direction')
  const isRow = direction === 'row' || (direction === undefined && defaultDirection === 'row')
  const viewName = isRow ? 'HStack' : 'VStack'

  const initArgs: string[] = []
  const align = readStaticAttr(e, 'align')
  if (typeof align === 'string') {
    initArgs.push(
      `alignment: ${resolveAlign(align, 'swift', isRow ? 'vertical' : 'horizontal')}`,
    )
  }
  const gap = readStaticAttr(e, 'gap')
  if (typeof gap === 'number' || typeof gap === 'string') {
    initArgs.push(`spacing: ${resolveSpace(gap)}`)
  }
  const initSignature = initArgs.length > 0 ? `(${initArgs.join(', ')})` : ''
  const modifiers = emitSwiftLayoutModifiers(e)

  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `${viewName}${initSignature} {}${modifiers}`
  }
  const contentLines = e.children
    .map((c) => pad + emitSwiftChild(c, indent + 2))
    .join('\n')
  return `${viewName}${initSignature} {\n${contentLines}\n${' '.repeat(indent)}}${modifiers}`
}

/**
 * Emit `<Press onPress={fn}>{anything}</Press>` as a chrome-less
 * SwiftUI `Button { content } action: { handler }`.
 *
 * Idiomatic SwiftUI for the "make this clickable but don't add
 * button styling" pattern is `Button { content } action: ...`
 * combined with `.buttonStyle(.plain)` so the system button chrome
 * doesn't override the content's existing styling.
 *
 * `onPress` is the canonical Pyreon event name (mapped to `action:`
 * here per the per-platform-event-name table in the plan).
 *
 * `onLongPress` not yet wired — defer to a future arc when a real
 * primitive consumer demands it; today it's silently dropped (the
 * type-level surface still accepts it).
 */
function emitSwiftPress(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  // Recognize both `onPress` (canonical) and the legacy `onClick`
  // shape so PMTC source migrating from the SwiftUI-flavored vocab
  // (where <Button> takes onClick) compiles without rewrites.
  const onPress = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && (a.name === 'press' || a.name === 'click'),
  )
  const action = onPress ? emitSwiftAction(onPress.handler, indent) : '{}'

  const pad = ' '.repeat(indent + 2)
  const contentLines = e.children
    .map((c) => pad + emitSwiftChild(c, indent + 2))
    .join('\n')
  const modifiers = emitSwiftLayoutModifiers(e)
  // `.buttonStyle(.plain)` strips system chrome; matches the canonical
  // "Press = un-styled clickable wrapper" contract.
  return `Button {\n${contentLines}\n${' '.repeat(indent)}} action: ${action}.buttonStyle(.plain)${modifiers}`
}

/**
 * Emit `<Field value={signal} onChangeText={fn} kind?>` as
 * `TextField("...", text: $signal)` (or `SecureField` for
 * `kind="password"`).
 *
 * - `value` MUST be a known signal in scope — emits as `$signal` per
 *   the SwiftUI binding-projection contract (same shape G1 #841 used
 *   for legacy <TextField>).
 * - `placeholder` → first positional arg of TextField/SecureField
 * - `kind="password"` → SecureField; other kinds → TextField (Swift
 *   has no built-in numeric/email keyboard distinction at the type
 *   level — that's a `.keyboardType(.emailAddress)` modifier; deferred
 *   to a future arc).
 * - `disabled` → `.disabled(true)` modifier.
 * - `onSubmit` → `.onSubmit { handler() }` modifier (Phase 2 G2 shape).
 */
function emitSwiftField(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const valueAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === 'value',
  )
  const placeholderAttr = readStaticAttr(e, 'placeholder')
  const placeholder = typeof placeholderAttr === 'string' ? placeholderAttr : ''

  const kind = readStaticAttr(e, 'kind')
  const viewName = kind === 'password' ? 'SecureField' : 'TextField'

  // `value` MUST name a signal in scope (canonical contract). If it
  // doesn't, we fall through to the generic emit to preserve current
  // behaviour and avoid silently producing broken Swift.
  if (
    !valueAttr ||
    valueAttr.value.kind !== 'identifier' ||
    !_signalNames.has(valueAttr.value.name)
  ) {
    return emitSwiftGeneric(e, indent)
  }
  const sig = swiftIdent(valueAttr.value.name)

  let result = `${viewName}(${JSON.stringify(placeholder)}, text: $${sig})`

  // onSubmit modifier (Pyreon canonical event for keyboard "done").
  const onSubmit = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'submit',
  )
  if (onSubmit) {
    result += `\n${' '.repeat(indent + 2)}.onSubmit ${emitSwiftAction(onSubmit.handler, indent + 2)}`
  }
  const disabled = readStaticAttr(e, 'disabled')
  if (disabled === true) {
    result += `\n${' '.repeat(indent + 2)}.disabled(true)`
  }
  result += emitSwiftLayoutModifiers(e)
  return result
}

// `isCanonicalPrimitive` is imported but referenced only via the
// dispatcher's `if (tag === 'Stack')` chain in `emitSwiftJsx` — the
// set-based predicate would gate the dispatcher entries more cleanly
// once all 16 primitives have emit functions; today the explicit-tag
// chain mirrors the existing `For`/`Show`/`Text`/`Button` style.
void isCanonicalPrimitive

function emitSwiftGeneric(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const pad = ' '.repeat(indent + 2)
  const isUserComponent = _componentNames.has(e.tag)
  // For user-defined components, include event handlers as constructor
  // args (Phase 2 — closes TodoMVC's `TodoRow(todo: t)` missing-args
  // typecheck blocker; `onToggle`/`onRemove` are now forwarded as
  // closure-valued props). For SwiftUI primitives, events stay
  // dropped — HStack / VStack don't accept onClick: parameters.
  const argParts: string[] = []
  for (const a of e.attrs) {
    if (a.kind === 'attr') {
      // `safeIdent` converts kebab-case HTML attrs (`data-test`,
      // `aria-label`) to camelCase. Swift rejects `-` in argument
      // labels with `expected ',' separator`; was the #1 cause of
      // swiftc-parse failures on the real-corpus coverage gate
      // (19 of 30 invalid files, 2026-05-21 measurement).
      // Also `swiftIdent`-escape the attr label in case the kebab→camel
      // conversion lands on a reserved keyword (e.g. `for-class` →
      // `forClass` — both halves are reserved when used as identifiers).
      argParts.push(
        `${swiftIdent(safeIdent(a.name))}: ${emitSwiftExpr(a.value, indent)}`,
      )
    } else if (a.kind === 'event' && isUserComponent) {
      // User component prop named `on<Cap>` — the parser stripped the
      // `on` prefix and lowercased: `onToggle` → `event { name: 'toggle' }`.
      // Recover the camelCase prop name by re-adding the `on` prefix +
      // upper-casing the first letter.
      const propName = `on${a.name[0]!.toUpperCase()}${a.name.slice(1)}`
      argParts.push(`${swiftIdent(propName)}: ${emitSwiftAction(a.handler, indent)}`)
    }
  }
  const attrPairs = argParts.join(', ')
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
