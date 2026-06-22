// Pyreon IR → Kotlin / Jetpack Compose source.
//
// Mirrors emit-swift.ts but produces idiomatic Compose. Signals map to
// `var x by remember { mutableStateOf(initial) }`, computeds to
// `derivedStateOf { ... }`, JSX elements to Composable function calls.

import {
  ICON_MAP,
  isCanonicalPrimitive,
  resolveAlign,
  resolveColor,
  resolveRadius,
  resolveSpace,
} from './canonical-primitives'
import { substituteIdentifier } from './expr-utils'
import { kotlinIdent, safeIdent } from './identifier-safety'
import {
  type FlatRouteEntry,
  flattenRouteTree,
  hasNestedRoutes,
  isRedirectRoute,
  isWildcardRoute,
  resolveRouteTarget,
} from './route-ir-helpers'
import type {
  AttrIR,
  ChildIR,
  ComponentIR,
  DeclIR,
  EnumIR,
  ExprIR,
  FeatureDefnIR,
  FieldMetaDefnIR,
  ModelDefnIR,
  ModuleDeclIR,
  StatementIR,
  StoreDefnIR,
  StructIR,
  TypeIR,
  ZodFieldConstraints,
  ZodFieldType,
  ZodSchemaDefnIR,
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
/**
 * Phase 4: every `useFetch` decl name in scope. Member reads of a fetch
 * decl's reactive fields (`x.data` / `x.error` / `x.isPending`) emit with
 * a trailing `.value` because the Kotlin PyreonFetch exposes them as
 * Compose `MutableState` (the Swift side exposes plain @Observable
 * properties, so it needs no rewrite — the platforms diverge here exactly
 * like PyreonRouter's `params`).
 */
let _fetchNames: Set<string> = new Set()
/**
 * Phase 4.2: every `useForm` decl name in scope. Member reads of a form
 * decl's reactive fields (`form.values` / `errors` / `touched` /
 * `isSubmitting`) emit with a trailing `.value` (Compose `MutableState`).
 * `form.isValid` is EXCLUDED — it's a derived `Boolean` getter on the
 * Kotlin PyreonForm, not a MutableState, so it reads plainly. Swift exposes
 * all of them as @Observable properties, so it needs no rewrite.
 */
let _formNames: Set<string> = new Set()
/**
 * Phase 4: every `useOnline()` decl name in scope. A `net.isOnline` read emits
 * with a trailing `.value` (Compose `MutableState`); Swift exposes it as a
 * plain @Observable property, so it needs no rewrite.
 */
let _netStatusNames: Set<string> = new Set()
/** G2: every function decl name (Parser-A). Mirrors emit-swift's set. */
let _functionNames: Set<string> = new Set()
/**
 * Per-component: every machine decl name (DeclIR.machine — Gap 4
 * PR-2). PyreonMachine has `operator fun invoke()` so `m()` reads
 * current state. Without this set, the call-emit drops parens for
 * unknown zero-arg identifiers (same code path as signal reads),
 * which would emit `m` (a PyreonMachine reference) instead of `m()`
 * (the current state String).
 */
let _machineNames: Set<string> = new Set()
/** Per-component: i18n instance names — `i18n.t(key, {…})` lowers the
 *  object-literal values arg to a map at this call shape. Mirror of
 *  emit-swift's `_i18nNames`. */
let _i18nNamesKotlin: Set<string> = new Set()
/**
 * C5.3: per-component map from router-decl name → its routes array.
 * Populated at the start of each `emitKotlinComponent` from the
 * `kind: 'router'` decls that carry routes. `emitKotlinRouterProvider`
 * reads this to emit the `NavHost { composable(...) }` block.
 *
 * Mirrors emit-swift.ts's `_routerRoutes`. Empty for routerless
 * components AND for C4-style scaffold routers (no `routes` config
 * in source) — both fall back to the existing bare-content emit.
 */
let _routerRoutes: Map<string, import('./types').RouteIR[]> = new Map()

/**
 * Phase 3 (nested routes) — names of components used as LAYOUT parents. A
 * layout @Composable gains a `content: @Composable () -> Unit` param and its
 * `<RouterView />` becomes `content()`. Computed once per `emitKotlin` call.
 */
let _layoutComponentNames: Set<string> = new Set()
/** True while emitting a layout component's body, so its `<RouterView />`
 * emits `content()` (the child slot) instead of the scaffold `RouterView()`. */
let _emittingLayoutComponentKotlin = false

/** Pre-pass: collect every layout-parent component name across all router
 * decls' nested route trees (mirror of emit-swift's collectLayoutComponentNames). */
function collectLayoutComponentNamesKotlin(components: ComponentIR[]): Set<string> {
  const names = new Set<string>()
  for (const c of components) {
    for (const d of c.decls) {
      if (d.kind !== 'router' || d.routes === undefined) continue
      if (!hasNestedRoutes(d.routes)) continue
      for (const entry of flattenRouteTree(d.routes)) {
        for (const layout of entry.layoutChain) {
          if (layout.kind === 'identifier') names.add(layout.name)
        }
      }
    }
  }
  return names
}

/**
 * Emit-time warnings. Same shape + rationale as emit-swift's. See
 * `_pushKotlinEmitWarning` for the canonical use site (walled-tag
 * silent-drop diagnostics).
 */
let _emitWarnings: string[] = []
/**
 * Module-level `const X = <string|number|boolean literal>` bindings,
 * name → value (Kotlin mirror of emit-swift's `_constStringMap`). Lets
 * a static-attr reader resolve a const-ref attr (`<Image src={API_URL}>`,
 * `<WebView src={chartUrl}>`) to its literal at emit time. `let`
 * (mutable) and non-literal inits are excluded — they fall through to
 * the existing "needs static" emit path.
 */
let _constStringMapKotlin: Map<string, string | number | boolean> = new Map()

export function _peekKotlinEmitWarnings(): string[] {
  return [..._emitWarnings]
}

export function _pushKotlinEmitWarning(msg: string): void {
  _emitWarnings.push(msg)
}

export function emitKotlin(
  components: ComponentIR[],
  enums: EnumIR[] = [],
  structs: StructIR[] = [],
  moduleDecls: ModuleDeclIR[] = [],
  stores: StoreDefnIR[] = [],
  models: ModelDefnIR[] = [],
  fieldMetas: FieldMetaDefnIR[] = [],
  features: FeatureDefnIR[] = [],
  zodSchemas: ZodSchemaDefnIR[] = [],
  // fonts: Android resolves at runtime via pyreonFont(res/font), so
  // the map is accepted for signature symmetry but unused here.
  _fonts: Record<string, string> = {},
): { code: string; warnings: string[] } {
  _emitWarnings = []
  _constStringMapKotlin = new Map()
  for (const md of moduleDecls) {
    if (md.mutable) continue // `var` (TS `let`) is mutable — unsafe to inline
    if (md.initial.kind !== 'literal') continue // only direct literals
    const v = md.initial.value
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      _constStringMapKotlin.set(md.name, v)
    }
  }
  _enumNames = new Set(enums.map((e) => e.name))
  // Build the struct-fields key map — mirror of emit-swift's logic.
  _structFieldsToName = new Map()
  for (const s of structs) {
    const key = s.fields.map((f) => f.name).sort().join(',')
    if (!_structFieldsToName.has(key)) _structFieldsToName.set(key, s.name)
  }
  // Build the user-component name set — mirror of emit-swift's logic.
  _componentNames = new Set(components.map((c) => c.name))
  // Phase 3 — pre-pass: which components are layout parents (nested routes)?
  _layoutComponentNames = collectLayoutComponentNamesKotlin(components)
  // Pre-pass: register each component's `params` prop shape so router
  // dispatchers (which emit in a DIFFERENT component) can construct the
  // typed data class from matchPath's Map<String, String>. Mirror of
  // emit-swift's `_componentParamsInfo`. The name MUST match what the
  // component's own prop emit synthesizes via kotlinType →
  // synthesizeDataClassName — both are pure functions of the same
  // inputs, so they agree by construction.
  _componentParamsInfoKotlin = new Map()
  for (const c of components) {
    const paramsProp = c.props.find((p) => p.name === 'params')
    if (paramsProp === undefined) continue
    if (paramsProp.type.kind === 'object') {
      const fields = paramsProp.type.fields
      // Conservative: route params are flat strings — a nested
      // object/array field can't be constructed from the dict. Fall
      // back to the raw-dict emit (kotlinc names the mismatch).
      const constructible = fields.every(
        (f) =>
          f.type.kind === 'string' ||
          f.type.kind === 'number' ||
          f.type.kind === 'boolean',
      )
      if (!constructible) {
        _componentParamsInfoKotlin.set(c.name, 'opaque')
        continue
      }
      _componentParamsInfoKotlin.set(c.name, {
        typeName: synthesizeDataClassName(c.name, 'params'),
        fields,
      })
    } else {
      _componentParamsInfoKotlin.set(c.name, 'opaque')
    }
  }
  const parts: string[] = []
  if (components.length > 0 || structs.length > 0) {
    parts.push('// Pyreon TS-compat extensions\nprivate val <T> List<T>.length: Int get() = size')
  }
  // Gap 4 v1: store-hook → store id map for use-site chain rewriting.
  _storeHooksKotlin = new Map(stores.map((s) => [s.hookName, s.storeId]))
  // v2 — per-hook method registry for the chain-call rewrite.
  _storeMethodNamesKotlin = new Map(
    stores.map((st) => [st.hookName, new Set((st.methods ?? []).map((m) => m.name))]),
  )
  // Gap 4 v2 follow-up: model instance → modelId for use-site rewriting.
  _modelInstancesKotlin = new Map(models.map((m) => [m.instanceName, m.modelId]))
  // Gap 3 PR-3.2 — reset Suspense-wrapper flag per transform run.
  // Gap 3 PR-3.3 — reset ErrorBoundary-wrapper flag per transform.
  // Gap 3 PR-3.4 — reset KeepAlive-wrapper flag.
  _needsKotlinKeepAliveWrapper = false
  for (const e of enums) parts.push(emitKotlinEnum(e))
  for (const s of structs) parts.push(emitKotlinStruct(s))
  for (const md of moduleDecls) parts.push(emitKotlinModuleDecl(md))
  // Gap 4 v1: emit per-store singleton class.
  for (const s of stores) parts.push(emitKotlinStore(s))
  // Gap 4 v2 follow-up: emit per-model singleton object.
  for (const m of models) parts.push(emitKotlinModel(m))
  // Gap 4 follow-up — withField metadata data classes.
  for (const fm of fieldMetas) parts.push(emitKotlinFieldMeta(fm))
  // Gap 4 follow-up — feature v1: emit per-feature schema data class
  // + module-scope object.
  for (const f of features) parts.push(emitKotlinFeature(f))
  // Gap 4 follow-up — Zod / Valibot / ArkType schema data classes.
  // Emit the shared PyreonSchemaError sealed class once if any
  // schemas are present.
  if (zodSchemas.length > 0) parts.push(KOTLIN_SCHEMA_ERROR)
  // Gap 4 v3.2 — emit auxSchemas BEFORE their parent schema so the
  // type-reference order is consistent top-down.
  const emitKotlinSchemaTree = (zs: ZodSchemaDefnIR): void => {
    for (const aux of zs.auxSchemas ?? []) emitKotlinSchemaTree(aux)
    parts.push(emitKotlinZodSchema(zs))
  }
  for (const zs of zodSchemas) emitKotlinSchemaTree(zs)
  // Emit components — populates _needsKotlin{Suspense,ErrorBoundary,KeepAlive}Wrapper
  // if any of those elements is encountered.
  const componentParts: string[] = []
  for (const c of components) componentParts.push(emitKotlinComponent(c))
  // Gap 3 PR-3.2/3.3/3.4 — prepend wrapper composables if needed.
  if (_needsKotlinKeepAliveWrapper) parts.push(KOTLIN_KEEP_ALIVE_WRAPPER)
  for (const cp of componentParts) parts.push(cp)
  _enumNames = new Set()
  _structFieldsToName = new Map()
  _componentNames = new Set()
  _componentParamsInfoKotlin = new Map()
  _layoutComponentNames = new Set()
  _storeHooksKotlin = new Map()
  _storeMethodNamesKotlin = new Map()
  _modelInstancesKotlin = new Map()
  _needsKotlinKeepAliveWrapper = false
  const warnings = [..._emitWarnings]
  _emitWarnings = []
  return { code: parts.join('\n\n'), warnings }
}

/**
 * Per-emit-run: component name → typed-`params`-prop info for router
 * dispatcher construction. See the pre-pass in `emitKotlin` + the
 * mirror declaration in emit-swift.ts for the full contract.
 */
let _componentParamsInfoKotlin: Map<
  string,
  { typeName: string; fields: { name: string; type: TypeIR }[] } | 'opaque'
> = new Map()

/** Map of useStoreName → storeId for Kotlin emit chain rewriting. */
let _storeHooksKotlin: Map<string, string> = new Map()
/** Per-hook store METHOD names — chain calls keep parens + args. */
let _storeMethodNamesKotlin: Map<string, Set<string>> = new Map()

/** Map of model instance name → modelId for Kotlin use-site rewriting. */
let _modelInstancesKotlin: Map<string, string> = new Map()

/**
 * Emit a per-store Kotlin object singleton:
 *
 *   object PyreonStore_counter : PyreonStore {
 *       var count by mutableStateOf(0)
 *   }
 *
 * Kotlin `object` declarations ARE singletons by construction —
 * cleaner than Swift's `static let shared = ...` pattern.
 * The PMTC consumer accesses fields via `PyreonStore_counter.count`
 * (rewritten from `useCounter().store.count`).
 */
function emitKotlinStore(s: StoreDefnIR): string {
  const lines: string[] = []
  lines.push(`object PyreonStore_${s.storeId} : PyreonStore {`)
  for (const f of s.fields) {
    const init = emitKotlinExpr(f.initial, 4)
    // Empty-array seeds need the explicit type argument — kotlinc
    // cannot infer T from `mutableStateOf(listOf())` (same shape the
    // component signal emit already handles).
    if (f.type.kind === 'array' && f.initial.kind === 'array' && f.initial.elements.length === 0) {
      lines.push(`    var ${f.name} by mutableStateOf<${kotlinType(f.type)}>(listOf())`)
    } else {
      lines.push(`    var ${f.name} by mutableStateOf(${init})`)
    }
  }
  // v2 — computeds + methods on the object (mirror of emitSwiftStore;
  // see its doc comment for the module-state swap rationale).
  // Computeds emit as `val X get() = …` — the getter re-evaluates on
  // access and its reads of the mutableStateOf-backed vars keep it
  // Compose-reactive. kotlinc infers the getter's type, so no
  // annotation is needed.
  const hasMembers = (s.computeds?.length ?? 0) > 0 || (s.methods?.length ?? 0) > 0
  if (hasMembers) {
    const prevSignals = _signalNames
    const prevFunctions = _functionNames
    _signalNames = new Set([
      ...s.fields.map((f) => f.name),
      ...(s.computeds ?? []).map((c) => c.name),
    ])
    _functionNames = new Set((s.methods ?? []).map((m) => m.name))
    const memberCtx: KotlinCtx = {
      synthesizedDataClasses: [],
      componentName: `PyreonStore_${s.storeId}`,
    }
    for (const c of s.computeds ?? []) {
      lines.push(`    val ${kotlinIdent(c.name)} get() = ${emitKotlinExpr(c.expr, 4)}`)
      _signalNames.add(c.name)
    }
    for (const m of s.methods ?? []) {
      lines.push(`    ${emitKotlinFunction(m, memberCtx)}`)
    }
    _signalNames = prevSignals
    _functionNames = prevFunctions
  }
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Gap 4 follow-up v2 — emit a per-model Kotlin singleton object for
 * `const X = model({ state: { ... } }).create()`. Mirror of
 * `emitKotlinStore` for state-tree's instance-shaped surface.
 *
 *   object PyreonModel_counter : PyreonModelProtocol {
 *       var count by mutableStateOf(0)
 *       var label by mutableStateOf("counter")
 *   }
 *
 * Use-site rewriting (`counter.field` → `PyreonModel_counter.field`)
 * happens at expression-emit time via `_modelInstancesKotlin`.
 */
function emitKotlinModel(m: ModelDefnIR): string {
  const lines: string[] = []
  lines.push(`object PyreonModel_${m.modelId} : PyreonModelProtocol {`)
  for (const f of m.fields) {
    const initial =
      f.type === 'string'
        ? JSON.stringify(f.initial)
        : f.type === 'boolean'
          ? String(f.initial)
          : String(f.initial)
    lines.push(`    var ${f.name} by mutableStateOf(${initial})`)
  }
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Gap 4 follow-up — `@pyreon/validate` withField metadata emit
 * (Kotlin). Mirror of emitSwiftFieldMeta. Discards the schema
 * argument; emits a per-binding data class + module-scope const.
 *
 *   data class PyreonFieldMeta_emailField(
 *       val label: String = "Email",
 *       val placeholder: String = "name@example.com",
 *   )
 *   val emailField = PyreonFieldMeta_emailField()
 */
function emitKotlinFieldMeta(fm: FieldMetaDefnIR): string {
  const lines: string[] = []
  lines.push(`data class PyreonFieldMeta_${fm.bindingName}(`)
  for (const m of fm.meta) {
    lines.push(`    val ${m.name}: String = ${JSON.stringify(m.value)},`)
  }
  lines.push(`)`)
  lines.push(``)
  lines.push(`val ${fm.bindingName} = PyreonFieldMeta_${fm.bindingName}()`)
  return lines.join('\n')
}

/**
 * Gap 4 follow-up — feature v1 emit (Kotlin). Mirror of
 * emitSwiftFeature. Produces:
 *
 *   data class PyreonFeatureSchema_Todo(
 *       var id: String = "",
 *       var title: String = "",
 *       var done: Boolean = false,
 *   )
 *
 *   object PyreonFeature_Todo {
 *       const val name = "todo"
 *       val initialValues = PyreonFeatureSchema_Todo()
 *   }
 */
function emitKotlinFeature(f: FeatureDefnIR): string {
  const lines: string[] = []
  lines.push(`data class PyreonFeatureSchema_${f.bindingName}(`)
  for (const field of f.fields) {
    const t =
      field.type === 'string'
        ? 'String'
        : field.type === 'number'
          ? 'Int'
          : 'Boolean'
    const initial =
      field.type === 'string' ? '""' : field.type === 'boolean' ? 'false' : '0'
    lines.push(`    var ${field.name}: ${t} = ${initial},`)
  }
  lines.push(`)`)
  lines.push(``)
  lines.push(`object PyreonFeature_${f.bindingName} {`)
  lines.push(`    const val name = ${JSON.stringify(f.featureName)}`)
  lines.push(
    `    val initialValues = PyreonFeatureSchema_${f.bindingName}()`,
  )
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Gap 4 follow-up — `@pyreon/validation` Zod-schema v1 emit (Kotlin).
 * Mirror of emitSwiftZodSchema. Produces a data class + module-scope
 * const. Apps validate at JSON-decode via kotlinx.serialization; v1
 * doesn't emit runtime .parse() methods (v2 follow-up).
 *
 *   data class PyreonZodSchema_userSchema(
 *       var name: String = "",
 *       var age: Int = 0,
 *       var active: Boolean = false,
 *   )
 *   val userSchema = PyreonZodSchema_userSchema()
 */
function kotlinFieldType(t: ZodFieldType): string {
  if (typeof t === 'string') {
    return t === 'string' ? 'String' : t === 'number' ? 'Int' : 'Boolean'
  }
  if (t.kind === 'object') {
    // Gap 4 v3.2 — nested object reference. Emit the synthesized data class name.
    return `PyreonZodSchema_${t.schemaName}`
  }
  // v2.2 array — element may now be a nested object (v3.2).
  let elem: string
  if (typeof t.element === 'string') {
    elem =
      t.element === 'string' ? 'String' : t.element === 'number' ? 'Int' : 'Boolean'
  } else {
    elem = `PyreonZodSchema_${t.element.schemaName}`
  }
  return `List<${elem}>`
}

function kotlinFieldInitial(t: ZodFieldType): string {
  if (typeof t === 'string') {
    return t === 'string' ? '""' : t === 'boolean' ? 'false' : '0'
  }
  if (t.kind === 'object') {
    // Initialize nested object with its own default constructor
    return `PyreonZodSchema_${t.schemaName}()`
  }
  return 'emptyList()'
}

/**
 * Gap 4 v2.1 + v3 — emit Kotlin constraint-check guards for a scalar
 * value. Used at three call sites: required scalar field, optional
 * scalar field (with nullable-receiver `?.` syntax), and array-element
 * loop body (with `ruleSuffix: " (element)"` for clearer messages).
 */
function emitKotlinScalarConstraints(
  lines: string[],
  targetName: string,
  t: ZodFieldType,
  constraints: ZodFieldConstraints | undefined,
  fieldName: string,
  indent: number,
  nullableTarget: boolean,
  ruleSuffix = '',
): void {
  if (!constraints) return
  const isString = t === 'string'
  const isNumber = t === 'number'
  if (!isString && !isNumber) return
  const ind = ' '.repeat(indent)
  const c = constraints
  // Nullable-receiver guards: `${target}?.length` returns Int? so we
  // compare with `??`-aware logic. For optional fields, "null target"
  // means "field absent" → constraint doesn't fire.
  const dot = nullableTarget ? '?.' : '.'
  const lenAccess = `${targetName}${dot}length`
  if (isString) {
    if (c.min !== undefined) {
      if (nullableTarget) {
        lines.push(
          `${ind}if (${targetName} != null && ${lenAccess}!! < ${c.min}) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "min length ${c.min}${ruleSuffix}")`,
        )
      } else {
        lines.push(
          `${ind}if (${lenAccess} < ${c.min}) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "min length ${c.min}${ruleSuffix}")`,
        )
      }
    }
    if (c.max !== undefined) {
      if (nullableTarget) {
        lines.push(
          `${ind}if (${targetName} != null && ${lenAccess}!! > ${c.max}) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "max length ${c.max}${ruleSuffix}")`,
        )
      } else {
        lines.push(
          `${ind}if (${lenAccess} > ${c.max}) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "max length ${c.max}${ruleSuffix}")`,
        )
      }
    }
    if (c.email) {
      const guard = nullableTarget ? `${targetName} != null && ` : ''
      lines.push(
        `${ind}if (${guard}!Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\\.[A-Za-z]{2,}$").matches(${targetName}${nullableTarget ? '!!' : ''})) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "email${ruleSuffix}")`,
      )
    }
    if (c.url) {
      const guard = nullableTarget ? `if (${targetName} != null) ` : ''
      lines.push(
        `${ind}${guard}try { java.net.URI(${targetName}${nullableTarget ? '!!' : ''}) } catch (_: Throwable) { throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "url${ruleSuffix}") }`,
      )
    }
    if (c.uuid) {
      const guard = nullableTarget ? `if (${targetName} != null) ` : ''
      lines.push(
        `${ind}${guard}try { java.util.UUID.fromString(${targetName}${nullableTarget ? '!!' : ''}) } catch (_: Throwable) { throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "uuid${ruleSuffix}") }`,
      )
    }
  } else if (isNumber) {
    if (c.min !== undefined) {
      if (nullableTarget) {
        lines.push(
          `${ind}if (${targetName} != null && ${targetName}!! < ${c.min}) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "min ${c.min}${ruleSuffix}")`,
        )
      } else {
        lines.push(
          `${ind}if (${targetName} < ${c.min}) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "min ${c.min}${ruleSuffix}")`,
        )
      }
    }
    if (c.max !== undefined) {
      if (nullableTarget) {
        lines.push(
          `${ind}if (${targetName} != null && ${targetName}!! > ${c.max}) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "max ${c.max}${ruleSuffix}")`,
        )
      } else {
        lines.push(
          `${ind}if (${targetName} > ${c.max}) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "max ${c.max}${ruleSuffix}")`,
        )
      }
    }
  }
}

/**
 * Gap 4 v3 — emit a `for (elem in <field>Val) { ... }` loop applying
 * the array's `elementConstraints` to each element. For nullable
 * (optional) arrays, wrap in a null guard. No-op for scalars.
 */
function emitKotlinArrayElementConstraints(
  lines: string[],
  targetName: string,
  t: ZodFieldType,
  fieldName: string,
  indent: number,
  nullableTarget: boolean,
): void {
  if (typeof t === 'string') return
  if (t.kind !== 'array') return
  // v3.2 — object-element arrays don't have primitive elementConstraints;
  // their per-element validation flows through the nested schema's parse().
  if (typeof t.element !== 'string') return
  if (!t.elementConstraints) return
  if (Object.keys(t.elementConstraints).length === 0) return
  const ind = ' '.repeat(indent)
  const elementVar = `${fieldName}Element`
  if (nullableTarget) {
    lines.push(`${ind}if (${targetName} != null) {`)
    lines.push(`${ind}    for (${elementVar} in ${targetName}) {`)
    emitKotlinScalarConstraints(
      lines,
      elementVar,
      t.element,
      t.elementConstraints,
      fieldName,
      indent + 8,
      /* nullableTarget */ false,
      ' (element)',
    )
    lines.push(`${ind}    }`)
    lines.push(`${ind}}`)
  } else {
    lines.push(`${ind}for (${elementVar} in ${targetName}) {`)
    emitKotlinScalarConstraints(
      lines,
      elementVar,
      t.element,
      t.elementConstraints,
      fieldName,
      indent + 4,
      /* nullableTarget */ false,
      ' (element)',
    )
    lines.push(`${ind}}`)
  }
}

/**
 * Gap 4 v3.3 — emit a discriminated union as a Kotlin sealed class
 * with one data-class variant per case. Each variant wraps its aux
 * data class.
 */
function emitKotlinDiscriminatedUnion(zs: ZodSchemaDefnIR): string {
  const d = zs.discriminator!
  const typeName = `PyreonZodSchema_${zs.bindingName}`
  const lines: string[] = []
  lines.push(`sealed class ${typeName} {`)
  for (const v of d.variants) {
    lines.push(
      `    data class ${v.caseName}(val variant: PyreonZodSchema_${v.schemaName}) : ${typeName}()`,
    )
  }
  lines.push(`    companion object {`)
  lines.push(`        @Throws(PyreonSchemaError::class)`)
  lines.push(`        fun parse(input: Map<String, Any?>): ${typeName} {`)
  lines.push(
    `            val discr = (input[${JSON.stringify(d.field)}] as? String)`,
  )
  lines.push(
    `                ?: throw PyreonSchemaError.MissingOrWrongType(${JSON.stringify(d.field)}, "String")`,
  )
  lines.push(`            return when (discr) {`)
  for (const v of d.variants) {
    lines.push(
      `                ${JSON.stringify(v.literal)} -> ${v.caseName}(PyreonZodSchema_${v.schemaName}.parse(input))`,
    )
  }
  lines.push(
    `                else -> throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(d.field)}, "unknown discriminator value")`,
  )
  lines.push(`            }`)
  lines.push(`        }`)
  lines.push(``)
  lines.push(
    `        fun safeParse(input: Map<String, Any?>): Result<${typeName}> {`,
  )
  lines.push(`            return try {`)
  lines.push(`                Result.success(parse(input))`)
  lines.push(`            } catch (e: PyreonSchemaError) {`)
  lines.push(`                Result.failure(e)`)
  lines.push(`            }`)
  lines.push(`        }`)
  lines.push(`    }`)
  lines.push(`}`)
  return lines.join('\n') + '\n'
}

function emitKotlinZodSchema(zs: ZodSchemaDefnIR): string {
  // Gap 4 v3.3 — discriminated union: sealed-class shape.
  if (zs.discriminator) return emitKotlinDiscriminatedUnion(zs)
  const lines: string[] = []
  lines.push(`data class PyreonZodSchema_${zs.bindingName}(`)
  for (const f of zs.fields) {
    const t = kotlinFieldType(f.type)
    if (f.optional) {
      lines.push(`    var ${f.name}: ${t}? = null,`)
    } else {
      const initial = kotlinFieldInitial(f.type)
      lines.push(`    var ${f.name}: ${t} = ${initial},`)
    }
  }
  lines.push(`) {`)
  // Gap 4 v2 — runtime parse() / safeParse() companion methods.
  lines.push(`    companion object {`)
  lines.push(
    `        @Throws(PyreonSchemaError::class)`,
  )
  lines.push(
    `        fun parse(input: Map<String, Any?>): PyreonZodSchema_${zs.bindingName} {`,
  )
  for (const f of zs.fields) {
    const t = kotlinFieldType(f.type)
    // Gap 4 v3.2 — nested object field: route via the nested schema's
    // own parse() method.
    if (typeof f.type !== 'string' && f.type.kind === 'object') {
      const nestedType = `PyreonZodSchema_${f.type.schemaName}`
      if (f.optional) {
        lines.push(
          `            val ${f.name}Val: ${nestedType}? = if (input.containsKey(${JSON.stringify(f.name)})) {`,
        )
        lines.push(
          `                val raw = (input[${JSON.stringify(f.name)}] as? Map<String, Any?>) ?: throw PyreonSchemaError.MissingOrWrongType(${JSON.stringify(f.name)}, ${JSON.stringify(nestedType)})`,
        )
        lines.push(`                ${nestedType}.parse(raw)`)
        lines.push(`            } else null`)
      } else {
        lines.push(
          `            val ${f.name}Raw = (input[${JSON.stringify(f.name)}] as? Map<String, Any?>)`,
        )
        lines.push(
          `                ?: throw PyreonSchemaError.MissingOrWrongType(${JSON.stringify(f.name)}, ${JSON.stringify(nestedType)})`,
        )
        lines.push(
          `            val ${f.name}Val = ${nestedType}.parse(${f.name}Raw)`,
        )
      }
      continue
    }
    // Gap 4 v3.2 — array of objects field: route via per-element parse().
    if (
      typeof f.type !== 'string' &&
      f.type.kind === 'array' &&
      typeof f.type.element !== 'string' &&
      f.type.element.kind === 'object'
    ) {
      const nestedType = `PyreonZodSchema_${f.type.element.schemaName}`
      const arrayType = `List<${nestedType}>`
      if (f.optional) {
        lines.push(
          `            val ${f.name}Val: ${arrayType}? = if (input.containsKey(${JSON.stringify(f.name)})) {`,
        )
        lines.push(
          `                val raw = (input[${JSON.stringify(f.name)}] as? List<Map<String, Any?>>) ?: throw PyreonSchemaError.MissingOrWrongType(${JSON.stringify(f.name)}, ${JSON.stringify(arrayType)})`,
        )
        lines.push(`                raw.map { ${nestedType}.parse(it) }`)
        lines.push(`            } else null`)
      } else {
        lines.push(
          `            val ${f.name}Raw = (input[${JSON.stringify(f.name)}] as? List<Map<String, Any?>>)`,
        )
        lines.push(
          `                ?: throw PyreonSchemaError.MissingOrWrongType(${JSON.stringify(f.name)}, ${JSON.stringify(arrayType)})`,
        )
        lines.push(
          `            val ${f.name}Val = ${f.name}Raw.map { ${nestedType}.parse(it) }`,
        )
      }
      continue
    }
    if (f.optional) {
      // Optional field: missing → null, present-but-wrong-type → throw
      lines.push(
        `            val ${f.name}Val: ${t}? = if (input.containsKey(${JSON.stringify(f.name)})) (input[${JSON.stringify(f.name)}] as? ${t}) ?: throw PyreonSchemaError.MissingOrWrongType(${JSON.stringify(f.name)}, ${JSON.stringify(t)}) else null`,
      )
      // Gap 4 v3 — constraints on optional fields apply ONLY when present;
      // the null branch above leaves the field null untouched.
      emitKotlinScalarConstraints(
        lines,
        `${f.name}Val`,
        f.type,
        f.constraints,
        f.name,
        12,
        /* nullableTarget */ true,
      )
      // Gap 4 v3 — element constraints for optional arrays apply per-element
      // when the array is present.
      emitKotlinArrayElementConstraints(
        lines,
        `${f.name}Val`,
        f.type,
        f.name,
        12,
        /* nullableTarget */ true,
      )
      continue
    }
    lines.push(
      `            val ${f.name}Val = (input[${JSON.stringify(f.name)}] as? ${t})`,
    )
    lines.push(
      `                ?: throw PyreonSchemaError.MissingOrWrongType(${JSON.stringify(f.name)}, ${JSON.stringify(t)})`,
    )
    // Gap 4 v2.1 — scalar constraints.
    emitKotlinScalarConstraints(
      lines,
      `${f.name}Val`,
      f.type,
      f.constraints,
      f.name,
      12,
      /* nullableTarget */ false,
    )
    // Gap 4 v3 — per-element constraints for required array fields.
    emitKotlinArrayElementConstraints(
      lines,
      `${f.name}Val`,
      f.type,
      f.name,
      12,
      /* nullableTarget */ false,
    )
  }
  const ctorArgs = zs.fields.map((f) => `${f.name} = ${f.name}Val`).join(', ')
  lines.push(
    `            return PyreonZodSchema_${zs.bindingName}(${ctorArgs})`,
  )
  lines.push(`        }`)
  lines.push(``)
  lines.push(
    `        fun safeParse(input: Map<String, Any?>): Result<PyreonZodSchema_${zs.bindingName}> {`,
  )
  lines.push(`            return try {`)
  lines.push(`                Result.success(parse(input))`)
  lines.push(`            } catch (e: PyreonSchemaError) {`)
  lines.push(`                Result.failure(e)`)
  lines.push(`            }`)
  lines.push(`        }`)
  lines.push(`    }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`val ${zs.bindingName} = PyreonZodSchema_${zs.bindingName}()`)
  return lines.join('\n')
}

/**
 * Gap 4 v2 — emitted once at module scope when any schema is
 * present. Single sealed exception hierarchy shared across all
 * schemas in a file.
 */
const KOTLIN_SCHEMA_ERROR = `sealed class PyreonSchemaError(message: String) : Exception(message) {
    data class MissingOrWrongType(val field: String, val expected: String) :
        PyreonSchemaError("Field '$field' missing or wrong type (expected $expected)")
    data class ConstraintViolation(val field: String, val rule: String) :
        PyreonSchemaError("Field '$field' violated constraint '$rule'")
}`

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
  _machineNames = new Set()
  _i18nNamesKotlin = new Set()
  _fetchNames = new Set()
  _formNames = new Set()
  _netStatusNames = new Set()
  // C5.3: reset router-routes map (mirrors Swift emit's same state).
  _routerRoutes = new Map()
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
    // Gap 4 PR-2: PyreonMachine. Keep `m` OUT of _signalNames (so
    // `m()` keeps parens for `operator fun invoke()`) AND OUT of
    // _functionNames (it's a property, not a free fn).
    if (d.kind === 'machine') _machineNames.add(d.name)
    if (d.kind === 'i18n') _i18nNamesKotlin.add(d.name)
    // C4: `const router = createRouter(...)` is a remembered router
    // instance — name reads bare (no parens) like a signal. Add to
    // `_signalNames` so JSX `<RouterProvider router={router}>` emits
    // the property reference correctly.
    // C5.3: also stash the routes list (if parsed) so RouterProvider
    // emit can produce a NavHost { composable(...) } block.
    if (d.kind === 'router') {
      _signalNames.add(d.name)
      if (d.routes !== undefined) _routerRoutes.set(d.name, d.routes)
    }
    // C4: `const navigate = useNavigate()` returns a `(String) -> Unit`
    // closure — register under `_functionNames` so call sites
    // (`navigate("/dashboard")`) emit with parens. `useParams()`
    // returns a Map, which uses `[...]` subscript syntax — NOT a
    // function call, so it stays out of `_functionNames`.
    if (d.kind === 'router-hook' && d.hook === 'navigate') {
      _functionNames.add(d.name)
    }
    // Phase 4: track useFetch decls so member reads append `.value`.
    if (d.kind === 'fetch') _fetchNames.add(d.name)
    // Phase 4.2: track useForm decls so reactive-field reads append `.value`.
    if (d.kind === 'form') _formNames.add(d.name)
    if (d.kind === 'network-status') _netStatusNames.add(d.name)
  }
  const ctx: KotlinCtx = { synthesizedDataClasses: [], componentName: c.name }
  // Pass 1: walk decls — emits decl bodies AND discovers synthesized
  // types from decl annotations. The actual decl text is buffered into
  // `declTexts` so it can be emitted later inside the function body
  // (after the signature line).
  const declTexts = c.decls.map((d) => emitKotlinDecl(d, ctx))
  // Pass 2: walk props — formats prop annotations AND ALSO discovers
  // synthesized types from PROP annotations. This pass must run BEFORE
  // emitting synth-class declarations: a prop like
  // `items: { id: number; name: string }[]` registers `MyListItem` into
  // `ctx.synthesizedDataClasses`. Pre-fix this pass ran AFTER the
  // synth-class emit, so prop-discovered types were silently dropped
  // from the emit and kotlinc reported `unresolved reference 'MyListItem'`.
  // Closes Gap 5 scaffold limitation #1 + #3 (showcase-tasks.tsx's
  // `tasks: { id, title, done }[]` prop type).
  //
  // Compose canonical pattern — parent code calls
  // `Card(title = "...", body = "...")`, params are immutable per call.
  //
  // `kotlinIdent` backtick-escapes Kotlin-reserved keywords. User code
  // commonly accepts `class` as a prop name (React/HTML attr leakage)
  // or names functions colliding with `fun` / `val` / etc. — Kotlin
  // accepts ``\`class\`: String`` etc. as a normal identifier.
  const propsParts = c.props.map(
    (p) => `${kotlinIdent(p.name)}: ${kotlinType(p.type, ctx, p.name)}`,
  )
  // Pass 3: emit ALL synthesized data classes (from BOTH decl pass +
  // prop pass) at the top of the output, ahead of the @Composable
  // function. Kotlin requires data class declarations before any
  // reference, and since props + decls can both reference them, this
  // emit MUST come after both discovery passes complete.
  const lines: string[] = []
  for (const synth of ctx.synthesizedDataClasses) {
    lines.push(emitKotlinDataClass(synth))
    lines.push('')
  }
  // Phase 3 (nested routes) — a LAYOUT component gains a trailing
  // `content: @Composable () -> Unit` slot; its `<RouterView />` becomes
  // `content()` so the matched child fills it.
  const isLayout = _layoutComponentNames.has(c.name)
  if (isLayout) propsParts.push('content: @Composable () -> Unit')
  const propsList = propsParts.join(', ')
  lines.push(`@Composable`)
  lines.push(`fun ${kotlinIdent(c.name)}(${propsList}) {`)
  for (const declText of declTexts) {
    lines.push(`  ${declText}`)
  }
  // Phase 4: a `LaunchedEffect(Unit)` per useFetch decl runs the fetch on
  // first composition (Compose's async-on-mount hook), driving the
  // PyreonFetch state machine begin → resolve|reject. The suspendable HTTP
  // runs off the main thread; decode goes through kotlinx-serialization.
  for (const d of c.decls) {
    if (d.kind !== 'fetch') continue
    const name = kotlinIdent(d.name)
    lines.push(`  LaunchedEffect(Unit) {`)
    lines.push(`    ${name}.begin()`)
    lines.push(`    try {`)
    lines.push(
      `      val body = withContext(Dispatchers.IO) { java.net.URL(${JSON.stringify(d.url)}).readText() }`,
    )
    lines.push(`      ${name}.resolve(Json.decodeFromString<${kotlinType(d.type, ctx)}>(body))`)
    lines.push(`    } catch (e: Throwable) { ${name}.reject(e) }`)
    lines.push(`  }`)
  }
  // While emitting a layout's body, its `<RouterView />` emits `content()`.
  _emittingLayoutComponentKotlin = isLayout
  lines.push(`  ${emitKotlinExpr(c.returnExpr, 2)}`)
  _emittingLayoutComponentKotlin = false
  lines.push(`}`)
  _activePropsParamName = undefined
  _signalNames = new Set()
  _functionNames = new Set()
  _machineNames = new Set()
  _i18nNamesKotlin = new Set()
  _fetchNames = new Set()
  _formNames = new Set()
  _netStatusNames = new Set()
  _routerRoutes = new Map()
  return lines.join('\n')
}

function emitKotlinDataClass(synth: {
  name: string
  fields: { name: string; type: TypeIR }[]
}): string {
  const params = synth.fields.map((f) => `val ${f.name}: ${kotlinType(f.type)}`).join(', ')
  // `@Serializable` for consistency with emitKotlinStruct (named `type X
  // = {...}` structs always carry it). Without it, a synthesized class
  // reachable from a fetch decode (`useFetch<{ name: string }[]>(url)`
  // → `Json.decodeFromString<List<AppData>>`) compiles against the
  // kotlinc validate stubs but FAILS a real Compose build ("Serializer
  // for class 'AppData' not found" — the serialization plugin only
  // generates serializers for annotated classes).
  return `@Serializable\ndata class ${synth.name}(${params})`
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
    // from @pyreon/native-runtime-kotlin — collapses the
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
    // Round-2 follow-up: when `createRouter({ beforeEach: [fn] })` /
    // `afterEach: [fn]` is configured, emit a `remember { … }`
    // block that constructs the router AND adds each guard fn ref
    // (as `::fnName` member ref) before returning. Without guards,
    // falls through to the bare init.
    const hasGuards =
      (d.beforeEach !== undefined && d.beforeEach.length > 0) ||
      (d.afterEach !== undefined && d.afterEach.length > 0)
    if (!hasGuards) {
      return `val ${kotlinIdent(d.name)} = remember { PyreonRouter() }`
    }
    const inner: string[] = ['PyreonRouter().apply {']
    for (const fn of d.beforeEach ?? []) {
      inner.push(`    beforeEachGuards.add(::${kotlinIdent(fn)})`)
    }
    for (const fn of d.afterEach ?? []) {
      inner.push(`    afterEachHooks.add(::${kotlinIdent(fn)})`)
    }
    inner.push('  }')
    return `val ${kotlinIdent(d.name)} = remember { ${inner.join('\n  ')} }`
  }
  // Phase 4: `const x = useFetch<T>('/url')` → a remembered PyreonFetch<T>.
  // The LaunchedEffect harness that runs it is emitted by emitKotlinComponent.
  if (d.kind === 'fetch') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonFetch<${kotlinType(d.type, ctx)}>() }`
  }
  // Phase 4.2: `const form = useForm({ initialValues })` → a remembered
  // PyreonForm seeded with the literal defaults. No harness (pure state).
  if (d.kind === 'form') {
    const parts: string[] = []
    if (d.initialValues.length) {
      parts.push(
        `initialValues = mapOf(${d.initialValues
          .map((p) => `${JSON.stringify(p.key)} to ${JSON.stringify(p.value)}`)
          .join(', ')})`,
      )
    }
    // v2 (form-binding arc) — validators as Kotlin lambdas; "" = valid.
    if (d.validators !== undefined && d.validators.length > 0) {
      const entries = d.validators
        .map(
          (v) =>
            `${JSON.stringify(v.key)} to { ${kotlinIdent(v.param)}: String -> ${emitKotlinExpr(v.body, 0)} }`,
        )
        .join(', ')
      parts.push(`validators = mapOf(${entries})`)
    }
    if (d.onSubmit !== undefined) {
      const bodyLines = d.onSubmit.body
        .map((st) => `      ${emitKotlinStatement(st, 6, ctx)}`)
        .join('\n')
      parts.push(
        `onSubmit = { ${kotlinIdent(d.onSubmit.param)} ->\n${bodyLines}\n    }`,
      )
    }
    return `val ${kotlinIdent(d.name)} = remember { PyreonForm(${parts.join(', ')}) }`
  }
  // Phase 4: `const net = useOnline()` → a remembered PyreonNetworkStatus.
  if (d.kind === 'network-status') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonNetworkStatus() }`
  }
  // Phase B6: `const data = useLoaderData<User>()` → a `val` that calls
  // the runtime helper. The reified-generic `useLoaderData<T>()` reads
  // `LocalPyreonRouter.current` internally, then returns
  // `router.loaderData.value[router.currentPath] as? T`.
  //
  // Emit shape:
  //   val data = useLoaderData<User>()
  //
  // The helper's reified generic does the cast at the call site. No
  // remember{} needed — the read is per-composition, the value is a
  // simple snapshot of the loaderData entry at that frame (recomposes
  // when loaderData.value changes — Compose's reactive map read).
  if (d.kind === 'useLoaderData') {
    const ty = kotlinType(d.type)
    return `val ${kotlinIdent(d.name)} = useLoaderData<${ty}>()`
  }
  // Phase 3: `const { id } = useParams()` → one `val` per field, each reading
  // the active router's params map (useParams() reads LocalPyreonRouter).
  if (d.kind === 'params-destructure') {
    return d.params
      .map((p) => `val ${kotlinIdent(p.local)} = useParams()[${JSON.stringify(p.key)}] ?: ""`)
      .join('\n  ')
  }
  // Phase 4: `const can = usePermissions([...])` → a remembered
  // PyreonPermissions seeded with the literal grant keys. Reads are method
  // calls (`can.can("x")`) — no `.value` field-read rewrite needed.
  if (d.kind === 'permissions') {
    const seed = d.grants.length
      ? `setOf(${d.grants.map((g) => JSON.stringify(g)).join(', ')})`
      : ''
    return `val ${kotlinIdent(d.name)} = remember { PyreonPermissions(${seed}) }`
  }
  // Phase 4: `const cb = useClipboard()` → a remembered PyreonClipboard.
  // Reads are method calls (`cb.copy("hi")`) + a Boolean field
  // (`cb.copied`) — no `.value` rewrite. Compose's clipboard API needs
  // a `Context`; PyreonClipboard captures it at CONSTRUCTION time so
  // the call-site signature matches Swift's one-for-one.
  //
  // THREE-line emit (Round-1 audit follow-up — scope-leak fix):
  //   1. `val ${name}Ctx = LocalContext.current` — Local reads can't
  //      live inside `remember { … }`'s lambda (it's non-Composable).
  //      Hoist to a sibling val.
  //   2. `val ${name}Scope = rememberCoroutineScope()` — the
  //      composition-bound coroutine scope. PyreonClipboard's 2s
  //      reset coroutine launches on this scope; when the composable
  //      leaves composition, `rememberCoroutineScope()` auto-cancels
  //      its scope, which interrupts any in-flight `delay(2000)` and
  //      prevents the `_copied = false` write from firing post-
  //      unmount. Pre-fix PyreonClipboard built its own
  //      `CoroutineScope(Dispatchers.IO)` with no parent Job — a real
  //      leak under repeated remount.
  //   3. `val ${name} = remember { PyreonClipboard(ctx, scope) }` —
  //      same shape as before, just with the scope passed in.
  if (d.kind === 'clipboard') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id}Scope = rememberCoroutineScope()`,
      `val ${id} = remember { PyreonClipboard(${id}Ctx, ${id}Scope) }`,
    ].join('\n  ')
  }
  // Gap 4 PR-3: `const i18n = createI18n({...})` →
  // `val i18n = remember { PyreonI18n(...) }`. Method `i18n.t("key")`
  // flows through unchanged (PyreonI18n.t is defined on the runtime
  // container).
  if (d.kind === 'i18n') {
    const entries = Object.entries(d.messages)
      .map(([loc, kv]) => {
        const inner = Object.entries(kv)
          .map(([k, v]) => `${JSON.stringify(k)} to ${JSON.stringify(v)}`)
          .join(', ')
        return `${JSON.stringify(loc)} to ${inner === '' ? 'mapOf()' : `mapOf(${inner})`}`
      })
      .join(', ')
    const msgLit = entries === '' ? 'mapOf()' : `mapOf(${entries})`
    const fbArg =
      d.fallbackLocale !== undefined
        ? `, fallbackLocale = ${JSON.stringify(d.fallbackLocale)}`
        : ''
    return `val ${kotlinIdent(d.name)} = remember { PyreonI18n(initialLocale = ${JSON.stringify(d.locale)}, messages = ${msgLit}${fbArg}) }`
  }
  // Gap 4 PR-2: `const m = createMachine({ initial, states })` →
  // `val m = remember { PyreonMachine(initial = "idle",
  // transitions = mapOf("idle" to mapOf("FETCH" to "loading"), ...)) }`.
  // Method calls flow through unchanged (`m.send("X")`, `m.matches("Y")`,
  // `m.can("Z")`, `m.nextEvents()`); `m()` works via Kotlin
  // `operator fun invoke()`. Empty transitions map → `mapOf()`.
  if (d.kind === 'machine') {
    const entries = Object.entries(d.transitions)
      .map(([state, events]) => {
        const ev = Object.entries(events)
          .map(
            ([event, next]) =>
              `${JSON.stringify(event)} to ${JSON.stringify(next)}`,
          )
          .join(', ')
        const inner = ev === '' ? 'mapOf()' : `mapOf(${ev})`
        return `${JSON.stringify(state)} to ${inner}`
      })
      .join(', ')
    const transLit = entries === '' ? 'mapOf()' : `mapOf(${entries})`
    return `val ${kotlinIdent(d.name)} = remember { PyreonMachine(initial = ${JSON.stringify(d.initial)}, transitions = ${transLit}) }`
  }
  // Phase 4 follow-up: `const scheme = useColorScheme()` →
  // `val ${name} = if (isSystemInDarkTheme()) "dark" else "light"`.
  // Compose's `isSystemInDarkTheme()` is a `@Composable` function
  // (lives in `androidx.compose.foundation`) — no runtime port
  // needed. Returns the same `"light" | "dark"` string shape Swift
  // emits so cross-platform comparisons work identically.
  if (d.kind === 'color-scheme') {
    return `val ${kotlinIdent(d.name)} = if (isSystemInDarkTheme()) "dark" else "light"`
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
/**
 * Does this emitted-expression string denote a Kotlin ASSIGNMENT
 * (`target = value`) rather than a value expression? Drives the
 * expression-body vs block-body decision in `emitKotlinFunction` —
 * Kotlin assignments are statements, so `fun f() = x = v` is a syntax
 * error. String-level check on the lowered output (the assignment
 * lowerings — signal/store `.set` and `.update` — all produce
 * `<ident-chain> = …` with a single space-equals-space at the top
 * level); an `==`/`!=`/`<=`/`>=` comparison never matches because of
 * the surrounding-space requirement plus the leading ident-chain
 * anchor.
 */
function kotlinExprIsAssignment(emitted: string): boolean {
  return /^[A-Za-z_][\w.()]*\s=\s/.test(emitted)
}

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
    // An expression that LOWERS to an assignment (`.set` / `.update` on
    // a signal or store field → `x = v`) cannot use the
    // expression-body form — Kotlin assignments are statements, so
    // `fun reset() = count = 0` is a syntax error. Pre-existing gap
    // exposed the moment a fixture used an expression-body arrow for a
    // mutation (`const reset = () => count.set(0)`); all earlier
    // fixtures used block bodies. Block form is always-correct here.
    if (kotlinExprIsAssignment(concise)) {
      return `fun ${kotlinIdent(d.name)}(${params})${retType} {\n    ${concise}\n  }`
    }
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
      // Fractional literal → Double; integer → Int (ergonomic default).
      return t.float === true ? 'Double' : 'Int'
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
      // Nullish literal (JS null, or `undefined` lowered by the
      // parser) — Kotlin's nullish value IS spelled `null`; explicit
      // so the Swift-side `nil` divergence is visible here.
      if (e.value === null) return 'null'
      // `float: true` forces an integer-valued literal to Double (`0` →
      // `0.0`) — set by the reduce-seed refinement so a `fold(0.0, …)`
      // seed matches a Double accumulation. A genuinely-fractional value
      // already renders with its decimal (`12.5`).
      if (typeof e.value === 'number' && e.float === true && Number.isInteger(e.value)) {
        return `${e.value}.0`
      }
      return String(e.value)
    case 'identifier':
      return kotlinIdent(e.name)
    case 'call': {
      // `console.log(…)` → `println(…)` — the universal TS debug call
      // maps to Kotlin's stdlib print (Swift mirror: `print`).
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 'log' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'console'
      ) {
        return `println(${e.args.map((a) => emitKotlinExpr(a, indent)).join(', ')})`
      }
      // `String(x)` — JS number/value → string coercion. Kotlin has NO
      // `String(Any)` constructor (only `String(CharArray)`), so the
      // verbatim emit is invalid. Map to `(x).toString()`. Common in
      // every numeric table cell (`String(row.revenue)`). Swift's
      // `String(x)` IS valid, so only the Kotlin backend needs this.
      if (
        e.callee.kind === 'identifier' &&
        e.callee.name === 'String' &&
        e.args.length === 1
      ) {
        return `(${emitKotlinExpr(e.args[0]!, indent)}).toString()`
      }
      // `parseInt(s)` / `parseFloat(s)` → Kotlin `(s).toIntOrNull() ?: 0`
      // / `(s).toDoubleOrNull() ?: 0.0`. JS returns NaN on failure; the
      // `?:` default keeps a non-null Int/Double. A radix arg is ignored.
      if (
        e.callee.kind === 'identifier' &&
        (e.callee.name === 'parseInt' || e.callee.name === 'parseFloat') &&
        e.args.length >= 1
      ) {
        const arg = emitKotlinExpr(e.args[0]!, indent)
        return e.callee.name === 'parseInt'
          ? `((${arg}).toIntOrNull() ?: 0)`
          : `((${arg}).toDoubleOrNull() ?: 0.0)`
      }
      // Fetch-arc: zero-arg call on a fetch FIELD — `quotes.data()` /
      // `quotes.isPending()` (the web signal-read shape) → MutableState
      // `.value` read. `refetch` is excluded (real method, parens
      // preserved by the generic call emit below).
      if (
        e.args.length === 0 &&
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _fetchNames.has(e.callee.object.name) &&
        (e.callee.property === 'data' ||
          e.callee.property === 'isPending' ||
          e.callee.property === 'error')
      ) {
        return `${kotlinIdent(e.callee.object.name)}.${e.callee.property}.value`
      }
      // Store METHOD call — `useX().store.M(args…)` →
      // `PyreonStore_id.M(args…)`. Mirror of emit-swift's rewrite;
      // must precede the zero-arg READ rewrite (a zero-arg method call
      // would otherwise lose its parens).
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'member' &&
        e.callee.object.property === 'store' &&
        e.callee.object.object.kind === 'call' &&
        e.callee.object.object.callee.kind === 'identifier' &&
        _storeMethodNamesKotlin.get(e.callee.object.object.callee.name)?.has(e.callee.property) === true
      ) {
        const storeId = _storeHooksKotlin.get(e.callee.object.object.callee.name)!
        const args = e.args.map((a) => emitKotlinExpr(a, indent)).join(', ')
        return `PyreonStore_${storeId}.${kotlinIdent(e.callee.property)}(${args})`
      }
      // i18n two-arg t(): `i18n.t('items', { count: n() })` — the
      // object-literal VALUES argument lowers to a Kotlin map (the
      // runtime's `t(key, values: Map<String, Any?>)` overload). The
      // general object-literal emit produces a data-class construction
      // / `(field = value)` pseudo-tuple — wrong in this call position.
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 't' &&
        e.callee.object.kind === 'identifier' &&
        _i18nNamesKotlin.has(e.callee.object.name) &&
        e.args.length === 2 &&
        e.args[1]!.kind === 'object' &&
        (e.args[1]! as Extract<ExprIR, { kind: 'object' }>).spreads === undefined
      ) {
        const keyArg = emitKotlinExpr(e.args[0]!, indent)
        const obj = e.args[1]! as Extract<ExprIR, { kind: 'object' }>
        const entries = obj.fields
          .map((f) => `${JSON.stringify(f.name)} to ${emitKotlinExpr(f.value, indent)}`)
          .join(', ')
        return `${kotlinIdent(e.callee.object.name)}.t(${keyArg}, mapOf(${entries}))`
      }
      // Gap 4 v1: signal-style read on a store field — drop the parens.
      // Same chain-shape as Swift: call(member(<field>, member(store,
      // call(<hook>, []))), []).
      if (
        e.args.length === 0 &&
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'member' &&
        e.callee.object.property === 'store' &&
        e.callee.object.object.kind === 'call' &&
        e.callee.object.object.callee.kind === 'identifier' &&
        e.callee.object.object.args.length === 0 &&
        _storeHooksKotlin.has(e.callee.object.object.callee.name)
      ) {
        const storeId = _storeHooksKotlin.get(e.callee.object.object.callee.name)!
        return `PyreonStore_${storeId}.${kotlinIdent(e.callee.property)}`
      }
      // Gap 4 v1: write to a store field — `useFoo().store.X.set(v)`
      // → `PyreonStore_foo.X = v` (Compose `by mutableStateOf` var).
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 'set' &&
        e.callee.object.kind === 'member' &&
        e.callee.object.object.kind === 'member' &&
        e.callee.object.object.property === 'store' &&
        e.callee.object.object.object.kind === 'call' &&
        e.callee.object.object.object.callee.kind === 'identifier' &&
        _storeHooksKotlin.has(e.callee.object.object.object.callee.name)
      ) {
        const storeId = _storeHooksKotlin.get(e.callee.object.object.object.callee.name)!
        const field = kotlinIdent(e.callee.object.property)
        const value = e.args[0] ? emitKotlinExpr(e.args[0], indent) : '0'
        return `PyreonStore_${storeId}.${field} = ${value}`
      }
      // `.update(fn)` lowering — mirror of emit-swift's (see its doc
      // comment): IR-level param substitution into an assignment.
      if (e.callee.kind === 'member' && e.callee.property === 'update' && e.args.length === 1) {
        const target = e.callee.object
        let storeLhs: string | undefined
        let isUpdateTarget = target.kind === 'identifier' && _signalNames.has(target.name)
        if (
          !isUpdateTarget &&
          target.kind === 'member' &&
          target.object.kind === 'member' &&
          target.object.property === 'store' &&
          target.object.object.kind === 'call' &&
          target.object.object.callee.kind === 'identifier' &&
          _storeHooksKotlin.has(target.object.object.callee.name)
        ) {
          isUpdateTarget = true
          const storeId = _storeHooksKotlin.get(target.object.object.callee.name)!
          storeLhs = `PyreonStore_${storeId}.${kotlinIdent(target.property)}`
        }
        if (isUpdateTarget) {
          const fn = e.args[0]!
          if (fn.kind === 'arrow' && fn.params.length === 1) {
            const read: ExprIR =
              storeLhs === undefined ? target : { kind: 'call', callee: target, args: [] }
            const substituted = substituteIdentifier(fn.body, fn.params[0]!, read)
            if (substituted !== null) {
              const lhs = storeLhs ?? emitKotlinExpr(target, indent)
              return `${lhs} = ${emitKotlinExpr(substituted, indent)}`
            }
          }
          _emitWarnings.push(
            '`.update(fn)` lowering supports a single-param expression-body arrow whose param is not shadowed by a nested arrow — this call keeps the raw `.update(` emit (a kotlinc error at the site). Use `.set(read().…)` or rename the colliding inner param.',
          )
        }
      }
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
        // Gap 4 PR-2: PyreonMachine — `m()` invokes
        // `operator fun invoke()` to read the current state.
        if (_machineNames.has(e.callee.name)) {
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
      // `.filter` / `.map` / `.forEach` already match semantically and
      // pass through unchanged. `.reduce` does NOT: Kotlin's `reduce`
      // takes ONLY a combiner (no initial value, reduces to the element
      // type), so the JS 2-arg `reduce(reducer, initial)` form must
      // lower to `fold(initial, reducer)` — handled below.
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
          case 'join':
            // JS `arr.join(sep?)` → Kotlin `joinToString(sep)`. JS's
            // default separator is "," — emit it explicitly when omitted
            // (Kotlin's joinToString default is ", ", which differs).
            // (Kotlin String.split / .replace already match JS as-is.)
            if (e.args.length <= 1) {
              return `${obj}.joinToString(${e.args.length === 1 ? argExprs[0]! : '","'})`
            }
            break
          case 'concat':
            // JS `arr.concat(other)` → Kotlin `list + other` (immutable
            // concat). Parenthesised so a following operator / `.method()`
            // binds to the whole concatenation. (Swift mirror: `arr + other`.)
            if (e.args.length === 1) return `(${obj} + ${argExprs[0]!})`
            break
          case 'findIndex':
            // JS `arr.findIndex(pred)` → Kotlin `indexOfFirst(pred)`
            // (Swift: `firstIndex(where:)`). Kotlin's `String.repeat(n)`
            // already matches JS, so `repeat` needs no Kotlin mapping.
            if (e.args.length === 1) return `${obj}.indexOfFirst(${argExprs[0]!})`
            break
          case 'replaceAll':
            // JS `str.replaceAll(a, b)` → Kotlin `String.replace(a, b)`
            // (Kotlin's `replace` is replace-ALL — faithful; Swift uses
            // `replacingOccurrences`). Plain `replace` (JS first-only) is
            // deliberately NOT mapped.
            if (e.args.length === 2) return `${obj}.replace(${argExprs[0]!}, ${argExprs[1]!})`
            break
          case 'flat':
            // JS `arr.flat()` (one level) → Kotlin `flatten()` (Swift:
            // `flatMap { $0 }`). No-arg (depth-1) form only.
            if (e.args.length === 0) return `${obj}.flatten()`
            break
          case 'reverse':
            // JS `arr.reverse()` → Kotlin `reversed()` (non-mutating, returns
            // a new List<T> — render-safe, mirrors `rx.reverse`; Swift:
            // `Array(reversed())`).
            if (e.args.length === 0) return `${obj}.reversed()`
            break
          case 'reduce':
            // JS `arr.reduce(reducer, initial)` → Kotlin `fold(initial,
            // reducer)`. Kotlin's `reduce` takes ONLY a combiner (no
            // initial), so the 2-arg JS form needs `fold`. Mirrors
            // rx.reduce. The 1-arg form (`arr.reduce(cb)`) IS valid
            // Kotlin `reduce {}` → falls through to the generic emit.
            if (e.args.length === 2) {
              return `${obj}.fold(${argExprs[1]!}, ${argExprs[0]!})`
            }
            break
          case 'toFixed': {
            // JS `n.toFixed(d)` → Kotlin `"%.<d>f".format(n)` (the
            // analytical currency/percent format; `String.format` is
            // a kotlin.text stdlib extension — no import needed). v1:
            // literal digit count (or 0-arg default 0) — a dynamic count
            // falls through to the generic emit.
            const digits =
              e.args.length === 0
                ? '0'
                : e.args[0]!.kind === 'literal' && typeof e.args[0]!.value === 'number'
                  ? String(e.args[0]!.value)
                  : null
            if (digits !== null) {
              return `"%.${digits}f".format(${obj})`
            }
            break
          }
          case 'toUpperCase':
            if (e.args.length === 0) return `${obj}.uppercase()`
            break
          case 'toLowerCase':
            if (e.args.length === 0) return `${obj}.lowercase()`
            break
          case 'sort': {
            // JS `arr.sort((a,b) => <numeric>)` → Kotlin
            // `sortedWith(Comparator { a, b -> <numeric> })`. Kotlin's
            // `sort` mutates in place and has no lambda overload;
            // `sortedWith` returns a new list and the Comparator lambda
            // returns the JS comparator's Int directly (negative if a
            // should come first — same convention). v1: a 2-param arrow
            // comparator with an expression body; else falls through.
            const cmp = e.args[0]
            if (e.args.length === 1 && cmp!.kind === 'arrow' && cmp!.params.length === 2) {
              const ps = cmp!.params.map((p) => kotlinIdent(p)).join(', ')
              return `${obj}.sortedWith(Comparator { ${ps} -> ${emitKotlinExpr(cmp!.body, indent)} })`
            }
            break
          }
          case 'toLocaleString':
            // No native locale-number-formatting equivalent. Degrade to
            // `.toString()` (valid, loses grouping) + warn — mirror of
            // the Swift backend.
            if (e.args.length === 0) {
              _emitWarnings.push(
                '.toLocaleString() has no native locale-formatting equivalent — emitting a plain string conversion (no grouping separators). Format the value explicitly if you need grouping.',
              )
              return `(${obj}).toString()`
            }
            break
        }
      }
      const callee = emitKotlinExpr(e.callee, indent)
      const args = e.args.map((a) => emitKotlinExpr(a, indent)).join(', ')
      return `${callee}(${args})`
    }
    case 'index': {
      // `xs[i]` — Kotlin lists share the subscript syntax verbatim.
      return `${emitKotlinExpr(e.object, indent)}[${emitKotlinExpr(e.index, indent)}]`
    }
    case 'member': {
      // v2 (form-binding arc) — per-field dict access on a form
      // container: `form.values.email` → `form.values.value["email"]
      // ?: ""` (the MutableState map needs `.value` + the subscript;
      // `touched` defaults false). Mirror of the Swift rewrite.
      if (
        e.object.kind === 'member' &&
        e.object.object.kind === 'identifier' &&
        _formNames.has(e.object.object.name) &&
        (e.object.property === 'values' ||
          e.object.property === 'errors' ||
          e.object.property === 'touched')
      ) {
        const dflt = e.object.property === 'touched' ? 'false' : '""'
        return `(${kotlinIdent(e.object.object.name)}.${e.object.property}.value[${JSON.stringify(e.property)}] ?: ${dflt})`
      }
      // Gap 4 v1: rewrite `<useFoo>().store.X` → `PyreonStore_foo.X`.
      // Same chain-shape recognition as emit-swift's; Kotlin's `object`
      // declaration is the singleton (no `.shared` accessor needed).
      if (
        e.object.kind === 'member' &&
        e.object.property === 'store' &&
        e.object.object.kind === 'call' &&
        e.object.object.callee.kind === 'identifier' &&
        e.object.object.args.length === 0 &&
        _storeHooksKotlin.has(e.object.object.callee.name)
      ) {
        const storeId = _storeHooksKotlin.get(e.object.object.callee.name)!
        return `PyreonStore_${storeId}.${kotlinIdent(e.property)}`
      }
      // Gap 4 v2 follow-up: rewrite `<instance>.<field>` for top-level
      // state-tree model instances. `const counter = model({...}).create()`
      // produces a singleton object PyreonModel_counter; user reads
      // `counter.label` emit as `PyreonModel_counter.label`.
      if (
        e.object.kind === 'identifier' &&
        _modelInstancesKotlin.has(e.object.name)
      ) {
        const modelId = _modelInstancesKotlin.get(e.object.name)!
        return `PyreonModel_${modelId}.${kotlinIdent(e.property)}`
      }
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
      // Phase 4: a useFetch decl's reactive fields are Compose MutableState
      // — `x.data` / `x.error` / `x.isPending` read through `.value`.
      if (
        e.object.kind === 'identifier' &&
        _fetchNames.has(e.object.name) &&
        (e.property === 'data' || e.property === 'error' || e.property === 'isPending')
      ) {
        return `${kotlinIdent(e.object.name)}.${e.property}.value`
      }
      // Phase 4.2: a useForm decl's MutableState fields read through `.value`.
      // `isValid` is a derived Boolean getter (not MutableState) → plain read.
      if (
        e.object.kind === 'identifier' &&
        _formNames.has(e.object.name) &&
        (e.property === 'values' ||
          e.property === 'errors' ||
          e.property === 'touched' ||
          e.property === 'isSubmitting')
      ) {
        return `${kotlinIdent(e.object.name)}.${e.property}.value`
      }
      // Phase 4: a useOnline decl's `isOnline` is Compose MutableState (`.value`).
      if (
        e.object.kind === 'identifier' &&
        _netStatusNames.has(e.object.name) &&
        e.property === 'isOnline'
      ) {
        return `${kotlinIdent(e.object.name)}.isOnline.value`
      }
      return `${emitKotlinExpr(e.object, indent)}.${kotlinIdent(e.property)}`
    }
    case 'binary': {
      const bl = emitKotlinExpr(e.left, indent)
      const br = emitKotlinExpr(e.right, indent)
      // JS `/` is ALWAYS float division (`7 / 2 === 3.5`). Kotlin integer
      // `/` truncates (`7 / 2 == 3`) — even assigned to a Double — so
      // coerce both operands with `.toDouble()` to match JS semantics. `/`
      // is only valid on numbers, so this is always sound. Other ops
      // (`+ - * %`) match JS for integers and are emitted verbatim.
      if (e.op === '/') {
        return `(${bl}).toDouble() / (${br}).toDouble()`
      }
      return `${bl} ${e.op} ${br}`
    }
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
      // match JS. `??` lowers to the Elvis operator — parenthesized
      // because Elvis binds LOOSER than comparisons (`a ?: b > 0`
      // parses as `a ?: (b > 0)`).
      if (e.op === '??') {
        return `(${emitKotlinExpr(e.left, indent)} ?: ${emitKotlinExpr(e.right, indent)})`
      }
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
    case 'rx-call':
      return emitKotlinRxCall(e, indent)
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
  if (tag === 'Transition') return emitKotlinTransition(e, indent)
  if (tag === 'TransitionGroup') return emitKotlinTransitionGroup(e, indent)
  // Escape-hatch primitives (Layer 4) — mirror of the Swift dispatcher.
  // On the Kotlin/Compose target only `<NativeAndroid>` renders its
  // children; `<NativeIOS>` and `<Web>` are other-platform branches →
  // render nothing (a no-op comment, valid in any Composable context).
  if (tag === 'NativeAndroid') return emitKotlinEscapeHatch(e, indent, /*matched*/ true)
  if (tag === 'NativeIOS' || tag === 'Web') {
    return emitKotlinEscapeHatch(e, indent, /*matched*/ false)
  }
  // <WebView> — native host (Android WebView via PyreonWebView) for
  // embedding web-only-rich viz inside a Compose native shell.
  if (tag === 'WebView') return emitKotlinWebView(e)
  // Phase 5 — walled tags. Mirror of the Swift dispatcher entry.
  // Compose has no equivalent for Suspense / ErrorBoundary / KeepAlive
  // either; previously these emitted FAKE composables (`Suspense(…) {}`)
  // that swiftc/kotlinc reject as unresolved. Graceful emit: a Box {}
  // wrapping the children + a leading comment surfacing the limitation.
  // Gap 3 PR-3.2 — real Suspense emit (mount-time splash semantic).
  // Gap 3 PR-3.3 — real ErrorBoundary emit (structural fallback).
  // Gap 3 PR-3.4 — real KeepAlive emit (visibility-preservation).
  if (tag === 'Suspense') {
    return emitKotlinSuspense(e, indent)
  }
  if (tag === 'ErrorBoundary') {
    return emitKotlinErrorBoundary(e, indent)
  }
  if (tag === 'KeepAlive') {
    return emitKotlinKeepAlive(e, indent)
  }
  if (tag === 'Text') return emitKotlinText(e, indent)
  if (tag === 'Button') return emitKotlinButton(e, indent)
  if (tag === 'TextField') return emitKotlinTextField(e, indent)
  // Phase B — canonical multi-platform primitives (@pyreon/primitives).
  // Mirror of emit-swift.ts's Phase B dispatcher entries. Per-primitive
  // emit functions consult the shared canonical-primitives.ts helpers
  // (token resolution, name maps) so iOS + Android stay in lockstep.
  if (tag === 'Stack') return emitKotlinStack(e, indent, /*defaultDirection*/ 'column')
  if (tag === 'Inline') return emitKotlinStack(e, indent, /*defaultDirection*/ 'row')
  if (tag === 'Layer') return emitKotlinLayer(e, indent)
  if (tag === 'Scroll') return emitKotlinScroll(e, indent)
  if (tag === 'Spacer') return emitKotlinSpacer(e)
  if (tag === 'Heading') return emitKotlinHeading(e, indent)
  if (tag === 'Icon') return emitKotlinIcon(e, indent)
  if (tag === 'Image') return emitKotlinImage(e, indent)
  if (tag === 'Modal') return emitKotlinModal(e, indent)
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
  // Thread the layout modifier so `data-testid` reaches the node as
  // Modifier.testTag — its absence on Text was the device-found bug
  // behind the tasks Espresso failure (the error-path assert queried
  // onNodeWithTag("login-error") and the tag was silently dropped;
  // iOS passed because the Swift Text emit carries the identifier).
  // Same fix shape as Field (a43599f01).
  const mod = emitKotlinLayoutModifier(e)
  const modArg = mod === '' ? '' : `, modifier = ${mod}`
  // Custom font → fontFamily = pyreonFont("<resource-name>") — a
  // runtime res/font lookup (PyreonAssets.kt), so no PostScript map is
  // needed on Android (Compose loads the font file directly).
  const font = readStaticAttrKotlin(e, 'font')
  const fontArg =
    typeof font === 'string'
      ? `, fontFamily = pyreonFont(${JSON.stringify(sanitizeKotlinFontName(font))})`
      : ''
  if (e.children.length === 0) return `Text(text = ""${fontArg}${modArg})`
  if (e.children.length === 1 && e.children[0]!.kind === 'text') {
    return `Text(text = ${JSON.stringify(e.children[0]!.value)}${fontArg}${modArg})`
  }
  const parts: string[] = []
  for (const c of e.children) {
    if (c.kind === 'text') parts.push(escapeKotlinInterp(c.value))
    else parts.push(`\${${emitKotlinExpr(c.expr, indent)}}`)
  }
  return `Text(text = "${parts.join('')}"${fontArg}${modArg})`
}

/** Android resource-name sanitize (mirror of the fonts materializer). */
function sanitizeKotlinFontName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
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
  // Round-1 audit fix: `disabled={true}` was SILENTLY dropped — Button
  // stayed enabled regardless of the prop. Compose's idiomatic disable
  // shape is the `enabled = <bool>` constructor argument (inverse of
  // `disabled`, defaulting to true).
  const enabledArg = kotlinEnabledArg(e)
  // Layout modifier chain INCLUDING `data-testid` → Modifier.testTag.
  // Mirror of the Swift Button fix — Button was the one interactive
  // primitive that dropped the testid (onNodeWithTag("login-submit")
  // found nothing while the Field's tag worked).
  const modifier = emitKotlinLayoutModifier(e)
  const args = [
    `onClick = ${action}`,
    ...(enabledArg ? [enabledArg] : []),
    ...(modifier ? [`modifier = ${modifier}`] : []),
  ]
  const buttonArgs = args.join(', ')
  const pad = ' '.repeat(indent + 2)
  if (labelText !== null) {
    return `Button(${buttonArgs}) {\n${pad}Text(${JSON.stringify(labelText)})\n${' '.repeat(indent)}}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `Button(${buttonArgs}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
 * Round-1 audit fix shared helper: resolve `disabled={…}` to a Compose
 * `enabled = <inverse-bool>` argument string. Returns the empty string
 * when the attr is absent or literal `false` (default-enabled, no arg
 * needed).
 *
 * Shapes:
 *   - `disabled` (boolean shorthand)         → `enabled = false`
 *   - `disabled={true}` / `disabled={false}` → `enabled = false` / ''
 *   - `disabled={signalOrExpr}`              → `enabled = !<expr>`
 *
 * Note the inverse: Compose's `enabled` is the OPPOSITE of Pyreon's
 * `disabled` (matching SwiftUI's `.disabled()` modifier semantically
 * AND HTML's `<input disabled>` attribute), so a signal-bound case
 * negates the expression with `!`.
 */
function kotlinEnabledArg(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const attr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === 'disabled',
  )
  if (!attr) return ''
  if (attr.value.kind === 'literal') {
    if (attr.value.value === false) return ''
    return 'enabled = false'
  }
  // Signal-bound / expression — negate to convert Pyreon's `disabled`
  // semantic to Compose's `enabled`. `emitKotlinSignalRead` handles
  // signal-name membership + plain-identifier emit.
  return `enabled = !${emitKotlinSignalRead(unwrapAccessorArrow(attr.value))}`
}

function emitKotlinAction(handler: ExprIR, indent: number): string {
  if (handler.kind === 'arrow') {
    // Multi-statement block body (`() => { a.set(1); b.set(2) }`) — emit
    // EVERY statement. Pre-fix the parse kept only the first statement and
    // silently dropped the rest (a HIGH "1 code, all platforms" bug). A
    // local minimal ctx suffices: handler statements are `sig = …`
    // expressions (the `expr` case reads no ctx field); object-literal
    // data-class synthesis from a handler body isn't collected — the same
    // limitation the single-expr path has (it emits via `emitKotlinExpr`,
    // which also doesn't synthesize), so this is not a regression.
    if (handler.stmts !== undefined && handler.stmts.length > 0) {
      const stmtCtx: KotlinCtx = { synthesizedDataClasses: [], componentName: '' }
      const pad = ' '.repeat(indent + 2)
      const lines = handler.stmts
        .map((s) => pad + emitKotlinStatement(s, indent + 2, stmtCtx))
        .join('\n')
      const head =
        handler.params.length === 0 ? '{' : `{ ${handler.params.map(kotlinIdent).join(', ')} ->`
      return `${head}\n${lines}\n${' '.repeat(indent)}}`
    }
    // Preserve arrow parameter names in the Kotlin lambda.
    // `(t) => draft.set(t)` → `{ t -> draft = t }` (NOT
    // `{ draft = t }` which leaves `t` unresolved). Kotlin lambdas
    // expose the single param as `it` by default; named params via
    // `name -> body`. Multi-param: `(a, b) -> body`.
    //
    // Round-1 audit fix (mirror of emitSwiftAction): empty arrow body
    // `() => {}` parses to `body: { kind: 'literal', value: '' }`.
    // Without this branch the emit is `{ "" }` — a lambda RETURNING
    // an empty String, which violates Compose's `() -> Unit` onClick
    // contract. Emit a truly empty lambda instead. Only applies to
    // zero-param arrows (a parameterized arrow with empty body is
    // exceedingly unusual and would still need its `param ->`
    // syntactic position).
    if (handler.body.kind === 'literal' && handler.body.value === '' && handler.params.length === 0) {
      return '{ }'
    }
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
  const cond = when ? emitKotlinSignalRead(unwrapAccessorArrow(when.value)) : 'true'
  const pad = ' '.repeat(indent + 2)
  const body = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `if (${cond}) {\n${body}\n${' '.repeat(indent)}}`
}

/**
 * Phase 5 — `<Transition show={cond}>children</Transition>` → Compose's
 * built-in `AnimatedVisibility(visible = cond) { … }` (default fade+expand
 * enter / fade+shrink exit). The web-only `enter`/`leave` CSS-class props
 * are ignored — Compose drives animation through its own system, not CSS
 * classes. Mirror of the SwiftUI `.transition`-on-a-show-gate shape.
 */
/**
 * Phase 5 — graceful emit for walled tags (Suspense / ErrorBoundary /
 * KeepAlive). Compose has no native equivalent for any of these:
 *   - Suspense: no async-render-suspend mechanism
 *   - ErrorBoundary: no render-time try/catch around composables
 *   - KeepAlive: no built-in state-cache across unmount
 *
 * Mirror of `emitSwiftWalledTagAsChildren`. Emits a `Box { … }`
 * (Compose's neutral container) wrapping the children + a leading
 * comment naming the limitation. Happy path renders the inner
 * content; fallback/cache behaviour is inert until a runtime-model
 * design lands.
 */
/**
 * Phase 2 — real `<Suspense fallback={X}>` emit for Compose
 * (loading-state semantic). Mirror of emitSwiftSuspense. Emits an
 * INLINE `if (<pending>) { fallback } else { children }` where
 * `<pending>` ORs every `useFetch` container's `.isPending.value`.
 * Reading the MutableState DIRECTLY in this composable's body
 * subscribes THIS scope, so it recomposes when the fetch settles —
 * passing the value to a child composable subscribes the wrong scope
 * (device-found; mirrors the Swift fix). No fetch → `false`.
 */
function emitKotlinSuspense(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const fallbackAttr = e.attrs.find(
    (a) => a.kind === 'attr' && a.name === 'fallback',
  ) as Extract<AttrIR, { kind: 'attr' }> | undefined
  if (!fallbackAttr) {
    return emitKotlinWalledTagAsChildren(e, indent, 'Suspense')
  }
  const fallbackExpr = fallbackAttr.value
  if (fallbackExpr.kind !== 'jsx-element') {
    _emitWarnings.push(
      '<Suspense fallback={…}> on Kotlin target: only JSX-literal fallback is supported in v1 (e.g. `fallback={<Spinner/>}`). Falling back to walled emit.',
    )
    return emitKotlinWalledTagAsChildren(e, indent, 'Suspense')
  }
  const inner = ' '.repeat(indent + 2)
  const p = ' '.repeat(indent)
  const childrenBody = e.children
    .map((c) => inner + '  ' + emitKotlinChild(c, indent + 4))
    .join('\n')
  const fallbackBody =
    inner +
    '  ' +
    emitKotlinChild({ kind: 'expr', expr: fallbackExpr }, indent + 4)
  // Real semantics (Phase 2), emitted INLINE — NOT via a child
  // composable. Reading the isPending MutableState DIRECTLY in this
  // composable's body subscribes THIS scope, so it recomposes when the
  // fetch settles. Passing the value to a child composable subscribes
  // the wrong scope (device-found, mirrors the Swift fix). No fetch →
  // `false`.
  const fetches = [..._fetchNames]
  const isLoading =
    fetches.length > 0
      ? fetches.map((f) => `${kotlinIdent(f)}.isPending.value`).join(' || ')
      : 'false'
  return (
    `if (${isLoading}) {\n` +
    `${fallbackBody}\n` +
    `${p}} else {\n` +
    `${childrenBody}\n` +
    `${p}}`
  )
}

/**
 * Phase 2 — real `<ErrorBoundary fallback={X}>` emit on Compose.
 * Mirror of emitSwiftErrorBoundary. Emits an INLINE
 * `if (<errored>) { fallback } else { children }` where `<errored>`
 * ORs every `useFetch` container's `.error.value != null`, read
 * directly in this composable's body so it recomposes when a fetch
 * fails. No fetch → `false`.
 */
function emitKotlinErrorBoundary(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const fallbackAttr = e.attrs.find(
    (a) => a.kind === 'attr' && a.name === 'fallback',
  ) as Extract<AttrIR, { kind: 'attr' }> | undefined
  if (!fallbackAttr) {
    return emitKotlinWalledTagAsChildren(e, indent, 'ErrorBoundary')
  }
  const fallbackExpr = fallbackAttr.value
  if (fallbackExpr.kind !== 'jsx-element') {
    _emitWarnings.push(
      '<ErrorBoundary fallback={…}> on Kotlin target: only JSX-literal fallback is supported in v1 (e.g. `fallback={<ErrorView/>}`). Falling back to walled emit.',
    )
    return emitKotlinWalledTagAsChildren(e, indent, 'ErrorBoundary')
  }
  const inner = ' '.repeat(indent + 2)
  const p = ' '.repeat(indent)
  const childrenBody = e.children
    .map((c) => inner + '  ' + emitKotlinChild(c, indent + 4))
    .join('\n')
  const fallbackBody =
    inner +
    '  ' +
    emitKotlinChild({ kind: 'expr', expr: fallbackExpr }, indent + 4)
  const fetches = [..._fetchNames]
  const hasError =
    fetches.length > 0
      ? fetches.map((f) => `${kotlinIdent(f)}.error.value != null`).join(' || ')
      : 'false'
  return (
    `if (${hasError}) {\n` +
    `${fallbackBody}\n` +
    `${p}} else {\n` +
    `${childrenBody}\n` +
    `${p}}`
  )
}

/**
 * Gap 3 PR-3.4 — real `<KeepAlive when={X}>` emit on Compose.
 * Mirror of emitSwiftKeepAlive. Children stay composed across
 * `when` toggles; hidden via alpha modifier when off so child
 * state (remember / mutableStateOf) survives intact.
 */
function emitKotlinKeepAlive(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const whenAttr = e.attrs.find(
    (a) => a.kind === 'attr' && a.name === 'when',
  ) as Extract<AttrIR, { kind: 'attr' }> | undefined
  if (!whenAttr) {
    return emitKotlinWalledTagAsChildren(e, indent, 'KeepAlive')
  }
  _needsKotlinKeepAliveWrapper = true
  const whenExpr = emitKotlinSignalRead(unwrapAccessorArrow(whenAttr.value))
  const inner = ' '.repeat(indent + 2)
  const p = ' '.repeat(indent)
  const childrenBody = e.children
    .map((c) => inner + '  ' + emitKotlinChild(c, indent + 4))
    .join('\n')
  return (
    `PyreonKeepAliveWrapper(when_ = ${whenExpr}) {\n` +
    `${childrenBody}\n` +
    `${p}}`
  )
}

/**
 * Compose KeepAlive wrapper composable — emitted once at module
 * scope when any KeepAlive site is encountered. Once shown, the
 * children stay composed across `when_` toggles (alpha-hidden when
 * off so state survives).
 */
const KOTLIN_KEEP_ALIVE_WRAPPER = `@Composable
private fun PyreonKeepAliveWrapper(
    when_: Boolean,
    content: @Composable () -> Unit,
) {
    var hasShown by remember { mutableStateOf(false) }
    LaunchedEffect(when_) { if (when_) hasShown = true }
    if (when_ || hasShown) {
        Box(modifier = Modifier.alpha(if (when_) 1f else 0f)) {
            content()
        }
    }
}`

let _needsKotlinKeepAliveWrapper = false

/**
 * Escape-hatch primitive emit (`<NativeAndroid>` / `<NativeIOS>` / `<Web>`).
 * `matched` = this branch targets Kotlin/Compose (`<NativeAndroid>`): emit
 * its children. Otherwise it's an other-platform branch → render nothing
 * (a no-op comment — valid wherever a Composable call is expected, since a
 * Composable that calls nothing renders nothing). Mirror of
 * `emitSwiftEscapeHatch`.
 */
function emitKotlinEscapeHatch(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
  matched: boolean,
): string {
  if (!matched || e.children.length === 0) {
    return `// escape-hatch: ${e.tag} branch renders nothing on Android`
  }
  const inner = ' '.repeat(indent + 2)
  return e.children.map((c) => inner + emitKotlinChild(c, indent + 2)).join('\n').trimStart()
}

function emitKotlinWalledTagAsChildren(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
  tag: 'Suspense' | 'ErrorBoundary' | 'KeepAlive',
): string {
  const inner = ' '.repeat(indent + 2)
  const body = e.children.map((c) => inner + emitKotlinChild(c, indent + 2)).join('\n')
  const p = ' '.repeat(indent)
  const limitation =
    tag === 'Suspense'
      ? 'no async-render-suspend on Compose'
      : tag === 'ErrorBoundary'
        ? 'no render-time try/catch on Compose'
        : 'no native state-cache across unmount on Compose'
  // Phase 3 native-readiness gap fix (2026-06-05) — mirror of Swift.
  // Surface dropped feature-bearing props as user-visible warnings.
  // Same catalog + rationale; see emit-swift.ts for the full doc.
  const droppableProps =
    tag === 'Suspense' || tag === 'ErrorBoundary' ? ['fallback'] : ['when', 'include', 'exclude']
  const droppedAttrs = e.attrs
    .filter((a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr')
    .map((a) => a.name)
    .filter((name) => droppableProps.includes(name))
  if (droppedAttrs.length > 0) {
    _emitWarnings.push(
      `<${tag}> on Kotlin target: dropped prop(s) [${droppedAttrs.join(', ')}] — ` +
        `${limitation}; children render but ${
          tag === 'Suspense'
            ? 'fallback never shows during async loads'
            : tag === 'ErrorBoundary'
              ? 'fallback never shows on render errors'
              : 'cache behaviour is inert (children re-create on every mount)'
        }. Use a per-target adapter (Layer 4: <NativeAndroid>) for full semantic parity.`,
    )
  }
  return (
    `// [Pyreon] <${tag}> unsupported on Android — rendering children only (${limitation}); fallback / cache behaviour inert.\n` +
    `${p}Box {\n${body}\n${p}}`
  )
}

function emitKotlinTransition(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const show = e.attrs.find((a) => a.kind === 'attr' && a.name === 'show') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const cond = show ? emitKotlinSignalRead(unwrapAccessorArrow(show.value)) : 'true'
  const pad = ' '.repeat(indent + 2)
  const body = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `AnimatedVisibility(visible = ${cond}) {\n${body}\n${' '.repeat(indent)}}`
}

/**
 * Phase 5.3 — `<TransitionGroup>{children}</TransitionGroup>` → a `Column`
 * carrying `Modifier.animateContentSize()`, Compose's built-in "animate this
 * container when its content changes" primitive. TransitionGroup's web
 * contract is "animate the enter/leave of a keyed list" (its child is
 * typically a `<For each={items}>`); `animateContentSize()` animates the
 * column's layout as items add/remove — the Compose-idiomatic analog of the
 * SwiftUI `.animation(.default, value:)`-on-a-VStack shape. Needs no explicit
 * driver value (unlike SwiftUI), so it works for any child content.
 */
function emitKotlinTransitionGroup(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const pad = ' '.repeat(indent + 2)
  const body = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `Column(modifier = Modifier.animateContentSize()) {\n${body}\n${' '.repeat(indent)}}`
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
      // Const-ref: `src={API_URL}` → resolve a module-level `const`
      // string/number/boolean binding to its literal. Unknown /
      // component-scope / non-const identifiers aren't in the map →
      // return undefined → existing "needs static" emit path.
      if (a.value.kind === 'identifier') {
        const resolved = _constStringMapKotlin.get(a.value.name)
        if (resolved !== undefined) return resolved
      }
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
  // E3.1 — `data-testid` becomes Compose's `Modifier.testTag()` (from
  // androidx.compose.ui.platform). Same string the web e2e selects
  // on (`getByTestId`) reaches Android UIAutomator / Espresso via
  // testTag. Other `data-*` attrs are silently dropped.
  const testid = readStaticAttrKotlin(e, 'data-testid')
  if (typeof testid === 'string') {
    parts.push(`.testTag(${JSON.stringify(testid)})`)
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
 * Map a canonical `<Heading level>` to a Compose **Material 2**
 * typography role — the emit's whole base is Material 2 (the import
 * header is `androidx.compose.material.*`; Button / Text / Icon all
 * resolve from there), so `MaterialTheme.typography` is Material 2's
 * `Typography` (h1–h6 / subtitle / body / …). The Material 3 names
 * (`headlineLarge`, …) do NOT exist on it — emitting them compiled in
 * the kotlinc validate loop (the stub faked them) but failed a real
 * `gradle assembleDebug` with "Unresolved reference 'headlineLarge'"
 * (the stub-masked-symbol class; no example used `<Heading>` so the
 * device gate never caught it). The roles below mirror the web scale
 * (32/24/20/18/16/14px) onto the closest Material 2 sizes
 * (h4≈34 / h5≈24 / h6≈20 / subtitle1≈16 / body1≈16 / body2≈14sp).
 */
const HEADING_TYPOGRAPHY: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'h4',
  2: 'h5',
  3: 'h6',
  4: 'subtitle1',
  5: 'body1',
  6: 'body2',
}

/**
 * Build the Compose `Text(...)` text-arg string from a primitive's
 * children — static text or `${expr}` interpolation. Shared by
 * `<Text>` and `<Heading>` emit.
 */
function kotlinTextArg(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  if (e.children.length === 0) return '""'
  if (e.children.length === 1 && e.children[0]!.kind === 'text') {
    return JSON.stringify(e.children[0]!.value)
  }
  const parts: string[] = []
  for (const c of e.children) {
    if (c.kind === 'text') parts.push(escapeKotlinInterp(c.value))
    else parts.push(`\${${emitKotlinExpr(c.expr, indent)}}`)
  }
  return `"${parts.join('')}"`
}

/**
 * Emit `<Heading level={N}>text</Heading>` as Compose
 * `Text(text = ..., style = MaterialTheme.typography.h4|…)`.
 * `level` → Material 2 typography role; `color` → `color =` arg.
 */
function emitKotlinHeading(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const levelRaw = readStaticAttrKotlin(e, 'level')
  const level = (typeof levelRaw === 'number' ? levelRaw : 1) as 1 | 2 | 3 | 4 | 5 | 6
  const args = [
    `text = ${kotlinTextArg(e, indent)}`,
    `style = MaterialTheme.typography.${HEADING_TYPOGRAPHY[level] ?? 'h4'}`,
  ]
  const color = readStaticAttrKotlin(e, 'color')
  if (typeof color === 'string') args.push(`color = ${resolveColor(color, 'kotlin')}`)
  // Same data-testid threading as Text (device-found bug class).
  const mod = emitKotlinLayoutModifier(e)
  if (mod !== '') args.push(`modifier = ${mod}`)
  return `Text(${args.join(', ')})`
}

const ICON_SIZE_DP: Record<string, number> = { sm: 16, md: 20, lg: 24 }

/**
 * Emit `<Icon name="..." />` as Compose
 * `Icon(imageVector = pyreonIcon("name"), contentDescription = "name", …)`.
 *
 * `pyreonIcon(name)` (from `@pyreon/native-runtime-kotlin`, stubbed for
 * typecheck) resolves the platform-agnostic name to a Material
 * `ImageVector` — the Compose analog of the web sprite-by-name + the
 * `rememberPyreonStorage` helper precedent (Compose has no string-keyed
 * icon API in core, unlike SwiftUI's `Image(systemName:)`). `size` →
 * `Modifier.size`, `color` → `tint`.
 */
function emitKotlinIcon(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const name = readStaticAttrKotlin(e, 'name')
  if (typeof name !== 'string') {
    return emitKotlinGeneric(e, indent)
  }
  // Canonical name → COMPILE-TIME Icons.Filled reference via ICON_MAP.
  // This replaced the phantom `pyreonIcon(name)` runtime lookup, which
  // existed ONLY as a kotlinc stub — any real Gradle build with an
  // <Icon> failed on the unresolved reference (the same stub-masked
  // class as the fetch arc's missing imports; no example used Icon, so
  // the device gate never saw it). Compile-time refs also mean the
  // host needs only the small material-icons-core artifact. Unmapped
  // names warn and render the `warning` placeholder glyph — visible,
  // never silent.
  const mapped = ICON_MAP[name]
  if (!mapped) {
    _emitWarnings.push(
      `<Icon name=${JSON.stringify(name)}>: not in the canonical icon map — rendering the warning placeholder on Android (raw SF id pass-through is iOS-only). See ICON_MAP in canonical-primitives.ts.`,
    )
  }
  const args = [
    `imageVector = Icons.Filled.${mapped ? mapped.material : 'Warning'}`,
    `contentDescription = ${JSON.stringify(name)}`,
  ]
  const color = readStaticAttrKotlin(e, 'color')
  if (typeof color === 'string') args.push(`tint = ${resolveColor(color, 'kotlin')}`)
  // Layout modifier FIRST so data-testid threads (the Text/Heading
  // lesson — the size-only modifier used to drop the tag entirely).
  const layoutMod = emitKotlinLayoutModifier(e)
  const size = readStaticAttrKotlin(e, 'size')
  const sizeMod = typeof size === 'string' ? `.size(${ICON_SIZE_DP[size] ?? 20}.dp)` : ''
  const modifier =
    layoutMod !== '' ? `${layoutMod}${sizeMod}` : sizeMod !== '' ? `Modifier${sizeMod}` : ''
  if (modifier !== '') args.push(`modifier = ${modifier}`)
  return `Icon(${args.join(', ')})`
}

/**
 * Emit `<Image src alt width? height?>` as Compose
 * `AsyncImage(model = "src", contentDescription = "alt", …)` (Coil).
 * Numeric `width`/`height` → `Modifier.width/height(N.dp)` (string web
 * units skipped). `fit` deferred (needs `contentScale` — type-level
 * prop accepted, silent no-op, mirrors Swift). Non-literal `src` →
 * generic fallthrough.
 */
/** Mirror of emit-swift's imageSrcKind — the canonical src dispatch. */
function imageSrcKindKotlin(src: string): 'remote' | 'bundled' | 'path' {
  if (/^https?:\/\//.test(src)) return 'remote'
  if (src.includes('/')) return 'path'
  return 'bundled'
}

const KOTLIN_CONTENT_SCALE: Record<string, string> = {
  cover: 'ContentScale.Crop',
  contain: 'ContentScale.Fit',
  fill: 'ContentScale.FillBounds',
  none: 'ContentScale.None',
}

/**
 * `<WebView html="…" />` / `<WebView src="…" />` → `PyreonWebView(html = …)`
 * / `PyreonWebView(src = …)` (the Android WebView host in
 * @pyreon/native-runtime-kotlin). Mirror of `emitSwiftWebView`.
 */
function emitKotlinWebView(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  // Content arg — `html` or `src`, static (literal / module-const) or
  // dynamic (signal-derived → reloads reactively; accessor arrows unwrap).
  const content = kotlinWebViewContentArg(e)
  // Live-data bridge — `data={signal}` is JSON-encoded (PyreonJson.encode)
  // + PUSHED into the running page (window.__pyreonData) on load + on
  // every change WITHOUT reloading, so the chart updates in place.
  const dataExpr = dynamicWebViewAttrKotlin(e, 'data')
  const dataArg =
    dataExpr !== undefined ? `data = PyreonJson.encode(${emitKotlinExpr(dataExpr, 0)})` : undefined
  // Reverse bridge — `onMessage={(m) => …}` receives the string the page
  // sends via `window.pyreonPostMessage(...)`.
  const onMsg = e.attrs.find((a) => a.kind === 'event' && a.name === 'message')
  const onMsgArg =
    onMsg?.kind === 'event'
      ? `onMessage = ${emitKotlinMessageHandler(onMsg.handler)}`
      : undefined
  if (content === undefined) {
    _emitWarnings.push(
      '<WebView>: needs an `html` or `src` attribute on native; emitting an empty PyreonWebView().',
    )
    return 'PyreonWebView()'
  }
  const args = [content, dataArg, onMsgArg].filter((a) => a !== undefined).join(', ')
  return `PyreonWebView(${args})`
}

/**
 * Emit a `<WebView onMessage={…}>` handler as a Kotlin `(String) -> Unit`
 * lambda. The single param is the page-posted string. An arrow with a
 * param keeps it (`{ m -> … }`); a zero-param arrow ignores it
 * (`{ _ -> … }`); a bare function reference is called with the message.
 */
function emitKotlinMessageHandler(handler: ExprIR): string {
  if (handler.kind === 'arrow') {
    if (handler.body.kind === 'literal' && handler.body.value === '') {
      return '{ _ -> }'
    }
    const param = handler.params.length > 0 ? kotlinIdent(handler.params[0]!) : '_'
    return `{ ${param} -> ${emitKotlinExpr(handler.body, 0)} }`
  }
  return `{ pyreonMsg -> ${emitKotlinExpr(handler, 0)}(pyreonMsg) }`
}

/** The `html` / `src` constructor arg for `<WebView>` (Kotlin). Mirror of
 * `swiftWebViewContentArg`. `html` wins over `src`; undefined when neither. */
function kotlinWebViewContentArg(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string | undefined {
  const html = readStaticAttrKotlin(e, 'html')
  if (typeof html === 'string') return `html = ${JSON.stringify(html)}`
  const dynHtml = dynamicWebViewAttrKotlin(e, 'html')
  if (dynHtml !== undefined) return `html = ${emitKotlinExpr(dynHtml, 0)}`
  const src = readStaticAttrKotlin(e, 'src')
  if (typeof src === 'string') return `src = ${JSON.stringify(src)}`
  const dynSrc = dynamicWebViewAttrKotlin(e, 'src')
  if (dynSrc !== undefined) return `src = ${emitKotlinExpr(dynSrc, 0)}`
  return undefined
}

/** Mirror of emit-swift's `dynamicWebViewAttr` — see there. */
function dynamicWebViewAttrKotlin(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  name: string,
): ExprIR | undefined {
  for (const a of e.attrs) {
    if (a.kind === 'attr' && a.name === name) {
      const v = a.value
      if (v.kind === 'arrow' && v.params.length === 0) return v.body
      return v
    }
  }
  return undefined
}

function emitKotlinImage(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const src = readStaticAttrKotlin(e, 'src')
  if (typeof src !== 'string') {
    return emitKotlinGeneric(e, indent)
  }
  const kind = imageSrcKindKotlin(src)
  if (kind === 'path') {
    _emitWarnings.push(
      `<Image src=${JSON.stringify(src)}>: path-style src is web-only — use a bare asset name (bundled via the assets pipeline) or a full http(s) URL on native.`,
    )
  }
  const alt = readStaticAttrKotlin(e, 'alt')
  const fit = readStaticAttrKotlin(e, 'fit')
  const width = readStaticAttrKotlin(e, 'width')
  const height = readStaticAttrKotlin(e, 'height')
  // Layout modifier FIRST in the chain so data-testid threads (the
  // Text/Heading lesson — its absence is device-invisible until a tag
  // query fails), then explicit sizes.
  const layoutMod = emitKotlinLayoutModifier(e)
  const modParts: string[] = []
  if (typeof width === 'number') modParts.push(`.width(${width}.dp)`)
  if (typeof height === 'number') modParts.push(`.height(${height}.dp)`)
  const modifier =
    layoutMod !== ''
      ? `${layoutMod}${modParts.join('')}`
      : modParts.length > 0
        ? `Modifier${modParts.join('')}`
        : ''
  if (kind === 'bundled') {
    // `pyreonDrawable(name)` (runtime helper) resolves the drawable id
    // by NAME via the app context — no `R.drawable` reference, so the
    // emitted file doesn't depend on the host's namespace and the
    // kotlinc validate stubs stay fixture-agnostic.
    const args = [
      `painter = painterResource(pyreonDrawable(${JSON.stringify(bundledAssetNameKotlin(src))}))`,
      `contentDescription = ${JSON.stringify(typeof alt === 'string' ? alt : '')}`,
      `contentScale = ${KOTLIN_CONTENT_SCALE[typeof fit === 'string' ? fit : 'cover'] ?? 'ContentScale.Crop'}`,
    ]
    if (modifier !== '') args.push(`modifier = ${modifier}`)
    return `Image(${args.join(', ')})`
  }
  const args = [
    `model = ${JSON.stringify(src)}`,
    `contentDescription = ${JSON.stringify(typeof alt === 'string' ? alt : '')}`,
  ]
  if (typeof fit === 'string' && KOTLIN_CONTENT_SCALE[fit] !== undefined) {
    args.push(`contentScale = ${KOTLIN_CONTENT_SCALE[fit]}`)
  }
  if (modifier !== '') args.push(`modifier = ${modifier}`)
  return `AsyncImage(${args.join(', ')})`
}

/** Asset-catalog name: basename sans extension (mirror of emit-swift). */
function bundledAssetNameKotlin(src: string): string {
  return src.replace(/\.[A-Za-z0-9]+$/, '')
}

/**
 * Map a canonical 1-D `align` to a Compose `Box` 2-D `contentAlignment`.
 * Mirrors the Swift `ZStack(alignment:)` mapping — the web `<Layer>`
 * maps `align` to grid `place-items` (both axes), so start → top-start,
 * center → center, end → bottom-end; `stretch` → center (no Box analog).
 */
const BOX_ALIGNMENT: Record<string, string> = {
  start: 'Alignment.TopStart',
  center: 'Alignment.Center',
  end: 'Alignment.BottomEnd',
  stretch: 'Alignment.Center',
}

/**
 * Emit `<Layer>` as Compose `Box` — children stack on the z-axis
 * (overlay), matching the web contract + the Swift `ZStack` emit.
 * `align` → `contentAlignment`; padding/background/radius/data-testid
 * via `emitKotlinLayoutModifier`.
 */
function emitKotlinLayer(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const initArgs: string[] = []
  const align = readStaticAttrKotlin(e, 'align')
  if (typeof align === 'string') {
    initArgs.push(`contentAlignment = ${BOX_ALIGNMENT[align] ?? 'Alignment.Center'}`)
  }
  const modifier = emitKotlinLayoutModifier(e)
  if (modifier !== '') initArgs.push(`modifier = ${modifier}`)
  const initSignature = initArgs.length > 0 ? `(${initArgs.join(', ')})` : ''
  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `Box${initSignature} {}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `Box${initSignature} {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
 * Emit `<Scroll>` as a Compose `Column`/`Row` with a scroll modifier.
 * `axis="horizontal"` → `Row(Modifier.horizontalScroll(rememberScrollState()))`;
 * vertical (default) → `Column(Modifier.verticalScroll(rememberScrollState()))`.
 * The scroll modifier leads the chain; padding/background/radius from
 * `emitKotlinLayoutModifier` append after it (its `Modifier` prefix is
 * stripped so the chain stays single-rooted).
 */
function emitKotlinScroll(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const horizontal = readStaticAttrKotlin(e, 'axis') === 'horizontal'
  const composable = horizontal ? 'Row' : 'Column'
  const scrollMod = horizontal
    ? '.horizontalScroll(rememberScrollState())'
    : '.verticalScroll(rememberScrollState())'
  const layoutMod = emitKotlinLayoutModifier(e)
  const modifier = `Modifier${scrollMod}${layoutMod === '' ? '' : layoutMod.replace(/^Modifier/, '')}`
  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `${composable}(modifier = ${modifier}) {}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `${composable}(modifier = ${modifier}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
 * Emit `<Spacer />` as Compose `Spacer(Modifier.weight(1f))` — the
 * flexible-gap primitive that pushes siblings apart in a Row/Column.
 * Self-closing; a `data-testid` chains via `emitKotlinLayoutModifier`
 * (its `Modifier` prefix stripped onto the weight chain).
 */
function emitKotlinSpacer(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string {
  const layoutMod = emitKotlinLayoutModifier(e)
  const modifier = `Modifier.weight(1f)${layoutMod === '' ? '' : layoutMod.replace(/^Modifier/, '')}`
  return `Spacer(modifier = ${modifier})`
}

/**
 * Emit `<Modal open={...} onClose={...}>content</Modal>` as a Compose
 * `Dialog`, conditionally composed behind an `if (open)` guard.
 *
 * Unlike SwiftUI's `.sheet(isPresented:)` (a modifier with two-way
 * binding), Compose shows a dialog by COMPOSING it conditionally and
 * relies on `onDismissRequest` to change the state that gates it — so
 * there is no signal-vs-expr split here: `open` becomes the `if`
 * condition (via `emitKotlinSignalRead`, same as `<Show when>`), and
 * `onClose` becomes `onDismissRequest` (the consumer flips `open`).
 * `Dialog` provides the scrim + back-press dismissal natively.
 *
 * `open` missing → generic fallthrough.
 */
function emitKotlinModal(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const openAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'open',
  )
  if (!openAttr) {
    return emitKotlinGeneric(e, indent)
  }
  const cond = emitKotlinSignalRead(unwrapAccessorArrow(openAttr.value))
  const onClose = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'close',
  )
  const onDismiss = onClose ? emitKotlinAction(onClose.handler, indent + 2) : '{}'
  const dialogPad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `if (${cond}) {\n${dialogPad}Dialog(onDismissRequest = ${onDismiss}) {}\n${' '.repeat(indent)}}`
  }
  const contentPad = ' '.repeat(indent + 4)
  const contentLines = e.children.map((c) => contentPad + emitKotlinChild(c, indent + 4)).join('\n')
  return (
    `if (${cond}) {\n` +
    `${dialogPad}Dialog(onDismissRequest = ${onDismiss}) {\n` +
    `${contentLines}\n` +
    `${dialogPad}}\n` +
    `${' '.repeat(indent)}}`
  )
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
  // Canonical Pyreon `<Field>` event is `onChangeText` (event name
  // `'changetext'`) — distinct from web's overloaded `onChange`.
  // G1 contract: when present, the user's arrow callback is threaded
  // verbatim with arrow-param preservation, producing the idiomatic
  // shape `onValueChange = { t -> sig = t }` (NOT auto-derived).
  const onChangeText = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'changetext',
  )
  // Signal-bound `value` is the contract that distinguishes the
  // specialized emit from the generic fallback. `onChangeText` is
  // OPTIONAL: when absent, auto-bind via `{ sig = it }` (mirrors
  // Swift's `emitSwiftField`, which similarly auto-binds via SwiftUI's
  // `$sig` binding). Previously the function required `onChangeText`,
  // making the bare `<Field value={sig}/>` shape fall through to
  // `emitKotlinGeneric` and emit a literal `Field(value = sig)` — no
  // such Compose composable, so the generated code was unbuildable.
  // v2 (form-binding arc) — `value={form.values.email}` binds through
  // the container: value reads the map, onValueChange routes through
  // setValue (→ re-validation). The user's `onChangeText` is SUBSUMED
  // (mirror of the Swift binding(_:) emit).
  let formBinding: { value: string; onChange: string } | undefined
  if (
    valueAttr !== undefined &&
    valueAttr.value.kind === 'member' &&
    valueAttr.value.object.kind === 'member' &&
    valueAttr.value.object.property === 'values' &&
    valueAttr.value.object.object.kind === 'identifier' &&
    _formNames.has(valueAttr.value.object.object.name)
  ) {
    const formName = kotlinIdent(valueAttr.value.object.object.name)
    const field = JSON.stringify(valueAttr.value.property)
    formBinding = {
      value: `${formName}.values.value[${field}] ?: ""`,
      onChange: `{ ${formName}.setValue(${field}, it) }`,
    }
  }

  if (
    formBinding === undefined &&
    (!valueAttr ||
      valueAttr.value.kind !== 'identifier' ||
      !_signalNames.has(valueAttr.value.name))
  ) {
    return emitKotlinGeneric(e, indent)
  }
  const sig =
    formBinding !== undefined
      ? ''
      : kotlinIdent((valueAttr!.value as Extract<ExprIR, { kind: 'identifier' }>).name)
  const onValueChange =
    formBinding?.onChange ??
    (onChangeText ? emitKotlinAction(onChangeText.handler, indent + 2) : `{ ${sig} = it }`)

  const args: string[] = [
    `value = ${formBinding?.value ?? sig}`,
    `onValueChange = ${onValueChange}`,
  ]

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
  // Layout modifier chain INCLUDING `data-testid` → Modifier.testTag —
  // the Field was dropping its tag (latent device failure: the Android
  // instrumented tests query onNodeWithTag("login-username") but the
  // emit never carried it; never surfaced because no Android
  // instrumented run had reached the assertion yet).
  const fieldModifier = emitKotlinLayoutModifier(e)
  if (fieldModifier) args.push(`modifier = ${fieldModifier}`)
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
 * with arrow-param preservation.
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
 *
 * C5.3 extension — when the router-attr names a `kind: 'router'` decl
 * carrying a `routes` array, the content block is wrapped in a Compose
 * `NavHost { composable(...) }` per-route dispatch:
 *
 *   RouterProvider(router) {
 *     val navController = rememberNavController()
 *     NavHost(navController = navController, startDestination = "/") {
 *       composable("/") { HomePage() }
 *       composable("/users/{id}") { entry ->
 *         val params = entry.arguments?.let { args ->
 *           args.keySet().associateWith { key -> args.getString(key) ?: "" }
 *         } ?: emptyMap()
 *         UserPage(params = params)
 *       }
 *     }
 *   }
 *
 * Path patterns convert from Pyreon's `:id` syntax to Compose's `{id}`
 * syntax in-place; Compose's own NavHost extracts named args, which
 * the emit wraps into a `Map<String, String>` for the matched
 * component's `params:` arg.
 *
 * Falls back to the bare-content emit when routes aren't resolvable
 * (back-compat with C4 scaffold + foreign-router-attr shapes).
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

  // C5.3 → R1.2: look up the named router-decl's routes. Same
  // fallback rules as Swift emit — non-identifier router-attr or
  // no routes → bare emit. R1.2 switched from NavHost to a
  // `when`-on-currentPath dispatch — simpler, no nav-compose dep,
  // closes the state-disconnect bug + no-match throw.
  let routesBlock = ''
  if (routerAttr.value.kind === 'identifier') {
    const routes = _routerRoutes.get(routerAttr.value.name)
    if (routes !== undefined && routes.length > 0) {
      routesBlock = emitKotlinRouteDispatch(routes, indent + 2)
    }
  }

  if (e.children.length === 0) {
    return `RouterProvider(${routerExpr}) { }`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  // When routes are resolved, the NavHost block REPLACES the bare
  // content. The user's <RouterView /> typically just marks the spot
  // where routed content goes; with NavHost it's not needed (NavHost
  // IS the router-content host on Compose).
  if (routesBlock !== '') {
    return `RouterProvider(${routerExpr}) {\n${routesBlock}\n${' '.repeat(indent)}}`
  }
  return `RouterProvider(${routerExpr}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
 * R1.2 — emit a Compose `when`-dispatch block for the given routes.
 *
 * Replaces the C5.3 NavHost-based emit. NavHost had three real problems:
 *   1. **State disconnect** — NavHost has its OWN navController; calling
 *      `router.push("/x")` updated `router.path` but NOT the navController,
 *      so navigation didn't drive UI updates.
 *   2. **No-match throw** — NavHost.navigate("/unknown") throws
 *      IllegalArgumentException at runtime.
 *   3. **AndroidX dep** — NavHost requires androidx.navigation.compose,
 *      pulling an Android-SDK dependency into emitted code.
 *
 * The when-dispatch shape solves all three:
 *   - Directly observes `router.currentPath` → Compose recomposes on
 *     any router.push/back/replace; no nav state to sync
 *   - Else-branch handles no-match gracefully (renders a 404 Text)
 *   - Uses only stable Compose primitives (no nav-compose dep)
 *   - Symmetric to Swift's emit (if/else if + else fallback) — same
 *     architecture across both native targets
 *
 * Emit shape:
 *   val currentPath = router.currentPath
 *   when {
 *     currentPath == "/" -> HomePage()
 *     currentPath == "/about" -> AboutPage()
 *     PyreonRouter.matchPath(currentPath, "/users/:id") != null -> {
 *       val params = PyreonRouter.matchPath(currentPath, "/users/:id") ?: emptyMap()
 *       UserPage(params = params)
 *     }
 *     else -> Text("Pyreon Router: no route for \${currentPath}")
 *   }
 */
function emitKotlinRouteDispatch(
  routes: import('./types').RouteIR[],
  indent: number,
): string {
  // Phase 3 (nested routes) — dispatch on FULL paths, wrapping each leaf in
  // its layout chain via content lambdas. Flat tables keep the unchanged
  // dispatch below — zero regression.
  if (hasNestedRoutes(routes)) {
    return emitKotlinNestedRouteDispatch(routes, indent)
  }
  const pad = ' '.repeat(indent)
  const innerPad = ' '.repeat(indent + 2)
  const lines: string[] = []
  // Phase 3 — a bare `*` / `(.*)` route is the whole-route catch-all; its
  // component becomes the `else ->` branch, not a `currentPath == "*"` case.
  const wildcardRoute = routes.find(isWildcardRoute)
  const wildcardComponent =
    wildcardRoute !== undefined ? resolveRouteTarget(wildcardRoute, routes)?.component : undefined
  // Phase 3 — guard-fail fallback (catch-all component if present, else a
  // denial Text) + a helper that wraps a guarded route's render in an
  // `if (<guard>) … else …` expression. Checked at navigation time, so the
  // guarded view never renders for a failing guard.
  const denyFallback =
    wildcardComponent !== undefined
      ? `${emitKotlinExpr(wildcardComponent, indent + 4)}()`
      : `Text(text = "Pyreon Router: access denied to \${currentPath}")`
  const guardWrap = (r: import('./types').RouteIR, renderCall: string): string =>
    r.guard === undefined
      ? renderCall
      : `if (${emitKotlinExpr(r.guard, indent + 4)}) ${renderCall} else ${denyFallback}`
  // Phase 3 — wrap a loader-bearing route's render in a `PyreonRouteLoader`
  // host whose `LaunchedEffect` fires the loader once on enter-composition
  // and stores the result via `router.setLoaderData(currentPath, …)`. The
  // key is `currentPath` (the active path) — matching `useLoaderData()`'s
  // `router.loaderData.value[router.currentPath]` read for BOTH literal and
  // `:param` routes. Applied INSIDE the guard wrap (a guarded route only
  // loads when its guard passes).
  const loaderWrap = (r: import('./types').RouteIR, renderCall: string): string => {
    if (r.loader === undefined) return renderCall
    const loadBody = emitKotlinExpr(r.loader, indent + 4)
    return `PyreonRouteLoader(path = currentPath, load = { ${loadBody} }) { ${renderCall} }`
  }
  lines.push(`${pad}val currentPath = router.currentPath`)
  lines.push(`${pad}when {`)
  for (const route of routes) {
    // Wildcard routes don't get a path branch — handled as the else-branch.
    if (isWildcardRoute(route)) continue
    // Phase 3 — resolve redirects to the route carrying a component.
    // Dangling / cyclic redirects resolve to undefined → skip the branch
    // (the `else` fallback handles the path as no-match).
    const target = resolveRouteTarget(route, routes)
    if (target === undefined || target.component === undefined) continue
    if (isRedirectRoute(route)) {
      // Compile-time alias: `currentPath == "/old" -> TargetComponent()`.
      // v1 supports literal source AND literal target only.
      if (route.path.includes(':') || target.path.includes(':')) continue
      lines.push(
        `${innerPad}currentPath == ${JSON.stringify(route.path)} -> ${emitKotlinExpr(target.component, indent + 4)}()`,
      )
      continue
    }
    const componentExpr = emitKotlinExpr(target.component, indent + 4)
    const isPattern = route.path.includes(':')
    if (isPattern) {
      // Param-bearing route: matchPath returns Map<String, String> or null.
      // Use `null != PyreonRouter.matchPath(...)` as the condition, then
      // re-call inside the body to capture params (the matchPath helper
      // is pure + cheap; double-call is fine. Alternative: `also` block
      // pattern would be DRYer but kotlinc-stub-incompatible.)
      //
      // When the target component declares a typed `params` prop, the
      // synthesized data class is constructed from the dict — a raw-Map
      // pass where `UserPageParam` is expected is a kotlinc type error
      // (the bug that kept native-router-demo-android red).
      const inv = kotlinRouteParamsInvocation(target.component, indent + 4)
      lines.push(
        `${innerPad}PyreonRouter.matchPath(currentPath, ${JSON.stringify(route.path)}) != null -> {`,
      )
      // Bind `params` when the COMPONENT uses it OR the route's `loader`
      // reads `ctx.params.*` (lowered to `params["…"]`) — the loader body
      // emits inside this branch, so `params` must be in scope.
      if (inv.usesParams || route.loaderUsesParams === true) {
        lines.push(
          `${innerPad}  val params = PyreonRouter.matchPath(currentPath, ${JSON.stringify(route.path)}) ?: emptyMap()`,
        )
      }
      lines.push(`${innerPad}  ${guardWrap(route, loaderWrap(route, inv.call))}`)
      lines.push(`${innerPad}}`)
    } else {
      // Literal route — direct == comparison.
      lines.push(
        `${innerPad}currentPath == ${JSON.stringify(route.path)} -> ${guardWrap(route, loaderWrap(route, `${componentExpr}()`))}`,
      )
    }
  }
  // R1.2 fallback — symmetric to Swift's else-branch. Phase 3: a bare
  // `*` / `(.*)` route supplies the fallback component (the canonical 404
  // page); without one, the dev-visible 404 Text.
  const fallback =
    wildcardComponent !== undefined
      ? `${emitKotlinExpr(wildcardComponent, indent + 4)}()`
      : `Text(text = "Pyreon Router: no route for \${currentPath}")`
  lines.push(`${innerPad}else -> ${fallback}`)
  lines.push(`${pad}}`)
  return lines.join('\n')
}

/**
 * Per-field coercion from matchPath's `Map<String, String>` to the
 * component's typed `params` field. Mirror of emit-swift's
 * `swiftParamFieldExpr` — route params are path segments (strings on
 * the wire); number/boolean fields coerce with safe defaults.
 */
function kotlinParamFieldExpr(f: { name: string; type: TypeIR }): string {
  const read = `params[${JSON.stringify(f.name)}] ?: ""`
  if (f.type.kind === 'number') return `(${read}).toIntOrNull() ?: 0`
  if (f.type.kind === 'boolean') return `(${read}) == "true"`
  return read
}

/**
 * Build the invocation for a param-bearing route's target component.
 * Mirror of emit-swift's `swiftRouteParamsInvocation` — see its doc
 * comment for the three shapes.
 */
function kotlinRouteParamsInvocation(
  component: ExprIR,
  indent: number,
): { call: string; usesParams: boolean } {
  const expr = emitKotlinExpr(component, indent)
  if (component.kind === 'identifier') {
    const info = _componentParamsInfoKotlin.get(component.name)
    if (info === undefined && _componentNames.has(component.name)) {
      return { call: `${expr}()`, usesParams: false }
    }
    if (info !== undefined && info !== 'opaque') {
      const args = info.fields
        .map((f) => `${kotlinIdent(f.name)} = ${kotlinParamFieldExpr(f)}`)
        .join(', ')
      return { call: `${expr}(params = ${info.typeName}(${args}))`, usesParams: true }
    }
  }
  return { call: `${expr}(params = params)`, usesParams: true }
}

/**
 * Invoke a component, supplying an EMPTY content lambda when it's a layout
 * (layouts take a required `content: @Composable () -> Unit`, so bare
 * `Layout()` won't compile). A layout rendered as its own index shows its
 * chrome with an empty child slot.
 */
function emitKotlinLayoutAwareInvocation(component: ExprIR, indent: number): string {
  const expr = emitKotlinExpr(component, indent)
  if (component.kind === 'identifier' && _layoutComponentNames.has(component.name)) {
    return `${expr} {}`
  }
  return `${expr}()`
}

/**
 * Phase 3 (nested routes) — dispatch over a FLATTENED tree. Each leaf renders
 * `Outer { Inner { Leaf() } }` (the layout chain wrapping the leaf via the
 * `content` lambda each layout was emitted with). Mirror of
 * emitSwiftNestedNavigationDestination.
 */
function emitKotlinNestedRouteDispatch(
  routes: import('./types').RouteIR[],
  indent: number,
): string {
  const pad = ' '.repeat(indent)
  const innerPad = ' '.repeat(indent + 2)
  const entries: FlatRouteEntry[] = flattenRouteTree(routes)
  const wildcardRoute = routes.find(isWildcardRoute)
  const wildcardComponent =
    wildcardRoute !== undefined ? resolveRouteTarget(wildcardRoute, routes)?.component : undefined
  const denyFallback =
    wildcardComponent !== undefined
      ? `${emitKotlinExpr(wildcardComponent, indent + 4)}()`
      : `Text(text = "Pyreon Router: access denied to \${currentPath}")`
  // Wrap a leaf call in its layout chain: [Outer, Inner] + "Leaf()" →
  // "Outer { Inner { Leaf() } }".
  const wrap = (chain: ExprIR[], leafCall: string): string => {
    let acc = leafCall
    for (let i = chain.length - 1; i >= 0; i--) {
      acc = `${emitKotlinExpr(chain[i]!, indent + 4)} { ${acc} }`
    }
    return acc
  }
  const guardWrap = (guard: ExprIR | undefined, renderCall: string): string =>
    guard === undefined
      ? renderCall
      : `if (${emitKotlinExpr(guard, indent + 4)}) ${renderCall} else ${denyFallback}`
  const lines: string[] = []
  lines.push(`${pad}val currentPath = router.currentPath`)
  lines.push(`${pad}when {`)
  for (const entry of entries) {
    const isLeafLayout =
      entry.component.kind === 'identifier' && _layoutComponentNames.has(entry.component.name)
    if (entry.isPattern) {
      // Same typed-`params` construction contract as the flat dispatch.
      const inv = isLeafLayout
        ? {
            call: emitKotlinLayoutAwareInvocation(entry.component, indent + 4),
            usesParams: false,
          }
        : kotlinRouteParamsInvocation(entry.component, indent + 4)
      lines.push(
        `${innerPad}PyreonRouter.matchPath(currentPath, ${JSON.stringify(entry.path)}) != null -> {`,
      )
      if (inv.usesParams) {
        lines.push(
          `${innerPad}  val params = PyreonRouter.matchPath(currentPath, ${JSON.stringify(entry.path)}) ?: emptyMap()`,
        )
      }
      lines.push(`${innerPad}  ${guardWrap(entry.guard, wrap(entry.layoutChain, inv.call))}`)
      lines.push(`${innerPad}}`)
    } else {
      const render = wrap(
        entry.layoutChain,
        emitKotlinLayoutAwareInvocation(entry.component, indent + 4),
      )
      lines.push(
        `${innerPad}currentPath == ${JSON.stringify(entry.path)} -> ${guardWrap(entry.guard, render)}`,
      )
    }
  }
  const fallback =
    wildcardComponent !== undefined
      ? `${emitKotlinExpr(wildcardComponent, indent + 4)}()`
      : `Text(text = "Pyreon Router: no route for \${currentPath}")`
  lines.push(`${innerPad}else -> ${fallback}`)
  lines.push(`${pad}}`)
  return lines.join('\n')
}

/**
 * Emit `<RouterView />` as the runtime-kotlin `RouterView()`.
 */
function emitKotlinRouterView(
  _e: Extract<ExprIR, { kind: 'jsx-element' }>,
  _indent: number,
): string {
  // Phase 3 — inside a layout component's body, `<RouterView />` is the child
  // slot: it invokes the `content` composable lambda.
  if (_emittingLayoutComponentKotlin) {
    return `content()`
  }
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

/**
 * Mirror of emit-swift's `swiftExprProducesView` — see its doc comment.
 * On Kotlin the unwrapped bug is WORSE than Swift's type error: a bare
 * String expression statement in a Composable lambda COMPILES and
 * silently renders nothing.
 */
function kotlinExprProducesView(e: ExprIR): boolean {
  if (e.kind === 'jsx-element') return true
  if (e.kind === 'ternary') {
    return kotlinExprProducesView(e.then) || kotlinExprProducesView(e.otherwise)
  }
  if (e.kind === 'logical') return kotlinExprProducesView(e.right)
  // See through parens so `{cond && (a ? <X/> : <Y/>)}` is recognised
  // as view-producing (and lowered to `if (cond) { … }`) rather than
  // stringified into a Text interpolation.
  if (e.kind === 'paren') return kotlinExprProducesView(e.inner)
  return false
}

function emitKotlinChild(c: ChildIR, indent: number): string {
  if (c.kind === 'text') return `Text(text = ${JSON.stringify(c.value)})`
  if (!kotlinExprProducesView(c.expr)) {
    // Value expression child of a container — wrap in Text string-
    // interpolation, the same shape `<Text>{expr}</Text>` emits.
    return `Text(text = "\${${emitKotlinExpr(c.expr, indent)}}")`
  }
  // `{cond && <View/>}` — the dominant React/Solid conditional-render
  // idiom. A raw `cond && View` is `Boolean && Unit`, which won't compile
  // in a Compose `@Composable` block, so lower it to the SAME
  // `if (cond) { view }` form `<Show>` emits. The RHS recurses through
  // `emitKotlinChild` so a nested `a && b && <X/>` lowers correctly.
  if (c.expr.kind === 'logical' && c.expr.op === '&&' && kotlinExprProducesView(c.expr.right)) {
    const cond = emitKotlinExpr(c.expr.left, indent)
    const pad = ' '.repeat(indent + 2)
    const inner = emitKotlinChild({ kind: 'expr', expr: c.expr.right }, indent + 2)
    return `if (${cond}) {\n${pad}${inner}\n${' '.repeat(indent)}}`
  }
  return emitKotlinExpr(c.expr, indent)
}

/**
 * Mirror of emit-swift's `unwrapAccessorArrow` — see its doc comment.
 * A zero-param arrow in a CONDITION position is the web accessor form;
 * the native condition takes its body.
 */
function unwrapAccessorArrow(e: ExprIR): ExprIR {
  return e.kind === 'arrow' && e.params.length === 0 ? e.body : e
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

/**
 * Lower a `kind: 'rx-call'` ExprIR to Kotlin. Dispatches on `method` to
 * produce idiomatic Kotlin code on `List<T>`. Mirrors emitSwiftRxCall
 * in shape; the per-method lowerings are documented in
 * docs/src/content/docs/multiplatform-libraries.md (Strategy A table).
 *
 * Predicate / mapper / reducer args are inlined as Kotlin lambdas
 * (`{ t -> body }`); count args inline as Kotlin Int literals.
 */
function emitKotlinRxCall(
  e: { method: string; source: ExprIR; args: ExprIR[] },
  indent: number,
): string {
  const src = emitKotlinExpr(e.source, indent)
  const arg = (i: number): string =>
    e.args[i] === undefined ? '' : emitKotlinExpr(e.args[i] as ExprIR, indent)
  switch (e.method) {
    // Transforms — name-matched on Kotlin Collection<T> for the v1 set.
    case 'filter':
      return `${src}.filter(${arg(0)})`
    case 'map':
      return `${src}.map(${arg(0)})`
    case 'reverse':
      return `${src}.reversed()`
    case 'compact':
      // Kotlin's filterNotNull() is the idiomatic equivalent of JS rx.compact.
      return `${src}.filterNotNull()`
    case 'flatten':
      return `${src}.flatten()`
    case 'unique':
      // Kotlin's distinct() is insertion-order-preserving — strictly
      // better than Swift's Array(Set(...)). Matches rx.unique semantics.
      return `${src}.distinct()`
    case 'take':
      return `${src}.take(${arg(0)})`
    case 'skip':
      return `${src}.drop(${arg(0)})`
    case 'takeWhile':
      return `${src}.takeWhile(${arg(0)})`
    case 'dropWhile':
      return `${src}.dropWhile(${arg(0)})`
    // Scalar accessors — Kotlin's first/last throw on empty; we use
    // the *OrNull variants to match Swift's Optional<T> semantics.
    case 'first':
      return `${src}.firstOrNull()`
    case 'last':
      return `${src}.lastOrNull()`
    case 'find':
      return `${src}.find(${arg(0)})`
    case 'some':
      return `${src}.any(${arg(0)})`
    case 'every':
      return `${src}.all(${arg(0)})`
    // Aggregations — count/size, sum is direct, min/max use OrNull
    // matching Swift Optional.
    case 'count':
      // `.size` is a property on List<T> (O(1) on RandomAccess lists).
      return `${src}.size`
    case 'sum':
      // Iterable<Int>.sum() / Iterable<Double>.sum() are stdlib
      // extension functions. For non-numeric T the user should use
      // reduce; this lowering assumes the consumer passes a numeric
      // source signal (matches rx.sum's type signature on the web).
      return `${src}.sum()`
    case 'min':
      return `${src}.minOrNull()`
    case 'max':
      return `${src}.maxOrNull()`
    case 'reduce':
      // rx.reduce(s, reducer, initial) ≈ Kotlin fold(initial, reducer).
      // Same arg-flip as Swift (JS order: reducer-then-initial).
      return `${src}.fold(${arg(1)}, ${arg(0)})`
    case 'average': {
      // Kotlin's Iterable<Number>.average() returns Double directly +
      // returns NaN for empty (not 0). Match rx.average's "0 for empty"
      // semantic explicitly via an empty-check lambda.
      return `(${src}.let { if (it.isEmpty()) 0.0 else it.sum().toDouble() / it.size })`
    }
    default:
      return `/* unsupported rx.${e.method} */ ${src}`
  }
}
