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
import {
  buildComponentConstMap,
  chainHasOptional,
  isCompoundExpr,
  substituteIdentifier,
  synthLiteralStructName,
  classifyDynamicStylingAttr,
  exprHasOptionalLink,
} from './expr-utils'
import {
  buildArraySpreadConcat,
  buildInferenceCtx,
  arrayFromMapRewrite,
  classifyNegativeSlice,
  classifyOptionalCondition,
  indexedArrayCallback,
  inferReturnType,
  inferType,
  objectLengthRangeForm,
  optionalMemberTernary,
  rewriteObjectKeys,
  rewriteObjectValues,
  seedHandlerLocals,
  typeContainsFunction,
  typeIsOptional,
  unwrapOptionalType,
  synthesizeWebSocketAutoConnect,
  widenFloatLocals,
  widenFloatSignals,
} from './infer-type'
import { clampExpr } from './pure-state'
import { permissionsProviderSeed } from './permissions-provider'
import type { InferenceCtx } from './infer-type'
import { kotlinIdent, safeIdent } from './identifier-safety'
import { resolveRocketstyleUseSite } from './rocketstyle-native'
import type { AttrsComponentIR } from './attrs-native'
import { elementToStack } from './elements-native'
import { coolgridToStack, colToStack, colHasExplicitSize, colSizeLiteral } from './coolgrid-native'
import { extractTextTypography, kotlinTextTypographyArgs, styleToNativeModifiers } from './style-to-native'
import {
  type FlatRouteEntry,
  flattenRouteTree,
  hasNestedRoutes,
  isRedirectRoute,
  isWildcardRoute,
  resolveRouteTarget,
} from './route-ir-helpers'
import { unloweredLayoutPropWarning } from './unlowered-layout-props'
import type {
  AttrIR,
  ChildIR,
  ComponentIR,
  RocketstyleComponentIR,
  StyledComponentIR,
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
/**
 * Synthesized data classes for ANONYMOUS all-scalar-literal object
 * EXPRESSIONS (`{ id: 1, name: 'a' }`). Mirror of emit-swift's
 * `_synthExprStructs` — same shared `synthLiteralStructName` helper so the
 * `__Obj0`/`__Obj1`/… names line up across targets. Reset per emitKotlin run.
 */
let _synthExprStructs: StructIR[] = []
let _synthExprStructKeys: Map<string, string> = new Map()

// The active component's inference ctx, exposed to `emitKotlinExpr`'s
// object-literal case (which doesn't receive it as a param) so a
// non-literal field (`{ id: count() }`) can have its type inferred for
// data-class synthesis. Set per `emitKotlinComponent`; empty otherwise.
let _kotlinExprInferCtx: ReturnType<typeof buildInferenceCtx> = buildInferenceCtx([])
// websocket decl name → url. `ws.connect()` (the 0-arg TS surface — the web
// hook auto-connects) lowers to the OkHttp transport extension shipped in
// `@pyreon/native-runtime-kotlin` (`fun PyreonWebSocket.connect(url: String)`),
// threading the registered url. Mirror of emit-swift's `_websocketUrlsSwift`.
let _websocketUrlsKotlin: Map<string, string> = new Map()
/** Mirror of emit-swift's `_componentNames`. See that file for rationale. */
let _componentNames: Set<string> = new Set()
// `styled(Prim)`-wrapped components — a `<X>` use-site is rewritten to `<Prim>`
// + the captured style injected as a synthetic `style` attr (see emitKotlinJsx).
let _styledComponents: Map<string, StyledComponentIR> = new Map()
// `rocketstyle()({component})…` components — resolved per use-site (see emitKotlinJsx).
let _rocketstyleComponents: Map<string, RocketstyleComponentIR> = new Map()
let _attrsComponents: Map<string, AttrsComponentIR> = new Map()
// Alias-tag local name → its import package. The Element/PyreonUI/Container/
// Row/Col hooks intercept a tag ONLY when it resolves from its expected
// @pyreon package, so a same-named user component isn't mis-lowered.
let _aliasImports: Map<string, string> = new Map()

/**
 * True when `tag` is eligible for an alias hook (Element/PyreonUI/Container/
 * Row/Col → native): it must NOT be shadowed by a same-named user / styled /
 * rocketstyle / attrs component, AND — when its import source is tracked — it
 * must resolve from `expectedPkg`. An untracked name keeps prior behaviour, so
 * this only SUPPRESSES a tag imported from another package.
 */
function canAliasIntercept(tag: string, expectedPkg: string): boolean {
  if (
    _componentNames.has(tag) ||
    _styledComponents.has(tag) ||
    _rocketstyleComponents.has(tag) ||
    _attrsComponents.has(tag)
  )
    return false
  const src = _aliasImports.get(tag)
  return src === undefined || src === expectedPkg
}
/** Component name → declared props, for `<Comp {...src} />` spread expansion.
 * Mirror of emit-swift's `_componentPropsMap`. */
let _componentPropsMapKotlin: Map<string, { name: string; type: TypeIR }[]> = new Map()
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
 * The onSubmit param name currently in scope — mirror of
 * `_formSubmitParamsSwift`. `PyreonForm`'s onSubmit receives a
 * `Map<String, String>`, so a field read on the param must lower to a map
 * lookup exactly as `form.values().username` already does. See the Swift
 * twin for the full rationale (the bug hid behind an unused `_values` param
 * in every gated app).
 */
let _formSubmitParamsKotlin: string[] = []
/**
 * Phase 4: every `useOnline()` decl name in scope. A `net.isOnline` read emits
 * with a trailing `.value` (Compose `MutableState`); Swift exposes it as a
 * plain @Observable property, so it needs no rewrite.
 */
let _netStatusNames: Set<string> = new Set()
/** Per-component: `useAppState()` decl names — drives `state()` → `.phase.value`
 *  and `state.phase` → `.phase.value` (the Compose MutableState read). */
let _appStateNames: Set<string> = new Set()
/** Per-component: `useCrashReporter()` decl names — drives the `.value`
 *  member-read rewrite for `crash.lastCrash`/`crash.hadCrash` (Compose
 *  MutableState). */
let _crashNames: Set<string> = new Set()
/**
 * Phase 5: native data/services hook decl names → per-hook MutableState
 * field-read rewrite (append `.value`). Each maps a binding name to the
 * container's reactive fields; non-listed members (Bool getters + methods)
 * read bare. Swift exposes everything as @Observable, so it needs no rewrite.
 * Field sets are kept next to the read-rewrite in emitKotlinExpr.
 */
let _geoNames: Set<string> = new Set()
let _wsNames: Set<string> = new Set()

/**
 * Is `obj.prop` a Phase-5 native-container reactive field backed by a Compose
 * `MutableState` (read `.value`)? Shared by the member-read emit (`ws.error`)
 * AND the CALL-read emit (`ws.lastMessage()` — the web signal-read idiom: the
 * TS call reads the value; on Kotlin the field is a PROPERTY, so the call's
 * parens must be dropped, not turned into `.value()` which invokes the value).
 */
function isContainerMutableStateField(obj: string, p: string): boolean {
  return (
    (_geoNames.has(obj) &&
      ['latitude', 'longitude', 'accuracy', 'isAuthorized', 'error'].includes(p)) ||
    (_wsNames.has(obj) && ['lastMessage', 'messages', 'isConnected', 'error'].includes(p)) ||
    (_pushNames.has(obj) &&
      ['token', 'lastNotification', 'notifications', 'isAuthorized', 'error'].includes(p)) ||
    (_payNames.has(obj) && ['products', 'ownedProductIds', 'purchasing', 'error'].includes(p)) ||
    (_mapNames.has(obj) && ['camera', 'markers', 'selectedMarkerId'].includes(p)) ||
    (_authNames.has(obj) && ['status', 'user', 'error'].includes(p)) ||
    (_crashNames.has(obj) && ['lastCrash', 'hadCrash'].includes(p))
  )
}
let _pushNames: Set<string> = new Set()
let _payNames: Set<string> = new Set()
let _mapNames: Set<string> = new Set()
let _authNames: Set<string> = new Set()
/** G2: every function decl name (Parser-A). Mirrors emit-swift's set. */
let _functionNames: Set<string> = new Set()
/** Bindings from `useUrlState` — callable, but NOT signals (see the `.set` guard). */
let _urlStateNames: Set<string> = new Set()
/** File-scope helper-function names (persists across the whole emit) — seeded
 * into each component's `_functionNames` so a `dbl(21)` call resolves as a
 * free-function call regardless of which component emits it. */
let _helperFnNames: Set<string> = new Set()
/** File-scope helper name → return type (parity with the Swift path; Kotlin's
 * `derivedStateOf` mostly self-infers, but a helper call in a typed position
 * still benefits). */
let _helperReturns: Map<string, TypeIR> = new Map()
/**
 * Mirror of emit-swift's `_zeroArgFnNames` — see its doc comment. Kotlin is
 * the LOUD half of that bug: a bare zero-arg fn reference in a Text
 * interpolation is a hard `function invocation 'shout()' expected`, while the
 * same source only WARNS on swiftc. One shared source built on iOS and failed
 * to build on Android.
 */
let _zeroArgFnNames: Set<string> = new Set()
/** File-scope half of `_zeroArgFnNames`, re-seeded per component. */
let _zeroArgHelperNames: Set<string> = new Set()
/**
 * Per-component: every machine decl name (DeclIR.machine — Gap 4
 * PR-2). PyreonMachine has `operator fun invoke()` so `m()` reads
 * current state. Without this set, the call-emit drops parens for
 * unknown zero-arg identifiers (same code path as signal reads),
 * which would emit `m` (a PyreonMachine reference) instead of `m()`
 * (the current state String).
 */
let _machineNames: Set<string> = new Set()
/** `syncedSignal(...)` bindings — read `x()` (Kotlin `invoke`), write `x.set(v)`
 *  (a real method). Both the read paren-drop AND the `.set()`→`=` rewrite skip
 *  them (they are PyreonSyncedSignal facade objects, not bare state values). */
let _syncedSignalNames: Set<string> = new Set()
/** `createTableState(...)` bindings — property reads drop parens; methods flow through. */
let _tableNames: Set<string> = new Set()
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

/**
 * M4.5: set by `emitKotlinAction` when it emits an `async () => { … }` handler
 * (which wraps its body in `pyreonAsyncScope.launch { … }`). Read back by
 * `emitKotlinComponent` AFTER the JSX is emitted to hoist a single
 * `val pyreonAsyncScope = rememberCoroutineScope()` at the composable top.
 */
let _hasAsyncHandler = false
const PYREON_ASYNC_SCOPE = 'pyreonAsyncScope'

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
/** Per-COMPONENT const-string map — mirror of emit-swift's
 * `_componentConstMap`. Set per `emitKotlinComponent`; consulted by
 * `readStaticAttrKotlin` after the module-level map. */
let _componentConstMapKotlin: Map<string, string | number | boolean> = new Map()

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
  helperFns: Extract<DeclIR, { kind: 'function' }>[] = [],
  styledComponents: StyledComponentIR[] = [],
  rocketstyleComponents: RocketstyleComponentIR[] = [],
  attrsComponents: AttrsComponentIR[] = [],
  aliasImports: Map<string, string> = new Map(),
): { code: string; warnings: string[] } {
  _emitWarnings = []
  _styledComponents = new Map(styledComponents.map((s) => [s.name, s]))
  _rocketstyleComponents = new Map(rocketstyleComponents.map((r) => [r.name, r]))
  _attrsComponents = new Map(attrsComponents.map((a) => [a.name, a]))
  _aliasImports = aliasImports
  // File-scope pure-logic helper names — seeded into every component's
  // per-component `_functionNames` reset so a `dbl(21)` call resolves as a
  // free-function call in ANY component.
  _helperFnNames = new Set(helperFns.map((h) => h.name))
  _helperReturns = new Map(helperFns.map((h) => [h.name, h.returnType]))
  _zeroArgHelperNames = new Set(helperFns.filter((h) => h.params.length === 0).map((h) => h.name))
  _constStringMapKotlin = new Map()
  _kotlinStoreDefs = stores
  // Declared structs for per-component inference (typed object-array
  // element fields — `todos().map(t => t.id)` resolves `t.id` to Int).
  _kotlinStructDefs = structs
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
  _synthExprStructs = []
  _synthExprStructKeys = new Map()
  for (const s of structs) {
    const key = s.fields.map((f) => f.name).sort().join(',')
    if (!_structFieldsToName.has(key)) _structFieldsToName.set(key, s.name)
  }
  // Build the user-component name set — mirror of emit-swift's logic.
  _componentNames = new Set(components.map((c) => c.name))
  _componentPropsMapKotlin = new Map(components.map((c) => [c.name, c.props]))
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
  _pureStateKotlin = new Map()
  _bluetoothKotlin = new Set()
  _pureStateInitialKotlin = new Map()
  _clipboardKotlin = new Set()
  for (const c of components) {
    for (const d of c.decls ?? []) {
      if (d.kind === 'bluetooth') _bluetoothKotlin.add(d.name)
      if (d.kind === 'wake-lock') _wakeLockKotlin.add(d.name)
      if (d.kind === 'device-info') _deviceInfoKotlin.add(d.name)
      if (d.kind === 'safe-area') _safeAreaKotlin.add(d.name)
      if (d.kind === 'screen-orientation') _orientationKotlin.add(d.name)
      if (d.kind === 'clipboard') _clipboardKotlin.add(d.name)
      if (d.kind === 'pure-state') {
        _pureStateKotlin.set(d.name, d.bounds ? { hook: d.hook, bounds: d.bounds } : { hook: d.hook })
        _pureStateInitialKotlin.set(d.name, d.initial)
      }
    }
  }
  // Mirror of the Swift registries: state fields + views are READ (a state
  // field is a signal on web, so the read is a call); actions are CALLED.
  _modelReadNamesKotlin = new Map(
    models.map((m) => [
      m.instanceName,
      new Set([...m.fields.map((f) => f.name), ...(m.views ?? []).map((v) => v.name)]),
    ]),
  )
  _modelMethodNamesKotlin = new Map(
    models.map((m) => [m.instanceName, new Set((m.methods ?? []).map((mm) => mm.name))]),
  )
  // Gap 3 PR-3.2 — reset Suspense-wrapper flag per transform run.
  // Gap 3 PR-3.3 — reset ErrorBoundary-wrapper flag per transform.
  // Gap 3 PR-3.4 — reset KeepAlive-wrapper flag.
  _needsKotlinKeepAliveWrapper = false
  for (const e of enums) parts.push(emitKotlinEnum(e))
  for (const s of structs) parts.push(emitKotlinStruct(s))
  for (const md of moduleDecls) parts.push(emitKotlinModuleDecl(md))
  // Gap 4 v1: emit per-store singleton class.
  for (const s of stores) parts.push(emitKotlinStore(s))
  // Shape A: emit top-level pure-logic HELPER functions at file scope (free
  // `fun`s), AFTER stores + BEFORE components so both store methods and
  // component bodies can call them. Reuses the same `emitKotlinFunction` store
  // methods use; any anonymous-object data classes the body synthesizes are
  // flushed to module scope (mirroring the component path).
  for (const h of helperFns) {
    const helperCtx: KotlinCtx = {
      synthesizedDataClasses: [],
      componentName: 'PyreonHelpers',
    }
    parts.push(emitKotlinFunction(h, helperCtx))
    for (const synth of helperCtx.synthesizedDataClasses) {
      parts.push(emitKotlinStruct({ name: synth.name, fields: synth.fields }))
    }
  }
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
  // Emit the PyreonUrlState helper once, if any component binds a search param.
  if (components.some((c) => c.decls?.some((d) => d.kind === 'url-state'))) {
    parts.push(KOTLIN_URL_STATE)
  }
  if (
    _usesPermissionsEnvKotlin ||
    components.some((c) => c.decls?.some((d) => d.kind === 'permissions' && d.grants.length === 0))
  ) {
    parts.push(KOTLIN_PERMISSIONS_ENV)
  }
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
  // Emit synthesized anonymous-object data classes (collected during
  // component emit) at module scope — Kotlin allows top-level forward refs.
  for (const s of _synthExprStructs) parts.push(emitKotlinStruct(s))
  // Gap 3 PR-3.2/3.3/3.4 — prepend wrapper composables if needed.
  if (_needsKotlinKeepAliveWrapper) parts.push(KOTLIN_KEEP_ALIVE_WRAPPER)
  for (const cp of componentParts) parts.push(cp)
  _enumNames = new Set()
  _structFieldsToName = new Map()
  _synthExprStructs = []
  _synthExprStructKeys = new Map()
  _componentNames = new Set()
  _styledComponents = new Map()
  _rocketstyleComponents = new Map()
  _attrsComponents = new Map()
  _aliasImports = new Map()
  _componentParamsInfoKotlin = new Map()
  _layoutComponentNames = new Set()
  _storeHooksKotlin = new Map()
  _storeMethodNamesKotlin = new Map()
  _modelInstancesKotlin = new Map()
  _clipboardKotlin = new Set()
  _modelReadNamesKotlin = new Map()
  _modelMethodNamesKotlin = new Map()
  _usesPermissionsEnvKotlin = false
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
/** `useToggle`/`useCounter` bindings — their members rewrite at use sites. */
let _pureStateKotlin: Map<string, { hook: 'useToggle' | 'useCounter'; bounds?: { min?: number; max?: number } }> = new Map()
/** `useBluetooth()` bindings — its reactive reads become `.value`. */
let _bluetoothKotlin: Set<string> = new Set()
/** `useWakeLock()` bindings — `active` is MutableState, `supported` plain. */
let _wakeLockKotlin: Set<string> = new Set()
/** `useDeviceInfo()` bindings — all reads are plain getters (no `.value`). */
let _deviceInfoKotlin: Set<string> = new Set()
/** `useSafeArea()` bindings — the sole accessor becomes `.insets`. */
let _safeAreaKotlin: Set<string> = new Set()
/** `useScreenOrientation()` bindings — reads are properties. */
let _orientationKotlin: Set<string> = new Set()
/** Initial values, so `reset()` restores exactly what the web's does. */
let _pureStateInitialKotlin: Map<string, number | boolean> = new Map()
/** `useClipboard()` bindings — its reactive reads become `.value`. */
let _clipboardKotlin: Set<string> = new Set()
/** Mirror of the Swift flag — set while emitting a model view/action body. */
let _activeModelSelfParamKotlin: string | undefined
/** Per-instance model STATE-FIELD + VIEW names — reads drop their parens. */
let _modelReadNamesKotlin: Map<string, Set<string>> = new Map()
/** Per-instance model ACTION names — calls keep their parens + args. */
let _modelMethodNamesKotlin: Map<string, Set<string>> = new Map()
/** Set when a `<PermissionsProvider>` emits — the file needs the local. */
let _usesPermissionsEnvKotlin = false

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
    lines.push(`    var ${f.name} by mutableStateOf(${emitKotlinExpr(f.initial, 4)})`)
  }
  // Views + actions on the object — mirror of emitSwiftModel; see
  // emitKotlinStore for the module-state swap rationale. `selfParam`
  // rides the props-param rewrite so `self.count()` in a factory body
  // resolves to the object's own `count`.
  const hasMembers = (m.views?.length ?? 0) > 0 || (m.methods?.length ?? 0) > 0
  if (hasMembers) {
    const prevSignals = _signalNames
    const prevFunctions = _functionNames
    const prevPropsParam = _activePropsParamName
    const prevModelSelf = _activeModelSelfParamKotlin
    _signalNames = new Set([
      ...m.fields.map((f) => f.name),
      ...(m.views ?? []).map((v) => v.name),
    ])
    _functionNames = new Set((m.methods ?? []).map((mm) => mm.name))
    const memberCtx: KotlinCtx = {
      synthesizedDataClasses: [],
      componentName: `PyreonModel_${m.modelId}`,
    }
    for (const v of m.views ?? []) {
      _activePropsParamName = v.selfParam
      _activeModelSelfParamKotlin = v.selfParam
      lines.push(`    val ${kotlinIdent(v.name)} get() = ${emitKotlinExpr(v.expr, 4)}`)
      _signalNames.add(v.name)
    }
    for (const mm of m.methods ?? []) {
      _activePropsParamName = mm.selfParam
      _activeModelSelfParamKotlin = mm.selfParam
      lines.push(`    ${emitKotlinFunction(mm, memberCtx)}`)
    }
    _signalNames = prevSignals
    _functionNames = prevFunctions
    _activePropsParamName = prevPropsParam
    _activeModelSelfParamKotlin = prevModelSelf
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
      // `URI(...)` PARSES; it does not validate. It accepts "not a url",
      // "x.com" and "/relative", all of which zod rejects. Requiring a
      // scheme reproduces zod's rule (an absolute URL) while still
      // accepting "mailto:a@b.co" and "ftp://x.com" as zod does.
      lines.push(
        `${ind}${guard}if ((try { java.net.URI(${targetName}${nullableTarget ? '!!' : ''}).scheme } catch (_: Throwable) { null }) == null) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "url${ruleSuffix}")`,
      )
    }
    if (c.regex) {
      const guard = nullableTarget ? `if (${targetName} != null) ` : ''
      // `containsMatchIn`, not `matches` — `RegExp.test()` is a PARTIAL
      // match on the web, and an anchored pattern still anchors.
      const opts = c.regex.ignoreCase ? ', RegexOption.IGNORE_CASE' : ''
      const pattern = JSON.stringify(c.regex.source)
      lines.push(
        `${ind}${guard}if (!Regex(${pattern}${opts}).containsMatchIn(${targetName}${nullableTarget ? '!!' : ''})) throw PyreonSchemaError.ConstraintViolation(${JSON.stringify(fieldName)}, "regex${ruleSuffix}")`,
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

/**
 * The Kotlin mirror of `SWIFT_URL_STATE`. Emitted inline for the same reason:
 * it needs the ACTIVE router, which `useRouter()` supplies from the Compose
 * local, so a standalone runtime would have to depend on PyreonRouter and stop
 * being self-contained.
 *
 * `operator fun invoke()` is the Kotlin spelling of Swift's
 * `callAsFunction`, so `q()` reads and `q.set(v)` writes on BOTH targets and
 * shared source does not fork.
 */
const KOTLIN_PERMISSIONS_ENV = `// CompositionLocal for <PermissionsProvider> — mirror of the Swift env key,
// emitted inline for the same reason (a co-located runtime should not need
// Compose's CompositionLocal machinery). An unprovided local is an EMPTY set
// — a deny, the safe default for an authorization check.
private val LocalPyreonPermissions = compositionLocalOf { PyreonPermissions() }`

const KOTLIN_URL_STATE = `class PyreonUrlState(
    private val router: PyreonRouter,
    private val key: String,
    private val defaultValue: String,
) {
    operator fun invoke(): String = router.query.value[key] ?: defaultValue
    fun set(value: String) { router.setQueryParam(key, value) }
    fun clear() { router.setQueryParam(key, null) }
}`

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
  // Optional field (`label?: string` → union-with-undefined) gets an
  // explicit `= null` default so a literal that skips the field compiles
  // (`P(qty = 3)`) — and kotlinx.serialization decodes a missing JSON key
  // to the default for defaulted properties. Mirrors emit-swift's
  // `var label: String? = nil`.
  const params = s.fields
    .map((f) => {
      const suffix = typeIsOptional(f.type) ? ' = null' : ''
      return `var ${kotlinIdent(f.name)}: ${kotlinType(f.type, undefined, f.name)}${suffix}`
    })
    .join(', ')
  // A FUNCTION-typed property can't be @Serializable — the kotlinx
  // serialization plugin hard-errors on the REAL Compose build
  // ("Serializer has not been found for type '() -> Unit'"); the kotlinc
  // validate stubs MASK it (no plugin runs there), so this was a
  // device-gate-only failure. Emit the plain data class instead.
  // Function-free structs keep @Serializable byte-identically.
  const ser = s.fields.some((f) => typeContainsFunction(f.type)) ? '' : '@Serializable\n'
  return `${ser}data class ${kotlinIdent(s.name)}(${params})`
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
  /**
   * Type-inference context for the active component (signals / computeds /
   * fetches / locals / stores). Used by `emitKotlinFunction` to INFER a
   * block-body helper's return type when the TS source didn't declare one:
   * Kotlin does NOT infer return types for block bodies, so a value-
   * returning `fun f() { … return x }` emitted without a `: T` clause is a
   * kotlinc error (`Unit` expected). Concise `= expr` bodies still infer
   * natively and are left un-annotated.
   */
  inferCtx?: InferenceCtx
}

// Module-scoped state for the active component's props-param-name —
// same pattern as emit-swift.ts. Set at the start of each component
// emit so the `member` case can rewrite `props.title` → `title`.
// Reset to undefined after each component.
let _activePropsParamName: string | undefined

// Module-scoped store definitions for the active module emit — mirrors
// emit-swift's `_storeDefs`. Feeds `buildInferenceCtx` so a block-body
// helper returning a `useX().store.field()` read can have its return type
// inferred. Set once at the top of the emit entrypoint.
let _kotlinStoreDefs: StoreDefnIR[] = []
// Declared module structs — mirrors emit-swift's `_structDefs`. Feeds
// `buildInferenceCtx` so member access on a typed object-array element
// (`t.id` where `t: Todo`) resolves the field type instead of degrading
// to `Any`. Set once at the top of the emit entrypoint.
let _kotlinStructDefs: StructIR[] = []

function emitKotlinComponent(c: ComponentIR): string {
  // Component-scope const literals → static-attr resolution (mirror of Swift).
  _componentConstMapKotlin = buildComponentConstMap(c.decls)
  _activePropsParamName = c.propsParamName
  // Build the per-component signal-name → enum-type-name map for use
  // at `.set()` call sites — mirrors Swift emit. Note: the type field
  // is read BEFORE emitKotlinDecl runs so the decl emit can see the
  // enum context.
  _signalEnumTypes = new Map()
  _signalNames = new Set()
  // Seed with file-scope helper names so a `dbl(21)` call in this component
  // resolves as a free function.
  _functionNames = new Set(_helperFnNames)
  _zeroArgFnNames = new Set(_zeroArgHelperNames)
  _machineNames = new Set()
  _syncedSignalNames = new Set()
  _tableNames = new Set()
  _i18nNamesKotlin = new Set()
  _fetchNames = new Set()
  _formNames = new Set()
  _formSubmitParamsKotlin = []
  _netStatusNames = new Set()
  _appStateNames = new Set()
  _crashNames = new Set()
  _geoNames = new Set()
  _wsNames = new Set()
  _pushNames = new Set()
  _payNames = new Set()
  _mapNames = new Set()
  _authNames = new Set()
  // M4.5: fresh per component — set by emitKotlinAction if an async handler emits.
  _hasAsyncHandler = false
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
    if (d.kind === 'function') {
      _functionNames.add(d.name)
      if (d.params.length === 0) _zeroArgFnNames.add(d.name)
    }
    // Gap 4 PR-2: PyreonMachine. Keep `m` OUT of _signalNames (so
    // `m()` keeps parens for `operator fun invoke()`) AND OUT of
    // _functionNames (it's a property, not a free fn).
    if (d.kind === 'machine') _machineNames.add(d.name)
    if (d.kind === 'synced-signal') _syncedSignalNames.add(d.name)
    if (d.kind === 'table-state') _tableNames.add(d.name)
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
    // `q` is CALLABLE (`operator fun invoke`), so a reference must keep its
    // parens — the Swift mirror adds it for the same reason.
    if (d.kind === 'url-state') {
      _functionNames.add(d.name)
      _urlStateNames.add(d.name)
    }
    // Phase 4: track useFetch AND useQuery decls so member reads append
    // `.value`. PyreonQuery shares data/error/isPending (+ adds isFetching)
    // with PyreonFetch and behaves identically under Suspense/ErrorBoundary
    // and the destructure alias, so both live in the async-container set.
    if (d.kind === 'fetch' || d.kind === 'query') _fetchNames.add(d.name)
    // Phase 4.2: track useForm decls so reactive-field reads append `.value`.
    if (d.kind === 'form') _formNames.add(d.name)
    if (d.kind === 'network-status') _netStatusNames.add(d.name)
    if (d.kind === 'app-state') _appStateNames.add(d.name)
    if (d.kind === 'crash-reporter') _crashNames.add(d.name)
    // Phase 5: native data/services hook decl names (for the .value rewrite).
    if (d.kind === 'geolocation') _geoNames.add(d.name)
    if (d.kind === 'websocket') _wsNames.add(d.name)
    if (d.kind === 'push') _pushNames.add(d.name)
    if (d.kind === 'payments') _payNames.add(d.name)
    if (d.kind === 'map') _mapNames.add(d.name)
    if (d.kind === 'auth') _authNames.add(d.name)
  }
  // Write-site float widening — mirror of the Swift emitter's call; see
  // infer-type.ts:widenFloatSignals. Idempotent (safe if Swift ran first).
  widenFloatSignals(c, _kotlinStoreDefs, _kotlinStructDefs)
  // Synthesize the implicit auto-connect-on-mount for useWebSocket(url)
  // decls with no explicit .connect() — reuses the on-mount harness +
  // connect url-threading. Mutates c.decls (idempotent).
  synthesizeWebSocketAutoConnect(c)
  const inferCtx = buildInferenceCtx(
    c.decls,
    _kotlinStoreDefs,
    _kotlinStructDefs,
    c.props,
    c.propsParamName,
    _helperReturns,
  )
  const ctx: KotlinCtx = {
    synthesizedDataClasses: [],
    componentName: c.name,
    inferCtx,
  }
  // Expose the component's inference ctx to the object-literal emit so a
  // non-literal field (`{ id: count() }`) gets its data-class field type
  // inferred (mirrors the Swift `_exprInferCtx`).
  _websocketUrlsKotlin = new Map(
    c.decls
      .filter((d) => d.kind === 'websocket')
      .map((d) => [(d as { name: string }).name, (d as { url: string }).url] as const),
  )
  // Mirror of the Swift emitter's call — see infer-type.ts:widenFloatLocals.
  for (const d of c.decls) {
    if (d.kind === 'function') widenFloatLocals(d.body, inferCtx)
  }
  _kotlinExprInferCtx = inferCtx
  // Pass 1: walk decls — emits decl bodies AND discovers synthesized
  // types from decl annotations. The actual decl text is buffered into
  // `declTexts` so it can be emitted later inside the function body
  // (after the signature line).
  // on-mount decls emit at the harness level (LaunchedEffect(Unit), below).
  _databaseNames = new Set()
  _fieldArrayNamesKotlin = new Set()
  _fieldArrayItemParamsKotlin = []
  const declTexts = c.decls
    .filter((d) => d.kind !== 'on-mount' && d.kind !== 'tick')
    .map((d) => emitKotlinDecl(d, ctx))
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
  // Optional props (`label?: string` → union-with-undefined) get an
  // explicit `= null` default so call sites can omit them — mirrors the
  // Swift emit's `var label: String? = nil` memberwise default.
  const propsParts = c.props.map((p) =>
    typeIsOptional(p.type)
      ? `${kotlinIdent(p.name)}: ${kotlinType(p.type, ctx, p.name)} = null`
      : `${kotlinIdent(p.name)}: ${kotlinType(p.type, ctx, p.name)}`,
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
  // Form onSubmit is assigned AFTER the decl, never passed as a constructor
  // argument — the mirror of what Swift does from `.onAppear`, and for the
  // same reason. The most common authoring shape references the form ITSELF
  // ("clear the field after submit":
  // `onSubmit: (values) => form.setFieldValue('x', '')`), and inside
  // `remember { PyreonForm(onSubmit = { … form … }) }` that body is a
  // self-reference in the form's own initializer, which Kotlin rejects
  // ("unresolved reference 'form'"). So the idiom did not compile on Android
  // at all while working on iOS — a "one source, three targets" break the
  // auth-rehydration arc found and recorded rather than fixed.
  for (const d of c.decls) {
    if (d.kind !== 'form' || d.onSubmit === undefined) continue
    const name = kotlinIdent(d.name)
    _formSubmitParamsKotlin.push(d.onSubmit.param)
    let bodyLines: string
    try {
      bodyLines = d.onSubmit.body
        .map((st) => `    ${emitKotlinStatement(st, 4, ctx)}`)
        .join('\n')
    } finally {
      _formSubmitParamsKotlin.pop()
    }
    lines.push(`  ${name}.onSubmit = { ${kotlinIdent(d.onSubmit.param)} ->`)
    lines.push(bodyLines)
    lines.push(`  }`)
  }
  // Phase 4: a `LaunchedEffect(Unit)` per useFetch decl runs the fetch on
  // first composition (Compose's async-on-mount hook), driving the
  // PyreonFetch state machine begin → resolve|reject. The suspendable HTTP
  // runs off the main thread; decode goes through kotlinx-serialization.
  // onMount bodies → LaunchedEffect(Unit) (Compose's run-once-on-mount
  // hook — keyed by the stable Unit, not cancelled by recomposition).
  // Mirror of the Swift .task: LaunchedEffect(Unit) is cancelled when the
  // composable leaves composition, which IS the web hooks' onUnmount.
  for (const d of c.decls) {
    if (d.kind !== 'tick') continue
    const savedTick = seedHandlerLocals(d.body, _kotlinExprInferCtx)
    const body = d.body.map((st) => `      ${emitKotlinStatement(st, 6, ctx)}`).join('\n')
    _kotlinExprInferCtx.locals = savedTick
    lines.push(`  LaunchedEffect(Unit) {`)
    if (d.mode === 'interval') {
      lines.push(`    while (true) {`)
      lines.push(`      delay(${d.delayMs}L)`)
      lines.push(body)
      lines.push(`    }`)
    } else {
      lines.push(`    delay(${d.delayMs}L)`)
      lines.push(body)
    }
    lines.push(`  }`)
  }
  // LaunchedEffect(key) cancels the previous when the key changes — the
  // Compose mirror of .task(id:), and the same restarting trailing edge.
  for (const d of c.decls) {
    if (d.kind !== 'debounced-value') continue
    const src = emitKotlinExpr(d.source, 4)
    lines.push(`  LaunchedEffect(${src}) {`)
    lines.push(`    delay(${d.delayMs}L)`)
    lines.push(`    ${kotlinIdent(d.name)} = ${src}`)
    lines.push(`  }`)
  }
  for (const d of c.decls) {
    if (d.kind !== 'on-mount') continue
    const saved = seedHandlerLocals(d.body, _kotlinExprInferCtx)
    const bodyLines = d.body.map((st) => `    ${emitKotlinStatement(st, 4, ctx)}`).join('\n')
    _kotlinExprInferCtx.locals = saved
    lines.push(`  LaunchedEffect(Unit) {`)
    lines.push(bodyLines)
    lines.push(`  }`)
  }
  for (const d of c.decls) {
    if (d.kind !== 'fetch') continue
    const name = kotlinIdent(d.name)
    lines.push(`  LaunchedEffect(Unit) {`)
    lines.push(`    ${name}.begin()`)
    lines.push(`    try {`)
    if (d.method || d.headers || d.body) {
      // Mirrors the Swift branch one-for-one: a request carrying a VERB,
      // headers, or a body goes through PyreonHttp — the runtime that shipped
      // on both targets with full verb support and nothing lowering to it.
      // `readText()` below cannot express any of the three.
      const parts = [
        `method = PyreonHttpMethod.${(d.method ?? 'GET').toUpperCase()}`,
        `url = ${JSON.stringify(d.url)}`,
      ]
      if (d.headers) {
        const pairs = Object.entries(d.headers)
          .map(([k, v]) => `${JSON.stringify(k)} to ${JSON.stringify(v)}`)
          .join(', ')
        parts.push(`headers = mapOf(${pairs})`)
      }
      if (d.body !== undefined) parts.push(`body = ${JSON.stringify(d.body)}`)
      lines.push(`      val __response = withContext(Dispatchers.IO) {`)
      lines.push(`        PyreonHttp.send(PyreonHttpRequest(${parts.join(', ')}))`)
      lines.push(`      }`)
      // A non-2xx REJECTS rather than decoding — handing an error page to the
      // JSON decoder reads as "the server sent bad JSON" and hides the status.
      lines.push(`      if (!__response.isOk) throw PyreonHttpError.BadStatus(__response.status)`)
      lines.push(
        `      ${name}.resolve(PyreonFetchJson.decodeFromString<${kotlinType(d.type, ctx)}>(__response.body))`,
      )
    } else {
      lines.push(
        `      val body = withContext(Dispatchers.IO) { java.net.URL(${JSON.stringify(d.url)}).readText() }`,
      )
      lines.push(`      ${name}.resolve(PyreonFetchJson.decodeFromString<${kotlinType(d.type, ctx)}>(body))`)
    }
    lines.push(`    } catch (e: Throwable) { ${name}.reject(e) }`)
    lines.push(`  }`)
  }
  // useQuery: a `LaunchedEffect(Unit)` per decl, guarded on `isStale` so a
  // FRESH cache hit skips the network entirely (serving the hydrated value).
  // The stale/miss path drives the same begin → resolve|reject machine as
  // useFetch — a background refresh of already-cached data flips only
  // isFetching, never isPending, so the UI never blanks.
  for (const d of c.decls) {
    if (d.kind !== 'query') continue
    const name = kotlinIdent(d.name)
    lines.push(`  LaunchedEffect(Unit) {`)
    lines.push(`    if (${name}.isStale) {`)
    lines.push(`      ${name}.begin()`)
    lines.push(`      try {`)
    if (d.method || d.headers || d.body) {
      // Mirrors the Swift PyreonHttp branch: a request with a VERB, headers, or
      // a body goes through PyreonHttp (readText() can express none of them).
      const parts = [
        `method = PyreonHttpMethod.${(d.method ?? 'GET').toUpperCase()}`,
        `url = ${JSON.stringify(d.url)}`,
      ]
      if (d.headers) {
        const pairs = Object.entries(d.headers)
          .map(([k, v]) => `${JSON.stringify(k)} to ${JSON.stringify(v)}`)
          .join(', ')
        parts.push(`headers = mapOf(${pairs})`)
      }
      if (d.body !== undefined) parts.push(`body = ${JSON.stringify(d.body)}`)
      lines.push(`        val __response = withContext(Dispatchers.IO) {`)
      lines.push(`          PyreonHttp.send(PyreonHttpRequest(${parts.join(', ')}))`)
      lines.push(`        }`)
      lines.push(`        if (!__response.isOk) throw PyreonHttpError.BadStatus(__response.status)`)
      lines.push(
        `        ${name}.resolve(PyreonFetchJson.decodeFromString<${kotlinType(d.type, ctx)}>(__response.body))`,
      )
    } else {
      lines.push(
        `        val body = withContext(Dispatchers.IO) { java.net.URL(${JSON.stringify(d.url)}).readText() }`,
      )
      lines.push(
        `        ${name}.resolve(PyreonFetchJson.decodeFromString<${kotlinType(d.type, ctx)}>(body))`,
      )
    }
    lines.push(`      } catch (e: Throwable) { ${name}.reject(e) }`)
    lines.push(`    }`)
    lines.push(`  }`)
  }
  // While emitting a layout's body, its `<RouterView />` emits `content()`.
  _emittingLayoutComponentKotlin = isLayout
  // M4.5: capture the composable-top insertion point (after decls + the
  // LaunchedEffect harness, before the JSX). If the JSX below emits an async
  // handler, one `rememberCoroutineScope()` val is spliced in here.
  const asyncScopeInsertIndex = lines.length
  // A component that returns `null` / `undefined` renders NOTHING — a @Composable
  // returns Unit, so emit an empty body rather than a stray `null` expression
  // statement (valid-but-pointless in Kotlin; the Swift sibling `nil` was a hard
  // error — see emit-swift.ts:emitSwiftReturnExpr).
  if (!(c.returnExpr.kind === 'literal' && c.returnExpr.value == null)) {
    lines.push(`  ${emitKotlinExpr(c.returnExpr, 2)}`)
  }
  _emittingLayoutComponentKotlin = false
  // M4.5: an `async () => { await … }` handler emitted
  // `pyreonAsyncScope.launch { … }`; hoist its coroutine scope to the composable
  // top (rememberCoroutineScope() must run at composable scope, not in a lambda).
  if (_hasAsyncHandler) {
    lines.splice(
      asyncScopeInsertIndex,
      0,
      `  val ${PYREON_ASYNC_SCOPE} = rememberCoroutineScope()`,
    )
  }
  lines.push(`}`)
  _activePropsParamName = undefined
  _signalNames = new Set()
  _functionNames = new Set()
  _urlStateNames = new Set()
  _machineNames = new Set()
  _syncedSignalNames = new Set()
  _tableNames = new Set()
  _i18nNamesKotlin = new Set()
  _fetchNames = new Set()
  _formNames = new Set()
  _formSubmitParamsKotlin = []
  _netStatusNames = new Set()
  _appStateNames = new Set()
  _crashNames = new Set()
  _geoNames = new Set()
  _wsNames = new Set()
  _pushNames = new Set()
  _payNames = new Set()
  _mapNames = new Set()
  _authNames = new Set()
  _routerRoutes = new Map()
  return lines.join('\n')
}

function emitKotlinDataClass(synth: {
  name: string
  fields: { name: string; type: TypeIR }[]
}): string {
  const params = synth.fields
    .map((f) => `val ${f.name}: ${kotlinType(f.type)}${typeIsOptional(f.type) ? ' = null' : ''}`)
    .join(', ')
  // `@Serializable` for consistency with emitKotlinStruct (named `type X
  // = {...}` structs always carry it). Without it, a synthesized class
  // reachable from a fetch decode (`useFetch<{ name: string }[]>(url)`
  // → `Json.decodeFromString<List<AppData>>`) compiles against the
  // kotlinc validate stubs but FAILS a real Compose build ("Serializer
  // for class 'AppData' not found" — the serialization plugin only
  // generates serializers for annotated classes).
  const ser = synth.fields.some((f) => typeContainsFunction(f.type))
    ? ''
    : '@Serializable\n'
  return `${ser}data class ${synth.name}(${params})`
}

/**
 * Per-component: `useDatabase()` binding names.
 *
 * Needed so `db.insert(collection, { id, fields })` can lower its object
 * literal to a `PyreonRecord` rather than the generic anonymous-object path.
 * Mirrors `_databaseNames` in emit-swift.ts.
 */
let _databaseNames: Set<string> = new Set()
// Field-array accessor unwrap — mirror of _fieldArrayNamesSwift: web signal
// CALLS (`tags.items()`, `item.value()`) are PROPERTIES on the Kotlin
// PyreonFieldArray, so the call emit strips the parens. Item params are a
// stack (nested Fors restore correctly).
let _fieldArrayNamesKotlin: Set<string> = new Set()
let _fieldArrayItemParamsKotlin: string[] = []

/** A PyreonCell expression for a table column, chosen by the field's type. */
function kotlinTableCell(fieldType: TypeIR | undefined, expr: string): string {
  if (fieldType?.kind === 'string') return `PyreonCell.Str(${expr})`
  if (fieldType?.kind === 'number') return `PyreonCell.Num((${expr}).toDouble())`
  return `PyreonCell.Str("${'$'}{${expr}}")`
}

/** The row struct's Kotlin type name — a named typeRef, or the synthesized
 *  struct whose fields match an inline object (matching what the data list
 *  actually holds, e.g. `__Obj0`). */
function resolveKotlinRowTypeName(elem: TypeIR): string {
  if (elem.kind === 'typeRef') return elem.name
  if (elem.kind === 'object') {
    const names = new Set(elem.fields.map((f) => f.name))
    const match = [..._synthExprStructs, ..._kotlinStructDefs].find(
      (st) => st.fields.length === names.size && st.fields.every((f) => names.has(f.name)),
    )
    if (match) return match.name
  }
  return 'Any'
}

/** The row struct's fields, whether inline-object or a named struct. */
function resolveKotlinStructFields(elem: TypeIR): { name: string; type: TypeIR }[] {
  if (elem.kind === 'object') return elem.fields
  if (elem.kind === 'typeRef') {
    const s =
      _kotlinStructDefs.find((st) => st.name === elem.name) ??
      _synthExprStructs.find((st) => st.name === elem.name)
    if (s) return s.fields
  }
  return []
}

/** Kotlin literal for a synced signal's initial scalar value (`number` → Double). */
function syncedInitialKotlin(
  scalar: 'string' | 'double' | 'bool',
  value: string | number | boolean,
): string {
  if (scalar === 'string') return JSON.stringify(String(value))
  if (scalar === 'bool') return value ? 'true' : 'false'
  // A Double literal so `PyreonSyncedSignal<Double>` is inferred (JS number).
  return Number.isInteger(value as number) ? `${value}.0` : String(value)
}

function emitKotlinDecl(d: DeclIR, ctx: KotlinCtx): string {
  // on-mount emits at the harness level (LaunchedEffect) — defensive narrow.
  if (d.kind === 'on-mount' || d.kind === 'tick') return ''
  if (d.kind === 'debounced-value') {
    return `var ${kotlinIdent(d.name)} by remember { mutableStateOf(${emitKotlinExpr(d.source, 2)}) }`
  }
  if (d.kind === 'rate-limited') {
    const cls = d.mode === 'debounce' ? 'PyreonDebounced' : 'PyreonThrottled'
    const p0 = d.fn.params[0]
    const argType = p0 === undefined ? 'Unit' : kotlinType(p0.type)
    const argName = p0 === undefined ? '_' : kotlinIdent(p0.name)
    const body = d.fn.body.map((st) => emitKotlinStatement(st, 4, ctx)).join('; ')
    return `val ${kotlinIdent(d.name)} = remember { ${cls}<${argType}>(${d.delayMs}, PyreonTaskScheduler()) { ${argName} -> ${body} } }`
  }
  // Phase 5b: a plain value const → a composable-body `val` (captures-once).
  if (d.kind === 'value') {
    return `val ${kotlinIdent(d.name)} = ${emitKotlinExpr(d.expr, 0)}`
  }
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
    // A `null` initial needs an EXPLICIT nullable type param. `mutableStateOf(null)`
    // alone infers `MutableState<Nothing?>`, which poisons every downstream
    // read — `p?.field` in a `derivedStateOf` then fails with "cannot infer
    // type for T". The declared type (`signal<Box | null>`) already resolves
    // to a nullable `Box?` via `kotlinType`/`kotlinUnionType`; force the `?`
    // so even a defensive non-nullable declaration stays sound. (Swift needs
    // no equivalent — it already emits `@State var x: Box? = nil`.)
    if (d.initial.kind === 'literal' && d.initial.value === null) {
      const nullableType = typeStr.endsWith('?') ? typeStr : `${typeStr}?`
      return `var ${kotlinIdent(d.name)} by ${wrapperFn} { mutableStateOf<${nullableType}>(null) }`
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
  // `const q = useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` → a
  // remembered PyreonQuery<T> seeded with the cache key + staleMillis. The
  // LaunchedEffect harness (isStale-guarded) is emitted by emitKotlinComponent.
  if (d.kind === 'query') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonQuery<${kotlinType(d.type, ctx)}>(queryKey = ${JSON.stringify(d.queryKey)}, staleMillis = ${d.staleMillis}L) }`
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
    // onSubmit is deliberately NOT a constructor arg here — it is assigned
    // post-decl in the composable body (see the emit loop after declTexts).
    // Keeping both paths would let a self-referencing handler take the
    // constructor route and fail to compile again.
    return `val ${kotlinIdent(d.name)} = remember { PyreonForm(${parts.join(', ')}) }`
  }
  // Phase 4: `const net = useOnline()` → a remembered PyreonNetworkStatus.
  if (d.kind === 'network-status') {
    // rememberPyreonNetworkStatus SELF-INSTALLS a real
    // ConnectivityManager.NetworkCallback and tears it down on leave. Before
    // it, `PyreonNetworkStatus()` was a pure container defaulting to `true`
    // with a `start(register)` seam the app was expected to wire — so
    // `useOnline()` on Android reported online forever regardless of the
    // device, and a device test that turned the radios off waited for a flip
    // that could never arrive. Same shape as the geolocation registry: a
    // default that requires a step nobody takes is not a default.
    return `val ${kotlinIdent(d.name)} = rememberPyreonNetworkStatus()`
  }
  // Phase 5 (M3.7): `const state = useAppState()` → a remembered PyreonAppState.
  if (d.kind === 'app-state') {
    // rememberPyreonAppState SELF-INSTALLS a LifecycleEventObserver on the
    // hosting Activity for the composable's lifetime (a bare
    // `remember { PyreonAppState() }` was the never-wired class — the
    // container reported its initial "active" forever).
    return `val ${kotlinIdent(d.name)} = rememberPyreonAppState()`
  }
  // `const crash = useCrashReporter()` → a remembered PyreonCrashReporter.
  // rememberPyreonCrashReporter SELF-INSTALLS a file-backed backend + calls
  // start() (the never-wired-class fix — a report that vanishes on relaunch
  // is worse than none). Reads `crash.lastCrash`/`crash.hadCrash` append
  // `.value` (see isContainerMutableStateField); methods read bare.
  if (d.kind === 'crash-reporter') {
    return `val ${kotlinIdent(d.name)} = rememberPyreonCrashReporter()`
  }
  // Phase 5: native data/services hooks → remembered container. Reactive
  // FIELD reads append `.value` (see emitKotlinExpr); methods + Bool getters
  // read bare. Lifecycle auto-start is a documented follow-up.
  if (d.kind === 'geolocation') {
    // rememberPyreonGeolocation SELF-INSTALLS the platform LocationManager
    // source (guarded — an app-chosen registry source wins), mirroring
    // rememberPyreonStorage. The prior bare `remember { PyreonGeolocation() }`
    // compiled green while `geo.start()` errored on every real device
    // (nothing ever installed AndroidLocationSource).
    return `val ${kotlinIdent(d.name)} = rememberPyreonGeolocation()`
  }
  if (d.kind === 'websocket') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonWebSocket() }`
  }
  if (d.kind === 'database') {
    _databaseNames.add(d.name)
    // `PyreonDatabase(context)` — NOT the bare `PyreonDatabase()` this emitted
    // until 2026-07. The bare form resolved to the in-memory backend, so a
    // `useDatabase()` app lost every record on relaunch, silently. Android
    // needs a Context to find app-private storage, so the Context is threaded
    // here exactly as `useNativeModule` does. (Swift needs no equivalent:
    // Foundation resolves Application Support unaided, so `PyreonDatabase()`
    // persists there on its own.)
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonDatabase(${id}Ctx) }`,
    ].join('\n  ')
  }
  if (d.kind === 'secureStorage') {
    // `PyreonSecureStorage(context)` — the KeystoreSecureBackend factory
    // (AndroidKeyStore AES-GCM over app-private storage). Context threaded
    // exactly as `useDatabase` does; a bare constructor deliberately does
    // not exist (a secret store must never silently fall back to memory).
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonSecureStorage(${id}Ctx) }`,
    ].join('\n  ')
  }
  if (d.kind === 'fieldArray') {
    _fieldArrayNamesKotlin.add(d.name)
    const init = d.initial.length === 0 ? '' : `listOf(${d.initial.map((v) => JSON.stringify(v)).join(', ')})`
    return `val ${kotlinIdent(d.name)} = remember { PyreonFieldArray(${init}) }`
  }
  if (d.kind === 'push') {
    // rememberPyreonPushNotifications SELF-INSTALLS the PYREON_PUSH_ACTION
    // BroadcastReceiver delivery seam for the composable's lifetime (a bare
    // `remember { PyreonPushNotifications() }` was the never-wired class —
    // the container rendered its initial state forever). FCM transport
    // remains app-wired (credentials); it forwards into the same container.
    return `val ${kotlinIdent(d.name)} = rememberPyreonPushNotifications()`
  }
  if (d.kind === 'payments') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonPayments() }`
  }
  if (d.kind === 'map') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonMapState() }`
  }
  if (d.kind === 'auth') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonAuth<${kotlinType(d.userType, ctx)}>() }`
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
  // Mirror of the Swift pure-state emit: a plain mutableStateOf field, with
  // the mutators rewritten at their use sites.
  // Mirror of the Swift bluetooth emit.
  if (d.kind === 'bluetooth') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonBluetooth(AndroidBluetoothScanner(${id}Ctx)) }`,
    ].join('\n  ')
  }
  // Mirror of Swift: the keeper is injected so the state machine is
  // testable with no Android SDK; the app supplies the real one.
  if (d.kind === 'wake-lock') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonWakeLock(AndroidScreenKeeper(${id}Ctx)) }`,
    ].join('\n  ')
  }
  // Mirror of Swift: the probe is injected so the shape is testable with no
  // Android SDK; the app supplies the real one.
  if (d.kind === 'device-info') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonDeviceInfo(AndroidDeviceProbe(${id}Ctx)) }`,
    ].join('\n  ')
  }
  if (d.kind === 'safe-area') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonSafeArea(AndroidSafeAreaProbe(${id}Ctx)) }`,
    ].join('\n  ')
  }
  if (d.kind === 'screen-orientation') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonScreenOrientation(AndroidOrientationProbe(${id}Ctx)) }`,
    ].join('\n  ')
  }
  if (d.kind === 'pure-state') {
    return `var ${kotlinIdent(d.name)} by remember { mutableStateOf(${String(d.initial)}) }`
  }
  if (d.kind === 'permissions') {
    // Mirror of Swift: a BARE `usePermissions()` reads the provider's
    // CompositionLocal rather than constructing an empty set that denies.
    if (d.grants.length === 0) {
      return `val ${kotlinIdent(d.name)} = LocalPyreonPermissions.current`
    }
    const seed = `setOf(${d.grants.map((g) => JSON.stringify(g)).join(', ')})`
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
  // M3.1: `const h = useHaptics()` → a remembered PyreonHaptics. The
  // Compose haptic surface is `LocalHapticFeedback` (a composition-
  // local — NO permission, NO Context, unlike Vibrator). Local reads
  // can't live inside `remember { … }`'s non-Composable lambda, so
  // hoist it to a sibling val and inject it (same shape clipboard uses
  // for LocalContext). Methods (`h.impact("light")`) flow through
  // unchanged — PyreonHaptics maps the style string internally.
  if (d.kind === 'haptics') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Haptic = LocalHapticFeedback.current`,
      `val ${id} = remember { PyreonHaptics(${id}Haptic) }`,
    ].join('\n  ')
  }
  // FFI: `const bt = useNativeModule<T>('Bluetooth')` → a remembered
  // instance of the APP's own class. A Context is hoisted and injected
  // unconditionally (the same shape clipboard/share/linking use): nearly
  // every Android platform capability needs one, a module that doesn't
  // can ignore the parameter, and a single fixed constructor signature
  // keeps the contract predictable. `remember` keeps the instance stable
  // across recomposition; back it with `mutableStateOf` for reactive state.
  if (d.kind === 'native-module') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { ${d.moduleName}(${id}Ctx) }`,
    ].join('\n  ')
  }
  // M3.2: `const share = useShare()` → a remembered PyreonShare. Android
  // sharing goes through `context.startActivity(Intent.createChooser(…))`,
  // so it needs a Context — hoisted from `LocalContext.current` into a
  // sibling val (can't live in the non-Composable `remember` lambda) and
  // injected, the same shape clipboard uses. Methods (`share.text("hi")`)
  // flow through unchanged.
  if (d.kind === 'linking') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonLinking(${id}Ctx) }`,
    ].join('\n  ')
  }
  // M3.3: `const notifs = useNotifications()` → a remembered
  // PyreonNotifications. Android NotificationManager needs a Context —
  // hoisted from LocalContext (like share). Methods flow through unchanged.
  if (d.kind === 'notifications') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonNotifications(${id}Ctx) }`,
    ].join('\n  ')
  }
  // M3.5: `const bio = useBiometrics()` → a remembered PyreonBiometrics. Its
  // `authenticate(reason)` is a suspend fun, awaited inside a
  // `pyreonAsyncScope.launch { … }` (the M4.5 async-handler wrap). The v1 Kotlin
  // runtime needs no Context (the full FragmentActivity-backed BiometricPrompt
  // wiring is a follow-up); a bare remembered instance suffices to compile.
  if (d.kind === 'biometrics') {
    return `val ${kotlinIdent(d.name)} = remember { PyreonBiometrics() }`
  }
  // M3.4: `const picker = useImagePicker()` → a remembered PyreonImagePicker
  // PLUS a composable-scope ActivityResult launcher wired into it.
  //
  // Why the launcher can't live inside the runtime container (the iOS/Android
  // asymmetry): Android delivers a picked asset through the ActivityResult
  // callback, and registering for it requires an ActivityResultCaller at
  // COMPOSITION time — `rememberLauncherForActivityResult` is a @Composable, so
  // it MUST be called here at composable scope, not from inside `remember {}`
  // (registering post-RESUMED throws). The container therefore exposes a
  // settable `launcher` and bridges callback→suspend internally, so `pick()`
  // keeps the same `suspend fun (): String?` shape as Swift's `async`.
  //
  // The assignment re-runs on recomposition, which is harmless:
  // rememberLauncherForActivityResult returns the SAME instance across
  // recompositions, so this re-assigns an identical reference.
  if (d.kind === 'image-picker') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id} = remember { PyreonImagePicker() }`,
      `${id}.launcher = rememberLauncherForActivityResult(`,
      `    ActivityResultContracts.PickVisualMedia()`,
      `  ) { uri -> ${id}.onResult(uri?.toString()) }`,
    ].join('\n  ')
  }
  // M3.8: `const files = useFilePicker()` → a remembered PyreonFilePicker PLUS a
  // composable-scope ActivityResult launcher over the SAF `OpenDocument`
  // contract (input `Array<String>` of MIME types → `Uri?`). Same
  // composition-time-registration rule as the image picker
  // (rememberLauncherForActivityResult is a @Composable), so the launcher is
  // wired HERE, not from inside `remember {}`; the container bridges
  // callback→suspend so `pick()` keeps the Swift `async` shape. The `pick()`
  // runtime chooses the MIME filter (`arrayOf("*/*")`), so the emit is
  // contract-registration only.
  if (d.kind === 'file-picker') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id} = remember { PyreonFilePicker() }`,
      `${id}.launcher = rememberLauncherForActivityResult(`,
      `    ActivityResultContracts.OpenDocument()`,
      `  ) { uri -> ${id}.onResult(uri?.toString()) }`,
    ].join('\n  ')
  }
  if (d.kind === 'share') {
    const id = kotlinIdent(d.name)
    return [
      `val ${id}Ctx = LocalContext.current`,
      `val ${id} = remember { PyreonShare(${id}Ctx) }`,
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
  // `@pyreon/sync` — `remember { }` blocks run sequentially in composition, so
  // (unlike Swift's @State) the doc and its signals can reference each other
  // directly; no synthesized init needed. `title()` / `title.set(v)` flow
  // through unchanged (the facade defines `invoke` / `set`).
  if (d.kind === 'crdt-doc') {
    const actor =
      d.actorLiteral !== undefined
        ? JSON.stringify(d.actorLiteral)
        : 'java.util.UUID.randomUUID().toString()'
    return `val ${kotlinIdent(d.name)} = remember { PyreonCrdtDoc(${actor}) }`
  }
  if (d.kind === 'synced-signal') {
    const initial = syncedInitialKotlin(d.scalarType, d.initialValue)
    const mapArg = d.map !== undefined ? `, ${JSON.stringify(d.map)}` : ''
    return `val ${kotlinIdent(d.name)} = remember { PyreonSyncedSignal(${kotlinIdent(d.docBinding)}, ${JSON.stringify(d.key)}, ${initial}${mapArg}) }`
  }
  // `@pyreon/table` — Compose's sequential `remember` lets the data lambda
  // reference the row signal directly (no @State cross-ref like Swift), so it's
  // passed in the constructor. Reading it inside `rows()` during composition
  // tracks the signal → a row change recomposes.
  if (d.kind === 'table-state') {
    const dt = inferType(d.dataBody, _kotlinExprInferCtx)
    const elem: TypeIR = dt.kind === 'array' ? dt.element : { kind: 'unknown' }
    const rowType = resolveKotlinRowTypeName(elem)
    const fields = resolveKotlinStructFields(elem)
    const cols = d.columns
      .map((c) => {
        const f = fields.find((x) => x.name === c.id)
        return `PyreonTableColumn(${JSON.stringify(c.id)}) { ${kotlinTableCell(f?.type, `it.${kotlinIdent(c.id)}`)} }`
      })
      .join(', ')
    const pageArg = d.pageSize > 0 ? `, ${d.pageSize}` : ''
    return `val ${kotlinIdent(d.name)} = remember { PyreonTableState<${rowType}>({ ${emitKotlinExpr(d.dataBody, 2)} }, listOf(${cols})${pageArg}) }`
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
  // M2.2: `const sizeClass = useSizeClass()` →
  // `val ${name} = if (LocalConfiguration.current.screenWidthDp >= 600) "regular" else "compact"`.
  // `LocalConfiguration` (androidx.compose.ui.platform, conditional-imported
  // in cli/build.ts like LocalContext) recomposes on configuration change
  // (rotation / split-screen), so the read is reactive — no runtime port
  // needed. 600dp is the standard expanded-width breakpoint, matching the
  // web hook's `(min-width: 600px)`. Returns the same `"compact" | "regular"`
  // string shape Swift + web emit.
  if (d.kind === 'size-class') {
    return `val ${kotlinIdent(d.name)} = if (LocalConfiguration.current.screenWidthDp >= 600) "regular" else "compact"`
  }
  // C4: router hook — `const navigate = useNavigate()` → as-is.
  // Compose's `useNavigate()` is a `@Composable` function that reads
  // `LocalPyreonRouter.current` directly via CompositionLocal — no
  // explicit router arg needed (unlike Swift). `useParams()` follows
  // the same shape.
  if (d.kind === 'url-state') {
    return `val ${kotlinIdent(d.name)} = PyreonUrlState(useRouter(), ${JSON.stringify(d.key)}, ${JSON.stringify(d.defaultValue)})`
  }
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
    // Seed this computed body's LOCAL `const`/`let` types so a later
    // type-dependent emit resolves them — `const found = todos.find(…); return
    // found ? … : …` lowers the ternary condition to `found != null`. The
    // computed-body emit is the third statement-body path (after handler /
    // function-decl decls). Restored after. Mirror of the Swift side.
    const savedLocals = seedHandlerLocals(d.body, _kotlinExprInferCtx)
    const bodyLines = d.body
      .map((s) => `      ${emitKotlinStatement(s, 6, bodyCtx)}`)
      .join('\n')
    _kotlinExprInferCtx.locals = savedLocals
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
  // Multi-statement block body. Unlike the concise `= expr` form (which
  // Kotlin type-infers) and the unwrapped-assignment form (which returns
  // Unit), a value-returning block body MUST declare its return type —
  // `fun f() { … return x }` with no `: T` is a kotlinc error (`Unit`
  // expected). When the TS source didn't declare one, INFER it from the
  // body's first value-`return` (`function double(n) { return n * 2 }`
  // → `: Int`); `inferReturnType` yields `unknown` for a void body or an
  // un-inferable return, leaving the clause off (correct — void → Unit).
  let blockRet = d.returnType
  if (blockRet.kind === 'unknown' && ctx.inferCtx !== undefined) {
    blockRet = inferReturnType(d.params, d.body, ctx.inferCtx)
  }
  const blockRetType = blockRet.kind === 'unknown' ? '' : `: ${kotlinType(blockRet, ctx)}`
  // Seed this function's LOCAL `const`/`let` types into the infer ctx so a later
  // type-dependent emit in the body resolves them (named-handler analog of the
  // inline seeding in emitKotlinAction). Restored after. Mirror of the Swift
  // function-decl seeding.
  const savedLocals = seedHandlerLocals(d.body, _kotlinExprInferCtx)
  const bodyLines = d.body
    .map((s) => `    ${emitKotlinStatement(s, 4, ctx)}`)
    .join('\n')
  _kotlinExprInferCtx.locals = savedLocals
  return `fun ${kotlinIdent(d.name)}(${params})${blockRetType} {\n${bodyLines}\n  }`
}

/**
 * Emit a CONDITION expression with optional-truthiness lowering. Kotlin's `if`
 * condition must be `Boolean`; JS coerces an optional to truthy-when-present
 * (and `!optional` truthy-when-absent). So a bare nullable `t` → `t != null`, a
 * `!t` → `t == null`, everything else verbatim. `emit` is the caller's expr
 * emitter (`emitKotlinExpr` for ternary / `&&` / `if` / `while`; the accessor-
 * aware `emitKotlinSignalRead` for `<Show when>`). Mirror of `swiftCondition`.
 */
function kotlinCondition(e: ExprIR, emit: (x: ExprIR) => string): string {
  const c = classifyOptionalCondition(e, _kotlinExprInferCtx)
  if (c?.form === 'absent') return `${emit(c.argument)} == null`
  if (c?.form === 'present') return `${emit(e)} != null`
  return emit(e)
}

function emitKotlinStatement(s: StatementIR, indent: number, ctx: KotlinCtx): string {
  switch (s.kind) {
    case 'let':
      // `var` when a later `assign` reassigns this local (markReassigned-
      // LocalsMutable), else immutable `val`.
      return `${s.mutable ? 'var' : 'val'} ${kotlinIdent(s.name)} = ${emitKotlinExpr(s.expr, indent)}`
    case 'assign':
      return `${emitKotlinExpr(s.target, indent)} ${s.op} ${emitKotlinExpr(s.value, indent)}`
    case 'return': {
      // K2: emit `return@<label> expr` inside labeled lambda contexts
      // (e.g. multi-statement `derivedStateOf { … }` bodies) so kotlinc
      // doesn't reject with "'return' is prohibited here".
      const keyword = ctx.lambdaLabel ? `return@${ctx.lambdaLabel}` : 'return'
      return s.expr ? `${keyword} ${emitKotlinExpr(s.expr, indent)}` : keyword
    }
    case 'expr':
      // A bare `i++` / `i--` STATEMENT is side-effect-only → `i += 1` /
      // `i -= 1` (uniform with Swift). The general `update` expr emit returns
      // the OLD value (value-position form) and mis-compiles as a statement.
      if (s.expr.kind === 'update') {
        return `${emitKotlinExpr(s.expr.argument, indent)} ${s.expr.op === '++' ? '+=' : '-='} 1`
      }
      return emitKotlinExpr(s.expr, indent)
    case 'if': {
      const pad = ' '.repeat(indent)
      const cond = kotlinCondition(s.cond, (x) => emitKotlinExpr(x, indent))
      // Mirror of the Swift if-let narrowing, for the EMITTER's own eyes:
      // kotlinc smart-casts a val local inside `if (token != null)` by
      // language rule, but OUR type-dependent emits (struct-literal field
      // synthesis, optional-interpolation guards) consult the infer ctx —
      // narrow the bare-identifier optional for the then-body so they see
      // the non-null type (restored after).
      const optC = classifyOptionalCondition(s.cond, _kotlinExprInferCtx)
      const narrowName =
        optC?.form === 'present' && s.cond.kind === 'identifier' ? s.cond.name : undefined
      const narrowPrev =
        narrowName !== undefined ? _kotlinExprInferCtx.locals.get(narrowName) : undefined
      if (narrowName !== undefined && narrowPrev !== undefined) {
        _kotlinExprInferCtx.locals.set(narrowName, unwrapOptionalType(narrowPrev))
      }
      let thenLines: string
      try {
        thenLines = s.then
          .map((t) => `${pad}  ${emitKotlinStatement(t, indent + 2, ctx)}`)
          .join('\n')
      } finally {
        if (narrowName !== undefined && narrowPrev !== undefined) {
          _kotlinExprInferCtx.locals.set(narrowName, narrowPrev)
        }
      }
      const head = `if (${cond}) {\n${thenLines}\n${pad}}`
      if (!s.elseBody) return head
      const elseLines = s.elseBody
        .map((t) => `${pad}  ${emitKotlinStatement(t, indent + 2, ctx)}`)
        .join('\n')
      return `${head} else {\n${elseLines}\n${pad}}`
    }
    case 'while': {
      const pad = ' '.repeat(indent)
      const cond = kotlinCondition(s.cond, (x) => emitKotlinExpr(x, indent))
      const lines = s.body
        .map((t) => `${pad}  ${emitKotlinStatement(t, indent + 2, ctx)}`)
        .join('\n')
      // Loop label — Kotlin spells it `outer@ while … { break@outer }`.
      const lbl = s.label !== undefined ? `${kotlinIdent(s.label)}@ ` : ''
      return `${lbl}while (${cond}) {\n${lines}\n${pad}}`
    }
    case 'for-of': {
      const pad = ' '.repeat(indent)
      const iter = emitKotlinExpr(s.iterable, indent)
      const lines = s.body
        .map((t) => `${pad}  ${emitKotlinStatement(t, indent + 2, ctx)}`)
        .join('\n')
      const lbl2 = s.label !== undefined ? `${kotlinIdent(s.label)}@ ` : ''
      return `${lbl2}for (${kotlinIdent(s.item)} in ${iter}) {\n${lines}\n${pad}}`
    }
    case 'break':
      // Plain or labeled — pre-fix these warn-DROPPED (a semantic
      // mis-emit: the loop ran every iteration where JS would exit).
      return s.label !== undefined ? `break@${kotlinIdent(s.label)}` : 'break'
    case 'continue':
      return s.label !== undefined ? `continue@${kotlinIdent(s.label)}` : 'continue'
    case 'for-range': {
      // Canonical count-loop. Step 1 → `F until T` / `F..T` (inclusive);
      // a literal step > 1 appends `step K`. Ranges keep break/continue.
      const pad = ' '.repeat(indent)
      const from = emitKotlinExpr(s.from, indent)
      const to = emitKotlinExpr(s.to, indent)
      const lines = s.body
        .map((t) => `${pad}  ${emitKotlinStatement(t, indent + 2, ctx)}`)
        .join('\n')
      const range = s.inclusive === true ? `${from}..${to}` : `${from} until ${to}`
      const stepPart = s.step !== undefined ? ` step ${emitKotlinExpr(s.step, indent)}` : ''
      return `for (${kotlinIdent(s.item)} in ${range}${stepPart}) {\n${lines}\n${pad}}`
    }
    case 'do-while': {
      const pad = ' '.repeat(indent)
      const cond = kotlinCondition(s.cond, (x) => emitKotlinExpr(x, indent))
      const lines = s.body
        .map((t) => `${pad}  ${emitKotlinStatement(t, indent + 2, ctx)}`)
        .join('\n')
      return `do {\n${lines}\n${pad}} while (${cond})`
    }
    case 'switch': {
      const pad = ' '.repeat(indent)
      const disc = emitKotlinExpr(s.discriminant, indent)
      const discT = inferType(s.discriminant, _kotlinExprInferCtx)
      const discEnumName =
        discT.kind === 'typeRef' && _enumNames.has(discT.name) ? discT.name : undefined
      const caseLines = s.cases
        .map((c) => {
          const bodyLines = c.body
            .map((t) => `${pad}    ${emitKotlinStatement(t, indent + 4, ctx)}`)
            .join('\n')
          const body = bodyLines.length > 0 ? `{\n${bodyLines}\n${pad}  }` : '{}'
          if (c.tests.length === 0) return `${pad}  else -> ${body}`
          // ENUM-typed discriminant: emit the case LABELS with the
          // active-enum context set so string-literal tests rewrite to
          // `Status.case` — a raw `"busy" ->` against an enum subject is
          // a kotlinc "incompatible types" error. Labels ONLY — case
          // BODIES must keep string literals as strings.
          const prevEnum = _activeEnumType
          if (discEnumName !== undefined) _activeEnumType = discEnumName
          const labels = c.tests.map((t) => emitKotlinExpr(t, indent)).join(', ')
          _activeEnumType = prevEnum
          return `${pad}  ${labels} -> ${body}`
        })
        .join('\n')
      // Kotlin `when` as a STATEMENT need not be exhaustive — no forced else.
      return `when (${disc}) {\n${caseLines}\n${pad}}`
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
    case 'map':
      return `MutableMap<${kotlinType(t.key, ctx)}, ${kotlinType(t.value, ctx)}>`
    case 'set':
      return `MutableSet<${kotlinType(t.element, ctx)}>`
    case 'array':
      return `List<${kotlinType(t.element, ctx, signalName)}>`
    case 'object': {
      // Anonymous object types are synthesized as named data classes per
      // component. Class name derives from the component + signal name:
      // `Sum` + `items` → `SumItem`. Idempotent across decls in the same
      // component (same shape ⇒ same name). NESTED object / array-of-object
      // fields recurse into their OWN data class (`Profile` + `meta` →
      // `ProfileMeta`) and the field is rewritten to a typeRef — without the
      // rewrite `emitKotlinDataClass` renders the nested object as `Any`,
      // which is NOT `@Serializable` and breaks a real Android build.
      if (!ctx) return 'Any'
      return registerKotlinSynthClass(t, ctx, synthesizeDataClassName(ctx.componentName, signalName))
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
    // A FUNCTION branch must be parenthesized before the `?` — a bare
    // `(Int) -> Unit?` is a function RETURNING `Unit?`, not a nullable
    // function. `((Int) -> Unit)?` is the nullable-function type.
    const only = nonNullBranches[0]!
    const inner = kotlinType(only, ctx, signalName)
    return only.kind === 'function' ? `(${inner})?` : `${inner}?`
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

/**
 * Register a data class for an object TypeIR under `name`, recursing into any
 * NESTED object / array-of-object field so those become their OWN data classes
 * (`Profile` + `meta` → `ProfileMeta`) and the field is rewritten to a typeRef.
 * `emitKotlinDataClass` renders field types with NO ctx, so a nested object
 * left un-rewritten degrades to `Any` (not `@Serializable`); the rewrite keeps
 * the whole nested tree serialization-safe. Returns `name`.
 */
function registerKotlinSynthClass(
  t: Extract<TypeIR, { kind: 'object' }>,
  ctx: KotlinCtx,
  name: string,
): string {
  if (ctx.synthesizedDataClasses.some((s) => s.name === name)) return name
  // Reserve the name BEFORE recursing so a nested field can't re-derive it.
  const entry: { name: string; fields: { name: string; type: TypeIR }[] } = { name, fields: [] }
  ctx.synthesizedDataClasses.push(entry)
  entry.fields = t.fields.map((f) => ({
    name: f.name,
    type: resolveKotlinSynthFieldType(f.type, ctx, name, f.name),
  }))
  return name
}

/** Rewrite a data-class field's TypeIR: a nested object → typeRef to its own
 *  synthesized data class; an array-of-object → array of that typeRef. */
function resolveKotlinSynthFieldType(
  ft: TypeIR,
  ctx: KotlinCtx,
  parentName: string,
  fieldName: string,
): TypeIR {
  const suffix = fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
  if (ft.kind === 'object') {
    const nested = registerKotlinSynthClass(ft, ctx, uniqueKotlinClassName(ctx, parentName + suffix))
    return { kind: 'typeRef', name: nested, args: [] }
  }
  if (ft.kind === 'array' && ft.element.kind === 'object') {
    const singular = suffix.endsWith('s') ? suffix.slice(0, -1) : suffix
    const nested = registerKotlinSynthClass(ft.element, ctx, uniqueKotlinClassName(ctx, parentName + singular))
    return { kind: 'array', element: { kind: 'typeRef', name: nested, args: [] } }
  }
  return ft
}

/** A data class name not already taken (counter suffix on a rare collision). */
function uniqueKotlinClassName(ctx: KotlinCtx, base: string): string {
  if (!ctx.synthesizedDataClasses.some((s) => s.name === base)) return base
  let i = 2
  while (ctx.synthesizedDataClasses.some((s) => s.name === `${base}${i}`)) i++
  return `${base}${i}`
}

/**
 * Emit the BODY of an index-callback lambda for the withIndex()/`*Indexed`
 * array methods (map / forEach / filter / any / all / firstOrNull). Handles a
 * MULTI-statement block body via `cb.stmts` (mirroring `emitKotlinAction`), not
 * just a single expression — reading only `cb.body` (the empty-literal SENTINEL
 * a block body parses to) silently DROPPED the whole body and compiled clean.
 * Returns the text that goes right after `->` (leading/trailing space for the
 * single-expr case; a newline-wrapped block for multi-statement), so each call
 * site keeps its own lambda head (`{ (idx, el) ->` vs `{ idx, el ->`).
 *
 * `label` is the enclosing method (`filterIndexed` / `any` / `mapIndexed` / …):
 * a bare `return` inside a Kotlin lambda is prohibited (it targets the enclosing
 * function), so `emitKotlinStatement` emits `return@<label>` when `lambdaLabel`
 * is set — correct for both trailing AND early/nested returns.
 */
function emitKotlinIndexedBody(
  cb: Extract<ExprIR, { kind: 'arrow' }>,
  indent: number,
  label: string,
): string {
  if (cb.stmts !== undefined && cb.stmts.length > 0) {
    const stmtCtx: KotlinCtx = {
      synthesizedDataClasses: [],
      componentName: '',
      lambdaLabel: label,
    }
    const pad = ' '.repeat(indent + 2)
    const savedLocals = seedHandlerLocals(cb.stmts, _kotlinExprInferCtx)
    const lines = cb.stmts.map((s) => pad + emitKotlinStatement(s, indent + 2, stmtCtx)).join('\n')
    _kotlinExprInferCtx.locals = savedLocals
    return `\n${lines}\n${' '.repeat(indent)}`
  }
  return ` ${emitKotlinExpr(cb.body, indent)} `
}

/**
 * Emit a PLAIN (1-param) callback arg with Kotlin's labeled-return support —
 * the plain-path sibling of `emitKotlinIndexedBody`. A multi-statement body
 * with early returns needs `return@<label>` (a bare `return` inside a lambda
 * is prohibited); the label is the EMITTED Kotlin method name, which only
 * the call site knows. Expression bodies + non-arrows fall through to the
 * generic emit. Pre-fix the multi-statement plain callback silently dropped
 * its body (the block-body `""` sentinel — the dedup idiom
 * `filter(x => { if (seen.has(x)) return false; seen.add(x); return true })`
 * emitted `{ x -> "" }`).
 */
function emitKotlinPlainCallback(arg: ExprIR, indent: number, label: string): string {
  if (arg.kind !== 'arrow' || arg.stmts === undefined || arg.stmts.length === 0) {
    return emitKotlinExpr(arg, indent)
  }
  const head = arg.params.length > 0 ? `${arg.params.map(kotlinIdent).join(', ')} ->` : ''
  return `{ ${head}${emitKotlinIndexedBody(arg, indent, label)}}`
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
    case 'await':
      // M4.5: a Kotlin suspend call carries NO `await` keyword — the enclosing
      // `scope.launch { … }` coroutine provides the suspension context. Emit
      // just the inner call.
      return emitKotlinExpr(e.expr, indent)
    case 'toast-call': {
      // Imperative `@pyreon/toast` call → the process-global PyreonToast queue.
      // `toast("x")` / `toast.success("x")` → PyreonToast.add("x", "…").
      // A literal duration (ms) sets the auto-dismiss (Long).
      const durArg = e.durationMillis !== undefined ? `, ${e.durationMillis}L` : ''
      return `PyreonToast.add(${emitKotlinExpr(e.message, indent)}, ${JSON.stringify(e.toastType)}${durArg})`
    }
    case 'announce-call':
      // Imperative @pyreon/a11y announce → PyreonA11y (the registered announcer).
      return `PyreonA11y.announce(${emitKotlinExpr(e.message, indent)}, ${e.assertive})`
    case 'call': {
      // Field-array accessor unwrap: zero-arg `items()`/`length()` on a
      // PyreonFieldArray decl (and `value()` on a For-item param over its
      // items) are web signal READS — on Kotlin they are properties, so the
      // call parens must go or kotlinc fails with "expression 'items' of
      // type 'SnapshotStateList' cannot be invoked as a function".
      if (
        e.args.length === 0 &&
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        typeof e.callee.property === 'string'
      ) {
        const recv = e.callee.object.name
        if (
          _fieldArrayNamesKotlin.has(recv) &&
          (e.callee.property === 'items' || e.callee.property === 'length')
        ) {
          return `${kotlinIdent(recv)}.${e.callee.property}`
        }
        if (_fieldArrayItemParamsKotlin.includes(recv) && e.callee.property === 'value') {
          return `${kotlinIdent(recv)}.value`
        }
      }
      // `Object.keys(<object-typed expr>)` → `listOf("a","b")` of the
      // struct field names (statically known). Recurse into the rewritten
      // array literal so the array emit produces the `List<String>`.
      {
        const rw = rewriteObjectKeys(e, _kotlinExprInferCtx)
        if (rw !== null) return emitKotlinExpr(rw, indent)
      }
      // `Object.values(<object-typed expr>)` → a static member-access array
      // (listOf(p.a, p.b)) — mirror of the Swift lowering.
      {
        const rw = rewriteObjectValues(e, _kotlinExprInferCtx)
        if (rw !== null) return emitKotlinExpr(rw, indent)
      }
      // Any other `Object.<method>(...)` — `keys` on a non-data-class arg,
      // `values` / `entries` (heterogeneous → `List<Any>`), `assign` /
      // `fromEntries` — has no native analog: a Kotlin data class carries no
      // runtime key reflection. The generic fall-through emits
      // `Object.keys(...)` (unresolved reference). Degrade to a typed empty
      // list (always compiles) and warn so the drop is loud.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Object'
      ) {
        _emitWarnings.push(
          `Object.${e.callee.property}(...) has no native equivalent — only Object.keys() / Object.values() on a statically-known HOMOGENEOUS object shape are supported (it lowers to a literal key list). Emitting an empty list; restructure to avoid runtime object reflection on native.`,
        )
        return e.callee.property === 'keys' ? 'emptyList<String>()' : 'emptyList<Any>()'
      }
      // PyreonDatabase RECORD literals. `db.insert('todos', { id, fields })`
      // is the primary write, and the object literal was lowered by the
      // generic path into `(id = "1", fields = __Obj0(...))` — not even a
      // valid Kotlin expression, let alone a `PyreonRecord`. So the call never
      // compiled, on either target. `insert` is the only way to get data in,
      // which is why no gated app has ever rendered FROM the database.
      //
      // Field values are emitted AS WRITTEN: `fields` is `Map<String, String>`,
      // and silently wrapping a number in `.toString()` would hide a real
      // mistake behind a coercion.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _databaseNames.has(e.callee.object.name) &&
        e.callee.property === 'insert' &&
        e.args.length === 2 &&
        e.args[1]?.kind === 'object'
      ) {
        const lit = e.args[1] as Extract<ExprIR, { kind: 'object' }>
        const idField = lit.fields.find((f) => f.name === 'id')
        const fieldsField = lit.fields.find((f) => f.name === 'fields')
        const unknown = lit.fields.filter((f) => f.name !== 'id' && f.name !== 'fields')
        if (idField && unknown.length === 0) {
          const parts = [emitKotlinExpr(idField.value, indent)]
          if (fieldsField) {
            if (fieldsField.value.kind === 'object') {
              const entries = fieldsField.value.fields
                .map((f) => `${JSON.stringify(f.name)} to ${emitKotlinExpr(f.value, indent)}`)
                .join(', ')
              parts.push(entries === '' ? 'emptyMap()' : `mapOf(${entries})`)
            } else {
              parts.push(emitKotlinExpr(fieldsField.value, indent))
            }
          }
          const collection = emitKotlinExpr(e.args[0]!, indent)
          return `${kotlinIdent(e.callee.object.name)}.insert(${collection}, PyreonRecord(${parts.join(', ')}))`
        }
      }
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
      // `Date.now()` — JS ms-since-epoch. `Date` is an unresolved reference
      // on Kotlin (verbatim emit failed) — lower to
      // `System.currentTimeMillis().toDouble()` (Double: Kotlin Int is
      // 32-bit, ms-since-epoch overflows it; the inference types this
      // float). Other `Date.*` statics → NAMED warning (mirror of Swift).
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Date'
      ) {
        if (e.callee.property === 'now' && e.args.length === 0) {
          return 'System.currentTimeMillis().toDouble()'
        }
        _emitWarnings.push(
          `Date.${e.callee.property}(...) has no native lowering — only Date.now() (epoch milliseconds, a Double) is supported. Format or parse dates in display logic on the platform side.`,
        )
      }
            // `Math.<fn>(args)` — DOUBLE-DOMAIN math. The generic passthrough
      // `Math.sqrt(16)` resolves to `java.lang.Math.sqrt(double)` but rejects
      // an Int arg ("type mismatch") — Kotlin does NOT auto-widen Int→Double
      // for a java method call — and `sign`/`trunc`/`log2` don't exist on
      // java.lang.Math at all. Coerce every arg `.toDouble()` (identity on a
      // Double, so it's safe regardless of the arg's type) and remap the
      // three non-java fns to `kotlin.math`. Int-friendly fns (abs/max/min)
      // and constants (PI/E)/random + floor/ceil/round are left to the
      // generic emit (they already validate). Swift parses its Math fine
      // (free functions + literal inference), so this is Kotlin-only.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Math'
      ) {
        // `Math.max(...arr)` / `Math.min(...arr)` — spread form (mirror of the
        // Swift lowering; raw emit was a SILENT "unresolved reference").
        if (
          (e.callee.property === 'max' || e.callee.property === 'min') &&
          e.args.length === 1 &&
          e.args[0]!.kind === 'spread'
        ) {
          const spreadArg = (e.args[0]! as { kind: 'spread'; argument: ExprIR }).argument
          const arrT = inferType(spreadArg, _kotlinExprInferCtx)
          const isFloat =
            arrT.kind === 'array' && arrT.element.kind === 'number' && arrT.element.float === true
          const arrStr = emitKotlinExpr(spreadArg, indent)
          const isMax = e.callee.property === 'max'
          const sentinel = isFloat
            ? isMax
              ? 'Double.NEGATIVE_INFINITY'
              : 'Double.POSITIVE_INFINITY'
            : isMax
              ? 'Int.MIN_VALUE'
              : 'Int.MAX_VALUE'
          return `(${arrStr}.${isMax ? 'maxOrNull' : 'minOrNull'}() ?: ${sentinel})`
        }
        const fn = e.callee.property
        // java.lang.Math Double-domain fns — keep `Math.<fn>`, coerce args.
        const JAVA_MATH_DOUBLE = new Set([
          'sqrt', 'cbrt', 'pow', 'hypot', 'sin', 'cos', 'tan',
          'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
          'log', 'log10', 'exp',
        ])
        // Not on java.lang.Math (or differently named) — use kotlin.math.
        const KOTLIN_MATH_REMAP: Record<string, string> = {
          sign: 'kotlin.math.sign',
          trunc: 'kotlin.math.truncate',
          log2: 'kotlin.math.log2',
        }
        if (JAVA_MATH_DOUBLE.has(fn) || KOTLIN_MATH_REMAP[fn] !== undefined) {
          const args = e.args
            .map((a) => `(${emitKotlinExpr(a, indent)}).toDouble()`)
            .join(', ')
          const callee = KOTLIN_MATH_REMAP[fn] ?? `Math.${fn}`
          return `${callee}(${args})`
        }
      }
      // `Array.from(x)` → `(x).toList()` (shallow copy). `Array.from(x, fn)` →
      // `x.map(fn)` (reuses the `.map` emit). `Array.isArray(x)` → `true` (a
      // typed source IS statically an array). The generic emit would produce
      // `Array.from(...)` / `Array.isArray(...)` → INVALID Kotlin ("cannot
      // infer type for type parameter 'T'", confirmed via kotlinc).
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Array'
      ) {
        if (e.callee.property === 'isArray') return 'true'
        if (e.callee.property === 'from') {
          // `Array.from({ length: n }, (_, i) => body)` → `(0 until n).map { i -> body }`.
          const range = objectLengthRangeForm(e)
          if (range !== null) {
            // Seed the INDEX param as Int for the body emit — the Swift
            // twin's comment has the rationale; here the bailed synthesis
            // emitted `(id = i, …)` NAMED-TUPLE syntax, which is not Kotlin
            // at all (a syntax error at the site).
            const had = _kotlinExprInferCtx.locals.has(range.indexParam)
            const prev = _kotlinExprInferCtx.locals.get(range.indexParam)
            _kotlinExprInferCtx.locals.set(range.indexParam, { kind: 'number' })
            try {
              return `(0 until ${emitKotlinExpr(range.lenExpr, indent)}).map({ ${kotlinIdent(range.indexParam)} -> ${emitKotlinExpr(range.body, indent)} })`
            } finally {
              if (had) _kotlinExprInferCtx.locals.set(range.indexParam, prev!)
              else _kotlinExprInferCtx.locals.delete(range.indexParam)
            }
          }
          const mapForm = arrayFromMapRewrite(e)
          if (mapForm !== null) return emitKotlinExpr(mapForm, indent)
          if (e.args.length === 1 && e.args[0]!.kind !== 'object') {
            return `(${emitKotlinExpr(e.args[0]!, indent)}).toList()`
          }
          // Any OTHER `Array.from({ length: n }, …)` shape — the 1-arg form (no
          // map fn), a block-body callback, or one that references the
          // (always-`undefined`) element param — is not lowered: name it loudly
          // rather than drop it.
          _emitWarnings.push(
            '`Array.from({ length: n })` without an `(_, index) => expr` map callback is not supported on native — this call keeps the raw `Array.from(` emit (a kotlinc error at the site). Use `Array.from({ length: n }, (_, i) => …)`, `(0 until n).map { … }`, or a numeric loop.',
          )
        }
      }
      // `Number.isInteger(x)` — mirror of the Swift lowering (raw emit was
      // a SILENT "unresolved reference 'Number'").
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Number' &&
        e.callee.property === 'isInteger' &&
        e.args.length === 1
      ) {
        const nt = inferType(e.args[0]!, _kotlinExprInferCtx)
        const argStr = emitKotlinExpr(e.args[0]!, indent)
        if (nt.kind === 'number' && nt.float !== true) return 'true'
        if (nt.kind === 'number') {
          return `((${argStr}) % 1.0 == 0.0)`
        }
        _emitWarnings.push(
          `Number.isInteger(${argStr}): the argument's numeric type could not be inferred — emitting the raw call, which does not compile natively. Give the argument a resolvable number type.`,
        )
      }
      // `isNaN(x)` — mirror of the Swift lowering (SILENT fail).
      if (
        e.callee.kind === 'identifier' &&
        e.callee.name === 'isNaN' &&
        e.args.length === 1
      ) {
        const nT = inferType(e.args[0]!, _kotlinExprInferCtx)
        const nStr = emitKotlinExpr(e.args[0]!, indent)
        if (nT.kind === 'number' && nT.float !== true) return 'false'
        if (nT.kind === 'number') return `(${nStr}).isNaN()`
        _emitWarnings.push(
          `isNaN(${nStr}): the argument's numeric type could not be inferred — emitting the raw call, which does not compile natively.`,
        )
      }
      // `ws.connect()` on Kotlin — the runtime's connect takes a
      // `ws.connect()` (0-arg TS surface) → the OkHttp transport extension
      // `PyreonWebSocket.connect(url)` (from @pyreon/native-runtime-kotlin,
      // #1987), threading the registered url. Mirror of the Swift
      // `connect(to: URL(...))` lowering — the default-OkHttp-transport
      // follow-up that closes the Kotlin side of the lifecycle auto-start.
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 'connect' &&
        e.callee.object.kind === 'identifier' &&
        _websocketUrlsKotlin.has(e.callee.object.name) &&
        e.args.length === 0
      ) {
        return `${kotlinIdent(e.callee.object.name)}.connect(${JSON.stringify(_websocketUrlsKotlin.get(e.callee.object.name)!)})`
      }
      // `Boolean(x)` — JS truthiness coercion as a VALUE. Kotlin has no
      // `Boolean(x)` function (the raw emit fails "unresolved reference"),
      // so lower by the arg's INFERRED type — the mirror of the Swift
      // lowering (see emit-swift.ts): bool → identity; number → `!= 0`;
      // string → `.isNotEmpty()`; optional number/string → check the inner
      // value ((x ?: 0) != 0 — JS Boolean(undefined)=Boolean(0)=false);
      // other optionals → `!= null`. Unresolvable arg type → raw emit + a
      // NAMED warning (kotlinc names the site — never a silent drop).
      if (
        e.callee.kind === 'identifier' &&
        e.callee.name === 'Boolean' &&
        e.args.length === 1
      ) {
        const t = inferType(e.args[0]!, _kotlinExprInferCtx)
        const arg = emitKotlinExpr(e.args[0]!, indent)
        if (t.kind === 'boolean') return arg
        if (t.kind === 'number') return `(${arg} != 0)`
        if (t.kind === 'string') return `(${arg}).isNotEmpty()`
        if (typeIsOptional(t)) {
          const inner = unwrapOptionalType(t)
          if (inner.kind === 'number') return `((${arg} ?: 0) != 0)`
          if (inner.kind === 'string') return `(${arg} ?: "").isNotEmpty()`
          return `(${arg} != null)`
        }
        _emitWarnings.push(
          `Boolean(${arg}): the argument's type could not be inferred, so the JS-truthiness lowering (!= 0 / isNotEmpty / != null) cannot be chosen — emitting the raw call, which does not compile on Kotlin. Give the argument a resolvable type (signal<T>, a typed param, a declared struct field).`,
        )
        return `Boolean(${arg})`
      }
      // `self.count()` inside a model view/action body — a READ of the
      // model's own state; emit the property bare (mirror of Swift).
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _activeModelSelfParamKotlin !== undefined &&
        e.callee.object.name === _activeModelSelfParamKotlin &&
        e.args.length === 0 &&
        _signalNames.has(e.callee.property)
      ) {
        return kotlinIdent(e.callee.property)
      }
      // state-tree model member call (mirror of the Swift rewrite):
      // `counter.count()` is a signal READ and drops its parens onto the
      // object's property; `counter.inc()` is an ACTION and keeps them.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _modelInstancesKotlin.has(e.callee.object.name)
      ) {
        const instance = e.callee.object.name
        const modelId = _modelInstancesKotlin.get(instance)!
        const member = kotlinIdent(e.callee.property)
        if (
          e.args.length === 0 &&
          _modelReadNamesKotlin.get(instance)?.has(e.callee.property) === true
        ) {
          return `PyreonModel_${modelId}.${member}`
        }
        if (_modelMethodNamesKotlin.get(instance)?.has(e.callee.property) === true) {
          const args = e.args.map((a) => emitKotlinExpr(a, indent)).join(', ')
          return `PyreonModel_${modelId}.${member}(${args})`
        }
      }
      // useBluetooth's reactive reads — MutableState on Compose, so the
      // web's accessor spelling becomes `.value`. `available` is a plain
      // getter and takes neither parens nor `.value`.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _bluetoothKotlin.has(e.callee.object.name) &&
        e.args.length === 0 &&
        ['scanning', 'devices', 'error', 'available'].includes(e.callee.property)
      ) {
        const base = `${kotlinIdent(e.callee.object.name)}.${kotlinIdent(e.callee.property)}`
        return e.callee.property === 'available' ? base : `${base}.value`
      }
      // useWakeLock — `active` is MutableState so it takes `.value`;
      // `supported` is a plain getter and takes neither parens nor `.value`.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _wakeLockKotlin.has(e.callee.object.name) &&
        e.args.length === 0 &&
        ['active', 'supported'].includes(e.callee.property)
      ) {
        const base = `${kotlinIdent(e.callee.object.name)}.${kotlinIdent(e.callee.property)}`
        return e.callee.property === 'supported' ? base : `${base}.value`
      }
      // useDeviceInfo — every read is a plain getter here, so parens drop
      // and NONE of them take `.value` (unlike useWakeLock's `active`).
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _deviceInfoKotlin.has(e.callee.object.name) &&
        e.args.length === 0 &&
        ['platform', 'model', 'osVersion', 'isTouch', 'screen'].includes(e.callee.property)
      ) {
        return `${kotlinIdent(e.callee.object.name)}.${kotlinIdent(e.callee.property)}`
      }
      // useSafeArea returns a SINGLE accessor, so `s()` is a bare call on the
      // binding itself rather than a member call. It becomes the runtime's
      // `.insets` property, so `s().top` lowers to `s.insets.top`.
      if (
        e.callee.kind === 'identifier' &&
        _safeAreaKotlin.has(e.callee.name) &&
        e.args.length === 0
      ) {
        return `${kotlinIdent(e.callee.name)}.insets`
      }
      // useScreenOrientation's reads — properties on this target, so the
      // web-correct accessor spelling drops its parens.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _orientationKotlin.has(e.callee.object.name) &&
        e.args.length === 0 &&
        ['type', 'angle'].includes(e.callee.property)
      ) {
        return `${kotlinIdent(e.callee.object.name)}.${kotlinIdent(e.callee.property)}`
      }
      // useToggle / useCounter member surface (mirror of Swift). The state
      // field IS the value, so a read drops its parens; each mutator becomes
      // the arithmetic it stands for, with useCounter's literal clamp baked
      // in identically to the Swift side.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _pureStateKotlin.has(e.callee.object.name)
      ) {
        const binding = e.callee.object.name
        const info = _pureStateKotlin.get(binding)!
        const field = kotlinIdent(binding)
        const m = e.callee.property
        const arg = e.args.length > 0 ? emitKotlinExpr(e.args[0]!, indent) : undefined
        const clamp = (x: string): string => clampExpr(x, info.bounds, 'minOf', 'maxOf')
        if (info.hook === 'useToggle') {
          if (m === 'value') return field
          if (m === 'toggle') return `${field} = !${field}`
          if (m === 'setTrue') return `${field} = true`
          if (m === 'setFalse') return `${field} = false`
        } else {
          if (m === 'count') return field
          if (m === 'inc') return `${field} = ${clamp(`${field} + ${arg ?? '1'}`)}`
          if (m === 'dec') return `${field} = ${clamp(`${field} - ${arg ?? '1'}`)}`
          if (m === 'set') return `${field} = ${clamp(arg ?? '0')}`
          if (m === 'reset') return `${field} = ${clamp(String(_pureStateInitialKotlin.get(binding) ?? 0))}`
        }
      }
      // Mirror of the Swift clipboard rewrite. Kotlin's `copied` is a
      // `val … get()`, so the read is paren-less there too.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _clipboardKotlin.has(e.callee.object.name) &&
        e.args.length === 0 &&
        ['copied', 'text'].includes(e.callee.property)
      ) {
        return `${kotlinIdent(e.callee.object.name)}.${kotlinIdent(e.callee.property)}`
      }
      // PyreonTableState property reads drop parens (methods flow through).
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _tableNames.has(e.callee.object.name) &&
        e.args.length === 0 &&
        ['page', 'sortColumn', 'sortDirection', 'filterValue'].includes(e.callee.property)
      ) {
        return `${kotlinIdent(e.callee.object.name)}.${kotlinIdent(e.callee.property)}`
      }
      // `parseInt(s)` / `parseFloat(s)` / `Number(s)` → Kotlin
      // `(s).toIntOrNull() ?: 0` / `(s).toDoubleOrNull() ?: 0.0`. JS returns
      // NaN on failure; the `?:` default keeps a non-null Int/Double.
      // `Number(x)` coerces to a float-capable number → Double. A radix arg
      // is ignored.
      if (
        e.callee.kind === 'identifier' &&
        (e.callee.name === 'parseInt' ||
          e.callee.name === 'parseFloat' ||
          e.callee.name === 'Number') &&
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
          e.callee.property === 'isFetching' ||
          e.callee.property === 'error')
      ) {
        return `${kotlinIdent(e.callee.object.name)}.${e.callee.property}.value`
      }
      // Phase-5 native-container reactive FIELD read via the web signal-read
      // idiom `ws.lastMessage()` → `ws.lastMessage.value` (drop the call parens
      // — the field is a Compose MutableState property, so `.value()` would
      // invoke the value as a function). Method calls (`ws.send(...)`, args
      // present) and Bool getters read bare via the generic emit below.
      if (
        e.args.length === 0 &&
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        isContainerMutableStateField(e.callee.object.name, e.callee.property)
      ) {
        return `${kotlinIdent(e.callee.object.name)}.${kotlinIdent(e.callee.property)}.value`
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
      // Gated to ONE argument — a 2-arg `.set(k, v)` is a Map write.
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 'set' &&
        e.args.length === 1 &&
        // DENY-BY-DEFAULT for an identifier receiver — mirror of the Swift
        // emit. Rewrite only when the name is a KNOWN signal/computed. The
        // previous allow-by-default exclusion list was a silent-hole
        // generator: every binding whose `set` is a REAL method had to be
        // remembered, and a forgotten one emitted `x = v` against a `val`
        // ("val cannot be reassigned"). Member-expression receivers keep the
        // old behaviour — they are not tracked in _signalNames.
        (e.callee.object.kind !== 'identifier' || _signalNames.has(e.callee.object.name))
      ) {
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
        if (_syncedSignalNames.has(e.callee.name)) {
          return `${kotlinIdent(e.callee.name)}()`
        }
        // `useOnline()` returns a web ACCESSOR (`() => boolean`), so shared code
        // reads it as `net()`. Lower that accessor call to `net.isOnline.value`
        // (the MutableState-backed reactive Bool on PyreonNetworkStatus) so ONE
        // source works web + native — the bare `net` fall-through emitted `if (net)`,
        // uncompilable (the container isn't a Bool). The `net.isOnline` member
        // form is handled separately (→ `.isOnline.value`); this covers `net()`.
        if (_appStateNames.has(e.callee.name)) {
          return `${kotlinIdent(e.callee.name)}.phase.value`
        }
        if (_netStatusNames.has(e.callee.name)) {
          return `${kotlinIdent(e.callee.name)}.isOnline.value`
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
        // Labeled-return wiring for MULTI-STATEMENT plain (1-param)
        // callbacks — the call site knows the emitted Kotlin method name
        // (the return label). 2-param INDEX callbacks keep their own
        // dedicated paths (emitKotlinIndexedBody call sites below); this
        // block only fires for 1-param arrows with statement bodies. It
        // runs BEFORE the eager `argExprs` emission below — emitting a
        // multi-statement arrow as a plain expression would push a
        // spurious "body DROPPED" warning before this block could rewrite it.
        {
          const PLAIN_CALLBACK_LABELS: Record<string, string> = {
            filter: 'filter',
            map: 'map',
            forEach: 'forEach',
            flatMap: 'flatMap',
            find: 'find',
            findLast: 'findLast',
            some: 'any',
            every: 'all',
          }
          const label = PLAIN_CALLBACK_LABELS[prop]
          const cb = e.args[0]
          if (
            label !== undefined &&
            e.args.length === 1 &&
            cb !== undefined &&
            cb.kind === 'arrow' &&
            cb.params.length === 1 &&
            cb.stmts !== undefined &&
            cb.stmts.length > 0
          ) {
            return `${obj}.${label}(${emitKotlinPlainCallback(cb, indent, label)})`
          }
        }
        const argExprs = e.args.map((a) => emitKotlinExpr(a, indent))
        // Map/Set method vocabulary — mirror of the Swift rewrites, typed
        // off the receiver's inferred kind.
        {
          const recvT = inferType(e.callee.object, _kotlinExprInferCtx)
          if (recvT.kind === 'map') {
            if (prop === 'set' && e.args.length === 2) return `${obj}[${argExprs[0]!}] = ${argExprs[1]!}`
            if (prop === 'get' && e.args.length === 1) return `${obj}[${argExprs[0]!}]`
            if (prop === 'has' && e.args.length === 1) return `${obj}.containsKey(${argExprs[0]!})`
            if (prop === 'delete' && e.args.length === 1) return `${obj}.remove(${argExprs[0]!})`
            if (prop === 'clear' && e.args.length === 0) return `${obj}.clear()`
          }
          if (recvT.kind === 'set') {
            if (prop === 'add' && e.args.length === 1) return `${obj}.add(${argExprs[0]!})`
            if (prop === 'has' && e.args.length === 1) return `${obj}.contains(${argExprs[0]!})`
            if (prop === 'delete' && e.args.length === 1) return `${obj}.remove(${argExprs[0]!})`
            if (prop === 'clear' && e.args.length === 0) return `${obj}.clear()`
          }
        }
        switch (prop) {
          case 'some': {
            // 2-param INDEX callback `.some((el, idx) => …)`: `withIndex()`
            // yields `IndexedValue(index, value)` (destructured `(idx, el)`,
            // index-FIRST) → `.any { (idx, el) -> … }`. Mirrors mapIndexed +
            // the shared `indexedArrayCallback` gate (#1934). Checked BEFORE the
            // 1-arg branch — a 2-PARAM arrow is still ONE argument.
            const cb = indexedArrayCallback(e.args)
            if (cb) {
              const el = kotlinIdent(cb.params[0]!)
              const idx = kotlinIdent(cb.params[1]!)
              return `${obj}.withIndex().any({ (${idx}, ${el}) ->${emitKotlinIndexedBody(cb, indent, 'any')}})`
            }
            if (e.args.length === 1) {
              return `${obj}.any(${argExprs[0]!})`
            }
            break
          }
          case 'every': {
            const cb = indexedArrayCallback(e.args)
            if (cb) {
              const el = kotlinIdent(cb.params[0]!)
              const idx = kotlinIdent(cb.params[1]!)
              return `${obj}.withIndex().all({ (${idx}, ${el}) ->${emitKotlinIndexedBody(cb, indent, 'all')}})`
            }
            if (e.args.length === 1) {
              return `${obj}.all(${argExprs[0]!})`
            }
            break
          }
          case 'filter': {
            // 1-arg `.filter(pred)` passes through unchanged; the 2-param INDEX
            // form is Kotlin's `filterIndexed { idx, el -> … }` (index-FIRST).
            const cb = indexedArrayCallback(e.args)
            if (cb) {
              const el = kotlinIdent(cb.params[0]!)
              const idx = kotlinIdent(cb.params[1]!)
              return `${obj}.filterIndexed({ ${idx}, ${el} ->${emitKotlinIndexedBody(cb, indent, 'filterIndexed')}})`
            }
            if (e.args.length === 1) return `${obj}.filter(${argExprs[0]!})`
            break
          }
          case 'map':
          case 'forEach': {
            // JS `.map((el, idx) => …)` / `.forEach((el, idx) => …)` pass
            // (element, index); Kotlin's `.map`/`.forEach` lambda takes ONLY
            // the element, so a 2-param callback fails to infer. The
            // index-aware form is `mapIndexed { idx, el -> … }` /
            // `forEachIndexed { idx, el -> … }` — both are index-FIRST `(index,
            // element)`, so bind `idx, el` SWAPPED from the JS `(el, idx)`
            // order. 1-param callbacks fall through to the generic emit.
            const cb = indexedArrayCallback(e.args)
            if (cb) {
              const el = kotlinIdent(cb.params[0]!)
              const idx = kotlinIdent(cb.params[1]!)
              const fn = prop === 'map' ? 'mapIndexed' : 'forEachIndexed'
              return `${obj}.${fn}({ ${idx}, ${el} ->${emitKotlinIndexedBody(cb, indent, fn)}})`
            }
            break
          }
          case 'includes':
            if (e.args.length === 1) {
              return `${obj}.contains(${argExprs[0]!})`
            }
            break
          case 'charAt':
            // JS `str.charAt(i)` returns a 1-char STRING. Kotlin `str[i]` is
            // a Char, so `.toString()` to match JS's String result (Swift:
            // `String(Array(str)[i])`). Out-of-range crashes (JS returns "")
            // — bounds are the caller's concern; documented v1 limitation.
            if (e.args.length === 1) return `${obj}[${argExprs[0]!}].toString()`
            break
          case 'padStart':
          case 'padEnd': {
            // Kotlin `String.padStart(len, padChar)` / `padEnd` ARE native —
            // but the pad arg is a Char, not a String. JS passes a String, so
            // a single-char string literal (`"0"`) becomes a Char (`'0'`);
            // omitted → native `padStart(len)` (Kotlin's default pad is a
            // space, matching JS). A multi-char/dynamic pad can't map to a
            // Char → falls through to the generic emit (mirrors the Swift
            // single-char-pad restriction).
            const padArg = e.args[1]
            if (e.args.length === 1) return `${obj}.${prop}(${argExprs[0]!})`
            if (
              e.args.length >= 2 &&
              padArg !== undefined &&
              padArg.kind === 'literal' &&
              typeof padArg.value === 'string' &&
              padArg.value.length === 1 &&
              padArg.value !== "'" &&
              padArg.value !== '\\'
            ) {
              return `${obj}.${prop}(${argExprs[0]!}, '${padArg.value}')`
            }
            break
          }
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
          case 'fill': {
            // JS `arr.fill(v)` → Kotlin `List(<n>) { v }` (immutable). The
            // canonical `Array(n).fill(v)` create-and-fill → count is the
            // `Array(n)` arg; a generic `arr.fill(v)` fills `arr.size` slots.
            // (Swift mirror: Array(repeating:count:).)
            if (e.args.length === 1) {
              const objExpr = e.callee.object
              if (
                objExpr.kind === 'call' &&
                objExpr.callee.kind === 'identifier' &&
                objExpr.callee.name === 'Array' &&
                objExpr.args.length === 1
              ) {
                const count = emitKotlinExpr(objExpr.args[0]!, indent)
                return `List(${count}) { ${argExprs[0]!} }`
              }
              return `List(${obj}.size) { ${argExprs[0]!} }`
            }
            break
          }
          case 'at': {
            // JS `arr.at(i)` → Optional element with NEGATIVE indices from the
            // end. Kotlin `getOrNull` is null-safe but not negative-aware, so
            // resolve the index first. (Swift mirror: indices.contains check.)
            if (e.args.length === 1) {
              // ARRAY receivers only — String.getOrNull returns Char? (JS
              // returns a STRING) and .size doesn't exist on String — a
              // SILENT fail. String `.at` warns NAMED (mirror of Swift).
              const atT = inferType(e.callee.object, _kotlinExprInferCtx)
              if (atT.kind === 'string') {
                _emitWarnings.push(
                  `${obj}.at(...): String.at has no Kotlin lowering yet (Char-vs-String mismatch) — emitting the raw call, which fails to compile. Use string slicing or restructure.`,
                )
                break
              }
              const i = argExprs[0]!
              return `${obj}.getOrNull(if ((${i}) < 0) ${obj}.size + (${i}) else (${i}))`
            }
            break
          }
          case 'slice': {
            // JS `arr.slice(start, end?)` / `str.slice(start, end?)`. Kotlin
            // has NO `slice(start, end)` (its `slice` takes a range/indices),
            // so the bare emit is invalid. `drop`/`take` lower uniformly —
            // both `List.drop(n).take(m)` → List and `String.drop(n).take(m)`
            // → String, and both CLAMP like JS (no out-of-range crash):
            //   slice(s, e) → drop(s).take(maxOf(0, e - s))
            //   slice(s)    → drop(s)
            //   slice()     → a copy (toList() for List; the String itself)
            // Negative indices (rare in JS) fall through to the generic emit.
            const sliceObjType = inferType(e.callee.object, _kotlinExprInferCtx)
            const noNegative = e.args.every((a) => a.kind !== 'unary')
            // Negative-index idioms (Kotlin drop/take count from the front):
            //   slice(-m)    → takeLast(m)   (last m)
            //   slice(0, -n) → dropLast(n)   (drop last n)
            const negSlice = classifyNegativeSlice(e.args, (a) => emitKotlinExpr(a, indent))
            if (negSlice) {
              switch (negSlice.kind) {
                case 'last':
                  return `${obj}.takeLast(${negSlice.n})`
                case 'dropLast':
                  return `${obj}.dropLast(${negSlice.n})`
                case 'dropFirstLast':
                  return `${obj}.drop(${negSlice.s}).dropLast(${negSlice.n})`
                case 'suffixDropLast':
                  return `${obj}.takeLast(${negSlice.m}).dropLast(${negSlice.n})`
              }
            }
            if (noNegative) {
              if (e.args.length === 1) return `${obj}.drop(${argExprs[0]!})`
              if (e.args.length === 2) {
                return `${obj}.drop(${argExprs[0]!}).take(maxOf(0, (${argExprs[1]!}) - (${argExprs[0]!})))`
              }
              if (e.args.length === 0) {
                if (sliceObjType.kind === 'string') return obj
                if (sliceObjType.kind === 'array') return `${obj}.toList()`
              }
            }
            break
          }
          case 'findIndex':
            // JS `arr.findIndex(pred)` → Kotlin `indexOfFirst(pred)`
            // (Swift: `firstIndex(where:)`). Kotlin's `String.repeat(n)`
            // already matches JS, so `repeat` needs no Kotlin mapping.
            {
              // 2-param INDEX callback `.findIndex((el, idx) => …)`:
              // `indexOfFirst` takes only the element, so use `withIndex()
              // .firstOrNull { (idx, el) -> … }?.index ?: -1` to keep the JS
              // not-found sentinel + a plain `Int`. Checked BEFORE the 1-arg
              // branch (a 2-param arrow is still one argument).
              const cb = indexedArrayCallback(e.args)
              if (cb) {
                const el = kotlinIdent(cb.params[0]!)
                const idx = kotlinIdent(cb.params[1]!)
                return `(${obj}.withIndex().firstOrNull({ (${idx}, ${el}) ->${emitKotlinIndexedBody(cb, indent, 'firstOrNull')}})?.index ?: -1)`
              }
            }
            if (e.args.length === 1) return `${obj}.indexOfFirst(${argExprs[0]!})`
            break
          case 'replaceAll':
            // JS `str.replaceAll(a, b)` → Kotlin `String.replace(a, b)`
            // (Kotlin's `replace` is replace-ALL — faithful; Swift uses
            // `replacingOccurrences`).
            if (e.args.length === 2) return `${obj}.replace(${argExprs[0]!}, ${argExprs[1]!})`
            break
          case 'replace':
            // JS `str.replace(a, b)` with a STRING pattern replaces only the
            // FIRST occurrence — Kotlin's `replace` replaces every one, so the
            // identical-looking call is the wrong function. `replaceFirst` with
            // String args is the literal, first-only twin.
            //
            // This arm used to be absent on the reasoning that the first-vs-all
            // mismatch made `replace` unmappable. The decision was right and
            // the FALLTHROUGH was not: an unmapped method is emitted verbatim,
            // so `s.replace(a, b)` compiled here and quietly replaced ALL
            // occurrences, while Swift emitted a method that does not exist
            // (`missing argument label 'with:'`) — one target silently wrong,
            // the other uncompilable, and no warning on either. "Deliberately
            // not mapped" only holds if something catches the shape.
            if (e.args.length === 2) {
              return `${obj}.replaceFirst(${argExprs[0]!}, ${argExprs[1]!})`
            }
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
              // Multi-statement comparator — the Comparator lambda COULD
              // take a labeled block, but the Swift side can't (Bool
              // conversion), so both targets warn for cross-target parity
              // (never silent; was the block-body sentinel drop).
              if (cmp!.stmts !== undefined && cmp!.stmts.length > 0) {
                _emitWarnings.push(
                  `.sort with a multi-statement comparator is not lowered — use an expression-body comparator ((a, b) => a - b) or precompute the key.`,
                )
                break
              }
              const ps = cmp!.params.map((p) => kotlinIdent(p)).join(', ')
              const body = emitKotlinExpr(cmp!.body, indent)
              // A JS comparator returns any NUMBER — only its sign matters.
              // Kotlin's `Comparator.compare` must return Int, so the natural
              // `(a, b) => a.price - b.price` over a DOUBLE column emitted a
              // Double where Int was required: a hard compile error, on
              // Kotlin only (Swift converts the difference to the Bool its
              // `sorted(by:)` wants, so it never saw the type). Sorting a
              // ledger by amount is ordinary app code.
              //
              // Convert the sign explicitly when the body is fractional:
              // `Double.compareTo(0.0)` IS the Int sign. Gated on inferred
              // float rather than applied always, because a comparator body
              // need not be numeric at all (`a.name > b.name ? 1 : -1`), and
              // `compareTo(0.0)` would be wrong on those. An Int body keeps
              // the raw difference — same sign, same order, unchanged emit.
              const srcT = inferType(e.callee.object, _kotlinExprInferCtx)
              const elemT = srcT.kind === 'array' ? srcT.element : undefined
              let bodyT: TypeIR = { kind: 'unknown' }
              if (elemT !== undefined) {
                const cmpCtx = {
                  ..._kotlinExprInferCtx,
                  locals: new Map(_kotlinExprInferCtx.locals),
                }
                for (const pn of cmp!.params) cmpCtx.locals.set(pn, elemT)
                bodyT = inferType(cmp!.body, cmpCtx)
              }
              const cmpBody =
                bodyT.kind === 'number' && bodyT.float === true
                  ? `(${body}).compareTo(0.0)`
                  : body
              return `${obj}.sortedWith(Comparator { ${ps} -> ${cmpBody} })`
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
      // Optional call `f?.()` → Kotlin's nullable-function invocation
      // `f?.invoke(args)` (a bare `f?()` is not Kotlin syntax — a nullable
      // function is invoked via `.invoke` under `?.`).
      if (e.optional === true) return `${callee}?.invoke(${args})`
      return `${callee}(${args})`
    }
    case 'index': {
      // `xs[i]` — Kotlin lists share the subscript syntax verbatim. The
      // OPTIONAL form `xs?.[i]` → `getOrNull(i)` (stdlib, single-eval — no
      // re-readability guard needed, unlike the Swift idiom).
      if (e.optional === true) {
        // An optional-typed object (an upstream `?.` chain — `sel?.tags` is
        // `List<String>?`) needs the SAFE call: `?.getOrNull`. Kotlin handles
        // the optional-receiver case fully (nil-propagating + OOB-safe);
        // Swift's idiom can't and warns there.
        const dot =
          exprHasOptionalLink(e.object) ||
          typeIsOptional(inferType(e.object, _kotlinExprInferCtx))
            ? '?.'
            : '.'
        return `${emitKotlinExpr(e.object, indent)}${dot}getOrNull(${emitKotlinExpr(e.index, indent)})`
      }
      return `${emitKotlinExpr(e.object, indent)}[${emitKotlinExpr(e.index, indent)}]`
    }
    case 'member': {
      // v2 (form-binding arc) — per-field dict access on a form
      // container: `form.values.email` → `form.values.value["email"]
      // ?: ""` (the MutableState map needs `.value` + the subscript;
      // `touched` defaults false). Mirror of the Swift rewrite.
      // The WEB API is a CALL: `@pyreon/form` types `values: () => TValues`,
      // so idiomatic shared source reads `form.values().email`. Only the
      // PROPERTY form was lowered, which made a form non-shared in BOTH
      // directions — the web shape emitted uncompilable native code with NO
      // warning, and the shape that did work natively (`form.values.email`)
      // is a type error on web. Unwrap a zero-arg call on the accessor so
      // both lower identically. Additive: the property form is untouched.
      const _formAccessorObj =
        e.object.kind === 'call' && e.object.args.length === 0 && e.object.callee.kind === 'member'
          ? e.object.callee
          : e.object
      // A field read off the onSubmit VALUES param — `values.username` →
      // `values["username"] ?: ""`. Same shape and default as the
      // `form.values().username` rewrite just below; the dictionary simply
      // arrives as a lambda parameter instead of a container property.
      if (
        e.object.kind === 'identifier' &&
        _formSubmitParamsKotlin.includes(e.object.name)
      ) {
        return `(${kotlinIdent(e.object.name)}[${JSON.stringify(e.property)}] ?: "")`
      }
      if (
        _formAccessorObj.kind === 'member' &&
        _formAccessorObj.object.kind === 'identifier' &&
        _formNames.has(_formAccessorObj.object.name) &&
        (_formAccessorObj.property === 'values' ||
          _formAccessorObj.property === 'errors' ||
          _formAccessorObj.property === 'touched')
      ) {
        const dflt = _formAccessorObj.property === 'touched' ? 'false' : '""'
        return `(${kotlinIdent(_formAccessorObj.object.name)}.${_formAccessorObj.property}.value[${JSON.stringify(e.property)}] ?: ${dflt})`
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
        (e.property === 'data' ||
          e.property === 'error' ||
          e.property === 'isPending' ||
          e.property === 'isFetching')
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
      // Phase 5 (M3.7): a useAppState decl's `phase` is Compose MutableState —
      // as is the sticky `wasBackgrounded` flag (the lifecycle-arc device-test
      // surface): both need `.value` or the emitted read renders the
      // MutableState object's toString.
      if (
        e.object.kind === 'identifier' &&
        _appStateNames.has(e.object.name) &&
        (e.property === 'phase' || e.property === 'wasBackgrounded')
      ) {
        return `${kotlinIdent(e.object.name)}.${e.property}.value`
      }
      // Phase 5: native data/services hooks. Each container's reactive fields
      // are Compose `MutableState` (read `.value`); Bool getters
      // (isTracking/isOpen/isAuthenticated/isSigningIn/isRegistered/
      // selectedMarker) + method calls read bare. Swift's @Observable needs
      // no rewrite (handled by the default member emit on that target).
      if (e.object.kind === 'identifier') {
        const obj = e.object.name
        const p = e.property
        const isMutableStateField = isContainerMutableStateField(obj, p)
        if (isMutableStateField) {
          return `${kotlinIdent(obj)}.${kotlinIdent(p)}.value`
        }
      }
      // Optional chaining: `?.` when this link is optional OR its object
      // chain already carried one. Kotlin REQUIRES `?.` on every access
      // after the first optional one (`a?.b.c` → `a?.b?.c`; a plain `.c` on
      // a nullable is a type error) — `chainHasOptional` propagates it.
      const dot = e.optional === true || chainHasOptional(e.object) ? '?.' : '.'
      return `${emitKotlinExpr(e.object, indent)}${dot}${kotlinIdent(e.property)}`
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
      // Exponent (`a ** b`) — Kotlin has no `**` operator; `Math.pow`
      // (java.lang.Math, always on the classpath) is Double-domain. Coerce
      // both operands so an Int base/exponent works; the result is Double
      // (matches JS, where `**` yields a Number).
      if (e.op === '**') {
        return `Math.pow((${bl}).toDouble(), (${br}).toDouble())`
      }
      // JS `+` where EITHER operand is a string is string CONCATENATION.
      // Kotlin's `String.plus(Any?)` coerces a RIGHT-hand non-string
      // (`"n=" + 5` works), but a non-string on the LEFT (`5 + "items"`,
      // `Int.plus(String)`) has no candidate and is a hard type error. Coerce
      // each CONCRETE non-string operand with `.toString()` so the concat is
      // correct regardless of operand order (harmless String+String when the
      // right is already coerced); a purely numeric `+` never enters here and
      // falls through unchanged, and `string + unknown` leaves the unknown be.
      if (
        e.op === '+' &&
        (inferType(e.left, _kotlinExprInferCtx).kind === 'string' ||
          inferType(e.right, _kotlinExprInferCtx).kind === 'string')
      ) {
        const coerce = (sub: ExprIR, emitted: string): string => {
          const k = inferType(sub, _kotlinExprInferCtx).kind
          return k === 'number' || k === 'boolean' ? `(${emitted}).toString()` : emitted
        }
        return `${coerce(e.left, bl)} + ${coerce(e.right, br)}`
      }
      // Bitwise ops — Kotlin has NO bitwise symbols; they're INFIX
      // FUNCTIONS on Int (`a and b`, `a shl 1`, …). Infix functions bind
      // looser than arithmetic, so a compound operand is parenthesized to
      // preserve the JS-parsed grouping (`a & b + c` is `a & (b + c)`).
      const kotlinBitwise: Record<string, string> = {
        '&': 'and',
        '|': 'or',
        '^': 'xor',
        '<<': 'shl',
        '>>': 'shr',
      }
      const infix = kotlinBitwise[e.op]
      if (infix !== undefined) {
        const L = isCompoundExpr(e.left) ? `(${bl})` : bl
        const R = isCompoundExpr(e.right) ? `(${br})` : br
        return `${L} ${infix} ${R}`
      }
      return `${bl} ${e.op} ${br}`
    }
    case 'template': {
      // Template literal → native Kotlin string interpolation
      // `"<quasi>${expr}<quasi>…"`. Always `${…}` (valid for any
      // expression; a bare `$name` only works for a simple identifier).
      // Interpolation coerces any interpoland to String. Quasis are COOKED
      // → re-escaped with control-char additions (a cooked quasi can carry
      // a real newline a single-line literal can't hold raw).
      let s = '"'
      for (let i = 0; i < e.quasis.length; i++) {
        s += escapeKotlinStringSegment(e.quasis[i] ?? '')
        if (i < e.exprs.length) s += `\${${emitKotlinExpr(e.exprs[i]!, indent)}}`
      }
      return s + '"'
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
    case 'unary': {
      // Mirror of the Swift truthiness lowering — JS `!x` / `!!x` on
      // non-Boolean args were SILENT fails ("argument type mismatch").
      if (e.op === '!') {
        const inner = e.argument
        const isDoubleNeg = inner.kind === 'unary' && inner.op === '!'
        const target = isDoubleNeg ? (inner as { argument: ExprIR }).argument : inner
        const tT = inferType(target, _kotlinExprInferCtx)
        const tStr = emitKotlinExpr(target, indent)
        if (tT.kind === 'number') return isDoubleNeg ? `(${tStr} != 0)` : `(${tStr} == 0)`
        if (tT.kind === 'string') return isDoubleNeg ? `(${tStr}).isNotEmpty()` : `(${tStr}).isEmpty()`
        if (tT.kind === 'boolean') return isDoubleNeg ? tStr : `!${emitKotlinExpr(inner, indent)}`
        if (typeIsOptional(tT)) return isDoubleNeg ? `(${tStr} != null)` : `(${tStr} == null)`
      }
      return `${e.op}${emitKotlinExpr(e.argument, indent)}`
    }
    case 'logical':
      // Parser-C: short-circuit logical. Kotlin `&&` / `||` semantics
      // match JS. `??` lowers to the Elvis operator — parenthesized
      // because Elvis binds LOOSER than comparisons (`a ?: b > 0`
      // parses as `a ?: (b > 0)`).
      if (e.op === '??') {
        return `(${emitKotlinExpr(e.left, indent)} ?: ${emitKotlinExpr(e.right, indent)})`
      }
      return `${emitKotlinExpr(e.left, indent)} ${e.op} ${emitKotlinExpr(e.right, indent)}`
    case 'ternary': {
      // Kotlin doesn't have a ternary operator; the idiomatic form is an
      // if-expression. The `if` condition must be `Boolean`; JS treats an
      // OPTIONAL as truthy-when-present (`const t = todos.find(...); t ? a : b`)
      // and `!optional` truthy-when-absent. `kotlinCondition` lowers an optional
      // cond → `<cond> != null` and a `!optional` cond → `<inner> == null`.
      //
      // `opt ? opt.prop : else` → `(opt?.prop ?: else)`. A bare-`val` local
      // smart-casts inside the if-branch, but a `selected()` read is a `by
      // remember { derivedStateOf }` DELEGATED property whose getter can't be
      // smart-cast ("smart cast … impossible … delegated property") — the
      // dominant master-detail shape. Optional-chaining sidesteps it uniformly
      // (and matches the Swift lowering). `optionalMemberTernary` (infer-type.ts
      // — the ONE bisect point) matches any structurally-equal optional cond.
      const omt = optionalMemberTernary(e, _kotlinExprInferCtx)
      if (omt) {
        return `(${emitKotlinExpr(omt.opt, indent)}?.${kotlinIdent(omt.property)} ?: ${emitKotlinExpr(e.otherwise, indent)})`
      }
      const condStr = kotlinCondition(e.cond, (x) => emitKotlinExpr(x, indent))
      let thenStr = emitKotlinExpr(e.then, indent)
      let elseStr = emitKotlinExpr(e.otherwise, indent)
      // Mixed Int/Double branches — Kotlin's `if`-expression does NOT
      // auto-widen (unlike its arithmetic), so `if (b) 1 else 2.5` infers the
      // `{Comparable<*> & Number}` LUB rather than Double. Coerce the Int
      // branch `.toDouble()` when its sibling is Double so the whole
      // expression is a genuine Double (parity with the Swift emit, which the
      // shared inferType now annotates Double). Only fires when exactly one
      // branch is a non-float number and the other is a float number.
      {
        const tt = inferType(e.then, _kotlinExprInferCtx)
        const ot = inferType(e.otherwise, _kotlinExprInferCtx)
        const tf = tt.kind === 'number' ? (tt.float === true ? 'double' : 'int') : 'other'
        const of = ot.kind === 'number' ? (ot.float === true ? 'double' : 'int') : 'other'
        if (tf === 'double' && of === 'int') elseStr = `(${elseStr}).toDouble()`
        else if (tf === 'int' && of === 'double') thenStr = `(${thenStr}).toDouble()`
      }
      return `if (${condStr}) ${thenStr} else ${elseStr}`
    }
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
    case 'arrow': {
      // A BLOCK body carries `stmts` — mirror of the Swift plain-path fix
      // (the sentinel `""` silently dropped multi-statement 1-param
      // callbacks). Kotlin lambdas return the LAST expression; explicit
      // `return` inside a lambda needs a label — emitKotlinStatement's
      // return handling covers the shapes the statement parser produces.
      if (e.stmts !== undefined && e.stmts.length > 0) {
        // A body containing RETURN statements needs Kotlin's labeled-return
        // form (`return@filter`), and the generic arrow emit can't know its
        // enclosing method label (only call sites can — the indexed path
        // threads it via emitKotlinIndexedBody). Return-free bodies are
        // safe: a Kotlin lambda yields its LAST expression. Return-bearing
        // bodies get a NAMED warning (previously a SILENT sentinel drop) —
        // the labeled-callback call-site wiring is the tracked follow-up.
        const hasReturn = JSON.stringify(e.stmts).includes('"kind":"return"')
        if (hasReturn) {
          _emitWarnings.push(
            `a multi-statement callback with early returns is not lowered on Kotlin at this call site yet (labeled-return wiring) — the body was DROPPED; restructure as an expression body or a single trailing value.`,
          )
          return `{ ${e.params.map(kotlinIdent).join(', ')} -> Unit }`
        }
        const pad = ' '.repeat(indent + 2)
        const saved = seedHandlerLocals(e.stmts, _kotlinExprInferCtx)
        const stmtCtx: KotlinCtx = { synthesizedDataClasses: [], componentName: '' }
        const lines = e.stmts.map((st) => pad + emitKotlinStatement(st, indent + 2, stmtCtx)).join('\n')
        _kotlinExprInferCtx.locals = saved
        const params = e.params.length > 0 ? `${e.params.map(kotlinIdent).join(', ')} ->` : ''
        return `{ ${params}\n${lines}\n${' '.repeat(indent)}}`
      }
      if (e.params.length === 0) return `{ ${emitKotlinExpr(e.body, indent)} }`
      return `{ ${e.params.map(kotlinIdent).join(', ')} -> ${emitKotlinExpr(e.body, indent)} }`
    }
    case 'new-sized-map': {
      // Mirror of the Swift emit; Kotlin spells named arguments with `=`.
      const lru = e.lru ? ', lru = true' : ''
      return `PyreonSizedMap<${kotlinType(e.keyType)}, ${kotlinType(e.valueType)}>(maxEntries = ${e.maxEntries}${lru})`
    }
    case 'new-collection': {
      // Mirror of the Swift emit. `val` is fine on Kotlin (the reference is
      // final; contents mutate through it).
      if (e.collection === 'map') {
        return `mutableMapOf<${kotlinType(e.keyType!)}, ${kotlinType(e.valueType!)}>()`
      }
      if (e.seed !== undefined) return `(${emitKotlinExpr(e.seed, indent)}).toMutableSet()`
      return `mutableSetOf<${kotlinType(e.elementType!)}>()`
    }
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
      // A TYPED-EMPTY array (`[] as T[]` → `elementType` set) emits a typed empty
      // literal so Kotlin can infer the element type (a bare `listOf()` is
      // `List<Nothing>`, which breaks a downstream `+ listOf(x)` / element read).
      if (e.elements.length === 0 && e.elementType !== undefined) {
        return `emptyList<${kotlinType(e.elementType)}>()`
      }
      // Array spread → Kotlin `+` concat (value-semantics). General form, ANY
      // position / count of spreads: emit each SPREAD's argument bare and group
      // consecutive NON-spread elements into a `listOf(...)`, then join with
      // ` + `:
      //   [...a, ...b]    → a + b
      //   [...a, 9]       → (a + listOf(9))
      //   [9, ...a]       → (listOf(9) + a)
      //   [...a, 9, ...b] → (a + listOf(9) + b)
      //   [...a]          → a
      // Parenthesised for ≥2 parts so a method on the literal binds to the
      // whole concat (`[...a, ...b].map { … }` → `(a + b).map { … }`, not the
      // pre-fix `a + listOf(b).map { … }` which both wrapped b — a kotlinc
      // "cannot infer type R" — AND would only map the tail). Mirror of the
      // Swift array-spread fix.
      const spreadConcat = buildArraySpreadConcat(
        e.elements,
        (el) => emitKotlinExpr(el, indent),
        (r) => `listOf(${r})`,
      )
      if (spreadConcat !== null) return spreadConcat
      return `listOf(${e.elements.map((el) => emitKotlinExpr(el, indent)).join(', ')})`
    }
    case 'spread':
      // A bare spread node reaching the expr emitter is a CALL-ARGUMENT
      // spread (`f(...xs)` / `o.h(...xs)`). Every legitimate spread
      // consumer — array-literal concat (`[...a, x]` → `a + listOf(x)`),
      // object partial-update (`{...t, b}` → `.copy(...)`), and
      // `Math.max(...arr)` / `Math.min(...arr)` — extracts its spread
      // BEFORE emitting, so it never routes through here. A call-arg
      // spread has no faithful native lowering (Kotlin calls take a fixed
      // argument list, not a variadic spread) — degrading to the bare
      // argument silently passed the LIST as one scalar arg (`f(xs)`), an
      // uncompilable mis-emit. Mirror of the Swift emitter's guard; the
      // emitter is the correct layer to warn (parse can't tell a call-arg
      // spread from an array-element spread — both are `SpreadElement`).
      _emitWarnings.push(
        'Spread arguments (`f(...args)`) aren\'t supported in native (PMTC) — a Swift/Kotlin call takes a fixed argument list, not a variadic spread. Pass arguments explicitly, e.g. `f(a, b)`.',
      )
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
        // No declared data class matches — SYNTHESIZE one for an all-scalar-
        // literal object (`{ id: 1, name: 'a' }`) instead of the broken
        // `(field = value)` tuple emit (tuple key-paths break `items.map { it.id }`
        // / can't go through a Saver). Non-literal / nested fields keep the
        // tuple emit below (unchanged). Shared helper → names match Swift.
        const synthName = synthLiteralStructName(
          e.fields,
          _synthExprStructs,
          _synthExprStructKeys,
          (ex) => inferType(ex, _kotlinExprInferCtx),
        )
        if (synthName !== null) {
          const args = e.fields
            .map((f) => `${f.name} = ${emitKotlinExpr(f.value, indent)}`)
            .join(', ')
          return `${kotlinIdent(synthName)}(${args})`
        }
        // Last resort before the (INVALID-Kotlin) tuple: match an
        // already-synthesized struct by field-NAME-set. `synthLiteralStructName`
        // keys on field name:TYPE, so it bails when a field value is a
        // body-local the emit-time inferCtx can't type — the dominant
        // "add an item" shape `todos.set([...todos(), { id: 3, text, done:
        // false }])` (where `text` is a `const` in the handler body). The field
        // NAMES still uniquely identify the struct synthesized for the signal's
        // initial value, so reuse it — otherwise Kotlin emitted the bogus
        // `(id = 3, text = text, done = false)` (named-args with no constructor),
        // while Swift's equivalent fallback is a VALID labelled tuple, so only
        // Kotlin broke. Reuses the SAME `__ObjN` the initial value used → no
        // struct-name mismatch.
        const fieldNames = e.fields.map((f) => f.name).slice().sort().join(',')
        const byNames = _synthExprStructs.find(
          (s) => s.fields.map((f) => f.name).slice().sort().join(',') === fieldNames,
        )
        if (byNames !== undefined) {
          const args = e.fields
            .map((f) => `${f.name} = ${emitKotlinExpr(f.value, indent)}`)
            .join(', ')
          return `${kotlinIdent(byNames.name)}(${args})`
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

  // @pyreon/elements `<Element>` → the canonical `<Stack>` (mirror of the Swift
  // dispatcher). Unlocks the whole ui-system (rocketstyle over Element).
  if (tag === 'Element' && canAliasIntercept(tag, '@pyreon/elements')) return emitKotlinJsx(elementToStack(e), indent)

  // @pyreon/ui-core `<PyreonUI>` — a TRANSPARENT wrapper on native (theme is
  // compile-time-resolved; dark mode is a system read). Render children directly
  // (mirror the jsx-fragment `Column {…}`). Swift-dispatcher parity.
  if ((tag === 'PyreonUI' || tag === 'PyreonUIProvider') && canAliasIntercept(tag, '@pyreon/ui-core')) {
    const p = ' '.repeat(indent + 2)
    return `Column {\n${e.children.map((c) => p + emitKotlinChild(c, indent + 2)).join('\n')}\n${' '.repeat(indent)}}`
  }

  // @pyreon/toast `<Toaster />` → a native overlay over the reactive PyreonToast
  // queue. Reading `PyreonToast.toasts.value` (Compose MutableState) subscribes
  // this composable, so it recomposes as toasts appear/expire. v1: a Column of
  // the active messages; positioning/styling/animation are a follow-up. Swift
  // dispatcher parity.
  if (tag === 'Toaster' && canAliasIntercept(tag, '@pyreon/toast')) {
    const p = ' '.repeat(indent + 2)
    const pi = ' '.repeat(indent + 4)
    return (
      `Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {\n` +
      `${p}PyreonToast.toasts.value.forEach { __toast ->\n` +
      `${pi}Text(text = __toast.message)\n` +
      `${p}}\n` +
      `${' '.repeat(indent)}}`
    )
  }

  // @pyreon/coolgrid — Container → vertical Stack, Row → horizontal Stack, Col →
  // an EQUAL-fill child (Modifier.weight(1f), valid in the Row scope; a
  // fractional `size` warns). Swift-dispatcher parity.
  if ((tag === 'Container' || tag === 'Row') && canAliasIntercept(tag, '@pyreon/coolgrid')) return emitKotlinJsx(coolgridToStack(e), indent)
  if (tag === 'Col' && canAliasIntercept(tag, '@pyreon/coolgrid')) {
    const p = ' '.repeat(indent)
    // The test id rides the SIZED node (the Box), not the inner stack — see
    // colToStack's `dropTestId`. The id is emitted here as part of the Box's
    // modifier chain so exactly one node carries it.
    const colTestId = readStaticAttrKotlin(e, 'data-testid')
    const idMod = typeof colTestId === 'string' ? `.testTag(${JSON.stringify(colTestId)})` : ''
    const inner = `${' '.repeat(indent + 2)}${emitKotlinJsx(colToStack(e, true), indent + 2)}`
    const size = colSizeLiteral(e)
    if (size !== null) {
      // A 12-column span lowers to RowScope `weight`, NOT `fillMaxWidth(n/12)`.
      // Device-found: a Row measures each child against the REMAINING width, so
      // fractional fills compound — 3/12 then 9/12 yields 25% + 56%, and the row
      // never adds up. `weight(3f)` + `weight(9f)` divides the row exactly, which
      // is what a grid means and what the Swift twin's
      // `containerRelativeFrame(count:span:)` already did.
      return `Box(modifier = Modifier.weight(${size}f)${idMod}) {\n${inner}\n${p}}`
    }
    if (colHasExplicitSize(e)) {
      // A responsive / non-literal `size` can't resolve to a static span → equal.
      _emitWarnings.push(
        `<Col size=…>: only a LITERAL integer span lowers to a fractional width; ` +
          `a responsive ({ xs, md } / [a,b]) or non-literal size lowers as an EQUAL column.`,
      )
    }
    return `Box(modifier = Modifier.weight(1f)${idMod}) {\n${inner}\n${p}}`
  }

  // styled(Prim)`css` — rewrite `<X>` to `<Prim>` + the captured CSS as a
  // synthetic `style` attr, then re-enter the dispatch; the inline-style
  // connector (emitKotlinLayoutModifier → styleToNativeModifiers) lowers it
  // unchanged. Mirror of the Swift dispatcher's styled hook.
  const styled = _styledComponents.get(tag)
  if (styled !== undefined) {
    return emitKotlinJsx(
      {
        ...e,
        tag: styled.tag,
        attrs: [{ kind: 'attr', name: 'style', value: styled.styleObject }, ...e.attrs],
      },
      indent,
    )
  }

  // rocketstyle(…) — resolve state/size/variant → merge base ∪ dims → strip the
  // consumed dim attrs → rewrite to `<Prim style={merged}>`. Mirror of Swift.
  const rkt = _rocketstyleComponents.get(tag)
  if (rkt !== undefined) {
    const dimNames = Object.keys(rkt.dims)
    const merged = resolveRocketstyleUseSite(
      rkt,
      (d) => {
        const v = readStaticAttrKotlin(e, d)
        return typeof v === 'string' ? v : undefined
      },
      (d) => {
        const a = e.attrs.find(
          (x): x is Extract<AttrIR, { kind: 'attr' }> => x.kind === 'attr' && x.name === d,
        )
        return a?.value
      },
      (msg) => _emitWarnings.push(msg),
    )
    const rest = e.attrs.filter(
      (a) => !(a.kind === 'attr' && dimNames.includes(a.name)),
    )
    return emitKotlinJsx(
      { ...e, tag: rkt.tag, attrs: [{ kind: 'attr', name: 'style', value: merged }, ...rest] },
      indent,
    )
  }

  // attrs({component: Prim}).attrs({…}) — rewrite to `<Prim …use-site …defaults>`
  // (use-site wins), then re-enter dispatch. Swift-dispatcher parity.
  const attrsComp = _attrsComponents.get(tag)
  if (attrsComp !== undefined) {
    const useSite = new Set(
      e.attrs.filter((a) => a.kind === 'attr').map((a) => (a as Extract<AttrIR, { kind: 'attr' }>).name),
    )
    const defaults = attrsComp.defaultAttrs
      .filter((d) => !useSite.has(d.name))
      .map((d) => ({ kind: 'attr' as const, name: d.name, value: d.value }))
    return emitKotlinJsx({ ...e, tag: attrsComp.tag, attrs: [...e.attrs, ...defaults] }, indent)
  }

  // Mirror of the Swift dispatcher's spread guard. A spread (`<Stack
  // {...cfg()}>`) lowers to native ONLY on a USER component (expanded
  // against its declared props at the call — see expandKotlinSpread). On
  // a canonical primitive / control-flow tag a Compose composable takes
  // fixed layout args, not a runtime prop-bag, so the spread's props
  // would be SILENTLY DROPPED. Warn loudly. One guard here covers every
  // dedicated emitter AND the emitKotlinGeneric fallthrough.
  if (!_componentNames.has(tag) && e.attrs.some((a) => a.kind === 'spread')) {
    _emitWarnings.push(
      `<${tag} {...}> spread is not lowered to native — its props are DROPPED (a runtime prop-bag can't apply to a static Compose composable). Pass props explicitly, e.g. <${tag} gap="md" padding={4}>.`,
    )
  }

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
  if (tag === 'Video') return emitKotlinVideo(e, indent)
  if (tag === 'Modal') return emitKotlinModal(e, indent)
  if (tag === 'Press') return emitKotlinPress(e, indent)
  if (tag === 'Field') return emitKotlinField(e, indent)
  if (tag === 'Toggle') return emitKotlinToggle(e, indent)
  if (tag === 'Link') return emitKotlinLink(e, indent)
  if (tag === 'PermissionsProvider') return emitKotlinPermissionsProvider(e, indent)
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
  // Typography (fontSize/fontWeight/color/textAlign/fontStyle) in a Text's
  // style object → Text() CONSTRUCTOR ARGS (Compose has no text modifier); the
  // REST of the style (background/padding/border) still flows through the
  // layout modifier.
  const styleAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === 'style',
  )
  let typoArgs = ''
  let eForMod = e
  if (styleAttr !== undefined) {
    // `target: 'kotlin'` also unpacks a REACTIVE colour (a two-literal-branch
    // ternary, which is what a rocketstyle dimension flip on a <Text> resolves
    // to). Compose has no text-colour modifier, so without this it fell through
    // to the container path and was DROPPED with a warning — while Swift's
    // `.foregroundColor` handled it, making the same source render a coloured
    // badge on iOS and an uncoloured one on Android.
    const { typo, rest } = extractTextTypography(styleAttr.value, 'kotlin')
    typoArgs = kotlinTextTypographyArgs(typo, (c) => emitKotlinExpr(c, 0))
    eForMod = { ...e, attrs: e.attrs.map((a) => (a === styleAttr ? { ...a, value: rest } : a)) }
  }
  const mod = emitKotlinLayoutModifier(eForMod)
  const modArg = mod === '' ? '' : `, modifier = ${mod}`
  // `truncate` — see the Swift mirror. Compose needs BOTH: `maxLines` alone
  // clips mid-glyph, `overflow` alone has no line bound to overflow past.
  const truncArgs =
    readStaticAttrKotlin(e, 'truncate') === true
      ? `, maxLines = 1, overflow = TextOverflow.Ellipsis`
      : ''
  // Custom font → fontFamily = pyreonFont("<resource-name>") — a
  // runtime res/font lookup (PyreonAssets.kt), so no PostScript map is
  // needed on Android (Compose loads the font file directly).
  const font = readStaticAttrKotlin(e, 'font')
  const fontArg =
    typeof font === 'string'
      ? `, fontFamily = pyreonFont(${JSON.stringify(sanitizeKotlinFontName(font))})`
      : ''
  if (e.children.length === 0) return `Text(text = ""${typoArgs}${fontArg}${truncArgs}${modArg})`
  if (e.children.length === 1 && e.children[0]!.kind === 'text') {
    return `Text(text = ${JSON.stringify(e.children[0]!.value)}${typoArgs}${fontArg}${truncArgs}${modArg})`
  }
  const parts: string[] = []
  for (const c of e.children) {
    if (c.kind === 'text') {
      parts.push(escapeKotlinInterp(c.value))
      continue
    }
    // Unwrap a zero-arg accessor arrow so `{() => `Hi ${n}`}` still hits the
    // template fast-path below (and `{() => sig()}` the value path) — see
    // kotlinInterpSegment.
    const childExpr = resolveAccessorChild(c.expr)
    if (childExpr.kind === 'template') {
      // Splice a template child's segments directly into the Text's own
      // interpolation so `<Text>{`Hi ${n}`}</Text>` emits `Text(text = "Hi
      // ${n}")` — not the redundant `Text(text = "${"Hi ${n}"}")`.
      const t = childExpr
      for (let i = 0; i < t.quasis.length; i++) {
        parts.push(escapeKotlinStringSegment(t.quasis[i] ?? ''))
        if (i < t.exprs.length) parts.push(`\${${emitKotlinExpr(t.exprs[i]!, indent)}}`)
      }
    } else {
      parts.push(kotlinInterpSegment(childExpr, indent))
    }
  }
  return `Text(text = "${parts.join('')}"${typoArgs}${fontArg}${truncArgs}${modArg})`
}

/**
 * Interpolation segment for a VALUE expression inside a Text string. An
 * OPTIONAL-typed expr (an optional prop, a `.find` result) renders EMPTY
 * when null — matching JSX, where `{undefined}` renders nothing — instead
 * of Kotlin's literal `"null"`. Mirror of emit-swift's
 * `swiftInterpSegment`.
 */
function kotlinInterpSegment(e: ExprIR, indent: number): string {
  // Unwrap a zero-arg accessor arrow FIRST — `<Text>{() => sig()}</Text>`
  // arrives as an arrow and would otherwise emit `${{ sig }}` (a Kotlin lambda
  // in the string template), which renders the lambda's toString at runtime.
  // Same unwrap the `<Show when>` / modifier paths apply; unwrapping before
  // inferType also fixes optional inference (an arrow's type is never optional).
  const expr = resolveAccessorChild(e)
  const emitted = emitKotlinExpr(expr, indent)
  if (typeIsOptional(inferType(expr, _kotlinExprInferCtx))) {
    return `\${${emitted} ?: ""}`
  }
  return `\${${emitted}}`
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
      // Seed handler-LOCAL `const`/`let` types into the infer ctx so a later
      // type-dependent emit inside this body resolves them — e.g. `const t =
      // todos.find(…); if (t) { … }` now lowers to `if (t != null)`. Restored
      // after (scoped to this body, re-entrant-safe). Mirror of the Swift side.
      const savedLocals = seedHandlerLocals(handler.stmts, _kotlinExprInferCtx)
      // M4.5: an `async () => { await … }` handler wraps its body in
      // `pyreonAsyncScope.launch { … }` (the hoisted rememberCoroutineScope())
      // so a synchronous `onClick: () -> Unit` slot can run suspend calls.
      const isAsync = handler.async === true
      const bodyIndent = isAsync ? indent + 4 : indent + 2
      const bodyPad = ' '.repeat(bodyIndent)
      const lines = handler.stmts
        .map((s) => bodyPad + emitKotlinStatement(s, bodyIndent, stmtCtx))
        .join('\n')
      _kotlinExprInferCtx.locals = savedLocals
      const head =
        handler.params.length === 0 ? '{' : `{ ${handler.params.map(kotlinIdent).join(', ')} ->`
      if (isAsync) {
        _hasAsyncHandler = true
        return `${head}\n${pad}${PYREON_ASYNC_SCOPE}.launch {\n${lines}\n${pad}}\n${' '.repeat(indent)}}`
      }
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
    // M4.5: single-expression async handler (`async () => await x.method()`)
    // still needs the `pyreonAsyncScope.launch { … }` coroutine scope.
    if (handler.params.length === 0) {
      if (handler.async === true) {
        _hasAsyncHandler = true
        return `{ ${PYREON_ASYNC_SCOPE}.launch { ${emitKotlinExpr(handler.body, indent)} } }`
      }
      return `{ ${emitKotlinExpr(handler.body, indent)} }`
    }
    const paramList = handler.params.map(kotlinIdent).join(', ')
    if (handler.async === true) {
      _hasAsyncHandler = true
      return `{ ${paramList} -> ${PYREON_ASYNC_SCOPE}.launch { ${emitKotlinExpr(handler.body, indent)} } }`
    }
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
  // `by` keying — mirror of the Swift resolver: identity ((n) => n) →
  // `key = { it }`; member ((i) => i.id) → `key = { it.id }`; anything else →
  // NAMED warning + the `it.id` fallback (never a silent mis-emit).
  let kotlinKey = 'it.id'
  if (by && by.value.kind === 'arrow') {
    const b = by.value
    if (b.body !== undefined && b.body.kind === 'identifier' && b.params[0] === b.body.name) {
      kotlinKey = 'it'
    } else if (b.body !== undefined && b.body.kind === 'member') {
      kotlinKey = `it.${b.body.property}`
    } else {
      _emitWarnings.push(
        `<For by={…}>: only an identity key ((x) => x) or a member key ((x) => x.field) lowers to a Compose items() key — this by-callback matches neither; emitting key = { it.id } which likely fails to compile. Key on a field or the element itself.`,
      )
    }
  }
  const idPath = kotlinKey

  if (!renderArrow || renderArrow.expr.kind !== 'arrow') {
    return `LazyColumn {\n${' '.repeat(indent + 2)}items(${items}, key = { ${idPath} }) {}\n${' '.repeat(indent)}}`
  }
  const arrow = renderArrow.expr as Extract<ExprIR, { kind: 'arrow' }>
  const param = arrow.params[0] ?? 'item'
  const body = arrow.body
  const pad = ' '.repeat(indent + 4)
  const close = ' '.repeat(indent + 2)
  const outerClose = ' '.repeat(indent)
  // Field-array items source → the render param's `value()` reads unwrap
  // to `.value` inside this body (stack — nested Fors restore correctly).
  const isFieldArrayItems =
    each !== undefined &&
    ((each.value.kind === 'call' &&
      each.value.callee.kind === 'member' &&
      each.value.callee.object.kind === 'identifier' &&
      _fieldArrayNamesKotlin.has(each.value.callee.object.name) &&
      each.value.callee.property === 'items') ||
      (each.value.kind === 'member' &&
        each.value.object.kind === 'identifier' &&
        _fieldArrayNamesKotlin.has(each.value.object.name) &&
        each.value.property === 'items'))
  if (isFieldArrayItems) _fieldArrayItemParamsKotlin.push(param)
  const bodyText = emitKotlinExpr(body, indent + 4)
  if (isFieldArrayItems) _fieldArrayItemParamsKotlin.pop()
  return (
    `LazyColumn {\n` +
    `${' '.repeat(indent + 2)}items(${items}, key = { ${idPath} }) { ${param} ->\n` +
    `${pad}${bodyText}\n` +
    `${close}}\n` +
    `${outerClose}}`
  )
}

function emitKotlinShow(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const when = e.attrs.find((a) => a.kind === 'attr' && a.name === 'when') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  // Same optional-truthiness lowering as the ternary / `&&`: `<Show when={t}>`
  // where `t` is NULLABLE → `if (t != null) { … }` (and `when={!t}` → `if (t ==
  // null) { … }`), not the bare `if (t)`. Uses the accessor-aware
  // `emitKotlinSignalRead` as the operand emitter.
  const whenExpr = when ? unwrapAccessorArrow(when.value) : undefined
  const cond = whenExpr ? kotlinCondition(whenExpr, emitKotlinSignalRead) : 'true'
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

/** CSS-easing → Compose Easing constant. The CSS names map onto Compose's
 * canonical curves: ease-in (accelerate) → FastOutLinearInEasing, ease-out
 * (decelerate) → LinearOutSlowInEasing, ease-in-out → FastOutSlowInEasing
 * (also the no-easing default when a duration is set — CSS's `ease`
 * analog), linear → LinearEasing. */
function kotlinEasingFor(easing: string | undefined): string {
  return easing === 'linear'
    ? 'LinearEasing'
    : easing === 'ease-in'
      ? 'FastOutLinearInEasing'
      : easing === 'ease-out'
        ? 'LinearOutSlowInEasing'
        : 'FastOutSlowInEasing'
}


/**
 * Map a `<Transition name>` to Compose enter/exit transitions — the Kotlin
 * mirror of `swiftTransitionForName`.
 *
 * `name` is the Vue-style prop `@pyreon/runtime-dom`'s Transition already
 * honours on the web, and `@pyreon/kinetic` ships presets under the same
 * vocabulary, so an author writes it once and each target resolves it
 * natively. Before this the emit ignored `name` and every transition became a
 * fade — an authored slide-up ran as a fade on device, silently.
 *
 * An UNKNOWN name falls back to fade, which is the previous behaviour: a
 * custom CSS animation has no native translation, and a fade beats refusing
 * to compile.
 *
 * Returns the enter/exit EXPRESSIONS; the caller composes the spec so the
 * duration/easing plumbing stays in one place.
 */
function kotlinTransitionForName(
  name: string | undefined,
  spec: string,
): { enter: string; exit: string } {
  const fade = { enter: `fadeIn(animationSpec = ${spec})`, exit: `fadeOut(animationSpec = ${spec})` }
  // Accept BOTH spellings. `@pyreon/kinetic` names its presets in camelCase
  // (`slideUp`, `scaleIn`) while the CSS-class convention on the web is
  // kebab-case (`slide-up`), and an author reaches for whichever vocabulary
  // they are already holding. Matching only one meant `name="slideUp"`
  // silently fell back to a FADE -- the exact bug this mapping exists to fix,
  // re-entering through a spelling.
  const key = name?.toLowerCase().replace(/[-_]/g, '')
  switch (key) {
    case 'scale':
    case 'scalein':
      return {
        enter: `fadeIn(animationSpec = ${spec}) + scaleIn(animationSpec = ${spec})`,
        exit: `fadeOut(animationSpec = ${spec}) + scaleOut(animationSpec = ${spec})`,
      }
    // `{ it }` is the full height/width, so the content travels its own size.
    // A "slide-up" rises INTO place, which in Compose is a positive initial
    // offset on the vertical axis.
    case 'slideup':
      return {
        enter: `slideInVertically(animationSpec = ${spec}) { it } + fadeIn(animationSpec = ${spec})`,
        exit: `slideOutVertically(animationSpec = ${spec}) { it } + fadeOut(animationSpec = ${spec})`,
      }
    case 'slidedown':
      return {
        enter: `slideInVertically(animationSpec = ${spec}) { -it } + fadeIn(animationSpec = ${spec})`,
        exit: `slideOutVertically(animationSpec = ${spec}) { -it } + fadeOut(animationSpec = ${spec})`,
      }
    case 'slideleft':
      return {
        enter: `slideInHorizontally(animationSpec = ${spec}) { it } + fadeIn(animationSpec = ${spec})`,
        exit: `slideOutHorizontally(animationSpec = ${spec}) { it } + fadeOut(animationSpec = ${spec})`,
      }
    case 'slideright':
      return {
        enter: `slideInHorizontally(animationSpec = ${spec}) { -it } + fadeIn(animationSpec = ${spec})`,
        exit: `slideOutHorizontally(animationSpec = ${spec}) { -it } + fadeOut(animationSpec = ${spec})`,
      }
    default:
      return fade
  }
}

function emitKotlinTransition(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const show = e.attrs.find((a) => a.kind === 'attr' && a.name === 'show') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const cond = show ? emitKotlinSignalRead(unwrapAccessorArrow(show.value)) : 'true'
  // Animation CONFIG (v1) — mirror of the Swift emitter: `duration` (ms,
  // static literal) + `easing`. Absent props emit the byte-identical bare
  // AnimatedVisibility shipped since M2.7; a configured one gets explicit
  // fade specs (`fadeIn/fadeOut(tween(ms, easing = …))` — tween is the
  // Compose analog of a CSS timing function).
  const durRaw = readStaticAttrKotlin(e, 'duration')
  const easeRaw = readStaticAttrKotlin(e, 'easing')
  const durAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'duration')
  if (durAttr !== undefined && typeof durRaw !== 'number') {
    _emitWarnings.push(
      `<Transition duration>: must be a static number of milliseconds; got a non-literal — falling back to the default animation.`,
    )
  }
  const duration = typeof durRaw === 'number' ? durRaw : undefined
  const easing = typeof easeRaw === 'string' ? easeRaw : undefined
  // ASYMMETRIC timing — mirror of the Swift twin. Compose already takes
  // SEPARATE enter/exit specs, so this is a per-side spec rather than a
  // different transition shape.
  const enterDurRaw = readStaticAttrKotlin(e, 'enterDuration')
  const leaveDurRaw = readStaticAttrKotlin(e, 'leaveDuration')
  const enterEaseRaw = readStaticAttrKotlin(e, 'enterEasing')
  const leaveEaseRaw = readStaticAttrKotlin(e, 'leaveEasing')
  for (const [name, raw] of [
    ['enterDuration', enterDurRaw],
    ['leaveDuration', leaveDurRaw],
  ] as const) {
    if (
      e.attrs.some((a) => a.kind === 'attr' && a.name === name) &&
      typeof raw !== 'number'
    ) {
      _emitWarnings.push(
        `<Transition ${name}>: must be a static number of milliseconds; got a non-literal — falling back to the symmetric duration.`,
      )
    }
  }
  const enterDur = typeof enterDurRaw === 'number' ? enterDurRaw : undefined
  const leaveDur = typeof leaveDurRaw === 'number' ? leaveDurRaw : undefined
  const enterEase = typeof enterEaseRaw === 'string' ? enterEaseRaw : undefined
  const leaveEase = typeof leaveEaseRaw === 'string' ? leaveEaseRaw : undefined
  const asymmetric =
    enterDur !== undefined ||
    leaveDur !== undefined ||
    enterEase !== undefined ||
    leaveEase !== undefined
  const pad = ' '.repeat(indent + 2)
  const body = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  const nameRaw = readStaticAttrKotlin(e, 'name')
  const transitionName = typeof nameRaw === 'string' ? nameRaw : undefined
  if (duration === undefined && easing === undefined && !asymmetric) {
    // No animation config AND no name → the byte-identical default shape that
    // has shipped since M2.7. A name opts into an explicit enter/exit pair.
    if (transitionName === undefined) {
      return `AnimatedVisibility(visible = ${cond}) {\n${body}\n${' '.repeat(indent)}}`
    }
    const dflt = `tween(durationMillis = 300, easing = ${kotlinEasingFor(undefined)})`
    const t = kotlinTransitionForName(transitionName, dflt)
    return (
      `AnimatedVisibility(visible = ${cond}, enter = ${t.enter}, exit = ${t.exit}) {\n` +
      `${body}\n${' '.repeat(indent)}}`
    )
  }
  if (asymmetric) {
    const enterSpec = `tween(durationMillis = ${enterDur ?? duration ?? 300}, easing = ${kotlinEasingFor(enterEase ?? easing)})`
    const exitSpec = `tween(durationMillis = ${leaveDur ?? duration ?? 300}, easing = ${kotlinEasingFor(leaveEase ?? easing)})`
    return (
      `AnimatedVisibility(visible = ${cond}, enter = ${kotlinTransitionForName(transitionName, enterSpec).enter}, exit = ${kotlinTransitionForName(transitionName, exitSpec).exit}) {\n` +
      `${body}\n${' '.repeat(indent)}}`
    )
  }
  const spec = `tween(durationMillis = ${duration ?? 300}, easing = ${kotlinEasingFor(easing)})`
  return (
    `AnimatedVisibility(visible = ${cond}, enter = ${kotlinTransitionForName(transitionName, spec).enter}, exit = ${kotlinTransitionForName(transitionName, spec).exit}) {\n` +
    `${body}\n${' '.repeat(indent)}}`
  )
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
 * Read an attr as an emitted Kotlin STRING EXPRESSION — the dynamic
 * companion to `readStaticAttrKotlin` for string-slot modifiers
 * (`Modifier.testTag(...)` / `semantics { contentDescription = ... }`
 * accept any String expr). A literal / resolvable const emits the
 * quoted literal; a TEMPLATE emits the native interpolated string; any
 * other expression interpolates (`"${expr}"` — matches JS string
 * coercion). Pre-fix these attrs were static-only, so a dynamic
 * testid/label (`data-testid={\`row-\${i}\`}`) was SILENTLY DROPPED —
 * the a11y/e2e-critical shape inside For rows. Mirror of emit-swift's
 * `readStringAttrExpr`.
 */
function readStringAttrExprKotlin(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  name: string,
  indent: number,
): string | undefined {
  const stat = readStaticAttrKotlin(e, name)
  if (stat !== undefined) return JSON.stringify(String(stat))
  for (const a of e.attrs) {
    if (a.kind === 'attr' && a.name === name) {
      if (a.value.kind === 'template') return emitKotlinExpr(a.value, indent)
      return `"\${${emitKotlinExpr(a.value, indent)}}"`
    }
  }
  return undefined
}

/**
 * Resolve a STYLING attr to emitted Kotlin source — mirror of
 * emit-swift's `swiftStylingValue`. Static → resolved token; TERNARY OF
 * TWO LITERALS → `(if (cond) 8 else 16)` with both branches
 * compile-resolved; other dynamic → NAMED warning + undefined (pre-fix
 * the whole modifier was SILENTLY dropped).
 */
function kotlinStylingValue(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  name: string,
  resolve: (v: string | number) => string | number,
): string | undefined {
  const stat = readStaticAttrKotlin(e, name)
  if (typeof stat === 'number' || typeof stat === 'string') return String(resolve(stat))
  const dyn = classifyDynamicStylingAttr(e, name)
  if (dyn.kind === 'ternary') {
    const cond = kotlinCondition(dyn.cond, (x) => emitKotlinExpr(x, 0))
    return `(if (${cond}) ${resolve(dyn.a)} else ${resolve(dyn.b)})`
  }
  if (dyn.kind === 'dynamic') {
    _emitWarnings.push(
      `<${e.tag} ${name}={…}>: styling tokens resolve at COMPILE time — a fully-dynamic ${name} has no native lowering (it was silently dropped before). Use a fixed token, or a ternary of two literal tokens (${name}={cond ? "sm" : "lg"}).`,
    )
  }
  return undefined
}

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
        // Component-scope const (set per emitKotlinComponent).
        const compResolved = _componentConstMapKotlin.get(a.value.name)
        if (compResolved !== undefined) return compResolved
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
  const padding = kotlinStylingValue(e, 'padding', resolveSpace)
  if (padding !== undefined) {
    parts.push(`.padding(${padding}.dp)`)
  }
  const paddingX = kotlinStylingValue(e, 'paddingX', resolveSpace)
  if (paddingX !== undefined) {
    parts.push(`.padding(horizontal = ${paddingX}.dp)`)
  }
  const paddingY = kotlinStylingValue(e, 'paddingY', resolveSpace)
  if (paddingY !== undefined) {
    parts.push(`.padding(vertical = ${paddingY}.dp)`)
  }
  const background = kotlinStylingValue(e, 'background', (v) =>
    resolveColor(String(v), 'kotlin'),
  )
  if (background !== undefined) {
    parts.push(`.background(${background})`)
  }
  const radius = kotlinStylingValue(e, 'radius', (v) => resolveRadius(String(v)))
  if (radius !== undefined) {
    // Bare `RoundedCornerShape` — consumer imports from
    // androidx.compose.foundation.shape. Same convention as Color +
    // @Serializable.
    parts.push(`.clip(RoundedCornerShape(${radius}.dp))`)
  }
  // Inline `style={{ … }}` → Compose Modifier calls (the CSS-in-JS connector).
  // Read the raw object literal off the attr (an object value isn't reachable
  // via `readStaticAttrKotlin`, which returns only string/number/boolean).
  // Static-only; a dynamic style value / field warns + drops (Phase-3 reactive
  // emit). The `Modifier` prefix is added below; each entry begins with `.`.
  // See style-to-native.ts.
  const styleAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === 'style',
  )
  if (styleAttr !== undefined) {
    const { modifiers, warnings } = styleToNativeModifiers(
      styleAttr.value,
      'kotlin',
      e.tag,
      (cond) => kotlinCondition(cond, (x) => emitKotlinExpr(x, 0)),
    )
    parts.push(...modifiers)
    for (const w of warnings) _emitWarnings.push(w)
  }
  // E3.1 — `data-testid` becomes Compose's `Modifier.testTag()` (from
  // androidx.compose.ui.platform). Same string the web e2e selects
  // on (`getByTestId`) reaches Android UIAutomator / Espresso via
  // testTag. Other `data-*` attrs are silently dropped.
  const testid = readStringAttrExprKotlin(e, 'data-testid', 0)
  if (testid !== undefined) {
    parts.push(`.testTag(${testid})`)
  }
  // Cross-platform a11y vocabulary (`@pyreon/primitives` AccessibilityProps)
  // → Compose semantics — the Android lowering of the same neutral props the
  // web lowers to `aria-label` / `aria-hidden` (`collectPassthroughAttrs`) and
  // iOS to `.accessibilityLabel` / `.accessibilityHidden`.
  //
  // `accessibilityLabel` → `.semantics { contentDescription = … }` (TalkBack
  // content description — icon-only buttons, images).
  const a11yLabel = readStringAttrExprKotlin(e, 'accessibilityLabel', 0)
  if (a11yLabel !== undefined) {
    parts.push(`.semantics { contentDescription = ${a11yLabel} }`)
  }
  // `accessibilityRole` → Compose semantics. button/image map to the `Role`
  // enum; header to `heading()` (Compose has no `Role.Header`). Constrained to
  // the roles that map 1:1 across targets. Emitted BEFORE clearAndSetSemantics
  // so a contradictory role+hidden combo still resolves to hidden.
  const a11yRole = readStaticAttrKotlin(e, 'accessibilityRole')
  const kotlinSemanticsBody =
    a11yRole === 'button'
      ? 'role = Role.Button'
      : a11yRole === 'image'
        ? 'role = Role.Image'
        : a11yRole === 'header'
          ? 'heading()'
          : null
  if (kotlinSemanticsBody !== null) {
    parts.push(`.semantics { ${kotlinSemanticsBody} }`)
  }
  // `accessibilityHidden` → `.clearAndSetSemantics { }` — clears this node + its
  // descendants from the semantics (accessibility) tree, so TalkBack skips the
  // decorative element + its subtree (matching `aria-hidden` / iOS
  // `.accessibilityHidden`). `clearAndSetSemantics` is STABLE in the targeted
  // Compose 1.7 BOM — chosen deliberately over `invisibleToUser()`
  // (`@ExperimentalComposeUiApi` in 1.7, would need a file `@OptIn`) and
  // `hideFromAccessibility()` (only lands in 1.8). Emitted LAST so a
  // contradictory label+hidden combo resolves to hidden (parity with web/iOS).
  if (readStaticAttrKotlin(e, 'accessibilityHidden') === true) {
    parts.push('.clearAndSetSemantics { }')
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
  // `justify` / `wrap` reach here and lower to NOTHING on either target.
  // Compose COULD express justify on its own (Arrangement.SpaceBetween), but
  // shipping only the Compose half would put the two platforms out of
  // agreement — see unlowered-layout-props.ts.
  for (const prop of ['justify', 'wrap'] as const) {
    const w = unloweredLayoutPropWarning(
      isRow ? 'Inline' : 'Stack',
      prop,
      e.attrs.some((a) => a.kind === 'attr' && a.name === prop),
    )
    if (w !== undefined) _emitWarnings.push(w)
  }
  // gap → arrangement
  const gap = kotlinStylingValue(e, 'gap', resolveSpace)
  if (gap !== undefined) {
    const arrangementSlot = isRow ? 'horizontalArrangement' : 'verticalArrangement'
    initArgs.push(`${arrangementSlot} = Arrangement.spacedBy(${gap}.dp)`)
  }
  // align → cross-axis alignment. Static token OR a ternary of two literal
  // tokens (`align={rtl() ? "end" : "start"}`) — pre-fix static-only, so a
  // dynamic value SILENTLY dropped the alignment. kotlinStylingValue reuses
  // the #2005 machinery (static byte-identical, ternary → a Kotlin
  // if-expression, other dynamic → a NAMED warning).
  const align = kotlinStylingValue(e, 'align', (v) =>
    resolveAlign(String(v), 'kotlin', isRow ? 'vertical' : 'horizontal'),
  )
  if (align !== undefined) {
    const alignSlot = isRow ? 'verticalAlignment' : 'horizontalAlignment'
    initArgs.push(`${alignSlot} = ${align}`)
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
    if (c.kind === 'text') {
      parts.push(escapeKotlinInterp(c.value))
      continue
    }
    // Unwrap a zero-arg accessor arrow — `<Heading>{() => sig()}</Heading>`
    // arrives as an arrow and would otherwise emit `${{ sig }}` (a Kotlin
    // lambda in the string template) → renders the lambda's toString. This is
    // the Kotlin twin of the Text value-interpolation fix; `kotlinTextArg` is a
    // SEPARATE (Heading-only) text builder, so it needs the same unwrap. (Swift
    // Heading reuses the shared `emitSwiftTextCore` and so has no twin bug.)
    const childExpr = resolveAccessorChild(c.expr)
    parts.push(`\${${emitKotlinExpr(childExpr, indent)}}`)
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
  // `level` maps to a typography style. Static number OR a ternary of two
  // literal levels (`level={compact() ? 3 : 1}`). Pre-fix a dynamic level
  // SILENTLY defaulted to level 1 — a silent mis-emit. kotlinStylingValue
  // resolves each branch's level→style; a fully-dynamic level warns + falls
  // back to `h4` (the map is not runtime-indexable).
  const style =
    kotlinStylingValue(
      e,
      'level',
      (v) =>
        `MaterialTheme.typography.${HEADING_TYPOGRAPHY[(typeof v === 'number' ? v : 1) as 1 | 2 | 3 | 4 | 5 | 6] ?? 'h4'}`,
    ) ?? 'MaterialTheme.typography.h4'
  const args = [`text = ${kotlinTextArg(e, indent)}`, `style = ${style}`]
  // Heading `color` — static token OR a ternary of two literal tokens
  // (`color={err() ? "danger" : "text"}`); pre-fix static-only, so a dynamic
  // value SILENTLY dropped the color (same class as Icon color, #2032).
  const color = kotlinStylingValue(e, 'color', (v) => resolveColor(String(v), 'kotlin'))
  if (color !== undefined) args.push(`color = ${color}`)
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
  // `color` (tint) / `size` accept a static token OR a ternary of two literal
  // tokens (`color={on() ? "primary" : "muted"}`) — pre-fix static-only, so a
  // dynamic value was SILENTLY dropped. kotlinStylingValue reuses the #2005
  // machinery (static byte-identical, ternary → a Kotlin if-expression, any
  // other dynamic → a NAMED warning; never silent).
  const tint = kotlinStylingValue(e, 'color', (v) => resolveColor(String(v), 'kotlin'))
  if (tint !== undefined) args.push(`tint = ${tint}`)
  // Layout modifier FIRST so data-testid threads (the Text/Heading
  // lesson — the size-only modifier used to drop the tag entirely).
  const layoutMod = emitKotlinLayoutModifier(e)
  const size = kotlinStylingValue(e, 'size', (v) => `${ICON_SIZE_DP[String(v)] ?? 20}.dp`)
  const sizeMod = size !== undefined ? `.size(${size})` : ''
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

/**
 * A `<Image width|height>` dimension — RAW pixels, not a compile-time token.
 * Static number → `N.dp`; any DYNAMIC value (a ternary of literals OR a runtime
 * signal/expr) → the runtime `(<expr>).dp` (Compose's `.dp` extension applies
 * to Int/Double). Pre-fix static-only → a dynamic dim was SILENTLY dropped. A
 * string literal (web-only) is skipped.
 */
function kotlinImageDim(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  name: string,
): string | undefined {
  const stat = readStaticAttrKotlin(e, name)
  if (typeof stat === 'number') return `${stat}.dp`
  const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === name)
  if (attr !== undefined && attr.kind === 'attr' && attr.value.kind !== 'literal') {
    return `(${emitKotlinExpr(attr.value, 0)}).dp`
  }
  return undefined
}

/**
 * Emit `<Video src autoPlay? loop? muted? onStatusChange?>` as the runtime
 * `PyreonVideoPlayer(url = …)` (Media3 ExoPlayer in an AndroidView). The
 * `onStatusChange` handler reuses the WebView message-handler closure shape;
 * the status vocabulary (`waiting`/`playing`/`paused`) mirrors the web
 * `<video>` events and the Swift `timeControlStatus` observation. Modifier
 * threads through the generic layout tail (the `<Link>`/`<Toggle>` lesson —
 * an early return drops `data-testid` and the element becomes unassertable).
 */
function emitKotlinVideo(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const src = readStaticAttrKotlin(e, 'src')
  if (typeof src !== 'string') return emitKotlinGeneric(e, indent)
  const args = [`url = ${JSON.stringify(src)}`]
  if (readStaticAttrKotlin(e, 'autoPlay') === true) args.push('autoPlay = true')
  if (readStaticAttrKotlin(e, 'loop') === true) args.push('loop = true')
  if (readStaticAttrKotlin(e, 'muted') === true) args.push('muted = true')
  const statusAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'statuschange',
  )
  if (statusAttr !== undefined) {
    args.push(`onStatusChange = ${emitKotlinMessageHandler(statusAttr.handler)}`)
  }
  const layoutMod = emitKotlinLayoutModifier(e)
  const modParts: string[] = []
  const width = kotlinImageDim(e, 'width')
  if (width !== undefined) modParts.push(`.width(${width})`)
  const height = kotlinImageDim(e, 'height')
  if (height !== undefined) modParts.push(`.height(${height})`)
  const modifier =
    layoutMod !== ''
      ? `${layoutMod}${modParts.join('')}`
      : modParts.length > 0
        ? `Modifier${modParts.join('')}`
        : ''
  if (modifier !== '') args.push(`modifier = ${modifier}`)
  return `PyreonVideoPlayer(${args.join(', ')})`
}

function emitKotlinImage(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const src = readStaticAttrKotlin(e, 'src')
  const srcAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'src')
  if (typeof src === 'string' && imageSrcKindKotlin(src) === 'path') {
    _emitWarnings.push(
      `<Image src=${JSON.stringify(src)}>: path-style src is web-only — use a bare asset name (bundled via the assets pipeline) or a full http(s) URL on native.`,
    )
  }
  const alt = readStaticAttrKotlin(e, 'alt')
  const fit = readStaticAttrKotlin(e, 'fit')
  // Layout modifier FIRST in the chain so data-testid threads (the
  // Text/Heading lesson — its absence is device-invisible until a tag
  // query fails), then explicit sizes.
  const layoutMod = emitKotlinLayoutModifier(e)
  const modParts: string[] = []
  const width = kotlinImageDim(e, 'width')
  if (width !== undefined) modParts.push(`.width(${width})`)
  const height = kotlinImageDim(e, 'height')
  if (height !== undefined) modParts.push(`.height(${height})`)
  const modifier =
    layoutMod !== ''
      ? `${layoutMod}${modParts.join('')}`
      : modParts.length > 0
        ? `Modifier${modParts.join('')}`
        : ''
  if (typeof src === 'string' && imageSrcKindKotlin(src) === 'bundled') {
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
  // Network image — a static URL OR a dynamic src expression (signal / prop /
  // member). The dynamic case previously fell through to a generic,
  // non-rendering emit, so a data-driven remote image (a feed item / avatar
  // URL held in state) did NOT display; it now lowers to a Coil
  // `AsyncImage(model = <expr>)` just like a static URL.
  let model: string
  if (typeof src === 'string') {
    model = JSON.stringify(src)
  } else if (srcAttr !== undefined && srcAttr.kind === 'attr' && srcAttr.value.kind !== 'identifier') {
    // Genuine runtime read (signal call / member / index) — see the Swift
    // twin. A bare `identifier` is excluded: it's the unresolvable
    // const-ref case that falls through to the generic emit.
    model = emitKotlinSignalRead(srcAttr.value)
  } else {
    return emitKotlinGeneric(e, indent)
  }
  const args = [
    `model = ${model}`,
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
  const align = kotlinStylingValue(e, 'align', (v) => BOX_ALIGNMENT[String(v)] ?? 'Alignment.Center')
  if (align !== undefined) {
    initArgs.push(`contentAlignment = ${align}`)
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
/**
 * Does this child lower to a Compose LAZY list (i.e. its own vertical
 * scroller)? Today that is `<For>` → `LazyColumn`.
 *
 * Used by `emitKotlinScroll` to avoid nesting a lazy list inside a
 * `Column(Modifier.verticalScroll())`, which Compose rejects at MEASURE time
 * rather than at compile time — see the note at the call site.
 */
function isKotlinLazyListChild(e: ExprIR): boolean {
  return e.kind === 'jsx-element' && e.tag === 'For'
}

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
  // `<Scroll><For/></Scroll>` — the canonical list idiom — must NOT emit a
  // scroll modifier: `<For>` lowers to a LazyColumn, which is ITSELF the
  // scrolling container, and Compose forbids nesting one inside a
  // `Column(Modifier.verticalScroll())`. It does not merely look wrong; it
  // throws at MEASURE time:
  //
  //   IllegalStateException: Vertically scrollable component was measured with
  //   an infinity maximum height constraints … nesting layouts like LazyColumn
  //   and Column(Modifier.verticalScroll())
  //
  // SwiftUI has no such rule — `ScrollView { LazyVStack { … } }` is the
  // idiomatic pair — so the SAME shared source rendered fine on iOS and
  // crashed the Android app. Found by running the finance example on an
  // emulator; compile-only validation cannot see a measure-time constraint.
  //
  // The lazy child already scrolls on its own axis, so dropping the redundant
  // wrapper preserves the behaviour the author asked for. A MIXED child list
  // (a header plus a `<For>`) keeps the scroll modifier: there the outer
  // scroller is doing real work, and the nested-lazy hazard is the author's to
  // resolve — the compiler warns rather than silently restructuring their tree.
  const lazyOnly =
    !horizontal &&
    e.children.length === 1 &&
    e.children[0]!.kind === 'expr' &&
    isKotlinLazyListChild(e.children[0]!.expr)
  if (lazyOnly) {
    // No wrapper at all — the LazyColumn IS the scroll container. Emitted at
    // the PARENT's indent, since it takes the wrapper's place.
    if (layoutMod === '') return emitKotlinChild(e.children[0]!, indent)
    // The <Scroll> carries layout (padding/testTag): keep the wrapper for
    // that layout but WITHOUT the scroll modifier. The prior "keep the
    // wrapper and accept the author's own nesting" emitted the exact
    // measure-time crash this branch documents — device-found on the
    // 10k-row BigListPage, whose `data-testid` was all it took to route a
    // single-For <Scroll> onto the crashing path with zero diagnostics.
    // A plain (non-scrolling) Column around a LazyColumn is legal; the
    // lazy child scrolls itself.
    return `${composable}(modifier = ${layoutMod}) {\n${pad}${emitKotlinChild(e.children[0]!, indent + 2)}\n${' '.repeat(indent)}}`
  }
  // MIXED children including a lazy list (a header + a <For>): the outer
  // scroller is doing real work for the non-lazy siblings, so the tree is
  // kept — but the nested-lazy shape throws at MEASURE time on Android, so
  // the long-promised warning is now actually emitted (the comment above
  // claimed it; the code never did — comment/code drift).
  if (!horizontal && e.children.some((c) => c.kind === 'expr' && isKotlinLazyListChild(c.expr))) {
    _emitWarnings.push(
      '<Scroll> with a <For> among OTHER children nests a LazyColumn inside Column(Modifier.verticalScroll()) on Android — an IllegalStateException at MEASURE time ("measured with an infinity maximum height"). Move the <For> into its own <Scroll>, or render the header as a plain sibling above a <Scroll><For/></Scroll>.',
    )
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
  const onLongPress = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'longpress',
  )

  // Combine the click modifier with the layout modifier chain. With
  // `onLongPress`, `.combinedClickable(onClick, onLongClick)` is the
  // idiomatic Compose long-press surface (stable since Compose 1.6); the
  // conditional import for it is added in build.ts's
  // `conditionalKotlinImports` keyed on `combinedClickable(`.
  const layoutModifier = emitKotlinLayoutModifier(e)
  const clickable = onLongPress
    ? `.combinedClickable(onClick = ${action}, onLongClick = ${emitKotlinAction(onLongPress.handler, indent)})`
    : `.clickable(onClick = ${action})`

  // `onSwipeLeft` / `onSwipeRight` → `pointerInput { detectHorizontalDragGestures }`.
  // The detector is direction-locked (only claims horizontally-dominant
  // drags), so taps still reach `.clickable` and vertical scrolls pass
  // through. Deltas ACCUMULATE across the gesture (`onHorizontalDrag`
  // fires per-move); the ±40f end-total threshold matches the SwiftUI
  // emit and the web polyfill. The detector loop lives for the
  // composable's lifetime, so `onDragStart` must reset the accumulator
  // per gesture. Handlers are `() -> Unit` lambdas from
  // `emitKotlinAction` — invoked via the stdlib non-extension `run(block)`.
  const onSwipeLeft = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'swipeleft',
  )
  const onSwipeRight = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'swiperight',
  )
  let swipeInput = ''
  if (onSwipeLeft || onSwipeRight) {
    const branches: string[] = []
    if (onSwipeLeft) {
      branches.push(`if (dragTotal < -40f) run(${emitKotlinAction(onSwipeLeft.handler, indent)})`)
    }
    if (onSwipeRight) {
      branches.push(
        `${onSwipeLeft ? 'else ' : ''}if (dragTotal > 40f) run(${emitKotlinAction(onSwipeRight.handler, indent)})`,
      )
    }
    swipeInput = `.pointerInput(Unit) { var dragTotal = 0f; detectHorizontalDragGestures(onDragStart = { dragTotal = 0f }, onDragEnd = { ${branches.join(' ')} }, onHorizontalDrag = { _, amount -> dragTotal += amount }) }`
  }
  const gestures = `${clickable}${swipeInput}`
  const modifier =
    layoutModifier !== '' ? `${layoutModifier}${gestures}` : `Modifier${gestures}`

  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `Box(modifier = ${modifier}) {}`
  }
  const contentLines = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `Box(modifier = ${modifier}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
/**
 * A `<Field placeholder>` — a RUNTIME String, not a compile-time token. Static
 * string literal → the quoted literal (`Text("name")`). Any DYNAMIC value (a
 * ternary of two literals OR a runtime signal/expr) lowers to the raw expression
 * (`Text(hint)`) — Compose's `Text(text: String)` takes any runtime String.
 * Pre-fix this read STATIC-only, so a dynamic placeholder was SILENTLY dropped
 * (no `placeholder =` arg at all). Returns a ready-to-emit expression string
 * (already quoted for the static case); `undefined` when absent (→ no arg).
 * Mirrors `swiftFieldPlaceholder` — a runtime value lowers with no warning.
 */
function kotlinFieldPlaceholder(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string | undefined {
  const stat = readStaticAttrKotlin(e, 'placeholder')
  if (typeof stat === 'string') return JSON.stringify(stat)
  const attr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'placeholder')
  if (attr !== undefined && attr.kind === 'attr' && attr.value.kind !== 'literal') {
    // Unwrap a zero-arg accessor arrow: `placeholder={() => hint()}` is a
    // reactive VALUE → `Text(hint)`, not `Text({ hint })` (a lambda where a
    // String is expected).
    return emitKotlinExpr(unwrapAccessorArrow(attr.value), 0)
  }
  return undefined
}

/**
 * The `<Field kind>` → Compose `visualTransformation` arg. `kind="password"`
 * masks the text via `PasswordVisualTransformation()`; other kinds leave it
 * unmasked. UNLIKE Swift (where kind switches the view TYPE), Compose keeps ONE
 * `TextField` and toggles a PARAMETER — so the show/hide-password toggle
 * `kind={reveal() ? "text" : "password"}` lowers cleanly to a runtime
 * conditional `if (reveal) VisualTransformation.None else
 * PasswordVisualTransformation()` (pre-fix `readStaticAttrKotlin` dropped the
 * dynamic value → the password rendered in CLEARTEXT). A ternary of two literal
 * kinds where one branch is "password" lowers to that conditional; a
 * fully-dynamic (non-ternary) kind → a NAMED warning; a static/plain kind →
 * `undefined` (no arg). Returns the full `visualTransformation = …` arg string.
 */
function kotlinFieldVisualTransformation(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string | undefined {
  const vtFor = (k: string | number): string =>
    k === 'password' ? 'PasswordVisualTransformation()' : 'VisualTransformation.None'
  const dyn = classifyDynamicStylingAttr(e, 'kind')
  if (dyn.kind === 'ternary' && (dyn.a === 'password' || dyn.b === 'password')) {
    const cond = kotlinCondition(dyn.cond, (x) => emitKotlinExpr(x, 0))
    return `visualTransformation = if (${cond}) ${vtFor(dyn.a)} else ${vtFor(dyn.b)}`
  }
  if (dyn.kind === 'dynamic') {
    _emitWarnings.push(
      `<Field kind={…}>: a fully-dynamic kind has no native lowering. Use a static kind, or a ternary of two literal kinds (kind={reveal ? "text" : "password"}). Rendered as a plain text field.`,
    )
  }
  const kind = readStaticAttrKotlin(e, 'kind')
  return kind === 'password' ? 'visualTransformation = PasswordVisualTransformation()' : undefined
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
  // Accept BOTH `onChangeText` (canonical) AND web-style `onChange` — the Swift
  // Field emit already accepts both (`changetext || change`). Without `change`
  // here, a shared source using `onChange` compiled to a controlled TextField on
  // iOS but fell through to a literal `Field(...)` (uncompilable) on Android —
  // a one-source-two-outcomes cross-platform break.
  const onChangeText = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && (a.name === 'changetext' || a.name === 'change'),
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
    // Accept the WEB CALL form too (`form.values().email`) — `@pyreon/form`
  // types `values: () => TValues`, so that is what shared source looks like.
  // Normalising here keeps the specialized binding emit (which routes the
  // setter through setValue → re-validation); without it the call form fell
  // through to the generic path and emitted an unbuildable field.
  const _fieldValue =
    valueAttr !== undefined &&
    valueAttr.value.kind === 'member' &&
    valueAttr.value.object.kind === 'call' &&
    valueAttr.value.object.args.length === 0 &&
    valueAttr.value.object.callee.kind === 'member'
      ? { ...valueAttr.value, object: valueAttr.value.object.callee }
      : valueAttr?.value
let formBinding: { value: string; onChange: string } | undefined
  if (
    _fieldValue !== undefined &&
    _fieldValue.kind === 'member' &&
    _fieldValue.object.kind === 'member' &&
    _fieldValue.object.property === 'values' &&
    _fieldValue.object.object.kind === 'identifier' &&
    _formNames.has(_fieldValue.object.object.name)
  ) {
    const formName = kotlinIdent(_fieldValue.object.object.name)
    const field = JSON.stringify(_fieldValue.property)
    formBinding = {
      value: `${formName}.values.value[${field}] ?: ""`,
      onChange: `{ ${formName}.setValue(${field}, it) }`,
    }
  }

  const isBareSignal =
    valueAttr !== undefined &&
    valueAttr.value.kind === 'identifier' &&
    _signalNames.has(valueAttr.value.name)
  // Controlled shape — `value={expr()} onChangeText={(v) => …}` (parity with
  // Swift's `emitSwiftField` shape 3): the value reads from any expression and
  // writes route through the explicit handler. Without this the idiomatic
  // call-form `value={draft()} onChangeText={…}` fell through to the invalid
  // `Field(value = draft)` (no such Compose composable) — it worked on iOS
  // (after the Swift fix) but not Android, a "one code, run everywhere" break.
  const isControlled = valueAttr !== undefined && onChangeText !== undefined
  if (formBinding === undefined && !isBareSignal && !isControlled) {
    return emitKotlinGeneric(e, indent)
  }
  const sig = isBareSignal
    ? kotlinIdent((valueAttr!.value as Extract<ExprIR, { kind: 'identifier' }>).name)
    : ''
  const valueExpr =
    formBinding?.value ??
    (isBareSignal ? sig : emitKotlinExpr(unwrapAccessorArrow(valueAttr!.value), indent))
  const onValueChange =
    formBinding?.onChange ??
    (onChangeText ? emitKotlinAction(onChangeText.handler, indent + 2) : `{ ${sig} = it }`)

  const args: string[] = [
    `value = ${valueExpr}`,
    `onValueChange = ${onValueChange}`,
  ]

  const placeholderExpr = kotlinFieldPlaceholder(e)
  if (placeholderExpr !== undefined) {
    args.push(`placeholder = { Text(${placeholderExpr}) }`)
  }
  const vtArg = kotlinFieldVisualTransformation(e)
  if (vtArg !== undefined) {
    args.push(vtArg)
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
  // Shared helper (like Button) — a DYNAMIC `disabled={busy()}` lowers to
  // `enabled = !<expr>` instead of being silently dropped by readStaticAttrKotlin.
  const enabledArg = kotlinEnabledArg(e)
  if (enabledArg) {
    args.push(enabledArg)
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
  // Unwrap a zero-arg accessor arrow: `value={() => on()}` is a reactive read →
  // Compose `checked = on` (+ `onCheckedChange = { on = it }`), not the lambda
  // `checked = { on }` (a `() -> Boolean` where a `Boolean` is expected).
  const checkedExpr = isSignalShape
    ? kotlinIdent((valueAttr.value as Extract<typeof valueAttr.value, { kind: 'identifier' }>).name)
    : emitKotlinExpr(unwrapAccessorArrow(valueAttr.value), indent)
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
  // Shared helper (like Button) — a DYNAMIC `disabled={busy()}` lowers to
  // `enabled = !<expr>` instead of being silently dropped by readStaticAttrKotlin.
  const enabledArg = kotlinEnabledArg(e)
  if (enabledArg) {
    args.push(enabledArg)
  }
  // Generic modifier tail (same as TextField/Text) — without it a
  // `data-testid` on <Toggle> was silently DROPPED, so the Switch was
  // unselectable by `onNodeWithTag` (the Android sibling of the <Link>
  // special-case-emitter bug: a dedicated emitter returning before the
  // generic tail). The Swift half already chains its modifiers.
  const toggleModifier = emitKotlinLayoutModifier(e)
  if (toggleModifier !== '') {
    args.push(`modifier = ${toggleModifier}`)
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
  // Unwrap a zero-arg accessor arrow: `to={() => url()}` is a reactive read →
  // PyreonLink's `to` (a String) must be `url`, not the lambda `{ url }`
  // (a `() -> String` where a String is expected).
  const toExpr = emitKotlinExpr(unwrapAccessorArrow(toAttr.value), indent)
  const pad = ' '.repeat(indent + 2)
  const inner = ' '.repeat(indent + 4)
  // Mirrors the Swift fix: `<Link>` is a special-case emitter that never
  // reaches the generic modifier tail, so `data-testid` was dropped and the
  // link could not be selected by `onNodeWithTag` — the Compose half of the
  // same "Link not individually asserted" gap.
  const testid = readStringAttrExprKotlin(e, 'data-testid', 0)
  const mod =
    testid === undefined
      ? 'Modifier.clickable { navigate() }'
      : `Modifier.clickable { navigate() }.testTag(${testid})`
  if (e.children.length === 0) {
    return `PyreonLink(${toExpr}) { navigate ->\n${pad}Box(modifier = ${mod}) { }\n${' '.repeat(indent)}}`
  }
  const contentLines = e.children.map((c) => inner + emitKotlinChild(c, indent + 4)).join('\n')
  return `PyreonLink(${toExpr}) { navigate ->\n${pad}Box(modifier = ${mod}) {\n${contentLines}\n${pad}}\n${' '.repeat(indent)}}`
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
/**
 * `<PermissionsProvider permissions={{ … }}>` → a CompositionLocal the bare
 * `usePermissions()` reads. Mirror of emitSwiftPermissionsProvider; see its
 * comment for why the injection is what makes the web-correct call work.
 */
function emitKotlinPermissionsProvider(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  _usesPermissionsEnvKotlin = true
  const seed = permissionsProviderSeed(e)
  if (seed === null) {
    // The suppression of the blanket unlowered-module line is keyed on the
    // TAG being present, so a provider that cannot be baked would otherwise
    // go silent — worse than before the tag lowered at all. The emit is the
    // authority on whether it lowered, so it reports.
    _emitWarnings.push(
      '<PermissionsProvider permissions={…}>: the permissions map is not a literal object of boolean values, so the grants cannot be baked into the native emit — the provider injects NOTHING and every check below it denies. Use a literal map, or seed at the call site with usePermissions(["posts.*"]).',
    )
    return emitKotlinGeneric(e, indent)
  }
  const pad = ' '.repeat(indent + 2)
  const set = `PyreonPermissions(setOf(${seed.granted.map((g) => JSON.stringify(g)).join(', ')}))`
  const content = e.children.map((c) => pad + emitKotlinChild(c, indent + 2)).join('\n')
  return `CompositionLocalProvider(LocalPyreonPermissions provides ${set}) {\n${content}\n${' '.repeat(indent)}}`
}

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

/** Expand a `<Comp {...src} />` spread into per-prop named args (Kotlin).
 * Mirror of emit-swift's `expandSwiftSpread`. */
function expandKotlinSpread(
  spreadArg: ExprIR,
  targetTag: string,
  explicitNames: Set<string>,
  indent: number,
): string[] {
  const out: string[] = []
  if (
    spreadArg.kind === 'object' &&
    (spreadArg.spreads === undefined || spreadArg.spreads.length === 0)
  ) {
    for (const f of spreadArg.fields) {
      if (explicitNames.has(f.name)) continue
      out.push(`${kotlinIdent(safeIdent(f.name))} = ${emitKotlinExpr(f.value, indent)}`)
    }
    return out
  }
  if (spreadArg.kind === 'identifier' || spreadArg.kind === 'member') {
    const targetProps = _componentPropsMapKotlin.get(targetTag)
    if (targetProps !== undefined) {
      for (const p of targetProps) {
        if (explicitNames.has(p.name)) continue
        out.push(
          `${kotlinIdent(safeIdent(p.name))} = ${emitKotlinExpr({ kind: 'member', object: spreadArg, property: p.name }, indent)}`,
        )
      }
      return out
    }
  }
  _emitWarnings.push(
    `<${targetTag} {...}> spread could not be expanded — the target's props are unknown (or the source isn't an object literal / known binding). Pass props explicitly.`,
  )
  return out
}

function emitKotlinGeneric(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const pad = ' '.repeat(indent + 2)
  const isUserComponent = _componentNames.has(e.tag)
  // Phase 2 follow-up: include event handlers as constructor args for
  // user-defined Composables. Mirror of emit-swift.ts:emitSwiftGeneric.
  // Explicit attrs win over a spread's props (React override rule).
  const explicitNames = new Set<string>()
  for (const a of e.attrs) {
    if (a.kind === 'attr') explicitNames.add(a.name)
    else if (a.kind === 'event') {
      explicitNames.add(`on${a.name[0]!.toUpperCase()}${a.name.slice(1)}`)
    }
  }
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
    } else if (a.kind === 'spread' && isUserComponent) {
      argParts.push(...expandKotlinSpread(a.argument, e.tag, explicitNames, indent))
    }
    // A spread on a non-user-component tag is warned once at the top of
    // emitKotlinJsx — no warning needed here.
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
    // A template child already emits a Kotlin String literal, so use it as
    // the Text content directly (no redundant `Text(text = "${"…"}")` wrap).
    if (c.expr.kind === 'template') {
      return `Text(text = ${emitKotlinExpr(c.expr, indent)})`
    }
    return `Text(text = "${kotlinInterpSegment(c.expr, indent)}")`
  }
  // `{cond && <View/>}` — the dominant React/Solid conditional-render
  // idiom. A raw `cond && View` is `Boolean && Unit`, which won't compile
  // in a Compose `@Composable` block, so lower it to the SAME
  // `if (cond) { view }` form `<Show>` emits. The RHS recurses through
  // `emitKotlinChild` so a nested `a && b && <X/>` lowers correctly.
  if (c.expr.kind === 'logical' && c.expr.op === '&&' && kotlinExprProducesView(c.expr.right)) {
    // Same optional-truthiness lowering as the ternary: `{t && <X/>}` where
    // `t` is NULLABLE (e.g. a `.find` result) → `if (t != null) { … }` (and `{!t
    // && <X/>}` → `if (t == null) { … }`), not the bare `if (t) { … }` kotlinc
    // rejects as a non-Boolean condition.
    const cond = kotlinCondition(c.expr.left, (x) => emitKotlinExpr(x, indent))
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

/** Mirror of emit-swift's `callBareAccessorFn` — see its doc comment. */
function callBareAccessorFn(e: ExprIR): ExprIR {
  if (e.kind !== 'identifier' || !_zeroArgFnNames.has(e.name)) return e
  return { kind: 'call', callee: e, args: [] }
}

/** Mirror of emit-swift's `resolveAccessorChild`. */
function resolveAccessorChild(e: ExprIR): ExprIR {
  return callBareAccessorFn(unwrapAccessorArrow(e))
}

function emitKotlinSignalRead(e: ExprIR): string {
  // Unwrap a zero-arg accessor arrow FIRST — see emit-swift's
  // emitSwiftSignalRead. A JSX value arriving as `() => sig()` (e.g.
  // `<Image src={() => url()} />`) must READ the value, not emit a Kotlin
  // lambda `{ url }` (→ `model = { url }`, which Coil renders wrong).
  // Idempotent for the callers that already pre-unwrap.
  const expr = unwrapAccessorArrow(e)
  if (expr.kind === 'identifier') return kotlinIdent(expr.name)
  return emitKotlinExpr(expr, 0)
}

function extractStaticText(children: ChildIR[]): string | null {
  if (children.length === 0) return ''
  if (children.length === 1 && children[0]!.kind === 'text') return children[0]!.value
  return null
}

function escapeKotlinInterp(s: string): string {
  // Escape backslashes, double-quotes, and `$` (Kotlin's interp marker).
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')
}

/**
 * Escape a COOKED string segment for a Kotlin interpolated string literal.
 * Builds on `escapeKotlinInterp` (\, ", $) and additionally escapes real
 * control characters — a cooked template quasi can carry an actual newline /
 * CR / tab (e.g. a multiline `` `a\nb` ``) that a single-line Kotlin string
 * literal cannot hold raw. The added escapes run AFTER escapeKotlinInterp so
 * their backslashes aren't double-escaped.
 */
function escapeKotlinStringSegment(s: string): string {
  return escapeKotlinInterp(s)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
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
