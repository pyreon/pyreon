// Pyreon IR → Kotlin / Jetpack Compose source.
//
// Mirrors emit-swift.ts but produces idiomatic Compose. Signals map to
// `var x by remember { mutableStateOf(initial) }`, computeds to
// `derivedStateOf { ... }`, JSX elements to Composable function calls.

import { kotlinIdent, safeIdent } from './identifier-safety'
import type {
  AttrIR,
  ChildIR,
  ComponentIR,
  DeclIR,
  EnumIR,
  ExprIR,
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
): string {
  _enumNames = new Set(enums.map((e) => e.name))
  // Build the struct-fields key map — mirror of emit-swift's logic.
  _structFieldsToName = new Map()
  for (const s of structs) {
    const key = s.fields.map((f) => f.name).sort().join(',')
    if (!_structFieldsToName.has(key)) _structFieldsToName.set(key, s.name)
  }
  const parts: string[] = []
  for (const e of enums) parts.push(emitKotlinEnum(e))
  for (const s of structs) parts.push(emitKotlinStruct(s))
  for (const c of components) parts.push(emitKotlinComponent(c))
  _enumNames = new Set()
  _structFieldsToName = new Map()
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

interface KotlinCtx {
  /** Anonymous object types synthesized as named data classes. */
  synthesizedDataClasses: { name: string; fields: { name: string; type: TypeIR }[] }[]
  /** Component name, used to derive synthesized data class names. */
  componentName: string
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
  for (const d of c.decls) {
    if (d.kind === 'signal' && d.type.kind === 'typeRef' && _enumNames.has(d.type.name)) {
      _signalEnumTypes.set(d.name, d.type.name)
    }
    // signal + computed both map to Kotlin `var`/`val`/`derivedStateOf`
    // properties read without parens — same disambiguation as Swift.
    if (d.kind === 'signal' || d.kind === 'computed') _signalNames.add(d.name)
    if (d.kind === 'function') _functionNames.add(d.name)
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
    const wrapperFn = isStorage ? 'rememberSaveable' : 'remember'
    const needsSaver = isStorage && !isRememberSaveableNativeType(d.type)
    const typeStr = kotlinType(d.type, ctx, d.name)
    // The Saver inline expression. `Json.encodeToString` / `decodeFromString`
    // require the value type to be `@Serializable` (which Phase 2 #857
    // adds to every emitted data class) OR a stdlib type kotlinx-
    // serialization handles natively.
    const saverArg = needsSaver
      ? `saver = Saver<${typeStr}, String>(save = { Json.encodeToString(it) }, restore = { Json.decodeFromString<${typeStr}>(it) })`
      : ''
    if (d.type.kind === 'array' && d.initial.kind === 'array' && d.initial.elements.length === 0) {
      if (needsSaver) {
        return `var ${kotlinIdent(d.name)} by rememberSaveable(${saverArg}) { mutableStateOf<${typeStr}>(listOf()) }`
      }
      return `var ${kotlinIdent(d.name)} by ${wrapperFn} { mutableStateOf<${typeStr}>(listOf()) }`
    }
    if (needsSaver) {
      return `var ${kotlinIdent(d.name)} by rememberSaveable(${saverArg}) { mutableStateOf(${initial}) }`
    }
    return `var ${kotlinIdent(d.name)} by ${wrapperFn} { mutableStateOf(${initial}) }`
  }
  if (d.kind === 'function') {
    return emitKotlinFunction(d, ctx)
  }
  // computed → derivedStateOf, accessed via the `by` delegate.
  return `val ${kotlinIdent(d.name)} by remember { derivedStateOf { ${emitKotlinExpr(d.expr, 0)} } }`
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
    case 'return':
      return s.expr ? `return ${emitKotlinExpr(s.expr, indent)}` : 'return'
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
    case 'comparison':
      // Pyreon `===` / `!==` already coalesced to `==` / `!=` at parse;
      // Kotlin's `==` is structural-equality (matches what Pyreon source
      // expects). `!=` is the negation.
      return `${emitKotlinExpr(e.left, indent)} ${e.op} ${emitKotlinExpr(e.right, indent)}`
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
      // Same value-semantic degrade as Swift — emit `x + 1` / `x - 1`,
      // side-effect lost.
      return e.op === '++'
        ? `${emitKotlinExpr(e.argument, indent)} + 1`
        : `${emitKotlinExpr(e.argument, indent)} - 1`
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
  const onClick = e.attrs.find((a) => a.kind === 'event' && a.name === 'click') as
    | Extract<AttrIR, { kind: 'event' }>
    | undefined
  const labelText = extractStaticText(e.children)
  const action = onClick ? emitKotlinAction(onClick.handler, indent) : '{}'
  const pad = ' '.repeat(indent + 2)
  if (labelText !== null) {
    return `Button(onClick = ${action}) {\n${pad}Text(${JSON.stringify(labelText)})\n${' '.repeat(indent)}}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `Button(onClick = ${action}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

function emitKotlinAction(handler: ExprIR, indent: number): string {
  if (handler.kind === 'arrow') {
    return `{ ${emitKotlinExpr(handler.body, indent)} }`
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

function emitKotlinGeneric(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const pad = ' '.repeat(indent + 2)
  const attrPairs = e.attrs
    .filter((a) => a.kind === 'attr')
    .map((a) => {
      const aa = a as Extract<AttrIR, { kind: 'attr' }>
      // `safeIdent` converts kebab-case HTML attrs (`data-test`,
      // `aria-label`) to camelCase. Kotlin rejects `-` in named
      // arguments the same way Swift does. Mirrors the Swift emit
      // — see `safeIdent` for the structural rationale.
      // Also `kotlinIdent`-escape in case the kebab→camel conversion
      // lands on a reserved keyword.
      return `${kotlinIdent(safeIdent(aa.name))} = ${emitKotlinExpr(aa.value, indent)}`
    })
    .join(', ')
  // `kotlinIdent`-escape the tag too — covers user-defined components
  // whose name collides with a Kotlin keyword.
  const tag = kotlinIdent(e.tag)
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
