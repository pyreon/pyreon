// Pyreon IR → Kotlin / Jetpack Compose source.
//
// Mirrors emit-swift.ts but produces idiomatic Compose. Signals map to
// `var x by remember { mutableStateOf(initial) }`, computeds to
// `derivedStateOf { ... }`, JSX elements to Composable function calls.

import {
  isCanonicalPrimitive,
  resolveAlign,
  resolveColor,
  resolveRadius,
  resolveSpace,
} from './canonical-primitives'
import { kotlinIdent, safeIdent } from './identifier-safety'
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

// Mirror of emit-swift.ts's enum-state machinery. See that file's
// `_enumNames` / `_signalEnumTypes` / `_activeEnumType` comment for
// the structural rationale (avoiding ctx-threading at all call sites).
let _enumNames: Set<string> = new Set()
/**
 * Struct name → sorted-field-names key. Mirror of emit-swift.ts's
 * `_structFieldsToName`. See that file for the structural rationale.
 */
let _structFieldsToName: Map<string, string> = new Map()
/** Mirror of emit-swift's `_componentNames`. See that file for rationale. */
let _componentNames: Set<string> = new Set()
let _signalEnumTypes: Map<string, string> = new Map()
let _activeEnumType: string | undefined
/** G1: every signal name in scope — see emit-swift.ts for the rationale. */
let _signalNames: Set<string> = new Set()
/** G2: every function decl name (Parser-A). Mirrors emit-swift's set. */
let _functionNames: Set<string> = new Set()

export function emitKotlin(
  components: ComponentIR[],
  enums: EnumIR[] = [],
  structs: StructIR[] = [],
  moduleDecls: ModuleDeclIR[] = [],
): string {
  _enumNames = new Set(enums.map((e) => e.name))
  // Build the struct-fields key map — mirror of emit-swift's logic.
  _structFieldsToName = new Map()
  for (const s of structs) {
    const key = s.fields.map((f) => f.name).sort().join(',')
    if (!_structFieldsToName.has(key)) _structFieldsToName.set(key, s.name)
  }
  // Build the user-component name set — mirror of emit-swift's logic.
  _componentNames = new Set(components.map((c) => c.name))
  const parts: string[] = []
  // TS-method compat preamble (Phase 2 follow-up). Kotlin's String has
  // `.length` but Collection<T> uses `.size` — so `array.length` (valid
  // TS) is a compile error in Kotlin. The extension below adds `.length`
  // as an extension property on `List<T>`, restoring TS surface parity.
  // Always emitted — minimal cost, harmless when unused (Kotlin's dead-
  // code-elimination handles unreferenced extensions).
  //
  // Other TS-method differences are rewritten at the call site (see
  // emitKotlinExpr's `call` case): `.some(p)` → `.any(p)`, etc.
  if (components.length > 0 || structs.length > 0) {
    parts.push('// Pyreon TS-compat extensions\nprivate val <T> List<T>.length: Int get() = size')
  }
  for (const e of enums) parts.push(emitKotlinEnum(e))
  for (const s of structs) parts.push(emitKotlinStruct(s))
  for (const md of moduleDecls) parts.push(emitKotlinModuleDecl(md))
  for (const c of components) parts.push(emitKotlinComponent(c))
  _enumNames = new Set()
  _structFieldsToName = new Map()
  _componentNames = new Set()
  return parts.join('\n\n')
}

/** Emit a Kotlin `enum class X { a, b, c }`. */
function emitKotlinEnum(e: EnumIR): string {
  return `enum class ${e.name} { ${e.cases.join(', ')} }`
}

/**
 * Emit a Kotlin `@Serializable data class X(var a: T, var b: U)` from
 * a StructIR. `var` (not `val`) keeps fields mutable, mirroring the
 * Swift `struct` emit. Data classes get `.copy(...)` for free —
 * already used by G4's partial-update emit for the same struct.
 *
 * **kotlinx-serialization `@Serializable` annotation** is always
 * emitted — the Kotlin parallel to Swift's Codable conformance.
 * Requires the consumer's Compose project to include the
 * `kotlinx-serialization` plugin + runtime dep. Foundational for:
 *   - Compose `Saver` glue (next Phase 2 PR) — `rememberSaveable`
 *     persistence of `List<Todo>` and other complex types
 *   - DataStore / SharedPreferences serialization
 *   - Cross-platform binding-package compatibility
 *
 * The annotation requires `import kotlinx.serialization.Serializable`
 * at the file top, which this emit doesn't currently produce — Kotlin
 * emit leaves imports to the consumer's project configuration (same
 * convention as the Compose imports). Phase 2 may add an automatic
 * import-emission step if real-app shape surfaces drift.
 */
function emitKotlinStruct(s: StructIR): string {
  const params = s.fields
    .map((f) => `var ${kotlinIdent(f.name)}: ${kotlinType(f.type, undefined, f.name)}`)
    .join(', ')
  return `@Serializable\ndata class ${kotlinIdent(s.name)}(${params})`
}

/**
 * Emit a module-level mutable / immutable binding at file scope.
 * Mirror of emit-swift's `emitSwiftModuleDecl` — same TS-mutability
 * preservation, different syntax.
 *
 *   source: let nextId = 1     →  private var nextId: Int = 1
 *   source: const APP = '1.0'  →  private val APP: String = "1.0"
 */
function emitKotlinModuleDecl(md: ModuleDeclIR): string {
  const kw = md.mutable ? 'var' : 'val'
  const initial = emitKotlinExpr(md.initial, 0)
  if (md.type.kind === 'unknown') {
    return `private ${kw} ${kotlinIdent(md.name)} = ${initial}`
  }
  return `private ${kw} ${kotlinIdent(md.name)}: ${kotlinType(md.type)} = ${initial}`
}

interface KotlinCtx {
  /** Anonymous object types synthesized as named data classes. */
  synthesizedDataClasses: { name: string; fields: { name: string; type: TypeIR }[] }[]
  /** Component name, used to derive synthesized data class names. */
  componentName: string
  /**
   * K2: when emitting a multi-statement body inside a Kotlin lambda
   * passed to a higher-order call (`derivedStateOf { … }`,
   * `remember { … }`, etc.), bare `return` is prohibited — it would
   * try to return from the enclosing function, not the lambda. Kotlin's
   * labeled-return syntax `return@<label> X` solves it; the label is
   * conventionally the receiver function's name.
   *
   * When non-null, `emitKotlinStatement`'s `return` case emits
   * `return@<label> expr` instead of `return expr`. Propagates
   * through nested `if`/`else` blocks via the ctx pass-through.
   */
  lambdaLabel?: string
}

// Module-scoped state for the active component's props-param-name —
// same pattern as emit-swift.ts. Set at the start of each component
// emit so the `member` case can rewrite `props.title` → `title`.
// Reset to undefined after each component.
let _activePropsParamName: string | undefined

function emitKotlinComponent(c: ComponentIR): string {
  _activePropsParamName = c.propsParamName
  // Build the per-component signal-name → enum-type-name map for use
  // at `.set()` call sites — mirrors Swift emit. Note: the type field
  // is read BEFORE emitKotlinDecl runs so the decl emit can see the
  // enum context.
  _signalEnumTypes = new Map()
  _signalNames = new Set()
  _functionNames = new Set()
  // Phase 2 follow-up — track function-typed props so handler emit
  // calls them inside closures. Mirrors emit-swift.ts.
  for (const p of c.props) {
    if (p.type.kind === 'function') _functionNames.add(p.name)
  }
  for (const d of c.decls) {
    if (d.kind === 'signal' && d.type.kind === 'typeRef' && _enumNames.has(d.type.name)) {
      _signalEnumTypes.set(d.name, d.type.name)
    }
    // signal + computed both map to Kotlin `var`/`val`/`derivedStateOf`
    // properties read without parens — same disambiguation as Swift.
    if (d.kind === 'signal' || d.kind === 'computed') _signalNames.add(d.name)
    if (d.kind === 'function') _functionNames.add(d.name)
    // C4: `const router = createRouter(...)` is a remembered router
    // instance — name reads bare (no parens) like a signal. Add to
    // `_signalNames` so JSX `<RouterProvider router={router}>` emits
    // the property reference correctly.
    if (d.kind === 'router') _signalNames.add(d.name)
    // C4: `const navigate = useNavigate()` returns a `(String) -> Unit`
    // closure — register under `_functionNames` so call sites
    // (`navigate("/dashboard")`) emit with parens. `useParams()`
    // returns a Map, which uses `[...]` subscript syntax — NOT a
    // function call, so it stays out of `_functionNames`.
    if (d.kind === 'router-hook' && d.hook === 'navigate') {
      _functionNames.add(d.name)
    }
  }
  const ctx: KotlinCtx = { synthesizedDataClasses: [], componentName: c.name }
  // First pass: walk decls, synthesizing data classes for anonymous object
  // types found in array-of-object signals. The decls themselves are
  // emitted in the second pass so the synthesized type names are stable.
  const declTexts = c.decls.map((d) => emitKotlinDecl(d, ctx))
  const lines: string[] = []
  for (const synth of ctx.synthesizedDataClasses) {
    lines.push(emitKotlinDataClass(synth))
    lines.push('')
  }
  // Props become Composable function parameters. Compose canonical
  // pattern — parent code calls `Card(title = "...", body = "...")`,
  // params are immutable per call.
  //
  // `kotlinIdent` backtick-escapes Kotlin-reserved keywords. User code
  // commonly accepts `class` as a prop name (React/HTML attr leakage)
  // or names functions colliding with `fun` / `val` / etc. — Kotlin
  // accepts ``\`class\`: String`` etc. as a normal identifier.
  const propsList = c.props
    .map((p) => `${kotlinIdent(p.name)}: ${kotlinType(p.type, ctx, p.name)}`)
    .join(', ')
  lines.push(`@Composable`)
  lines.push(`fun ${kotlinIdent(c.name)}(${propsList}) {`)
  for (const declText of declTexts) {
    lines.push(`  ${declText}`)
  }
  lines.push(`  ${emitKotlinExpr(c.returnExpr, 2)}`)
  lines.push(`}`)
  _activePropsParamName = undefined
  _signalNames = new Set()
  _functionNames = new Set()
  return lines.join('\n')
}

function emitKotlinDataClass(synth: {
  name: string
  fields: { name: string; type: TypeIR }[]
}): string {
  const params = synth.fields.map((f) => `val ${f.name}: ${kotlinType(f.type)}`).join(', ')
  return `data class ${synth.name}(${params})`
}

function emitKotlinDecl(d: DeclIR, ctx: KotlinCtx): string {
  if (d.kind === 'signal') {
    // When the signal's declared type is a known enum, set the active-
    // enum context so the initial-value emit rewrites a string literal
    // (`"all"`) as an enum case (`Filter.all`).
    const isEnumTyped = d.type.kind === 'typeRef' && _enumNames.has(d.type.name)
    if (isEnumTyped) _activeEnumType = (d.type as { name: string }).name
    const initial = emitKotlinExpr(d.initial, 0)
    _activeEnumType = undefined
    // G5 — persistent signal via `useStorage<T>('key', default)`. Compose's
    // `rememberSaveable` saves/restores state across configuration changes
    // (rotation, dark-mode flip) and process death-restoration. Same
    // `by` delegate as `remember` → bare reads / writes at use sites
    // continue to work without parens.
    //
    // Phase 2 follow-up — Compose Saver glue. When the type is NOT
    // natively Saveable (Bundle-compatible primitives + enums), emit
    // a kotlinx-serialization JSON-backed `Saver<T, String>` passed
    // via `rememberSaveable(saver = ...)`. Closes G5's known caveat
    // ("`rememberSaveable<List<Todo>>` needs a custom Saver"). The
    // emit assumes the consumer's Compose project includes the
    // `kotlinx-serialization-json` runtime dep (same kotlinx-
    // serialization plugin that #857 already requires for the
    // `@Serializable` data class annotation).
    //
    // Native types continue to use the direct shape — no Saver
    // overhead when not needed. Native iff `kind in {string,
    // number, boolean}` OR a known enum (G6 emit produces enum
    // class with Bundle-friendly String raw value).
    const isStorage = d.storageKey !== undefined
    const usesPyreonRuntime = isStorage && !isRememberSaveableNativeType(d.type)
    const typeStr = kotlinType(d.type, ctx, d.name)

    // Phase 2.5: non-native storage types use rememberPyreonStorage<T>
    // from @pyreon/native-runtime-kotlin (PR #887) — collapses the
    // previous 4-line Saver boilerplate to one line at the call site.
    // Same MutableState<T> projection, same `by` delegate, but with
    // a pluggable backend (InMemoryBackend default, DataStoreBackend
    // for real cross-launch persistence).
    //
    // Consumer apps must `import com.pyreon.runtime.rememberPyreonStorage`
    // for the symbol to resolve. The compiler doesn't auto-emit imports —
    // same convention as @AppStorage on iOS (requires `import SwiftUI`).
    //
    // Pre-2.5: hand-rolled `Saver<T, String>` inlining `Json.encodeToString` /
    // `Json.decodeFromString`. Identical Compose-state behaviour at runtime;
    // just dramatically more emit code AND tied to `rememberSaveable`'s
    // configuration-change semantics rather than real cross-launch
    // persistence. The new shape (when backed by DataStoreBackend in real
    // apps) survives process restart too — matching the iOS @AppStorage
    // contract.
    if (usesPyreonRuntime) {
      if (d.type.kind === 'array' && d.initial.kind === 'array' && d.initial.elements.length === 0) {
        return `var ${kotlinIdent(d.name)} by rememberPyreonStorage<${typeStr}>(${JSON.stringify(d.storageKey)}, listOf())`
      }
      return `var ${kotlinIdent(d.name)} by rememberPyreonStorage<${typeStr}>(${JSON.stringify(d.storageKey)}, ${initial})`
    }

    // Native types continue to use the direct shape — no Pyreon runtime
    // dependency when not needed. Native iff `kind in {string, number,
    // boolean}` OR a known enum (G6 emit produces enum class with
    // Bundle-friendly String raw value).
    const wrapperFn = isStorage ? 'rememberSaveable' : 'remember'
    if (d.type.kind === 'array' && d.initial.kind === 'array' && d.initial.elements.length === 0) {
      return `var ${kotlinIdent(d.name)} by ${wrapperFn} { mutableStateOf<${typeStr}>(listOf()) }`
    }
    return `var ${kotlinIdent(d.name)} by ${wrapperFn} { mutableStateOf(${initial}) }`
  }
  if (d.kind === 'function') {
    return emitKotlinFunction(d, ctx)
  }
  // C4: router instance — `const router = createRouter({...})` →
  // `val router = remember { PyreonRouter() }`. Compose's `remember`
  // hoists the instance across recompositions; PyreonRouter holds
  // path stack + params as MutableState fields so changes propagate
  // through CompositionLocal to RouterProvider / RouterView.
  // The createRouter() routes config is dropped — routes are wired
  // by the host via `NavHost { composable("/path") { ... } }`.
  if (d.kind === 'router') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonRouter() }`
  }
  // C4: router hook — `const navigate = useNavigate()` → as-is.
  // Compose's `useNavigate()` is a `@Composable` function that reads
  // `LocalPyreonRouter.current` directly via CompositionLocal — no
  // explicit router arg needed (unlike Swift). `useParams()` follows
  // the same shape.
  if (d.kind === 'router-hook') {
    const fn = d.hook === 'navigate' ? 'useNavigate' : 'useParams'
    return `val ${kotlinIdent(d.name)} = ${fn}()`
  }
  // computed → derivedStateOf, accessed via the `by` delegate.
  // Phase 2 follow-up: multi-statement body emits as a block lambda
  // with explicit statements + return. Single-expression form stays
  // inline.
  //
  // K2: the multi-statement body's `return X` statements must use
  // Kotlin's labeled-return form (`return@derivedStateOf X`) because
  // bare `return` inside a lambda passed to a higher-order function
  // tries to return from the enclosing function — kotlinc rejects with
  //   error: 'return' is prohibited here
  // Setting `lambdaLabel` on the per-body ctx threads the label through
  // nested `if`/`else` branches via `emitKotlinStatement`'s recursive
  // ctx-pass.
  if (d.body !== undefined) {
    const bodyCtx: KotlinCtx = { ...ctx, lambdaLabel: 'derivedStateOf' }
    const bodyLines = d.body
      .map((s) => `      ${emitKotlinStatement(s, 6, bodyCtx)}`)
      .join('\n')
    return [
      `val ${kotlinIdent(d.name)} by remember { derivedStateOf {`,
      bodyLines,
      `    } }`,
    ].join('\n')
  }
  return `val ${kotlinIdent(d.name)} by remember { derivedStateOf { ${emitKotlinExpr(d.expr!, 0)} } }`
}

/**
 * Emit `const fn = () => { ... }` as a Kotlin local function inside the
 * Composable. Parser-A from the TodoMVC walkthrough. Mirrors the Swift
 * emit's body shape.
 *
 * Body rendering:
 *   - Single \`{ kind: 'return', expr }\` → \`fun fn(): T = expr\` (
 *     single-expression body form; idiomatic Kotlin)
 *   - Multi-statement → full block with explicit returns
 */
function emitKotlinFunction(
  d: Extract<DeclIR, { kind: 'function' }>,
  ctx: KotlinCtx,
): string {
  const params = d.params
    .map((p) => `${kotlinIdent(p.name)}: ${kotlinType(p.type, ctx, p.name)}`)
    .join(', ')
  // Kotlin function return-type clause. Unknown return type degrades
  // to `Unit` (void); a known return type emits as `: T`.
  const retType = d.returnType.kind === 'unknown' ? '' : `: ${kotlinType(d.returnType, ctx)}`
  if (
    d.body.length === 1 &&
    d.body[0]!.kind === 'return' &&
    d.body[0]!.expr !== undefined
  ) {
    const concise = emitKotlinExpr((d.body[0]! as { expr: ExprIR }).expr, 0)
    return `fun ${kotlinIdent(d.name)}(${params})${retType} = ${concise}`
  }
  const bodyLines = d.body
    .map((s) => `    ${emitKotlinStatement(s, 4, ctx)}`)
    .join('\n')
  return `fun ${kotlinIdent(d.name)}(${params})${retType} {\n${bodyLines}\n  }`
}

function emitKotlinStatement(s: StatementIR, indent: number, ctx: KotlinCtx): string {
  switch (s.kind) {
    case 'let':
      return `val ${kotlinIdent(s.name)} = ${emitKotlinExpr(s.expr, indent)}`
    case 'return': {
      // K2: emit `return@<label> expr` inside labeled lambda contexts
      // (e.g. multi-statement `derivedStateOf { … }` bodies) so kotlinc
      // doesn't reject with "'return' is prohibited here".
      const keyword = ctx.lambdaLabel ? `return@${ctx.lambdaLabel}` : 'return'
      return s.expr ? `${keyword} ${emitKotlinExpr(s.expr, indent)}` : keyword
    }
    case 'expr':
      return emitKotlinExpr(s.expr, indent)
    case 'if': {
      const pad = ' '.repeat(indent)
      const cond = emitKotlinExpr(s.cond, indent)
      const thenLines = s.then
        .map((t) => `${pad}  ${emitKotlinStatement(t, indent + 2, ctx)}`)
        .join('\n')
      const head = `if (${cond}) {\n${thenLines}\n${pad}}`
      if (!s.elseBody) return head
      const elseLines = s.elseBody
        .map((t) => `${pad}  ${emitKotlinStatement(t, indent + 2, ctx)}`)
        .join('\n')
      return `${head} else {\n${elseLines}\n${pad}}`
    }
  }
}

/**
 * Exported for unit-testable coverage of the TS→Kotlin type mapper
 * surface (roadmap PR 5a). Internal callers should still go through
 * `emitKotlin()` for the full component-level emit.
 */
/**
 * Predicate: is this type natively Saveable by Compose's
 * `rememberSaveable` without a custom Saver? Native types are:
 *   - primitives (Int, Long, Float, Double, Boolean, String, Char)
 *   - known enums (G6 emit produces `enum class X` which is
 *     bundleable via the enum's name/ordinal)
 *   - Optional<T> where T is native (`T | null` / `T | undefined`)
 *
 * Non-native types (arrays of data classes, nested objects, mixed
 * unions) need a custom Saver — Phase 2's Compose Saver glue emits
 * a kotlinx-serialization JSON-backed `Saver<T, String>` for those.
 *
 * Mirror of emit-swift.ts's `isAppStorageNativeType`. The two
 * predicates are structurally similar but reflect each platform's
 * native-saveable type set (which differ slightly — Compose's
 * Bundle accepts more types than @AppStorage's UserDefaults).
 */
function isRememberSaveableNativeType(t: TypeIR): boolean {
  switch (t.kind) {
    case 'string':
    case 'number':
    case 'boolean':
      return true
    case 'typeRef':
      return t.args.length === 0 && _enumNames.has(t.name)
    case 'union': {
      const nulls = t.branches.filter(
        (b) => b.kind === 'null' || b.kind === 'undefined',
      ).length
      const others = t.branches.filter(
        (b) => b.kind !== 'null' && b.kind !== 'undefined',
      )
      return nulls > 0 && others.length === 1 && isRememberSaveableNativeType(others[0]!)
    }
    default:
      return false
  }
}

export function kotlinType(t: TypeIR, ctx?: KotlinCtx, signalName?: string): string {
  switch (t.kind) {
    case 'number':
      return 'Int'
    case 'string':
      return 'String'
    case 'boolean':
      return 'Boolean'
    case 'array':
      return `List<${kotlinType(t.element, ctx, signalName)}>`
    case 'object': {
      // Anonymous object types are synthesized as named data classes per
      // component. Class name derives from the component + signal name:
      // `Sum` + `items` → `SumItem`. Idempotent across decls in the same
      // component (same shape ⇒ same name).
      if (!ctx) return 'Any'
      const fields = t.fields
      const name = synthesizeDataClassName(ctx.componentName, signalName)
      const existing = ctx.synthesizedDataClasses.find((s) => s.name === name)
      if (!existing) ctx.synthesizedDataClasses.push({ name, fields })
      return name
    }
    case 'null':
    case 'undefined':
      // Bare null/undefined outside a union — Kotlin has no first-class
      // null type; degrade to `Any?`.
      return 'Any?'
    case 'union':
      return kotlinUnionType(t.branches, ctx, signalName)
    case 'typeRef': {
      // `Foo` → `Foo`; `Array<T>` → `List<T>` (Kotlin's stdlib uses
      // List/Set/Map for these). Other typeRefs pass through verbatim.
      if (t.name === 'Array' && t.args.length === 1) {
        return `List<${kotlinType(t.args[0]!, ctx, signalName)}>`
      }
      if (t.name === 'Promise' && t.args.length === 1) {
        // Kotlin's coroutines model — Promise<T> ≈ suspend function
        // returning T, OR Deferred<T> from kotlinx.coroutines. PR 5e
        // (async) decides; for now emit `Deferred<T>` as the closest
        // shape.
        return `Deferred<${kotlinType(t.args[0]!, ctx, signalName)}>`
      }
      if (t.args.length === 0) return t.name
      return `${t.name}<${t.args.map((a) => kotlinType(a, ctx, signalName)).join(', ')}>`
    }
    case 'function': {
      // Kotlin function types: `(P1, P2) -> R`. `unknown` return →
      // `Unit` (Kotlin's void equivalent).
      const paramTypes = t.params.map((p) => kotlinType(p.type, ctx, signalName)).join(', ')
      const returnTypeName =
        t.returnType.kind === 'unknown' ? 'Unit' : kotlinType(t.returnType, ctx, signalName)
      return `(${paramTypes}) -> ${returnTypeName}`
    }
    default:
      return 'Any'
  }
}

/**
 * Kotlin handles nullability via `T?`. Common-case mapping:
 *   - `T | null` / `T | undefined` → `T?`
 *   - Mixed-type union → `Any?` (Kotlin has no structural union; the
 *     `Any?` floor is the safe Kotlin equivalent)
 */
function kotlinUnionType(
  branches: TypeIR[],
  ctx: KotlinCtx | undefined,
  signalName: string | undefined,
): string {
  const nonNullBranches = branches.filter(
    (b) => b.kind !== 'null' && b.kind !== 'undefined',
  )
  const hasNullish = branches.some((b) => b.kind === 'null' || b.kind === 'undefined')
  if (nonNullBranches.length === 1 && hasNullish) {
    return `${kotlinType(nonNullBranches[0]!, ctx, signalName)}?`
  }
  if (nonNullBranches.length === 0) return 'Any?'
  return 'Any'
}

function synthesizeDataClassName(componentName: string, signalName?: string): string {
  // `TodoList` + `items` → `TodoListItem`
  // `TodoList` + `entries` → `TodoListEntry`
  // Fallback: `TodoListData`
  if (!signalName) return `${componentName}Data`
  const stripped = signalName.endsWith('s') ? signalName.slice(0, -1) : signalName
  return componentName + stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

function emitKotlinExpr(e: ExprIR, indent: number): string {
  switch (e.kind) {
    case 'literal':
      if (typeof e.value === 'string') {
        // Rewrite string-literal → enum-case (`Filter.all`) when in a
        // known enum-typed context. Kotlin requires the enum-name
        // qualifier (vs Swift's `.case` type-inferred shorthand).
        if (_activeEnumType !== undefined) {
          return `${_activeEnumType}.${e.value}`
        }
        return JSON.stringify(e.value)
      }
      if (typeof e.value === 'boolean') return e.value ? 'true' : 'false'
      return String(e.value)
    case 'identifier':
      return kotlinIdent(e.name)
    case 'call': {
      // `signal.set(x)` → `signal = x` (Kotlin's `by mutableStateOf` is a var).
      if (e.callee.kind === 'member' && e.callee.property === 'set') {
        const target = emitKotlinExpr(e.callee.object, indent)
        // Enum-aware: when the target signal is enum-typed, set the
        // active-enum context so a string-literal arg rewrites to a
        // qualified enum case. Mirrors the Swift emit's pattern.
        let prevEnumType: string | undefined
        if (e.callee.object.kind === 'identifier') {
          const enumType = _signalEnumTypes.get(e.callee.object.name)
          if (enumType !== undefined) {
            prevEnumType = _activeEnumType
            _activeEnumType = enumType
          }
        }
        const value = e.args[0] ? emitKotlinExpr(e.args[0], indent) : '0'
        if (prevEnumType !== undefined || _activeEnumType !== undefined) {
          _activeEnumType = prevEnumType
        }
        return `${target} = ${value}`
      }
      // Disambiguate signal/computed read vs function call for zero-
      // arg identifier calls — same rationale as emit-swift.ts.
      // Known function decl: keep parens (function call). Everything
      // else (signal/computed/undeclared): bare emit so undeclared
      // identifiers continue to round-trip via Kotlin's auto-read
      // delegated `var by` shape.
      if (e.callee.kind === 'identifier' && e.args.length === 0) {
        if (_functionNames.has(e.callee.name)) {
          return `${kotlinIdent(e.callee.name)}()`
        }
        return kotlinIdent(e.callee.name)
      }
      // TS-method translation (Phase 2 follow-up). When the callee is a
      // member expression naming a known TS method with a different
      // Kotlin name, rewrite. Closes the remaining TS-method typecheck
      // blockers beyond what the `length` extension preamble handles:
      //
      //   X.some(p)     →  X.any(p)
      //   X.every(p)    →  X.all(p)
      //   X.includes(v) →  X.contains(v)
      //   X.indexOf(v)  →  X.indexOf(v)  (same name, passes through)
      //   X.find(p)     →  X.find(p)     (same name + same lambda contract)
      //   X.trim()      →  X.trim()      (same name + same contract)
      //
      // `.filter` / `.map` / `.reduce` / `.forEach` already match
      // semantically and pass through unchanged.
      if (e.callee.kind === 'member') {
        const obj = emitKotlinExpr(e.callee.object, indent)
        const prop = e.callee.property
        const argExprs = e.args.map((a) => emitKotlinExpr(a, indent))
        switch (prop) {
          case 'some':
            if (e.args.length === 1) {
              return `${obj}.any(${argExprs[0]!})`
            }
            break
          case 'every':
            if (e.args.length === 1) {
              return `${obj}.all(${argExprs[0]!})`
            }
            break
          case 'includes':
            if (e.args.length === 1) {
              return `${obj}.contains(${argExprs[0]!})`
            }
            break
        }
      }
      const callee = emitKotlinExpr(e.callee, indent)
      const args = e.args.map((a) => emitKotlinExpr(a, indent)).join(', ')
      return `${callee}(${args})`
    }
    case 'member': {
      // Rewrite `<propsParamName>.X` → `X`. The active component's
      // props-param binding is exposed as direct function parameters
      // in the Composable signature, so the user-source `props.title`
      // becomes a bare `title` reference in the function body.
      if (
        _activePropsParamName !== undefined &&
        e.object.kind === 'identifier' &&
        e.object.name === _activePropsParamName
      ) {
        return kotlinIdent(e.property)
      }
      return `${emitKotlinExpr(e.object, indent)}.${kotlinIdent(e.property)}`
    }
    case 'binary':
      return `${emitKotlinExpr(e.left, indent)} ${e.op} ${emitKotlinExpr(e.right, indent)}`
    case 'comparison': {
      // Pyreon `===` / `!==` already coalesced to `==` / `!=` at parse;
      // Kotlin's `==` is structural-equality (matches what Pyreon source
      // expects). `!=` is the negation.
      //
      // K1: enum-aware comparison. When the LHS is a known enum-typed
      // signal read (`filter()` where `filter: Filter`), wrap the RHS
      // emit with `_activeEnumType` so a string literal rewrites to a
      // qualified case (`"active"` → `Filter.active`). Mirrors the
      // existing `.set()` enum-aware emit and the iOS comparison branch
      // (search `_activeEnumType` in emit-swift.ts for the structural
      // reference).
      //
      // Without this rewrite, kotlinc rejects the emit with
      //   "operator '==' cannot be applied to 'Filter' and 'String'"
      // because Kotlin's `==` is type-checked (unlike JS's `===`,
      // which the source uses freely across the enum/string boundary).
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
      const leftStr = emitKotlinExpr(e.left, indent)
      const rightStr = emitKotlinExpr(e.right, indent)
      if (prevEnumType !== undefined || _activeEnumType !== undefined) {
        _activeEnumType = prevEnumType
      }
      return `${leftStr} ${e.op} ${rightStr}`
    }
    case 'unary':
      // Parser-B: prefix unary. Kotlin accepts `!x`, `-x`, `+x` verbatim.
      return `${e.op}${emitKotlinExpr(e.argument, indent)}`
    case 'logical':
      // Parser-C: short-circuit logical. Kotlin `&&` / `||` semantics
      // match JS.
      return `${emitKotlinExpr(e.left, indent)} ${e.op} ${emitKotlinExpr(e.right, indent)}`
    case 'ternary':
      // Kotlin doesn't have a ternary operator; the idiomatic form is
      // an if-expression. Same value semantics.
      return `if (${emitKotlinExpr(e.cond, indent)}) ${emitKotlinExpr(e.then, indent)} else ${emitKotlinExpr(e.otherwise, indent)}`
    case 'update':
      // `x++` / `x--` post-increment/decrement in expression position.
      // Returns the OLD value and mutates the variable (JS semantics).
      //
      // Kotlin natively supports `++` / `--` as both statements AND
      // expressions on `var` bindings — same semantics as JS post-
      // increment. Emit verbatim.
      //
      // Pre-fix shape was `x + 1` / `x - 1` — DOUBLY broken:
      //   1. Returns the NEW value (x+1) instead of the OLD value (x) —
      //      off-by-one. TodoMVC's `id: nextId++` got id=2 on first
      //      call (should be id=1).
      //   2. Drops the side-effect entirely — `nextId` never
      //      incremented. Every new Todo got id=2 forever.
      return `${emitKotlinExpr(e.argument, indent)}${e.op}`
    case 'arrow':
      if (e.params.length === 0) return `{ ${emitKotlinExpr(e.body, indent)} }`
      return `{ ${e.params.map(kotlinIdent).join(', ')} -> ${emitKotlinExpr(e.body, indent)} }`
    case 'jsx-element':
      return emitKotlinJsx(e, indent)
    case 'jsx-fragment': {
      const pad = ' '.repeat(indent + 2)
      const body = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
      return `Column {\n${body}\n${' '.repeat(indent)}}`
    }
    case 'array': {
      // Array spread (`[...todos(), x]`) → Kotlin `+` concat
      // (preserves source's value-semantics).
      const spreadIdx = e.elements.findIndex((el) => el.kind === 'spread')
      if (spreadIdx === 0) {
        const spread = e.elements[0]! as Extract<ExprIR, { kind: 'spread' }>
        const tail = e.elements.slice(1)
        const tailRendered = tail.map((el) => emitKotlinExpr(el, indent)).join(', ')
        if (tail.length === 0) return emitKotlinExpr(spread.argument, indent)
        return `${emitKotlinExpr(spread.argument, indent)} + listOf(${tailRendered})`
      }
      return `listOf(${e.elements.map((el) => emitKotlinExpr(el, indent)).join(', ')})`
    }
    case 'spread':
      return emitKotlinExpr(e.argument, indent)
    case 'object': {
      // G4 — partial-update form. When the object has EXACTLY ONE
      // spread and that spread argument is a bare identifier (typical
      // shape: `{ ...t, done: !t.done }` inside a `.map(t => ...)`
      // callback), emit Kotlin's idiomatic data class `.copy(...)`:
      //
      //   { ...t, done: !t.done }   →   t.copy(done = !t.done)
      //
      // Other shapes (multi-spread, non-identifier spread, no spread
      // with overrides) fall through to the existing `(field = value)`
      // tuple-literal emit.
      if (e.spreads && e.spreads.length === 1 && e.spreads[0]!.kind === 'identifier') {
        const target = emitKotlinExpr(e.spreads[0]!, indent)
        const overrides = e.fields
          .map((f) => `${f.name} = ${emitKotlinExpr(f.value, indent)}`)
          .join(', ')
        return `${target}.copy(${overrides})`
      }
      // Phase 2 follow-up — when no spread + field-set matches a known
      // struct exactly, emit as data-class constructor call. Kotlin's
      // data-class constructor uses named arguments so the source order
      // can differ from the declared order (clearer than Swift's struct
      // init which requires order match). See emit-swift.ts for the
      // structural rationale.
      if (!e.spreads || e.spreads.length === 0) {
        const fieldSet = e.fields.map((f) => f.name).sort().join(',')
        const structName = _structFieldsToName.get(fieldSet)
        if (structName !== undefined) {
          const args = e.fields
            .map((f) => `${f.name} = ${emitKotlinExpr(f.value, indent)}`)
            .join(', ')
          return `${kotlinIdent(structName)}(${args})`
        }
      }
      const fields = e.fields.map((f) => `${f.name} = ${emitKotlinExpr(f.value, indent)}`).join(', ')
      return `(${fields})`
    }
    case 'paren':
      return `(${emitKotlinExpr(e.inner, indent)})`
  }
}

function emitKotlinJsx(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const tag = e.tag
  if (tag === 'For') return emitKotlinFor(e, indent)
  if (tag === 'Show') return emitKotlinShow(e, indent)
  if (tag === 'Text') return emitKotlinText(e, indent)
  if (tag === 'Button') return emitKotlinButton(e, indent)
  if (tag === 'TextField') return emitKotlinTextField(e, indent)
  // Phase B — canonical multi-platform primitives (@pyreon/primitives).
  // Mirror of emit-swift.ts's Phase B dispatcher entries. Per-primitive
  // emit functions consult the shared canonical-primitives.ts helpers
  // (token resolution, name maps) so iOS + Android stay in lockstep.
  if (tag === 'Stack') return emitKotlinStack(e, indent, /*defaultDirection*/ 'column')
  if (tag === 'Inline') return emitKotlinStack(e, indent, /*defaultDirection*/ 'row')
  if (tag === 'Press') return emitKotlinPress(e, indent)
  if (tag === 'Field') return emitKotlinField(e, indent)
  if (tag === 'Toggle') return emitKotlinToggle(e, indent)
  if (tag === 'Link') return emitKotlinLink(e, indent)
  if (tag === 'RouterProvider') return emitKotlinRouterProvider(e, indent)
  if (tag === 'RouterView') return emitKotlinRouterView(e, indent)
  // 8 other canonical primitives fall through to generic emit until
  // real apps demand each (see emit-swift.ts comment).
  return emitKotlinGeneric(e, indent)
}

/**
 * Emit `<TextField value={signal} onInput={...}>` as a Compose
 * `TextField(value, onValueChange)`. G1 from the TodoMVC walkthrough.
 *
 * Compose's idiom maps to Pyreon's directly: `value` + `onValueChange`
 * is the structural equivalent of Pyreon's `value` + `onInput`. The
 * pattern detection here is symmetric to the Swift emitter, but the
 * emit shape is simpler — no binding-projection magic needed.
 *
 * Pattern: bare-identifier `value` attr matching a known signal in
 * scope → emit `TextField(value = signal, onValueChange = { signal = it })`.
 * Anything else → generic emit.
 */
function emitKotlinTextField(
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
  if (
    valueAttr &&
    valueAttr.value.kind === 'identifier' &&
    _signalNames.has(valueAttr.value.name)
  ) {
    const sig = kotlinIdent(valueAttr.value.name)
    // Placeholder maps to Compose's `placeholder = { Text(...) }` slot.
    const placeholder =
      placeholderAttr && placeholderAttr.value.kind === 'literal'
        ? `, placeholder = { Text(${JSON.stringify(String(placeholderAttr.value.value))}) }`
        : ''
    // G2 — pattern-match onKeyDown={(e) => e.key === 'Enter' && action()}
    // and pair Compose's `keyboardOptions` (so the IME shows "Done") with
    // `keyboardActions = KeyboardActions(onDone = { action() })`.
    const submit = extractEnterSubmitAction(e.attrs)
    const keyboardArgs = submit
      ? `, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { ${emitKotlinExpr(submit, indent + 2)} })`
      : ''
    return `TextField(value = ${sig}, onValueChange = { ${sig} = it }${keyboardArgs}${placeholder})`
  }
  return emitKotlinGeneric(e, indent)
}

/**
 * G2 — pattern-match the canonical "submit on Enter" shape:
 *
 *   onKeyDown={(e) => e.key === 'Enter' && action()}
 *
 * Same shape as Swift's helper — see emit-swift.ts:extractEnterSubmitAction
 * for the contract.
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

function emitKotlinText(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  if (e.children.length === 0) return `Text(text = "")`
  if (e.children.length === 1 && e.children[0]!.kind === 'text') {
    return `Text(text = ${JSON.stringify(e.children[0]!.value)})`
  }
  const parts: string[] = []
  for (const c of e.children) {
    if (c.kind === 'text') parts.push(escapeKotlinInterp(c.value))
    else parts.push(`\${${emitKotlinExpr(c.expr, indent)}}`)
  }
  return `Text(text = "${parts.join('')}")`
}

function emitKotlinButton(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  // Phase B: accept canonical `onPress` AND legacy `onClick` event names
  // — same Compose Button shape (`onClick = ...`) either way. The
  // canonical name lets multi-platform PMTC source align across iOS +
  // Android (Phase E migrates TodoMVC source from onClick to onPress).
  const handler = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && (a.name === 'click' || a.name === 'press'),
  )
  const labelText = extractStaticText(e.children)
  const action = handler ? emitKotlinAction(handler.handler, indent) : '{}'
  const pad = ' '.repeat(indent + 2)
  if (labelText !== null) {
    return `Button(onClick = ${action}) {\n${pad}Text(${JSON.stringify(labelText)})\n${' '.repeat(indent)}}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `Button(onClick = ${action}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

function emitKotlinAction(handler: ExprIR, indent: number): string {
  if (handler.kind === 'arrow') {
    // Preserve arrow parameter names in the Kotlin lambda.
    // `(t) => draft.set(t)` → `{ t -> draft = t }` (NOT
    // `{ draft = t }` which leaves `t` unresolved). Kotlin lambdas
    // expose the single param as `it` by default; named params via
    // `name -> body`. Multi-param: `(a, b) -> body`.
    if (handler.params.length === 0) {
      return `{ ${emitKotlinExpr(handler.body, indent)} }`
    }
    const paramList = handler.params.map(kotlinIdent).join(', ')
    return `{ ${paramList} -> ${emitKotlinExpr(handler.body, indent)} }`
  }
  // Resolve to a function-typed identifier (bare OR props-member),
  // mirroring emit-swift.ts:resolveFunctionHandler. Closes the
  // `Button { onRemove }` no-op trap for both handler shapes.
  if (handler.kind === 'identifier' && _functionNames.has(handler.name)) {
    return `{ ${kotlinIdent(handler.name)}() }`
  }
  if (
    handler.kind === 'member' &&
    _activePropsParamName !== undefined &&
    handler.object.kind === 'identifier' &&
    handler.object.name === _activePropsParamName &&
    _functionNames.has(handler.property)
  ) {
    return `{ ${kotlinIdent(handler.property)}() }`
  }
  return `{ ${emitKotlinExpr(handler, indent)} }`
}

function emitKotlinFor(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const each = e.attrs.find((a) => a.kind === 'attr' && a.name === 'each') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const by = e.attrs.find((a) => a.kind === 'attr' && a.name === 'by') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const renderArrow = e.children.find(
    (c) => c.kind === 'expr' && c.expr.kind === 'arrow',
  ) as Extract<ChildIR, { kind: 'expr' }> | undefined

  const items = each ? emitKotlinSignalRead(each.value) : 'items'
  const idPath = by && by.value.kind === 'arrow' ? extractMemberPath(by.value.body) : 'id'

  if (!renderArrow || renderArrow.expr.kind !== 'arrow') {
    return `LazyColumn {\n${' '.repeat(indent + 2)}items(${items}, key = { it.${idPath} }) {}\n${' '.repeat(indent)}}`
  }
  const arrow = renderArrow.expr as Extract<ExprIR, { kind: 'arrow' }>
  const param = arrow.params[0] ?? 'item'
  const body = arrow.body
  const pad = ' '.repeat(indent + 4)
  const close = ' '.repeat(indent + 2)
  const outerClose = ' '.repeat(indent)
  return (
    `LazyColumn {\n` +
    `${' '.repeat(indent + 2)}items(${items}, key = { it.${idPath} }) { ${param} ->\n` +
    `${pad}${emitKotlinExpr(body, indent + 4)}\n` +
    `${close}}\n` +
    `${outerClose}}`
  )
}

function emitKotlinShow(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const when = e.attrs.find((a) => a.kind === 'attr' && a.name === 'when') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const cond = when ? emitKotlinSignalRead(when.value) : 'true'
  const pad = ' '.repeat(indent + 2)
  const body = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `if (${cond}) {\n${body}\n${' '.repeat(indent)}}`
}

/**
 * K3: map SwiftUI-flavored layout container names that the canonical
 * TodoMVC source uses (`VStack`, `HStack`, `ZStack`) to their
 * Jetpack Compose equivalents (`Column`, `Row`, `Box`). Without this
 * the emit ships `VStack { … }` literally — kotlinc rejects with
 *   error: unresolved reference 'VStack'.
 *
 * The mapping deliberately runs ONLY on generic-element emit, AFTER
 * the dispatcher in `emitKotlinJsx` has carved out the
 * framework-recognized tags (`Text`, `Button`, `TextField`, `For`,
 * `Show`). Those tags use universal naming and would map to themselves
 * anyway; carving them out first keeps the mapping table small.
 *
 * Strategic note: the long-term PMTC story is to define a CANONICAL
 * layout DSL (probably `Column`/`Row`/`Box` since they map most
 * cleanly onto Compose AND swiftc accepts them as user-defined names)
 * and have the iOS emit translate the other direction. This table is
 * a tactical fix that closes the K3 typecheck error TODAY; the DSL
 * decision is tracked in `.claude/plans/native-platforms-phase1-roadmap.md`.
 *
 * Single source of truth: user-defined Composables that happen to be
 * named `VStack`/`HStack`/`ZStack` will collide with this rewrite.
 * Acceptable cost for the multi-target demo phase — apps can rename.
 */
const SWIFTUI_TO_COMPOSE_LAYOUT_NAMES: Record<string, string> = {
  VStack: 'Column',
  HStack: 'Row',
  ZStack: 'Box',
}

function mapJsxTagToCompose(tag: string): string {
  return SWIFTUI_TO_COMPOSE_LAYOUT_NAMES[tag] ?? tag
}

// ============================================================================
// Phase B — canonical multi-platform primitive emit functions.
//
// Each function reads canonical Pyreon props (per `@pyreon/primitives`)
// and emits the idiomatic Compose shape. Token resolution
// (padding/gap/color/etc.) routes through the shared
// `canonical-primitives.ts` helpers so iOS + Android stay in lockstep.
// ============================================================================

/**
 * Read a static attribute as a literal, ignoring spreads + dynamic exprs.
 * Returns undefined when absent or not a static literal.
 */
function readStaticAttrKotlin(
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
 * Build the Compose `Modifier` chain for the canonical layout-prop
 * subset. Returns a string ready to pass as the `modifier =` constructor
 * arg, OR empty string when no relevant props are present.
 *
 * Compose uses `Modifier` chains; Swift uses trailing modifiers — the
 * key per-target difference. Both consume the same canonical input
 * via the shared `resolveSpace`/`resolveColor`/`resolveRadius` helpers.
 */
function emitKotlinLayoutModifier(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string {
  const parts: string[] = []
  const padding = readStaticAttrKotlin(e, 'padding')
  if (typeof padding === 'number' || typeof padding === 'string') {
    parts.push(`.padding(${resolveSpace(padding)}.dp)`)
  }
  const paddingX = readStaticAttrKotlin(e, 'paddingX')
  if (typeof paddingX === 'number' || typeof paddingX === 'string') {
    parts.push(`.padding(horizontal = ${resolveSpace(paddingX)}.dp)`)
  }
  const paddingY = readStaticAttrKotlin(e, 'paddingY')
  if (typeof paddingY === 'number' || typeof paddingY === 'string') {
    parts.push(`.padding(vertical = ${resolveSpace(paddingY)}.dp)`)
  }
  const background = readStaticAttrKotlin(e, 'background')
  if (typeof background === 'string') {
    parts.push(`.background(${resolveColor(background, 'kotlin')})`)
  }
  const radius = readStaticAttrKotlin(e, 'radius')
  if (typeof radius === 'string') {
    // Bare `RoundedCornerShape` — consumer imports from
    // androidx.compose.foundation.shape. Same convention as Color +
    // @Serializable.
    parts.push(`.clip(RoundedCornerShape(${resolveRadius(radius)}.dp))`)
  }
  if (parts.length === 0) return ''
  return `Modifier${parts.join('')}`
}

/**
 * Emit `<Stack>` / `<Inline>` as Compose `Column` / `Row`.
 *
 * - `direction="row"` switches Column → Row on Stack
 * - `gap={N}` → `verticalArrangement = Arrangement.spacedBy(N.dp)` on
 *   Column / `horizontalArrangement = ...` on Row
 * - `align="..."` → `horizontalAlignment = Alignment.X` on Column /
 *   `verticalAlignment = Alignment.Y` on Row
 * - `padding`/`background`/`radius` → `modifier = Modifier...` chain
 *
 * `justify` is intentionally NOT mapped here — Compose's
 * `verticalArrangement` / `horizontalArrangement` already covers most
 * justify-style placement (and `gap` consumes the verticalArrangement
 * slot). Deferred to a future arc; v1 silently no-ops `justify` on
 * Kotlin to match Swift's deferral.
 */
function emitKotlinStack(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
  defaultDirection: 'column' | 'row',
): string {
  const direction = readStaticAttrKotlin(e, 'direction')
  const isRow = direction === 'row' || (direction === undefined && defaultDirection === 'row')
  const composable = isRow ? 'Row' : 'Column'

  const initArgs: string[] = []
  // gap → arrangement
  const gap = readStaticAttrKotlin(e, 'gap')
  if (typeof gap === 'number' || typeof gap === 'string') {
    const arrangementSlot = isRow ? 'horizontalArrangement' : 'verticalArrangement'
    initArgs.push(`${arrangementSlot} = Arrangement.spacedBy(${resolveSpace(gap)}.dp)`)
  }
  // align → cross-axis alignment
  const align = readStaticAttrKotlin(e, 'align')
  if (typeof align === 'string') {
    const alignSlot = isRow ? 'verticalAlignment' : 'horizontalAlignment'
    initArgs.push(
      `${alignSlot} = ${resolveAlign(align, 'kotlin', isRow ? 'vertical' : 'horizontal')}`,
    )
  }
  // Modifier chain
  const modifier = emitKotlinLayoutModifier(e)
  if (modifier !== '') {
    initArgs.push(`modifier = ${modifier}`)
  }
  const initSignature = initArgs.length > 0 ? `(${initArgs.join(', ')})` : ''

  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `${composable}${initSignature} {}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `${composable}${initSignature} {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
 * Emit `<Press onPress={fn}>{anything}</Press>` as a clickable Box.
 *
 * Idiomatic Compose for the "make this clickable but don't add chrome"
 * pattern is `Box(modifier = Modifier.clickable(onClick = fn)) { ... }`.
 *
 * Accepts both canonical `onPress` and legacy `onClick` to ease
 * migration from existing PMTC source.
 *
 * `onLongPress` not yet wired — defer to a future arc.
 */
function emitKotlinPress(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const handler = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && (a.name === 'press' || a.name === 'click'),
  )
  const action = handler ? emitKotlinAction(handler.handler, indent) : '{}'

  // Combine .clickable() with the layout modifier chain.
  const layoutModifier = emitKotlinLayoutModifier(e)
  const clickable = `.clickable(onClick = ${action})`
  const modifier =
    layoutModifier !== '' ? `${layoutModifier}${clickable}` : `Modifier${clickable}`

  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `Box(modifier = ${modifier}) {}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `Box(modifier = ${modifier}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
 * Emit `<Field value={signal} onChangeText={fn} kind?>` as Compose
 * `TextField(value = signal, onValueChange = { ... })`.
 *
 * Mirrors the legacy `<TextField>` emit shape but uses canonical
 * `onChangeText` instead of `onInput`. `kind` selects KeyboardOptions
 * (Compose has no separate SecureField — uses
 * `visualTransformation = PasswordVisualTransformation()` instead).
 *
 * `value` MUST name a signal in scope (canonical contract); otherwise
 * falls through to generic emit to preserve current behaviour.
 */
function emitKotlinField(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const valueAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === 'value',
  )
  const onChangeText = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'changetext',
  )
  if (
    !valueAttr ||
    valueAttr.value.kind !== 'identifier' ||
    !_signalNames.has(valueAttr.value.name) ||
    !onChangeText
  ) {
    return emitKotlinGeneric(e, indent)
  }
  const sig = kotlinIdent(valueAttr.value.name)
  const onChange = emitKotlinAction(onChangeText.handler, indent + 2)

  const args: string[] = [`value = ${sig}`, `onValueChange = ${onChange}`]

  const placeholderAttr = readStaticAttrKotlin(e, 'placeholder')
  if (typeof placeholderAttr === 'string') {
    args.push(
      `placeholder = { Text(${JSON.stringify(placeholderAttr)}) }`,
    )
  }
  const kind = readStaticAttrKotlin(e, 'kind')
  if (kind === 'password') {
    args.push('visualTransformation = PasswordVisualTransformation()')
  }
  const onSubmit = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'submit',
  )
  if (onSubmit) {
    args.push('keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)')
    args.push(
      `keyboardActions = KeyboardActions(onDone = ${emitKotlinAction(onSubmit.handler, indent + 2)})`,
    )
  }
  const disabled = readStaticAttrKotlin(e, 'disabled')
  if (disabled === true) {
    args.push('enabled = false')
  }
  return `TextField(${args.join(', ')})`
}

/**
 * Emit `<Toggle value={signal} onChange={fn}>` as Compose
 * `Switch(checked = signal, onCheckedChange = { fn })`. Mirror of
 * `emitSwiftToggle` for Android.
 *
 * Compose's `Switch` is the Material binary-toggle component (NOT
 * `Toggle` — Compose has no `Toggle`). Per the canonical-primitives
 * name map (`Toggle: 'Switch'`), this is the idiomatic Android
 * equivalent.
 *
 * Unlike Swift (which uses `$signal` binding-projection so the
 * `onChange` handler is redundant), Compose requires the
 * `onCheckedChange` callback explicitly because Kotlin has no
 * property-wrapper bindings — the handler must write back to the
 * signal manually. The user-supplied `onChange` is threaded through
 * with arrow-param preservation (#920).
 */
function emitKotlinToggle(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const valueAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'value',
  )
  if (!valueAttr) {
    return emitKotlinGeneric(e, indent)
  }
  // Two shapes mirroring `emitSwiftToggle`:
  //
  // 1. `value={signal}` — bare identifier matching a signal in scope.
  //    onChange optional; auto-derives write-back to the signal.
  //
  // 2. `value={expr}` — non-signal expression (member access, function
  //    call). Used for parent-owns-state patterns like
  //    `<Toggle value={props.todo.done} onChange={onToggle} />` in a
  //    TodoRow component. Requires `onChange` to handle writes
  //    (Compose `Switch` has no binding-projection equivalent —
  //    onCheckedChange is mandatory). Unblocks Checkbox→Toggle
  //    migration for the parent-owns-state shape.
  const onChange = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'change',
  )
  const isSignalShape =
    valueAttr.value.kind === 'identifier' &&
    _signalNames.has(valueAttr.value.name)
  const checkedExpr = isSignalShape
    ? kotlinIdent((valueAttr.value as Extract<typeof valueAttr.value, { kind: 'identifier' }>).name)
    : emitKotlinExpr(valueAttr.value, indent)
  if (!isSignalShape && !onChange) {
    return emitKotlinGeneric(e, indent)
  }
  const args: string[] = [`checked = ${checkedExpr}`]
  if (onChange) {
    args.push(`onCheckedChange = ${emitKotlinAction(onChange.handler, indent + 2)}`)
  } else {
    // Signal shape with no onChange — auto-derive write-back.
    args.push(`onCheckedChange = { ${checkedExpr} = it }`)
  }
  const disabled = readStaticAttrKotlin(e, 'disabled')
  if (disabled === true) {
    args.push('enabled = false')
  }
  return `Switch(${args.join(', ')})`
}

/**
 * Emit `<Link to="/path">label</Link>` as the runtime-kotlin
 * `PyreonLink("/path") { navigate -> Box(modifier=Modifier.clickable
 * { navigate() }) { ... } }`. Maps to `@pyreon/native-router-kotlin`'s
 * `PyreonLink` with the caller-wraps-clickable shape.
 *
 * The `to` prop must be a string literal or string-typed expression.
 * Children are wrapped in a clickable Box that triggers the navigate
 * action (the canonical-link UX). Apps that want different chrome
 * (Material Surface, etc.) can call PyreonLink directly with custom
 * content, bypassing the compiler emit.
 */
function emitKotlinLink(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const toAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'to',
  )
  if (!toAttr) {
    return emitKotlinGeneric(e, indent)
  }
  const toExpr = emitKotlinExpr(toAttr.value, indent)
  const pad = ' '.repeat(indent + 2)
  const inner = ' '.repeat(indent + 4)
  if (e.children.length === 0) {
    return `PyreonLink(${toExpr}) { navigate ->\n${pad}Box(modifier = Modifier.clickable { navigate() }) { }\n${' '.repeat(indent)}}`
  }
  const contentLines = e.children.map((c) => inner + emitKotlinChild(c, indent + 4)).join('\n')
  return `PyreonLink(${toExpr}) { navigate ->\n${pad}Box(modifier = Modifier.clickable { navigate() }) {\n${contentLines}\n${pad}}\n${' '.repeat(indent)}}`
}

/**
 * Emit `<RouterProvider router={r}>...</RouterProvider>` as the
 * runtime-kotlin `RouterProvider(r) { ... }`.
 */
function emitKotlinRouterProvider(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const routerAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'router',
  )
  if (!routerAttr) {
    return emitKotlinGeneric(e, indent)
  }
  const routerExpr = emitKotlinExpr(routerAttr.value, indent)
  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `RouterProvider(${routerExpr}) { }`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `RouterProvider(${routerExpr}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
 * Emit `<RouterView />` as the runtime-kotlin `RouterView()`.
 */
function emitKotlinRouterView(
  _e: Extract<ExprIR, { kind: 'jsx-element' }>,
  _indent: number,
): string {
  return `RouterView()`
}

// `isCanonicalPrimitive` is imported but referenced only via the
// dispatcher's `if (tag === 'Stack')` chain in `emitKotlinJsx` — see
// the matching comment in emit-swift.ts.
void isCanonicalPrimitive

function emitKotlinGeneric(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const pad = ' '.repeat(indent + 2)
  const isUserComponent = _componentNames.has(e.tag)
  // Phase 2 follow-up: include event handlers as constructor args for
  // user-defined Composables. Mirror of emit-swift.ts:emitSwiftGeneric.
  const argParts: string[] = []
  for (const a of e.attrs) {
    if (a.kind === 'attr') {
      // `safeIdent` converts kebab-case HTML attrs (`data-test`,
      // `aria-label`) to camelCase. Kotlin rejects `-` in named
      // arguments the same way Swift does.
      argParts.push(
        `${kotlinIdent(safeIdent(a.name))} = ${emitKotlinExpr(a.value, indent)}`,
      )
    } else if (a.kind === 'event' && isUserComponent) {
      const propName = `on${a.name[0]!.toUpperCase()}${a.name.slice(1)}`
      argParts.push(
        `${kotlinIdent(propName)} = ${emitKotlinAction(a.handler, indent)}`,
      )
    }
  }
  const attrPairs = argParts.join(', ')
  // `kotlinIdent`-escape the tag too — covers user-defined components
  // whose name collides with a Kotlin keyword. K3: map SwiftUI-flavored
  // layout names (VStack/HStack/ZStack) to Compose equivalents
  // (Column/Row/Box) first — user-defined components named the same
  // will collide (documented trade-off).
  const tag = kotlinIdent(mapJsxTagToCompose(e.tag))
  if (e.children.length === 0) {
    return attrPairs ? `${tag}(${attrPairs})` : `${tag}()`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  if (attrPairs) {
    return `${tag}(${attrPairs}) {\n${contentLines}\n${' '.repeat(indent)}}`
  }
  return `${tag} {\n${contentLines}\n${' '.repeat(indent)}}`
}

function emitKotlinChild(c: ChildIR, indent: number): string {
  if (c.kind === 'text') return `Text(text = ${JSON.stringify(c.value)})`
  return emitKotlinExpr(c.expr, indent)
}

function emitKotlinSignalRead(e: ExprIR): string {
  if (e.kind === 'identifier') return kotlinIdent(e.name)
  return emitKotlinExpr(e, 0)
}

function extractStaticText(children: ChildIR[]): string | null {
  if (children.length === 0) return ''
  if (children.length === 1 && children[0]!.kind === 'text') return children[0]!.value
  return null
}

function extractMemberPath(expr: ExprIR): string {
  if (expr.kind === 'member') return expr.property
  return 'id'
}

function escapeKotlinInterp(s: string): string {
  // Escape backslashes, double-quotes, and `$` (Kotlin's interp marker).
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')
}
