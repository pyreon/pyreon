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
  isReReadableExpr,
  substituteIdentifier,
  synthLiteralStructName,
} from './expr-utils'
import {
  buildArraySpreadConcat,
  buildInferenceCtx,
  classifyNegativeSlice,
  arrayFromMapRewrite,
  classifyOptionalCondition,
  emptyInferenceCtx,
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
} from './infer-type'
import { safeIdent, swiftIdent } from './identifier-safety'
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
/** Component name → its declared props, for expanding `<Comp {...src} />`
 * spread attrs into per-prop constructor args. Built in the emitSwift pre-pass. */
let _componentPropsMap: Map<string, { name: string; type: TypeIR }[]> = new Map()
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
/**
 * Synthesized structs for ANONYMOUS all-scalar-literal object EXPRESSIONS
 * (`{ id: 1, name: 'a' }`) that match no declared struct. Without this they
 * degrade to a labelled tuple — and a single-field labelled tuple `(id: 1)`
 * is illegal Swift, while tuple key-paths break `ForEach(items, id: \.id)`
 * and Codable bridges. Each synthesized struct is emitted at module scope
 * (after components). Keyed by the field name:type SHAPE so two literals with
 * the same shape share one struct AND two with the same names but different
 * scalar types don't collide. Reset per emitSwift run. (Scope: FLAT scalar
 * literals — string / number / boolean — only; a non-literal or nested-object
 * field keeps the tuple emit, unchanged.)
 */
let _synthExprStructs: StructIR[] = []
let _synthExprStructKeys: Map<string, string> = new Map()

// The active component's inference ctx, exposed to `emitSwiftExpr`'s
// object-literal case (which doesn't receive it as a param) so a
// non-literal field (`{ id: count() }`) can have its type inferred for
// struct synthesis. Set per `emitSwiftComponent`; empty otherwise (a
// literal-only object still synthesizes against the empty ctx).
let _exprInferCtx: ReturnType<typeof buildInferenceCtx> = buildInferenceCtx([])

/**
 * Per-emit-run: component name → typed-`params`-prop info for router
 * dispatcher construction. Populated by a PRE-PASS in `emitSwift` (the
 * dispatcher may emit before/after the target component's own emit, so
 * the registry can't live on a per-component ctx). Mirrors emit-kotlin's
 * `synthesizedDataClasses` design.
 *
 *   - `{ typeName, fields }` — `params` prop is an anonymous object type
 *     (or matches a declared struct); the dispatcher constructs the typed
 *     value from `matchPath`'s `[String: String]` dict.
 *   - `'opaque'` — `params` prop declared with a non-object type; the
 *     dispatcher passes the raw dict (legacy emit).
 *   - absent — component has NO `params` prop; the dispatcher calls the
 *     component with no `params:` argument (passing one would be a
 *     compile error on both targets).
 */
let _componentParamsInfo: Map<
  string,
  { typeName: string; fields: { name: string; type: TypeIR }[] } | 'opaque'
> = new Map()
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
 * Per-component: every machine decl name in scope (DeclIR.machine —
 * Gap 4 PR-2). PyreonMachine's `callAsFunction()` requires `m()`
 * (parens preserved) to read current state, NOT bare `m` (which
 * would emit as a property reference and return the PyreonMachine
 * instance itself). Disambiguates `m()` from signal `count()`
 * (parens dropped) and from function `addTodo()` (parens preserved).
 */
let _machineNames: Set<string> = new Set()
/** Per-component: form decl names — drives the dict-member subscript
 *  rewrite (`form.values.email` → `form.values["email"] ?? ""`) and the
 *  Field binding emit. */
let _formNamesSwift: Set<string> = new Set()
/**
 * Fetch-arc: every `useFetch` decl name in scope. A zero-arg CALL on a
 * fetch FIELD (`quotes.data()` — the web signal-read shape) rewrites to
 * a plain property read (`quotes.data`); `refetch()` keeps its parens
 * (real method).
 */
let _fetchNamesSwift: Set<string> = new Set()
// websocket decl name → url, so `ws.connect()` (the 0-arg TS surface — the
// hook carries the url) lowers to the runtime's `connect(to: URL)`.
let _websocketUrlsSwift: Map<string, string> = new Map()
/** Per-component: i18n instance names — `i18n.t(key, {…})` lowers the
 *  object-literal values arg to a dictionary at this call shape. */
let _i18nNames: Set<string> = new Set()
/**
 * Per-component: every function decl name in scope (DeclIR.function —
 * Parser-A). Disambiguates `addTodo()` (function call — keeps parens)
 * from `count()` (signal read — drops parens). Without this set the
 * call-emit can't tell the two shapes apart, since both arrive as
 * `call(callee=identifier, args=[])` in the IR.
 */
let _functionNames: Set<string> = new Set()
/**
 * Per-component: set to true when the component declares any router
 * hook (`useNavigate()` / `useParams()`). When set, the View struct
 * gains `@Environment(\.pyreonRouter) private var pyreonRouter:
 * PyreonRouter?` so the hook calls can pass the active router through
 * to the runtime functions (which take `router:` as a parameter —
 * SwiftUI Environment isn't readable from free functions directly).
 */
let _usesRouter = false
/**
 * Per-component: set to true when the component declares `useColorScheme`.
 * When set, the View struct gains `@Environment(\.colorScheme) private
 * var pyreonColorScheme: ColorScheme` so the computed property emit can
 * read it. Same constraint as @Environment(\.pyreonRouter) — env reads
 * aren't available at stored-let init time, hence the computed-property
 * wrapper.
 */
let _usesColorScheme = false
/**
 * C5.2: per-component map from router-decl name → its routes array.
 * Populated at the start of each `emitSwiftComponent` from the
 * `kind: 'router'` decls that carry routes. `emitSwiftRouterProvider`
 * reads this to emit the `.navigationDestination(for:)` block — the
 * router-attr value gives the name (e.g. `router={appRouter}`); we
 * look up `_routerRoutes.get('appRouter')` to find the route list.
 *
 * Empty for routerless components AND for C4-style scaffold routers
 * (no `routes` config in source). In both cases the existing
 * RouterProvider emit shape (bare content closure) is preserved —
 * additive, back-compat.
 */
let _routerRoutes: Map<string, import('./types').RouteIR[]> = new Map()
/**
 * R1.1 — when emitting the content of a `<RouterProvider router={r}>` whose
 * router-decl carries routes, the inner `<RouterView />` becomes the
 * NavigationStack initial body. SwiftUI's NavigationStack renders its
 * body content as the INITIAL view; `.navigationDestination` only fires
 * for PUSHED paths. Without this rewrite the body is `RouterView()` =
 * `EmptyView()` → iOS apps launch BLANK.
 *
 * Set per-RouterProvider emit. `emitSwiftRouterView` reads it: if non-null,
 * emit the home-route component's invocation instead of `RouterView()`.
 * Cleared after the children are emitted.
 */
let _activeHomeRouteSwift: string | null = null

/**
 * Phase 3 (nested routes) — names of components used as LAYOUT parents
 * (they appear in some route's `layoutChain`). A layout component is emitted
 * as a generic `struct X<Content: View>: View` with a `@ViewBuilder content`
 * slot, and its internal `<RouterView />` becomes `content()`. Computed once
 * per `emitSwift` call (pre-pass over all components' router decls), read by
 * `emitSwiftComponent`.
 */
let _layoutComponentNames: Set<string> = new Set()
/** True while emitting a layout component's body, so its `<RouterView />`
 * emits `content()` (the child slot) instead of the scaffold `RouterView()`. */
let _emittingLayoutComponentSwift = false

/**
 * Pre-pass: collect every component name that appears as a LAYOUT parent in
 * any router-decl's nested route tree. A layout is an ExprIR identifier in a
 * flattened entry's `layoutChain`.
 */
function collectLayoutComponentNames(components: ComponentIR[]): Set<string> {
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
 * Emit-time warnings. Populated by walled-tag emit (Suspense /
 * ErrorBoundary / KeepAlive) when a feature-bearing prop (e.g.
 * `fallback`) is silently dropped on this target. Module-level to
 * avoid threading a warnings parameter through every emit function;
 * reset + returned by `emitSwift()`.
 *
 * Phase 3 of the 2026-06-05 native-readiness gap-fix: stop the silent
 * drop. The walled emit STILL renders children (the existing behaviour
 * — apps' inner content always shows), but a user-visible diagnostic
 * surfaces the dropped feature so silent divergence from web becomes
 * loud at compile time.
 */
let _emitWarnings: string[] = []
/** Canonical font name → iOS PostScript name (asset-pipeline arc PR-1.4). */
let _fontMap: Record<string, string> = {}
/**
 * Module-level `const X = <string|number|boolean literal>` bindings,
 * name → value. Lets a static-attr reader resolve a const-ref attr
 * (`<Image src={API_URL}>`, `<WebView src={chartUrl}>`) to its literal
 * at emit time — so the canonical pattern of naming a URL/constant once
 * works on native, not just an inline literal. `let` (mutable) bindings
 * are excluded (could change), as are non-literal inits (`const x = f()`)
 * — those fall through to the existing "needs static" emit path.
 */
let _constStringMap: Map<string, string | number | boolean> = new Map()
/**
 * Per-COMPONENT const-string map — component-body `const` literal bindings
 * (+ transitive aliases) so `readStaticAttr` resolves `<Image src={logo}>`
 * where `logo` is a component-scope const, not just a module-level one. Set
 * at the top of each `emitSwiftComponent`; consulted by `readStaticAttr`
 * after `_constStringMap`.
 */
let _componentConstMap: Map<string, string | number | boolean> = new Map()
/**
 * Per-component: value-const name → its full ExprIR. Component-body value
 * consts (`const base = 10`) emit as body-local `let`s in the ViewBuilder
 * (a stored property can't reference @State at init), so a STRUCT-LEVEL
 * computed property that references one (`computed(() => base + 5)` →
 * `private var n: Int { base + 5 }`) can't see it → `swiftc -typecheck`
 * fails with `cannot find 'base' in scope`. We fix that by INLINING the
 * value-const's expression into the computed's emitted body (`{ 10 + 5 }`),
 * via `substituteIdentifier`. Kotlin has no such bug — there the const
 * `val` and the `derivedStateOf` computed live in the same Composable
 * body (in scope), so this is a Swift-only inline.
 */
let _componentValueConstExprs: Map<string, ExprIR> = new Map()

/**
 * The current component's inference ctx, exposed to `emitSwiftExpr` (which
 * doesn't take it as a param) so the binary case can coerce a mixed
 * Int×Double operand pair. Set per `emitSwiftComponent`; an empty ctx
 * otherwise (literal operands still self-type). */
let _activeInferCtx: ReturnType<typeof buildInferenceCtx> = emptyInferenceCtx()

/** 'double' / 'int' / 'other' for an expr, via the active inference ctx. */
function numericFloatness(e: ExprIR): 'double' | 'int' | 'other' {
  const t = inferType(e, _activeInferCtx)
  if (t.kind !== 'number') return 'other'
  return t.float === true ? 'double' : 'int'
}

/**
 * Methods whose FIRST callback param IS the array element, so the emit can
 * bind that param to the receiver's element type while emitting the closure.
 * Excludes `.reduce`/`.sort` (the element is NOT the 1st param there).
 */
const ELEMENT_FIRST_CALLBACK_METHODS = new Set([
  'map',
  'filter',
  'forEach',
  'find',
  'findLast',
  'findIndex',
  'some',
  'every',
  'flatMap',
])

/**
 * Emit a member-call's args, temporarily binding an element-callback's first
 * arrow param to the receiver's element type in `_activeInferCtx.locals`. A JS
 * `.map((x) => …)` param `x` is neither a signal nor a const, so inside the
 * closure it otherwise infers `unknown` — which makes `numericFloatness(x)`
 * return `'other'` and DEFEATS the Int×Double coercion (`x * 1.5` emits bare,
 * a Swift "cannot convert value of type 'Int' to expected argument type
 * 'Double'"). Binding `x → element` makes the coercion fire (`Double(x) * 1.5`)
 * AND fixes any other body inference that reads the param. Restored after via
 * try/finally, so nested/sibling closures (`a.map(x => b.map(x => …))`) each
 * see their own element type. Only fires for an ARRAY receiver + an arrow with
 * ≥1 param. Swift-only (Kotlin auto-promotes Int×Double arithmetic).
 */
function emitSwiftMemberCallArgs(
  e: Extract<ExprIR, { kind: 'call' }>,
  indent: number,
): string[] {
  const callee = e.callee
  const cb = e.args[0]
  if (
    callee.kind === 'member' &&
    ELEMENT_FIRST_CALLBACK_METHODS.has(callee.property) &&
    cb !== undefined &&
    cb.kind === 'arrow' &&
    cb.params.length >= 1
  ) {
    const recvT = inferType(callee.object, _activeInferCtx)
    if (recvT.kind === 'array') {
      const p = cb.params[0]!
      const had = _activeInferCtx.locals.has(p)
      const prev = _activeInferCtx.locals.get(p)
      _activeInferCtx.locals.set(p, recvT.element)
      try {
        return e.args.map((a) => emitSwiftExpr(a, indent))
      } finally {
        if (had) _activeInferCtx.locals.set(p, prev!)
        else _activeInferCtx.locals.delete(p)
      }
    }
  }
  return e.args.map((a) => emitSwiftExpr(a, indent))
}

/** Test/debug-only helper to read accumulated warnings without
 *  going through the full emit pipeline. Returns a copy. */
export function _peekSwiftEmitWarnings(): string[] {
  return [..._emitWarnings]
}

/** Internal: called by walled-tag emit to record a silent-drop. */
export function _pushSwiftEmitWarning(msg: string): void {
  _emitWarnings.push(msg)
}

export function emitSwift(
  components: ComponentIR[],
  enums: EnumIR[] = [],
  structs: StructIR[] = [],
  moduleDecls: ModuleDeclIR[] = [],
  stores: StoreDefnIR[] = [],
  models: ModelDefnIR[] = [],
  fieldMetas: FieldMetaDefnIR[] = [],
  features: FeatureDefnIR[] = [],
  zodSchemas: ZodSchemaDefnIR[] = [],
  fonts: Record<string, string> = {},
): { code: string; warnings: string[] } {
  _emitWarnings = []
  _fontMap = fonts
  _constStringMap = new Map()
  for (const md of moduleDecls) {
    if (md.mutable) continue // `let` is mutable — unsafe to inline
    if (md.initial.kind !== 'literal') continue // only direct literals
    const v = md.initial.value
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      _constStringMap.set(md.name, v)
    }
  }
  _enumNames = new Set(enums.map((e) => e.name))
  _structFieldsToName = new Map()
  _synthExprStructs = []
  _synthExprStructKeys = new Map()
  for (const s of structs) {
    const key = s.fields.map((f) => f.name).sort().join(',')
    if (!_structFieldsToName.has(key)) _structFieldsToName.set(key, s.name)
  }
  _componentNames = new Set(components.map((c) => c.name))
  _componentPropsMap = new Map(components.map((c) => [c.name, c.props]))
  _layoutComponentNames = collectLayoutComponentNames(components)
  // Pre-pass: register each component's `params` prop shape so router
  // dispatchers (which may emit in a DIFFERENT component) can construct
  // the typed value from matchPath's [String: String] dict. Runs after
  // _structFieldsToName so a declared-struct structural match resolves
  // to the same name the prop-type emit will use.
  _componentParamsInfo = new Map()
  for (const c of components) {
    const paramsProp = c.props.find((p) => p.name === 'params')
    if (paramsProp === undefined) continue
    if (paramsProp.type.kind === 'object') {
      const fields = paramsProp.type.fields
      // Conservative: route params are flat strings — a nested
      // object/array field can't be constructed from the dict. Fall
      // back to the raw-dict emit (swiftc names the mismatch).
      const constructible = fields.every(
        (f) =>
          f.type.kind === 'string' ||
          f.type.kind === 'number' ||
          f.type.kind === 'boolean',
      )
      if (!constructible) {
        _componentParamsInfo.set(c.name, 'opaque')
        continue
      }
      const key = fields.map((f) => f.name).sort().join(',')
      const typeName =
        _structFieldsToName.get(key) ?? synthesizeSwiftTypeName(c.name, 'params')
      _componentParamsInfo.set(c.name, { typeName, fields })
    } else {
      _componentParamsInfo.set(c.name, 'opaque')
    }
  }
  // Gap 4 v1: track store-hook names → store id so the use-site chain
  // rewriter (`<hook>().store.<X>`) can map to the right singleton class.
  _storeHooks = new Map(stores.map((s) => [s.hookName, s.storeId]))
  // Full store defs for per-component inference (field types).
  _storeDefs = stores
  // Declared structs for per-component inference (typed object-array
  // element fields — `todos().map(t => t.id)` resolves `t.id` to Int).
  _structDefs = structs
  // v2 — per-hook method registry for the chain-call rewrite.
  _storeMethodNames = new Map(
    stores.map((st) => [st.hookName, new Set((st.methods ?? []).map((m) => m.name))]),
  )
  // Gap 4 v2 follow-up: track model instance names → modelId so use-site
  // member access (`<instance>.<field>`) emits as PyreonModel_<id>.shared.<field>.
  _modelInstances = new Map(models.map((m) => [m.instanceName, m.modelId]))
  // Gap 3 PR-3.4 — reset KeepAlive-wrapper flag per transform.
  _needsSwiftKeepAliveWrapper = false
  const parts: string[] = []
  for (const e of enums) parts.push(emitSwiftEnum(e))
  for (const s of structs) parts.push(emitSwiftStruct(s))
  for (const md of moduleDecls) parts.push(emitSwiftModuleDecl(md))
  // Gap 4 v1: emit per-store @Observable singleton class BEFORE
  // components so call sites can reference the type.
  for (const s of stores) parts.push(emitSwiftStore(s))
  // Gap 4 v2 follow-up: emit per-model singleton class BEFORE components
  // so `<instance>.<field>` use sites resolve to PyreonModel_<id>.shared.
  for (const m of models) parts.push(emitSwiftModel(m))
  // Gap 4 follow-up — withField metadata structs.
  for (const fm of fieldMetas) parts.push(emitSwiftFieldMeta(fm))
  // Gap 4 follow-up — feature v1: emit per-feature schema struct +
  // module-scope const exposing initialValues + name.
  for (const f of features) parts.push(emitSwiftFeature(f))
  // Gap 4 follow-up — Zod / Valibot / ArkType schema structs.
  // Emit the shared PyreonSchemaError enum BEFORE the schemas if
  // any are present (the per-schema .parse() / .safeParse() refer to it).
  if (zodSchemas.length > 0) parts.push(SWIFT_SCHEMA_ERROR)
  // Gap 4 v3.2 — recursively emit auxSchemas BEFORE their parent
  // schema so Swift can resolve type references top-down.
  const emitSchemaTree = (zs: ZodSchemaDefnIR): void => {
    for (const aux of zs.auxSchemas ?? []) emitSchemaTree(aux)
    parts.push(emitSwiftZodSchema(zs))
  }
  for (const zs of zodSchemas) emitSchemaTree(zs)
  // Emit components — populates _needsSwift{Suspense,ErrorBoundary,KeepAlive}Wrapper
  // if any of those elements is encountered.
  const componentParts: string[] = []
  for (const c of components) componentParts.push(emitSwiftComponent(c))
  // Emit synthesized anonymous-object structs (collected during component
  // emit) at module scope. Swift allows top-level type forward refs, so
  // ordering vs the components is irrelevant.
  for (const s of _synthExprStructs) parts.push(emitSwiftStruct(s))
  // Gap 3 PR-3.2/3.3/3.4 — prepend wrapper helper structs if needed.
  if (_needsSwiftKeepAliveWrapper) parts.push(SWIFT_KEEP_ALIVE_WRAPPER)
  for (const cp of componentParts) parts.push(cp)
  _enumNames = new Set()
  _structFieldsToName = new Map()
  _synthExprStructs = []
  _synthExprStructKeys = new Map()
  _activeInferCtx = emptyInferenceCtx()
  _componentNames = new Set()
  _componentParamsInfo = new Map()
  _layoutComponentNames = new Set()
  _storeHooks = new Map()
  _storeDefs = []
  _structDefs = []
  _storeMethodNames = new Map()
  _modelInstances = new Map()
  _needsSwiftKeepAliveWrapper = false
  const warnings = [..._emitWarnings]
  _emitWarnings = []
  return { code: parts.join('\n\n'), warnings }
}

/** Map of useStoreName → storeId (e.g. `useCounter` → `"counter"`). */
let _storeHooks: Map<string, string> = new Map()
/** Per-hook store METHOD names — chain calls keep parens + args. */
let _storeMethodNames: Map<string, Set<string>> = new Map()
/** Full store definitions — feeds per-component inference ctx (field types). */
let _storeDefs: StoreDefnIR[] = []
/** Declared module structs — feeds per-component inference ctx so member
 * access on a typed object-array element (`t.id` where `t: Todo`) resolves
 * the field type instead of degrading to `Any`. Set at the emit entrypoint. */
let _structDefs: StructIR[] = []

/** Map of model instance name → modelId (e.g. `counter` → `"counter"`). */
let _modelInstances: Map<string, string> = new Map()

/**
 * Emit a per-store @Observable singleton class:
 *
 *   @available(iOS 17.0, macOS 14.0, *)
 *   @Observable
 *   final class PyreonStore_counter: PyreonStoreProtocol {
 *       static let shared = PyreonStore_counter()
 *       var count: Int = 0
 *       private init() {}
 *   }
 *
 * The PMTC consumer accesses fields via `PyreonStore_counter.shared.count`
 * (rewritten from `useCounter().store.count`). The PyreonStoreProtocol
 * marker comes from PyreonStore.swift.
 */
function emitSwiftStore(s: StoreDefnIR): string {
  const lines: string[] = []
  lines.push(`@available(iOS 17.0, macOS 14.0, *)`)
  lines.push(`@Observable`)
  lines.push(`final class PyreonStore_${s.storeId}: PyreonStoreProtocol {`)
  lines.push(`    static let shared = PyreonStore_${s.storeId}()`)
  for (const f of s.fields) {
    const t = swiftType(f.type)
    const init = emitSwiftExpr(f.initial, 4)
    lines.push(`    var ${f.name}: ${t} = ${init}`)
  }
  // v2 — computeds + methods live on the singleton. Their bodies read
  // the store's OWN signals (`tasks()` in source → the `tasks`
  // property here), so the signal-read / .set machinery must see the
  // store's decls instead of the surrounding component's: save the
  // module-state name sets, swap in the store's, restore after.
  const hasMembers = (s.computeds?.length ?? 0) > 0 || (s.methods?.length ?? 0) > 0
  if (hasMembers) {
    const prevSignals = _signalNames
    const prevFunctions = _functionNames
    _signalNames = new Set([
      ...s.fields.map((f) => f.name),
      ...(s.computeds ?? []).map((c) => c.name),
    ])
    _functionNames = new Set((s.methods ?? []).map((m) => m.name))
    // Computed return types infer from the store's own fields (treated
    // as signals) — same machinery component computeds use.
    const storeCtx = buildInferenceCtx(
      s.fields.map((f) => ({
        kind: 'signal' as const,
        name: f.name,
        type: f.type,
        initial: f.initial,
      })),
      [],
      _structDefs,
    )
    for (const c of s.computeds ?? []) {
      const t = inferType(c.expr, storeCtx)
      const anno = t.kind === 'unknown' ? 'Any' : swiftType(t)
      lines.push(`    var ${swiftIdent(c.name)}: ${anno} { ${emitSwiftExpr(c.expr, 4)} }`)
      // Later computeds may read earlier ones.
      storeCtx.computeds.set(c.name, t)
      _signalNames.add(c.name)
    }
    for (const m of s.methods ?? []) {
      // Internal (not private) — components call these through the
      // chain rewrite (`useX().store.M(...)` →
      // `PyreonStore_id.shared.M(...)`).
      lines.push(`    ${emitSwiftFunction(m, 'internal')}`)
    }
    _signalNames = prevSignals
    _functionNames = prevFunctions
  }
  lines.push(`    private init() {}`)
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Gap 4 follow-up v2 — emit a per-model @Observable singleton class
 * for `const X = model({ state: { ... } }).create()`. Mirror of
 * `emitSwiftStore` for state-tree's instance-shaped surface.
 *
 *   @available(iOS 17.0, macOS 14.0, *)
 *   @Observable
 *   final class PyreonModel_counter: PyreonModelProtocol {
 *       static let shared = PyreonModel_counter()
 *       var count: Int = 0
 *       var label: String = "counter"
 *       private init() {}
 *   }
 *
 * Use-site rewriting (`counter.field` → `PyreonModel_counter.shared.field`)
 * happens at expression-emit time via `_modelInstances`.
 */
function emitSwiftModel(m: ModelDefnIR): string {
  const lines: string[] = []
  lines.push(`@available(iOS 17.0, macOS 14.0, *)`)
  lines.push(`@Observable`)
  lines.push(`final class PyreonModel_${m.modelId}: PyreonModelProtocol {`)
  lines.push(`    static let shared = PyreonModel_${m.modelId}()`)
  for (const f of m.fields) {
    const t = f.type === 'string' ? 'String' : f.type === 'number' ? 'Int' : 'Bool'
    const initial =
      f.type === 'string'
        ? JSON.stringify(f.initial)
        : f.type === 'boolean'
          ? String(f.initial)
          : String(f.initial)
    lines.push(`    var ${f.name}: ${t} = ${initial}`)
  }
  lines.push(`    private init() {}`)
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Gap 4 follow-up — `@pyreon/validate` withField metadata emit
 * (Swift). PMTC discards the schema argument and emits a per-binding
 * struct holding the literal `meta` fields. Downstream native code
 * uses `emailField.label` etc. directly via the emitted struct.
 *
 *   struct PyreonFieldMeta_emailField {
 *       let label: String = "Email"
 *       let placeholder: String = "name@example.com"
 *   }
 *   let emailField = PyreonFieldMeta_emailField()
 */
function emitSwiftFieldMeta(fm: FieldMetaDefnIR): string {
  const lines: string[] = []
  lines.push(`struct PyreonFieldMeta_${fm.bindingName} {`)
  for (const m of fm.meta) {
    lines.push(`    let ${m.name}: String = ${JSON.stringify(m.value)}`)
  }
  lines.push(`}`)
  lines.push(``)
  lines.push(`let ${fm.bindingName} = PyreonFieldMeta_${fm.bindingName}()`)
  return lines.join('\n')
}

/**
 * Gap 4 follow-up — feature v1 emit. Produces a Codable struct
 * representing the schema shape PLUS a module-scope enum holding
 * the `name` + `initialValues` accessors. Downstream code can
 * reference `PyreonFeatureSchema_<binding>` as the data type and
 * `<binding>.initialValues` for default state.
 *
 *   struct PyreonFeatureSchema_Todo: Codable {
 *       var id: String = ""
 *       var title: String = ""
 *       var done: Bool = false
 *   }
 *
 *   enum PyreonFeature_Todo {
 *       static let name = "todo"
 *       static let initialValues = PyreonFeatureSchema_Todo()
 *   }
 */
function emitSwiftFeature(f: FeatureDefnIR): string {
  const lines: string[] = []
  lines.push(`struct PyreonFeatureSchema_${f.bindingName}: Codable {`)
  for (const field of f.fields) {
    const t =
      field.type === 'string' ? 'String' : field.type === 'number' ? 'Int' : 'Bool'
    const initial = field.type === 'string' ? '""' : field.type === 'boolean' ? 'false' : '0'
    lines.push(`    var ${field.name}: ${t} = ${initial}`)
  }
  lines.push(`}`)
  lines.push(``)
  lines.push(`enum PyreonFeature_${f.bindingName} {`)
  lines.push(`    static let name = ${JSON.stringify(f.featureName)}`)
  lines.push(
    `    static let initialValues = PyreonFeatureSchema_${f.bindingName}()`,
  )
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Gap 4 follow-up — `@pyreon/validation` Zod-schema v1 emit (Swift).
 * Produces a Codable struct + module-scope const. Apps validate at
 * JSON-decode time via Codable; v1 doesn't yet emit runtime .parse()
 * methods (v2 follow-up).
 *
 *   struct PyreonZodSchema_userSchema: Codable {
 *       var name: String = ""
 *       var age: Int = 0
 *       var active: Bool = false
 *   }
 *   let userSchema = PyreonZodSchema_userSchema()
 */
function swiftFieldType(t: ZodFieldType): string {
  if (typeof t === 'string') {
    return t === 'string' ? 'String' : t === 'number' ? 'Int' : 'Bool'
  }
  if (t.kind === 'object') {
    // Gap 4 v3.2 — nested object reference. Emit the synthesized struct name.
    return `PyreonZodSchema_${t.schemaName}`
  }
  // v2.2 array — element may now be a nested object (v3.2).
  let elem: string
  if (typeof t.element === 'string') {
    elem = t.element === 'string' ? 'String' : t.element === 'number' ? 'Int' : 'Bool'
  } else {
    elem = `PyreonZodSchema_${t.element.schemaName}`
  }
  return `[${elem}]`
}

function swiftFieldInitial(t: ZodFieldType): string {
  if (typeof t === 'string') {
    return t === 'string' ? '""' : t === 'boolean' ? 'false' : '0'
  }
  if (t.kind === 'object') {
    // Initialize nested object with its own default constructor
    return `PyreonZodSchema_${t.schemaName}()`
  }
  return '[]'
}

/**
 * Gap 4 v2.1 — emit Swift constraint-check guards for a scalar value.
 * Used at three call sites: required scalar field, optional scalar
 * field (inside the present-checked block), and array-element loop
 * body (with `ruleSuffix: ' (element)'` for clearer error messages).
 */
function emitSwiftScalarConstraints(
  lines: string[],
  targetName: string,
  t: ZodFieldType,
  constraints: ZodFieldConstraints | undefined,
  fieldName: string,
  indent: number,
  ruleSuffix = '',
): void {
  if (!constraints) return
  // Only scalar string/number constraints apply at the scalar-emit level.
  const isString = t === 'string'
  const isNumber = t === 'number'
  if (!isString && !isNumber) return
  const ind = ' '.repeat(indent)
  const innerInd = ' '.repeat(indent + 4)
  const c = constraints
  if (isString) {
    if (c.min !== undefined) {
      lines.push(`${ind}if ${targetName}.count < ${c.min} {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${JSON.stringify(fieldName)}, rule: "min length ${c.min}${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.max !== undefined) {
      lines.push(`${ind}if ${targetName}.count > ${c.max} {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${JSON.stringify(fieldName)}, rule: "max length ${c.max}${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.email) {
      lines.push(
        `${ind}if ${targetName}.range(of: #"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$"#, options: [.regularExpression, .caseInsensitive]) == nil {`,
      )
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${JSON.stringify(fieldName)}, rule: "email${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.url) {
      lines.push(`${ind}if URL(string: ${targetName}) == nil {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${JSON.stringify(fieldName)}, rule: "url${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.uuid) {
      lines.push(`${ind}if UUID(uuidString: ${targetName}) == nil {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${JSON.stringify(fieldName)}, rule: "uuid${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
  } else if (isNumber) {
    if (c.min !== undefined) {
      lines.push(`${ind}if ${targetName} < ${c.min} {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${JSON.stringify(fieldName)}, rule: "min ${c.min}${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.max !== undefined) {
      lines.push(`${ind}if ${targetName} > ${c.max} {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${JSON.stringify(fieldName)}, rule: "max ${c.max}${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
  }
}

/**
 * Gap 4 v3 — emit a `for elem in <field>Val { ... }` loop that
 * applies the array's `elementConstraints` to each element. Only
 * called for array field types; no-op for scalars.
 */
function emitSwiftArrayElementConstraints(
  lines: string[],
  targetName: string,
  t: ZodFieldType,
  fieldName: string,
  indent: number,
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
  lines.push(`${ind}for ${elementVar} in ${targetName} {`)
  emitSwiftScalarConstraints(
    lines,
    elementVar,
    t.element,
    t.elementConstraints,
    fieldName,
    indent + 4,
    ' (element)',
  )
  lines.push(`${ind}}`)
}

/**
 * Gap 4 v3.3 — emit a discriminated union as a Swift enum with
 * associated values. Each variant case wraps its aux struct.
 */
function emitSwiftDiscriminatedUnion(zs: ZodSchemaDefnIR): string {
  const d = zs.discriminator!
  const lines: string[] = []
  const typeName = `PyreonZodSchema_${zs.bindingName}`
  lines.push(`enum ${typeName} {`)
  for (const v of d.variants) {
    lines.push(`    case ${camelCase(v.caseName)}(PyreonZodSchema_${v.schemaName})`)
  }
  lines.push(``)
  lines.push(`    static func parse(_ input: [String: Any]) throws -> Self {`)
  lines.push(
    `        guard let discr = input[${JSON.stringify(d.field)}] as? String else {`,
  )
  lines.push(
    `            throw PyreonSchemaError.missingOrWrongType(field: ${JSON.stringify(d.field)}, expected: "String")`,
  )
  lines.push(`        }`)
  lines.push(`        switch discr {`)
  for (const v of d.variants) {
    lines.push(`        case ${JSON.stringify(v.literal)}:`)
    lines.push(
      `            return .${camelCase(v.caseName)}(try PyreonZodSchema_${v.schemaName}.parse(input))`,
    )
  }
  lines.push(`        default:`)
  lines.push(
    `            throw PyreonSchemaError.constraintViolation(field: ${JSON.stringify(d.field)}, rule: "unknown discriminator value")`,
  )
  lines.push(`        }`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(
    `    static func safeParse(_ input: [String: Any]) -> Result<Self, PyreonSchemaError> {`,
  )
  lines.push(`        do { return .success(try parse(input)) }`)
  lines.push(`        catch let e as PyreonSchemaError { return .failure(e) }`)
  lines.push(`        catch { return .failure(.missingOrWrongType(field: "?", expected: "?")) }`)
  lines.push(`    }`)
  lines.push(`}`)
  return lines.join('\n') + '\n'
}

/**
 * Gap 4 v3.3 — lowercase the first character of an identifier.
 * Used to convert PascalCased variant caseName ("Cat") to a Swift
 * enum case ("cat").
 */
function camelCase(s: string): string {
  if (s.length === 0) return s
  return s[0]!.toLowerCase() + s.slice(1)
}

function emitSwiftZodSchema(zs: ZodSchemaDefnIR): string {
  // Gap 4 v3.3 — discriminated union: emit as a Swift enum with
  // associated values. Each variant case wraps the variant's struct
  // and parse() routes via a switch on the discriminator value.
  if (zs.discriminator) return emitSwiftDiscriminatedUnion(zs)
  const lines: string[] = []
  lines.push(`struct PyreonZodSchema_${zs.bindingName}: Codable {`)
  for (const f of zs.fields) {
    const t = swiftFieldType(f.type)
    if (f.optional) {
      lines.push(`    var ${f.name}: ${t}? = nil`)
    } else {
      const initial = swiftFieldInitial(f.type)
      lines.push(`    var ${f.name}: ${t} = ${initial}`)
    }
  }
  lines.push(``)
  // Gap 4 v2 — runtime .parse() / .safeParse() methods. Take a
  // `[String: Any]` (decoded JSON map), type-check each field,
  // return the validated struct or throw PyreonSchemaError.
  lines.push(`    static func parse(_ input: [String: Any]) throws -> Self {`)
  lines.push(`        var result = Self()`)
  for (const f of zs.fields) {
    const t = swiftFieldType(f.type)
    // Gap 4 v3.2 — nested object field: route via the nested schema's
    // own parse() method.
    if (typeof f.type !== 'string' && f.type.kind === 'object') {
      const nestedType = `PyreonZodSchema_${f.type.schemaName}`
      if (f.optional) {
        lines.push(`        if let raw = input[${JSON.stringify(f.name)}] {`)
        lines.push(
          `            guard let ${f.name}Raw = raw as? [String: Any] else {`,
        )
        lines.push(
          `                throw PyreonSchemaError.missingOrWrongType(field: ${JSON.stringify(f.name)}, expected: ${JSON.stringify(nestedType)})`,
        )
        lines.push(`            }`)
        lines.push(
          `            result.${f.name} = try ${nestedType}.parse(${f.name}Raw)`,
        )
        lines.push(`        }`)
      } else {
        lines.push(
          `        guard let ${f.name}Raw = input[${JSON.stringify(f.name)}] as? [String: Any] else {`,
        )
        lines.push(
          `            throw PyreonSchemaError.missingOrWrongType(field: ${JSON.stringify(f.name)}, expected: ${JSON.stringify(nestedType)})`,
        )
        lines.push(`        }`)
        lines.push(
          `        result.${f.name} = try ${nestedType}.parse(${f.name}Raw)`,
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
      const arrayType = `[${nestedType}]`
      if (f.optional) {
        lines.push(`        if let raw = input[${JSON.stringify(f.name)}] {`)
        lines.push(
          `            guard let ${f.name}Raw = raw as? [[String: Any]] else {`,
        )
        lines.push(
          `                throw PyreonSchemaError.missingOrWrongType(field: ${JSON.stringify(f.name)}, expected: ${JSON.stringify(arrayType)})`,
        )
        lines.push(`            }`)
        lines.push(
          `            result.${f.name} = try ${f.name}Raw.map { try ${nestedType}.parse($0) }`,
        )
        lines.push(`        }`)
      } else {
        lines.push(
          `        guard let ${f.name}Raw = input[${JSON.stringify(f.name)}] as? [[String: Any]] else {`,
        )
        lines.push(
          `            throw PyreonSchemaError.missingOrWrongType(field: ${JSON.stringify(f.name)}, expected: ${JSON.stringify(arrayType)})`,
        )
        lines.push(`        }`)
        lines.push(
          `        result.${f.name} = try ${f.name}Raw.map { try ${nestedType}.parse($0) }`,
        )
      }
      continue
    }
    if (f.optional) {
      // Optional field — missing → leave nil, present-but-wrong-type → throw
      lines.push(`        if let raw = input[${JSON.stringify(f.name)}] {`)
      lines.push(`            guard let ${f.name}Val = raw as? ${t} else {`)
      lines.push(
        `                throw PyreonSchemaError.missingOrWrongType(field: ${JSON.stringify(f.name)}, expected: ${JSON.stringify(t)})`,
      )
      lines.push(`            }`)
      // Gap 4 v3 — constraints on optional fields apply ONLY when the
      // field is present (the missing-case left nil above).
      emitSwiftScalarConstraints(
        lines,
        `${f.name}Val`,
        f.type,
        f.constraints,
        f.name,
        12,
      )
      // Gap 4 v3 — element constraints for optional arrays apply per-element.
      emitSwiftArrayElementConstraints(lines, `${f.name}Val`, f.type, f.name, 12)
      lines.push(`            result.${f.name} = ${f.name}Val`)
      lines.push(`        }`)
      continue
    }
    lines.push(
      `        guard let ${f.name}Val = input[${JSON.stringify(f.name)}] as? ${t} else {`,
    )
    lines.push(
      `            throw PyreonSchemaError.missingOrWrongType(field: ${JSON.stringify(f.name)}, expected: ${JSON.stringify(t)})`,
    )
    lines.push(`        }`)
    // Gap 4 v2.1 — enforce scalar constraints from the modifier chain.
    emitSwiftScalarConstraints(
      lines,
      `${f.name}Val`,
      f.type,
      f.constraints,
      f.name,
      8,
    )
    // Gap 4 v3 — enforce per-element constraints for array fields.
    emitSwiftArrayElementConstraints(lines, `${f.name}Val`, f.type, f.name, 8)
    lines.push(`        result.${f.name} = ${f.name}Val`)
  }
  lines.push(`        return result`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(
    `    static func safeParse(_ input: [String: Any]) -> Result<Self, PyreonSchemaError> {`,
  )
  lines.push(`        do { return .success(try parse(input)) }`)
  lines.push(`        catch let e as PyreonSchemaError { return .failure(e) }`)
  lines.push(`        catch { return .failure(.unknown) }`)
  lines.push(`    }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`let ${zs.bindingName} = PyreonZodSchema_${zs.bindingName}()`)
  return lines.join('\n')
}

/**
 * Gap 4 v2 — emitted once at module scope when any schema is
 * present. Single error enum shared across all schemas in a file.
 */
const SWIFT_SCHEMA_ERROR = `enum PyreonSchemaError: Error {
    case missingOrWrongType(field: String, expected: String)
    case constraintViolation(field: String, rule: String)
    case unknown
}`

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
  // A FUNCTION-typed field can't derive Codable — closures aren't
  // Codable, so `struct X: Codable { var cb: () -> Void }` is a hard
  // swiftc error ("does not conform to protocol 'Decodable'"). Emit the
  // plain struct instead: it still works as a value type everywhere
  // except JSON decode — which a type carrying functions can't do in ANY
  // language. Function-free structs keep Codable byte-identically.
  const codable = s.fields.some((f) => typeContainsFunction(f.type)) ? '' : ': Codable'
  lines.push(`struct ${swiftIdent(s.name)}${codable} {`)
  for (const f of s.fields) {
    // Optional field (`label?: string` → union-with-undefined) gets an
    // explicit `= nil` default so the memberwise initializer's parameter
    // is omittable — an object literal that skips the field
    // (`{ qty: 3 }` → `P(qty: 3)`) compiles. Codable synthesis also
    // decodes a missing JSON key to nil for defaulted optionals.
    const suffix = typeIsOptional(f.type) ? ' = nil' : ''
    lines.push(`  var ${swiftIdent(f.name)}: ${swiftType(f.type)}${suffix}`)
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
  // Store field types thread into the inference ctx so computeds over
  // store reads (`useApp().store.tasks().filter(...).length`) infer a
  // concrete return type instead of degrading to Any.
  const inferCtx = buildInferenceCtx(c.decls, _storeDefs, _structDefs, c.props, c.propsParamName)
  // Expose it to the object-literal emit so a non-literal field
  // (`{ id: count() }`) gets its struct-field type inferred.
  _exprInferCtx = inferCtx
  // Component-scope const literals → static-attr resolution (`<Image
  // src={logo}>` where `logo` is a component-body const).
  _componentConstMap = buildComponentConstMap(c.decls)
  // value-const name → ExprIR, for inlining into struct-level computeds AND
  // handler bodies (neither can reference the body-local `let`s — see the
  // field's doc). EXCLUDE any value-const that is REASSIGNED anywhere (a
  // `let nextId = 1; nextId++` counter): reassignment is only legal on a
  // non-const binding, so inlining it (substituting its INITIAL value) is
  // wrong — `nextId++` would inline to `(1)++`. Those stay body-local + read
  // by name (their emit is unchanged; the Swift mutable-counter shape is a
  // separate pre-existing concern). Immutable consts (`steps`, `factor`) still
  // inline. Inference seeding (infer-type.ts `valueConsts`) keeps ALL of them —
  // a mutated counter's TYPE is still correct; only INLINING is unsafe.
  const mutatedVars = collectMutatedComponentVars(c.decls)
  _componentValueConstExprs = new Map(
    c.decls
      .filter(
        (d): d is Extract<DeclIR, { kind: 'value' }> =>
          d.kind === 'value' && !mutatedVars.has(d.name),
      )
      .map((d) => [d.name, d.expr]),
  )
  // Expose the inference ctx to the expr-emit (which doesn't receive it as a
  // param) so the binary case can detect a mixed Int×Double operand pair and
  // coerce. Reset to empty after the component so non-component expr emits
  // (store/module) don't read a stale ctx (a literal-only mix still types
  // correctly against the empty ctx).
  _activeInferCtx = inferCtx
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
  // Gap 4 PR-2: track machine names so `m()` keeps parens (Swift
  // callAsFunction).
  _machineNames = new Set()
  _i18nNames = new Set()
  _formNamesSwift = new Set()
  _fetchNamesSwift = new Set()
  _websocketUrlsSwift = new Map()
  // C4: reset router-usage tracking. Set during decl-pass if any
  // useNavigate/useParams binding is present.
  _usesRouter = false
  // Same shape for useColorScheme — set during decl-pass if any
  // `kind: 'color-scheme'` binding is present.
  _usesColorScheme = false
  // C5.2: reset router-routes map. Populated during decl-pass for
  // each `kind: 'router'` decl with a non-undefined routes array.
  _routerRoutes = new Map()
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
    // Gap 4 PR-2: PyreonMachine reads via `m()` (callAsFunction).
    // Keep machine names OUT of _signalNames (parens preserved) and
    // OUT of _functionNames (it's a property, not a free function).
    if (d.kind === 'machine') _machineNames.add(d.name)
    if (d.kind === 'i18n') _i18nNames.add(d.name)
    if (d.kind === 'form') _formNamesSwift.add(d.name)
    if (d.kind === 'fetch') _fetchNamesSwift.add(d.name)
    if (d.kind === 'websocket') _websocketUrlsSwift.set(d.name, d.url)
    // C4: router-instance decls (`const r = createRouter({...})`) map to
    // `@State` properties, so the identifier reads bare like a signal —
    // add to `_signalNames` so `router` in JSX (e.g. `<RouterProvider
    // router={router}>`) emits as a property reference, not a call.
    // C5.2: also stash the routes list (if parsed) so the matching
    // <RouterProvider> emit can produce a navigationDestination block.
    if (d.kind === 'router') {
      _signalNames.add(d.name)
      if (d.routes !== undefined) _routerRoutes.set(d.name, d.routes)
    }
    // C4: router-hook decls (`const navigate = useNavigate()`). The
    // resulting binding IS a function value (returns `(String) -> Void`
    // / `[String: String]`), so register it under `_functionNames`
    // for the navigate-style call sites. `useParams()` returns a map,
    // not a function — keep it OUT of `_functionNames` so `params["id"]`
    // emits as a subscript without surprise parens.
    if (d.kind === 'router-hook') {
      _usesRouter = true
      if (d.hook === 'navigate') _functionNames.add(d.name)
    }
    // Phase 3: `const { id } = useParams()` reads via useParams(router:),
    // so the View needs the @Environment(\.pyreonRouter) injection.
    if (d.kind === 'params-destructure') _usesRouter = true
    // Phase 4 follow-up: useColorScheme reads SwiftUI's
    // @Environment(\.colorScheme), so the View needs the injection.
    if (d.kind === 'color-scheme') _usesColorScheme = true
    // Phase B6: `const data = useLoaderData<T>()` reads via the runtime
    // helper `useLoaderData(router:)` which takes the @Environment-injected
    // pyreonRouter. Mark _usesRouter so the View struct gets the
    // injection in its body.
    if (d.kind === 'useLoaderData') _usesRouter = true
  }
  const lines: string[] = []
  // `swiftIdent` backtick-escapes Swift-reserved keywords. Pyreon
  // user code commonly exports functions named `guard` (route guard
  // convention) and accepts `class` as a prop name (React/HTML attr);
  // both crash swiftc as bare identifiers. Backticks let Swift treat
  // the colliding name as a normal identifier (`struct \`guard\`: View`).
  // Phase 3 (nested routes) — a LAYOUT component (a route parent) is emitted
  // as a generic struct with a `@ViewBuilder content` slot; its internal
  // `<RouterView />` becomes `content()` so the matched child fills it.
  const isLayout = _layoutComponentNames.has(c.name)
  // Props become `let X: T` stored properties on the SwiftUI View struct.
  // SwiftUI canonical pattern — parent code constructs `Card(title: ...)`,
  // props are immutable per instance.
  //
  // Anonymous object types in props synthesize named structs (mirrors
  // emit-kotlin's data-class synthesis). The prop lines are computed
  // BEFORE the struct header is pushed so the synthesized struct
  // declarations land ahead of the component struct in the output —
  // Swift doesn't require that ordering at file scope, but it keeps the
  // file readable and byte-mirrors the Kotlin emit's layout.
  const synth: SwiftSynthCtx = { componentName: c.name, structs: [] }
  // Optional props (`label?: string` → union-with-undefined) emit as
  // `var label: String? = nil` — the explicit `= nil` default is what
  // makes the MEMBERWISE initializer's parameter omittable, so a call
  // site that skips the prop (`Card(qty: 2)`) compiles. A defaultless
  // `let label: String?` would still REQUIRE the argument. Required
  // props stay `let` (immutable per instance).
  const propLines = c.props.map((p) =>
    typeIsOptional(p.type)
      ? `  var ${swiftIdent(p.name)}: ${swiftType(p.type, synth, p.name)} = nil`
      : `  let ${swiftIdent(p.name)}: ${swiftType(p.type, synth, p.name)}`,
  )
  // Pre-walk signal decl types through the synth ctx so INLINE anonymous
  // object types in signal generics (`signal<{ price: number }[]>`)
  // synthesize a struct — collected here so they emit BEFORE the View
  // struct opens (the decl loop runs later). Without this, the signal
  // type emit (emitSwiftDecl → swiftType, no synth) degrades: a
  // single-field inline object can't form a 1-element labeled tuple →
  // falls back to the bare field type (`[Int]`), so member access
  // (`item.price`) fails `swiftc -typecheck`. Side-effect only — the
  // returned string is discarded; emitSwiftDecl re-resolves to the same
  // (deterministic) synthesized name below.
  for (const d of c.decls) {
    if (d.kind === 'signal') swiftType(d.type, synth, d.name)
  }
  for (const s of synth.structs) {
    lines.push(emitSwiftStruct(s))
    lines.push('')
  }
  if (isLayout) {
    lines.push(`struct ${swiftIdent(c.name)}<Content: View>: View {`)
  } else {
    lines.push(`struct ${swiftIdent(c.name)}: View {`)
  }
  lines.push(...propLines)
  if (isLayout) {
    lines.push(`  @ViewBuilder var content: () -> Content`)
  }
  // C4: when the component uses router hooks (useNavigate/useParams),
  // inject the SwiftUI Environment property so the hook call sites can
  // pass the active router to the runtime `useNavigate(router:)` /
  // `useParams(router:)` functions. Without this, SwiftUI's Environment
  // isn't readable from free functions — the runtime APIs take router
  // as an explicit arg.
  if (_usesRouter) {
    lines.push(
      `  @Environment(\\.pyreonRouter) private var pyreonRouter: PyreonRouter?`,
    )
  }
  // Phase 4 follow-up: useColorScheme injection. SwiftUI's
  // `@Environment(\.colorScheme)` is the system-supplied "light"
  // or "dark" appearance — no runtime port needed (the platform
  // ships the primitive). Each useColorScheme decl's computed
  // property reads `pyreonColorScheme` to derive the "light"/"dark"
  // string.
  if (_usesColorScheme) {
    lines.push(
      `  @Environment(\\.colorScheme) private var pyreonColorScheme: ColorScheme`,
    )
  }
  for (const d of c.decls) {
    // Phase 5b: value consts are body-local `let`s (a stored `let` property
    // can't reference @State at init), emitted just below — skip here.
    if (d.kind === 'value') continue
    // on-mount decls emit at the HARNESS level (.onAppear after the body,
    // on the stable-identity host) — no stored property.
    if (d.kind === 'on-mount') continue
    lines.push(`  ${emitSwiftDecl(d, inferCtx, synth)}`)
  }
  lines.push(`  var body: some View {`)
  // Phase 5b: plain value consts as body-local `let`s at the top of the
  // ViewBuilder (Swift infers the type; they may read @State properties).
  // Source order preserved so a value const can reference an earlier one.
  for (const d of c.decls) {
    if (d.kind === 'value') {
      lines.push(`    let ${swiftIdent(d.name)} = ${emitSwiftExpr(d.expr, 4)}`)
    }
  }
  // While emitting a layout's body, its `<RouterView />` emits `content()`.
  _emittingLayoutComponentSwift = isLayout
  // When the component has a useFetch decl, the appended `.task { }` MUST
  // attach to a STABLE-identity view. A bare `Group { if isPending … }`
  // (what `<Suspense>` / `<ErrorBoundary>` emit) is transparent —
  // SwiftUI redistributes `.task` onto the if/else BRANCH, so every time
  // the loading/error flag flips the branch's identity changes and the
  // task is cancelled + restarted → the fetch perpetually thrashes and
  // never settles (device-found: the boundary renders nothing — not even
  // its fallback). Wrapping the body in a concrete `ZStack` gives `.task`
  // a stable host that fires ONCE on appear; the inner conditional's
  // flips no longer touch the ZStack's identity. (Non-fetch components
  // keep the bare body — no `.task`, no restart hazard.)
  const _hasFetchDecl = c.decls.some((d) => d.kind === 'fetch')
  // on-mount shares the stable-identity requirement: .onAppear on a
  // transparent Group is redistributed onto conditional branches and
  // RE-FIRES per flip — the same device-found class as .task.
  const _hasOnMount = c.decls.some((d) => d.kind === 'on-mount')
  if (_hasFetchDecl || _hasOnMount) {
    lines.push(`    ZStack {`)
    lines.push(`      ${emitSwiftExpr(c.returnExpr, 6)}`)
    lines.push(`    }`)
  } else {
    lines.push(`    ${emitSwiftExpr(c.returnExpr, 4)}`)
  }
  _emittingLayoutComponentSwift = false
  // Phase 4: append a mount-time `.task { }` per useFetch decl. SwiftUI
  // runs `.task` when the view appears (the natural async-on-mount hook);
  // it drives the PyreonFetch state machine via begin → resolve|reject,
  // awaiting URLSession + decoding into the typed result.
  // Form-binding arc: attach env/instance-capturing onSubmit callbacks
  // post-init (see the form-decl emit's comment for why init can't).
  for (const d of c.decls) {
    if (d.kind !== 'form' || d.onSubmit === undefined) continue
    const name = swiftIdent(d.name)
    const bodyLines = d.onSubmit.body
      .map((st) => `          ${emitSwiftStatement(st, 10)}`)
      .join('\n')
    lines.push(`      .onAppear {`)
    lines.push(`        ${name}.onSubmit = { ${swiftIdent(d.onSubmit.param)} in`)
    lines.push(bodyLines)
    lines.push(`        }`)
    lines.push(`      }`)
  }
  // onMount bodies → .onAppear on the stable host (sync statements; the
  // async-on-mount hook stays .task/useFetch). Multiple onMount calls emit
  // in source order.
  for (const d of c.decls) {
    if (d.kind !== 'on-mount') continue
    const savedLocals = seedHandlerLocals(d.body, _exprInferCtx)
    const bodyLines = d.body.map((st) => `        ${emitSwiftStatement(st, 8)}`).join('\n')
    _exprInferCtx.locals = savedLocals
    lines.push(`      .onAppear {`)
    lines.push(bodyLines)
    lines.push(`      }`)
  }
  for (const d of c.decls) {
    if (d.kind !== 'fetch') continue
    const name = swiftIdent(d.name)
    lines.push(`      .task {`)
    lines.push(`        ${name}.begin()`)
    lines.push(`        do {`)
    lines.push(
      `          let (bytes, _) = try await URLSession.shared.data(from: URL(string: ${JSON.stringify(d.url)})!)`,
    )
    lines.push(`          ${name}.resolve(try JSONDecoder().decode(${swiftType(d.type)}.self, from: bytes))`)
    lines.push(`        } catch { ${name}.reject(error) }`)
    lines.push(`      }`)
  }
  lines.push(`  }`)
  lines.push(`}`)
  _activePropsParamName = undefined
  _signalEnumTypes = new Map()
  _signalNames = new Set()
  _functionNames = new Set()
  _usesRouter = false
  _routerRoutes = new Map()
  return lines.join('\n')
}

/**
 * Inline component-body value-consts into an expression by substituting
 * each value-const identifier with its defining expression (recursively,
 * to a fixpoint — so a const referencing another const fully resolves).
 * Used when emitting struct-level computeds, which can't reference the
 * body-local `let`s the value-consts emit as. Bounded passes guard
 * against a (malformed) cyclic const chain. Returns the expr unchanged
 * when there are no value-consts (zero cost for the common case).
 */
/**
 * Collect every component-level identifier that is REASSIGNED (an `x++` / `x--`
 * update, or an `x = …` assignment) inside a handler / function / computed body.
 * These are non-const bindings (`let nextId = 1; nextId++`), so a value-const of
 * the same name must NOT be inlined (substituting its initial value breaks the
 * mutation). A generic deep-walk over the IR (any node with a `kind`; recurse
 * into every field) so no expr/statement shape is missed. A value-const's OWN
 * initializer is never walked (only body-bearing decls), so a plain `const x =
 * 5` is never spuriously flagged.
 */
function collectMutatedComponentVars(decls: DeclIR[]): Set<string> {
  const mutated = new Set<string>()
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const el of node) visit(el)
      return
    }
    const n = node as { kind?: string; argument?: unknown; target?: unknown }
    if (n.kind === 'update') {
      const a = n.argument as { kind?: string; name?: string } | undefined
      if (a?.kind === 'identifier' && typeof a.name === 'string') mutated.add(a.name)
    } else if (n.kind === 'assign') {
      const t = n.target as { kind?: string; name?: string } | undefined
      if (t?.kind === 'identifier' && typeof t.name === 'string') mutated.add(t.name)
    }
    for (const v of Object.values(n as Record<string, unknown>)) visit(v)
  }
  for (const d of decls) {
    if (d.kind === 'function') visit(d.body)
    else if (d.kind === 'computed') {
      visit((d as { body?: unknown }).body)
      visit((d as { expr?: unknown }).expr)
    }
  }
  return mutated
}

function inlineValueConsts(expr: ExprIR): ExprIR {
  if (_componentValueConstExprs.size === 0) return expr
  let cur = expr
  for (let pass = 0; pass <= _componentValueConstExprs.size; pass++) {
    const before = JSON.stringify(cur)
    for (const [name, def] of _componentValueConstExprs) {
      // Wrap the inlined definition in parens so precedence is preserved:
      // `b * 10` with `b = a + 1` must inline to `(a + 1) * 10`, NOT
      // `a + 1 * 10`. Redundant parens on a bare literal/identifier are
      // harmless and compile fine.
      const next = substituteIdentifier(cur, name, { kind: 'paren', inner: def })
      if (next !== null) cur = next
    }
    if (JSON.stringify(cur) === before) break
  }
  return cur
}

/**
 * Apply `inlineValueConsts` to every expression inside a statement tree
 * (multi-statement computed bodies). Recurses into nested blocks. Same
 * rationale as the single-expression path — a struct-level computed
 * getter can't see body-local value-const `let`s.
 */
function inlineValueConstsInStmts(stmts: StatementIR[]): StatementIR[] {
  if (_componentValueConstExprs.size === 0) return stmts
  const mapStmt = (s: StatementIR): StatementIR => {
    switch (s.kind) {
      case 'let':
        return { ...s, expr: inlineValueConsts(s.expr) }
      case 'assign':
        return { ...s, target: inlineValueConsts(s.target), value: inlineValueConsts(s.value) }
      case 'if':
        return {
          ...s,
          cond: inlineValueConsts(s.cond),
          then: s.then.map(mapStmt),
          ...(s.elseBody ? { elseBody: s.elseBody.map(mapStmt) } : {}),
        }
      case 'return':
        return s.expr ? { ...s, expr: inlineValueConsts(s.expr) } : s
      case 'expr':
        return { ...s, expr: inlineValueConsts(s.expr) }
      case 'while':
        return { ...s, cond: inlineValueConsts(s.cond), body: s.body.map(mapStmt) }
      case 'for-of':
        return { ...s, iterable: inlineValueConsts(s.iterable), body: s.body.map(mapStmt) }
      case 'switch':
        return {
          ...s,
          discriminant: inlineValueConsts(s.discriminant),
          cases: s.cases.map((c) => ({
            tests: c.tests.map(inlineValueConsts),
            body: c.body.map(mapStmt),
          })),
        }
    }
  }
  return stmts.map(mapStmt)
}

function emitSwiftDecl(
  d: DeclIR,
  inferCtx: ReturnType<typeof buildInferenceCtx>,
  synth?: SwiftSynthCtx,
): string {
  // on-mount emits at the harness level (see emitSwiftComponent) — the
  // caller skips it; this defensive return keeps the union narrowed.
  if (d.kind === 'on-mount') return ''
  // Phase 5b: a plain value const. Normally emitted as a body-local `let` by
  // emitSwiftComponent (a stored property can't reference @State at init);
  // this defensive case keeps the emit total if reached elsewhere.
  if (d.kind === 'value') {
    return `let ${swiftIdent(d.name)} = ${emitSwiftExpr(d.expr, 2)}`
  }
  if (d.kind === 'signal') {
    // Pass the synth ctx so an inline anonymous object type in the
    // signal generic synthesizes (or reuses) a struct instead of
    // degrading — the structs were pre-collected + emitted by
    // emitSwiftComponent; `synthesizeSwiftTypeName` is deterministic so
    // this resolves to the same name. `d.name` drives the struct name.
    const type = swiftType(d.type, synth, d.name)
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
      // @pyreon/native-runtime-swift — collapses the previous
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
    return emitSwiftFunction(d, 'private', inferCtx)
  }
  // C4: router instance — `const router = createRouter({...})` →
  // `@State private var router = PyreonRouter()`. SwiftUI's `@State`
  // is the canonical wrapper for view-owned mutable state; the
  // PyreonRouter class is @Observable so changes to its `path` stack
  // propagate to NavigationStack(path:) via SwiftUI's Observation
  // framework. The createRouter() routes config is dropped — routes
  // are wired by the host via `.navigationDestination(for:)`.
  if (d.kind === 'router') {
    // Round-2 follow-up: when `createRouter({ beforeEach: [fn] })` /
    // `afterEach: [fn]` is configured, emit a closure-init that
    // constructs the router AND appends each guard fn ref before
    // returning. Without guards, falls through to the bare init.
    const hasGuards =
      (d.beforeEach !== undefined && d.beforeEach.length > 0) ||
      (d.afterEach !== undefined && d.afterEach.length > 0)
    if (!hasGuards) {
      return `@State private var ${swiftIdent(d.name)} = PyreonRouter()`
    }
    const lines: string[] = [
      '{',
      '    let r = PyreonRouter()',
    ]
    for (const fn of d.beforeEach ?? []) {
      lines.push(`    r.beforeEachGuards.append(${swiftIdent(fn)})`)
    }
    for (const fn of d.afterEach ?? []) {
      lines.push(`    r.afterEachHooks.append(${swiftIdent(fn)})`)
    }
    lines.push('    return r')
    lines.push('  }()')
    return `@State private var ${swiftIdent(d.name)}: PyreonRouter = ${lines.join('\n  ')}`
  }
  // C4: router hook — `const navigate = useNavigate()` →
  // `private var navigate: (String) -> Void { useNavigate(router:
  // pyreonRouter) }`. MUST be a computed property (not stored `let`):
  // SwiftUI @Environment properties aren't readable at struct-init
  // time (when stored let-initializers run), only at body-resolution
  // time. Computed properties are called on every body access AFTER
  // @Environment is set — the canonical SwiftUI pattern for
  // env-dependent derivations. `useParams()` follows the same shape;
  // return types are per the runtime's signature ((String) -> Void
  // for navigate, [String: String] for params).
  if (d.kind === 'router-hook') {
    const fn = d.hook === 'navigate' ? 'useNavigate' : 'useParams'
    const returnType =
      d.hook === 'navigate' ? '(String) -> Void' : '[String: String]'
    return `private var ${swiftIdent(d.name)}: ${returnType} { ${fn}(router: pyreonRouter) }`
  }
  // Phase 4: `const x = useFetch<T>('/url')` → an @State PyreonFetch<T>
  // container. The mount-time async harness (`.task { ... }`) that drives
  // it is appended to the View body by emitSwiftComponent — it reads
  // `data`/`isPending`/`error` as @Observable properties directly.
  if (d.kind === 'fetch') {
    return `@State private var ${swiftIdent(d.name)} = PyreonFetch<${swiftType(d.type)}>()`
  }
  // Phase 4.2: `const form = useForm({ initialValues })` → an @State
  // PyreonForm container seeded with the literal string defaults. Unlike
  // useFetch there is NO mount-time harness — a form is pure reactive state;
  // its fields (`values`/`errors`/`isSubmitting`/`isValid`) are read as
  // @Observable properties directly.
  if (d.kind === 'form') {
    const parts: string[] = []
    if (d.initialValues.length) {
      parts.push(
        `initialValues: [${d.initialValues
          .map((p) => `${JSON.stringify(p.key)}: ${JSON.stringify(p.value)}`)
          .join(', ')}]`,
      )
    }
    // v2 (form-binding arc) — validators emit as Swift closures in the
    // init dictionary; "" = valid, anything else is the error message.
    if (d.validators !== undefined && d.validators.length > 0) {
      const entries = d.validators
        .map(
          (v) =>
            `${JSON.stringify(v.key)}: { ${swiftIdent(v.param)} in ${emitSwiftExpr(v.body, 0)} }`,
        )
        .join(', ')
      parts.push(`validators: [${entries}]`)
    }
    // onSubmit is NOT an init argument on Swift: @State property
    // initializers run before `self` exists, and the callback's body
    // almost always captures instance members (`navigate`, store
    // writes). It attaches via `.onAppear { form.onSubmit = { … } }`
    // on the component body instead — see the post-body loop in
    // emitSwiftComponent (mirrors the useFetch `.task` harness).
    return `@State private var ${swiftIdent(d.name)} = PyreonForm(${parts.join(', ')})`
  }
  // Phase 4: `const net = useOnline()` → an @State PyreonNetworkStatus. The
  // `net.isOnline` read is a plain @Observable property (no rewrite on Swift).
  if (d.kind === 'network-status') {
    return `@State private var ${swiftIdent(d.name)} = PyreonNetworkStatus()`
  }
  // Phase 5: native data/services hooks → @State container instantiation.
  // Swift containers expose reactive fields via @Observable (read bare, no
  // rewrite) + default (or generic-only) constructors. The lifecycle
  // auto-start (geolocation.start / websocket.connect / push.start) is a
  // tracked follow-up — the binding + reactive reads ship now; the
  // `onMount(() => ws.connect())` escape hatch LOWERS (see the on-mount
  // decl harness) — Swift threads the url into connect(to:); Kotlin's
  // connect needs a host transport (named warning) until the default-
  // OkHttp-transport follow-up lands.
  if (d.kind === 'geolocation') {
    return `@State private var ${swiftIdent(d.name)} = PyreonGeolocation()`
  }
  if (d.kind === 'websocket') {
    return `@State private var ${swiftIdent(d.name)} = PyreonWebSocket()`
  }
  if (d.kind === 'database') {
    return `@State private var ${swiftIdent(d.name)} = PyreonDatabase()`
  }
  if (d.kind === 'push') {
    return `@State private var ${swiftIdent(d.name)} = PyreonPushNotifications()`
  }
  if (d.kind === 'payments') {
    return `@State private var ${swiftIdent(d.name)} = PyreonPayments()`
  }
  if (d.kind === 'map') {
    return `@State private var ${swiftIdent(d.name)} = PyreonMapState()`
  }
  if (d.kind === 'auth') {
    return `@State private var ${swiftIdent(d.name)} = PyreonAuth<${swiftType(d.userType)}>()`
  }
  // Phase B6: `const data = useLoaderData<User>()` → a COMPUTED
  // property reading the active router's loaderData entry for the
  // current path, type-cast to T?. MUST be computed (not stored let):
  // the initializer references `pyreonRouter` (@Environment), which
  // isn't readable at stored-let-init time — same constraint
  // useParams + useColorScheme document.
  //
  // Emit shape:
  //   private var data: User? { useLoaderData(router: pyreonRouter) }
  //
  // The runtime's `useLoaderData<T>(router:)` helper handles the
  // optional-router + cast-on-mismatch defensive defaults — returns
  // nil when router is absent, when no loaderData entry exists for
  // currentPath, or when the stored value doesn't cast to T.
  if (d.kind === 'useLoaderData') {
    const ty = swiftType(d.type)
    return `private var ${swiftIdent(d.name)}: ${ty}? { useLoaderData(router: pyreonRouter) }`
  }
  // Phase 3: `const { id } = useParams()` → one COMPUTED property per field,
  // each reading the active router's params map. MUST be computed (not stored
  // `let`): the initializer references `pyreonRouter` (@Environment), which
  // isn't readable at stored-property-init time — same constraint the
  // useNavigate/useParams router-hook emit documents above. Multi-field
  // destructures emit one line each (caller indents the first; rest self-indent).
  if (d.kind === 'params-destructure') {
    return d.params
      .map(
        (p) =>
          `private var ${swiftIdent(p.local)}: String { useParams(router: pyreonRouter)[${JSON.stringify(p.key)}] ?? "" }`,
      )
      .join('\n  ')
  }
  // Phase 4: `const can = usePermissions([...])` → an @State PyreonPermissions
  // seeded with the literal grant keys. Reads are method calls
  // (`can.can("x")`), so no field-read rewrite — plain method emit on Swift.
  if (d.kind === 'permissions') {
    const seed = d.grants.length
      ? `[${d.grants.map((g) => JSON.stringify(g)).join(', ')}]`
      : ''
    return `@State private var ${swiftIdent(d.name)} = PyreonPermissions(${seed})`
  }
  // Phase 4: `const cb = useClipboard()` → an @State PyreonClipboard.
  // Reads are method calls (`cb.copy("hi")`) + a Bool field
  // (`cb.copied`), so no `.value` rewrite — Swift exposes both as
  // plain properties on the @Observable container.
  if (d.kind === 'clipboard') {
    return `@State private var ${swiftIdent(d.name)} = PyreonClipboard()`
  }
  // Gap 4 PR-3: `const i18n = createI18n({...})` → @State PyreonI18n.
  // Method `i18n.t(key)` flows through unchanged (PyreonI18n.t(_:)
  // is defined on the runtime container). Read access to `i18n.locale`
  // is the plain String property.
  if (d.kind === 'i18n') {
    const msgEntries = Object.entries(d.messages)
      .map(([loc, kv]) => {
        const inner = Object.entries(kv)
          .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
          .join(', ')
        return `${JSON.stringify(loc)}: ${inner === '' ? '[:]' : `[${inner}]`}`
      })
      .join(', ')
    const msgLit = msgEntries === '' ? '[:]' : `[${msgEntries}]`
    const fbArg =
      d.fallbackLocale !== undefined
        ? `, fallbackLocale: ${JSON.stringify(d.fallbackLocale)}`
        : ''
    return `@State private var ${swiftIdent(d.name)} = PyreonI18n(locale: ${JSON.stringify(d.locale)}, messages: ${msgLit}${fbArg})`
  }
  // Gap 4 PR-2: `const m = createMachine({ initial, states })` → an
  // @State PyreonMachine seeded with the literal initial state +
  // transitions table. Method calls (`m.send`/`m.matches`/`m.can`/
  // `m.nextEvents`) flow through unchanged because the runtime
  // container defines them. The `m()` read-current-state syntax
  // also works unchanged via Swift's `callAsFunction()`.
  if (d.kind === 'machine') {
    const transEntries = Object.entries(d.transitions)
      .map(([state, events]) => {
        const eventEntries = Object.entries(events)
          .map(
            ([event, next]) =>
              `${JSON.stringify(event)}: ${JSON.stringify(next)}`,
          )
          .join(', ')
        // Empty inner event map → `[:]` (Swift empty-dict literal);
        // a bare `[]` parses as empty Array, not Dictionary, and
        // fails typecheck against the [String: String] inner value.
        const inner = eventEntries === '' ? '[:]' : `[${eventEntries}]`
        return `${JSON.stringify(state)}: ${inner}`
      })
      .join(', ')
    // Empty outer transitions map → `[:]` for the same reason.
    const transLit = transEntries === '' ? '[:]' : `[${transEntries}]`
    return `@State private var ${swiftIdent(d.name)} = PyreonMachine(initial: ${JSON.stringify(d.initial)}, transitions: ${transLit})`
  }
  // Phase 4 follow-up: `const scheme = useColorScheme()` → a computed
  // property reading the View's @Environment(\.colorScheme) injection
  // (added at the component-emit level via _usesColorScheme). Returns
  // a `"light" | "dark"` string for parity with the web hook so
  // cross-platform code reading `scheme === 'dark'` works on all
  // three targets. Computed (not stored let) because @Environment
  // isn't readable at stored-property-init time — same constraint
  // the router hooks document.
  if (d.kind === 'color-scheme') {
    return `private var ${swiftIdent(d.name)}: String { pyreonColorScheme == .dark ? "dark" : "light" }`
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
    // Seed this computed body's LOCAL `const`/`let` types into the infer ctx so
    // a later type-dependent emit inside the body resolves them — e.g. `const
    // found = todos.find(…); return found ? found.text : "…"` now sees `found`
    // is optional and lowers the ternary condition to `found != nil`. The
    // computed-body emit is the third statement-body path (after handler /
    // function-decl decls) — without this, a computed-body-LOCAL optional in a
    // condition emitted the bare optional (a non-Bool condition). Restored
    // after (scoped to this body).
    const inlinedStmts = inlineValueConstsInStmts(d.body)
    const savedLocals = seedHandlerLocals(inlinedStmts, _exprInferCtx)
    const bodyLines = inlinedStmts
      .map((s) => `    ${emitSwiftStatement(s, 4)}`)
      .join('\n')
    _exprInferCtx.locals = savedLocals
    return [
      `private var ${swiftIdent(d.name)}: ${swiftReturnType} {`,
      bodyLines,
      `  }`,
    ].join('\n')
  }
  // Legacy single-expression shape — same pre-computed lookup. Inline any
  // referenced value-consts (body-local `let`s the struct-level computed
  // can't see) so the emitted getter compiles.
  const inferred = inferCtx.computeds.get(d.name) ?? inferType(d.expr!, inferCtx)
  const swiftReturnType = swiftType(inferred)
  return `private var ${swiftIdent(d.name)}: ${swiftReturnType} { ${emitSwiftExpr(inlineValueConsts(d.expr!), 0)} }`
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
  visibility: 'private' | 'internal' = 'private',
  inferCtx?: ReturnType<typeof buildInferenceCtx>,
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
  // Render return-type clause. If the declared type is `unknown`, INFER it
  // from the body's return expr (`(x: number) => x * 2` → `-> Int`) so a
  // value-returning function isn't emitted as a Void func (which drops the
  // result — a real-build error when the call is used as a value). Inference
  // returns `unknown` when unsure → still no annotation (current behavior).
  let returnType = d.returnType
  if (returnType.kind === 'unknown' && inferCtx !== undefined) {
    returnType = inferReturnType(d.params, d.body, inferCtx)
  }
  const retType = returnType.kind === 'unknown' ? '' : ` -> ${swiftType(returnType)}`
  // Single-statement single-return concise form.
  if (
    d.body.length === 1 &&
    d.body[0]!.kind === 'return' &&
    d.body[0]!.expr !== undefined
  ) {
    const concise = emitSwiftExpr(inlineValueConsts((d.body[0]! as { expr: ExprIR }).expr), 0)
    const vis = visibility === 'private' ? 'private ' : ''
    return `${vis}func ${swiftIdent(d.name)}(${params})${retType} { ${concise} }`
  }
  // Inline component value-consts into the body — a `private func` handler,
  // like a struct-level computed, can't reference the body-local `let`s the
  // value-consts emit as (`if step < steps.count` where `const steps = […]`
  // → "cannot find 'steps' in scope"). Same inline the computed path uses.
  const inlinedBody = inlineValueConstsInStmts(d.body)
  // Seed this function's LOCAL `const`/`let` types into the infer ctx so a
  // later type-dependent emit in the body resolves them — the named-handler
  // analog of the inline-handler seeding in emitSwiftAction (`const onTap = ()
  // => { const t = todos.find(…); if (t) { … } }` → `if t != nil`). Restored
  // after (scoped to this body).
  const savedLocals = seedHandlerLocals(inlinedBody, _exprInferCtx)
  const bodyLines = inlinedBody.map((s) => `    ${emitSwiftStatement(s, 4)}`).join('\n')
  _exprInferCtx.locals = savedLocals
  const vis2 = visibility === 'private' ? 'private ' : ''
  return `${vis2}func ${swiftIdent(d.name)}(${params})${retType} {\n${bodyLines}\n  }`
}

/**
 * Emit a CONDITION expression with optional-truthiness lowering. JS coerces an
 * optional to truthy-when-present (and `!optional` truthy-when-absent), but
 * Swift requires a `Bool` — so a bare optional `t` → `t != nil`, a `!t` → `t ==
 * nil`, everything else verbatim. `emit` is the caller's expr emitter (the
 * standard `emitSwiftExpr` for ternary / `&&` / `if` / `while`; the accessor-
 * aware `emitSwiftSignalRead` for `<Show when>`). One helper, all condition
 * sites — see `classifyOptionalCondition` for the shared form definition.
 */
function swiftCondition(e: ExprIR, emit: (x: ExprIR) => string): string {
  const c = classifyOptionalCondition(e, _exprInferCtx)
  if (c?.form === 'absent') return `${emit(c.argument)} == nil`
  if (c?.form === 'present') return `${emit(e)} != nil`
  return emit(e)
}

function emitSwiftStatement(s: StatementIR, indent: number): string {
  switch (s.kind) {
    case 'let':
      // `var` when a later `assign` reassigns this local (markReassigned-
      // LocalsMutable), else immutable `let`.
      return `${s.mutable ? 'var' : 'let'} ${swiftIdent(s.name)} = ${emitSwiftExpr(s.expr, indent)}`
    case 'assign':
      return `${emitSwiftExpr(s.target, indent)} ${s.op} ${emitSwiftExpr(s.value, indent)}`
    case 'return':
      return s.expr ? `return ${emitSwiftExpr(s.expr, indent)}` : 'return'
    case 'expr':
      // A bare `i++` / `i--` STATEMENT is side-effect-only → `i += 1` /
      // `i -= 1`. The general `update` expr emit is a value-position IIFE
      // (returns the OLD value), correct in value position but mis-compiles
      // as a statement (`{ let v = i; i += 1; return v }()` → "cannot call
      // value of non-function type"). Swift removed `++`/`--` in Swift 3.
      if (s.expr.kind === 'update') {
        return `${emitSwiftExpr(s.expr.argument, indent)} ${s.expr.op === '++' ? '+=' : '-='} 1`
      }
      return emitSwiftExpr(s.expr, indent)
    case 'if': {
      const pad = ' '.repeat(indent)
      const cond = swiftCondition(s.cond, (x) => emitSwiftExpr(x, indent))
      const thenLines = s.then.map((t) => `${pad}  ${emitSwiftStatement(t, indent + 2)}`).join('\n')
      const head = `if ${cond} {\n${thenLines}\n${pad}}`
      if (!s.elseBody) return head
      const elseLines = s.elseBody
        .map((t) => `${pad}  ${emitSwiftStatement(t, indent + 2)}`)
        .join('\n')
      return `${head} else {\n${elseLines}\n${pad}}`
    }
    case 'while': {
      const pad = ' '.repeat(indent)
      const cond = swiftCondition(s.cond, (x) => emitSwiftExpr(x, indent))
      const lines = s.body
        .map((t) => `${pad}  ${emitSwiftStatement(t, indent + 2)}`)
        .join('\n')
      return `while ${cond} {\n${lines}\n${pad}}`
    }
    case 'for-of': {
      const pad = ' '.repeat(indent)
      const iter = emitSwiftExpr(s.iterable, indent)
      const lines = s.body
        .map((t) => `${pad}  ${emitSwiftStatement(t, indent + 2)}`)
        .join('\n')
      return `for ${swiftIdent(s.item)} in ${iter} {\n${lines}\n${pad}}`
    }
    case 'switch': {
      const pad = ' '.repeat(indent)
      const disc = emitSwiftExpr(s.discriminant, indent)
      const caseLines = s.cases
        .map((c) => {
          const bodyLines = c.body
            .map((t) => `${pad}    ${emitSwiftStatement(t, indent + 4)}`)
            .join('\n')
          // A Swift `case` body cannot be empty — emit `break` as a no-op.
          const body = bodyLines.length > 0 ? bodyLines : `${pad}    break`
          if (c.tests.length === 0) return `${pad}  default:\n${body}`
          const labels = c.tests.map((t) => emitSwiftExpr(t, indent)).join(', ')
          return `${pad}  case ${labels}:\n${body}`
        })
        .join('\n')
      // Swift `switch` must be EXHAUSTIVE — a String/Int discriminant needs
      // a `default`. Append one (no-op) when the source omitted it.
      const hasDefault = s.cases.some((c) => c.tests.length === 0)
      const defaultClause = hasDefault ? '' : `\n${pad}  default:\n${pad}    break`
      return `switch ${disc} {\n${caseLines}${defaultClause}\n${pad}}`
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

/**
 * Synthesis context for anonymous-object prop types — mirrors
 * emit-kotlin's `KotlinCtx.synthesizedDataClasses`. When `swiftType`
 * hits an `object` TypeIR with a ctx present, it registers a named
 * struct (emitted before the component) instead of degrading to a
 * tuple. Tuples were the original placeholder and are BROKEN for the
 * real shapes: a single-field labeled tuple `(id: String)` is a Swift
 * PARSE error, and key paths (`ForEach(items, id: \.id)`) cannot
 * reference tuple elements at all.
 */
interface SwiftSynthCtx {
  componentName: string
  structs: StructIR[]
}

/**
 * `UserPage` + `params` → `UserPageParam`; `TasksListPage` + `tasks` →
 * `TasksListPageTask`. EXACT mirror of emit-kotlin's
 * `synthesizeDataClassName` so the two targets agree on names —
 * cross-target symmetry is load-bearing for docs + tests.
 */
function synthesizeSwiftTypeName(componentName: string, declName?: string): string {
  if (!declName) return `${componentName}Data`
  const stripped = declName.endsWith('s') ? declName.slice(0, -1) : declName
  return componentName + stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

export function swiftType(t: TypeIR, synth?: SwiftSynthCtx, declName?: string): string {
  switch (t.kind) {
    case 'number':
      // Fractional literal → Double; integer → Int (ergonomic default).
      return t.float === true ? 'Double' : 'Int'
    case 'string':
      return 'String'
    case 'boolean':
      return 'Bool'
    case 'array':
      return `[${swiftType(t.element, synth, declName)}]`
    case 'object': {
      // Structural match against a DECLARED struct first (same lookup
      // the object-literal expression emit uses) so a prop typed
      // `{ id: number; text: string; done: boolean }` resolves to the
      // user's own `Todo` struct when one exists — prop type and
      // literal construction then agree on one nominal type.
      const key = t.fields.map((f) => f.name).sort().join(',')
      const declared = _structFieldsToName.get(key)
      if (declared !== undefined) return declared
      if (synth !== undefined) {
        const name = synthesizeSwiftTypeName(synth.componentName, declName)
        if (!synth.structs.some((s) => s.name === name)) {
          synth.structs.push({ name, fields: t.fields })
        }
        // Register THIS synthesized name under the field-shape key so the
        // VALUE path (object-literal emit, which looks up `_structFieldsToName`
        // by the same field-names key) reuses it instead of synthesizing a
        // DIVERGENT `__ObjN`. @State emits the type annotation BEFORE the
        // value, so this is populated in time — without it, an untyped
        // `signal({ x: 1 })` emitted `var o: AppO = __Obj0(...)` (annotation
        // ≠ value struct) and failed swiftc.
        if (!_structFieldsToName.has(key)) _structFieldsToName.set(key, name)
        return name
      }
      // No synthesis context (legacy positions). A single-field labeled
      // tuple is ILLEGAL Swift ("cannot create a single-element tuple
      // with an element label") — degrade to the bare field type so the
      // emit at least parses; member access on it won't typecheck, which
      // swiftc reports at the use site.
      if (t.fields.length === 1) return swiftType(t.fields[0]!.type)
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
      return swiftUnionType(t.branches, synth, declName)
    case 'typeRef': {
      // `Foo` → `Foo`; `Array<T>` → `[T]`; `Promise<T>` → emit a
      // sentinel that compiles in Swift (the actual async lowering
      // happens in PR 5e). Other typeRefs pass through verbatim.
      if (t.name === 'Array' && t.args.length === 1) {
        return `[${swiftType(t.args[0]!, synth, declName)}]`
      }
      if (t.name === 'Promise' && t.args.length === 1) {
        // Promise<T> → Task<T, Error> on Swift. For Phase 0 we emit
        // `Task<T, Error>` and document the limitation; PR 5e refines.
        return `Task<${swiftType(t.args[0]!, synth, declName)}, Error>`
      }
      if (t.args.length === 0) return t.name
      // Explicit lambda — point-free `.map(swiftType)` would pass the
      // array index into the `synth` parameter slot.
      return `${t.name}<${t.args.map((a) => swiftType(a, synth, declName)).join(', ')}>`
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
function swiftUnionType(
  branches: TypeIR[],
  synth?: SwiftSynthCtx,
  declName?: string,
): string {
  const nonNullBranches = branches.filter(
    (b) => b.kind !== 'null' && b.kind !== 'undefined',
  )
  const hasNullish = branches.some((b) => b.kind === 'null' || b.kind === 'undefined')
  if (nonNullBranches.length === 1 && hasNullish) {
    // A FUNCTION branch must be parenthesized before the `?` — a bare
    // `() -> Void?` is a function RETURNING `Void?`, not an optional
    // function. `(() -> Void)?` is the optional-closure type. For a
    // non-function branch, thread synth/declName so an OPTIONAL
    // anonymous-object type (`config?: { a: number }`) still synthesizes
    // a named struct (`Config?`) instead of degrading.
    const only = nonNullBranches[0]!
    const inner = swiftType(only, synth, declName)
    return only.kind === 'function' ? `(${inner})?` : `${inner}?`
  }
  if (nonNullBranches.length === 0) return 'Any?'
  // Mixed-type union — Swift can't express it structurally; degrade.
  return 'Any'
}

/**
 * Emit an index-callback closure `{ (idx, el) in <body> }` for the enumerated()
 * array methods (map / forEach / filter / contains / allSatisfy / first-where).
 * Handles a MULTI-statement block body via `cb.stmts` (mirroring
 * `emitSwiftAction`), not just a single expression — reading only `cb.body` (the
 * empty-literal SENTINEL a block body parses to) silently DROPPED the whole body
 * and compiled clean.
 */
function emitSwiftIndexedClosure(
  cb: Extract<ExprIR, { kind: 'arrow' }>,
  idx: string,
  el: string,
  indent: number,
  receiver?: ExprIR,
): string {
  // Bind the callback params' TYPES for the body emit — the indexed sibling
  // of `emitSwiftMemberCallArgs`'s element scoping: without it the element
  // param inferred `unknown` inside the closure, so the Int×Double coercion
  // never fired (`.map((x, i) => x * 1.5)` emitted the bare `x * 1.5` —
  // "cannot convert value of type 'Int' to expected argument type
  // 'Double'"). The element param gets the receiver's element type; the
  // index param is always Int (enumerated()'s offset). Bound by the JS
  // param names (inference looks identifiers up by IR name, not the
  // swiftIdent-mapped emit name). Restored via try/finally so sibling /
  // nested closures each see their own bindings.
  const elJs = cb.params[0]
  const idxJs = cb.params[1]
  const recvT = receiver !== undefined ? inferType(receiver, _activeInferCtx) : undefined
  const bind: Array<[string, boolean, TypeIR | undefined]> = []
  const setLocal = (name: string | undefined, t: TypeIR) => {
    if (name === undefined) return
    bind.push([name, _exprInferCtx.locals.has(name), _exprInferCtx.locals.get(name)])
    _exprInferCtx.locals.set(name, t)
  }
  if (recvT !== undefined && recvT.kind === 'array') setLocal(elJs, recvT.element)
  setLocal(idxJs, { kind: 'number' })
  try {
    if (cb.stmts !== undefined && cb.stmts.length > 0) {
      const pad = ' '.repeat(indent + 2)
      const inlinedStmts = inlineValueConstsInStmts(cb.stmts)
      const savedLocals = seedHandlerLocals(inlinedStmts, _exprInferCtx)
      const lines = inlinedStmts.map((s) => pad + emitSwiftStatement(s, indent + 2)).join('\n')
      _exprInferCtx.locals = savedLocals
      return `{ (${idx}, ${el}) in\n${lines}\n${' '.repeat(indent)}}`
    }
    return `{ (${idx}, ${el}) in ${emitSwiftExpr(cb.body, indent)} }`
  } finally {
    for (const [name, had, prev] of bind.reverse()) {
      if (had) _exprInferCtx.locals.set(name, prev!)
      else _exprInferCtx.locals.delete(name)
    }
  }
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
      // Nullish literal (JS null, or `undefined` lowered by the
      // parser) — Swift's nullish value is `nil`; the previous
      // String(e.value) fallthrough emitted the invalid token `null`.
      if (e.value === null) return 'nil'
      // `float: true` forces an integer-valued literal to Double (`0` →
      // `0.0`) — set by the reduce-seed refinement so the seed matches a
      // Double accumulation. A genuinely-fractional value already renders
      // with its decimal (`12.5`), so only integer values need the `.0`.
      if (typeof e.value === 'number' && e.float === true && Number.isInteger(e.value)) {
        return `${e.value}.0`
      }
      return String(e.value)
    case 'identifier':
      return swiftIdent(e.name)
    case 'call': {
      // `Object.keys(<object-typed expr>)` → static `[String]` of the
      // struct field names. A synthesized struct's keys are statically
      // known, so the rewrite lowers to a plain string-array literal;
      // recursing into the array emit produces the precise `[String]`.
      {
        const rw = rewriteObjectKeys(e, _exprInferCtx)
        if (rw !== null) return emitSwiftExpr(rw, indent)
      }
      // `Object.values(<object-typed expr>)` → a static member-access array
      // ([p.a, p.b]) when the fields are homogeneous + the arg re-readable.
      {
        const rw = rewriteObjectValues(e, _exprInferCtx)
        if (rw !== null) return emitSwiftExpr(rw, indent)
      }
      // Any other `Object.<method>(...)` — `keys` on a non-struct arg
      // (dictionary/unknown), `values` / `entries` (heterogeneous value
      // arrays → `[Any]`, type-lossy), `assign` / `fromEntries` — has no
      // native analog: Swift structs carry no runtime key reflection. The
      // generic fall-through emits `Object.keys(...)`, which is "cannot find
      // 'Object' in scope" — silently uncompilable. Degrade to a TYPED empty
      // array (always compiles, even in an `Any` computed context, unlike a
      // bare `[]` which Swift can't type-infer) and warn so the drop is loud.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Object'
      ) {
        _emitWarnings.push(
          `Object.${e.callee.property}(...) has no native equivalent — only Object.keys() / Object.values() on a statically-known HOMOGENEOUS object shape are supported (they lower to a literal key / member-access array). Emitting an empty array; restructure to avoid runtime object reflection on native.`,
        )
        return e.callee.property === 'keys' ? '[String]()' : '[Any]()'
      }
      // `console.log(…)` → `print(…)` — the universal TS debug call
      // maps to Swift's stdlib print (Kotlin mirror: `println`).
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 'log' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'console'
      ) {
        return `print(${e.args.map((a) => emitSwiftExpr(a, indent)).join(', ')})`
      }
      // `Date.now()` — JS ms-since-epoch. Foundation's `Date` resolves as a
      // TYPE, so the verbatim emit failed "cannot call value of non-function
      // type 'Date'" — a clean-parse silent mis-emit. Lower to the epoch-ms
      // Double (the inference types it float — see infer-type.ts: Kotlin's
      // Int is 32-bit, ms-since-epoch needs Double). Other `Date.*` statics
      // (`Date.parse`, …) have no faithful mapping → NAMED build-failing
      // warning, never a silent drop.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Date'
      ) {
        if (e.callee.property === 'now' && e.args.length === 0) {
          return '(Date().timeIntervalSince1970 * 1000)'
        }
        _emitWarnings.push(
          `Date.${e.callee.property}(...) has no native lowering — only Date.now() (epoch milliseconds, a Double) is supported. Format or parse dates in display logic on the platform side.`,
        )
      }
            // `Math.X(...)` — JS has the `Math` namespace; Swift does not.
      // Map the common functions to their Swift stdlib / Foundation
      // equivalents (Foundation is in the CLI import header). Kotlin
      // needs no mapping — java.lang.Math is valid on Android/JVM. An
      // unmapped `Math.X` falls through to the generic emit.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Math'
      ) {
        // `Math.max(...arr)` / `Math.min(...arr)` — the SPREAD form bypassed
        // the fixed-arity mapping and emitted the raw `Math.max(arr)`
        // ("cannot find 'Math' in scope" — a SILENT fail; the idiom-sweep
        // canary caught it). Lower to the collection max()/min() with the
        // JS empty-array sentinel (`Math.max() === -Infinity`): Int arrays
        // use Int.min/Int.max (no Int infinity — the ergonomic analog,
        // noted in the emitted expression's doc), Double arrays the real
        // ±infinity.
        if (
          (e.callee.property === 'max' || e.callee.property === 'min') &&
          e.args.length === 1 &&
          e.args[0]!.kind === 'spread'
        ) {
          const spreadArg = (e.args[0]! as { kind: 'spread'; argument: ExprIR }).argument
          const arrT = inferType(spreadArg, _activeInferCtx)
          const isFloat =
            arrT.kind === 'array' && arrT.element.kind === 'number' && arrT.element.float === true
          const arrStr = emitSwiftExpr(spreadArg, indent)
          const isMax = e.callee.property === 'max'
          const sentinel = isFloat
            ? isMax
              ? '-Double.infinity'
              : 'Double.infinity'
            : isMax
              ? 'Int.min'
              : 'Int.max'
          return `(${arrStr}.${isMax ? 'max' : 'min'}() ?? ${sentinel})`
        }
        const args = e.args.map((a) => emitSwiftExpr(a, indent))
        switch (e.callee.property) {
          // DOUBLE-DOMAIN functions (`.rounded()` is a Double method;
          // floor/ceil/sqrt/pow are Foundation free functions over Double):
          // their args MUST be coerced to Double. Swift has no implicit
          // Int→Double, so `Math.sqrt(n())` on an Int signal emitted the
          // bare `sqrt(n)` → "cannot convert 'Int' to 'Double'". `Double(x)`
          // is identity on a Double, so coercion is safe for any arg type
          // (matches the `SWIFT_MATH_DOUBLE` set below). `abs`/`min`/`max` are
          // GENERIC over SignedNumeric/Comparable — they accept Int directly,
          // and coercing them would wrongly force a Double result (e.g.
          // `Math.abs(intCount)` must stay Int) — so they are NOT coerced.
          //
          // `ceil`/`floor`/`round`/`trunc` are INTEGER-VALUED in JS (page
          // counts, indices) — the Foundation funcs return Double, so the
          // result is wrapped `Int(…)` so it stays an Int usable in `page <
          // pageCount` and prints "4" not "4.0" (matches `inferMathCall` → Int).
          case 'round':
            if (args.length === 1) return `Int((Double(${args[0]!})).rounded())`
            break
          case 'floor':
            if (args.length === 1) return `Int(floor(Double(${args[0]!})))`
            break
          case 'ceil':
            if (args.length === 1) return `Int(ceil(Double(${args[0]!})))`
            break
          case 'trunc':
            if (args.length === 1) return `Int(trunc(Double(${args[0]!})))`
            break
          case 'abs':
            if (args.length === 1) return `abs(${args[0]!})`
            break
          case 'sqrt':
            if (args.length === 1) return `sqrt(Double(${args[0]!}))`
            break
          case 'min':
            if (args.length === 2) return `min(${args[0]!}, ${args[1]!})`
            break
          case 'max':
            if (args.length === 2) return `max(${args[0]!}, ${args[1]!})`
            break
          case 'pow':
            if (args.length === 2) return `pow(Double(${args[0]!}), Double(${args[1]!}))`
            break
        }
        // Additional Double-domain Foundation free functions NOT in the
        // switch above. Without this they fall through to the generic emit
        // as `Math.hypot(...)` etc. — INVALID Swift ("cannot find 'Math' in
        // scope", confirmed via swiftc -typecheck). Map to the Swift free
        // function with each arg coerced to Double (Swift has no implicit
        // Int→Double, so a bare Int arg would mistype; `Double(x)` is
        // identity on a Double, so coercion is safe for any arg type).
        // (`trunc` is NOT here — it's integer-valued, handled by the explicit
        // `Int(trunc(…))` case in the switch above.)
        const SWIFT_MATH_DOUBLE: Record<string, number> = {
          cbrt: 1, hypot: 2, sin: 1, cos: 1, tan: 1, asin: 1, acos: 1,
          atan: 1, atan2: 2, sinh: 1, cosh: 1, tanh: 1, log: 1, log10: 1,
          log2: 1, exp: 1,
        }
        const arity = SWIFT_MATH_DOUBLE[e.callee.property]
        if (arity !== undefined && args.length === arity) {
          return `${e.callee.property}(${args.map((a) => `Double(${a})`).join(', ')})`
        }
      }
      // `Array.from(x)` → `Array(x)` (shallow copy). `Array.from(x, fn)` →
      // `x.map(fn)` (reuses the `.map` emit). `Array.isArray(x)` → `true` (a
      // typed source IS statically an array). The generic emit would produce
      // `Array.from(...)` / `Array.isArray(...)` → INVALID Swift (`type
      // 'Array<Element>' has no member 'from'` / "generic parameter 'Element'
      // could not be inferred", confirmed via swiftc -typecheck).
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Array'
      ) {
        if (e.callee.property === 'isArray') return 'true'
        if (e.callee.property === 'from') {
          // `Array.from({ length: n }, (_, i) => body)` → `(0..<n).map { i in body }`.
          const range = objectLengthRangeForm(e)
          if (range !== null) {
            return `(0..<${emitSwiftExpr(range.lenExpr, indent)}).map({ ${swiftIdent(range.indexParam)} in ${emitSwiftExpr(range.body, indent)} })`
          }
          const mapForm = arrayFromMapRewrite(e)
          if (mapForm !== null) return emitSwiftExpr(mapForm, indent)
          if (e.args.length === 1 && e.args[0]!.kind !== 'object') {
            return `Array(${emitSwiftExpr(e.args[0]!, indent)})`
          }
          // Any OTHER `Array.from({ length: n }, …)` shape — the 1-arg form (no
          // map fn), a block-body callback, or one that references the
          // (always-`undefined`) element param — is not lowered: name it loudly
          // (the raw emit below then fails at the site) rather than drop it.
          _emitWarnings.push(
            '`Array.from({ length: n })` without an `(_, index) => expr` map callback is not supported on native — this call keeps the raw `Array.from(` emit (a swiftc error at the site). Use `Array.from({ length: n }, (_, i) => …)`, `Array(0..<n).map { … }`, or a numeric loop.',
          )
        }
      }
      // `Number.isInteger(x)` — no `Number` namespace exists natively (raw
      // emit was a SILENT fail). By the arg's INFERRED type: Int → `true`
      // (statically integral); Double → the remainder check; unknown →
      // NAMED warning + raw emit (loud).
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        e.callee.object.name === 'Number' &&
        e.callee.property === 'isInteger' &&
        e.args.length === 1
      ) {
        const nt = inferType(e.args[0]!, _activeInferCtx)
        const argStr = emitSwiftExpr(e.args[0]!, indent)
        if (nt.kind === 'number' && nt.float !== true) return 'true'
        if (nt.kind === 'number') {
          // Parenthesize — a compound arg (`a / b`) would bind the method
          // to its LAST term only.
          return `((${argStr}).truncatingRemainder(dividingBy: 1) == 0)`
        }
        _emitWarnings.push(
          `Number.isInteger(${argStr}): the argument's numeric type could not be inferred — emitting the raw call, which does not compile natively. Give the argument a resolvable number type.`,
        )
      }
      // `isNaN(x)` — no global exists natively (a SILENT fail). Int-typed
      // arg → statically `false`; Double → the native `.isNaN`; unknown →
      // NAMED warning + raw emit (loud).
      if (
        e.callee.kind === 'identifier' &&
        e.callee.name === 'isNaN' &&
        e.args.length === 1
      ) {
        const nT = inferType(e.args[0]!, _activeInferCtx)
        const nStr = emitSwiftExpr(e.args[0]!, indent)
        if (nT.kind === 'number' && nT.float !== true) return 'false'
        if (nT.kind === 'number') return `(${nStr}).isNaN`
        _emitWarnings.push(
          `isNaN(${nStr}): the argument's numeric type could not be inferred — emitting the raw call, which does not compile natively.`,
        )
      }
      // `parseInt(s)` / `parseFloat(s)` / `Number(s)` → Swift `Int(s) ?? 0`
      // / `Double(s) ?? 0`. JS returns NaN on failure; the `?? 0` default
      // keeps the result a non-optional Int/Double (NaN has no native
      // analog). `Number(x)` coerces to a float-capable number → `Double`.
      // A radix 2nd arg (rare) is ignored.
      if (
        e.callee.kind === 'identifier' &&
        (e.callee.name === 'parseInt' ||
          e.callee.name === 'parseFloat' ||
          e.callee.name === 'Number') &&
        e.args.length >= 1
      ) {
        const arg = emitSwiftExpr(e.args[0]!, indent)
        if (e.callee.name === 'parseInt') return `(Int(${arg}) ?? 0)`
        // `Number(boolean)` — Swift has NO `Double(Bool)` initializer
        // (`cannot convert value of type 'Bool'`). JS `Number(true) === 1`,
        // `Number(false) === 0`; the integer literals coerce to Double or Int
        // in whatever the consuming computed annotates.
        if (
          e.callee.name === 'Number' &&
          inferType(e.args[0]!, _activeInferCtx).kind === 'boolean'
        ) {
          return `(${arg} ? 1 : 0)`
        }
        return `(Double(${arg}) ?? 0)`
      }
      // Fetch-arc: zero-arg call on a fetch FIELD — `quotes.data()` /
      // `quotes.isPending()` (the web signal-read shape) → plain
      // @Observable property read. `refetch` is excluded (real method,
      // parens preserved by the generic call emit below).
      if (
        e.args.length === 0 &&
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'identifier' &&
        _fetchNamesSwift.has(e.callee.object.name) &&
        (e.callee.property === 'data' ||
          e.callee.property === 'isPending' ||
          e.callee.property === 'error')
      ) {
        return `${swiftIdent(e.callee.object.name)}.${swiftIdent(e.callee.property)}`
      }
      // Store METHOD call — `useX().store.M(args…)` rewrites to
      // `PyreonStore_id.shared.M(args…)`. Must run BEFORE the zero-arg
      // read rewrite below: a zero-arg method call (`clear()`) would
      // otherwise emit as a property read (`.shared.clear` — missing
      // parens). `_storeMethodNames` is the per-hook method registry
      // built in the emitSwift pre-pass.
      if (
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'member' &&
        e.callee.object.property === 'store' &&
        e.callee.object.object.kind === 'call' &&
        e.callee.object.object.callee.kind === 'identifier' &&
        _storeMethodNames.get(e.callee.object.object.callee.name)?.has(e.callee.property) === true
      ) {
        const storeId = _storeHooks.get(e.callee.object.object.callee.name)!
        const args = e.args.map((a) => emitSwiftExpr(a, indent)).join(', ')
        return `PyreonStore_${storeId}.shared.${swiftIdent(e.callee.property)}(${args})`
      }
      // i18n two-arg t(): `i18n.t('items', { count: n() })` — the
      // object-literal VALUES argument lowers to a Swift dictionary
      // (the runtime's `t(_:_:[String: CustomStringConvertible])`
      // overload). The general object-literal emit produces a struct
      // construction / labeled tuple — wrong in this call position (a
      // single-field labeled tuple is a Swift PARSE error).
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 't' &&
        e.callee.object.kind === 'identifier' &&
        _i18nNames.has(e.callee.object.name) &&
        e.args.length === 2 &&
        e.args[1]!.kind === 'object' &&
        (e.args[1]! as Extract<ExprIR, { kind: 'object' }>).spreads === undefined
      ) {
        const keyArg = emitSwiftExpr(e.args[0]!, indent)
        const obj = e.args[1]! as Extract<ExprIR, { kind: 'object' }>
        const entries = obj.fields
          .map((f) => `${JSON.stringify(f.name)}: ${emitSwiftExpr(f.value, indent)}`)
          .join(', ')
        return `${swiftIdent(e.callee.object.name)}.t(${keyArg}, [${entries}])`
      }
      // Gap 4 v1: signal-style read on a store field — drop the parens.
      // Shape: call(member(<field>, member(store, call(<hook>, []))), [])
      // Detect this BEFORE the .set rewrite below (which would
      // misinterpret `useFoo().store.X.set(v)` as a member.set call).
      if (
        e.args.length === 0 &&
        e.callee.kind === 'member' &&
        e.callee.object.kind === 'member' &&
        e.callee.object.property === 'store' &&
        e.callee.object.object.kind === 'call' &&
        e.callee.object.object.callee.kind === 'identifier' &&
        e.callee.object.object.args.length === 0 &&
        _storeHooks.has(e.callee.object.object.callee.name)
      ) {
        const storeId = _storeHooks.get(e.callee.object.object.callee.name)!
        return `PyreonStore_${storeId}.shared.${swiftIdent(e.callee.property)}`
      }
      // Gap 4 v1: write to a store field — `useFoo().store.X.set(v)`
      // rewrites to `PyreonStore_foo.shared.X = v` (Swift @Observable
      // properties are vars).
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 'set' &&
        e.callee.object.kind === 'member' &&
        e.callee.object.object.kind === 'member' &&
        e.callee.object.object.property === 'store' &&
        e.callee.object.object.object.kind === 'call' &&
        e.callee.object.object.object.callee.kind === 'identifier' &&
        _storeHooks.has(e.callee.object.object.object.callee.name)
      ) {
        const storeId = _storeHooks.get(e.callee.object.object.object.callee.name)!
        const field = swiftIdent(e.callee.object.property)
        const value = e.args[0] ? emitSwiftExpr(e.args[0], indent) : '0'
        return `PyreonStore_${storeId}.shared.${field} = ${value}`
      }
      // `.update(fn)` lowering — `x.update((list) => EXPR)` lowers to
      // `x = EXPR[list := <read of x>]` by IR-level param substitution,
      // producing the SAME idiomatic emit the hand-written
      // `.set(x().map(...))` form produces. Covers local signals AND
      // store fields (`useApp().store.tasks.update(fn)` — the
      // substituted READ re-enters the store-chain rewrite; the LHS
      // uses the singleton form explicitly, since a bare member chain
      // would emit the un-rewritten `useApp().store.tasks`).
      // Conservative bails (non-arrow callback, parameterless arrow,
      // shadowed param) emit a warning + keep the raw `.update(` emit
      // so swiftc names the site loudly.
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
          _storeHooks.has(target.object.object.callee.name)
        ) {
          isUpdateTarget = true
          const storeId = _storeHooks.get(target.object.object.callee.name)!
          storeLhs = `PyreonStore_${storeId}.shared.${swiftIdent(target.property)}`
        }
        if (isUpdateTarget) {
          const fn = e.args[0]!
          if (fn.kind === 'arrow' && fn.params.length === 1) {
            // The current-value read: for a local signal the bare name;
            // for a store field, the zero-arg read-call IR whose emit
            // re-enters the store-chain rewrite above.
            const read: ExprIR =
              storeLhs === undefined ? target : { kind: 'call', callee: target, args: [] }
            const substituted = substituteIdentifier(fn.body, fn.params[0]!, read)
            if (substituted !== null) {
              const lhs = storeLhs ?? emitSwiftExpr(target, indent)
              return `${lhs} = ${emitSwiftExpr(substituted, indent)}`
            }
          }
          _emitWarnings.push(
            '`.update(fn)` lowering supports a single-param expression-body arrow whose param is not shadowed by a nested arrow — this call keeps the raw `.update(` emit (a swiftc error at the site). Use `.set(read().…)` or rename the colliding inner param.',
          )
        }
      }
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
        // Gap 4 PR-2: PyreonMachine names need parens preserved so
        // `m()` invokes `callAsFunction()` and reads the current state.
        if (_machineNames.has(e.callee.name)) {
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
      // `ws.connect()` — the TS hook surface is 0-arg (useWebSocket(url)
      // carries the url); the Swift runtime's signature is
      // `connect(to: URL)`. Thread the decl's url through. The bare
      // 0-arg emit failed "missing argument for parameter 'to'".
      if (
        e.callee.kind === 'member' &&
        e.callee.property === 'connect' &&
        e.callee.object.kind === 'identifier' &&
        _websocketUrlsSwift.has(e.callee.object.name) &&
        e.args.length === 0
      ) {
        return `${swiftIdent(e.callee.object.name)}.connect(to: URL(string: ${JSON.stringify(_websocketUrlsSwift.get(e.callee.object.name)!)})!)`
      }
      if (e.callee.kind === 'member') {
        const obj = emitSwiftExpr(e.callee.object, indent)
        const prop = e.callee.property
        const argExprs = emitSwiftMemberCallArgs(e, indent)
        switch (prop) {
          case 'trim':
            if (e.args.length === 0) {
              return `${obj}.trimmingCharacters(in: .whitespacesAndNewlines)`
            }
            break
          case 'some': {
            // 2-param INDEX callback `.some((el, idx) => …)` → the index-aware
            // form. `enumerated()` yields (offset, element) index-FIRST, so bind
            // `(idx, el)` SWAPPED from JS's `(el, idx)` — mirrors the map/forEach
            // handling + the shared `indexedArrayCallback` gate (#1934). Checked
            // BEFORE the 1-arg branch: a 2-PARAM arrow is still ONE argument, so
            // `e.args.length === 1` is true — the gate discriminates on params.
            const cb = indexedArrayCallback(e.args)
            if (cb) {
              const el = swiftIdent(cb.params[0]!)
              const idx = swiftIdent(cb.params[1]!)
              return `${obj}.enumerated().contains(where: ${emitSwiftIndexedClosure(cb, idx, el, indent, e.callee.object)})`
            }
            if (e.args.length === 1) {
              return `${obj}.contains(where: ${argExprs[0]!})`
            }
            break
          }
          case 'every': {
            const cb = indexedArrayCallback(e.args)
            if (cb) {
              const el = swiftIdent(cb.params[0]!)
              const idx = swiftIdent(cb.params[1]!)
              return `${obj}.enumerated().allSatisfy(${emitSwiftIndexedClosure(cb, idx, el, indent, e.callee.object)})`
            }
            if (e.args.length === 1) {
              return `${obj}.allSatisfy(${argExprs[0]!})`
            }
            break
          }
          case 'filter': {
            // 1-arg `.filter(pred)` passes through unchanged (Swift `.filter`
            // matches JS); the 2-param INDEX form needs `enumerated().filter{…}`
            // which yields (offset, element) tuples, so `.map({ $0.element })`
            // recovers `[Element]` to match JS's `.filter` result.
            const cb = indexedArrayCallback(e.args)
            if (cb) {
              const el = swiftIdent(cb.params[0]!)
              const idx = swiftIdent(cb.params[1]!)
              return `${obj}.enumerated().filter(${emitSwiftIndexedClosure(cb, idx, el, indent, e.callee.object)}).map({ $0.element })`
            }
            if (e.args.length === 1) return `${obj}.filter(${argExprs[0]!})`
            break
          }
          case 'map':
          case 'forEach': {
            // JS `.map((el, idx) => …)` / `.forEach((el, idx) => …)` pass
            // (element, index); Swift's `.map`/`.forEach` closure takes ONLY
            // the element (`{ x in … }`), so a 2-param callback fails
            // ("expects 1 argument, but 2 were used"). The index-aware form is
            // `enumerated().map { (idx, el) in … }` — `enumerated()` yields
            // (offset, element) tuples (index-FIRST), so bind `(idx, el)`,
            // SWAPPED from the JS `(el, idx)` order, keeping the body's names
            // valid. 1-param callbacks fall through to the generic emit (which
            // already works).
            const cb = indexedArrayCallback(e.args)
            if (cb) {
              const el = swiftIdent(cb.params[0]!)
              const idx = swiftIdent(cb.params[1]!)
              return `${obj}.enumerated().${prop}(${emitSwiftIndexedClosure(cb, idx, el, indent, e.callee.object)})`
            }
            break
          }
          case 'find':
            if (e.args.length === 1) {
              return `${obj}.first(where: ${argExprs[0]!})`
            }
            break
          case 'findLast':
            // JS `arr.findLast(pred)` → Swift `last(where:)` (Swift has no
            // `.findLast`). Both return Optional (`T?`) — the inference side
            // mirrors `.find` (`T | undefined`). Kotlin's `findLast` matches
            // JS as-is, so no Kotlin mapping.
            if (e.args.length === 1) {
              return `${obj}.last(where: ${argExprs[0]!})`
            }
            break
          case 'includes':
            if (e.args.length === 1) {
              return `${obj}.contains(${argExprs[0]!})`
            }
            break
          case 'lastIndexOf':
            // JS `.lastIndexOf(x)` → Swift `lastIndex(of:) ?? -1` (ARRAY form —
            // the mirror of indexOf's array branch). The raw emit was a
            // SILENT fail ("no dynamic member 'lastIndexOf'"). String
            // receivers keep the generic emit + a named warning below.
            if (e.args.length === 1) {
              const liT = inferType(e.callee.object, _activeInferCtx)
              if (liT.kind === 'array') {
                return `(${obj}.lastIndex(of: ${argExprs[0]!}) ?? -1)`
              }
              _emitWarnings.push(
                `.lastIndexOf on a non-array receiver has no Swift lowering yet — emitting the raw call, which fails to compile. Use a supported shape or compute the index differently.`,
              )
            }
            break
          case 'indexOf': {
            // JS `.indexOf(x)` returns an Int index, or -1 when not found.
            // ARRAY: Swift `firstIndex(of:)` returns `Int?` — wrap `?? -1` to
            // match the JS sentinel AND the inferred `Int` annotation (the
            // bare emit was `Int?`-vs-`Int` mismatch). STRING: `firstIndex`
            // wants a Character + returns `String.Index?` (NOT a JS Int
            // offset), so use `range(of:)` + `distance(from:startIndex,
            // to:lowerBound) ?? -1` (Foundation — in the CLI Swift header).
            // Kotlin's `indexOf` already returns Int (-1) for both → no map.
            if (e.args.length === 1) {
              const idxType = inferType(e.callee.object, _activeInferCtx)
              if (idxType.kind === 'string') {
                return `(${obj}.range(of: ${argExprs[0]!}).map { ${obj}.distance(from: ${obj}.startIndex, to: $0.lowerBound) } ?? -1)`
              }
              return `(${obj}.firstIndex(of: ${argExprs[0]!}) ?? -1)`
            }
            break
          }
          case 'charAt':
            // JS `str.charAt(i)` returns a 1-char STRING. Swift has no
            // `.charAt`; index the Character array + rewrap to String
            // (`String(Array(str)[i])`). NOTE: out-of-range crashes (JS
            // returns "") — bounds are the caller's concern; documented v1
            // limitation. Kotlin maps separately (`str[i].toString()`).
            if (e.args.length === 1) return `String(Array(${obj})[${argExprs[0]!}])`
            break
          case 'startsWith':
            // JS String.startsWith → Swift `hasPrefix` (Kotlin's
            // startsWith is valid as-is, no mapping there).
            if (e.args.length === 1) return `${obj}.hasPrefix(${argExprs[0]!})`
            break
          case 'endsWith':
            if (e.args.length === 1) return `${obj}.hasSuffix(${argExprs[0]!})`
            break
          case 'join':
            // JS `arr.join(sep?)` → Swift `[String].joined(separator:)`.
            // JS's default separator is "," — emit it explicitly when
            // omitted. (Requires the array element to be String, as Swift
            // `joined` does — map non-string arrays to strings first.)
            if (e.args.length <= 1) {
              const sep = e.args.length === 1 ? argExprs[0]! : '","'
              // Swift `joined(separator:)` exists ONLY on [String] — JS join
              // stringifies elements, so a non-String element array maps
              // through `String.init` first (the emit's own long-documented
              // gap: it compiled clean in tests with String arrays and
              // failed SILENT on [Int] — caught by the idiom-sweep canary).
              const jt = inferType(e.callee.object, _activeInferCtx)
              if (jt.kind === 'array' && jt.element.kind !== 'string') {
                return `${obj}.map { String($0) }.joined(separator: ${sep})`
              }
              return `${obj}.joined(separator: ${sep})`
            }
            break
          case 'split':
            // JS `str.split(sep)` → Swift `components(separatedBy:)`
            // (Foundation; multi-char separator, returns [String], faithful
            // to JS string-separator split). Kotlin's `split` matches JS
            // as-is, so it needs no mapping there.
            if (e.args.length === 1) return `${obj}.components(separatedBy: ${argExprs[0]!})`
            break
          case 'substring': {
            // JS `str.substring(start, end?)` — Swift String has NO
            // `.substring`. Lower like the String branch of `.slice` (clamp
            // via dropFirst/prefix; rewrap to String). Faithful for the
            // common forward, non-negative case — JS substring's arg-SWAP
            // (start>end) and negative→0 quirks are not modeled; a unary-
            // minus arg falls through to the generic emit. Kotlin's
            // `String.substring(start, end?)` matches JS, so no Kotlin map.
            const noNegative = e.args.every((a) => a.kind !== 'unary')
            if (noNegative) {
              if (e.args.length === 1) return `String(${obj}.dropFirst(${argExprs[0]!}))`
              if (e.args.length === 2) {
                return `String(${obj}.dropFirst(${argExprs[0]!}).prefix(max(0, (${argExprs[1]!}) - (${argExprs[0]!}))))`
              }
            }
            break
          }
          case 'padStart':
          case 'padEnd': {
            // JS `str.padStart(len, pad?)` / `padEnd` — Swift has no native.
            // Build the pad run manually: repeat the pad to fill the gap
            // `max(0, len - str.count)`, then prepend (start) / append (end).
            // ONLY the common cases map exactly: pad OMITTED → " " (JS
            // default), or a SINGLE-char string literal (`"0"`). A multi-char
            // pad would over-pad (Swift `String(repeating:count:)` repeats
            // the WHOLE string, JS truncates to fit) and a dynamic pad can't
            // be length-checked — both fall through to the generic emit.
            const padArg = e.args[1]
            const okPad =
              e.args.length === 1 ||
              (padArg !== undefined &&
                padArg.kind === 'literal' &&
                typeof padArg.value === 'string' &&
                padArg.value.length === 1)
            if (e.args.length >= 1 && okPad) {
              const len = argExprs[0]!
              const pad = e.args.length >= 2 ? argExprs[1]! : '" "'
              const fill = `String(repeating: ${pad}, count: max(0, (${len}) - ${obj}.count))`
              return prop === 'padStart' ? `(${fill} + ${obj})` : `(${obj} + ${fill})`
            }
            break
          }
          case 'repeat':
            // JS `str.repeat(n)` → Swift `String(repeating:count:)`.
            // Kotlin's `String.repeat(n)` matches JS as-is.
            if (e.args.length === 1) return `String(repeating: ${obj}, count: ${argExprs[0]!})`
            break
          case 'concat':
            // JS `arr.concat(other)` → Swift `arr + other` (immutable
            // concat). Parenthesised so a following `.method()` / operator
            // binds to the whole concatenation, not just `other`.
            if (e.args.length === 1) return `(${obj} + ${argExprs[0]!})`
            break
          case 'fill': {
            // JS `arr.fill(v)` → Swift `Array(repeating: v, count: <n>)`
            // (immutable, render-safe; Swift has no `.fill`). The canonical
            // shape is `Array(n).fill(v)` (create-and-fill) → count is the
            // `Array(n)` arg; a generic `arr.fill(v)` on an existing array
            // fills `arr.count` slots. (A range-limited `fill(v, start, end)`
            // is rare → falls through to the generic emit.)
            if (e.args.length === 1) {
              const objExpr = e.callee.object
              if (
                objExpr.kind === 'call' &&
                objExpr.callee.kind === 'identifier' &&
                objExpr.callee.name === 'Array' &&
                objExpr.args.length === 1
              ) {
                const count = emitSwiftExpr(objExpr.args[0]!, indent)
                return `Array(repeating: ${argExprs[0]!}, count: ${count})`
              }
              return `Array(repeating: ${argExprs[0]!}, count: ${obj}.count)`
            }
            break
          }
          case 'at': {
            // JS `arr.at(i)` → Optional element, with NEGATIVE indices
            // counting from the end (`arr.at(-1)` = last). Swift has no `.at`;
            // resolve the index (count + i when negative) and bounds-check
            // via `indices.contains` → `nil` when out of range (matching JS's
            // `undefined`). Inferred as `T?` (see infer-type). `obj` + the
            // index expr are pure (signal reads / literals), so repeating
            // them is safe.
            if (e.args.length === 1) {
              // ARRAY receivers only — Swift String indices aren't Int, so
              // the same lowering on a string emitted uncompilable garbage
              // (a SILENT fail). String `.at` warns NAMED.
              const atT = inferType(e.callee.object, _activeInferCtx)
              if (atT.kind === 'string') {
                _emitWarnings.push(
                  `${obj}.at(...): String.at has no Swift lowering yet (String indices are not integers) — emitting the raw call, which fails to compile. Use string slicing or restructure.`,
                )
                break
              }
              const i = argExprs[0]!
              const resolved = `(${i} < 0 ? ${obj}.count + (${i}) : (${i}))`
              return `(${obj}.indices.contains(${resolved}) ? ${obj}[${resolved}] : nil)`
            }
            break
          }
          case 'slice': {
            // JS `arr.slice(start, end?)` / `str.slice(start, end?)`. Swift
            // arrays AND Strings have NO `.slice` method, so the bare emit
            // fails ("[T] has no member 'slice'"). Lower to dropFirst/prefix,
            // which CLAMP (like JS) instead of crashing on out-of-range:
            //   slice(s, e) → dropFirst(s).prefix(max(0, e - s))
            //   slice(s)    → dropFirst(s)
            //   slice()     → a copy
            // Array<T> rewraps via `Array(...)`, String via `String(...)`
            // (dropFirst/prefix yield ArraySlice / Substring). Negative
            // indices (a rare JS shape) are NOT lowered — a unary-minus arg
            // falls through to the generic emit.
            const sliceObjTypeRaw = inferType(e.callee.object, _activeInferCtx)
            // Unwrap an optional receiver (`T | undefined`, e.g. from
            // `.find()`/`.findLast()`) to its inner type for the wrap decision —
            // a `xs.find(...)?.slice(...)` receiver is still a string/array.
            const sliceObjType =
              sliceObjTypeRaw.kind === 'union'
                ? (sliceObjTypeRaw.branches.find((b) => b.kind !== 'undefined') ?? sliceObjTypeRaw)
                : sliceObjTypeRaw
            const wrap =
              sliceObjType.kind === 'string'
                ? 'String'
                : sliceObjType.kind === 'array'
                  ? 'Array'
                  : null
            const noNegative = e.args.every((a) => a.kind !== 'unary')
            if (wrap !== null) {
              // For an OPTIONAL-chained receiver (`f?.slice(...)`), apply the
              // slice INSIDE Swift's optional `.map { }` operating on the
              // unwrapped `$0`, so the result stays `WRAP?` (matches the `?.`
              // chain). Pre-fix `inferType` returned a `union` for the receiver,
              // `wrap` was null, the lowering was skipped, and the raw `.slice`
              // survived → `value of type 'String' has no member 'slice'`.
              const optional = e.callee.optional === true
              const recv = optional ? '$0' : obj
              // Negative-index idioms (Swift indices count from the front):
              //   slice(-m)    → suffix(m)    (last m)
              //   slice(0, -n) → dropLast(n)  (drop last n)
              const negSlice = classifyNegativeSlice(e.args, (a) => emitSwiftExpr(a, indent))
              if (negSlice) {
                let tail: string
                switch (negSlice.kind) {
                  case 'last':
                    tail = `suffix(${negSlice.n})`
                    break
                  case 'dropLast':
                    tail = `dropLast(${negSlice.n})`
                    break
                  case 'dropFirstLast':
                    tail = `dropFirst(${negSlice.s}).dropLast(${negSlice.n})`
                    break
                  case 'suffixDropLast':
                    tail = `suffix(${negSlice.m}).dropLast(${negSlice.n})`
                    break
                }
                const body = `${wrap}(${recv}.${tail})`
                return optional ? `${obj}.map { ${body} }` : body
              }
              if (noNegative) {
                let body: string | null = null
                if (e.args.length === 0) body = `${wrap}(${recv})`
                else if (e.args.length === 1) body = `${wrap}(${recv}.dropFirst(${argExprs[0]!}))`
                else if (e.args.length === 2)
                  body = `${wrap}(${recv}.dropFirst(${argExprs[0]!}).prefix(max(0, (${argExprs[1]!}) - (${argExprs[0]!}))))`
                if (body !== null) return optional ? `${obj}.map { ${body} }` : body
              }
            }
            break
          }
          case 'findIndex':
            // JS `arr.findIndex(pred)` → Swift `firstIndex(where:)`, but JS
            // returns the SENTINEL `-1` (an Int) when not found while Swift
            // returns `Int?` (nil). Wrap in `?? -1` to preserve the JS
            // contract — the result is a plain `Int`, so a downstream
            // `=== -1` / index use compiles. (Kotlin's `indexOfFirst`
            // already returns -1 when not found — faithful as-is.)
            {
              // 2-param INDEX callback `.findIndex((el, idx) => …)`: `firstIndex
              // (where:)` takes only the element, so use `enumerated().first
              // (where:)` (index-FIRST tuples) and read `.offset`, `?? -1` to
              // keep the JS not-found sentinel + a plain `Int` result. Checked
              // BEFORE the 1-arg branch (a 2-param arrow is still one argument).
              const cb = indexedArrayCallback(e.args)
              if (cb) {
                const el = swiftIdent(cb.params[0]!)
                const idx = swiftIdent(cb.params[1]!)
                return `(${obj}.enumerated().first(where: ${emitSwiftIndexedClosure(cb, idx, el, indent, e.callee.object)})?.offset ?? -1)`
              }
            }
            if (e.args.length === 1) return `(${obj}.firstIndex(where: ${argExprs[0]!}) ?? -1)`
            break
          case 'replaceAll':
            // JS `str.replaceAll(a, b)` → Swift `replacingOccurrences(of:with:)`
            // (both replace EVERY occurrence — faithful, unlike `replace`
            // which is first-only in JS). Kotlin's `String.replace(a, b)` is
            // also replace-all. (Plain `replace` is deliberately NOT mapped —
            // first-vs-all mismatch.)
            if (e.args.length === 2) {
              return `${obj}.replacingOccurrences(of: ${argExprs[0]!}, with: ${argExprs[1]!})`
            }
            break
          case 'flat':
            // JS `arr.flat()` (one level) → Swift `flatMap { $0 }` (Kotlin:
            // `flatten()`). Only the no-arg (depth-1) form maps cleanly; a
            // numeric `flat(depth)` falls through to the generic emit.
            if (e.args.length === 0) return `${obj}.flatMap { $0 }`
            break
          case 'reverse':
            // JS `arr.reverse()` → Swift `Array(reversed())`. JS reverse
            // mutates in place AND returns the array; the native idiom is the
            // non-mutating `reversed()` (render-safe, matches `rx.reverse`),
            // wrapped in `Array(...)` so the result is a concrete `[T]`.
            if (e.args.length === 0) return `Array(${obj}.reversed())`
            break
          case 'reduce':
            // JS `arr.reduce(reducer, initial)` → Swift `reduce(initial,
            // reducer)` — Swift takes the initial value FIRST (the
            // opposite of JS). Mirrors the rx.reduce flip. Only the
            // 2-arg (explicit-initial) form maps cleanly — the
            // no-initial form (`arr.reduce(cb)`) needs a seed-from-first
            // shape, so it falls through to the generic emit.
            if (e.args.length === 2) {
              return `${obj}.reduce(${argExprs[1]!}, ${argExprs[0]!})`
            }
            // Seedless `arr.reduce(fn)` — JS uses arr[0] as the seed and folds
            // over the REST. Swift has no 1-arg reduce (the bare `reduce({…})`
            // binds to `reduce(into:)` → "missing argument for parameter 'into'").
            // Lower to `obj.dropFirst().reduce(obj[0], fn)` — but that names
            // `obj` TWICE, so only when the receiver is RE-READABLE (identifier /
            // signal / store read); a receiver with a real method call
            // (`filter(...)`) would re-run that work → warn + defer instead.
            // (Empty-array parity: `obj[0]` traps on empty like JS's
            // "Reduce of empty array with no initial value" throw.)
            if (
              e.args.length === 1 &&
              e.callee.kind === 'member' &&
              isReReadableExpr(e.callee.object)
            ) {
              return `${obj}.dropFirst().reduce(${obj}[0], ${argExprs[0]!})`
            }
            if (e.args.length === 1) {
              _emitWarnings.push(
                'seedless `.reduce(fn)` on a non-trivial receiver (a chained method call) is not supported on Swift — the native lowering would re-evaluate the receiver. Provide an initial value (`.reduce(fn, seed)`) or bind the receiver to a `const` first.',
              )
            }
            break
          case 'toFixed': {
            // JS `n.toFixed(d)` → Swift `String(format: "%.<d>f", n)`
            // (the analytical currency/percent format). Requires
            // `import Foundation` (added to the CLI Swift import header).
            // v1: literal digit count (or the 0-arg default of 0) — a
            // dynamic count falls through to the generic emit.
            const digits =
              e.args.length === 0
                ? '0'
                : e.args[0]!.kind === 'literal' && typeof e.args[0]!.value === 'number'
                  ? String(e.args[0]!.value)
                  : null
            if (digits !== null) {
              return `String(format: "%.${digits}f", ${obj})`
            }
            break
          }
          case 'toUpperCase':
            if (e.args.length === 0) return `${obj}.uppercased()`
            break
          case 'toLowerCase':
            if (e.args.length === 0) return `${obj}.lowercased()`
            break
          case 'sort': {
            // JS `arr.sort((a,b) => <numeric>)` → Swift
            // `sorted(by: { a, b in (<numeric>) < 0 })`. A JS comparator
            // returns a NUMBER (negative if a should come first); Swift's
            // `areInIncreasingOrder` wants a Bool, so wrap the body in
            // `< 0`. `.sorted` is non-mutating (returns a new array) —
            // the render-safe shape, and the canonical use is sorting a
            // table for display (`[...rows].sort(cmp)`). v1: a 2-param
            // arrow comparator with an expression body; anything else
            // falls through to the generic emit.
            const cmp = e.args[0]
            if (e.args.length === 1 && cmp!.kind === 'arrow' && cmp!.params.length === 2) {
              // A MULTI-STATEMENT comparator can't wrap in the `< 0` Bool
              // conversion (the block-body sentinel made it a SILENT drop —
              // idiom-sweep batch 2). NAMED warning; expression bodies only.
              if (cmp!.stmts !== undefined && cmp!.stmts.length > 0) {
                _emitWarnings.push(
                  `.sort with a multi-statement comparator is not lowered — Swift's sorted(by:) needs a Bool expression; use an expression-body comparator ((a, b) => a - b) or precompute the key.`,
                )
                break
              }
              const ps = cmp!.params.map((p) => swiftIdent(p)).join(', ')
              return `${obj}.sorted(by: { ${ps} in (${emitSwiftExpr(cmp!.body, indent)}) < 0 })`
            }
            break
          }
          case 'toLocaleString':
            // No native locale-number-formatting equivalent (would need
            // a NumberFormatter instance). Degrade to a plain string
            // conversion (valid, but loses thousands grouping) + warn so
            // the loss is visible rather than a silent invalid emit.
            if (e.args.length === 0) {
              _emitWarnings.push(
                '.toLocaleString() has no native locale-formatting equivalent — emitting a plain string conversion (no grouping separators). Format the value explicitly if you need grouping.',
              )
              return `String(${obj})`
            }
            break
        }
        // Generic member call — no specific rewrite matched. Reuse the
        // element-scoped `argExprs` (from `emitSwiftMemberCallArgs`) so a
        // 1-param element-callback that falls through to here (`.map` /
        // `.forEach`) emits its closure body with the param bound to the
        // receiver's element type — enabling the Int×Double coercion
        // (`.map(x => x * 1.5)` → `.map({ x in Double(x) * 1.5 })`) that the
        // plain, unscoped `e.args` re-emit below misses. Byte-identical to
        // the generic emit otherwise (same callee emit; scoped args).
        return `${emitSwiftExpr(e.callee, indent)}(${argExprs.join(', ')})`
      }
      const callee = emitSwiftExpr(e.callee, indent)
      const args = e.args.map((a) => emitSwiftExpr(a, indent)).join(', ')
      return `${callee}(${args})`
    }
    case 'index': {
      // `xs[i]` — Swift arrays share the subscript syntax verbatim.
      return `${emitSwiftExpr(e.object, indent)}[${emitSwiftExpr(e.index, indent)}]`
    }
    case 'member': {
      // v2 (form-binding arc) — per-field dict access on a form
      // container: `form.values.email` is ILLEGAL member access on a
      // Swift dictionary; rewrite to the subscript with the
      // type-appropriate default (`values`/`errors` are String dicts,
      // `touched` is Bool).
      if (
        e.object.kind === 'member' &&
        e.object.object.kind === 'identifier' &&
        _formNamesSwift.has(e.object.object.name) &&
        (e.object.property === 'values' ||
          e.object.property === 'errors' ||
          e.object.property === 'touched')
      ) {
        const dflt = e.object.property === 'touched' ? 'false' : '""'
        return `(${swiftIdent(e.object.object.name)}.${e.object.property}[${JSON.stringify(e.property)}] ?? ${dflt})`
      }
      // Gap 4 v1: rewrite the store-hook chain `<useFoo>().store.X`
      // → `PyreonStore_foo.shared.X`.
      //
      // The chain parses bottom-up as:
      //   member(.X, member(.store, call(identifier(useFoo), [])))
      //
      // Recognise the immediately-inner `.store` + call shape and
      // hop two levels in one rewrite. This is the multi-step member-
      // access chain rewriting infrastructure the audit identified as
      // the missing PMTC primitive — once present, the same shape
      // extends to createModel + defineFeature.
      if (
        e.object.kind === 'member' &&
        e.object.property === 'store' &&
        e.object.object.kind === 'call' &&
        e.object.object.callee.kind === 'identifier' &&
        e.object.object.args.length === 0 &&
        _storeHooks.has(e.object.object.callee.name)
      ) {
        const storeId = _storeHooks.get(e.object.object.callee.name)!
        return `PyreonStore_${storeId}.shared.${swiftIdent(e.property)}`
      }
      // Gap 4 v2 follow-up: rewrite `<instance>.<field>` for top-level
      // state-tree model instances. `const counter = model({...}).create()`
      // produces a singleton PyreonModel_counter; user reads `counter.label`
      // emit as `PyreonModel_counter.shared.label`.
      if (
        e.object.kind === 'identifier' &&
        _modelInstances.has(e.object.name)
      ) {
        const modelId = _modelInstances.get(e.object.name)!
        return `PyreonModel_${modelId}.shared.${swiftIdent(e.property)}`
      }
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
      // Optional chaining: `?.` when this link is optional OR its object
      // chain already carried one (`a?.b.c` → `a?.b?.c`). Swift accepts the
      // propagated `?.`; Kotlin requires it (see emit-kotlin).
      //
      // BUT a redundant `?.` on a PROVABLY non-optional receiver (`o?.a`
      // where `o` is a concrete struct/number/etc., not a `T | null` union)
      // is a Swift ERROR ("cannot use optional chaining on non-optional
      // value") — TS allows the redundant `?.`, Swift does not. Strip it to
      // `.` when the receiver type is provably non-nullable. Conservative:
      // keep `?.` for union-with-null receivers, `Any`/unknown (can't prove),
      // and propagated-optional chains — so a genuinely-nullable receiver is
      // never wrongly de-optionalized (no null-deref risk).
      const recvType = inferType(e.object, _exprInferCtx)
      const recvProvablyNonNull =
        recvType.kind !== 'unknown' &&
        recvType.kind !== 'null' &&
        recvType.kind !== 'undefined' &&
        !(
          recvType.kind === 'union' &&
          recvType.branches.some((b) => b.kind === 'null' || b.kind === 'undefined')
        )
      const dot =
        (e.optional === true && !recvProvablyNonNull) || chainHasOptional(e.object) ? '?.' : '.'
      if (e.property === 'length') {
        return `${emitSwiftExpr(e.object, indent)}${dot}count`
      }
      return `${emitSwiftExpr(e.object, indent)}${dot}${swiftIdent(e.property)}`
    }
    case 'binary': {
      const bl = emitSwiftExpr(e.left, indent)
      const br = emitSwiftExpr(e.right, indent)
      // JS `/` is ALWAYS float division (`7 / 2 === 3.5`). Swift integer
      // `/` truncates (`7 / 2 == 3`) — even assigned to a Double — so
      // coerce both operands to Double to match JS semantics. `/` is only
      // valid on numbers, so `Double(...)` is always sound here. Other ops
      // (`+ - * %`) match JS for integers and are emitted verbatim.
      if (e.op === '/') {
        return `Double(${bl}) / Double(${br})`
      }
      // Exponent (`a ** b`) — Swift has no `**` operator; `pow(_:_:)` is
      // Double-domain (Foundation, re-exported by SwiftUI). Coerce both
      // operands so an Int base/exponent works; the result is Double (which
      // matches JS, where `**` yields a Number).
      if (e.op === '**') {
        return `pow(Double(${bl}), Double(${br}))`
      }
      // Mixed Int×Double — Swift has no implicit Int→Double conversion, so
      // `count() * 0.5` (Int signal × fractional literal) is a type error.
      // Coerce the INT side to Double when EXACTLY one operand is Double.
      // `%` is excluded (Swift Double `%` needs `.truncatingRemainder`, a
      // separate nuance); `+ - *` accept `Double op Double`.
      if (e.op === '+' || e.op === '-' || e.op === '*') {
        const lf = numericFloatness(e.left)
        const rf = numericFloatness(e.right)
        if (lf === 'double' && rf === 'int') return `${bl} ${e.op} Double(${br})`
        if (lf === 'int' && rf === 'double') return `Double(${bl}) ${e.op} ${br}`
      }
      // Bitwise ops (`& | ^ << >>`) — Swift uses the SAME symbols, but its
      // operator precedence differs from JS (e.g. Swift `&` binds tighter
      // than `+`, the reverse of JS), so a compound operand must be
      // parenthesized to preserve the JS-parsed grouping
      // (`a & b + c` is `a & (b + c)` in JS). Over-parenthesizing a
      // compound operand is always sound.
      if (e.op === '&' || e.op === '|' || e.op === '^' || e.op === '<<' || e.op === '>>') {
        const L = isCompoundExpr(e.left) ? `(${bl})` : bl
        const R = isCompoundExpr(e.right) ? `(${br})` : br
        return `${L} ${e.op} ${R}`
      }
      return `${bl} ${e.op} ${br}`
    }
    case 'template': {
      // Template literal → native Swift string interpolation
      // `"<quasi>\(expr)<quasi>…"`. Interpolation (not `+`-concat) coerces
      // any interpoland to String — `"n=\(count)"` works for an Int where
      // `"n=" + count` is a Swift type error. Quasis are COOKED, so they
      // re-escape with the control-char additions (cooked may carry real
      // newlines/tabs that a single-line string literal can't hold raw).
      let s = '"'
      for (let i = 0; i < e.quasis.length; i++) {
        s += escapeSwiftStringSegment(e.quasis[i] ?? '')
        if (i < e.exprs.length) s += `\\(${emitSwiftExpr(e.exprs[i]!, indent)})`
      }
      return s + '"'
    }
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
      // Mixed Int×Double comparison — Swift requires SAME-type operands for
      // `> < >= <= == !=` (JS compares numbers freely). The arithmetic ops
      // already coerce (the `binary` case); comparisons hit the same wall
      // the moment one side is Double — `x * 1.5 > i` inside an indexed
      // filter callback failed "referencing operator function '>' on
      // 'BinaryInteger' requires…". Coerce the INT side when EXACTLY one
      // operand is Double (numericFloatness returns 'other' for
      // non-numbers, so string/enum/bool comparisons are untouched).
      // A numeric LITERAL never needs the wrap — Swift self-types integer
      // literals in a Double context (ExpressibleByIntegerLiteral), so
      // `Double(x) * 1.5 > 2` already compiles; coercing it would churn
      // every existing emit for zero gain. Only NON-literal Int operands
      // (params, signal reads, member chains) get wrapped.
      {
        const lf = numericFloatness(e.left)
        const rf = numericFloatness(e.right)
        if (lf === 'double' && rf === 'int' && e.right.kind !== 'literal') {
          return `${leftStr} ${e.op} Double(${rightStr})`
        }
        if (lf === 'int' && rf === 'double' && e.left.kind !== 'literal') {
          return `Double(${leftStr}) ${e.op} ${rightStr}`
        }
      }
      return `${leftStr} ${e.op} ${rightStr}`
    }
    case 'unary': {
      // Parser-B: prefix unary. `-x` / `+x` verbatim. JS `!x` is TRUTHINESS
      // negation — on a non-Bool it needs the typed lowering ("type 'Int'
      // cannot be used as a boolean"), and `!!x` (truthiness→Bool) is
      // doubly broken (juxtaposed unary is a Swift parse error). Both were
      // SILENT fails (idiom-sweep batch 2). By the arg's inferred type;
      // unknown args keep the raw emit (loud).
      if (e.op === '!') {
        const inner = e.argument
        const isDoubleNeg = inner.kind === 'unary' && inner.op === '!'
        const target = isDoubleNeg ? (inner as { argument: ExprIR }).argument : inner
        const tT = inferType(target, _activeInferCtx)
        const tStr = emitSwiftExpr(target, indent)
        if (tT.kind === 'number') return isDoubleNeg ? `(${tStr} != 0)` : `(${tStr} == 0)`
        if (tT.kind === 'string') return isDoubleNeg ? `!(${tStr}).isEmpty` : `(${tStr}).isEmpty`
        if (tT.kind === 'boolean') return isDoubleNeg ? tStr : `!${emitSwiftExpr(inner, indent)}`
        if (typeIsOptional(tT)) return isDoubleNeg ? `(${tStr} != nil)` : `(${tStr} == nil)`
      }
      return `${e.op}${emitSwiftExpr(e.argument, indent)}`
    }
    case 'logical':
      // Parser-C: short-circuit logical. Swift `&&` / `||` semantics
      // match JS for the value types Pyreon signals carry. `??` is
      // Swift's own nil-coalescing — parenthesized because its
      // precedence is LOWER than JS's (a bare `x ?? y > 0` parses as
      // `x ?? (y > 0)` in Swift).
      if (e.op === '??') {
        return `(${emitSwiftExpr(e.left, indent)} ?? ${emitSwiftExpr(e.right, indent)})`
      }
      return `${emitSwiftExpr(e.left, indent)} ${e.op} ${emitSwiftExpr(e.right, indent)}`
    case 'ternary': {
      // Swift ternary syntax is identical to JS — EXCEPT Swift requires the
      // condition to be a `Bool`. JS treats an OPTIONAL as truthy-when-present
      // (`const t = todos.find(...); t ? a : b`) and `!optional` as truthy-
      // when-absent, both of which Swift rejects as a Bool. `swiftCondition`
      // lowers an optional cond → `<cond> != nil` and a `!optional` cond →
      // `<inner> == nil` (other JS coercions — `0`/`""` falsy — left as-is).
      // Swift idiom: `opt ? opt.prop : else` → `(opt?.prop ?? else)`. Swift
      // does NOT narrow the optional inside a ternary then-branch, so the
      // straight `opt != nil ? opt.prop : else` would still fail ("value of
      // optional type 'T?' must be unwrapped to refer to member 'prop'");
      // optional-chaining + nil-coalescing expresses the same intent cleanly.
      // Kotlin SMART-CASTS the then-branch (`if (opt != null) opt.prop else
      // …` compiles), so this is a Swift-only refinement. `optionalMemberTernary`
      // (infer-type.ts — the ONE bisect point) detects the simplest `opt` cond +
      // `opt.prop` then shape (the find-then-field idiom).
      const omt = optionalMemberTernary(e, _exprInferCtx)
      if (omt) {
        return `(${emitSwiftExpr(omt.opt, indent)}?.${swiftIdent(omt.property)} ?? ${emitSwiftExpr(e.otherwise, indent)})`
      }
      const condStr = swiftCondition(e.cond, (x) => emitSwiftExpr(x, indent))
      return `${condStr} ? ${emitSwiftExpr(e.then, indent)} : ${emitSwiftExpr(e.otherwise, indent)}`
    }
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
    case 'rx-call':
      return emitSwiftRxCall(e, indent)
    case 'jsx-element':
      return emitSwiftJsx(e, indent)
    case 'jsx-fragment': {
      const pad = ' '.repeat(indent + 2)
      return `Group {\n${e.children.map((c) => pad + emitSwiftChild(c, indent + 2)).join('\n')}\n${' '.repeat(indent)}}`
    }
    case 'array': {
      // A TYPED-EMPTY array (`[] as T[]` → `elementType` set) emits a typed empty
      // literal so Swift can infer the element type (a bare `[]` is `Any`).
      if (e.elements.length === 0 && e.elementType !== undefined) {
        return `[${swiftType(e.elementType)}]()`
      }
      // Array spread → Swift `+` concat (preserves value-semantics). General
      // form, ANY position / count of spreads: walk the elements, emit each
      // SPREAD's argument bare and group consecutive NON-spread elements into
      // an array literal, then join the parts with ` + `:
      //   [...a, ...b]    → a + b
      //   [...a, 9]       → (a + [9])      (the add-to-list idiom)
      //   [9, ...a]       → ([9] + a)
      //   [...a, 9, ...b] → (a + [9] + b)
      //   [...a]          → a
      // The whole concat is PARENTHESISED when there are ≥2 parts so a method
      // applied directly to the literal binds to the concat result, not just
      // the trailing array (`[...a, 9].length` → `(a + [9]).count`, not the
      // pre-fix `a + [9].count` where `.count` bound to `[9]` → a type error).
      // Pre-fix only a single LEADING spread + literal tail emitted, multi-
      // spread emitted `a + [b]` (wrapping b), and nothing was parenthesised.
      const spreadConcat = buildArraySpreadConcat(
        e.elements,
        (el) => emitSwiftExpr(el, indent),
        (r) => `[${r}]`,
      )
      if (spreadConcat !== null) return spreadConcat
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
        // No declared struct matches — SYNTHESIZE one instead of the broken
        // labelled-tuple emit (single-field tuple is illegal Swift; tuple
        // key-paths break `ForEach(id:)`; `obj.field` access fails on the
        // `Any`-typed tuple). Fields may be scalar LITERALS (`{ id: 1 }`) OR
        // non-literal expressions whose type INFERS to a scalar (`{ id:
        // count() }` → Int) via `_exprInferCtx`. Non-scalar / un-inferable
        // fields still fall through to the tuple emit below (unchanged).
        const synthName = synthLiteralStructName(
          e.fields,
          _synthExprStructs,
          _synthExprStructKeys,
          (ex) => inferType(ex, _exprInferCtx),
        )
        if (synthName !== null) {
          const args = e.fields
            .map((f) => `${swiftIdent(f.name)}: ${emitSwiftExpr(f.value, indent)}`)
            .join(', ')
          return `${swiftIdent(synthName)}(${args})`
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

  // Spread attrs (`<Stack {...cfg()}>`) lower to native ONLY on a USER
  // component, where they expand against the component's declared props
  // at the constructor call (see expandSwiftSpread). On a canonical
  // primitive / control-flow tag a SwiftUI view takes fixed layout args
  // via modifier chains — there is no arbitrary runtime prop-bag — so a
  // spread's props would be SILENTLY DROPPED (the dedicated emitters read
  // attrs by name through readStaticAttr and never consult a spread,
  // producing a clean-compiling but WRONG layout). Surface that loudly as
  // a named build-failing warning. One guard here covers every dedicated
  // emitter AND the emitSwiftGeneric fallthrough, since emitSwiftJsx is
  // the single entry point for every jsx-element (top-level and nested).
  if (!_componentNames.has(tag) && e.attrs.some((a) => a.kind === 'spread')) {
    _emitWarnings.push(
      `<${tag} {...}> spread is not lowered to native — its props are DROPPED (a runtime prop-bag can't apply to a static SwiftUI view). Pass props explicitly, e.g. <${tag} gap="md" padding={4}>.`,
    )
  }

  if (tag === 'For') return emitSwiftFor(e, indent)
  if (tag === 'Show') return emitSwiftShow(e, indent)
  if (tag === 'Transition') return emitSwiftTransition(e, indent)
  if (tag === 'TransitionGroup') return emitSwiftTransitionGroup(e, indent)
  // Escape-hatch primitives (Layer 4) — per-platform branch selection.
  // On the Swift target only `<NativeIOS>` renders its children; `<Web>`
  // and `<NativeAndroid>` are other-platform branches → render nothing.
  // Lets one source carry a platform-specific subtree (e.g. a native
  // chart view inside <NativeIOS>, the @pyreon/charts version inside
  // <Web>). On web, @pyreon/primitives renders the mirror (<Web> shows
  // children, <NativeIOS>/<NativeAndroid> render null).
  if (tag === 'NativeIOS') return emitSwiftEscapeHatch(e, indent, /*matched*/ true)
  if (tag === 'NativeAndroid' || tag === 'Web') {
    return emitSwiftEscapeHatch(e, indent, /*matched*/ false)
  }
  // <WebView> — native host (WKWebView via PyreonWebView) for embedding
  // web-only-rich viz (charts / flow / tables) inside a native shell.
  if (tag === 'WebView') return emitSwiftWebView(e)
  // Phase 5 — walled tags. SwiftUI has no equivalent for these three:
  //   - <Suspense fallback>:   no async-render-suspend mechanism
  //   - <ErrorBoundary fallback>: no render-time try/catch
  //   - <KeepAlive>:           no state-cache across unmount
  // Previously these emitted FAKE identifiers (Suspense(fallback: …) {})
  // that don't exist in SwiftUI → cryptic "unresolved identifier" at
  // swiftc time. The graceful behaviour is to emit just the children
  // (the happy path: the inner content always renders) + a leading
  // comment surfacing the limitation at code-read time. The
  // fallback / cache behaviour is inert until a runtime-model design
  // lands (tracked in the multiplatform plan as Phase 5 frontier).
  // Gap 3 PR-3.2 — real Suspense emit (mount-time splash semantic).
  // Gap 3 PR-3.3 — real ErrorBoundary emit (structural fallback).
  // Gap 3 PR-3.4 — real KeepAlive emit (visibility-preservation).
  if (tag === 'Suspense') {
    return emitSwiftSuspense(e, indent)
  }
  if (tag === 'ErrorBoundary') {
    return emitSwiftErrorBoundary(e, indent)
  }
  if (tag === 'KeepAlive') {
    return emitSwiftKeepAlive(e, indent)
  }
  if (tag === 'Text') return emitSwiftText(e, indent)
  if (tag === 'Button') return emitSwiftButton(e, indent)
  if (tag === 'TextField') return emitSwiftTextField(e, indent)
  if (tag === 'Checkbox') return emitSwiftCheckbox(e, indent)
  // Phase B — canonical multi-platform primitives (@pyreon/primitives).
  // Per the architectural plan, these route through dedicated
  // emit functions BEFORE the generic-tag fallthrough so each maps to
  // its idiomatic SwiftUI shape (props → modifier chains; canonical
  // `onPress` → `action:`; tokens → resolved CGFloats).
  if (tag === 'Stack') return emitSwiftStack(e, indent, /*defaultDirection*/ 'column')
  if (tag === 'Inline') return emitSwiftStack(e, indent, /*defaultDirection*/ 'row')
  if (tag === 'Layer') return emitSwiftLayer(e, indent)
  if (tag === 'Scroll') return emitSwiftScroll(e, indent)
  if (tag === 'Spacer') return emitSwiftSpacer(e)
  if (tag === 'Heading') return emitSwiftHeading(e, indent)
  if (tag === 'Icon') return emitSwiftIcon(e, indent)
  if (tag === 'Image') return emitSwiftImage(e, indent)
  if (tag === 'Modal') return emitSwiftModal(e, indent)
  if (tag === 'Press') return emitSwiftPress(e, indent)
  if (tag === 'Field') return emitSwiftField(e, indent)
  if (tag === 'Toggle') return emitSwiftToggle(e, indent)
  if (tag === 'Link') return emitSwiftLink(e, indent)
  if (tag === 'RouterProvider') return emitSwiftRouterProvider(e, indent)
  if (tag === 'RouterView') return emitSwiftRouterView(e, indent)
  // 9 other canonical primitives (Layer, Scroll, Spacer, Heading,
  // Image, Icon, Link, Modal) DON'T have dedicated emit functions
  // yet — they fall through to generic emit, which produces the
  // LITERAL tag name in output (not typecheck-clean against the
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
 * Without G1 (baseline emit): `TextField(value: draft, placeholder: "...")`
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

/**
 * The bare `Text(...)` construction WITHOUT layout modifiers — shared
 * by `emitSwiftText` (which appends them) and `emitSwiftHeading`
 * (which appends font/bold/color BEFORE its own modifier pass; calling
 * the modifier-appending variant from Heading would double-emit the
 * accessibility identifier).
 */
/**
 * Interpolation segment for a VALUE expression inside a Text string. An
 * OPTIONAL-typed expr (an optional prop, a `.find` result) renders EMPTY
 * when nil — matching JSX, where `{undefined}` renders nothing — instead
 * of Swift's `Optional(x)` debug description (which also trips the swiftc
 * "string interpolation produces a debug description" warning). The
 * receiver is parenthesized so `.map` binds to the WHOLE expr — an
 * optional CHAIN (`a?.b`) would otherwise flatten and `.map` would land
 * on the non-optional link.
 */
function swiftInterpSegment(e: ExprIR, indent: number): string {
  const emitted = emitSwiftExpr(e, indent)
  if (typeIsOptional(inferType(e, _activeInferCtx))) {
    return `\\((${emitted}).map { "\\($0)" } ?? "")`
  }
  return `\\(${emitted})`
}

function emitSwiftTextCore(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  if (e.children.length === 0) return 'Text("")'
  if (e.children.length === 1 && e.children[0]!.kind === 'text') {
    return `Text(${JSON.stringify(e.children[0]!.value)})`
  }
  const parts: string[] = []
  for (const c of e.children) {
    if (c.kind === 'text') {
      parts.push(escapeSwiftInterp(c.value))
    } else if (c.expr.kind === 'template') {
      // Splice a template child's segments directly into the Text's own
      // interpolation so `<Text>{`Hi ${n}`}</Text>` emits `Text("Hi \(n)")`
      // — not the redundant `Text("\("Hi \(n)")")` (a string interpolated
      // into a string).
      const t = c.expr
      for (let i = 0; i < t.quasis.length; i++) {
        parts.push(escapeSwiftStringSegment(t.quasis[i] ?? ''))
        if (i < t.exprs.length) parts.push(`\\(${emitSwiftExpr(t.exprs[i]!, indent)})`)
      }
    } else {
      parts.push(swiftInterpSegment(c.expr, indent))
    }
  }
  return `Text("${parts.join('')}")`
}

function emitSwiftText(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  // `<Text>Hello</Text>` → `Text("Hello")`
  // `<Text>{count}</Text>` → `Text("\(count)")`
  // mixed text + expr is built as an interpolated Swift string.
  //
  // Layout modifiers INCLUDING `data-testid` → .accessibilityIdentifier
  // thread on every shape — their absence on Text was the same
  // device-found bug class as Button (#1506) and Field (a43599f01):
  // `app.staticTexts["login-error"]` invisible to XCUITest while
  // label-based queries worked, so the iOS smoke (label-querying)
  // passed and only the tag-querying Android smoke caught it.
  const font = readStaticAttr(e, 'font')
  let result = emitSwiftTextCore(e, indent)
  if (typeof font === 'string') {
    // Custom font → .font(.custom("<PostScriptName>", size: 17)). The
    // PostScript name (not the canonical/filename) is what Font.custom
    // registers against — supplied by the CLI from the sfnt name table.
    // A font not in the map (materialization didn't run) falls back to
    // the canonical name + a warning, so it's visible, not a silent
    // system-font swap.
    const ps = _fontMap[font]
    if (ps === undefined) {
      _emitWarnings.push(
        `<Text font=${JSON.stringify(font)}>: no bundled font by that name — run the assets/fonts step (Font.custom will fall back to the system font on-device).`,
      )
    }
    result += `.font(.custom(${JSON.stringify(ps ?? font)}, size: 17))`
  }
  return `${result}${emitSwiftLayoutModifiers(e)}`
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
  // Round-1 audit fix: `disabled={true}` / `disabled={signal}` was
  // SILENTLY dropped — Button stayed enabled regardless of the prop.
  // SwiftUI's idiomatic disable shape is `.disabled(<bool>)` modifier.
  // Skip when absent or literal `false` (default-enabled).
  const disabledModifier = swiftDisabledModifier(e)
  let result: string
  if (labelText !== null) {
    result = `Button(${JSON.stringify(labelText)}) ${action}`
  } else {
    // Complex content; emit Button { action } label: { content }.
    const pad = ' '.repeat(indent + 2)
    const contentLines = e.children
      .map((c) => pad + emitSwiftChild(c, indent + 2))
      .join('\n')
    result = `Button(action: ${action}) {\n${contentLines}\n${' '.repeat(indent)}}`
  }
  // Layout modifiers INCLUDING `data-testid` → .accessibilityIdentifier.
  // Pre-fix, Button was the one interactive primitive that dropped the
  // testid entirely — `app.buttons["login-submit"]` timed out at device
  // scope while label-based queries (`app.buttons["Continue"]`) worked,
  // which is why router-demo's label-querying smoke passed and the
  // tasks identifier-querying smoke failed.
  const layoutModifiers = emitSwiftLayoutModifiers(e)
  result = layoutModifiers ? `${result}${layoutModifiers}` : result
  return disabledModifier ? `${result}\n${' '.repeat(indent)}  ${disabledModifier}` : result
}

/**
 * Round-1 audit fix shared helper: resolve a `disabled={…}` attr to a
 * SwiftUI `.disabled(<bool-expr>)` modifier suffix. Returns the empty
 * string when the attr is absent or a literal `false` (default-enabled).
 *
 * Shapes recognized:
 *   - `disabled` (boolean shorthand)         → `.disabled(true)`
 *   - `disabled={true}` / `disabled={false}` → `.disabled(true)` / ''
 *   - `disabled={signalOrExpr}`              → `.disabled(<emitted-expr>)`
 *
 * Symmetric with `<Field>`'s existing `disabled` handling.
 */
function swiftDisabledModifier(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  const attr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr' && a.name === 'disabled',
  )
  if (!attr) return ''
  // Boolean-shorthand `<Button disabled>` (no value) parses as attr-with
  // literal `true` (consistent with HTML `<input disabled>`).
  if (attr.value.kind === 'literal') {
    if (attr.value.value === false) return ''
    return '.disabled(true)'
  }
  // Signal-bound / expression form → emit the expression, wrap in
  // `.disabled(...)`. `emitSwiftSignalRead` handles signal-name
  // membership + plain-identifier vs `.value`-rewrite distinction.
  return `.disabled(${emitSwiftSignalRead(unwrapAccessorArrow(attr.value))})`
}

function emitSwiftAction(handler: ExprIR, indent: number): string {
  // Strip outer arrow if present — Button takes a closure body directly.
  if (handler.kind === 'arrow') {
    // Multi-statement block body (`() => { a.set(1); b.set(2) }`) — emit
    // EVERY statement. Pre-fix the parse kept only the first statement and
    // silently dropped the rest (a HIGH "1 code, all platforms" bug).
    if (handler.stmts !== undefined && handler.stmts.length > 0) {
      const pad = ' '.repeat(indent + 2)
      // Inline component value-consts — an inline handler closure lives outside
      // the ViewBuilder body too, so it can't see the body-local `let`s the
      // value-consts emit as (same "cannot find in scope" as named handlers).
      const inlinedStmts = inlineValueConstsInStmts(handler.stmts)
      // Seed the handler-LOCAL `const`/`let` types into the infer ctx so a
      // later type-dependent emit inside this body resolves them — e.g. `const
      // t = todos.find(…); if (t) { … }` now sees `t` is optional and lowers
      // the condition to `if t != nil`. Restored after, so the seeding is
      // scoped to this body (re-entrant-safe for nested handlers).
      const savedLocals = seedHandlerLocals(inlinedStmts, _exprInferCtx)
      const lines = inlinedStmts.map((s) => pad + emitSwiftStatement(s, indent + 2)).join('\n')
      _exprInferCtx.locals = savedLocals
      return `{\n${lines}\n${' '.repeat(indent)}}`
    }
    // Round-1 audit fix: empty arrow body `() => {}` parses (see
    // parse.ts ArrowFunctionExpression) to `body: { kind: 'literal',
    // value: '' }`. Without this branch the emit is `{ "" }` — a
    // closure RETURNING an empty String, which is a type error in
    // Swift's `() -> Void` action slot (`Button("X") { "" }` would
    // fail swiftc). Emit a truly empty closure instead.
    if (handler.body.kind === 'literal' && handler.body.value === '') {
      return '{ }'
    }
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

// Extract the body from an `emitSwiftAction` closure string
// (`{ body }` -> `body`). Used where the body must be embedded inside
// another closure — e.g. `Binding(set: { _ in <body> })`.
//
// ReDoS-safe by construction. The previous form stripped the braces with
// an unanchored trailing "zero-or-more-whitespace then brace then end"
// match, which re-scanned the run of whitespace from every start index —
// O(n^2) on a string of n trailing spaces with no closing brace
// (CodeQL js/polynomial-redos). The closure here is library-emitted Swift
// source derived from the `.tsx` input, so the input string is
// attacker-influenceable. This form strips the braces with single-char
// anchored matches (no quantifier) and lets the native, linear `.trim()`
// handle the surrounding whitespace — behaviourally identical
// (`emitSwiftAction` always returns a `{ ... }` closure, including `{ }`).
function stripSwiftClosureBody(closure: string): string {
  return closure.replace(/^\{/, '').replace(/\}$/, '').trim()
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
  // `by` keying: a member body ((i) => i.id) → key path \.id; an IDENTITY
  // body ((n) => n, the plain-string-list shape) → \.self (String/Int are
  // Hashable) — pre-fix extractMemberPath silently fell back to \.id for
  // the identity lambda, an uncompilable SILENT mis-emit ("value of type
  // 'String' has no member 'id'"). Any OTHER by-shape (computed keys) has
  // no Swift KeyPath analog → NAMED warning + the \.id fallback so swiftc
  // names the site (never silent).
  let idKey = 'id'
  if (by && by.value.kind === 'arrow') {
    const b = by.value
    if (b.body !== undefined && b.body.kind === 'identifier' && b.params[0] === b.body.name) {
      idKey = 'self'
    } else if (b.body !== undefined && b.body.kind === 'member') {
      idKey = b.body.property
    } else {
      _emitWarnings.push(
        `<For by={…}>: only an identity key ((x) => x) or a member key ((x) => x.field) lowers to a SwiftUI ForEach id — this by-callback matches neither; emitting id: \\.id which likely fails to compile. Key on a field or the element itself.`,
      )
    }
  }
  const idPath = idKey

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
  // Same optional-truthiness lowering as the ternary / `&&`: `<Show when={t}>`
  // where `t` is OPTIONAL → `if t != nil { … }` (and `when={!t}` → `if t == nil
  // { … }`), not the bare `if t` swiftc rejects as a non-Bool condition. Uses
  // the accessor-aware `emitSwiftSignalRead` as the operand emitter.
  const whenExpr = when ? unwrapAccessorArrow(when.value) : undefined
  const cond = whenExpr ? swiftCondition(whenExpr, emitSwiftSignalRead) : 'true'
  const pad = ' '.repeat(indent + 2)
  const body = e.children.map((c) => pad + emitSwiftChild(c, indent + 2)).join('\n')
  return `if ${cond} {\n${body}\n${' '.repeat(indent)}}`
}

/**
 * Phase 5 — `<Transition show={cond}>children</Transition>` → an animated
 * show-gate. SwiftUI has no CSS-class transition system, so the web-only
 * `enter`/`enterFrom`/`leave`/… class props are ignored; the native
 * translation animates the children's insertion/removal with the platform
 * animation system. v1 uses a `.transition(.opacity)` fade driven by an
 * `.animation(.default, value:)` on a stable `ZStack` container (the
 * conditional itself can't carry the value-driver — it isn't stable across
 * the flip). Mirrors the Compose `AnimatedVisibility` shape.
 */
/**
 * Phase 5 — graceful emit for walled tags (Suspense / ErrorBoundary /
 * KeepAlive). SwiftUI has no native equivalent for any of these:
 *   - Suspense needs an async-render-suspend mechanism
 *   - ErrorBoundary needs render-time try/catch
 *   - KeepAlive needs a state-cache across unmount
 *
 * Instead of emitting a FAKE `Suspense(fallback: …) { … }` identifier
 * (no such SwiftUI type → cryptic "unresolved identifier" at swiftc),
 * we wrap the children in a single `Group { … }` (the SwiftUI-idiomatic
 * neutral container) and prefix a comment naming the limitation. The
 * happy path renders the inner content; the fallback / cache behaviour
 * is inert until a runtime-model design lands.
 */
/**
 * Phase 2 — real `<Suspense fallback={X}>` emit (loading-state
 * semantic). Emits an INLINE `Group { if <pending> { fallback } else
 * { children } }` where `<pending>` ORs every `useFetch` container's
 * `.isPending` in the component. The condition is read DIRECTLY in the
 * component body so SwiftUI's Observation tracks the dependency on THIS
 * view and re-renders when the fetch settles — passing the same value
 * as an argument to a child wrapper struct does NOT reliably establish
 * that tracking (a device-found subtlety; the earlier
 * `PyreonSuspenseWrapper` child-struct approach was abandoned for it).
 *
 *   <Suspense fallback={<Spinner/>}>
 *     <Content/>
 *   </Suspense>
 *
 * emits as
 *
 *   Group {
 *     if quotes.isPending {
 *       Spinner()
 *     } else {
 *       Content()
 *     }
 *   }
 *
 * No fetch in the component → condition is `false` (content always
 * shows). Bail to walled emit + warning if no fallback prop is present
 * (the contract is "fallback OR no point" — a Suspense with no
 * fallback is just a Group wrapper).
 */
function emitSwiftSuspense(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const fallbackAttr = e.attrs.find(
    (a) => a.kind === 'attr' && a.name === 'fallback',
  ) as Extract<AttrIR, { kind: 'attr' }> | undefined
  if (!fallbackAttr) {
    // No fallback → fall back to walled emit (children-only render).
    return emitSwiftWalledTagAsChildren(e, indent, 'Suspense')
  }
  const fallbackExpr = fallbackAttr.value
  if (fallbackExpr.kind !== 'jsx-element') {
    // Non-JSX fallback (signal accessor, computed value) — v1 deferred.
    _emitWarnings.push(
      '<Suspense fallback={…}> on Swift target: only JSX-literal fallback is supported in v1 (e.g. `fallback={<Spinner/>}`). Falling back to walled emit.',
    )
    return emitSwiftWalledTagAsChildren(e, indent, 'Suspense')
  }
  // Real semantics (Phase 2), emitted INLINE — NOT via a child wrapper
  // struct. The fallback shows while ANY useFetch container in the
  // component is pending. Critically the `isLoading` condition is read
  // DIRECTLY in the component's body (`if <fetch>.isPending`), so
  // SwiftUI's Observation tracks the dependency on THIS view and
  // re-renders when the fetch settles. Passing the same value as an
  // argument to a child View does NOT reliably establish that tracking
  // (the child reads its own stored Bool, not the @Observable) — a
  // device-found subtlety. No fetch → `false` (content always shows).
  const inner = ' '.repeat(indent + 2)
  const p = ' '.repeat(indent)
  const childrenBody = e.children
    .map((c) => inner + '    ' + emitSwiftChild(c, indent + 6))
    .join('\n')
  const fallbackBody =
    inner + '    ' + emitSwiftChild({ kind: 'expr', expr: fallbackExpr }, indent + 6)
  const fetches = [..._fetchNamesSwift]
  const isLoading =
    fetches.length > 0
      ? fetches.map((f) => `${swiftIdent(f)}.isPending`).join(' || ')
      : 'false'
  // Group wraps the if/else so it's a single View in any context.
  return (
    `Group {\n` +
    `${inner}  if ${isLoading} {\n` +
    `${fallbackBody}\n` +
    `${inner}  } else {\n` +
    `${childrenBody}\n` +
    `${inner}  }\n` +
    `${p}}`
  )
}

/**
 * Gap 3 PR-3.3 — real `<ErrorBoundary fallback={X}>` emit (structural
 * boundary primitive). SwiftUI has no try/catch around View body
 * construction, so v1 ships the boundary infrastructure: children
 * render by default; the wrapper holds `@State hasError` that can be
 * flipped to swap to fallback.
 *
 *   <ErrorBoundary fallback={<ErrorView/>}>
 *     <RiskyContent/>
 *   </ErrorBoundary>
 *
 * emits as
 *
 *   Group {
 *     if quotes.error != nil {
 *       ErrorView()
 *     } else {
 *       RiskyContent()
 *     }
 *   }
 *
 * The `<cond>` ORs every `useFetch` container's `.error != nil` in the
 * component, read INLINE in the body so SwiftUI Observation tracks it
 * (same device-found requirement as Suspense). This is honestly less
 * than the web's auto-catch-thrown-render semantic (which native can't
 * deliver), but a failed fetch's error DOES drive the fallback. No
 * fetch → `false` (content always shows).
 *
 * Bails to walled emit + warning when no `fallback` prop is present
 * (a no-fallback ErrorBoundary is just a Group wrapper).
 */
function emitSwiftErrorBoundary(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const fallbackAttr = e.attrs.find(
    (a) => a.kind === 'attr' && a.name === 'fallback',
  ) as Extract<AttrIR, { kind: 'attr' }> | undefined
  if (!fallbackAttr) {
    return emitSwiftWalledTagAsChildren(e, indent, 'ErrorBoundary')
  }
  const fallbackExpr = fallbackAttr.value
  if (fallbackExpr.kind !== 'jsx-element') {
    _emitWarnings.push(
      '<ErrorBoundary fallback={…}> on Swift target: only JSX-literal fallback is supported in v1 (e.g. `fallback={<ErrorView/>}`). Falling back to walled emit.',
    )
    return emitSwiftWalledTagAsChildren(e, indent, 'ErrorBoundary')
  }
  const inner = ' '.repeat(indent + 2)
  const p = ' '.repeat(indent)
  const fetches = [..._fetchNamesSwift]
  const hasError =
    fetches.length > 0
      ? fetches.map((f) => `${swiftIdent(f)}.error != nil`).join(' || ')
      : 'false'
  // Inline (see emitSwiftSuspense) — the @Observable .error read must be
  // in the component body to be tracked; a child-wrapper arg isn't.
  const childrenBody = e.children
    .map((c) => inner + '    ' + emitSwiftChild(c, indent + 6))
    .join('\n')
  const fallbackBody =
    inner + '    ' + emitSwiftChild({ kind: 'expr', expr: fallbackExpr }, indent + 6)
  return (
    `Group {\n` +
    `${inner}  if ${hasError} {\n` +
    `${fallbackBody}\n` +
    `${inner}  } else {\n` +
    `${childrenBody}\n` +
    `${inner}  }\n` +
    `${p}}`
  )
}

/**
 * Gap 3 PR-3.4 — real `<KeepAlive when={X}>` emit (visibility-
 * preservation semantic). SwiftUI's `if cond { child }` would unmount
 * the child when `cond` flips false — losing all child state. v1
 * emits a wrapper that keeps the children mounted across `when`
 * toggles, hidden via opacity + hit-testing disabled when off. The
 * children's `@State` / `@StateObject` survive intact across toggles
 * — the closest faithful translation of the web KeepAlive contract.
 *
 *   <KeepAlive when={isActive}>
 *     <ExpensiveChild/>
 *   </KeepAlive>
 *
 * emits as
 *
 *   PyreonKeepAliveWrapper(when_: isActive) {
 *     ExpensiveChild()
 *   }
 *
 * Falls back to walled emit when no `when` prop (the no-flag shape
 * means "always show" — equivalent to inlining the children).
 */
function emitSwiftKeepAlive(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const whenAttr = e.attrs.find(
    (a) => a.kind === 'attr' && a.name === 'when',
  ) as Extract<AttrIR, { kind: 'attr' }> | undefined
  if (!whenAttr) {
    return emitSwiftWalledTagAsChildren(e, indent, 'KeepAlive')
  }
  _needsSwiftKeepAliveWrapper = true
  const whenExpr = emitSwiftSignalRead(unwrapAccessorArrow(whenAttr.value))
  const inner = ' '.repeat(indent + 2)
  const p = ' '.repeat(indent)
  const childrenBody = e.children
    .map((c) => inner + '  ' + emitSwiftChild(c, indent + 4))
    .join('\n')
  return (
    `PyreonKeepAliveWrapper(when_: ${whenExpr}) {\n` +
    `${childrenBody}\n` +
    `${p}}`
  )
}

/**
 * Helper struct emitted once at module scope when any KeepAlive
 * site is encountered. Once the children have been shown once,
 * they stay in the View tree across `when_` toggles — hidden via
 * opacity + hit-testing disabled when off. Children's @State
 * survives intact.
 */
const SWIFT_KEEP_ALIVE_WRAPPER = `@available(iOS 17.0, macOS 14.0, *)
private struct PyreonKeepAliveWrapper<Content: View>: View {
    let when_: Bool
    let content: () -> Content
    @State private var hasShown = false
    init(when_: Bool, @ViewBuilder content: @escaping () -> Content) {
        self.when_ = when_
        self.content = content
    }
    var body: some View {
        Group {
            if when_ || hasShown {
                content()
                    .opacity(when_ ? 1 : 0)
                    .allowsHitTesting(when_)
                    .onAppear { hasShown = true }
            }
        }
    }
}`

let _needsSwiftKeepAliveWrapper = false

/**
 * Escape-hatch primitive emit (`<NativeIOS>` / `<NativeAndroid>` / `<Web>`).
 * `matched` = this branch targets the Swift platform (i.e. `<NativeIOS>`):
 * emit its children as the platform-specific subtree. Otherwise it's an
 * other-platform branch (`<Web>` / `<NativeAndroid>`) → render nothing
 * (`EmptyView()`), so the source's web / Android content is dropped from
 * the iOS build. Children are emitted concatenated (ViewBuilder context),
 * mirroring the walled-tag helper.
 */
function emitSwiftEscapeHatch(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
  matched: boolean,
): string {
  if (!matched || e.children.length === 0) return 'EmptyView()'
  const inner = ' '.repeat(indent + 2)
  return e.children.map((c) => inner + emitSwiftChild(c, indent + 2)).join('\n').trimStart()
}

function emitSwiftWalledTagAsChildren(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
  tag: 'Suspense' | 'ErrorBoundary' | 'KeepAlive',
): string {
  const inner = ' '.repeat(indent + 2)
  const body = e.children.map((c) => inner + emitSwiftChild(c, indent + 2)).join('\n')
  const p = ' '.repeat(indent)
  const limitation =
    tag === 'Suspense'
      ? 'no async-render-suspend on SwiftUI'
      : tag === 'ErrorBoundary'
        ? 'no render-time try/catch on SwiftUI'
        : 'no native state-cache across unmount on SwiftUI'
  // Phase 3 native-readiness gap fix (2026-06-05): surface dropped
  // feature-bearing props as user-visible warnings. The walled emit
  // STILL renders children — apps' inner content always shows — but
  // the dropped fallback / error-handler / cache contract is now LOUD
  // at compile time instead of silent. Same pattern #1235 used for
  // useLoaderData.
  //
  // Feature-bearing prop catalog per walled tag (web-source shape):
  //   <Suspense fallback={X}>      — fallback is the dropped feature
  //   <ErrorBoundary fallback={X}> — same
  //   <KeepAlive when={X}>         — when toggles cache, dropped
  // The check is for ANY attr presence — boolean / accessor / literal
  // all qualify because all communicate user intent that the dropped
  // emit can't honor.
  const droppableProps =
    tag === 'Suspense' || tag === 'ErrorBoundary' ? ['fallback'] : ['when', 'include', 'exclude']
  const droppedAttrs = e.attrs
    .filter((a): a is Extract<AttrIR, { kind: 'attr' }> => a.kind === 'attr')
    .map((a) => a.name)
    .filter((name) => droppableProps.includes(name))
  if (droppedAttrs.length > 0) {
    _emitWarnings.push(
      `<${tag}> on Swift target: dropped prop(s) [${droppedAttrs.join(', ')}] — ` +
        `${limitation}; children render but ${
          tag === 'Suspense'
            ? 'fallback never shows during async loads'
            : tag === 'ErrorBoundary'
              ? 'fallback never shows on render errors'
              : 'cache behaviour is inert (children re-create on every mount)'
        }. Use a per-target adapter (Layer 4: <NativeIOS>) for full semantic parity.`,
    )
  }
  return (
    `// [Pyreon] <${tag}> unsupported on iOS — rendering children only (${limitation}); fallback / cache behaviour inert.\n` +
    `${p}Group {\n${body}\n${p}}`
  )
}

function emitSwiftTransition(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const show = e.attrs.find((a) => a.kind === 'attr' && a.name === 'show') as
    | Extract<AttrIR, { kind: 'attr' }>
    | undefined
  const cond = show ? emitSwiftSignalRead(unwrapAccessorArrow(show.value)) : 'true'
  const inner = ' '.repeat(indent + 6)
  const body = e.children.map((c) => inner + emitSwiftChild(c, indent + 6)).join('\n')
  const p = ' '.repeat(indent)
  return (
    `ZStack {\n` +
    `${p}  if ${cond} {\n` +
    `${p}    Group {\n${body}\n${p}    }\n` +
    `${p}      .transition(.opacity)\n` +
    `${p}  }\n` +
    `${p}}\n` +
    `${p}.animation(.default, value: ${cond})`
  )
}

/**
 * Phase 5.3 — `<TransitionGroup>{children}</TransitionGroup>` → an animated
 * list container. TransitionGroup's web contract is "animate the enter/leave
 * of a KEYED list" — its child is typically a `<For each={items}>`. SwiftUI
 * animates `ForEach` insert/remove with the default transition when the
 * container carries an `.animation(.default, value:)` keyed on the list.
 *
 * We render the children inside a `VStack` and drive the animation off the
 * For child's `each` signal (the list whose mutation triggers the
 * enter/leave). When no For child is present there is nothing whose change
 * could animate, so the container renders plain — honest no-op rather than a
 * value-less `.animation` that SwiftUI deprecates. Mirror of the Compose
 * `Modifier.animateContentSize()` shape (which needs no explicit driver).
 */
function emitSwiftTransitionGroup(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const p = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)
  const body = e.children.map((c) => inner + emitSwiftChild(c, indent + 2)).join('\n')
  const container = `VStack {\n${body}\n${p}}`
  const driver = findForEachDriverSwift(e)
  return driver !== undefined
    ? `${container}\n${p}.animation(.default, value: ${driver})`
    : container
}

/**
 * Find the `each` list signal of a direct `<For>` child, emitted as a Swift
 * read — the value that drives a `<TransitionGroup>`'s list animation.
 * Returns undefined when no For child is present (static content — nothing
 * to animate).
 */
function findForEachDriverSwift(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string | undefined {
  for (const c of e.children) {
    if (c.kind !== 'expr' || c.expr.kind !== 'jsx-element' || c.expr.tag !== 'For') continue
    const each = c.expr.attrs.find((a) => a.kind === 'attr' && a.name === 'each') as
      | Extract<AttrIR, { kind: 'attr' }>
      | undefined
    if (each) return emitSwiftSignalRead(each.value)
  }
  return undefined
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
      // Const-ref: `src={API_URL}` where API_URL is a module-level
      // `const` string/number/boolean binding. Resolve it to its
      // literal so naming a constant works as well as inlining it.
      // Unknown / component-scope / non-const identifiers aren't in
      // the map → return undefined → existing "needs static" path.
      if (a.value.kind === 'identifier') {
        const resolved = _constStringMap.get(a.value.name)
        if (resolved !== undefined) return resolved
        // Component-scope const (set per emitSwiftComponent) — same
        // resolution as a module-level const.
        const compResolved = _componentConstMap.get(a.value.name)
        if (compResolved !== undefined) return compResolved
      }
    }
  }
  return undefined
}

/**
 * Tags that emit a plain SwiftUI layout CONTAINER (VStack / HStack /
 * ZStack / ScrollView). Used by the `data-testid` emit: containers
 * need `.accessibilityElement(children: .contain)` for their
 * identifier to be XCUITest-queryable. Canonical vocabulary + the
 * legacy SwiftUI-flavored tags (still accepted per the additive
 * migration contract).
 */
const SWIFT_CONTAINER_TAGS = new Set([
  'Stack',
  'Inline',
  'Layer',
  'Scroll',
  'VStack',
  'HStack',
  'ZStack',
  'ScrollView',
])

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
  // E3.1 — `data-testid` becomes SwiftUI's `.accessibilityIdentifier()`
  // so the same string the web e2e selects on (`getByTestId`) is also
  // reachable to XCUITest. Other `data-*` attrs are silently dropped
  // (consistent with HTML where they're untyped author data).
  //
  // CONTAINER views additionally need `.accessibilityElement(children:
  // .contain)` BEFORE the identifier: SwiftUI flattens plain layout
  // containers (VStack/HStack/ZStack/ScrollView) out of the
  // accessibility tree, so an identifier on a bare VStack is INVISIBLE
  // to XCUITest — `app.otherElements["todo-app"]` times out even
  // though the app renders perfectly. This was the first real-device
  // finding past app LAUNCH: every UITest's root-view assertion failed
  // against a fully-working app. `.contain` (NOT `.combine`) keeps the
  // children individually queryable — the smokes also select child
  // buttons/fields by their own testids. Leaf views (Button/Text/
  // Field) are accessibility elements already; adding a container
  // semantic to them would BREAK their tap targeting, hence the
  // tag-gated emit. Compose is unaffected (`Modifier.testTag` adds
  // its own semantics node on any composable).
  const testid = readStaticAttr(e, 'data-testid')
  if (typeof testid === 'string') {
    if (SWIFT_CONTAINER_TAGS.has(e.tag)) {
      parts.push('.accessibilityElement(children: .contain)')
    }
    parts.push(`.accessibilityIdentifier(${JSON.stringify(testid)})`)
  }
  // Cross-platform a11y vocabulary (`@pyreon/primitives` AccessibilityProps)
  // → SwiftUI a11y modifiers — the iOS lowering of the same neutral props the
  // web lowers to aria-* (`collectPassthroughAttrs`). `accessibilityLabel`
  // sets the VoiceOver name (icon-only buttons, images); `accessibilityHidden`
  // removes the element + its subtree from the accessibility tree.
  const a11yLabel = readStaticAttr(e, 'accessibilityLabel')
  if (typeof a11yLabel === 'string') {
    parts.push(`.accessibilityLabel(${JSON.stringify(a11yLabel)})`)
  }
  if (readStaticAttr(e, 'accessibilityHidden') === true) {
    parts.push('.accessibilityHidden(true)')
  }
  // `accessibilityRole` → SwiftUI accessibility traits. Constrained to the
  // roles that map 1:1 across targets (button/image/header → web `role`,
  // Android Compose `Role`/`heading()`). `.isHeader` marks a heading for the
  // VoiceOver rotor.
  const a11yRole = readStaticAttr(e, 'accessibilityRole')
  const swiftTrait =
    a11yRole === 'button'
      ? '.isButton'
      : a11yRole === 'image'
        ? '.isImage'
        : a11yRole === 'header'
          ? '.isHeader'
          : null
  if (swiftTrait !== null) {
    parts.push(`.accessibilityAddTraits(${swiftTrait})`)
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
 * Map a canonical 1-D `align` to SwiftUI's 2-D `Alignment` enum for
 * `ZStack(alignment:)`. The web `<Layer>` maps `align` to grid
 * `place-items` (both axes), so `start` → top-leading corner, `center`
 * → center, `end` → bottom-trailing; `stretch` has no ZStack analog
 * (children size themselves) → center.
 */
const ZSTACK_ALIGNMENT: Record<string, string> = {
  start: '.topLeading',
  center: '.center',
  end: '.bottomTrailing',
  stretch: '.center',
}

/**
 * Emit `<Layer>` as SwiftUI `ZStack` — children stack on the z-axis
 * (later children render in front), matching the web overlay contract.
 * `align` → `ZStack(alignment:)`; padding/background/radius/data-testid
 * chain via `emitSwiftLayoutModifiers`.
 */
function emitSwiftLayer(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const align = readStaticAttr(e, 'align')
  const initSignature =
    typeof align === 'string'
      ? `(alignment: ${ZSTACK_ALIGNMENT[align] ?? '.center'})`
      : ''
  const modifiers = emitSwiftLayoutModifiers(e)
  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `ZStack${initSignature} {}${modifiers}`
  }
  const contentLines = e.children
    .map((c) => pad + emitSwiftChild(c, indent + 2))
    .join('\n')
  return `ZStack${initSignature} {\n${contentLines}\n${' '.repeat(indent)}}${modifiers}`
}

/**
 * Emit `<Scroll>` as SwiftUI `ScrollView`. `axis="horizontal"` →
 * `ScrollView(.horizontal)`; vertical is the SwiftUI default (emitted
 * bare). Children render inside; padding/background/radius/data-testid
 * chain via `emitSwiftLayoutModifiers`.
 */
function emitSwiftScroll(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const axis = readStaticAttr(e, 'axis')
  const initSignature = axis === 'horizontal' ? '(.horizontal)' : ''
  const modifiers = emitSwiftLayoutModifiers(e)
  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `ScrollView${initSignature} {}${modifiers}`
  }
  // List virtualization: a `<For>` rendered DIRECTLY inside a ScrollView lowers
  // to a bare `ForEach`, which SwiftUI builds EAGERLY — every row is
  // instantiated up front, so a long list blows memory (the iOS counterpart of
  // Android's already-lazy `LazyColumn`). Wrapping the content in a
  // `LazyVStack`/`LazyHStack` makes the enclosed `ForEach` lazy (rows built as
  // they scroll into view). Applied ONLY when a `<For>` child is present, so
  // non-list scrollable content (the device-proven shape) emits byte-identically
  // — zero change to existing apps. `spacing: 0` preserves the current
  // no-inter-row-gap layout. NOTE: this fixes the documented Swift eager-list
  // OOM for the `<For>`-in-`<Scroll>` shape; runtime virtualization is reasoned,
  // not yet exercised by a device test (no example uses For-in-Scroll). The
  // Kotlin counterpart of this shape needs a separate fix (a `LazyColumn` nested
  // in a `verticalScroll` Column is a Compose runtime crash) — tracked.
  const hasFor = e.children.some(
    (c) => c.kind === 'expr' && c.expr.kind === 'jsx-element' && c.expr.tag === 'For',
  )
  if (hasFor) {
    const lazyStack = axis === 'horizontal' ? 'LazyHStack' : 'LazyVStack'
    const innerPad = ' '.repeat(indent + 4)
    const lazyContent = e.children
      .map((c) => innerPad + emitSwiftChild(c, indent + 4))
      .join('\n')
    return (
      `ScrollView${initSignature} {\n` +
      `${pad}${lazyStack}(spacing: 0) {\n${lazyContent}\n${pad}}\n` +
      `${' '.repeat(indent)}}${modifiers}`
    )
  }
  const contentLines = e.children
    .map((c) => pad + emitSwiftChild(c, indent + 2))
    .join('\n')
  return `ScrollView${initSignature} {\n${contentLines}\n${' '.repeat(indent)}}${modifiers}`
}

/**
 * Emit `<Spacer />` as SwiftUI `Spacer()` — the flexible-gap primitive
 * that pushes siblings apart inside a VStack/HStack. Self-closing (no
 * children, no layout props in v1). A `data-testid` still chains via
 * `emitSwiftLayoutModifiers` for XCUITest reachability.
 */
function emitSwiftSpacer(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string {
  return `Spacer()${emitSwiftLayoutModifiers(e)}`
}

/**
 * Map a canonical `<Heading level>` to the SwiftUI font role. Mirrors
 * the web typographic scale (32/24/20/18/16/14px) onto SwiftUI's
 * semantic font roles so iOS uses native Dynamic Type sizing.
 */
const HEADING_FONT: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: '.largeTitle',
  2: '.title',
  3: '.title2',
  4: '.title3',
  5: '.headline',
  6: '.subheadline',
}

/**
 * Emit `<Heading level={N}>text</Heading>` as SwiftUI
 * `Text("text").font(.largeTitle | .title | …).bold()`. Reuses
 * `emitSwiftText` to build the `Text(...)` content (static text OR
 * interpolated `\(expr)`), then chains the level font + bold weight +
 * optional `.foregroundColor` + layout modifiers.
 */
function emitSwiftHeading(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const levelRaw = readStaticAttr(e, 'level')
  const level = (typeof levelRaw === 'number' ? levelRaw : 1) as 1 | 2 | 3 | 4 | 5 | 6
  let result = `${emitSwiftTextCore(e, indent)}.font(${HEADING_FONT[level] ?? '.largeTitle'}).bold()`
  const color = readStaticAttr(e, 'color')
  if (typeof color === 'string') {
    result += `.foregroundColor(${resolveColor(color, 'swift')})`
  }
  return result + emitSwiftLayoutModifiers(e)
}

/**
 * Map a canonical `<Icon size>` to a SwiftUI SF-Symbol image scale.
 */
const ICON_SCALE: Record<string, string> = {
  sm: '.small',
  md: '.medium',
  lg: '.large',
}

/**
 * Emit `<Icon name="..." />` as SwiftUI `Image(systemName: "...")` —
 * the SF Symbols family. `size` → `.imageScale(.small|.medium|.large)`;
 * `color` → `.foregroundColor`. The `name` must be a string literal
 * (SF Symbol id). Falls through to generic emit when `name` is missing
 * or non-literal.
 */
function emitSwiftIcon(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const name = readStaticAttr(e, 'name')
  if (typeof name !== 'string') {
    return emitSwiftGeneric(e, indent)
  }
  // Canonical name → SF Symbol via ICON_MAP. Unmapped names warn and
  // pass through raw — SF Symbols are string-keyed, so direct SF ids
  // (the pre-mapping convention) keep working.
  const mapped = ICON_MAP[name]
  if (!mapped) {
    _emitWarnings.push(
      `<Icon name=${JSON.stringify(name)}>: not in the canonical icon map — passing through as a raw SF Symbol id on iOS (renders a placeholder on Android). See ICON_MAP in canonical-primitives.ts.`,
    )
  }
  let result = `Image(systemName: ${JSON.stringify(mapped ? mapped.sf : name)})`
  const size = readStaticAttr(e, 'size')
  if (typeof size === 'string') {
    result += `.imageScale(${ICON_SCALE[size] ?? '.medium'})`
  }
  const color = readStaticAttr(e, 'color')
  if (typeof color === 'string') {
    result += `.foregroundColor(${resolveColor(color, 'swift')})`
  }
  return result + emitSwiftLayoutModifiers(e)
}

/**
 * Emit `<Image src alt fit? width? height?>` as SwiftUI
 * `AsyncImage(url: URL(string: "<src>"))` — the cross-platform remote-
 * image shape (works for local paths served over the dev server too).
 *
 * - `alt` (required) → `.accessibilityLabel("<alt>")` (VoiceOver).
 * - `width`/`height` → `.frame(width:height:)` (numbers are points;
 *   string values like "50%" are web-only and skipped on native).
 *
 * `fit` (object-fit on web) is NOT mapped in v1: faithfully applying it
 * needs AsyncImage's content-closure form (`.resizable().aspectRatio(
 * contentMode:)`), which is a larger emit shape — deferred to a future
 * arc. The type-level prop is still accepted (silent no-op on Swift),
 * mirroring how `justify` is handled on `<Stack>`.
 *
 * `src` must resolve to a static string — a string literal OR a
 * module-level `const` string binding (`const LOGO = "logo.png"`),
 * which `readStaticAttr` resolves to its literal. A non-const /
 * component-scope / dynamic value falls through to generic emit.
 */
/**
 * The canonical `src` dispatch (asset-pipeline arc, 2026-06-11) —
 * shared contract across all three targets:
 *
 *   - `http(s)://…`  → REMOTE: `AsyncImage(url:)` / Coil / `<img>`.
 *   - bare name (`logo.png` — no scheme, no slash) → BUNDLED asset:
 *     `Image("logo")` (asset-catalog name, extension stripped) /
 *     `painterResource(pyreonDrawable("logo"))` / `<img src="/assets/logo.png">`.
 *     The `pyreon-native assets` CLI step materializes the files into
 *     Assets.xcassets / res/drawable* from the shared `assets/` dir.
 *   - path-style (`/img/x.png`, `img/x.png`) → web-only; native warns
 *     and falls through to the remote emit (which will fail visibly,
 *     not silently).
 */
function imageSrcKind(src: string): 'remote' | 'bundled' | 'path' {
  if (/^https?:\/\//.test(src)) return 'remote'
  if (src.includes('/')) return 'path'
  return 'bundled'
}

/** Asset-catalog name: basename sans extension. */
function bundledAssetName(src: string): string {
  return src.replace(/\.[A-Za-z0-9]+$/, '')
}

const SWIFT_CONTENT_MODE: Record<string, string> = {
  cover: '.scaledToFill()',
  contain: '.scaledToFit()',
  fill: '.scaledToFill()',
}

/**
 * `<WebView html="…" />` / `<WebView src="…" />` → `PyreonWebView(html:)` /
 * `PyreonWebView(src:)` (the WKWebView host in @pyreon/native-runtime-swift).
 * `html` wins if both present. v1 requires a static string; a dynamic value
 * warns + emits a bare `PyreonWebView()` (renders nothing) rather than an
 * unbound reference.
 */
function emitSwiftWebView(e: Extract<ExprIR, { kind: 'jsx-element' }>): string {
  // Content arg — `html` or `src`, static (literal / module-const) or
  // dynamic (signal-derived → reloads reactively; accessor arrows unwrap).
  const content = swiftWebViewContentArg(e)
  // Live-data bridge — `data={signal}` is JSON-encoded (PyreonJSON.encode
  // runtime helper) + PUSHED into the running page (window.__pyreonData)
  // on load + on every change WITHOUT reloading, so the chart updates in
  // place. Always a reactive expression; accessor arrows unwrap.
  const dataExpr = dynamicWebViewAttr(e, 'data')
  const dataArg =
    dataExpr !== undefined ? `data: PyreonJSON.encode(${emitSwiftExpr(dataExpr, 0)})` : undefined
  // Reverse bridge — `onMessage={(m) => …}` receives the string the page
  // sends via `window.pyreonPostMessage(...)`.
  const onMsg = e.attrs.find((a) => a.kind === 'event' && a.name === 'message')
  const onMsgArg =
    onMsg?.kind === 'event'
      ? `onMessage: ${emitSwiftMessageHandler(onMsg.handler)}`
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
 * Emit a `<WebView onMessage={…}>` handler as a Swift `(String) -> Void`
 * closure. The single param is the page-posted string. An arrow with a
 * param keeps it (`{ m in … }`); a zero-param arrow ignores it
 * (`{ _ in … }`); a bare function reference is called with the message.
 */
function emitSwiftMessageHandler(handler: ExprIR): string {
  if (handler.kind === 'arrow') {
    if (handler.body.kind === 'literal' && handler.body.value === '') {
      return '{ _ in }'
    }
    const param = handler.params.length > 0 ? swiftIdent(handler.params[0]!) : '_'
    return `{ ${param} in ${emitSwiftExpr(handler.body, 0)} }`
  }
  return `{ pyreonMsg in ${emitSwiftExpr(handler, 0)}(pyreonMsg) }`
}

/** The `html` / `src` constructor arg for `<WebView>` (static literal /
 * module-const → quoted; dynamic signal-derived → the emitted expression,
 * which reloads reactively). `html` wins over `src`. Undefined when
 * neither is present. */
function swiftWebViewContentArg(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): string | undefined {
  const html = readStaticAttr(e, 'html')
  if (typeof html === 'string') return `html: ${JSON.stringify(html)}`
  const dynHtml = dynamicWebViewAttr(e, 'html')
  if (dynHtml !== undefined) return `html: ${emitSwiftExpr(dynHtml, 0)}`
  const src = readStaticAttr(e, 'src')
  if (typeof src === 'string') return `src: ${JSON.stringify(src)}`
  const dynSrc = dynamicWebViewAttr(e, 'src')
  if (dynSrc !== undefined) return `src: ${emitSwiftExpr(dynSrc, 0)}`
  return undefined
}

/**
 * The dynamic value-expr of a `<WebView>` html/src/data attr, unwrapping a
 * zero-param accessor arrow (`html={() => …}`) to its body — the reactive
 * read idiom. Returns undefined when the attr is absent.
 */
function dynamicWebViewAttr(
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

function emitSwiftImage(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const src = readStaticAttr(e, 'src')
  const srcAttr = e.attrs.find((a) => a.kind === 'attr' && a.name === 'src')
  const width = readStaticAttr(e, 'width')
  const height = readStaticAttr(e, 'height')
  const alt = readStaticAttr(e, 'alt')
  const fit = readStaticAttr(e, 'fit')
  let result: string
  if (typeof src === 'string') {
    const kind = imageSrcKind(src)
    if (kind === 'path') {
      _emitWarnings.push(
        `<Image src=${JSON.stringify(src)}>: path-style src is web-only — use a bare asset name (bundled via the assets pipeline) or a full http(s) URL on native.`,
      )
    }
    if (kind === 'bundled') {
      // Asset-catalog image. `.resizable()` + the fit mapping make the
      // web `object-fit` contract hold (web default is cover);
      // `fit="none"` keeps the intrinsic-size bare Image.
      result = `Image(${JSON.stringify(bundledAssetName(src))})`
      if (fit !== 'none') {
        result += `.resizable()${SWIFT_CONTENT_MODE[typeof fit === 'string' ? fit : 'cover'] ?? '.scaledToFill()'}`
      }
    } else {
      result = `AsyncImage(url: URL(string: ${JSON.stringify(src)}))`
    }
  } else if (srcAttr !== undefined && srcAttr.kind === 'attr' && srcAttr.value.kind !== 'identifier') {
    // Dynamic src — a genuine runtime READ (signal call `url()`, member
    // `props.url` / `item.url`, index). Lowers to a network AsyncImage;
    // previously it fell through to a generic, non-rendering emit, so a
    // data-driven remote image (a feed item / avatar URL held in state) did
    // NOT display. A runtime value can't be told apart bundled-vs-URL, so a
    // dynamic src is treated as a URL.
    //
    // A bare `identifier` is EXCLUDED on purpose: an unresolvable identifier
    // src is the const-ref/unknown case that `readStaticAttr` already routes
    // to the generic fall-through (resolvable module-consts are returned as a
    // static literal above and never reach here) — see const-ref-attr.test.ts.
    result = `AsyncImage(url: URL(string: ${emitSwiftSignalRead(srcAttr.value)}))`
  } else {
    return emitSwiftGeneric(e, indent)
  }
  const frameArgs: string[] = []
  if (typeof width === 'number') frameArgs.push(`width: ${width}`)
  if (typeof height === 'number') frameArgs.push(`height: ${height}`)
  if (frameArgs.length > 0) {
    result += `.frame(${frameArgs.join(', ')})`
  }
  if (typeof alt === 'string') {
    result += `.accessibilityLabel(${JSON.stringify(alt)})`
  }
  return result + emitSwiftLayoutModifiers(e)
}

/**
 * Emit `<Modal open={...} onClose={...}>content</Modal>` as a SwiftUI
 * `.sheet(isPresented:)` modifier attached to an `EmptyView()` host
 * (the standalone-element analog of the declarative web `<Modal>`).
 *
 * Two shapes, mirroring `<Toggle>`:
 *
 * 1. `open={signal}` — bare signal identifier in scope. Emits the
 *    two-way binding projection `$signal`. SwiftUI flips it to `false`
 *    on dismiss, so the user-supplied `onClose` is REDUNDANT (dropped) —
 *    same idiom-split rationale as Toggle's signal shape.
 * 2. `open={expr}` — any other expression (e.g. `props.open`). Emits a
 *    custom `Binding(get: { expr }, set: { if !$0 { onClose() } })` so
 *    dismissal routes through the consumer's `onClose`. Requires
 *    `onClose`; falls through to generic emit without it.
 *
 * iOS `.sheet` provides the focus trap + backdrop + dismissal natively,
 * matching the web `<dialog>`-modal contract.
 */
function emitSwiftModal(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const openAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'open',
  )
  if (!openAttr) {
    return emitSwiftGeneric(e, indent)
  }

  const pad = ' '.repeat(indent + 2)
  const contentLines = e.children
    .map((c) => pad + emitSwiftChild(c, indent + 2))
    .join('\n')
  const content =
    e.children.length === 0
      ? ' '
      : `\n${contentLines}\n${' '.repeat(indent)}`

  // Shape 1 — signal binding projection.
  if (
    openAttr.value.kind === 'identifier' &&
    _signalNames.has(openAttr.value.name)
  ) {
    const sig = swiftIdent(openAttr.value.name)
    return `EmptyView().sheet(isPresented: $${sig}) {${content}}${emitSwiftLayoutModifiers(e)}`
  }

  // Shape 2 — custom Binding; needs onClose for the dismiss write.
  const onClose = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'close',
  )
  if (!onClose) {
    return emitSwiftGeneric(e, indent)
  }
  const openExpr = emitSwiftExpr(unwrapAccessorArrow(openAttr.value), indent)
  const closeClosure = emitSwiftAction(onClose.handler, indent + 4)
  const closeBody = stripSwiftClosureBody(closeClosure)
  const inner = ' '.repeat(indent + 4)
  const bindPad = ' '.repeat(indent + 2)
  const binding =
    `Binding(\n` +
    `${inner}get: { ${openExpr} },\n` +
    `${inner}set: { if !$0 { ${closeBody} } }\n` +
    `${bindPad})`
  return `EmptyView().sheet(isPresented: ${binding}) {${content}}${emitSwiftLayoutModifiers(e)}`
}

/**
 * Emit `<Press onPress={fn}>{anything}</Press>` as a chrome-less
 * SwiftUI `Button(action: { handler }) { content }`.
 *
 * The "make this clickable but don't add button styling" pattern is the
 * explicit-`action:` Button initializer combined with
 * `.buttonStyle(.plain)` so the system button chrome doesn't override
 * the content's existing styling. (NOT the label-first
 * `Button { content } action: { … }` multiple-trailing-closure form —
 * that crashed swiftc's argument-label diagnoser; see the emit site.)
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
  //
  // Form: `Button(action: { … }) { <content> }`. The earlier
  // `Button { <content> } action: { … }` (label-first multiple-trailing-
  // closure) shape CRASHED swiftc's argument-label diagnoser
  // (`diagnoseArgumentLabelError` assertion) — it parsed fine (so the
  // `-parse` gate waved it through) but failed real `-typecheck`. The
  // explicit `action:` argument form is the unambiguous canonical
  // SwiftUI Button initializer and type-checks clean. (`action` already
  // carries its `{ … }` braces from `emitSwiftAction`.)
  return `Button(action: ${action}) {\n${contentLines}\n${' '.repeat(indent)}}.buttonStyle(.plain)${modifiers}`
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

  // v2 (form-binding arc) — `value={form.values.email}` binds through
  // the runtime's `binding(_:)` helper (a SwiftUI Binding<String> whose
  // setter routes through setValue → re-validation). The user's
  // `onChangeText` is SUBSUMED by the binding (same as the signal
  // shape's `$sig` projection below) — the canonical handler is
  // exactly `(v) => form.setFieldValue('email', v)`.
  let bindingExpr: string | undefined
  if (
    valueAttr !== undefined &&
    valueAttr.value.kind === 'member' &&
    valueAttr.value.object.kind === 'member' &&
    valueAttr.value.object.property === 'values' &&
    valueAttr.value.object.object.kind === 'identifier' &&
    _formNamesSwift.has(valueAttr.value.object.object.name)
  ) {
    const formName = swiftIdent(valueAttr.value.object.object.name)
    bindingExpr = `${formName}.binding(${JSON.stringify(valueAttr.value.property)})`
  }

  // `value` MUST name a signal in scope (canonical contract) OR a form
  // dict field (above). Anything else falls through to the generic emit
  // to preserve current behaviour and avoid silently producing broken
  // Swift.
  // Three supported shapes set `textArg`; anything else falls through to
  // generic emit (avoid silently producing broken Swift):
  //   1. form binding (`bindingExpr`, above)
  //   2. bare-signal value (`value={signal}` → `$signal`)
  //   3. controlled value + onChange (`value={expr()} onChange={(v)=>…}`)
  //      → a custom `Binding(get:set:)`, mirroring Toggle's Shape 2.
  // Shape 3 closes a real silent-corruption hole the `-typecheck` gate
  // surfaced: the controlled shape previously fell to generic emit →
  // invalid `Field(value: …)` (`-parse` accepted it; `-typecheck`
  // rejected with `cannot find 'Field' in scope`).
  // The CANONICAL `<Field>` change event is `onChangeText` (event name
  // `'changetext'`) — what native-tasks + the docs use, and what the Kotlin
  // emit already detects. Swift previously checked only `'change'` (the web
  // overload), so the idiomatic controlled field `value={s()}
  // onChangeText={(v) => s.set(v)}` ran on Android but fell through to the
  // broken generic `Field(value: …)` on iOS — a "one code, run everywhere"
  // break. Accept both (canonical `changetext` first, web-style `change` for
  // compat).
  const onChangeAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && (a.name === 'changetext' || a.name === 'change'),
  )
  const isBareSignal =
    valueAttr !== undefined &&
    valueAttr.value.kind === 'identifier' &&
    _signalNames.has(valueAttr.value.name)
  let textArg: string
  if (bindingExpr !== undefined) {
    textArg = bindingExpr
  } else if (isBareSignal) {
    textArg = `$${swiftIdent((valueAttr!.value as Extract<ExprIR, { kind: 'identifier' }>).name)}`
  } else if (valueAttr !== undefined && onChangeAttr !== undefined) {
    const getExpr = emitSwiftExpr(valueAttr.value, indent + 4)
    const writeBody = stripSwiftClosureBody(emitSwiftAction(onChangeAttr.handler, indent + 4))
    const handlerParam =
      onChangeAttr.handler.kind === 'arrow' && onChangeAttr.handler.params.length > 0
        ? swiftIdent(onChangeAttr.handler.params[0]!)
        : '_'
    const inner = ' '.repeat(indent + 4)
    const pad = ' '.repeat(indent + 2)
    textArg =
      `Binding(\n${inner}get: { ${getExpr} },\n${inner}set: { ${handlerParam} in ${writeBody} }\n${pad})`
  } else {
    return emitSwiftGeneric(e, indent)
  }

  let result = `${viewName}(${JSON.stringify(placeholder)}, text: ${textArg})`

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

/**
 * Emit `<Toggle value={signal} onChange={fn}>` as SwiftUI's
 * `Toggle("", isOn: $signal)` with a two-way binding to the signal.
 *
 * Canonical contract: `value` MUST name a signal in scope (matches the
 * `<Field value={signal}>` shape). The two-way binding via SwiftUI's
 * `$signal` projection writes back automatically, so the user-supplied
 * `onChange` handler is REDUNDANT on Swift — drop it and emit the
 * binding directly. (Compose Switch needs `onCheckedChange` explicitly
 * because Kotlin doesn't have property-wrapper bindings; per-target
 * idiom split, mirrors the Field emit pattern.)
 *
 * `disabled` translates to `.disabled(true)` modifier. Layout
 * modifiers from `padding` / `radius` / `background` token props
 * chain via `emitSwiftLayoutModifiers`.
 */
function emitSwiftToggle(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const valueAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'value',
  )
  if (!valueAttr) {
    return emitSwiftGeneric(e, indent)
  }

  // Two shapes:
  //
  // 1. `value={signal}` — bare identifier matching a signal in scope.
  //    Emit as SwiftUI's two-way binding-projection (`$signal`).
  //    Idiomatic + minimal; the user-supplied `onChange` is redundant
  //    because the binding writes back automatically.
  //
  // 2. `value={expr}` — any other expression (member access, function
  //    call, complex expr). Used for parent-owns-state patterns like
  //    `<Toggle value={props.todo.done} onChange={onToggle} />` in a
  //    TodoRow component. Emit as a SwiftUI custom `Binding` that
  //    reads via the expression + writes via the `onChange` handler.
  //    This unblocks <Checkbox> → <Toggle> migration for the common
  //    parent-owns-state shape.
  if (
    valueAttr.value.kind === 'identifier' &&
    _signalNames.has(valueAttr.value.name)
  ) {
    // Shape 1 — signal binding projection.
    const sig = swiftIdent(valueAttr.value.name)
    let result = `Toggle("", isOn: $${sig})`
    const disabled = readStaticAttr(e, 'disabled')
    if (disabled === true) {
      result += `\n${' '.repeat(indent + 2)}.disabled(true)`
    }
    result += emitSwiftLayoutModifiers(e)
    return result
  }

  // Shape 2 — custom Binding. Requires `onChange` to handle writes.
  const onChange = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'event' }> =>
      a.kind === 'event' && a.name === 'change',
  )
  if (!onChange) {
    // No onChange handler — can't write back. Fall through to generic.
    return emitSwiftGeneric(e, indent)
  }
  const valueExpr = emitSwiftExpr(valueAttr.value, indent)
  // emitSwiftAction returns a `{ body }` closure — extract the body
  // so we can embed it inside `Binding(set: { _ in body })`.
  const writeClosure = emitSwiftAction(onChange.handler, indent + 4)
  const writeBody = stripSwiftClosureBody(writeClosure)
  // The set-closure must BIND the handler's parameter name to the
  // incoming value, or the body references an undefined identifier.
  // `onChange={(v) => on.set(v)}` lowers its body to `on = v`; the
  // earlier `set: { _ in <body> }` discarded the value (`_`) AND left
  // `v` unbound → swiftc `cannot find 'v' in scope`. (`-parse` waved it
  // through; real `-typecheck` caught it.) Bind the arrow's first param
  // as the closure parameter so `v` resolves; fall back to `_` when the
  // handler takes no param (the body then can't reference the value).
  const handlerParam =
    onChange.handler.kind === 'arrow' && onChange.handler.params.length > 0
      ? swiftIdent(onChange.handler.params[0]!)
      : '_'
  const pad = ' '.repeat(indent + 2)
  const inner = ' '.repeat(indent + 4)
  let result =
    `Toggle("", isOn: Binding(\n` +
    `${inner}get: { ${valueExpr} },\n` +
    `${inner}set: { ${handlerParam} in ${writeBody} }\n` +
    `${pad}))`
  const disabled = readStaticAttr(e, 'disabled')
  if (disabled === true) {
    result += `\n${pad}.disabled(true)`
  }
  result += emitSwiftLayoutModifiers(e)
  return result
}

/**
 * Emit `<Link to="/path">label</Link>` as the runtime-swift
 * `PyreonLink("/path") { Text("label") }`. Maps to
 * `@pyreon/native-router-swift`'s `PyreonLink` (NOT SwiftUI's `Link`
 * which is for external URLs).
 *
 * The `to` prop must be a string literal or string-typed expression.
 * Children render inside the closure body.
 */
function emitSwiftLink(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const toAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'to',
  )
  if (!toAttr) {
    // No `to` prop — fall through to generic emit (preserves current
    // behaviour; user gets a clear kind of error from the compiler).
    return emitSwiftGeneric(e, indent)
  }
  const toExpr = emitSwiftExpr(toAttr.value, indent)
  const pad = ' '.repeat(indent + 2)
  if (e.children.length === 0) {
    return `PyreonLink(${toExpr}) { }`
  }
  const contentLines = e.children.map((c) => pad + emitSwiftChild(c, indent + 2)).join('\n')
  return `PyreonLink(${toExpr}) {\n${contentLines}\n${' '.repeat(indent)}}`
}

/**
 * Emit `<RouterProvider router={r}>...</RouterProvider>` as the
 * runtime-swift `RouterProvider(router: r) { ... }`. Wraps content
 * in the trailing-closure form.
 *
 * C5.2 extension — when the router-attr value names a `kind: 'router'`
 * decl that carries a `routes` array (parsed in C5.1 from
 * `createRouter({ routes: [...] })`), the content closure ALSO gets a
 * `.navigationDestination(for: String.self)` modifier emitting per-route
 * component dispatch:
 *
 *   RouterProvider(router: router) {
 *     RouterView()
 *       .navigationDestination(for: String.self) { path in
 *         if path == "/" { HomePage() }
 *         else if let params = PyreonRouter.matchPath(path, "/users/:id") {
 *           UserPage(params: params)
 *         }
 *       }
 *   }
 *
 * Literal-path routes emit a direct `==` comparison. Param-bearing
 * routes (`:id`) route through the runtime helper `PyreonRouter.matchPath`
 * which returns `[String: String]?` — captured params are passed to the
 * matched component as a `params:` arg.
 *
 * Falls back to the C3 bare-content shape (no navigationDestination)
 * when routes can't be resolved — back-compat with C4 scaffold OR
 * apps that pass a router from outside the component scope.
 */
function emitSwiftRouterProvider(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  indent: number,
): string {
  const routerAttr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'router',
  )
  if (!routerAttr) {
    return emitSwiftGeneric(e, indent)
  }
  const routerExpr = emitSwiftExpr(routerAttr.value, indent)
  const pad = ' '.repeat(indent + 2)

  // C5.2: look up the named router-decl's routes (if any). Falls back
  // to the C3 bare-content emit when the router-attr is a non-identifier
  // expression OR when the named decl has no routes (C4 scaffold form).
  let routesBlock = ''
  let routes: import('./types').RouteIR[] | undefined
  if (routerAttr.value.kind === 'identifier') {
    routes = _routerRoutes.get(routerAttr.value.name)
    if (routes !== undefined && routes.length > 0) {
      routesBlock = emitSwiftNavigationDestination(routes, indent + 4)
    }
  }

  // R1.1 — when routes are present, pick the HOME route (literal `/` if
  // present, else first non-pattern route, else first route as last
  // resort). The inner `<RouterView />` will emit as that component's
  // invocation instead of bare `RouterView()`, so NavigationStack's
  // initial body renders the home page at app launch. Without this, the
  // body is EmptyView() and iOS apps launch BLANK.
  const prevHomeRoute = _activeHomeRouteSwift
  if (routes !== undefined && routes.length > 0) {
    const homeRoute = pickHomeRoute(routes)
    if (homeRoute !== undefined) {
      // Phase 3 — the home route may itself be a redirect
      // (`{ path: '/', redirect: '/home' }`); resolve through the chain to
      // the route that carries a component so launch renders the target.
      // pickHomeRoute prefers literal paths and the resolved target must be
      // literal too, so this is typically `HomePage()` — bare call, no args.
      const homeTarget = resolveRouteTarget(homeRoute, routes)
      if (
        homeTarget !== undefined &&
        homeTarget.component !== undefined &&
        !homeTarget.path.includes(':')
      ) {
        let homeInvocation = emitSwiftLayoutAwareInvocation(homeTarget.component, indent + 2)
        // Phase 3 — a home route with a loader fires it on launch. The
        // home path is literal (pickHomeRoute excludes patterns) and equals
        // `router.currentPath` at launch, so `useLoaderData()` reads it back.
        if (homeTarget.loader !== undefined) {
          const loadBody = emitSwiftExpr(homeTarget.loader, indent + 2)
          homeInvocation = `PyreonRouteLoader(path: ${JSON.stringify(homeTarget.path)}, load: { ${loadBody} }) { ${homeInvocation} }`
        }
        _activeHomeRouteSwift = homeInvocation
      }
    }
  }

  let result: string
  if (e.children.length === 0) {
    result = `RouterProvider(router: ${routerExpr}) { }`
  } else {
    const contentLines = e.children.map((c) => pad + emitSwiftChild(c, indent + 2)).join('\n')
    // When routes are known, append the navigationDestination modifier
    // to the LAST content line (typically a `<RouterView />` emitting
    // the home component now per R1.1). SwiftUI's view-modifier chain
    // attaches to whichever view it follows.
    if (routesBlock !== '') {
      result = `RouterProvider(router: ${routerExpr}) {\n${contentLines}${routesBlock}\n${' '.repeat(indent)}}`
    } else {
      result = `RouterProvider(router: ${routerExpr}) {\n${contentLines}\n${' '.repeat(indent)}}`
    }
  }
  _activeHomeRouteSwift = prevHomeRoute
  return result
}

/**
 * R1.1 — choose the HOME route for the NavigationStack initial body.
 *
 * Preference order:
 *   1. Literal `/` route (the canonical home)
 *   2. First non-`:param` route (some apps use `/home` instead of `/`)
 *   3. None — return undefined; `<RouterView />` falls back to its
 *      C5-era `RouterView()` emit (still wrong, but no worse than before)
 *
 * Param-bearing routes can't be home routes (would need params at
 * launch with no source). Apps that have ONLY param-bearing routes
 * are unusual; they get the EmptyView fallback until they add a
 * literal home route.
 */
function pickHomeRoute(
  routes: import('./types').RouteIR[],
): import('./types').RouteIR | undefined {
  const literalRoot = routes.find((r) => r.path === '/')
  if (literalRoot !== undefined) return literalRoot
  // A bare `*` / `(.*)` wildcard is a catch-all, not a launchable home —
  // exclude it so it never becomes the NavigationStack initial body.
  const firstNonPattern = routes.find(
    (r) => !r.path.includes(':') && !isWildcardRoute(r),
  )
  if (firstNonPattern !== undefined) return firstNonPattern
  return undefined
}

/**
 * Per-field coercion from matchPath's `[String: String]` dict to the
 * component's typed `params` field. Route params are path segments —
 * always strings on the wire; number/boolean fields coerce with safe
 * defaults (a malformed segment renders the zero value rather than
 * crashing the dispatch).
 */
function swiftParamFieldExpr(f: { name: string; type: TypeIR }): string {
  const read = `params[${JSON.stringify(f.name)}] ?? ""`
  if (f.type.kind === 'number') return `Int(${read}) ?? 0`
  if (f.type.kind === 'boolean') return `(${read}) == "true"`
  return read
}

/**
 * Build the invocation for a param-bearing route's target component.
 * Three shapes, driven by the `_componentParamsInfo` pre-pass:
 *
 *   - typed `params` prop → construct the synthesized struct from the
 *     matched dict: `UserPage(params: UserPageParam(id: params["id"] ?? ""))`
 *   - NO `params` prop (component visible in-file) → `UserPage()` and
 *     `usesParams: false` so the branch skips the dict binding
 *   - opaque `params` type / component not visible (non-identifier
 *     expression) → legacy raw-dict pass `UserPage(params: params)`
 */
function swiftRouteParamsInvocation(
  component: ExprIR,
  indent: number,
): { call: string; usesParams: boolean } {
  const expr = emitSwiftExpr(component, indent)
  if (component.kind === 'identifier') {
    const info = _componentParamsInfo.get(component.name)
    if (info === undefined && _componentNames.has(component.name)) {
      return { call: `${expr}()`, usesParams: false }
    }
    if (info !== undefined && info !== 'opaque') {
      const args = info.fields
        .map((f) => `${swiftIdent(f.name)}: ${swiftParamFieldExpr(f)}`)
        .join(', ')
      return { call: `${expr}(params: ${info.typeName}(${args}))`, usesParams: true }
    }
  }
  return { call: `${expr}(params: params)`, usesParams: true }
}

/**
 * C5.2 — emit a `.navigationDestination(for: String.self) { path in ... }`
 * modifier body for the given routes. Literal paths produce direct
 * comparisons; pattern paths (`:id`) route through `PyreonRouter.matchPath`.
 */
function emitSwiftNavigationDestination(
  routes: import('./types').RouteIR[],
  indent: number,
): string {
  // Phase 3 (nested routes) — when the table nests, dispatch on FULL paths
  // and wrap each leaf in its layout chain via content-closures. Flat tables
  // keep the original (unchanged) dispatch below — zero regression.
  if (hasNestedRoutes(routes)) {
    return emitSwiftNestedNavigationDestination(routes, indent)
  }
  const pad = ' '.repeat(indent)
  const innerPad = ' '.repeat(indent + 2)
  const branches: string[] = []
  // Phase 3 — a bare `*` / `(.*)` route is the whole-route catch-all; its
  // component becomes the ELSE-branch fallback (below), not a path branch.
  const wildcardRoute = routes.find(isWildcardRoute)
  const wildcardComponent =
    wildcardRoute !== undefined ? resolveRouteTarget(wildcardRoute, routes)?.component : undefined
  // Phase 3 — wrap a guarded route's render in `if <guard> { … } else { … }`.
  // The dispatch runs at navigation time, so the guard is checked before the
  // route renders. On failure: the catch-all (wildcard component) if present,
  // else a denial Text — never leaks the guarded view.
  const denyFallback =
    wildcardComponent !== undefined
      ? `${emitSwiftExpr(wildcardComponent, indent + 4)}()`
      : `Text("Pyreon Router: access denied to \\(path)")`
  const wrapGuard = (r: import('./types').RouteIR, renderLine: string): string[] => {
    if (r.guard === undefined) return [`${innerPad}${renderLine}`]
    return [
      `${innerPad}if ${emitSwiftExpr(r.guard, indent + 2)} {`,
      `${innerPad}  ${renderLine}`,
      `${innerPad}} else {`,
      `${innerPad}  ${denyFallback}`,
      `${innerPad}}`,
    ]
  }
  // Phase 3 — wrap a loader-bearing route's render in a `PyreonRouteLoader`
  // host whose `.task` fires the loader once on appear and stores the result
  // via `router.setLoaderData(<key>, …)`. The key is the runtime `path`
  // closure variable (the active pushed path) — NOT the literal pattern —
  // so it matches `useLoaderData()`'s `router.currentPath` read for BOTH
  // literal and `:param` routes. Applied INSIDE the guard wrap (a guarded
  // route only loads when its guard passes). Single-line so wrapGuard's
  // single-`renderLine` contract holds.
  const wrapLoader = (r: import('./types').RouteIR, renderExpr: string): string => {
    if (r.loader === undefined) return renderExpr
    const loadBody = emitSwiftExpr(r.loader, indent + 2)
    return `PyreonRouteLoader(path: path, load: { ${loadBody} }) { ${renderExpr} }`
  }
  // Phase 3 — track whether we've emitted any branch yet (instead of a
  // fixed `i === 0`), because redirect routes that resolve to nothing
  // (dangling / cyclic / param-involved) are SKIPPED, so the first
  // *emitted* branch may not be `routes[0]`.
  let firstBranch = true
  for (const route of routes) {
    // Wildcard routes don't get a path branch — handled as the else-branch.
    if (isWildcardRoute(route)) continue
    // Resolve redirects to the route that actually carries a component.
    const target = resolveRouteTarget(route, routes)
    if (target === undefined || target.component === undefined) continue
    const redirected = isRedirectRoute(route)
    if (redirected) {
      // Compile-time alias: `/old` renders the target's component directly.
      // v1 supports literal source AND literal target only — a param in
      // either has no value source at the alias site. Skip otherwise.
      if (route.path.includes(':') || target.path.includes(':')) continue
      const keyword = firstBranch ? 'if' : 'else if'
      branches.push(
        `${pad}${keyword} path == ${JSON.stringify(route.path)} {`,
        `${innerPad}${emitSwiftExpr(target.component, indent + 2)}()`,
        `${pad}}`,
      )
      firstBranch = false
      continue
    }
    const componentExpr = emitSwiftExpr(target.component, indent + 2)
    const isPattern = route.path.includes(':')
    if (isPattern) {
      // Param-bearing route — runtime matchPath helper returns the
      // params dict OR nil. When the target component declares a typed
      // `params` prop (`props: { params: { id: string } }`), construct
      // the synthesized struct from the dict; a raw-dict pass would be
      // a type mismatch (and the old tuple type didn't even parse).
      const keyword = firstBranch ? 'if' : 'else if'
      const inv = swiftRouteParamsInvocation(target.component, indent + 2)
      // Bind the `params` dict when the COMPONENT uses it OR the route's
      // `loader` reads `ctx.params.*` (lowered to `params["…"]`) — the
      // loader body emits inside this branch, so `params` must be in scope.
      if (inv.usesParams || route.loaderUsesParams === true) {
        branches.push(
          `${pad}${keyword} let params = PyreonRouter.matchPath(path, ${JSON.stringify(route.path)}) {`,
          ...wrapGuard(route, wrapLoader(route, inv.call)),
          `${pad}}`,
        )
      } else {
        // Neither component nor loader uses params — don't bind the dict (an
        // unused `params` is a swiftc warning the validate gate treats
        // as noise; `!= nil` keeps the branch warning-free).
        branches.push(
          `${pad}${keyword} PyreonRouter.matchPath(path, ${JSON.stringify(route.path)}) != nil {`,
          ...wrapGuard(route, wrapLoader(route, inv.call)),
          `${pad}}`,
        )
      }
    } else {
      // Literal route — direct path comparison.
      const keyword = firstBranch ? 'if' : 'else if'
      branches.push(
        `${pad}${keyword} path == ${JSON.stringify(route.path)} {`,
        ...wrapGuard(route, wrapLoader(route, `${componentExpr}()`)),
        `${pad}}`,
      )
    }
    firstBranch = false
  }
  // C5.4 — no-match fallback. SwiftUI's `.navigationDestination(for:)`
  // closure returns `some View`; without an `else` branch on the
  // if/else-if chain it'd be a syntax error (no default View when
  // no condition matches). Emit a minimal "404" Text so apps fail
  // visibly instead of silently rendering nothing. The text uses
  // SwiftUI string interpolation to surface the unmatched path —
  // helpful for the dev who pushed an unexpected URL.
  //
  // Apps that want a richer 404 page can override at the host level
  // (post-PMTC) — future Phase C5.5 ships an opt-in fallback prop.
  //
  // When NO branch was emitted (every route skipped — all dangling /
  // cyclic redirects, or only a wildcard route), emit the fallback BARE
  // (no `else`), since a lone `else` is a syntax error.
  //
  // Phase 3 — a bare `*` / `(.*)` route supplies the fallback component
  // (the canonical 404 page); without one, the dev-visible 404 Text.
  const fallback =
    wildcardComponent !== undefined
      ? `${emitSwiftExpr(wildcardComponent, indent + 2)}()`
      : `Text("Pyreon Router: no route for \\(path)")`
  if (firstBranch) {
    branches.push(`${pad}${fallback}`)
  } else {
    branches.push(`${pad}else {`, `${innerPad}${fallback}`, `${pad}}`)
  }
  const body = branches.join('\n')
  const modifierIndent = ' '.repeat(indent - 2)
  return `\n${modifierIndent}.navigationDestination(for: String.self) { path in\n${body}\n${modifierIndent}}`
}

/**
 * Phase 3 (nested routes) — dispatch over a FLATTENED tree. Each leaf renders
 * `Outer { Inner { Leaf() } }` (the layout chain wrapping the leaf via the
 * content-closure each layout was emitted with). Literal full paths use
 * `path == "..."`; the rare top-level `:param` entry keeps the matchPath shape.
 * The catch-all wildcard (top-level) supplies the else-fallback, mirroring the
 * flat dispatch.
 */
/**
 * Invoke a component, supplying an EMPTY content slot when it's a layout
 * (layouts are emitted with a required `@ViewBuilder content` arg, so a bare
 * `Layout()` won't compile). A layout rendered as its own index / home shows
 * its chrome with an empty child slot.
 */
function emitSwiftLayoutAwareInvocation(component: ExprIR, indent: number): string {
  const expr = emitSwiftExpr(component, indent)
  if (component.kind === 'identifier' && _layoutComponentNames.has(component.name)) {
    return `${expr} { EmptyView() }`
  }
  return `${expr}()`
}

function emitSwiftNestedNavigationDestination(
  routes: import('./types').RouteIR[],
  indent: number,
): string {
  const pad = ' '.repeat(indent)
  const innerPad = ' '.repeat(indent + 2)
  const entries: FlatRouteEntry[] = flattenRouteTree(routes)
  const wildcardRoute = routes.find(isWildcardRoute)
  const wildcardComponent =
    wildcardRoute !== undefined ? resolveRouteTarget(wildcardRoute, routes)?.component : undefined
  // Wrap a leaf call in its layout chain: [Outer, Inner] + "Leaf()" →
  // "Outer { Inner { Leaf() } }".
  const wrap = (chain: ExprIR[], leafCall: string): string => {
    let acc = leafCall
    for (let i = chain.length - 1; i >= 0; i--) {
      acc = `${emitSwiftExpr(chain[i]!, indent + 2)} { ${acc} }`
    }
    return acc
  }
  const denyFallback =
    wildcardComponent !== undefined
      ? `${emitSwiftExpr(wildcardComponent, indent + 4)}()`
      : `Text("Pyreon Router: access denied to \\(path)")`
  const branches: string[] = []
  let firstBranch = true
  for (const entry of entries) {
    const keyword = firstBranch ? 'if' : 'else if'
    const isLeafLayout =
      entry.component.kind === 'identifier' && _layoutComponentNames.has(entry.component.name)
    if (entry.isPattern) {
      // A param-bearing leaf passes the matched params (typed-struct
      // construction when the component declares a typed `params` prop —
      // same contract as the flat dispatch); a param-bearing layout
      // index (rare; flatten bails nested params) falls back to an empty slot.
      const inv = isLeafLayout
        ? {
            call: emitSwiftLayoutAwareInvocation(entry.component, indent + 2),
            usesParams: false,
          }
        : swiftRouteParamsInvocation(entry.component, indent + 2)
      const render = wrap(entry.layoutChain, inv.call)
      const condition = inv.usesParams
        ? `${keyword} let params = PyreonRouter.matchPath(path, ${JSON.stringify(entry.path)}) {`
        : `${keyword} PyreonRouter.matchPath(path, ${JSON.stringify(entry.path)}) != nil {`
      branches.push(
        `${pad}${condition}`,
        ...wrapGuardLines(entry.guard, render, denyFallback, indent),
        `${pad}}`,
      )
    } else {
      const render = wrap(
        entry.layoutChain,
        emitSwiftLayoutAwareInvocation(entry.component, indent + 2),
      )
      branches.push(
        `${pad}${keyword} path == ${JSON.stringify(entry.path)} {`,
        ...wrapGuardLines(entry.guard, render, denyFallback, indent),
        `${pad}}`,
      )
    }
    firstBranch = false
  }
  const fallback =
    wildcardComponent !== undefined
      ? `${emitSwiftExpr(wildcardComponent, indent + 2)}()`
      : `Text("Pyreon Router: no route for \\(path)")`
  if (firstBranch) {
    branches.push(`${pad}${fallback}`)
  } else {
    branches.push(`${pad}else {`, `${innerPad}${fallback}`, `${pad}}`)
  }
  const body = branches.join('\n')
  const modifierIndent = ' '.repeat(indent - 2)
  return `\n${modifierIndent}.navigationDestination(for: String.self) { path in\n${body}\n${modifierIndent}}`
}

/**
 * Shared guard-wrap for a nested dispatch branch's render line: wraps in
 * `if <guard> { render } else { <denyFallback> }` when a guard is present,
 * else emits the render line bare. Mirrors the flat dispatch's `wrapGuard`.
 */
function wrapGuardLines(
  guard: ExprIR | undefined,
  renderLine: string,
  denyFallback: string,
  indent: number,
): string[] {
  const innerPad = ' '.repeat(indent + 2)
  if (guard === undefined) return [`${innerPad}${renderLine}`]
  return [
    `${innerPad}if ${emitSwiftExpr(guard, indent + 2)} {`,
    `${innerPad}  ${renderLine}`,
    `${innerPad}} else {`,
    `${innerPad}  ${denyFallback}`,
    `${innerPad}}`,
  ]
}

/**
 * Emit `<RouterView />` as the runtime-swift `RouterView()`.
 *
 * R1.1 — when emitted INSIDE a `<RouterProvider router={r}>` whose
 * router-decl carries routes, the home route's component takes the
 * place of `RouterView()`. This makes NavigationStack's initial body
 * the home page; `.navigationDestination` still handles pushed paths.
 * Closes the iOS blank-startup bug.
 *
 * Outside a routes-bearing RouterProvider (foreign router, scaffold-
 * shape, or simply not inside one), the C1 scaffold shape persists.
 * The native runtime's `RouterView` is `EmptyView()` there — same as
 * pre-R1.1 — because there's no route table to dispatch from.
 */
function emitSwiftRouterView(
  _e: Extract<ExprIR, { kind: 'jsx-element' }>,
  _indent: number,
): string {
  // Phase 3 — inside a layout component's body, `<RouterView />` is the
  // child slot: it renders the `@ViewBuilder content` closure.
  if (_emittingLayoutComponentSwift) {
    return `content()`
  }
  if (_activeHomeRouteSwift !== null) {
    return _activeHomeRouteSwift
  }
  return `RouterView()`
}

// `isCanonicalPrimitive` is imported but referenced only via the
// dispatcher's `if (tag === 'Stack')` chain in `emitSwiftJsx` — the
// set-based predicate would gate the dispatcher entries more cleanly
// once all 16 primitives have emit functions; today the explicit-tag
// chain mirrors the existing `For`/`Show`/`Text`/`Button` style.
void isCanonicalPrimitive

/**
 * Expand a `<Comp {...src} />` spread into per-prop constructor args (Swift).
 * An object-literal source expands its own fields; an identifier/member source
 * expands the TARGET component's declared props, each sourced as `src.<prop>`
 * (a `props` source's member read rewrites to the bare prop on the target).
 * Props already set explicitly on the call are skipped. Unresolvable spread
 * (unknown target props, non-literal/non-binding source) → warn, no args.
 */
function expandSwiftSpread(
  spreadArg: ExprIR,
  targetTag: string,
  explicitNames: Set<string>,
  indent: number,
): { name: string; part: string }[] {
  const out: { name: string; part: string }[] = []
  if (
    spreadArg.kind === 'object' &&
    (spreadArg.spreads === undefined || spreadArg.spreads.length === 0)
  ) {
    for (const f of spreadArg.fields) {
      if (explicitNames.has(f.name)) continue
      out.push({
        name: f.name,
        part: `${swiftIdent(safeIdent(f.name))}: ${emitSwiftExpr(f.value, indent)}`,
      })
    }
    return out
  }
  if (spreadArg.kind === 'identifier' || spreadArg.kind === 'member') {
    const targetProps = _componentPropsMap.get(targetTag)
    if (targetProps !== undefined) {
      for (const p of targetProps) {
        if (explicitNames.has(p.name)) continue
        out.push({
          name: p.name,
          part: `${swiftIdent(safeIdent(p.name))}: ${emitSwiftExpr({ kind: 'member', object: spreadArg, property: p.name }, indent)}`,
        })
      }
      return out
    }
  }
  _emitWarnings.push(
    `<${targetTag} {...}> spread could not be expanded — the target's props are unknown (or the source isn't an object literal / known binding). Pass props explicitly.`,
  )
  return out
}

function emitSwiftGeneric(e: Extract<ExprIR, { kind: 'jsx-element' }>, indent: number): string {
  const pad = ' '.repeat(indent + 2)
  const isUserComponent = _componentNames.has(e.tag)
  // For user-defined components, include event handlers as constructor
  // args (Phase 2 — closes TodoMVC's `TodoRow(todo: t)` missing-args
  // typecheck blocker; `onToggle`/`onRemove` are now forwarded as
  // closure-valued props). For SwiftUI primitives, events stay
  // dropped — HStack / VStack don't accept onClick: parameters.
  // Explicit attr names take precedence over a spread's props (a spread
  // prop the call also sets explicitly is skipped — the React override rule).
  const explicitNames = new Set<string>()
  for (const a of e.attrs) {
    if (a.kind === 'attr') explicitNames.add(a.name)
    else if (a.kind === 'event') {
      explicitNames.add(`on${a.name[0]!.toUpperCase()}${a.name.slice(1)}`)
    }
  }
  const argEntries: { name: string; part: string }[] = []
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
      argEntries.push({
        name: a.name,
        part: `${swiftIdent(safeIdent(a.name))}: ${emitSwiftExpr(a.value, indent)}`,
      })
    } else if (a.kind === 'event' && isUserComponent) {
      // User component prop named `on<Cap>` — the parser stripped the
      // `on` prefix and lowercased: `onToggle` → `event { name: 'toggle' }`.
      // Recover the camelCase prop name by re-adding the `on` prefix +
      // upper-casing the first letter.
      const propName = `on${a.name[0]!.toUpperCase()}${a.name.slice(1)}`
      argEntries.push({
        name: propName,
        part: `${swiftIdent(propName)}: ${emitSwiftAction(a.handler, indent)}`,
      })
    } else if (a.kind === 'spread' && isUserComponent) {
      argEntries.push(...expandSwiftSpread(a.argument, e.tag, explicitNames, indent))
    }
    // A spread on a non-user-component tag is warned once at the top of
    // emitSwiftJsx (the single entry for every jsx-element) — no warning
    // needed here.
  }
  // Swift's MEMBERWISE initializer requires arguments in property
  // DECLARATION order (`argument 'qty' must precede argument 'label'` is
  // a hard error). JSX attrs arrive in AUTHOR order, so re-sort against
  // the target component's declared props when known. Names not in the
  // props list keep author order at the end (stable sort). Non-user
  // components (SwiftUI primitives) keep author order — their inits are
  // hand-mapped, not memberwise.
  const targetPropsOrder = isUserComponent ? _componentPropsMap.get(e.tag) : undefined
  if (targetPropsOrder !== undefined && targetPropsOrder.length > 0) {
    const orderOf = new Map(targetPropsOrder.map((p, i) => [p.name, i]))
    argEntries.sort(
      (x, y) =>
        (orderOf.get(x.name) ?? Number.MAX_SAFE_INTEGER) -
        (orderOf.get(y.name) ?? Number.MAX_SAFE_INTEGER),
    )
  }
  const attrPairs = argEntries.map((x) => x.part).join(', ')
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

/**
 * Does this expression produce a VIEW (vs a plain value)? Drives the
 * Text-wrap decision in `emitSwiftChild`: a bare value expression
 * inside a ViewBuilder is a swiftc type error ("String does not
 * conform to View"), and the Kotlin mirror is WORSE — a bare String
 * expression statement in a Composable lambda compiles and silently
 * renders nothing. Ternary / logical recurse so `{cond ? <A/> : <B/>}`
 * and `{cond && <X/>}` keep their raw view emit.
 */
function swiftExprProducesView(e: ExprIR): boolean {
  if (e.kind === 'jsx-element') return true
  if (e.kind === 'ternary') {
    return swiftExprProducesView(e.then) || swiftExprProducesView(e.otherwise)
  }
  if (e.kind === 'logical') return swiftExprProducesView(e.right)
  // See through parens so `{cond && (a ? <X/> : <Y/>)}` is recognised
  // as view-producing (and lowered to `if cond { … }`) rather than
  // stringified into a Text interpolation.
  if (e.kind === 'paren') return swiftExprProducesView(e.inner)
  return false
}

function emitSwiftChild(c: ChildIR, indent: number): string {
  if (c.kind === 'text') return `Text(${JSON.stringify(c.value)})`
  if (!swiftExprProducesView(c.expr)) {
    // Value expression child of a container (`<Button>{t.done ? 'done'
    // : 'todo'}</Button>`, `<Stack>{count}</Stack>`) — wrap in Text
    // string-interpolation, the same shape `<Text>{expr}</Text>` emits.
    // A template child already emits a Swift String literal, so use it as
    // the Text content directly (no redundant `Text("\("…")")` wrap).
    if (c.expr.kind === 'template') {
      return `Text(${emitSwiftExpr(c.expr, indent)})`
    }
    return `Text("${swiftInterpSegment(c.expr, indent)}")`
  }
  // `{cond && <View/>}` — the dominant React/Solid conditional-render
  // idiom. A raw `cond && View` is `Bool && View`, a type error inside a
  // SwiftUI `@ViewBuilder`, so lower it to the SAME `if cond { view }`
  // form `<Show>` emits. The RHS recurses through `emitSwiftChild` so a
  // nested `a && b && <X/>` / `a && (c ? <X/> : <Y/>)` lowers correctly.
  if (c.expr.kind === 'logical' && c.expr.op === '&&' && swiftExprProducesView(c.expr.right)) {
    // Same optional-truthiness lowering as the ternary: `{t && <X/>}` where
    // `t` is OPTIONAL (e.g. a `.find` result) → `if t != nil { … }` (and `{!t
    // && <X/>}` → `if t == nil { … }`), not the bare `if t { … }` swiftc
    // rejects as a non-Bool condition.
    const cond = swiftCondition(c.expr.left, (x) => emitSwiftExpr(x, indent))
    const pad = ' '.repeat(indent + 2)
    const inner = emitSwiftChild({ kind: 'expr', expr: c.expr.right }, indent + 2)
    return `if ${cond} {\n${pad}${inner}\n${' '.repeat(indent)}}`
  }
  return emitSwiftExpr(c.expr, indent)
}

// Helpers --------------------------------------------------------------------

/**
 * `when={() => cond()}` — the canonical web reactive form passes an
 * ACCESSOR arrow. Native targets re-evaluate the surrounding body on
 * state change (SwiftUI body recompute / Compose recomposition), so a
 * CONDITION position takes the arrow's BODY — a bare closure in `if`
 * position is a swiftc type error ("'() -> Bool' is not convertible to
 * 'Bool'") and a kotlinc "lambda is not Boolean". Zero-param arrows
 * only — a parameterized arrow is not an accessor. Mirror in
 * emit-kotlin.ts.
 */
function unwrapAccessorArrow(e: ExprIR): ExprIR {
  return e.kind === 'arrow' && e.params.length === 0 ? e.body : e
}

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
function escapeSwiftInterp(s: string): string {
  // Escape backslashes + double-quotes + the `\(` interpolation marker.
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\\\(/g, '\\\\(')
}

/**
 * Escape a COOKED string segment for a Swift interpolated string literal.
 * Builds on `escapeSwiftInterp` (\, ", `\(`) and additionally escapes real
 * control characters — a cooked template quasi can carry an actual newline /
 * CR / tab (e.g. a multiline `` `a\nb` ``) that a single-line Swift string
 * literal cannot hold raw. The added escapes run AFTER escapeSwiftInterp so
 * their backslashes aren't double-escaped.
 */
function escapeSwiftStringSegment(s: string): string {
  return escapeSwiftInterp(s)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

/**
 * Lower a `kind: 'rx-call'` ExprIR to Swift. Dispatches on `method` to
 * produce idiomatic Swift code on `Array<T>`. Mirrors emitKotlinRxCall
 * in shape; the per-method lowerings are documented in
 * docs/src/content/docs/multiplatform-libraries.md (Strategy A table).
 *
 * Predicate / mapper / reducer args are inlined as Swift closures
 * (`{ t in body }`); count args inline as Swift Int literals.
 */
function emitSwiftRxCall(
  e: { method: string; source: ExprIR; args: ExprIR[] },
  indent: number,
): string {
  const src = emitSwiftExpr(e.source, indent)
  const arg = (i: number): string =>
    e.args[i] === undefined ? '' : emitSwiftExpr(e.args[i] as ExprIR, indent)
  switch (e.method) {
    // Transforms returning a new collection — first six match the JS
    // method names on Swift `Array<T>`.
    case 'filter':
      return `${src}.filter(${arg(0)})`
    case 'map':
      return `${src}.map(${arg(0)})`
    case 'reverse':
      return `${src}.reversed()`
    case 'compact':
      // JS rx.compact drops null/undefined; Swift Array<T?> uses
      // compactMap which unwraps and drops nil.
      return `${src}.compactMap { $0 }`
    case 'flatten':
      // Swift's joined() returns a FlattenSequence; Array(...) makes it
      // a concrete Array<T> matching consumer expectations.
      return `Array(${src}.joined())`
    case 'unique':
      // Requires T: Hashable. Array(Set(_:)) drops duplicates but does
      // NOT preserve insertion order — Swift's stdlib has no
      // order-preserving distinct() in Foundation. Matches rx.unique's
      // "set of unique values" semantic; for ordered uniqueness the
      // user can fall back to reduce.
      return `Array(Set(${src}))`
    // Bounded transforms — take / skip + their while variants. Swift's
    // `.prefix(_:)` and `.dropFirst(_:)` return ArraySlice; Array(...)
    // promotes to a concrete Array<T>.
    case 'take':
      return `Array(${src}.prefix(${arg(0)}))`
    case 'skip':
      return `Array(${src}.dropFirst(${arg(0)}))`
    case 'takeWhile':
      return `Array(${src}.prefix(while: ${arg(0)}))`
    case 'dropWhile':
      return `Array(${src}.drop(while: ${arg(0)}))`
    // Scalar accessors — first/last as properties (Optional<T>),
    // find/some/every as predicate-returning methods.
    case 'first':
      return `${src}.first`
    case 'last':
      return `${src}.last`
    case 'find':
      return `${src}.first(where: ${arg(0)})`
    case 'some':
      return `${src}.contains(where: ${arg(0)})`
    case 'every':
      return `${src}.allSatisfy(${arg(0)})`
    // Aggregations — count/sum/min/max + the reduce + average combos.
    case 'count':
      return `${src}.count`
    case 'sum':
      // Swift Array<Numeric> has reduce(_:_:) but no direct .sum() —
      // reduce(0, +) is the idiomatic shape.
      return `${src}.reduce(0, +)`
    case 'min':
      return `${src}.min()`
    case 'max':
      return `${src}.max()`
    case 'reduce':
      // rx.reduce(s, reducer, initial) ≈ Swift reduce(initial, reducer).
      // Arg 0 = reducer fn, Arg 1 = initial. JS argument order is
      // (reducer, initial); Swift's is (initial, reducer) — we flip.
      return `${src}.reduce(${arg(1)}, ${arg(0)})`
    case 'average': {
      // Multi-statement Swift closure: bind reduce sum, branch on
      // empty, divide. IIFE for expression-position usage.
      return `({ let __xs = ${src}; return __xs.isEmpty ? 0 : Double(__xs.reduce(0, +)) / Double(__xs.count) }())`
    }
    default:
      // Defensive — parse.ts's RX_V1_METHODS set is the authoritative
      // gate, but if a method slips through we emit a noisy `?rx.X?`
      // marker so missing dispatch is obvious in failed swiftc output.
      return `/* unsupported rx.${e.method} */ ${src}`
  }
}
