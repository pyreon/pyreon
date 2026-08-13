// Parse Pyreon JSX source → ComponentIR[] by walking the oxc AST.
//
// Scope is intentionally minimal for Phase 0: only the shapes the seven
// starter fixtures use are recognised. Anything outside that set is
// either passed through as unknown or surfaces a warning.

import { parseSync } from 'oxc-parser'
import { buildInferenceCtx, inferReturnType, inferType, type InferenceCtx } from './infer-type'
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
  ParseResult,
  RocketstyleComponentIR,
  RouteIR,
  StatementIR,
  StoreDefnIR,
  StructIR,
  AttrsComponentIR,
  StyledComponentIR,
  TypeIR,
  ZodFieldConstraints,
  ZodFieldType,
  ZodSchemaDefnIR,
} from './types'
import { isCanonicalPrimitive } from './canonical-primitives'
import { parseRocketstyleDefn } from './rocketstyle-native'
import { parseAttrsDefn } from './attrs-native'
import {
  DEFAULT_THEME,
  mergeTheme,
  parseThemeDefinition,
  resolveThemeToken,
  type ThemeTable,
} from './theme-native'
import { lowerRouteParams } from './expr-utils'

// oxc-parser's typed AST is rich; for Phase 0 we walk it loosely via
// `any` to keep the parser readable. As the IR coverage grows we can
// tighten this with `@oxc-project/types`.
//
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

interface ParseCtx {
  warnings: string[]
  source: string
  /**
   * Names of `defineStore` hook bindings (`const useApp = defineStore(...)`
   * → `useApp`), collected in a pre-pass so component bodies parsed
   * earlier in the file still see stores declared later. Used to LOWER the
   * store-aliasing shape `const app = useApp()` to the inline form.
   */
  storeHookNames: Set<string>
  /**
   * Locally-declared object-shape type aliases (`type CardProps = { … }`),
   * name → parsed object TypeIR, collected in a pre-pass so a component's
   * NAMED props annotation (`function Card(props: CardProps)`) resolves
   * regardless of declaration order. Before this registry existed the
   * typeRef bailed to EMPTY props — the component emitted with no stored
   * properties / parameters while its body referenced them bare and call
   * sites passed args, an uncompilable emit on BOTH targets with no
   * warning (the dominant real-world props shape).
   */
  objectTypeAliases: Map<string, Extract<TypeIR, { kind: 'object' }>>
  /**
   * Per-component store ALIASES: local binding name → store hook name,
   * populated from `const app = useApp()` declarations in the CURRENT
   * component body and CLEARED before each top-level node is parsed (so a
   * `const app = …` in one component can't leak to another). `parseExpr`'s
   * Identifier case substitutes an aliased name with a `<hook>()` call, so
   * `app.store.x` lowers to exactly the same IR as the inline
   * `useApp().store.x` — the emit needs no changes. Only names recorded
   * here (i.e. genuine `const <id> = <storeHook>()` shapes, which produced
   * an unbound `Unresolved reference` before) are ever substituted, so a
   * bug here cannot affect any previously-compiling code.
   */
  storeAliases: Map<string, string>
  /**
   * Local names bound to the imperative `toast` import from `@pyreon/toast`
   * (`import { toast }` → `toast`; `import { toast as notify }` → `notify`).
   * `parseExpr` rewrites a call on one of these — `toast("x")` or a preset
   * `toast.success("x")` — to a `toast-call` ExprIR so the emit lowers it to
   * `PyreonToast`. Empty unless the file imports `toast`.
   */
  toastNames: Set<string>
  /** Local name(s) bound to `SizedMap` imported from `@pyreon/sized-map`. */
  sizedMapNames: Set<string>
  /**
   * Local name(s) bound to the `s` schema namespace imported from
   * `@pyreon/validate` (`import { s }` → `s`; `import { s as v }` → `v`).
   *
   * Gated on the IMPORT rather than the bare name, unlike the zod/valibot
   * recognizers: those key on a distinctive wrapper call (`zodSchema(...)`),
   * but `s.object({ … })` is a shape a user's own single-letter binding could
   * plausibly produce, and mis-lowering someone else's `s` would be worse than
   * not lowering ours.
   */
  validateSchemaNames: Set<string>
  /**
   * Local names imported from `@pyreon/rx`, mapped to their ORIGINAL export
   * name (so `import { map as project }` resolves).
   *
   * The STANDALONE transforms are source-first — `map(src, fn)` is
   * structurally `rx.map(src, fn)` — but `map` / `filter` / `first` are names
   * a user is overwhelmingly likely to have of their own, so the recognizer
   * gates on the IMPORT and never on the bare name. Same rule
   * `@pyreon/validate`'s `s` follows.
   */
  rxImportedNames: Map<string, string>
  /**
   * True when the file declares at least one `const X = s.object({ … })` that
   * the Gap-4 schema emit will lower. Gates the `s` "no native lowering"
   * warning off — firing it on a declaration that compiles correctly on both
   * targets is the stale-entry failure mode, and it is the more damaging
   * direction: it tells the author a working API is unusable.
   */
  validateSchemaLowered: boolean
  /** A top-level `zodSchema(...)`/`valibotSchema(...)`/`arktypeSchema(...)`
   * declaration lowered to a native struct, so the blanket unlowered-module
   * warning must not claim the opposite directly above that struct. */
  validationSchemaLowered: boolean
  /**
   * A `<PermissionsProvider permissions={{ … }}>` appears in this file, so a
   * bare `usePermissions()` reads real grants from the environment rather
   * than lowering to an empty set. Decided in a pre-scan because the warn
   * pass runs before JSX is walked.
   */
  hasPermissionsProvider: boolean
  /**
   * Local names bound to the `announce` import from `@pyreon/a11y` (handles
   * `import { announce as say }`). `parseExpr` lowers a call on one of these to
   * an `announce-call` ExprIR (→ PyreonA11y). Empty unless `announce` is imported.
   */
  announceNames: Set<string>
  /**
   * Per-component HOOK-FIELD aliases: a destructured local name →
   * `{ object, field }` where `object` is a synthetic single-binding
   * container name. Populated from `const { data, isPending } =
   * useFetch(url)` (lowered to a synthetic `const __pyHookN = useFetch(url)`
   * + one alias per destructured key) and CLEARED before each top-level node
   * is parsed (component-scoped, like `storeAliases`). `parseExpr`'s
   * Identifier case rewrites an aliased local to a `member` access
   * (`__pyHookN.data`), so `data()` / `isPending` lower to exactly the same
   * IR as the supported single-binding shape `q.data()` / `q.isPending` —
   * the emit needs no changes. Only destructure shapes that previously
   * warn-dropped (producing an unbound reference) ever record an alias, so a
   * bug here cannot affect any previously-compiling code.
   */
  hookFieldAliases: Map<
    string,
    { object: string; field: string } | { object: string; index: number }
  >
  /** Monotonic counter for synthetic hook-destructure container names
   * (`__pyHook0`, `__pyHook1`, …). Reset per top-level node alongside
   * `hookFieldAliases`, so names are unique within one component. */
  hookDestructureCounter: number
  /**
   * Top-level pure-logic HELPER functions collected during the main pass —
   * a value-parameter function returning a non-JSX value, which
   * `tryComponentFromTopLevel` routes here (instead of the old warn+skip)
   * to be emitted at file scope. Non-generic only (a generic helper keeps
   * the NAMED warning — the IR has no generic-parameter representation).
   */
  helperFns: Extract<DeclIR, { kind: 'function' }>[]
  /**
   * The resolved theme vocabulary the styler + rocketstyle native frontends
   * resolve tokens against — the app's `defineTheme({ … })` (parsed in a
   * pre-pass) merged OVER the bundled defaults, so `t.color.primary` lowers to
   * the APP's real color, not a hardcoded guess. Defaults when no theme is
   * declared. See theme-native.ts.
   */
  theme: ThemeTable
}

export function parsePyreon(source: string, filename = 'input.tsx'): ParseResult {
  const ctx: ParseCtx = {
    warnings: [],
    source,
    storeHookNames: new Set(),
    objectTypeAliases: new Map(),
    storeAliases: new Map(),
    toastNames: new Set(),
    validateSchemaNames: new Set(),
    rxImportedNames: new Map(),
    validateSchemaLowered: false,
    sizedMapNames: new Set(),
    validationSchemaLowered: false,
    hasPermissionsProvider: false,
    announceNames: new Set(),
    hookFieldAliases: new Map(),
    hookDestructureCounter: 0,
    helperFns: [],
    theme: DEFAULT_THEME,
  }
  const ast = parseSync(filename, source, { sourceType: 'module', lang: 'tsx' })
  // Pre-pass: collect every `const <name> = defineStore(...)` hook name
  // BEFORE parsing component bodies, so the store-aliasing diagnostic
  // (`const app = useApp()`) fires regardless of declaration order (a
  // component can appear above the store it reads). Name-only + side-
  // effect-free (no warnings) — full validation stays in
  // tryStoreDefnFromTopLevel during the main pass.
  collectStoreHookNames(ast.program.body as AnyNode[], ctx.storeHookNames)
  // Pre-pass: collect object-shape type aliases so a NAMED props annotation
  // (`props: CardProps`) resolves regardless of declaration order. Warnings
  // from this parse are DISCARDED (a scratch ctx) — the main pass's
  // tryStructFromTypeAlias re-parses the same annotation and owns the
  // user-facing diagnostics, so nothing double-fires.
  collectObjectTypeAliases(ast.program.body as AnyNode[], ctx)
  // Pre-pass: warn on imports of WEB-ONLY @pyreon/* packages. These render
  // via the DOM / a browser-only library (ECharts, CodeMirror, elkjs,
  // pdfmake, the styler CSS-in-JS stack, …) and have NO native emit — PMTC
  // would otherwise silently emit an unresolved `<Chart>` / `<Flow>` call
  // that fails the native build with a cryptic `Cannot find 'Chart' in
  // scope`, far from the cause. Name the package + the escape-hatch fix.
  warnWebOnlyImports(ast.program.body as AnyNode[], ctx)
  // Pre-pass: record the local name(s) bound to the imperative `toast` import
  // from @pyreon/toast, so parseExpr can lower `toast(...)` / `toast.success(...)`
  // to PyreonToast. Handles renamed imports (`import { toast as notify }`).
  collectToastNames(ast.program.body as AnyNode[], ctx)
  collectValidateSchemaNames(ast.program.body as AnyNode[], ctx)
  collectRxImportedNames(ast.program.body as AnyNode[], ctx)
  collectSizedMapNames(ast.program.body as AnyNode[], ctx)
  // A `<PermissionsProvider>` anywhere in the file means a bare
  // `usePermissions()` has somewhere to read from. Checked against the source
  // because the warn pass runs before the JSX walk — the same ordering that
  // forced the schema pre-scans above.
  ctx.hasPermissionsProvider = /<\s*PermissionsProvider[\s/>]/.test(source)
  // Record the local name(s) bound to `announce` from @pyreon/a11y so parseExpr
  // can lower `announce(...)` to PyreonA11y. Handles renamed imports.
  collectAnnounceNames(ast.program.body as AnyNode[], ctx)
  warnUnloweredPyreonHooks(ast.program.body as AnyNode[], ctx)
  warnUnloweredControlFlow(ast.program.body as AnyNode[], ctx)
  warnUnloweredPyreonModules(ast.program.body as AnyNode[], ctx)
  // Pre-pass: map alias-tag local names to their import source, so the emit's
  // Element/PyreonUI/Container/Row/Col hooks intercept ONLY a tag imported from
  // its expected @pyreon package (not a same-named user component).
  const aliasImports = collectAliasImports(ast.program.body as AnyNode[])
  // Pre-pass: parse the app's `defineTheme({ … })` so the styler + rocketstyle
  // native frontends resolve `t.color.primary` to the APP's real token value
  // (not a hardcoded default), regardless of whether the theme is declared
  // above or below the components that use it. Merged over the defaults, so a
  // partial theme still resolves standard tokens + a zero-config app works.
  collectTheme(ast.program.body as AnyNode[], ctx)
  const components: ComponentIR[] = []
  const enums: EnumIR[] = []
  const structs: StructIR[] = []
  const moduleDecls: ModuleDeclIR[] = []
  const stores: StoreDefnIR[] = []
  const models: ModelDefnIR[] = []
  const fieldMetas: FieldMetaDefnIR[] = []
  const features: FeatureDefnIR[] = []
  const zodSchemas: ZodSchemaDefnIR[] = []
  const styledComponents: StyledComponentIR[] = []
  const rocketstyleComponents: RocketstyleComponentIR[] = []
  const attrsComponents: AttrsComponentIR[] = []

  for (const node of ast.program.body as AnyNode[]) {
    // Store aliases are component-scoped — reset before each top-level
    // node so `const app = useApp()` in one component never substitutes
    // for an unrelated `app` in another (or in a store setup body).
    ctx.storeAliases.clear()
    // Hook-field aliases (`const { data } = useFetch()`) are likewise
    // component-scoped — reset before each top-level node, and reset the
    // synthetic-name counter so names stay short + deterministic per component.
    ctx.hookFieldAliases.clear()
    ctx.hookDestructureCounter = 0
    // Loud-warning: surface top-level declaration kinds PMTC silently
    // DROPS (no emit → the body references an undefined symbol on the
    // target — a confusing real-compiler error the parse-only gate can't
    // pre-empt). These node types are never consumed by any extractor
    // below, so flagging them here is false-positive-free.
    warnUnsupportedTopLevelDecl(node, ctx)
    const comp = tryComponentFromTopLevel(node, ctx)
    if (comp) components.push(comp)
    const en = tryEnumFromTypeAlias(node, ctx)
    if (en) enums.push(en)
    // G5 follow-up: try struct extraction for object-shape type aliases.
    // Falls through silently when the alias is a union (already caught by
    // tryEnumFromTypeAlias above) OR a non-object alias (`type Foo = string`).
    const st = tryStructFromTypeAlias(node, ctx)
    if (st) structs.push(st)
    // Same struct synthesis for a top-level `interface X { … }` (bails + warns
    // itself on generics/extends/empty — see tryStructFromInterface).
    const stIface = tryStructFromInterface(node, ctx)
    if (stIface) structs.push(stIface)
    // Gap 4 Strategy-B v1: `const useFoo = defineStore("foo", () => ...)`
    // detected at top-level scope and extracted as a StoreDefnIR.
    // The setup body's signal decls become fields on the emitted
    // singleton class. Tracked separately from moduleDecls because
    // the emit shape (class declaration at file scope, vs `var`/`let`
    // binding) is different.
    const sd = tryStoreDefnFromTopLevel(node, ctx)
    if (sd) {
      stores.push(sd)
      // Don't fall through to tryModuleDeclsFromTopLevel — the
      // defineStore call would otherwise also be parsed as a bare
      // module-level binding with an unresolved initializer.
      continue
    }
    // Gap 4 follow-up v2 — state-tree model. `const counter =
    // model({ state: { ... } }).create()` extracted as ModelDefnIR.
    // Emits a PyreonModel_<id> class at module scope + @State /
    // remember binding inside the consuming component.
    const md = tryModelDefnFromTopLevel(node, ctx)
    if (md) {
      models.push(md)
      continue
    }
    // Gap 4 follow-up — @pyreon/validate withField metadata.
    // `const X = withField(schema, { label, hint, ... })` extracted
    // as FieldMetaDefnIR. PMTC discards the schema arg (Zod runtime
    // doesn't translate) and emits a metadata struct holding the
    // literal meta. Downstream code can reference X.label etc.
    const fmd = tryFieldMetaDefnFromTopLevel(node, ctx)
    if (fmd) {
      fieldMetas.push(fmd)
      continue
    }
    // Gap 4 follow-up — @pyreon/feature. `const Todo =
    // defineFeature({ name, schema: { ... literal ... } })`
    // extracted as FeatureDefnIR. Emits a per-feature schema
    // struct/data-class + a module-scope const holding initialValues
    // + name. Component-body uses of `Todo.useList()` etc. still hit
    // the tier2 silent-drop diagnostic (the CRUD runtime is not
    // ported in v1).
    const fd = tryFeatureDefnFromTopLevel(node, ctx)
    if (fd) {
      features.push(fd)
      continue
    }
    // Gap 4 follow-up — @pyreon/validation Zod-schema v1.
    // `const X = zodSchema(z.object({ ... }))` with the simplest
    // field shapes (`z.string()`, `z.number()`, `z.boolean()`).
    // Schema chains are accepted at AST level; v1 emits SHAPE
    // only (no runtime validation methods).
    const zs = tryZodSchemaDefnFromTopLevel(node, ctx)
    if (zs) {
      zodSchemas.push(zs)
      ctx.validationSchemaLowered = true
      continue
    }
    // Gap 4 follow-up — @pyreon/validation Valibot v1.
    const vs = tryValibotSchemaDefnFromTopLevel(node, ctx)
    if (vs) {
      zodSchemas.push(vs) // shared IR (single struct shape)
      ctx.validationSchemaLowered = true
      continue
    }
    // Gap 4 follow-up — @pyreon/validation ArkType v1.
    const as = tryArktypeSchemaDefnFromTopLevel(node, ctx)
    if (as) {
      zodSchemas.push(as)
      ctx.validationSchemaLowered = true
      continue
    }
    // `@pyreon/validate`'s own `s.object({ … })` DSL — same IR, no wrapper.
    const pv = tryPyreonValidateSchemaDefnFromTopLevel(node, ctx)
    if (pv) {
      zodSchemas.push(pv)
      continue
    }
    // styled(Prim)`css` component lowering — `const X = styled(Stack)`…`` wrapping
    // a CANONICAL primitive. Collected BEFORE the arrow-helper + module-decl
    // catch-alls so the styled const isn't mis-parsed as a broken module binding.
    const sc = tryStyledDefnFromTopLevel(node, ctx)
    if (sc) {
      styledComponents.push(sc)
      continue
    }
    // rocketstyle()({component: Prim}).theme().states()… → the rocketstyle-native
    // frontend resolves it at use-sites. Collected before the catch-alls.
    const rc = tryRocketstyleDefnFromTopLevel(node, ctx)
    if (rc) {
      rocketstyleComponents.push(rc)
      continue
    }
    const ac = tryAttrsDefnFromTopLevel(node, ctx)
    if (ac) {
      attrsComponents.push(ac)
      continue
    }
    // A `defineTheme({ … })` declaration is a COMPILE-TIME resolution source
    // consumed by the `collectTheme` pre-pass — it has no native runtime
    // (there is no `defineTheme` in SwiftUI/Compose). Skip it so it doesn't
    // fall through to the module-decl catch-all + emit an unresolved
    // `let theme = defineTheme(…)` binding that fails the native build.
    if (isThemeDefinitionNode(node)) continue
    // Shape-A follow-up: a top-level ARROW-CONST helper
    // (`const dbl = (x: number) => x * 2`). Without this it fell through to
    // tryModuleDeclsFromTopLevel and emitted a mis-scoped `private let dbl =
    // { x in x * 2 }` closure + `Any` inference (silent, uncompilable) — the
    // same silent-mis-emit class the `function dbl(){}` helper form closed, for
    // the arrow-const declaration form. Routes it to `helperFns` so the shared
    // helper emission + return-inference + Int×Double coercion all apply.
    if (tryHelperFnFromArrowConst(node, ctx)) continue
    // Phase 2 follow-up: module-level mutable / immutable bindings.
    // `let nextId = 1`, `const APP_VERSION = '1.0.0'` etc. Closes the
    // TodoMVC `nextId undefined` typecheck blocker by emitting these
    // at file scope on the target.
    const mds = tryModuleDeclsFromTopLevel(node, ctx)
    if (mds) moduleDecls.push(...mds)
  }

  // Double-type follow-up: a `type X = { rate: number }` annotation can't
  // express whether a field is fractional, so the struct field defaults
  // to Int. Refine it to Double when a signal/const initializer assigns a
  // fractional literal to that field — additive (only ever flips
  // number→float, never the reverse, so integer structs are untouched).
  refineStructFloatsFromInitializers(structs, components)

  // Same evidence as the pass above, for the shape that has no StructIR to
  // attach it to: an inline object generic (`signal<{ price: number }[]>([{
  // price: 2.5 }])`) is synthesised into a struct by the EMITTERS, so the
  // named-struct pass cannot see it.
  //
  // ORDER IS LOAD-BEARING: refineReduceSeedFloats below reads these field
  // types to decide whether a `reduce` seed must flip to 0.0. Placed after it,
  // the Kotlin `fold(0, …)` seed stayed Int against a Double accumulation —
  // and ONLY Kotlin failed, because a Swift `reduce(0, …)` literal coerces to
  // Double while Kotlin's binds Int strictly. A one-target failure from a
  // pass-ordering mistake is exactly why both toolchains gate this.
  refineInlineObjectFloats(components)

  // Double-type follow-up: a `reduce` over a Double column lowers to an
  // Int `0` seed, which swiftc/kotlinc reject against Double accumulation.
  // Flag the seed literal Double when the reducer accumulates a fractional
  // field — additive (only flips an integer seed when proven Double).
  refineReduceSeedFloats(components, structs, stores)

  // Double-type follow-up: an EXPLICIT `signal<number>(12.5)` /
  // `signal<number[]>([12.5, …])` generic bypasses inferTypeFromInitial
  // (which only runs when there's no generic), so a fractional literal
  // mis-emits as `Int = 12.5` / `[Int] = [12.5]` (invalid Swift/Kotlin).
  // Refine the signal's number type to Double from its fractional literal
  // initializer — additive (only flips number→float on a fractional).
  refineSignalNumberFloats(components)


  // Shape-A follow-up: a top-level helper function declared WITHOUT a return
  // annotation (`function dbl(x: number) { return x * 2 }`) is collected with
  // `returnType: unknown`. Infer it from the body (params seeded), so the emit
  // signature AND the call-site `helperReturns` registry both get the real
  // type — dropping the v1 annotation requirement. Runs after all structs are
  // built (a helper param/return can reference a declared struct). A body whose
  // type still can't be determined is warned + dropped (never a broken emit).
  refineHelperReturns(ctx.helperFns, structs, ctx.warnings)

  return {
    components,
    enums,
    structs,
    moduleDecls,
    stores,
    models,
    fieldMetas,
    features,
    zodSchemas,
    styledComponents,
    rocketstyleComponents,
    attrsComponents,
    aliasImports,
    helperFns: ctx.helperFns,
    warnings: ctx.warnings,
  }
}

/**
 * Pre-pass: parse every top-level `const … = defineTheme({ … })` (a
 * `VariableDeclaration` whose init is the marker call, or a bare theme object)
 * and merge its literal tokens over the defaults into `ctx.theme`. Later
 * definitions override earlier per-entry, so a theme can be split across
 * declarations. Side-effect-free (no warnings) — a non-theme const is skipped.
 */
/** True if `node` is a top-level `const … = defineTheme({ … })` declaration
 *  (bare or export-wrapped) — a compile-time theme source, never emitted. */
function isThemeDefinitionNode(node: AnyNode): boolean {
  const decl = node?.type === 'ExportNamedDeclaration' ? node.declaration : node
  if (!decl || decl.type !== 'VariableDeclaration') return false
  return ((decl.declarations as AnyNode[]) ?? []).some((d) => parseThemeDefinition(d?.init) !== null)
}

function collectTheme(body: AnyNode[], ctx: ParseCtx): void {
  // Accumulate GENERICALLY over whatever groups parseThemeDefinition returns —
  // this was a hand-enumerated color/spacing/radius copy, so when the
  // fontSize/fontWeight groups joined ThemeTable the parser returned them and
  // this site silently dropped them: `font-size: ${(t) => t.fontSize.body}`
  // warn-dropped while the padding token beside it resolved (the hand-listed
  // input-set class — a per-group list rots on the next group).
  const acc: Partial<ThemeTable> = {}
  let found = false
  for (const node of body) {
    const decl = node?.type === 'ExportNamedDeclaration' ? node.declaration : node
    if (!decl || decl.type !== 'VariableDeclaration') continue
    for (const d of (decl.declarations as AnyNode[]) ?? []) {
      const parsed = parseThemeDefinition(d?.init)
      if (!parsed) continue
      found = true
      for (const [group, entries] of Object.entries(parsed)) {
        const key = group as keyof ThemeTable
        acc[key] = { ...(acc[key] as Record<string, never> | undefined), ...entries } as never
      }
    }
  }
  if (found) ctx.theme = mergeTheme(acc)
}

/**
 * `const X = rocketstyle()({name, component: Prim}).theme().states()…` → a
 * RocketstyleComponentIR. A thin var-declarator unwrap; the chain parsing +
 * dimension resolution lives in the `rocketstyle-native` frontend module.
 */
function tryRocketstyleDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): RocketstyleComponentIR | null {
  let varDecl: AnyNode | null = null
  if (node.type === 'VariableDeclaration') varDecl = node
  else if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  }
  if (!varDecl || varDecl.kind !== 'const') return null
  const decls = (varDecl.declarations as AnyNode[]) ?? []
  if (decls.length !== 1) return null
  const decl = decls[0]
  if (decl?.id?.type !== 'Identifier') return null
  return parseRocketstyleDefn(decl.id.name as string, decl.init, ctx.warnings, ctx.theme)
}

/**
 * `const X = attrs({ name, component: Prim }).attrs({ … })…` → an
 * AttrsComponentIR. A thin var-declarator unwrap; the chain parsing lives in the
 * `attrs-native` frontend module.
 */
function tryAttrsDefnFromTopLevel(node: AnyNode, ctx: ParseCtx): AttrsComponentIR | null {
  let varDecl: AnyNode | null = null
  if (node.type === 'VariableDeclaration') varDecl = node
  else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
    varDecl = node.declaration
  }
  if (!varDecl || varDecl.kind !== 'const') return null
  const decls = (varDecl.declarations as AnyNode[]) ?? []
  if (decls.length !== 1) return null
  const decl = decls[0]
  if (decl?.id?.type !== 'Identifier') return null
  return parseAttrsDefn(decl.id.name as string, decl.init, ctx.warnings, ctx.theme)
}

/**
 * `const X = styled(Prim)\`css\`` where `Prim` is a CANONICAL @pyreon/primitives
 * component → a StyledComponentIR the emit rewrites at each `<X>` use-site to
 * `<Prim style={captured}>`. `styled` accepts a component ref OR a string tag
 * (`Tag = string | ComponentFn`); only a ref (or literal name) resolving to a
 * canonical primitive lowers — `styled('div')` / `styled(NonPrimitive)` warn.
 * Static CSS only (interpolations — theme tokens — warn + drop, a tracked
 * follow-up: they need compile-time theme resolution).
 */
function tryStyledDefnFromTopLevel(node: AnyNode, ctx: ParseCtx): StyledComponentIR | null {
  let varDecl: AnyNode | null = null
  if (node.type === 'VariableDeclaration') varDecl = node
  else if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  }
  if (!varDecl || varDecl.kind !== 'const') return null
  const decls = (varDecl.declarations as AnyNode[]) ?? []
  if (decls.length !== 1) return null
  const decl = decls[0]
  if (decl?.id?.type !== 'Identifier') return null
  const name = decl.id.name as string
  const init = unwrapTypeLayers(decl.init)
  if (init?.type !== 'TaggedTemplateExpression') return null
  // The tag must be `styled(<Prim>)`.
  const tagCall = unwrapTypeLayers(init.tag)
  if (tagCall?.type !== 'CallExpression') return null
  const callee = tagCall.callee
  if (callee?.type !== 'Identifier' || callee.name !== 'styled') return null
  const firstArg = unwrapTypeLayers((tagCall.arguments as AnyNode[])?.[0])
  if (!firstArg) return null
  let prim: string | null = null
  let printedArg = ''
  if (firstArg.type === 'Identifier') {
    prim = firstArg.name as string
    printedArg = prim
  } else if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
    prim = firstArg.value as string
    printedArg = `'${prim}'`
  }
  if (!prim) return null
  if (!isCanonicalPrimitive(prim)) {
    ctx.warnings.push(
      `styled(${printedArg}) on '${name}': only styled() wrapping a CANONICAL @pyreon/primitives ` +
        `component (Stack/Text/Button/Press/Field/…) lowers to native — '${prim}' has no native ` +
        `primitive, so <${name}> was left unresolved. Wrap a canonical primitive, or use a Layer-4 adapter.`,
    )
    return null
  }
  const quasi = init.quasi
  if (quasi?.type !== 'TemplateLiteral') return null
  return { name, tag: prim, styleObject: cssTemplateToStyleObject(quasi, name, ctx) }
}

/** kebab-case CSS property → the camelCase key the inline-style connector reads. */
function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
}

/**
 * A `styled()` CSS template to a style-object `ExprIR` (camelCase keys, literal
 * values). Static declarations lower verbatim; a declaration whose value is a
 * single THEME-TOKEN interpolation (`background: ${(t) => t.color.primary}`) is
 * RESOLVED via the theme-native frontend to its value. Any other interpolation
 * (a complex/runtime expression) is dropped + warned.
 */
function cssTemplateToStyleObject(
  quasi: AnyNode,
  declName: string,
  ctx: ParseCtx,
): Extract<ExprIR, { kind: 'object' }> {
  const quasis = (quasi.quasis as AnyNode[]) ?? []
  const expressions = (quasi.expressions as AnyNode[]) ?? []

  // Interleave quasis + interpolations into declarations, splitting on a text
  // `;` (an interpolation stays attached to the declaration it sits in).
  type Part = { t: 'text'; v: string } | { t: 'expr'; node: AnyNode }
  const decls: Part[][] = [[]]
  const pushText = (s: string) => {
    let buf = ''
    for (const ch of s) {
      if (ch === ';') {
        if (buf) decls[decls.length - 1]!.push({ t: 'text', v: buf })
        decls.push([])
        buf = ''
      } else buf += ch
    }
    if (buf) decls[decls.length - 1]!.push({ t: 'text', v: buf })
  }
  for (let i = 0; i < quasis.length; i++) {
    pushText(quasis[i]?.value?.cooked ?? '')
    if (i < expressions.length) decls[decls.length - 1]!.push({ t: 'expr', node: expressions[i] })
  }

  const fields: { name: string; value: ExprIR }[] = []
  const droppedInterp: string[] = []
  for (const decl of decls) {
    let colonPart = -1
    let colonAt = -1
    for (let i = 0; i < decl.length; i++) {
      const p = decl[i]!
      if (p.t === 'text') {
        const idx = p.v.indexOf(':')
        if (idx !== -1) {
          colonPart = i
          colonAt = idx
          break
        }
      }
    }
    if (colonPart === -1) continue
    const propRaw = (
      decl.slice(0, colonPart).map((p) => (p.t === 'text' ? p.v : '')).join('') +
      (decl[colonPart] as { t: 'text'; v: string }).v.slice(0, colonAt)
    ).trim()
    if (!propRaw || !/^[-a-zA-Z][-a-zA-Z0-9]*$/.test(propRaw)) continue
    const name = kebabToCamel(propRaw)

    const valueParts: Part[] = []
    const tail = (decl[colonPart] as { t: 'text'; v: string }).v.slice(colonAt + 1)
    if (tail.length > 0) valueParts.push({ t: 'text', v: tail })
    for (let i = colonPart + 1; i < decl.length; i++) valueParts.push(decl[i]!)

    const exprs = valueParts.filter((p): p is { t: 'expr'; node: AnyNode } => p.t === 'expr')
    const textBlank = valueParts.every((p) => p.t !== 'text' || p.v.trim() === '')

    if (exprs.length === 0) {
      const valueRaw = valueParts.map((p) => (p.t === 'text' ? p.v : '')).join('').trim()
      if (!valueRaw) continue
      const num = /^[+-]?\d+(?:\.\d+)?$/.test(valueRaw) ? Number(valueRaw) : null
      fields.push({ name, value: { kind: 'literal', value: num !== null ? num : valueRaw } })
    } else if (exprs.length === 1 && textBlank) {
      const tok = resolveThemeToken(exprs[0]!.node, ctx.theme)
      if (tok !== null) fields.push({ name, value: { kind: 'literal', value: tok } })
      else droppedInterp.push(propRaw)
    } else {
      droppedInterp.push(propRaw)
    }
  }
  if (droppedInterp.length > 0) {
    ctx.warnings.push(
      `styled(...) '${declName}': value(s) [${droppedInterp.join(', ')}] use an interpolation that isn't a ` +
        `resolvable theme token — only static values + \`t.<group>.<entry>\` tokens lower to native (dropped).`,
    )
  }
  return { kind: 'object', fields, spreads: [] }
}

/**
 * Loud-warning for top-level declaration kinds PMTC silently DROPS. None of
 * `interface` / TS `enum` / `class` are consumed by any `try*FromTopLevel`
 * extractor — they emit NOTHING, so a body referencing them produces an
 * undefined-symbol error on the real swiftc/kotlinc build (which the
 * parse-only PR gate can't catch). Each warning redirects to the supported
 * shape. Handles both bare and `export`-wrapped forms.
 */
function warnUnsupportedTopLevelDecl(node: AnyNode, ctx: ParseCtx): void {
  const decl =
    node.type === 'ExportNamedDeclaration' && node.declaration
      ? (node.declaration as AnyNode)
      : node
  // NOTE: a top-level `interface X { … }` is now SYNTHESIZED into a struct by
  // `tryStructFromInterface` (same as an object-shape `type` alias); it warns
  // itself only when it can't (generics / extends / empty). So no interface arm
  // here — enum + class still emit nothing and redirect to the supported form.
  if (decl.type === 'TSEnumDeclaration') {
    const name = (decl.id?.name as string | undefined) ?? 'an enum'
    ctx.warnings.push(
      `Top-level TS \`enum ${name}\` is NOT compiled to native (it emits nothing → native code referencing it won't compile). PMTC maps a string-literal UNION type alias to a native enum, not a TS \`enum\` declaration — use \`type ${name} = 'a' | 'b'\` instead.`,
    )
  } else if (decl.type === 'ClassDeclaration') {
    const name = (decl.id?.name as string | undefined) ?? 'a class'
    ctx.warnings.push(
      `Top-level \`class ${name}\` is NOT compiled to native (it emits nothing → native code referencing it won't compile). PMTC compiles components, signals, and the canonical primitives — move the logic into functions + signals (or a \`defineStore\` / \`model()\` for stateful logic).`,
    )
  }
}

/**
 * Extract module-level `let X = expr` / `const X = expr` bindings.
 * Phase 2 follow-up — closes the TodoMVC `nextId undefined` typecheck
 * blocker. TS source's `let` is mutable; `const` is immutable. The
 * mutability flows through to the target emit (`var`/`let` on Swift,
 * `var`/`val` on Kotlin).
 *
 * Skips:
 *   - declarators inside function bodies (already handled by
 *     tryDeclFromVarDeclarator)
 *   - declarators whose init is a CallExpression to `signal` / `computed`
 *     / `useStorage` (those are component-scope reactive decls, not
 *     module-level bindings — caught by tryComponentFromTopLevel)
 *   - destructured patterns (`const { a, b } = obj`) — Phase 3
 *   - non-init declarators (`let x` without value) — defensive bail
 */
function tryModuleDeclsFromTopLevel(node: AnyNode, ctx: ParseCtx): ModuleDeclIR[] | null {
  // Walk through `ExportNamedDeclaration` → `VariableDeclaration`.
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null

  const isConst = varDecl.kind === 'const'
  const declarators = varDecl.declarations as AnyNode[]
  const out: ModuleDeclIR[] = []
  for (const declarator of declarators) {
    const name = declarator.id?.name as string | undefined
    if (!name) continue // destructured — skip silently
    const init = declarator.init as AnyNode | undefined
    if (!init) continue // bare `let x` — skip
    // Skip declarators whose init is a `signal()` / `computed()` /
    // `useStorage()` call — those belong inside a component, not at
    // module scope. They shouldn't show up here (the parser walks
    // function bodies separately), but defensive bail catches any
    // shape where a user accidentally writes `const x = signal(0)` at
    // module scope (which would be a runtime bug in Pyreon anyway).
    if (init.type === 'CallExpression') {
      const calleeName = init.callee?.name as string | undefined
      if (
        calleeName === 'signal' ||
        calleeName === 'computed' ||
        calleeName === 'useStorage'
      ) {
        ctx.warnings.push(
          `Module-level binding ${name} initializes via ${calleeName}() — these belong inside a component. Skipped.`,
        )
        continue
      }
    }
    // Type annotation when present; otherwise unknown.
    const annotation = declarator.id?.typeAnnotation?.typeAnnotation as AnyNode | undefined
    const type: TypeIR = annotation ? parseTypeAnnotation(annotation, ctx) : { kind: 'unknown' }
    const initialExpr = parseExpr(init, ctx)
    out.push({ name, mutable: !isConst, type, initial: initialExpr })
  }
  return out.length > 0 ? out : null
}

/**
 * Extract a string-literal union type alias as a native enum. Source:
 *
 *   type Filter = 'all' | 'active' | 'completed'
 *   export type Filter = ...
 *
 * Reads the oxc shape: `TSTypeAliasDeclaration` with body `TSUnionType`
 * whose every branch is a `TSLiteralType` wrapping a string `Literal`.
 *
 * Returns null for:
 *   - non-union type aliases (`type Foo = string`)
 *   - non-string union members (`type Mixed = 1 | 'a'`)
 *   - generic type-parameter aliases (`type Box<T> = ...`)
 */
/**
 * Gap 4 Strategy-B v1 — detect `const useFoo = defineStore("foo", () => { ... })`
 * at top-level scope and extract a StoreDefnIR.
 *
 * Bounded scope:
 *   - Setup body: ONLY `const X = signal(...)` declarations
 *   - Returned object: ONLY shorthand keys naming local signals
 *
 * Any other shape (computed in body, function in body, expression
 * keys in return, non-object return) falls through to null — the
 * top-level binding is then parsed as a regular moduleDecl (which
 * will currently emit a warning since the defineStore call isn't
 * recognized as a regular signal/etc; the silent-drop diagnostic
 * from #1444 covers that).
 */
/**
 * Side-effect-free pre-scan: collect the binding name of every top-level
 * `const <name> = defineStore(...)` into `out`. Mirrors the detection in
 * `tryStoreDefnFromTopLevel` but extracts ONLY the name (no validation,
 * no warnings — those run in the main pass). Lets the store-aliasing
 * diagnostic resolve hook names independent of declaration order.
 */
/**
 * `@pyreon/*` packages that render via the DOM / a browser-only library
 * and have NO native (Swift/Kotlin) emit — the "web-only-rich" Layer 3b
 * of the multiplatform model. Importing one into a native-compiled file
 * is a mistake: PMTC emits an unresolved component/hook reference that
 * fails the native build cryptically. Conservative + curated (NOT derived
 * from the `@pyreon/runtime-dom` peer-dep, which over-counts packages like
 * `@pyreon/form` / `@pyreon/i18n` that DO have native ports). Anything
 * PMTC recognises — `@pyreon/{primitives,reactivity,core,store,router,
 * i18n,machine,state-tree,form,validation,validate,query,storage,
 * permissions,hooks,rx,url-state,hotkeys}` — is deliberately EXCLUDED.
 */
/**
 * Packages with no native emit at all — importing one into shared source is a
 * build failure waiting to happen, so warn at parse time with the fix.
 *
 * DERIVED from every package manifest's `multiplatform` declaration: a package
 * lands here when it declares `tier: 'web-only'` AND no `nativeFrontend`.
 *
 * This list used to be hand-written, and it rotted in both directions —
 * twice. `@pyreon/sync` and `@pyreon/rich-text` were MISSING, so
 * `syncedSignal(...)` / `createRichTextEditor(...)` emitted verbatim and died
 * with "cannot find … in scope" and no diagnostic. `@pyreon/toast` went STALE
 * the other way once its core started lowering to PyreonToast, warning that a
 * working API was unusable. Both were repaired after the fact, by hand, with a
 * comment — which is what a silent-hole generator looks like from the inside.
 *
 * Packages that lower only PART of their surface (toast, a11y, query) declare
 * `nativeFrontend` in their manifest and are correctly absent here; their
 * unlowered halves are still caught by the per-hook and per-construct warns.
 */
// <gen:web-only-packages:start>
// GENERATED — do not edit by hand. Derived from every package manifest's
// `multiplatform` declaration (tier === 'web-only' AND no `nativeFrontend`)
// by `bun scripts/check-multiplatform-tier.ts --write-table`, which also
// gates that this stays in sync. Edit the MANIFEST, not this list.
const WEB_ONLY_PACKAGES: ReadonlySet<string> = new Set([
  '@pyreon/atlas',
  '@pyreon/charts',
  '@pyreon/code',
  '@pyreon/compiler',
  '@pyreon/config',
  '@pyreon/connector-document',
  '@pyreon/dnd',
  '@pyreon/document',
  '@pyreon/document-primitives',
  '@pyreon/feature',
  '@pyreon/flow',
  '@pyreon/head',
  '@pyreon/hotkeys',
  '@pyreon/http',
  '@pyreon/kinetic',
  '@pyreon/kinetic-presets',
  '@pyreon/lint',
  '@pyreon/loom',
  '@pyreon/mcp',
  '@pyreon/rich-text',
  '@pyreon/runtime-dom',
  '@pyreon/runtime-server',
  '@pyreon/server',
  '@pyreon/sync',
  '@pyreon/table',
  '@pyreon/testing',
  '@pyreon/ui-components',
  '@pyreon/ui-primitives',
  '@pyreon/unistyle',
  '@pyreon/virtual',
  '@pyreon/zero',
  '@pyreon/zero-content',
])
// <gen:web-only-packages:end>

/**
 * Warn (once per package) on top-level imports of a web-only `@pyreon/*`
 * package — they have no native emit. Names the escape-hatch fix so the
 * author isn't left with a cryptic `Cannot find '<Component>' in scope` at
 * native-build time. Sub-path imports (`@pyreon/charts/manual`) match too.
 */
function warnWebOnlyImports(body: AnyNode[], ctx: ParseCtx): void {
  const seen = new Set<string>()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    const src = node.source?.value
    if (typeof src !== 'string') continue
    // Match the package root, allowing sub-path imports.
    const pkg = src.startsWith('@pyreon/')
      ? `@pyreon/${(src.slice('@pyreon/'.length).split('/')[0] ?? '')}`
      : src
    // A package with a granular entry in UNLOWERED_PYREON_MODULES is already
    // covered at SYMBOL level, with advice specific to it ("use the namespace
    // form", "validate in a <Web> branch"). That is strictly better than this
    // blanket warning, and firing both would double-report the same import —
    // worse, for a package whose lowered half is what the user imported
    // (`zodSchema(...)` from @pyreon/validation), the blanket line is simply
    // WRONG. The finer mechanism wins; deferring to it here is what lets the
    // set above be derived from the tier without hand-tuning the overlap.
    if (WEB_ONLY_PACKAGES.has(pkg) && !UNLOWERED_PYREON_MODULES.has(pkg) && !seen.has(pkg)) {
      seen.add(pkg)
      ctx.warnings.push(
        `${pkg} is WEB-ONLY — it renders via the DOM / a browser-only library and has NO native (iOS/Android) emit, so PMTC can't compile it. On native, render it behind a \`<Web>\` escape hatch (web target only), or use a platform-native equivalent inside \`<NativeIOS>\` / \`<NativeAndroid>\`. The shared, multi-platform UI vocabulary lives in \`@pyreon/primitives\` (Stack / Text / Button / …) — those compile to all three targets.`,
      )
    }
  }
}

/**
 * Record the local name(s) bound to `toast` imported from `@pyreon/toast`.
 * `import { toast }` → `toast`; `import { toast as notify }` → `notify`. These
 * are the callees `parseExpr` lowers to a `toast-call` ExprIR.
 */
/**
 * Record the local name(s) bound to the `s` namespace from `@pyreon/validate`.
 *
 * `@pyreon/validate`'s `s.object({ … })` is already a Standard Schema, so —
 * unlike zod/valibot/arktype, which arrive wrapped in `zodSchema(...)` /
 * `valibotSchema(...)` — there is no wrapper call to key the recognizer on.
 * The import is the only reliable signal, so we collect it here and the
 * recognizer refuses to fire without it.
 */
function collectValidateSchemaNames(body: AnyNode[], ctx: ParseCtx): void {
  // Same question for @pyreon/validation's three wrappers, answered the same
  // way and for the same reason: the warn pass runs BEFORE the loop that
  // recognizes schemas, so "did a schema lower?" has to be decided
  // syntactically here. Without it the blanket "has NO native lowering" line
  // printed directly above the native struct it was denying.
  for (const node of body) {
    const d =
      node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration'
        ? node.declaration
        : node.type === 'VariableDeclaration'
          ? node
          : undefined
    for (const decl of (d?.declarations as AnyNode[] | undefined) ?? []) {
      const init = decl.init as AnyNode | undefined
      if (init?.type !== 'CallExpression') continue
      if (init.callee?.type !== 'Identifier') continue
      const fn = init.callee.name as string
      if (fn === 'zodSchema' || fn === 'valibotSchema' || fn === 'arktypeSchema') {
        ctx.validationSchemaLowered = true
      }
    }
  }
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    if (node.source?.value !== '@pyreon/validate') continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 's') {
        const local = spec.local?.name
        if (typeof local === 'string') ctx.validateSchemaNames.add(local)
      }
    }
  }
  if (ctx.validateSchemaNames.size === 0) return
  // Does any top-level declaration actually use the lowered shape? The warn
  // pass runs BEFORE the main body loop that recognizes schemas, so the
  // question is answered syntactically here rather than by reading a result
  // that does not exist yet.
  for (const node of body) {
    const decl =
      node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration'
        ? node.declaration
        : node.type === 'VariableDeclaration'
          ? node
          : null
    if (!decl) continue
    for (const d of (decl.declarations as AnyNode[] | undefined) ?? []) {
      const callee = (d.init as AnyNode | undefined)?.callee as AnyNode | undefined
      if (
        (d.init as AnyNode | undefined)?.type === 'CallExpression' &&
        callee?.type === 'MemberExpression' &&
        callee.object?.type === 'Identifier' &&
        ctx.validateSchemaNames.has(callee.object.name as string) &&
        callee.property?.type === 'Identifier' &&
        ((callee.property.name as string) === 'object' ||
          (callee.property.name as string) === 'discriminatedUnion')
      ) {
        ctx.validateSchemaLowered = true
        return
      }
    }
  }
}

/** Record the local name(s) bound to `SizedMap` from `@pyreon/sized-map`.
 *
 * Gated on the IMPORT rather than the bare name: `SizedMap` is a plausible
 * name for a user's own class, and mis-lowering someone else's constructor is
 * worse than not lowering ours. */
function collectSizedMapNames(body: AnyNode[], ctx: ParseCtx): void {
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    if (node.source?.value !== '@pyreon/sized-map') continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 'SizedMap') {
        const local = spec.local?.name
        if (typeof local === 'string') ctx.sizedMapNames.add(local)
      }
    }
  }
}

function collectToastNames(body: AnyNode[], ctx: ParseCtx): void {
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    if (node.source?.value !== '@pyreon/toast') continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 'toast') {
        const local = spec.local?.name
        if (typeof local === 'string') ctx.toastNames.add(local)
      }
    }
  }
}

/**
 * Hooks the native parser LOWERS. Anything else imported from a `@pyreon/*`
 * package and called as `useX()` falls through to the generic
 * `const x = <call>` emit, which reproduces the call VERBATIM — and there is no
 * `useToggle` (or `useElementSize`) in the Swift or Kotlin
 * runtime, so the result is native code that cannot compile.
 *
 * That was silent. An un-lowered hook call emitted verbatim with ZERO
 * warnings, and the first sign of trouble was `cannot find … in scope` from
 * a device build — or
 * nothing at all, for an app nobody type-checked. 38 of the 52 hooks
 * `@pyreon/hooks` and `@pyreon/form` export behave this way.
 *
 * Listing the lowered set here (rather than leaving it implicit in the
 * if-chains below) is what makes the complement nameable. A drift test asserts
 * every entry is genuinely handled, so this cannot rot into a lie.
 */
export const NATIVE_LOWERED_HOOKS: ReadonlySet<string> = new Set([
  'useAppState', 'useAuth', 'useBiometrics', 'useClipboard', 'useColorScheme',
  'useCrashReporter',
  'useDatabase', 'useFetch', 'useFieldArray', 'useFilePicker', 'useForm', 'useGeolocation',
  'useHaptics', 'useImagePicker', 'useLinking', 'useLoaderData', 'useMap',
  'useNativeModule', 'useNavigate', 'useNotifications', 'useOnline',
  'useParams', 'usePayments', 'usePermissions', 'usePush', 'useQuery',
  // Pure state — no platform dependency, so no runtime; see the
  // `pure-state` DeclIR.
  'useToggle', 'useCounter', 'useBluetooth',
  'useUrlState',
  'useSecureStorage',
  'useShare', 'useSizeClass', 'useStorage', 'useWebSocket',
  'useSessionStorage', 'useMemoryStorage',
  'useDebouncedCallback', 'useThrottledCallback',
])

/**
 * Control-flow components from `@pyreon/core` that do NOT lower to native.
 *
 * `<Show>`, `<For>`, `<Suspense>` and `<ErrorBoundary>` do — they type-check
 * against the Swift stubs today. These four do not: they fall through to the
 * generic component emit, which reproduces the tag verbatim as
 * `Switch { Match(when: …) { … } }` or `Portal { … }`. SwiftUI has no such
 * view and neither does PyreonRuntime, so the native build fails with
 * "cannot find 'Switch' in scope" — and nothing warned.
 *
 * `<Index>` is worse than uncompilable: the render callback is stringified
 * INTO a Text, producing `Text(verbatim: "\({ x in … })")`. Nonsense rather
 * than an error, which is the harder failure to notice.
 *
 * `<Portal>` is arguably not a bug so much as a category error — native uses
 * sheets and dialogs, a different model, which the styling table already
 * records as web-only. The control-flow list claiming it simply disagreed with
 * that.
 */
const UNLOWERED_CONTROL_FLOW: ReadonlyMap<string, string> = new Map([
  ['Switch', 'use nested `<Show>` / a ternary — an if/else chain lowers, a Switch view does not'],
  ['Match', 'only meaningful inside `<Switch>`, which does not lower'],
  ['Dynamic', 'a runtime-chosen component has no SwiftUI/Compose analogue — branch explicitly with `<Show>`'],
  ['Portal', 'native uses sheets/dialogs, a different model — use `<Modal>`'],
  ['Index', 'use `<For each={…} by={…}>`, which lowers to ForEach/LazyColumn'],
])

/**
 * Warn for a control-flow component imported from `@pyreon/core` that has no
 * native lowering.
 *
 * Same reasoning as the hook warning below, and the same scoping: keyed on the
 * IMPORT, so a user's own `<Switch>` from their own module is untouched.
 */
function warnUnloweredControlFlow(body: AnyNode[], ctx: ParseCtx): void {
  const seen = new Set<string>()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    const src = node.source?.value
    if (typeof src !== 'string' || !src.startsWith('@pyreon/core')) continue
    for (const spec of (node.specifiers as AnyNode[]) ?? []) {
      if (spec.type !== 'ImportSpecifier') continue
      const imported = spec.imported?.name ?? spec.imported?.value
      if (typeof imported !== 'string') continue
      const advice = UNLOWERED_CONTROL_FLOW.get(imported)
      if (advice === undefined || seen.has(imported)) continue
      seen.add(imported)
      ctx.warnings.push(
        `<${imported}> has NO native lowering — the tag is reproduced verbatim in the emitted Swift/Kotlin, where no such view exists, so the native build fails with "cannot find '${imported}' in scope". Instead: ${advice}. Lowering natively: <Show>, <For>, <Suspense>, <ErrorBoundary>.`,
      )
    }
  }
}

/**
 * Warn for a `use*` imported from a `@pyreon/*` package that has no native
 * lowering.
 *
 * Scoped to PYREON imports on purpose: a user's own `useThing()` is ordinary
 * code the compiler may well handle, and warning about it would be noise. An
 * import from `@pyreon/hooks` is a claim on framework behaviour that native
 * cannot honour, which is exactly the case worth naming.
 */
/**
 * Pyreon modules whose NON-HOOK exports have no native lowering.
 *
 * The hook arc above keys on `/^use[A-Z]/`, so plain exports fell straight
 * through: `s` from @pyreon/validate, `pipe`/`map` from @pyreon/rx, and
 * `createPermissions` from @pyreon/permissions all emitted verbatim and failed
 * BOTH targets with no diagnostic at all — while `useQuery` right next to them
 * warned properly.
 *
 * Scoped to NON-HOOK imports on purpose. It keeps this list from
 * double-warning with the hook arc, and it handles PARTIAL support for free:
 * `usePermissions` genuinely lowers (verified) while `createPermissions` does
 * not, so warning per-export rather than per-package is what keeps the
 * permissions entry honest.
 *
 * Every entry here was MEASURED, not assumed — `@pyreon/url-state` and
 * `@pyreon/toast` look like candidates but already warn through other paths,
 * and `@pyreon/state-tree`'s `model()` lowers cleanly, so none of them is
 * listed.
 */
interface UnloweredModule {
  /** What to do instead, named per module — a generic refusal leaves the author guessing. */
  readonly advice: string
  /** Exports from this module that DO lower and must stay silent. */
  readonly supported?: ReadonlySet<string>
  /**
   * Warn ONLY these exports, leaving everything else silent.
   *
   * Required for @pyreon/core and @pyreon/reactivity, where the overwhelming
   * majority of exports lower (`signal`, `computed`, `effect`, `h`, `Fragment`,
   * `Show`, `For`, …) and only a handful do not. Listing what is SUPPORTED
   * there would mean enumerating almost the whole public surface and
   * false-warning on anything missed — the @pyreon/rx over-generalisation at
   * much larger scale, in the two most-used packages in the framework.
   */
  readonly unsupported?: ReadonlySet<string>
}

const RX_V1_METHODS = new Set([
  'filter',
  'map',
  'reverse',
  'count',
  'sum',
  'min',
  'max',
  'first',
  'last',
  'take',
  'skip',
  'takeWhile',
  'dropWhile',
  'find',
  'some',
  'every',
  'unique',
  'compact',
  'flatten',
  'reduce',
  'average',
])

const UNLOWERED_PYREON_MODULES: ReadonlyMap<string, UnloweredModule> = new Map([
  [
    '@pyreon/rx',
    {
      // The NAMESPACE form lowers: `import { rx } from '@pyreon/rx'` and then
      // `rx.filter` / `rx.map` / `rx.reverse` emit natively (RX-1). Only the
      // standalone transforms do not. A package-wide warning here fired on `rx`
      // itself and broke the existing rx-lowering lock — caught by that suite,
      // which is exactly the over-warning failure a per-package list invites.
      // The STANDALONE transforms lower too now. They are source-first
      // (`map(src, fn)` is structurally `rx.map(src, fn)`), and rx's own
      // manifest reaches for them 43 times against 5 for the namespace — so
      // the documented, dominant idiom was the one emitting itself verbatim.
      // `pipe` is deliberately NOT in the supported set; see
      // tryRxPipeLowering for the measured reason.
      advice:
        'this export has no native lowering yet. The standalone COLLECTION transforms DO lower (filter / map / take / unique / …, source-first) — chain those through consts, or compose with `computed()`',
      supported: new Set(['rx', ...RX_V1_METHODS]),
    },
  ],
  [
    '@pyreon/table',
    {
      // The blanket line calls a package "renders via the DOM / a browser-only
      // library", which is simply FALSE here: TanStack Table is HEADLESS. It
      // also stops short of naming the native answer, which this package's own
      // manifest states plainly — native lists are `<For>` + primitives.
      //
      // The row-model RENDER surface (getRowModel / getVisibleCells /
      // flexRender) is what has no native analogue; the SORT/FILTER state is
      // ordinary logic an author can hold in signals today, so the fix is a
      // real one rather than "give up".
      advice:
        "the row model is a WEB render surface (getRowModel/getVisibleCells/flexRender) with no native analogue — hold sort/filter state in plain signals and render rows with `<For each={rows}>` + `@pyreon/primitives`, which compiles to all three targets",
    },
  ],
  [
    '@pyreon/validate',
    {
      advice:
        "the `s` validator runtime is web-only — validate in a `<Web>` branch, or hand-roll the checks the native form needs",
    },
  ],
  [
    '@pyreon/validation',
    {
      // The old advice claimed the helpers are web-only. They are not:
      // `zodSchema(z.object({…}))` at top level lowers to a real native
      // struct with parse/safeParse, and the warning appeared directly
      // ABOVE that struct in the same output — telling an author to wrap
      // working code in a `<Web>` escape hatch.
      advice:
        'a TOP-LEVEL `const X = zodSchema(z.object({ … }))` DOES lower — it emits a native struct with parse/safeParse. What stays web-only is the runtime surface around it (inline `.parse()` on an expression, `standardSchemaToValidator`, the async validate path)',
    },
  ],
  [
    '@pyreon/permissions',
    {
      // The previous advice — "`usePermissions()` DOES lower — use the hook
      // instead" — was addressed to someone ALREADY using the hook, and
      // following it changed nothing: `<PermissionsProvider>` is where the
      // grants come from, so a hook without it lowers to an EMPTY set and
      // every check denies. Name the seeding shape instead.
      advice:
        'a literal `<PermissionsProvider permissions={{ … }}>` DOES lower — it injects the grants a bare `usePermissions()` reads. What does not lower is a NON-literal permissions map (a variable, a fetch result), and `createPermissions()` used outside the provider',
    },
  ],
  [
    '@pyreon/a11y',
    {
      // `announce` now LOWERS to PyreonA11y (a VoiceOver / announceForAccessibility
      // call). The remaining exports (VisuallyHidden / LiveRegion / SkipLink /
      // createA11yId) are DOM-based and still warn — hence a per-export
      // `supported` set, not a package-level entry (the `rx` lesson: warn per
      // export, since a module can be only PARTLY unlowered).
      supported: new Set(['announce']),
      advice:
        'the live-region helpers are DOM-based — native a11y goes through the `accessibilityLabel` / `accessibilityHidden` props on the canonical primitives (or `announce(...)`, which lowers), which lower on all three targets',
    },
  ],
  [
    '@pyreon/reactivity',
    {
      // MEASURED: signal / computed / effect / onCleanup lower; these three do
      // not, and failed both targets with no diagnostic.
      //
      // `batch` is arguably strippable rather than unsupported — SwiftUI @State
      // and Compose mutableStateOf already coalesce writes within one action,
      // so the wrapper is semantically a no-op on native. Emitting the body
      // inline would be a real capability win. Warning first because that is an
      // emit change with a return-value question (`batch(() => x)` yields x on
      // web), and a warning is honest today.
      advice:
        'these have no native emit — writes inside one action already coalesce on both native targets, so drop the `batch(...)` wrapper and set signals directly; for `untrack` / `effectScope`, restructure with plain `computed()`',
      unsupported: new Set(['batch', 'untrack', 'effectScope']),
    },
  ],
  [
    '@pyreon/core',
    {
      // MEASURED: onMount lowers (and h / Fragment / Show / For / Suspense are
      // handled by their own emit paths). These four do not.
      advice:
        'these have no native emit — build class strings inline instead of `cx()`, destructure props directly instead of `splitProps()`, and use a plain counter or a stable literal instead of `createUniqueId()`; `lazy()` has no native code-splitting equivalent',
      unsupported: new Set(['lazy', 'cx', 'createUniqueId', 'splitProps']),
    },
  ],
  [
    '@pyreon/elements',
    {
      // Measured every export: only `Element` lowers (to Stack). Text, List,
      // Overlay and Portal all failed both targets SILENTLY — Overlay and
      // Portal are inherently DOM (positioning, document-level mounting), and
      // the Text/List variants are the rich web-only siblings of the canonical
      // primitives.
      //
      // Inverse shape to @pyreon/rx: there, one export lowered and the rest did
      // not, so `supported` carries the exception in both cases rather than
      // splitting the map into two mechanisms.
      advice:
        'only `Element` lowers (to Stack) — Text / List / Overlay / Portal are DOM-based; use the canonical `Text` / `Stack` from @pyreon/primitives, or keep them in a `<Web>` branch',
      supported: new Set(['Element']),
    },
  ],
  [
    '@pyreon/storage',
    {
      // Three of the five backends lower. The two that do not are the two
      // with no native analogue AT ALL, and saying which is which is the
      // point — the generic line left an author guessing whether their
      // backend was merely unimplemented or genuinely impossible.
      //
      //   useStorage        → @AppStorage / rememberPyreonStorage (persistent)
      //   useSessionStorage → plain state (the process IS the session)
      //   useMemoryStorage  → plain state (definitionally process-scoped)
      //   useCookie         → no analogue: cookies are an HTTP/browser
      //                       concept; a native app has no cookie jar its
      //                       own UI reads from
      //   useIndexedDB      → no analogue: use `useDatabase()`, which lowers
      //                       to SQLite on both targets
      advice:
        '`useStorage(key, initial)` DOES lower on both targets (as do `useSessionStorage` and `useMemoryStorage`) — use a hook rather than the factory. `useCookie` and `useIndexedDB` have no native analogue at all: a native app has no cookie jar, and for structured local data `useDatabase()` lowers to SQLite on both targets',
    },
  ],
  [
    '@pyreon/http',
    {
      // Same: endpoint and createClient both fail both targets.
      advice:
        'the transport is web-only — `useFetch<T>(url)` lowers to PyreonFetch on both native targets and auto-starts on mount',
    },
  ],
])

/**
 * Warn for a NON-HOOK export imported from a module with no native runtime.
 *
 * Same shape and same reasoning as the hook and control-flow warnings: keyed on
 * the IMPORT, so a user's own `map` or `s` from their own module is untouched.
 */
/**
 * Record the local name(s) bound to `announce` imported from `@pyreon/a11y`.
 * `import { announce }` → `announce`; `import { announce as say }` → `say`.
 */
function collectAnnounceNames(body: AnyNode[], ctx: ParseCtx): void {
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    if (node.source?.value !== '@pyreon/a11y') continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 'announce') {
        const local = spec.local?.name
        if (typeof local === 'string') ctx.announceNames.add(local)
      }
    }
  }
}

function warnUnloweredPyreonModules(body: AnyNode[], ctx: ParseCtx): void {
  const seen = new Set<string>()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    const src = node.source?.value
    if (typeof src !== 'string') continue
    const entry = UNLOWERED_PYREON_MODULES.get(src)
    if (entry === undefined) continue
    for (const spec of (node.specifiers as AnyNode[]) ?? []) {
      if (spec.type !== 'ImportSpecifier') continue
      const imported = spec.imported?.name ?? spec.imported?.value
      if (typeof imported !== 'string') continue
      // The hook arc already covers these; warning again would double-report.
      if (/^use[A-Z]/.test(imported)) continue
      // Exports that genuinely lower must stay silent — over-warning turns the
      // diagnostic into noise, and `rx` is a live example of a module that is
      // only PARTLY unlowered.
      if (entry.supported?.has(imported)) continue
      // `s` from @pyreon/validate lowers when used as a top-level
      // `s.object({ … })` schema declaration (Gap-4 emit). Other uses do not,
      // so the warning stays for them.
      if (src === '@pyreon/validate' && imported === 's' && ctx.validateSchemaLowered) continue
      // Same shape for @pyreon/validation's adapters: a top-level
      // `const X = zodSchema(z.object({ … }))` emits a real native struct
      // with parse/safeParse, so the blanket "has NO native lowering"
      // line was printed directly ABOVE the struct it was denying.
      if (
        src === '@pyreon/validation' &&
        (imported === 'zodSchema' ||
          imported === 'valibotSchema' ||
          imported === 'arktypeSchema') &&
        ctx.validationSchemaLowered
      ) {
        continue
      }
      // `<PermissionsProvider permissions={{ … }}>` LOWERS now — it injects
      // the grants into the SwiftUI environment / Compose CompositionLocal a
      // bare `usePermissions()` reads. Keeping the blanket line would print
      // "has NO native lowering" directly above the injection it performs.
      if (
        src === '@pyreon/permissions' &&
        imported === 'PermissionsProvider' &&
        ctx.hasPermissionsProvider
      ) {
        continue
      }
      // When a module lists `unsupported`, ONLY those warn — everything else in
      // it lowers and must stay silent.
      if (entry.unsupported !== undefined && !entry.unsupported.has(imported)) continue
      if (seen.has(imported)) continue
      seen.add(imported)
      ctx.warnings.push(
        `${imported} (from ${src}) has NO native lowering — it is reproduced verbatim in the emitted Swift/Kotlin, where no such symbol exists, so the native build fails with "cannot find '${imported}' in scope". Instead: ${entry.advice}. Or keep the call behind a \`<Web>\` escape hatch.`,
      )
    }
  }
}

function warnUnloweredPyreonHooks(body: AnyNode[], ctx: ParseCtx): void {
  const seen = new Set<string>()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    const src = node.source?.value
    if (typeof src !== 'string' || !src.startsWith('@pyreon/')) continue
    for (const spec of (node.specifiers as AnyNode[]) ?? []) {
      if (spec.type !== 'ImportSpecifier') continue
      const imported = spec.imported?.name ?? spec.imported?.value
      if (typeof imported !== 'string') continue
      if (!/^use[A-Z]/.test(imported)) continue
      if (NATIVE_LOWERED_HOOKS.has(imported)) continue
      if (seen.has(imported)) continue
      seen.add(imported)
      // Prefer the package's OWN advice when it has one. The generic tail
      // ("replace it with a hook PMTC lowers, or hand-roll the behaviour from
      // signals") is true but leaves the author guessing; an entry in
      // UNLOWERED_PYREON_MODULES names the actual alternative for THAT
      // package, which is the whole reason that map exists.
      const moduleAdvice = UNLOWERED_PYREON_MODULES.get(src)?.advice
      ctx.warnings.push(
        `${imported}() (from ${src}) has NO native lowering — the call is reproduced verbatim in the emitted Swift/Kotlin, where no such function exists, so the native build fails with "cannot find '${imported}' in scope". ${
          moduleAdvice
            ? `Instead: ${moduleAdvice}. Or keep it behind a \`<Web>\` escape hatch.`
            : 'Use it behind a `<Web>` escape hatch (web target only), replace it with a hook PMTC lowers, or hand-roll the behaviour from signals. The lowered set is NATIVE_LOWERED_HOOKS in parse.ts.'
        }`,
      )
    }
  }
}

/** The alias-tag names the emit's Element/PyreonUI/Container/Row/Col hooks
 *  can intercept. Kept in sync with the guards in emit-swift/emit-kotlin. */
const ALIAS_TAG_NAMES = new Set(['Element', 'PyreonUI', 'PyreonUIProvider', 'Container', 'Row', 'Col'])

/**
 * Collect a local-name → `@pyreon` package map for the alias-tag names. The
 * emit uses it to intercept `<Element>` / `<Row>` / … ONLY when the tag is
 * imported from its expected package, so a user component that happens to
 * share one of these names (e.g. `import { Row } from './my-components'`) is
 * NOT mis-lowered as a coolgrid Row. Records by LOCAL name (the JSX tag), and
 * normalises a sub-path import (`@pyreon/coolgrid/x`) to its package root.
 */
function collectAliasImports(body: AnyNode[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    const src = node.source?.value
    if (typeof src !== 'string') continue
    const pkg = src.startsWith('@pyreon/')
      ? `@pyreon/${(src.slice('@pyreon/'.length).split('/')[0] ?? '')}`
      : src
    for (const spec of (node.specifiers as AnyNode[]) ?? []) {
      const local = spec?.local?.name
      if (typeof local === 'string' && ALIAS_TAG_NAMES.has(local)) map.set(local, pkg)
    }
  }
  return map
}

function collectStoreHookNames(body: AnyNode[], out: Set<string>): void {
  for (const node of body) {
    const varDecl =
      node.type === 'VariableDeclaration'
        ? node
        : node.type === 'ExportNamedDeclaration' &&
            node.declaration?.type === 'VariableDeclaration'
          ? node.declaration
          : null
    if (!varDecl || varDecl.kind !== 'const') continue
    for (const decl of (varDecl.declarations as AnyNode[]) ?? []) {
      if (
        decl?.id?.type === 'Identifier' &&
        decl.init?.type === 'CallExpression' &&
        decl.init.callee?.type === 'Identifier' &&
        (decl.init.callee.name as string) === 'defineStore'
      ) {
        out.add(decl.id.name as string)
      }
    }
  }
}

function tryStoreDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): StoreDefnIR | null {
  // Walk through ExportNamedDeclaration to the VariableDeclaration.
  let varDecl: AnyNode | null = null
  if (node.type === 'VariableDeclaration') {
    varDecl = node
  } else if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  }
  if (!varDecl) return null

  // Expect a single `const X = ...` declarator.
  if (varDecl.kind !== 'const') return null
  const decls = (varDecl.declarations as AnyNode[]) ?? []
  if (decls.length !== 1) return null
  const decl = decls[0]
  if (!decl) return null
  if (decl.id?.type !== 'Identifier') return null
  const hookName = decl.id.name as string

  // Init must be a CallExpression to the bare identifier `defineStore`.
  const init = decl.init
  if (init?.type !== 'CallExpression') return null
  if (init.callee?.type !== 'Identifier') return null
  if ((init.callee.name as string) !== 'defineStore') return null

  // Arg 1: string literal id.
  const args = (init.arguments as AnyNode[]) ?? []
  if (args.length < 2) return null
  const idArg = args[0]
  if (
    idArg?.type !== 'Literal' ||
    typeof idArg.value !== 'string'
  ) {
    ctx.warnings.push(
      `defineStore declaration \`${hookName}\`: first argument must be a string literal id. Falling back to silent-drop.`,
    )
    return null
  }
  const storeId = idArg.value

  // Arg 2: arrow function with a block body returning an object literal.
  const setup = args[1]
  if (
    setup?.type !== 'ArrowFunctionExpression' &&
    setup?.type !== 'FunctionExpression'
  ) {
    ctx.warnings.push(
      `defineStore \`${hookName}\`: setup argument must be a function expression. Falling back to silent-drop.`,
    )
    return null
  }
  // The concise-object arrow body `() => ({ ... })` parses as a
  // ParenthesizedExpression, NOT an ObjectExpression — and those parens are
  // MANDATORY syntax (`() => { ... }` would be a block). So the
  // `body?.type === 'ObjectExpression'` branch below could never be reached,
  // and the warning written for exactly that case was dead from the moment it
  // was written. The shape fell through to the silent `else { return null }`
  // and emitted UNCOMPILABLE passthrough: `private let useApp =
  // defineStore("app", { ((n: signal(1))) })`, referencing `defineStore` and
  // `signal` — neither of which exists in Swift. Zero warnings, both targets.
  //
  // Unwrap first so the branch is reachable. `while`, not `if`: `(( ... ))` is
  // legal and nests.
  let body = setup.body as AnyNode
  while (body?.type === 'ParenthesizedExpression') {
    body = body.expression as AnyNode
  }
  // Two shapes: BlockStatement with return, or expression body (`() => ({...})`)
  let returnObj: AnyNode | undefined
  const signalDecls: { name: string; type: TypeIR; initial: ExprIR }[] = []
  const computedDecls: { name: string; expr: ExprIR }[] = []
  const methodDecls: Extract<DeclIR, { kind: 'function' }>[] = []

  if (body?.type === 'BlockStatement') {
    const stmts = (body.body as AnyNode[]) ?? []
    let returnFound = false
    for (const stmt of stmts) {
      if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const') {
        // v2 — setup-body decls: `const X = signal(...)` (state),
        // `const X = computed(() => expr)` (derived), `const X =
        // (args) => …` (method). Anything else bails the whole store
        // loudly (the v1 silent-ish fallback emitted UNCOMPILABLE
        // passthrough — `private let useApp = defineStore(...)`).
        for (const d of (stmt.declarations as AnyNode[]) ?? []) {
          if (d.id?.type !== 'Identifier') continue
          const name = d.id.name as string
          const declInit = d.init as AnyNode | undefined
          if (declInit?.type === 'ArrowFunctionExpression') {
            const fn = tryFunctionDecl(name, declInit, ctx)
            // Discriminant guard covers the null case too (optional
            // chain) — CodeQL flags a direct null comparison here as
            // an inconvertible-types check.
            if (fn?.kind !== 'function') {
              ctx.warnings.push(
                `defineStore \`${hookName}\`: could not parse method \`${name}\`. Falling back to silent-drop.`,
              )
              return null
            }
            methodDecls.push(fn)
            continue
          }
          if (declInit?.type !== 'CallExpression') continue
          const calleeName = declInit.callee?.name as string | undefined
          if (calleeName === 'computed') {
            const arg = (declInit.arguments as AnyNode[] | undefined)?.[0]
            if (
              arg?.type !== 'ArrowFunctionExpression' ||
              arg.body?.type === 'BlockStatement'
            ) {
              // Block-body computeds in stores are a v3 follow-up —
              // bail LOUDLY (whole-store) rather than drop one decl.
              ctx.warnings.push(
                `defineStore \`${hookName}\`: computed \`${name}\` must be an expression-body arrow (\`computed(() => expr)\`) in v2. Falling back to silent-drop.`,
              )
              return null
            }
            computedDecls.push({ name, expr: parseExpr(arg.body, ctx) })
            continue
          }
          if (calleeName !== 'signal') continue
          // Pull the initial value + type generic if present.
          const sigArgs = (declInit.arguments as AnyNode[]) ?? []
          const initialNode = sigArgs[0]
          const initial: ExprIR = initialNode
            ? parseExpr(initialNode, ctx)
            : { kind: 'literal', value: 0 }
          // Infer type from generic OR initial value. `parseGenericTypeArg`
          // returns `{kind:'unknown'}` (not undefined) when no generic is
          // present, so we check for the unknown sentinel + fall back.
          const generic = parseGenericTypeArg(declInit, ctx)
          const inferredType: TypeIR =
            generic.kind === 'unknown' ? inferTypeFromInitial(initial) : generic
          signalDecls.push({ name, type: inferredType, initial })
        }
      } else if (stmt.type === 'ReturnStatement') {
        returnObj = stmt.argument as AnyNode | undefined
        returnFound = true
        break
      } else {
        // Unsupported statement in setup body — bail with warning.
        ctx.warnings.push(
          `defineStore \`${hookName}\`: v2 supports ONLY \`const X = signal(...)\` / \`const X = computed(() => …)\` / \`const X = (args) => …\` decls in the setup body; saw \`${stmt.type}\`. Falling back to silent-drop.`,
        )
        return null
      }
    }
    if (!returnFound || !returnObj) {
      ctx.warnings.push(
        `defineStore \`${hookName}\`: setup function must return an object literal of signals.`,
      )
      return null
    }
  } else if (body?.type === 'ObjectExpression') {
    // Arrow body shape: `() => ({ ... })` — no signal decls possible
    // (no statements); only object literal whose values are inline
    // signal calls. Out of v1 scope — declare via the block-body form.
    ctx.warnings.push(
      `defineStore \`${hookName}\`: v1 requires the block-body form \`() => { const x = signal(...); return { x } }\`, not the expression-body form. Falling back to silent-drop.`,
    )
    return null
  } else {
    return null
  }

  // Unwrap optional parentheses on the return object.
  let unwrapped = returnObj
  while (unwrapped?.type === 'ParenthesizedExpression') {
    unwrapped = unwrapped.expression as AnyNode
  }
  if (unwrapped?.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `defineStore \`${hookName}\`: setup must return an object literal.`,
    )
    return null
  }

  // Validate the returned keys all match declared setup decls
  // (signals, computeds, or methods).
  // Shorthand-only: `return { count, name }` — same identifier on both sides.
  const declaredNames = new Set([
    ...signalDecls.map((s) => s.name),
    ...computedDecls.map((c) => c.name),
    ...methodDecls.map((m) => m.name),
  ])
  for (const prop of (unwrapped.properties as AnyNode[]) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (prop.shorthand !== true) {
      ctx.warnings.push(
        `defineStore \`${hookName}\`: only shorthand keys are supported in the returned object (\`return { x, y }\`, not \`return { x: x }\`).`,
      )
      return null
    }
    if (prop.key?.type !== 'Identifier') continue
    const k = prop.key.name as string
    if (!declaredNames.has(k)) {
      ctx.warnings.push(
        `defineStore \`${hookName}\`: returned key \`${k}\` doesn't match any setup-body decl.`,
      )
      return null
    }
  }
  // v2: ALL setup decls land on the singleton (not just returned ones)
  // — a method may write a non-returned signal, and a computed may read
  // one; filtering to the exported subset (the v1 behavior) silently
  // broke those bodies.
  const result: StoreDefnIR = { hookName, storeId, fields: signalDecls }
  if (computedDecls.length > 0) result.computeds = computedDecls
  if (methodDecls.length > 0) result.methods = methodDecls
  return result
}

/**
 * Gap 4 follow-up v2 — `@pyreon/state-tree` `model({ state }).create()`
 * top-level recognizer. Extracts the literal initial state into a
 * `ModelDefnIR` so the emit pipeline can produce a per-model class
 * AT MODULE SCOPE plus a `@State` / `remember` binding.
 *
 * Shape (v2):
 *   const counter = model({
 *     state: { count: 0, label: 'counter' },
 *   }).create()
 *
 * Deferred:
 *   - actions / views
 *   - `.create(initialOverride)`
 *   - `.asHook(id)`
 *   - non-literal state values (computed defaults)
 *   - two-step shape `const Counter = model({...}); const c = Counter.create()`
 *
 * Bails (returns null + warning) when the chain doesn't match the
 * v2 shape — silent-drop falls through to the tier2 diagnostic.
 */
/**
 * `.regex(/…/)` → a portable pattern, or `null` with a warning naming why.
 *
 * The recognizer had no `regex` arm at all, so the modifier fell straight
 * through its `else if` chain: the field emitted with only a type guard, no
 * check and no diagnostic. A schema that rejects `"Not A Slug!"` on the web
 * ACCEPTED it on device — a validation bypass with nothing to trace it by.
 *
 * The three engines (JS, NSRegularExpression, java.util.regex) agree on the
 * common syntax — anchors, classes, quantifiers, groups, alternation — and
 * diverge on the rest. Rather than emit a check that might disagree with the
 * web, anything carrying JS-specific syntax or a non-portable flag declines
 * BY NAME. A declined field is no worse off than before; it is just no
 * longer silent.
 */
function tryPortableRegexLiteral(
  node: AnyNode | undefined,
  fieldLabel: string,
  ctx: ParseCtx,
): { source: string; ignoreCase: boolean } | null {
  const re = node?.type === 'Literal' ? (node.regex as { pattern?: string; flags?: string } | undefined) : undefined
  if (!re || typeof re.pattern !== 'string') {
    ctx.warnings.push(
      `${fieldLabel}: .regex() needs an inline regular-expression literal to lower natively — this argument is not one, so the field is NOT validated on device.`,
    )
    return null
  }
  const flags = re.flags ?? ''
  // `i` maps to both engines. `g`/`y` are stateful-iteration flags with no
  // meaning for a single test; `s`/`u`/`v`/`m`/`d` change matching semantics
  // in ways that do not port identically.
  const unportableFlags = [...flags].filter((f) => f !== 'i')
  if (unportableFlags.length > 0) {
    ctx.warnings.push(
      `${fieldLabel}: .regex() flag(s) \`${unportableFlags.join('')}\` do not port to NSRegularExpression / java.util.regex, so the field is NOT validated on device. Only the \`i\` flag lowers.`,
    )
    return null
  }
  // JS-only constructs. Named groups and lookbehind exist in the newer
  // engines but not identically across the OS versions PMTC targets, and a
  // pattern that means something different on device is worse than one that
  // openly does not run.
  const jsOnly = [
    ['\\d', null],
  ] as const
  void jsOnly
  const unportable = /\(\?<[=!]|\\p\{|\\P\{|\(\?<[A-Za-z_]/.test(re.pattern)
  if (unportable) {
    ctx.warnings.push(
      `${fieldLabel}: .regex() uses lookbehind, a named group or a Unicode property escape, which do not port identically to NSRegularExpression / java.util.regex — the field is NOT validated on device.`,
    )
    return null
  }
  // The emitters embed the source in a Swift raw string and a Kotlin string;
  // a pattern containing the raw-string terminator cannot be embedded safely.
  if (re.pattern.includes('"#')) {
    ctx.warnings.push(
      `${fieldLabel}: .regex() pattern contains \`"#\`, which cannot be embedded in the emitted Swift raw string — the field is NOT validated on device.`,
    )
    return null
  }
  return { source: re.pattern, ignoreCase: flags.includes('i') }
}

function tryModelDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): ModelDefnIR | null {
  // ExportNamedDeclaration → VariableDeclaration → VariableDeclarator
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const instanceName = declarator.id.name as string

  // RHS must be a CallExpression whose callee is `<chain>.create`.
  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  const createCallee = init.callee as AnyNode | undefined
  if (createCallee?.type !== 'MemberExpression') return null
  if (createCallee.property?.type !== 'Identifier') return null
  if ((createCallee.property.name as string) !== 'create') return null

  // Walk the builder chain back to the `model({...})` root, collecting the
  // `.views(f)` / `.actions(f)` blocks on the way. The chain is the
  // CANONICAL web shape — a model with no `.actions()` cannot mutate its
  // own state, so a recognizer that only matched the bare
  // `model({state}).create()` form matched the one shape a real model
  // never has, and every chained model fell through to a verbatim emit
  // (`model((state: __Obj0(count: 0))).actions(…)` — none of which exists
  // on either target) with no diagnostic at all.
  const chainBlocks: { kind: 'views' | 'actions'; arg: AnyNode | undefined }[] = []
  let cursor = createCallee.object as AnyNode | undefined
  while (
    cursor?.type === 'CallExpression' &&
    cursor.callee?.type === 'MemberExpression' &&
    cursor.callee.property?.type === 'Identifier'
  ) {
    const blockName = cursor.callee.property.name as string
    if (blockName !== 'views' && blockName !== 'actions') {
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: builder step \`.${blockName}()\` is not supported natively (only \`.views()\` and \`.actions()\` lower). Falling back to silent-drop.`,
      )
      return null
    }
    chainBlocks.push({
      kind: blockName,
      arg: (cursor.arguments as AnyNode[] | undefined)?.[0],
    })
    cursor = cursor.callee.object as AnyNode | undefined
  }
  // The chain was collected outward-in; restore source order so a later
  // block's `self` sees the earlier one's members (the web's cumulative
  // visibility rule).
  chainBlocks.reverse()

  // Root of the chain must be the bare `model({...})` call.
  const modelCall = cursor
  if (modelCall?.type !== 'CallExpression') return null
  if (modelCall.callee?.type !== 'Identifier') return null
  if ((modelCall.callee.name as string) !== 'model') return null

  const configArg = (modelCall.arguments as AnyNode[] | undefined)?.[0]
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `model declaration \`${instanceName}\`: model() config argument is not an object literal — v2 emit needs the literal { state: { ... } } shape. Falling back to silent-drop.`,
    )
    return null
  }

  // Locate the `state: { ... }` property.
  let stateNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const keyName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (keyName === 'state') {
      stateNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    }
    // `actions`, `views` keys deliberately ignored in v2.
  }

  if (!stateNode || stateNode.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `model declaration \`${instanceName}\`: \`state\` field is missing or not an object literal — required by v2 emit. Falling back to silent-drop.`,
    )
    return null
  }

  // Extract literal state fields { name, type, initial }.
  const fields: ModelDefnIR['fields'] = []
  for (const entry of (stateNode.properties as AnyNode[] | undefined) ?? []) {
    if (entry?.type !== 'Property' && entry?.type !== 'ObjectProperty') continue
    const eKey = entry.key as AnyNode | undefined
    const fieldName =
      eKey?.type === 'Identifier'
        ? (eKey.name as string)
        : eKey?.type === 'Literal'
          ? String(eKey.value)
          : undefined
    if (!fieldName) continue
    const eVal = unwrapTypeLayers(entry.value as AnyNode | undefined)
    if (eVal?.type !== 'Literal') {
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: state field \`${fieldName}\` is not a literal value — v2 emit only supports string / number / boolean literals. Silently dropping this field.`,
      )
      continue
    }
    const v = eVal.value
    if (
      typeof v !== 'string' &&
      typeof v !== 'number' &&
      typeof v !== 'boolean'
    ) {
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: state field \`${fieldName}\` is not a string / number / boolean literal. Silently dropping.`,
      )
      continue
    }
    // Type comes from the SEED, via the same inference the store uses —
    // so `{ total: 2.5 }` is a Double rather than an Int the seed cannot
    // fit. (Encoding the seed as a raw literal + a three-value type tag
    // is what forced the old `Int` default.)
    const initial = parseExpr(eVal, ctx)
    fields.push({ name: fieldName, type: inferTypeFromInitial(initial), initial })
  }

  if (fields.length === 0) {
    ctx.warnings.push(
      `model declaration \`${instanceName}\`: no recognizable state fields. Falling back to silent-drop.`,
    )
    return null
  }

  // `.views()` / `.actions()` blocks. Both take `(self) => ({ … })`; the
  // difference is only what the members become on the emitted singleton
  // (computed properties vs methods), which mirrors how `defineStore`
  // already lowers its `computed(...)` decls vs its arrow decls.
  const views: NonNullable<ModelDefnIR['views']> = []
  const methods: NonNullable<ModelDefnIR['methods']> = []
  for (const block of chainBlocks) {
    const factory = unwrapTypeLayers(block.arg)
    if (
      factory?.type !== 'ArrowFunctionExpression' &&
      factory?.type !== 'FunctionExpression'
    ) {
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: \`.${block.kind}()\` argument must be a \`(self) => ({ … })\` factory. Falling back to silent-drop.`,
      )
      return null
    }
    const selfParamNode = (factory.params as AnyNode[] | undefined)?.[0]
    if (selfParamNode && selfParamNode.type !== 'Identifier') {
      // Destructuring `self` ({ count }) would snapshot the members at
      // factory time on web too — refuse rather than emit something whose
      // reactivity silently differs from the web's.
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: \`.${block.kind}((self) => …)\` must bind \`self\` as a plain parameter, not a destructure. Falling back to silent-drop.`,
      )
      return null
    }
    const selfParam = selfParamNode ? (selfParamNode.name as string) : 'self'
    let factoryBody = factory.body as AnyNode | undefined
    while (factoryBody?.type === 'ParenthesizedExpression') {
      factoryBody = factoryBody.expression as AnyNode
    }
    if (factoryBody?.type !== 'ObjectExpression') {
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: \`.${block.kind}()\` must return an object literal directly (\`(self) => ({ … })\`). Falling back to silent-drop.`,
      )
      return null
    }
    for (const member of (factoryBody.properties as AnyNode[] | undefined) ?? []) {
      if (member?.type !== 'Property' && member?.type !== 'ObjectProperty') continue
      const mKey = member.key as AnyNode | undefined
      const memberName =
        mKey?.type === 'Identifier'
          ? (mKey.name as string)
          : mKey?.type === 'Literal'
            ? String(mKey.value)
            : undefined
      if (!memberName) continue
      const mVal = unwrapTypeLayers(member.value as AnyNode | undefined)
      if (
        mVal?.type !== 'ArrowFunctionExpression' &&
        mVal?.type !== 'FunctionExpression'
      ) {
        ctx.warnings.push(
          `model declaration \`${instanceName}\`: \`.${block.kind}()\` member \`${memberName}\` must be a function. Falling back to silent-drop.`,
        )
        return null
      }
      if (block.kind === 'views') {
        // A view is a zero-arg reader (`doubled: () => self.count() * 2`).
        // Its EXPRESSION becomes the computed property's body.
        let viewBody = mVal.body as AnyNode | undefined
        while (viewBody?.type === 'ParenthesizedExpression') {
          viewBody = viewBody.expression as AnyNode
        }
        if (!viewBody || viewBody.type === 'BlockStatement') {
          ctx.warnings.push(
            `model declaration \`${instanceName}\`: view \`${memberName}\` must be an expression-body arrow (\`() => expr\`). Falling back to silent-drop.`,
          )
          return null
        }
        views.push({ name: memberName, expr: parseExpr(viewBody, ctx), selfParam })
        continue
      }
      const fn = tryFunctionDecl(memberName, mVal, ctx)
      if (fn?.kind !== 'function') {
        ctx.warnings.push(
          `model declaration \`${instanceName}\`: could not parse action \`${memberName}\`. Falling back to silent-drop.`,
        )
        return null
      }
      methods.push({ ...fn, selfParam })
    }
  }

  const result: ModelDefnIR = { instanceName, modelId: instanceName, fields }
  if (views.length > 0) result.views = views
  if (methods.length > 0) result.methods = methods
  return result
}

/**
 * Gap 4 follow-up — `@pyreon/validate` `withField(schema, meta)`
 * recognizer. PMTC discards the schema argument (Zod / Valibot /
 * ArkType runtime objects don't translate) and emits a per-binding
 * metadata struct holding the literal `meta` fields. Downstream
 * native code references `emailField.label`, `emailField.placeholder`
 * directly via the emitted struct.
 *
 * Shape (v1):
 *   const emailField = withField(emailSchema, {
 *     label: 'Email',
 *     placeholder: 'name@example.com',
 *     hint: 'We never share',
 *   })
 *
 * Deferred:
 *   - Zod/Valibot/ArkType schema introspection (Strategy-A)
 *   - parseReactive / formatErrors / watchValid / getMeta runtime
 *   - Non-string meta values (booleans, i18n key objects)
 */
function tryFieldMetaDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): FieldMetaDefnIR | null {
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const bindingName = declarator.id.name as string

  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  if (init.callee?.type !== 'Identifier') return null
  if ((init.callee.name as string) !== 'withField') return null

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  // withField(schema, meta) — second argument is the literal meta.
  const metaArg = args[1]
  if (!metaArg || metaArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `withField declaration \`${bindingName}\`: second argument must be a literal meta object — v1 emit needs the literal shape. Falling back to silent-drop.`,
    )
    return null
  }

  const meta: FieldMetaDefnIR['meta'] = []
  for (const prop of (metaArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const keyName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
      meta.push({ name: keyName, value: valueNode.value })
    } else {
      // Non-string meta values silently dropped in v1 (the audit's
      // Strategy-A complexity is per-validator schema introspection,
      // not the meta map; richer meta types are a follow-up).
    }
  }

  if (meta.length === 0) {
    ctx.warnings.push(
      `withField declaration \`${bindingName}\`: no recognized meta fields (only string-valued literals supported in v1). Falling back to silent-drop.`,
    )
    return null
  }

  return { bindingName, meta }
}

/**
 * Gap 4 follow-up — `@pyreon/feature` `defineFeature({ name, schema })`
 * top-level recognizer. v1 supports the LITERAL schema shape
 * `schema: { id: 'string', title: 'string', done: 'boolean' }` and
 * emits a per-feature schema struct + a module-scope const exposing
 * `name` + `initialValues`. Zod / Valibot / ArkType runtime schemas
 * bail and fall through to the tier2 silent-drop diagnostic.
 *
 * Shape (v1):
 *   const Todo = defineFeature({
 *     name: 'todo',
 *     schema: { id: 'string', title: 'string', done: 'boolean' },
 *   })
 *
 * Deferred (each its own PR):
 *   - Zod / Valibot / ArkType schema introspection (Strategy-A)
 *   - CRUD runtime: useList / useById / useCreate / useUpdate / etc.
 *   - Network-fetcher integration
 *   - Validators / form integration
 */
function tryFeatureDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): FeatureDefnIR | null {
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const bindingName = declarator.id.name as string

  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  if (init.callee?.type !== 'Identifier') return null
  if ((init.callee.name as string) !== 'defineFeature') return null

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const configArg = args[0]
  if (!configArg || configArg.type !== 'ObjectExpression') {
    return null // tier2 silent-drop will catch the bad-shape case
  }

  // Pull `name: '...'` and `schema: { ... literal ... }` from the config.
  let featureName: string | undefined
  let schemaNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const keyName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'name') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
        featureName = valueNode.value
      }
    } else if (keyName === 'schema') {
      schemaNode = valueNode
    }
    // `api`, `fetcher`, `initialValues`, `validate` keys are deliberately
    // dropped — runtime CRUD is not ported in v1.
  }

  if (!featureName) {
    ctx.warnings.push(
      `defineFeature declaration \`${bindingName}\`: \`name\` field is missing or not a string literal — v1 emit requires the literal shape. Falling back to tier2 silent-drop.`,
    )
    return null
  }
  if (!schemaNode || schemaNode.type !== 'ObjectExpression') {
    // Non-literal schema (Zod, Valibot, ArkType, etc.) — bail to
    // silent-drop. v2 follow-up will introspect those validator
    // schemas via Strategy-A per-validator lowering.
    ctx.warnings.push(
      `defineFeature declaration \`${bindingName}\`: \`schema\` is not a literal object — v1 emit only supports the literal field-type map shape (\`{ id: 'string', ... }\`). Zod / Valibot / ArkType schemas fall through to tier2 silent-drop.`,
    )
    return null
  }

  // Parse the literal `schema: { id: 'string', title: 'string', ... }`
  const fields: FeatureDefnIR['fields'] = []
  for (const entry of (schemaNode.properties as AnyNode[] | undefined) ?? []) {
    if (entry?.type !== 'Property' && entry?.type !== 'ObjectProperty') continue
    const eKey = entry.key as AnyNode | undefined
    const fieldName =
      eKey?.type === 'Identifier'
        ? (eKey.name as string)
        : eKey?.type === 'Literal'
          ? String(eKey.value)
          : undefined
    if (!fieldName) continue
    const eVal = unwrapTypeLayers(entry.value as AnyNode | undefined)
    if (eVal?.type !== 'Literal' || typeof eVal.value !== 'string') {
      ctx.warnings.push(
        `defineFeature declaration \`${bindingName}\`: schema field \`${fieldName}\` is not a type-name string literal — v1 supports 'string' | 'number' | 'boolean' field types. Dropping field.`,
      )
      continue
    }
    const typeName = eVal.value
    if (typeName === 'string' || typeName === 'number' || typeName === 'boolean') {
      fields.push({ name: fieldName, type: typeName })
    } else {
      ctx.warnings.push(
        `defineFeature declaration \`${bindingName}\`: schema field \`${fieldName}\` has unsupported type '${typeName}' — v1 supports 'string' | 'number' | 'boolean'. Dropping field.`,
      )
    }
  }

  if (fields.length === 0) {
    ctx.warnings.push(
      `defineFeature declaration \`${bindingName}\`: no recognized schema fields. Falling back to tier2 silent-drop.`,
    )
    return null
  }

  return { bindingName, featureName, fields }
}

/**
 * Gap 4 follow-up — `@pyreon/validation` Zod-schema v1 recognizer.
 * Matches the shape:
 *
 *   const userSchema = zodSchema(z.object({
 *     name: z.string(),
 *     age: z.number(),
 *     active: z.boolean(),
 *   }))
 *
 * Walks the call tree manually:
 *   - top: CallExpression callee Identifier `zodSchema`
 *   - arg[0]: CallExpression callee MemberExpression `z.object`
 *   - arg[0].arg[0]: ObjectExpression with z.string()/z.number()/z.boolean() values
 *
 * Schema modifier chains (`z.string().min(2).email()`) are unwrapped
 * at the head of the chain — we look for the BASE z.X() call.
 *
 * v1 emits shape only — no runtime validation methods. v2 follow-up
 * will add `.parse()` + `.safeParse()` runtime + constraint enforcement.
 */
/**
 * `@pyreon/validate` `s`-DSL schema recognizer. Matches the wrapper-less shape:
 *
 *   import { s } from '@pyreon/validate'
 *   const userSchema = s.object({ name: s.string().min(2), age: s.number() })
 *
 * Reuses the zod/valibot/arktype walker wholesale — the field shapes,
 * constraint chains, `.optional()`, nested objects, arrays and discriminated
 * unions are all the same grammar with a different namespace prefix. The only
 * structural difference is the absent wrapper call, which is why
 * `tryNamespacedSchemaDefnFromTopLevel` takes a nullable `schemaFn`.
 *
 * Refuses to fire unless `s` was actually imported from `@pyreon/validate`
 * (see `collectValidateSchemaNames`): `s.object(...)` is not a distinctive
 * enough shape to claim on the bare name.
 */
function tryPyreonValidateSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): ZodSchemaDefnIR | null {
  for (const local of ctx.validateSchemaNames) {
    const hit = tryNamespacedSchemaDefnFromTopLevel(node, ctx, null, local, 'pyreon-validate')
    if (hit) return hit
  }
  return null
}

function tryZodSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): ZodSchemaDefnIR | null {
  return tryNamespacedSchemaDefnFromTopLevel(
    node,
    ctx,
    'zodSchema',
    'z',
    'zod',
  )
}

/**
 * Gap 4 follow-up — `@pyreon/validation` Valibot-schema v1 recognizer.
 * Same parser shape as Zod (`v.object({ field: v.X() })`) with the
 * `v` prefix instead. Matches:
 *
 *   const userSchema = valibotSchema(
 *     v.object({ name: v.string(), age: v.number() }),
 *     safeParse,
 *   )
 *
 * The 2nd `safeParse` arg is discarded — it's the runtime parse fn
 * used by the duck-typed Standard Schema wrapper, irrelevant on
 * native. v1 emits SHAPE only.
 */
function tryValibotSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): ZodSchemaDefnIR | null {
  return tryNamespacedSchemaDefnFromTopLevel(
    node,
    ctx,
    'valibotSchema',
    'v',
    'valibot',
  )
}

/**
 * Gap 4 follow-up — `@pyreon/validation` ArkType-schema v1 recognizer.
 * ArkType uses STRING-VALUED type names instead of call-expression
 * field types (very different from Zod/Valibot):
 *
 *   const userSchema = arktypeSchema(type({
 *     name: 'string',
 *     age: 'number',
 *     active: 'boolean',
 *   }))
 *
 * Walks:
 *   - top: CallExpression callee Identifier `arktypeSchema`
 *   - arg[0]: CallExpression callee Identifier `type`
 *   - arg[0].arg[0]: ObjectExpression with string-literal values
 */
function tryArktypeSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
): ZodSchemaDefnIR | null {
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const bindingName = declarator.id.name as string

  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  if (init.callee?.type !== 'Identifier') return null
  if ((init.callee.name as string) !== 'arktypeSchema') return null

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const innerCall = args[0]
  if (!innerCall || innerCall.type !== 'CallExpression') return null
  const innerCallee = innerCall.callee as AnyNode | undefined
  if (innerCallee?.type !== 'Identifier') return null
  if ((innerCallee.name as string) !== 'type') return null

  const shapeArg = (innerCall.arguments as AnyNode[] | undefined)?.[0]
  if (!shapeArg || shapeArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `arktypeSchema declaration \`${bindingName}\`: type() argument must be a literal shape. Falling back to silent-drop.`,
    )
    return null
  }

  const fields: ZodSchemaDefnIR['fields'] = []
  for (const prop of (shapeArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const fieldName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (!fieldName) continue
    const value = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (value?.type !== 'Literal' || typeof value.value !== 'string') {
      ctx.warnings.push(
        `arktypeSchema declaration \`${bindingName}\`: field \`${fieldName}\` is not a string-literal type — v1 supports 'string' | 'number' | 'boolean' literals. Dropping.`,
      )
      continue
    }
    const t = value.value
    if (t === 'string') {
      fields.push({ name: fieldName, type: 'string' })
    } else if (t === 'number') {
      fields.push({ name: fieldName, type: 'number' })
    } else if (t === 'boolean') {
      fields.push({ name: fieldName, type: 'boolean' })
    } else {
      ctx.warnings.push(
        `arktypeSchema declaration \`${bindingName}\`: field \`${fieldName}\` has unsupported type '${t}' — v1 supports 'string' | 'number' | 'boolean'. Dropping.`,
      )
    }
  }

  if (fields.length === 0) {
    ctx.warnings.push(
      `arktypeSchema declaration \`${bindingName}\`: no recognized fields. Falling back to silent-drop.`,
    )
    return null
  }

  return { bindingName, fields }
}

/**
 * Gap 4 v3 — walk a `z.X()...modifier()...modifier()` chain and return
 * the base method name plus accumulated constraints. Used both for
 * top-level field types AND for the inner element of `z.array(...)`.
 * Returns null when the expression doesn't have the `<prefix>.X()`
 * shape after the chain unwinds. Does NOT recognize `.optional()` /
 * `.nullable()` — those are handled at the field level only (an
 * `optional` array element isn't part of the v3 contract).
 */
function extractTypeAndConstraints(
  expr: AnyNode,
  prefix: string,
  ctx: ParseCtx,
): { method: string; constraints: ZodFieldConstraints } | null {
  const constraints: ZodFieldConstraints = {}
  let cursor: AnyNode | undefined = expr
  while (cursor && cursor.type === 'CallExpression') {
    const callee = cursor.callee as AnyNode | undefined
    if (
      callee?.type === 'MemberExpression' &&
      callee.object?.type === 'CallExpression' &&
      callee.property?.type === 'Identifier'
    ) {
      const modName = callee.property.name as string
      const modArgs = (cursor.arguments as AnyNode[] | undefined) ?? []
      const firstArg = modArgs[0]
      if (modName === 'min') {
        if (
          firstArg &&
          firstArg.type === 'Literal' &&
          typeof firstArg.value === 'number'
        ) {
          constraints.min = firstArg.value
        }
      } else if (modName === 'max') {
        if (
          firstArg &&
          firstArg.type === 'Literal' &&
          typeof firstArg.value === 'number'
        ) {
          constraints.max = firstArg.value
        }
      } else if (modName === 'email') {
        constraints.email = true
      } else if (modName === 'url') {
        constraints.url = true
      } else if (modName === 'uuid') {
        constraints.uuid = true
      } else if (modName === 'regex') {
        const r = tryPortableRegexLiteral(firstArg, `schema element .regex()`, ctx)
        if (r) constraints.regex = r
      }
      // `.optional()` / `.nullable()` are deliberately NOT recognized
      // here — they apply at the field level, not to inner elements.
      cursor = callee.object as AnyNode
      continue
    }
    break
  }
  if (!cursor || cursor.type !== 'CallExpression') return null
  const baseCallee = cursor.callee as AnyNode | undefined
  if (
    baseCallee?.type !== 'MemberExpression' ||
    baseCallee.object?.type !== 'Identifier' ||
    (baseCallee.object.name as string) !== prefix ||
    baseCallee.property?.type !== 'Identifier'
  ) {
    return null
  }
  return {
    method: baseCallee.property.name as string,
    constraints,
  }
}

/**
 * Gap 4 v3.2 — capitalize the first character of an identifier.
 * Used to synthesize aux schema names: `userSchema` + `address` →
 * `userSchema_Address`.
 */
function capitalizeFirst(s: string): string {
  if (s.length === 0) return s
  return s[0]!.toUpperCase() + s.slice(1)
}

/**
 * Gap 4 v3.2 — parse a `z.object({ ... })` CallExpression node into
 * a `ZodSchemaDefnIR` with the supplied `name` as `bindingName`. Used
 * for nested object fields. Returns null when the shape isn't a
 * literal `z.object({...})`.
 *
 * Implementation reuses `tryNamespacedSchemaDefnFromTopLevel`'s body
 * by synthesizing a wrapper VariableDeclaration that holds the
 * `<schemaFn>(z.object(...))` shape so we don't fork the walker.
 */
function parseNestedObjectShape(
  objectCallNode: AnyNode,
  name: string,
  ctx: ParseCtx,
  prefix: string,
  schemaFn: string | null,
): ZodSchemaDefnIR | null {
  // objectCallNode is `z.object({...})`. Wrap it as `<schemaFn>(z.object({...}))`
  // so the existing walker can extract fields + auxSchemas.
  const wrapped: AnyNode = {
    type: 'VariableDeclaration',
    declarations: [
      {
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name },
        init: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: schemaFn },
          arguments: [objectCallNode],
        },
      },
    ],
  }
  return tryNamespacedSchemaDefnFromTopLevel(
    wrapped,
    ctx,
    schemaFn,
    prefix,
    // libraryDisplay — falls back to the namespace prefix for the
    // wrapper-less form (`@pyreon/validate`'s `s.object(...)`).
    /* libraryDisplay (unused here) */ schemaFn ?? prefix,
  )
}

/**
 * Gap 4 v3.2 — recognize `z.object({...})` as an array element. If
 * yes, synthesize the aux schema. Returns null when the inner is NOT
 * a `z.object` CallExpression (the caller falls back to the primitive
 * element path).
 */
function tryParseInnerObjectElement(
  innerArg: AnyNode,
  name: string,
  ctx: ParseCtx,
  prefix: string,
  schemaFn: string | null,
): ZodSchemaDefnIR | null {
  if (innerArg.type !== 'CallExpression') return null
  const callee = innerArg.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression') return null
  if (callee.object?.type !== 'Identifier') return null
  if ((callee.object.name as string) !== prefix) return null
  if (callee.property?.type !== 'Identifier') return null
  if ((callee.property.name as string) !== 'object') return null
  return parseNestedObjectShape(innerArg, name, ctx, prefix, schemaFn)
}

/**
 * Gap 4 v3.3 — parse `z.discriminatedUnion('field', [z.object(...), ...])`.
 *
 * Each variant must be a `z.object()` containing a field with name
 * matching the discriminator and value `z.literal('xxx')`. Variants
 * are synthesized as aux schemas; the parent schema carries a
 * `discriminator` field listing them with their literal values + the
 * synthesized case names.
 */
function parseDiscriminatedUnion(
  innerCall: AnyNode,
  bindingName: string,
  ctx: ParseCtx,
  prefix: string,
  schemaFn: string | null,
): ZodSchemaDefnIR | null {
  const callArgs = (innerCall.arguments as AnyNode[] | undefined) ?? []
  // First arg = discriminator field name (string literal).
  const discrArg = callArgs[0]
  if (
    !discrArg ||
    discrArg.type !== 'Literal' ||
    typeof discrArg.value !== 'string'
  ) {
    ctx.warnings.push(
      `${schemaFn} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() first arg must be a string literal field name — dropping.`,
    )
    return null
  }
  const discrField = discrArg.value
  // Second arg = array of z.object() variants.
  const variantsArg = callArgs[1]
  if (
    !variantsArg ||
    variantsArg.type !== 'ArrayExpression'
  ) {
    ctx.warnings.push(
      `${schemaFn} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() second arg must be a literal array of ${prefix}.object() variants — dropping.`,
    )
    return null
  }
  const variantNodes = (variantsArg.elements as AnyNode[] | undefined) ?? []
  if (variantNodes.length === 0) {
    ctx.warnings.push(
      `${schemaFn} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() needs at least one variant — dropping.`,
    )
    return null
  }
  const auxSchemas: ZodSchemaDefnIR[] = []
  const variants: NonNullable<ZodSchemaDefnIR['discriminator']>['variants'] = []
  for (let i = 0; i < variantNodes.length; i++) {
    const variantNode = variantNodes[i]!
    if (variantNode.type !== 'CallExpression') {
      ctx.warnings.push(
        `${schemaFn} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() variant ${i} is not a ${prefix}.object() call — dropping.`,
      )
      return null
    }
    // Detect the literal value of the discriminator field BEFORE
    // synthesizing the aux schema — we need this for `case`-mapping.
    const literal = extractDiscriminatorLiteral(variantNode, discrField, prefix)
    if (literal === null) {
      ctx.warnings.push(
        `${schemaFn} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() variant ${i} doesn't expose ${prefix}.literal() at "${discrField}" — dropping.`,
      )
      return null
    }
    const caseName = capitalizeFirst(literal.replace(/[^a-zA-Z0-9_]/g, '_'))
    const variantSchemaName = `${bindingName}_${caseName}`
    const variantSchema = parseNestedObjectShape(
      variantNode,
      variantSchemaName,
      ctx,
      prefix,
      schemaFn,
    )
    if (!variantSchema) {
      ctx.warnings.push(
        `${schemaFn} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() variant ${i} has an unparseable ${prefix}.object() shape — dropping.`,
      )
      return null
    }
    auxSchemas.push(variantSchema)
    variants.push({ literal, schemaName: variantSchemaName, caseName })
  }
  const result: ZodSchemaDefnIR = {
    bindingName,
    fields: [],
    discriminator: { field: discrField, variants },
  }
  if (auxSchemas.length > 0) result.auxSchemas = auxSchemas
  return result
}

/**
 * Gap 4 v3.3 — locate the discriminator field inside a variant's
 * `z.object({...})` shape and return its `z.literal()` value as a
 * string. Returns null when the field is missing OR its value isn't
 * a `<prefix>.literal('xxx')` call.
 */
function extractDiscriminatorLiteral(
  objectCallNode: AnyNode,
  discrField: string,
  prefix: string,
): string | null {
  if (objectCallNode.type !== 'CallExpression') return null
  const callee = objectCallNode.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression') return null
  if (callee.object?.type !== 'Identifier') return null
  if ((callee.object.name as string) !== prefix) return null
  if (callee.property?.type !== 'Identifier') return null
  if ((callee.property.name as string) !== 'object') return null
  const shapeArg = (objectCallNode.arguments as AnyNode[] | undefined)?.[0]
  if (!shapeArg || shapeArg.type !== 'ObjectExpression') return null
  for (const prop of (shapeArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const fieldName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (fieldName !== discrField) continue
    const value = prop.value as AnyNode | undefined
    if (value?.type !== 'CallExpression') return null
    const valCallee = value.callee as AnyNode | undefined
    if (valCallee?.type !== 'MemberExpression') return null
    if (valCallee.object?.type !== 'Identifier') return null
    if ((valCallee.object.name as string) !== prefix) return null
    if (valCallee.property?.type !== 'Identifier') return null
    if ((valCallee.property.name as string) !== 'literal') return null
    const litArg = (value.arguments as AnyNode[] | undefined)?.[0]
    if (
      !litArg ||
      litArg.type !== 'Literal' ||
      typeof litArg.value !== 'string'
    ) {
      return null
    }
    return litArg.value
  }
  return null
}

/**
 * Shared parser body for Zod + Valibot recognition (the two
 * libraries use isomorphic `<prefix>.object({ field: <prefix>.X() })`
 * call shapes). ArkType's string-valued shape needs its own parser.
 */
function tryNamespacedSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ParseCtx,
  /**
   * The wrapper call the schema arrives inside (`zodSchema`, `valibotSchema`,
   * `arktypeSchema`), or NULL when the declaration is the namespaced call
   * itself. `@pyreon/validate`'s `s.object({ … })` needs no wrapper because it
   * already IS a Standard Schema; every other field-walking rule below is
   * identical, which is why this is a parameter rather than a second copy of
   * the walker.
   */
  schemaFn: string | null,
  prefix: string,
  libraryDisplay: string,
): ZodSchemaDefnIR | null {
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const bindingName = declarator.id.name as string

  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null

  let innerCall: AnyNode | undefined
  if (schemaFn === null) {
    // Wrapper-less form — the declaration IS `<prefix>.object({ … })`.
    innerCall = init
  } else {
    if (init.callee?.type !== 'Identifier') return null
    if ((init.callee.name as string) !== schemaFn) return null
    const args = (init.arguments as AnyNode[] | undefined) ?? []
    innerCall = args[0]
  }
  if (!innerCall || innerCall.type !== 'CallExpression') return null
  // innerCall.callee must be `<prefix>.object` MemberExpression.
  const innerCallee = innerCall.callee as AnyNode | undefined
  if (innerCallee?.type !== 'MemberExpression') return null
  if (innerCallee.object?.type !== 'Identifier') return null
  if ((innerCallee.object.name as string) !== prefix) return null
  if (innerCallee.property?.type !== 'Identifier') return null
  const innerCallMethod = innerCallee.property.name as string
  // Gap 4 v3.3 — discriminated union shape.
  if (innerCallMethod === 'discriminatedUnion') {
    return parseDiscriminatedUnion(
      innerCall,
      bindingName,
      ctx,
      prefix,
      schemaFn,
    )
  }
  if (innerCallMethod !== 'object') return null

  const shapeArg = (innerCall.arguments as AnyNode[] | undefined)?.[0]
  if (!shapeArg || shapeArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.object() argument must be a literal shape — v1 emit needs the literal { field: ${prefix}.X() } map. Falling back to silent-drop.`,
    )
    return null
  }

  // Gap 4 v3.2 — auxiliary schemas synthesized while walking this
  // shape (one per nested z.object). Each carries its OWN fields +
  // its OWN auxSchemas (recursive). The emitter will emit them all
  // ahead of the main schema.
  const auxSchemas: ZodSchemaDefnIR[] = []

  // Walk shape's properties; each value should be a <prefix>.X() call (possibly chained).
  const fields: ZodSchemaDefnIR['fields'] = []
  for (const prop of (shapeArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const fieldName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (!fieldName) continue

    // Walk the chain twice: once to find the BASE <prefix>.X() call,
    // and once (top-down) to collect constraint modifiers.
    // v2.2 — also collect `.optional()` / `.nullable()` flags.
    const constraints: ZodFieldConstraints = {}
    let optional = false
    let value = unwrapTypeLayers(prop.value as AnyNode | undefined) as AnyNode | undefined
    // First pass — collect modifiers from outermost call inward.
    let cursor: AnyNode | undefined = value
    while (cursor && cursor.type === 'CallExpression') {
      const callee = cursor.callee as AnyNode | undefined
      if (
        callee?.type === 'MemberExpression' &&
        callee.object?.type === 'CallExpression' &&
        callee.property?.type === 'Identifier'
      ) {
        const modName = callee.property.name as string
        const modArgs = (cursor.arguments as AnyNode[] | undefined) ?? []
        const firstArg = modArgs[0]
        if (modName === 'min') {
          if (
            firstArg &&
            firstArg.type === 'Literal' &&
            typeof firstArg.value === 'number'
          ) {
            constraints.min = firstArg.value
          }
        } else if (modName === 'max') {
          if (
            firstArg &&
            firstArg.type === 'Literal' &&
            typeof firstArg.value === 'number'
          ) {
            constraints.max = firstArg.value
          }
        } else if (modName === 'email') {
          constraints.email = true
        } else if (modName === 'url') {
          constraints.url = true
        } else if (modName === 'uuid') {
          constraints.uuid = true
        } else if (modName === 'regex') {
          const r = tryPortableRegexLiteral(firstArg, `schema field .regex()`, ctx)
          if (r) constraints.regex = r
        } else if (modName === 'optional' || modName === 'nullable') {
          // Gap 4 v2.2 — `.optional()` / `.nullable()` mark the field
          // nullable on native. parse() returns nil instead of throwing
          // when missing.
          optional = true
        }
        cursor = callee.object as AnyNode
        continue
      }
      break
    }
    value = cursor
    // value should now be a CallExpression whose callee is `<prefix>.X`.
    if (!value || value.type !== 'CallExpression') {
      ctx.warnings.push(
        `${schemaFn} declaration \`${bindingName}\`: field \`${fieldName}\` is not a ${prefix}.X() call — dropping.`,
      )
      continue
    }
    const baseCallee = value.callee as AnyNode | undefined
    if (
      baseCallee?.type !== 'MemberExpression' ||
      baseCallee.object?.type !== 'Identifier' ||
      (baseCallee.object.name as string) !== prefix ||
      baseCallee.property?.type !== 'Identifier'
    ) {
      ctx.warnings.push(
        `${schemaFn} declaration \`${bindingName}\`: field \`${fieldName}\` has unsupported shape (expected ${prefix}.string/${prefix}.number/${prefix}.boolean) — dropping.`,
      )
      continue
    }
    const method = baseCallee.property.name as string
    const hasConstraints = Object.keys(constraints).length > 0
    if (method === 'string') {
      const entry: ZodSchemaDefnIR['fields'][number] = { name: fieldName, type: 'string' }
      if (hasConstraints) entry.constraints = constraints
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'number') {
      const entry: ZodSchemaDefnIR['fields'][number] = { name: fieldName, type: 'number' }
      if (hasConstraints) entry.constraints = constraints
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'boolean') {
      const entry: ZodSchemaDefnIR['fields'][number] = { name: fieldName, type: 'boolean' }
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'literal') {
      // Gap 4 v3.3 — `z.literal('xxx')` used inside discriminated-union
      // variants as the discriminator field. Inferred type from the
      // literal's runtime type (string / number / boolean). The literal
      // value is enforced at the union-level switch (per-variant
      // parse() just type-checks the field, not the value).
      const litArg = (value.arguments as AnyNode[] | undefined)?.[0]
      let litType: ZodFieldType = 'string'
      if (litArg && litArg.type === 'Literal') {
        const v = litArg.value
        if (typeof v === 'number') litType = 'number'
        else if (typeof v === 'boolean') litType = 'boolean'
      }
      const entry: ZodSchemaDefnIR['fields'][number] = {
        name: fieldName,
        type: litType,
      }
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'object') {
      // Gap 4 v3.2 — nested object field. Synthesize an auxiliary
      // schema named `<binding>_<field>` and reference it from the
      // field's type. The aux schema is added to `auxSchemas` so the
      // emitter renders it as its own struct/data class.
      const nested = parseNestedObjectShape(
        value,
        `${bindingName}_${capitalizeFirst(fieldName)}`,
        ctx,
        prefix,
        schemaFn,
      )
      if (!nested) {
        ctx.warnings.push(
          `${schemaFn} declaration \`${bindingName}\`: field \`${fieldName}\` is a nested ${prefix}.object() but its shape isn't a literal — dropping field.`,
        )
        continue
      }
      auxSchemas.push(nested)
      const entry: ZodSchemaDefnIR['fields'][number] = {
        name: fieldName,
        type: { kind: 'object', schemaName: nested.bindingName },
      }
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'array') {
      // Gap 4 v2.2 — `z.array(z.string())` etc.
      // Gap 4 v3 — element modifier chain for per-element constraints.
      // Gap 4 v3.2 — `z.array(z.object({...}))` synthesizes a nested
      // schema for the element type.
      const innerArg = (value.arguments as AnyNode[] | undefined)?.[0] as
        | AnyNode
        | undefined
      // First check: is the inner element itself a z.object literal?
      const innerObjectSchema = innerArg
        ? tryParseInnerObjectElement(
            innerArg,
            `${bindingName}_${capitalizeFirst(fieldName)}_Item`,
            ctx,
            prefix,
            schemaFn,
          )
        : null
      if (innerObjectSchema) {
        auxSchemas.push(innerObjectSchema)
        const arrayType: Extract<ZodFieldType, { kind: 'array' }> = {
          kind: 'array',
          element: {
            kind: 'object',
            schemaName: innerObjectSchema.bindingName,
          },
        }
        const entry: ZodSchemaDefnIR['fields'][number] = {
          name: fieldName,
          type: arrayType,
        }
        if (optional) entry.optional = true
        fields.push(entry)
        continue
      }
      // Otherwise: primitive element (with possible per-element constraints)
      const inner = innerArg
        ? extractTypeAndConstraints(innerArg, prefix, ctx)
        : null
      let innerType: 'string' | 'number' | 'boolean' | undefined
      if (inner) {
        if (inner.method === 'string') innerType = 'string'
        else if (inner.method === 'number') innerType = 'number'
        else if (inner.method === 'boolean') innerType = 'boolean'
      }
      if (!innerType) {
        ctx.warnings.push(
          `${schemaFn} declaration \`${bindingName}\`: field \`${fieldName}\` is z.array() with an unsupported inner type — supported: z.array(z.string/z.number/z.boolean) and z.array(z.object(...)). Dropping field.`,
        )
        continue
      }
      const arrayType: Extract<ZodFieldType, { kind: 'array' }> = {
        kind: 'array',
        element: innerType,
      }
      if (inner && Object.keys(inner.constraints).length > 0) {
        arrayType.elementConstraints = inner.constraints
      }
      const entry: ZodSchemaDefnIR['fields'][number] = {
        name: fieldName,
        type: arrayType,
      }
      if (optional) entry.optional = true
      fields.push(entry)
    } else {
      ctx.warnings.push(
        `${schemaFn} declaration \`${bindingName}\`: field \`${fieldName}\` uses unsupported ${prefix}.${method}() — supported: ${prefix}.string / ${prefix}.number / ${prefix}.boolean / ${prefix}.array / ${prefix}.object. Dropping field.`,
      )
    }
    void libraryDisplay
  }

  if (fields.length === 0) {
    ctx.warnings.push(
      `${schemaFn} declaration \`${bindingName}\`: no recognized fields. Falling back to silent-drop.`,
    )
    return null
  }

  const result: ZodSchemaDefnIR = { bindingName, fields }
  if (auxSchemas.length > 0) result.auxSchemas = auxSchemas
  return result
}

/** Tiny initial-value type inference for store signals.
 *  Matches the inference contract `tryDeclFromVarDeclarator` uses
 *  for component-scope signals. */
function inferTypeFromInitial(initial: ExprIR): TypeIR {
  // Unary on a literal — `signal(-5)` / `signal(-9.5)` / `signal(+3)` parse as
  // a `unary` node WRAPPING the literal, which otherwise fell through to
  // `Any` (`@State private var n: Any = -5`), breaking arithmetic AND making
  // generic Swift Math overloads (`abs`) resolve to the C `Int32` form. `-`/
  // `+` preserve the underlying number type (int vs float from the literal);
  // `!` on a boolean literal is boolean. The emit already renders the unary
  // value verbatim (`-5`), so only the TYPE inference was missing.
  if (initial.kind === 'unary') {
    if (initial.op === '-' || initial.op === '+') {
      const inner = inferTypeFromInitial(initial.argument)
      if (inner.kind === 'number') return inner
    } else if (initial.op === '!') {
      return { kind: 'boolean' }
    }
  }
  if (initial.kind === 'literal') {
    if (typeof initial.value === 'number') {
      // A non-integer literal (`12.5`) is fractional → Double; an
      // integer literal stays Int (PMTC's ergonomic default).
      return Number.isInteger(initial.value)
        ? { kind: 'number' }
        : { kind: 'number', float: true }
    }
    if (typeof initial.value === 'string') return { kind: 'string' }
    if (typeof initial.value === 'boolean') return { kind: 'boolean' }
  }
  // Homogeneous array literal → typed element. `signal([12.5, 8.3])` (no
  // explicit generic) previously degraded to `Any`, which can't be
  // iterated in a SwiftUI `ForEach` / Compose `items()` or fed to a
  // typed reduce. Infer the element type when EVERY element is a literal
  // of the same primitive; mixed / empty / non-literal arrays stay
  // `unknown` (→ `Any`, the safe pre-existing behaviour). Complements the
  // explicit-generic refinement (`signal<number[]>([…])`) — this is the
  // inferred-generic path.
  if (initial.kind === 'array') {
    const els = initial.elements
    if (els.length === 0) return { kind: 'unknown' }
    if (els.every((e) => e.kind === 'literal' && typeof e.value === 'string')) {
      return { kind: 'array', element: { kind: 'string' } }
    }
    if (els.every((e) => e.kind === 'literal' && typeof e.value === 'boolean')) {
      return { kind: 'array', element: { kind: 'boolean' } }
    }
    if (els.every((e) => e.kind === 'literal' && typeof e.value === 'number')) {
      // Any fractional element ⇒ Double; flag whole-number literals
      // `float` so they render `15.0` (Swift promotes integer literals in
      // a `[Double]` context but Kotlin's `List<Double>` rejects a bare
      // `Int`). Reuses the literal-float emit.
      const anyFractional = els.some(
        (e) => e.kind === 'literal' && typeof e.value === 'number' && !Number.isInteger(e.value),
      )
      if (anyFractional) {
        for (const e of els) {
          if (e.kind === 'literal' && typeof e.value === 'number' && Number.isInteger(e.value)) {
            e.float = true
          }
        }
        return { kind: 'array', element: { kind: 'number', float: true } }
      }
      return { kind: 'array', element: { kind: 'number' } }
    }
    // Array of FLAT object literals → array of the (homogeneous) inferred
    // element struct. `signal([{ id: 1, name: "a" }])` (no generic) previously
    // degraded to `Any` even though the emit synthesized a struct for the
    // element — so the signal annotation was `Any` while its value was
    // `[__Obj]`, failing swiftc. Infer the element from the FIRST object
    // literal; a non-object / non-flat / un-inferrable first element bails.
    if (els.every((e) => e.kind === 'object')) {
      const elemType = inferFlatObjectType(els[0]!)
      if (elemType !== null) return { kind: 'array', element: elemType }
    }
    // Array of ARRAYS → recurse into the element type. `signal([[1, 2], [3, 4]])`
    // (no generic) degraded to `Any` — the value `[[1, 2], …]` is valid Swift but
    // the `Any` annotation fails swiftc (`grid[0][1]` then also degrades). Infer
    // the element from the FIRST inner array (the first-element convention the
    // object case above uses); recursive, so `[[[1]]]` → `[[[Int]]]`. Swift-only
    // in effect — Kotlin infers `List<List<…>>` on its own.
    if (els.every((e) => e.kind === 'array')) {
      const elemType = inferTypeFromInitial(els[0]!)
      if (elemType.kind !== 'unknown') {
        // If the leaf element is fractional, flag EVERY nested integer literal
        // float — the number-array branch only float-flagged els[0]'s, so
        // sibling inner arrays keep bare Ints that Kotlin's `List<List<Double>>`
        // rejects (and Swift renders `2` not `2.0`). Recursive over the nesting.
        const leafFloat = (t: TypeIR): boolean =>
          (t.kind === 'number' && t.float === true) || (t.kind === 'array' && leafFloat(t.element))
        if (leafFloat(elemType)) {
          const flagInts = (e: ExprIR): void => {
            if (e.kind === 'array') {
              for (const x of e.elements) flagInts(x)
            } else if (e.kind === 'literal' && typeof e.value === 'number' && Number.isInteger(e.value)) {
              e.float = true
            }
          }
          for (const inner of els) flagInts(inner)
        }
        return { kind: 'array', element: elemType }
      }
    }
  }
  // FLAT object literal → an object TypeIR. The emit synthesizes a struct from
  // the shape and annotates the signal with it (instead of `Any`, which can't
  // be a typed value downstream). Paired with the emit-side
  // `_structFieldsToName` registration so the type annotation and the value's
  // struct constructor agree on ONE name (the top-level type emits before the
  // value, so the registration is in time). `signal({ x: 1, y: 2 })` → a
  // struct, not `Any`. NESTED objects (`{ pt: { x, y } }`) bail — the nested
  // struct's registration timing diverges from the value emit, so they stay
  // `Any` (unchanged, no regression); flat record shapes are the dominant case.
  if (initial.kind === 'object') {
    const flat = inferFlatObjectType(initial)
    if (flat !== null) return flat
  }
  return { kind: 'unknown' }
}

/**
 * Infer a FLAT-SCALAR object literal's TypeIR — every field must be a scalar
 * (number/string/boolean). A spread, an empty object, or any non-scalar field
 * (a nested object, OR an array field) returns null (the caller degrades to
 * `unknown`). Scalar-only is what keeps the type-path / value-path struct-name
 * unification sound on BOTH targets: a nested struct's registration can't be
 * guaranteed before its value emits, and an ARRAY field can't be synthesized
 * by the shared scalar-only `synthLiteralStructName` (Kotlin emits no type
 * annotation, so its value path has no registered struct to fall back to for
 * those). Scalar records — `signal({ x: 1, y: 2 })` and the elements of
 * `signal([{ id: 1, name: "a" }])` — are the dominant shape and are fully
 * supported; array-field / nested objects stay `Any` (unchanged, no
 * regression) pending the Kotlin emit-ordering follow-up.
 */
function inferFlatObjectType(
  obj: Extract<ExprIR, { kind: 'object' }>,
): TypeIR | null {
  if ((obj.spreads?.length ?? 0) > 0 || obj.fields.length === 0) return null
  const fields: { name: string; type: TypeIR }[] = []
  for (const f of obj.fields) {
    const ft = inferTypeFromInitial(f.value)
    if (ft.kind !== 'number' && ft.kind !== 'string' && ft.kind !== 'boolean') {
      return null
    }
    fields.push({ name: f.name, type: ft })
  }
  return { kind: 'object', fields }
}

/**
 * The struct name a value's TYPE refers to: `Metric` (a `typeRef`) or
 * `Metric[]` (an array of one). Otherwise undefined.
 */
function structNameOfType(t: TypeIR): string | undefined {
  if (t.kind === 'typeRef') return t.name
  if (t.kind === 'array' && t.element.kind === 'typeRef') return t.element.name
  return undefined
}

/** Flatten an initializer ExprIR to its top-level object literals. */
function collectObjectLiterals(e: ExprIR): Extract<ExprIR, { kind: 'object' }>[] {
  if (e.kind === 'object') return [e]
  if (e.kind === 'array') return e.elements.flatMap(collectObjectLiterals)
  return []
}

/**
 * Double-type follow-up — refine struct `number` fields to `Double` when
 * a signal initializer assigns a fractional literal. A `type X = { rate:
 * number }` annotation can't carry fractional-ness, so the struct field
 * defaults to Int; the literal initializer (`signal<X[]>([{ rate: 0.5 }])`)
 * is the only place the fractional-ness is visible.
 *
 * Strictly ADDITIVE: only ever flips `{ kind:'number' }` →
 * `{ kind:'number', float:true }`, and only on a fractional literal, so
 * integer-valued structs are never touched (zero regression). v1 covers
 * top-level struct fields assigned from a signal-typed-as-struct (or
 * struct[]); nested structs are left for a later slice.
 */
function refineStructFloatsFromInitializers(
  structs: StructIR[],
  components: ComponentIR[],
): void {
  if (structs.length === 0) return
  const byName = new Map(structs.map((s) => [s.name, s]))
  for (const c of components) {
    for (const d of c.decls) {
      if (d.kind !== 'signal') continue
      const structName = structNameOfType(d.type)
      if (structName === undefined) continue
      const struct = byName.get(structName)
      if (struct === undefined) continue
      refineFieldsFromObjectLiterals(struct.fields, collectObjectLiterals(d.initial))
    }
  }
}

/**
 * The INLINE-object half of the pass above, and the shape that actually
 * reaches most apps.
 *
 * `signal<{ id: number; price: number }[]>([{ id: 1, price: 2.5 }])` — an
 * ordinary TypeScript annotation on ordinary data — produces NO `StructIR` at
 * parse time: `d.type` holds the inline object type and the emitters
 * synthesise the struct from it later. So the named-struct pass above could
 * never fire here (`structNameOfType` returns undefined, and `structs` is
 * empty), and the field defaulted to Int while the initializer beside it said
 * 2.5 — invalid on BOTH targets, with everything downstream inheriting it (a
 * `reduce` over the column typed Int against a Double accumulation, an
 * imperative `let acc = 0` loop the same).
 *
 * There was no way to spell it correctly either: `0.0` is `Number.isInteger`,
 * so it reads as an integer literal, and the only fix was to DELETE the type
 * annotation — the wrong incentive to give an author, since the annotation is
 * exactly where the compiler should be most confident.
 *
 * A TS `number` carries no int/float distinction, so Int is the right DEFAULT
 * when there is no other evidence. It must not override evidence, and the
 * initializer beside it is evidence.
 */
function refineInlineObjectFloats(components: ComponentIR[]): void {
  for (const c of components) {
    for (const d of c.decls) {
      if (d.kind !== 'signal') continue
      const elem = d.type.kind === 'array' ? d.type.element : d.type
      if (elem.kind !== 'object') continue
      refineFieldsFromObjectLiterals(elem.fields, collectObjectLiterals(d.initial))
    }
  }
}

/**
 * Shared by both halves: flip a `number` field to Double when ANY initializer
 * object gives it a fractional literal, then mark that field's INTEGER
 * literals float so the emitted collection stays homogeneous. The second step
 * is load-bearing on Kotlin, where `price = 3` against a `Double` field is an
 * error (Swift would coerce the literal); it is why `[{ price: 2.5 }, { price:
 * 3 }]` compiles rather than half-compiling.
 *
 * Strictly ADDITIVE — only ever `number` → `number & float`, only on
 * fractional evidence, so an all-integer column is untouched.
 */
function refineFieldsFromObjectLiterals(
  fields: { name: string; type: TypeIR }[],
  objects: Extract<ExprIR, { kind: 'object' }>[],
): void {
  if (objects.length === 0) return
  for (const field of fields) {
    if (field.type.kind !== 'number' || field.type.float === true) continue
    const values = objects
      .map((o) => o.fields.find((f) => f.name === field.name)?.value)
      .filter((v): v is ExprIR => v !== undefined)
    if (!values.some(isFractionalLiteral)) continue
    field.type = { kind: 'number', float: true }
    for (const v of values) {
      if (v.kind === 'literal' && typeof v.value === 'number' && Number.isInteger(v.value)) {
        v.float = true
      }
    }
  }
}

/**
 * Pre-order walk over every ExprIR node reachable from `e` (descending
 * into JSX attrs + children, arrow bodies, call args, object fields,
 * etc.). `visit` runs on each node before its children, so a nested
 * reduce inside a reducer body is still reached. Exhaustive over the
 * ExprIR union.
 */
function forEachExpr(e: ExprIR, visit: (n: ExprIR) => void): void {
  visit(e)
  switch (e.kind) {
    case 'literal':
    case 'identifier':
      return
    case 'call':
      forEachExpr(e.callee, visit)
      for (const a of e.args) forEachExpr(a, visit)
      return
    case 'member':
      forEachExpr(e.object, visit)
      return
    case 'index':
      forEachExpr(e.object, visit)
      forEachExpr(e.index, visit)
      return
    case 'binary':
    case 'comparison':
    case 'logical':
      forEachExpr(e.left, visit)
      forEachExpr(e.right, visit)
      return
    case 'unary':
    case 'update':
      forEachExpr(e.argument, visit)
      return
    case 'ternary':
      forEachExpr(e.cond, visit)
      forEachExpr(e.then, visit)
      forEachExpr(e.otherwise, visit)
      return
    case 'arrow':
      forEachExpr(e.body, visit)
      return
    case 'rx-call':
      forEachExpr(e.source, visit)
      for (const a of e.args) forEachExpr(a, visit)
      return
    case 'jsx-element':
      for (const a of e.attrs) {
        if (a.kind === 'attr') forEachExpr(a.value, visit)
        else if (a.kind === 'event') forEachExpr(a.handler, visit)
        else forEachExpr(a.argument, visit)
      }
      for (const ch of e.children) if (ch.kind === 'expr') forEachExpr(ch.expr, visit)
      return
    case 'jsx-fragment':
      for (const ch of e.children) if (ch.kind === 'expr') forEachExpr(ch.expr, visit)
      return
    case 'array':
      for (const el of e.elements) forEachExpr(el, visit)
      return
    case 'object':
      for (const f of e.fields) forEachExpr(f.value, visit)
      if (e.spreads) for (const s of e.spreads) forEachExpr(s, visit)
      return
    case 'paren':
      forEachExpr(e.inner, visit)
      return
    case 'spread':
      forEachExpr(e.argument, visit)
      return
  }
}

/**
 * Double-type follow-up — refine a `reduce` SEED literal to Double when
 * the reducer accumulates a Double column. JS `arr.reduce((s, m) => s +
 * m.growth, 0)` lowers to an Int `0` seed, but a Double accumulation needs
 * a Double seed (`reduce(0.0, …)` on Swift / `fold(0.0, …)` on Kotlin) or
 * the compiler rejects the mixed Int + Double arithmetic.
 *
 * The reducer's element param (`m`) has no declared type in the IR — the
 * framework binds it per-row — so the inferencer can't see `m.growth`'s
 * type on its own. We bind the param locally to the source's element
 * struct, infer the accumulator body, and when it's fractional flag the
 * integer seed literal `float` so the literal emit renders `0.0`.
 *
 * Strictly ADDITIVE: only ever sets `float: true` on an integer seed whose
 * accumulation is PROVEN Double, so integer reduces are untouched (zero
 * regression). Covers the array-method form (`xs.reduce(cb, 0)`) and the
 * rx-namespace form (`rx.reduce(xs, cb, 0)` → rx-call) — both carry
 * (reducer, seed) args. v1 walks the JSX return expression + single-
 * expression decls; reductions inside multi-statement bodies are a later
 * slice.
 */
function refineReduceSeedFloats(
  components: ComponentIR[],
  structs: StructIR[],
  storeDefs: StoreDefnIR[],
): void {
  // NO `structs.length === 0` bail. The pass used to return immediately when
  // the file declared no NAMED struct — but a component whose data is typed
  // inline (`signal<{ price: number }[]>([…])`) synthesises its struct in the
  // EMITTERS and so has none at parse time, which is the common shape. The
  // bail meant its `reduce` seed was never examined: Kotlin emitted
  // `fold(0, …)` against a Double accumulation (a hard error), while Swift
  // happened to compile because a `reduce(0, …)` literal coerces to Double
  // there. `structObjectType` simply returns undefined for such a type and
  // the inference context resolves it instead, so dropping the bail costs
  // nothing and the pass stays additive.
  const structObjectType = (name: string): TypeIR | undefined => {
    const s = structs.find((x) => x.name === name)
    return s === undefined ? undefined : { kind: 'object', fields: s.fields }
  }
  for (const c of components) {
    const ctx = buildInferenceCtx(c.decls, storeDefs)
    const visit = (e: ExprIR): void => {
      // Match BOTH the array-method reduce (`xs.reduce(cb, seed)`) and the
      // rx-namespace reduce (`rx.reduce(xs, cb, seed)` → rx-call). Each
      // carries a source + args [reducer, seed].
      let source: ExprIR | undefined
      let reducer: ExprIR | undefined
      let seed: ExprIR | undefined
      if (
        e.kind === 'call' &&
        e.callee.kind === 'member' &&
        e.callee.property === 'reduce' &&
        e.args.length === 2
      ) {
        source = e.callee.object
        reducer = e.args[0]
        seed = e.args[1]
      } else if (e.kind === 'rx-call' && e.method === 'reduce' && e.args.length === 2) {
        source = e.source
        reducer = e.args[0]
        seed = e.args[1]
      }
      if (
        source === undefined ||
        reducer === undefined ||
        seed === undefined ||
        reducer.kind !== 'arrow' ||
        reducer.params.length < 2 ||
        seed.kind !== 'literal' ||
        typeof seed.value !== 'number' ||
        !Number.isInteger(seed.value) ||
        seed.float === true
      ) {
        return
      }
      // Resolve the source's element struct, bind the reducer's element
      // param (2nd) to it, and infer the accumulator body.
      const srcType = inferType(source, ctx)
      // The element type may be a NAMED struct (`type Item = {…}` → typeRef)
      // or an INLINE object (`signal<{ price: number }[]>`), which produces no
      // StructIR at all. Only the named form was handled, so the inline form —
      // the common one — never reached the seed check.
      const srcElem = srcType.kind === 'array' ? srcType.element : undefined
      const elemType =
        srcElem === undefined
          ? undefined
          : srcElem.kind === 'typeRef'
            ? structObjectType(srcElem.name)
            : srcElem.kind === 'object'
              ? srcElem
              : undefined
      if (elemType === undefined) return
      const reduceCtx: InferenceCtx = { ...ctx, locals: new Map(ctx.locals) }
      reduceCtx.locals.set(reducer.params[1]!, elemType)
      const acc = inferType(reducer.body, reduceCtx)
      if (acc.kind === 'number' && acc.float === true) seed.float = true
    }
    forEachExpr(c.returnExpr, visit)
    for (const d of c.decls) {
      if (d.kind === 'signal') forEachExpr(d.initial, visit)
      else if (d.kind === 'computed' && d.expr !== undefined) forEachExpr(d.expr, visit)
    }
  }
}

/** A numeric literal with a fractional value (`12.5`, not `12`). */
function isFractionalLiteral(e: ExprIR): boolean {
  return e.kind === 'literal' && typeof e.value === 'number' && !Number.isInteger(e.value)
}

/**
 * Double-type follow-up — refine a signal's EXPLICIT `number` / `number[]`
 * generic to Double when its literal initializer is fractional.
 *
 * `signal(12.5)` (no generic) already infers Double via
 * `inferTypeFromInitial`, but an EXPLICIT generic short-circuits that path
 * (`hasGeneric` wins), so `signal<number>(12.5)` mis-emitted `Int = 12.5`
 * and `signal<number[]>([12.5, …])` mis-emitted `[Int] = [12.5, …]` — both
 * INVALID Swift/Kotlin (an Int can't hold 12.5). This refines them to
 * Double from the fractional-literal evidence.
 *
 * For arrays, refining the element to Double also flags every INTEGER
 * literal element `float` (so `[12.5, 8.3, 15]` emits `[15.0]` not `[15]`)
 * — Swift promotes integer literals in a `[Double]` context but Kotlin's
 * `List<Double>` rejects a bare `Int` element, so the `.0` is required for
 * the mixed/whole-number case. Reuses the literal-float emit from the
 * reduce-seed slice.
 *
 * Strictly ADDITIVE: only ever flips `{ kind:'number' }` →
 * `{ kind:'number', float:true }` on fractional-literal evidence; integer
 * signals and arrays are never touched (zero regression).
 */
function refineSignalNumberFloats(components: ComponentIR[]): void {
  for (const c of components) {
    for (const d of c.decls) {
      if (d.kind !== 'signal') continue
      // Scalar `signal<number>(12.5)`.
      if (d.type.kind === 'number' && d.type.float !== true && isFractionalLiteral(d.initial)) {
        d.type = { kind: 'number', float: true }
        continue
      }
      // Array `signal<number[]>([… any fractional …])`.
      if (
        d.type.kind === 'array' &&
        d.type.element.kind === 'number' &&
        d.type.element.float !== true &&
        d.initial.kind === 'array' &&
        d.initial.elements.some(isFractionalLiteral)
      ) {
        d.type = { kind: 'array', element: { kind: 'number', float: true } }
        for (const el of d.initial.elements) {
          if (el.kind === 'literal' && typeof el.value === 'number' && Number.isInteger(el.value)) {
            el.float = true
          }
        }
      }
    }
  }
}

function tryEnumFromTypeAlias(node: AnyNode, ctx: ParseCtx): EnumIR | null {
  // Walk through `ExportNamedDeclaration` to the type alias.
  let alias: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'TSTypeAliasDeclaration'
  ) {
    alias = node.declaration
  } else if (node.type === 'TSTypeAliasDeclaration') {
    alias = node
  }
  if (!alias) return null
  // Skip generic type parameters — `type Box<T> = T | null` isn't a
  // closed enum.
  if (alias.typeParameters?.params?.length > 0) return null
  const name = alias.id?.name as string | undefined
  if (!name) return null
  const body = alias.typeAnnotation as AnyNode | undefined
  if (!body || body.type !== 'TSUnionType') return null
  const branches = body.types as AnyNode[] | undefined
  if (!branches || branches.length === 0) return null
  const cases: string[] = []
  for (const branch of branches) {
    if (branch.type !== 'TSLiteralType') return null
    const lit = branch.literal as AnyNode | undefined
    if (!lit || lit.type !== 'Literal') return null
    const v = lit.value
    if (typeof v !== 'string') return null
    // Empty-string enum cases would be valid TS but invalid Swift /
    // Kotlin identifiers — defensive bail.
    if (v.length === 0) {
      ctx.warnings.push(`Enum ${name}: skipped empty-string union branch.`)
      return null
    }
    cases.push(v)
  }
  return { name, cases }
}

/**
 * Extract an object-shape type alias as a native struct / data class.
 * Source:
 *
 *   type Todo = { id: number; text: string; done: boolean }
 *   export type Todo = { ... }
 *
 * Reads the oxc shape: `TSTypeAliasDeclaration` with body `TSTypeLiteral`
 * (anonymous object). Foundational Phase 2 work — closes the "anonymous
 * record types emit as labelled tuples" gap from G5 #849's known caveats.
 * Anonymous tuples block Codable bridges (Swift) and Compose Savers
 * (Kotlin); real structs unblock both.
 *
 * Returns null for:
 *   - non-object type aliases (`type Filter = 'all' | 'active'` —
 *     caught by tryEnumFromTypeAlias upstream)
 *   - non-object aliases (`type Foo = string`)
 *   - generic type-parameter aliases (`type Box<T> = ...`) — Phase 3
 *     work; structural emit of generic structs requires deeper inference
 *   - empty object types (no fields — defensive bail; emit would be
 *     `struct X { }` which is valid but useless)
 */
/**
 * How many members of an object-type body are METHOD signatures
 * (`go(): boolean`) rather than property signatures (`id: string`).
 *
 * `parseTypeAnnotation`'s `TSTypeLiteral` case keeps only
 * `TSPropertySignature`, so method members contribute no struct fields.
 * Counting them lets the two struct-synthesis sites tell three cases
 * apart that were previously conflated into one misleading message:
 *
 *   - **method-only** (`type Bluetooth = { connect(id: string): boolean }`)
 *     — a behavioral CONTRACT, not a data shape. There is no native
 *     struct to make and nothing is lost: the methods live on the class
 *     the app provides (the `useNativeModule<T>('Bluetooth')` shape), or
 *     on a callback bag that never crosses the native boundary. Skipped
 *     SILENTLY — warning the author to "use an object type" when they
 *     already did was a dead end.
 *   - **truly empty** (`type X = {}`) — the original defensive bail; the
 *     "empty object type" warning is correct and stays.
 *   - **mixed** (`{ id: string; act(): void }`) — the struct emits from
 *     the properties and the methods were dropped with NO diagnostic.
 *     That is a silent drop, so it now warns by name.
 */
function countMethodSignatures(members: AnyNode[] | undefined): number {
  if (!members) return 0
  return members.filter((m) => m?.type === 'TSMethodSignature').length
}

/**
 * Shared tail of both struct-synthesis paths: decide what to do when
 * `parseTypeAnnotation` produced fewer fields than the source had
 * members. Returns true when the caller should bail (no struct).
 */
function reportDroppedMethodMembers(
  name: string,
  fieldCount: number,
  members: AnyNode[] | undefined,
  emptyMessage: string,
  ctx: ParseCtx,
): boolean {
  const methods = countMethodSignatures(members)
  if (fieldCount === 0) {
    // Method-only = a behavioral contract; silent. Genuinely empty = warn.
    if (methods === 0) ctx.warnings.push(emptyMessage)
    return true
  }
  if (methods > 0) {
    ctx.warnings.push(
      `Struct ${name}: ${methods} method member(s) dropped — a native struct / data class holds DATA only. Methods on a type that crosses into native must live on the platform class (see \`useNativeModule\`), or be plain function-typed properties (\`go: () => boolean\`), which do lower.`,
    )
  }
  return false
}

function tryStructFromTypeAlias(node: AnyNode, ctx: ParseCtx): StructIR | null {
  // Walk through `ExportNamedDeclaration` to the type alias.
  let alias: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'TSTypeAliasDeclaration'
  ) {
    alias = node.declaration
  } else if (node.type === 'TSTypeAliasDeclaration') {
    alias = node
  }
  if (!alias) return null
  // Skip generic type parameters — Phase 3 work.
  if (alias.typeParameters?.params?.length > 0) return null
  const name = alias.id?.name as string | undefined
  if (!name) return null
  const body = alias.typeAnnotation as AnyNode | undefined
  if (!body || body.type !== 'TSTypeLiteral') return null
  // Use the same parser as inline `TSTypeLiteral` annotations so the
  // field-walking logic stays in one place. Reuses the optional-chain
  // bails / index-signature skips already in parseTypeAnnotation.
  const parsed = parseTypeAnnotation(body, ctx)
  if (parsed.kind !== 'object') return null
  const bail = reportDroppedMethodMembers(
    name,
    parsed.fields.length,
    body.members as AnyNode[] | undefined,
    `Struct ${name}: skipped — empty object type.`,
    ctx,
  )
  if (bail) return null
  return { name, fields: parsed.fields }
}

/**
 * Sibling of `tryStructFromTypeAlias` for a top-level `interface X { … }`
 * declaration (bare or `export`-wrapped). An interface's members
 * (`decl.body.body`, a list of `TSPropertySignature`) are the SAME node shape
 * as a `TSTypeLiteral`'s `.members`, so we wrap them in a synthetic type-literal
 * and reuse `parseTypeAnnotation` — `type X = { … }` and `interface X { … }`
 * produce IDENTICAL structs (field parsing / optional-chain bails /
 * index-signature skips stay in one place).
 *
 * Emits the "not synthesized" warning ITSELF on a bail (generic params,
 * `extends`, empty) — so a SUCCESSFULLY-synthesized interface never warns
 * (the `warnUnsupportedTopLevelDecl` interface arm was removed), but a shape we
 * can't synthesize still redirects the author to a supported form.
 */
function tryStructFromInterface(node: AnyNode, ctx: ParseCtx): StructIR | null {
  let iface: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'TSInterfaceDeclaration'
  ) {
    iface = node.declaration
  } else if (node.type === 'TSInterfaceDeclaration') {
    iface = node
  }
  if (!iface) return null
  const name = iface.id?.name as string | undefined
  if (!name) return null
  // Generic + `extends` interfaces are out of the synthesizable subset (the
  // parent's fields aren't in this body) — warn + bail, same as before.
  if (iface.typeParameters?.params?.length > 0 || (iface.extends?.length ?? 0) > 0) {
    ctx.warnings.push(
      `Top-level \`interface ${name}\` with generics or \`extends\` is NOT compiled to native — use a non-generic object-shape \`interface ${name} { … }\` / \`type ${name} = { … }\`.`,
    )
    return null
  }
  const members = iface.body?.body as AnyNode[] | undefined
  if (!members) return null
  const parsed = parseTypeAnnotation({ type: 'TSTypeLiteral', members } as AnyNode, ctx)
  if (parsed.kind !== 'object') return null
  const bail = reportDroppedMethodMembers(
    name,
    parsed.fields.length,
    members,
    `Struct ${name}: skipped — empty interface.`,
    ctx,
  )
  if (bail) return null
  return { name, fields: parsed.fields }
}

/**
 * Pre-pass companion to `tryStructFromTypeAlias`: fill
 * `ctx.objectTypeAliases` with every locally-declared object-shape type
 * alias (bare or export-wrapped, generic-free), name → parsed object
 * TypeIR. Runs BEFORE the main pass so `parseProps` can resolve a NAMED
 * props annotation (`props: CardProps`) even when the alias is declared
 * below the component. Uses a scratch ctx so parse warnings from the
 * annotation don't double-fire (the main pass re-parses and owns them).
 */
function collectObjectTypeAliases(body: AnyNode[], ctx: ParseCtx): void {
  const scratch: ParseCtx = {
    warnings: [],
    source: ctx.source,
    storeHookNames: new Set(),
    objectTypeAliases: new Map(),
    storeAliases: new Map(),
    toastNames: new Set(),
    validateSchemaNames: new Set(),
    rxImportedNames: new Map(),
    validateSchemaLowered: false,
    sizedMapNames: new Set(),
    validationSchemaLowered: false,
    hasPermissionsProvider: false,
    announceNames: new Set(),
    hookFieldAliases: new Map(),
    hookDestructureCounter: 0,
    helperFns: [],
    theme: DEFAULT_THEME,
  }
  for (const node of body) {
    let alias: AnyNode | null = null
    if (
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'TSTypeAliasDeclaration'
    ) {
      alias = node.declaration
    } else if (node.type === 'TSTypeAliasDeclaration') {
      alias = node
    }
    if (!alias) continue
    if (alias.typeParameters?.params?.length > 0) continue
    const name = alias.id?.name as string | undefined
    if (!name) continue
    const aliasBody = alias.typeAnnotation as AnyNode | undefined
    if (!aliasBody || aliasBody.type !== 'TSTypeLiteral') continue
    const parsed = parseTypeAnnotation(aliasBody, scratch)
    if (parsed.kind === 'object' && parsed.fields.length > 0) {
      ctx.objectTypeAliases.set(name, parsed)
    }
  }
}

/**
 * Route a top-level ARROW-CONST helper (`const dbl = (x: number) => x * 2`,
 * `export const dbl = …`) into `ctx.helperFns` so it emits as a native `func`
 * / `fun`, the same as a `function dbl(){}` helper. Returns `true` when it
 * routed the node (the caller then `continue`s, so it does NOT also become a
 * `private let` moduleDecl). A HELPER is a function OF ITS INPUTS: it takes
 * value parameters and its body returns NO JSX. Falls through (returns `false`,
 * UNCHANGED behavior) for:
 *   - a JSX-returning arrow (an arrow-const COMPONENT — a separate, pre-existing
 *     gap; not a helper);
 *   - a NO-param arrow (the const-thunk / component-returning-value shape);
 *   - a non-arrow const (`const APP = '1.0'` — a real module binding);
 *   - a multi-declarator const (`const a = …, b = …` — left as moduleDecls).
 */
function tryHelperFnFromArrowConst(node: AnyNode, ctx: ParseCtx): boolean {
  let varDecl: AnyNode | null = null
  if (node.type === 'VariableDeclaration' && node.kind === 'const') {
    varDecl = node
  } else if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration' &&
    node.declaration.kind === 'const'
  ) {
    varDecl = node.declaration
  }
  if (!varDecl) return false
  const declarators = (varDecl.declarations as AnyNode[] | undefined) ?? []
  // Only the single-declarator shape is routed — a multi-declarator const
  // stays a moduleDecl (unchanged).
  if (declarators.length !== 1) return false
  const d = declarators[0]!
  if (d.id?.type !== 'Identifier') return false
  const arrow = d.init as AnyNode | undefined
  if (arrow?.type !== 'ArrowFunctionExpression') return false
  // A helper takes value parameters. A no-param arrow is not routed.
  if (((arrow.params as AnyNode[] | undefined)?.length ?? 0) === 0) return false
  const decl = tryFunctionDecl(d.id.name as string, arrow, ctx)
  if (!decl || decl.kind !== 'function') return false
  // A COMPONENT arrow returns JSX (directly or through a conditional root) —
  // NOT a helper. If ANY top-level return in the body resolves to JSX, leave it.
  const topLevelReturns = decl.body.filter(
    (s): s is Extract<StatementIR, { kind: 'return' }> => s.kind === 'return',
  )
  if (topLevelReturns.length === 0) return false // void body — not a clear helper
  if (topLevelReturns.some((r) => r.expr !== undefined && returnContainsJsx(r.expr))) {
    return false
  }
  ctx.helperFns.push(decl)
  return true
}

/**
 * Statement types that appear at a component-body top level but carry no
 * emittable runtime effect — type-only declarations + true no-ops. These
 * stay SILENT (no warning). Everything else the component-body walker
 * doesn't explicitly lower gets a named "dropped" warning (zero-silent-
 * drop — see the catch-all in `tryComponentFromTopLevel`).
 */
const SILENTLY_OK_COMPONENT_STMT_TYPES = new Set([
  'EmptyStatement',
  'DebuggerStatement',
  'ImportDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
  'TSDeclareFunction',
])

/** A human keyword for a dropped statement type, for the diagnostic. */
function componentStmtKeyword(type: string): string {
  switch (type) {
    case 'ForStatement':
    case 'ForOfStatement':
    case 'ForInStatement':
      return 'for'
    case 'WhileStatement':
      return 'while'
    case 'DoWhileStatement':
      return 'do…while'
    case 'SwitchStatement':
      return 'switch'
    case 'IfStatement':
      return 'if'
    case 'TryStatement':
      return 'try'
    case 'ThrowStatement':
      return 'throw'
    case 'LabeledStatement':
      return 'labeled'
    case 'BlockStatement':
      return 'block'
    default:
      return type
  }
}

/** A branch that is exactly `return <JSX>` (directly, or a one-statement block
 *  wrapping it) → its parsed JSX expr; else null. */
function jsxReturnBranch(branch: AnyNode | undefined, ctx: ParseCtx): ExprIR | null {
  let ret: AnyNode | null = null
  if (branch?.type === 'ReturnStatement') {
    ret = branch
  } else if (branch?.type === 'BlockStatement') {
    const stmts = (branch.body as AnyNode[] | undefined) ?? []
    if (stmts.length === 1 && stmts[0]?.type === 'ReturnStatement') ret = stmts[0]!
  }
  if (!ret?.argument) return null
  const expr = parseExpr(ret.argument, ctx)
  // Conditional RENDERING only — the branch must resolve to JSX. An imperative
  // value early-return (`if (x) return 0`) is a different, unsupported shape.
  return returnContainsJsx(expr) ? expr : null
}

/**
 * Detect an EARLY-RETURN conditional render — `if (cond) return <A>` (the
 * consequent is a single `return <jsx>`, directly or in a one-statement
 * block), with an OPTIONAL `else return <B>` — the ubiquitous
 * conditional-rendering pattern. Returns the branches so the component walker
 * can FOLD them into a ternary return (`cond ? <A> : <B>`), which the emitter
 * already lowers to a result-builder `if`/`else` view. Returns null for any
 * other `if` shape (decls in the branch, an imperative / non-JSX return) —
 * those keep the NAMED "dropped" warning, because imperative control flow
 * can't sit in a SwiftUI `var body` result builder (`swiftc`: "closure
 * containing control flow statement cannot be used with result builder
 * 'ViewBuilder'"), only a conditional VIEW can.
 */
function tryEarlyReturnConditional(
  ifStmt: AnyNode,
  ctx: ParseCtx,
): { cond: ExprIR; thenExpr: ExprIR; elseExpr?: ExprIR } | null {
  const thenExpr = jsxReturnBranch(ifStmt.consequent as AnyNode | undefined, ctx)
  if (!thenExpr) return null
  const cond = parseExpr(ifStmt.test, ctx)
  // `if (c) return <A> else return <B>` — a self-contained conditional (both
  // branches render). Without an else it's an early return: the subsequent
  // top-level return is the fallthrough branch.
  if (ifStmt.alternate) {
    const elseExpr = jsxReturnBranch(ifStmt.alternate as AnyNode, ctx)
    // An `else` that ISN'T a clean JSX return (decls / imperative) → not a
    // pure conditional render; fall through to the warning.
    if (!elseExpr) return null
    return { cond, thenExpr, elseExpr }
  }
  return { cond, thenExpr }
}

/** Extract a component from `export function NAME(...) { ... }`. */
function tryComponentFromTopLevel(node: AnyNode, ctx: ParseCtx): ComponentIR | null {
  // Walk through `ExportNamedDeclaration` → `FunctionDeclaration`.
  let fn: AnyNode | null = null
  if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
    fn = node.declaration
  } else if (node.type === 'FunctionDeclaration') {
    fn = node
  }
  if (!fn || !fn.id?.name) return null

  const name = fn.id.name as string
  const body = fn.body?.body as AnyNode[] | undefined
  if (!body) return null

  // Parse props from the first parameter when it carries an object type
  // annotation. Other parameter shapes (no params, no type annotation,
  // destructured params) are tolerated but produce no props — the body's
  // member accesses on the param name still rewrite cleanly if the name
  // is captured.
  const { props, propsParamName } = parseProps(fn.params as AnyNode[] | undefined, ctx)

  // Round-3 audit fix: an untyped `props` parameter (no `: { … }`
  // annotation) means `props` array stays empty. Member rewrites for
  // `props.X` references inside the body silently fail — the rewriter
  // doesn't know which props exist and which type each has. The
  // typecheck stays green on the TS side (TS accepts `function App(props)`
  // as `props: any`), but native emit produces unbound references that
  // `swiftc` / `kotlinc` reject with cryptic errors. Surface it loud at
  // the parser layer so the diagnostic names the component. Skips
  // bodies that never reference the param (legitimate no-props shape).
  warnIfUntypedPropsParam(name, fn.params as AnyNode[] | undefined, propsParamName, body, ctx)

  const decls: DeclIR[] = []
  let returnExpr: ExprIR | null = null
  // Dropped-statement warnings are DEFERRED: this same walker runs for a
  // param-taking HELPER (`function clamp(x) { if (…) … }`), whose control
  // flow DOES lower via the helper path (see the carve-out below) — so we
  // only emit these once the function is confirmed a genuine component
  // (right before the component return), never for a helper.
  const droppedStmtWarnings: string[] = []
  // Early-return conditional renders (`if (cond) return <JSX>`) collected in
  // source order — folded into a nested ternary at the final return.
  const pendingConditionals: { cond: ExprIR; thenExpr: ExprIR }[] = []
  // Wrap `base` in the collected early-return conditionals, innermost-last:
  // `if a return A; if b return B; return C` → `a ? A : (b ? B : C)`.
  const foldPending = (base: ExprIR): ExprIR => {
    let re = base
    for (let i = pendingConditionals.length - 1; i >= 0; i--) {
      const pc = pendingConditionals[i]!
      re = { kind: 'ternary', cond: pc.cond, then: pc.thenExpr, otherwise: re }
    }
    pendingConditionals.length = 0
    return re
  }

  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration') {
      for (const declarator of stmt.declarations as AnyNode[]) {
        const decl = tryDeclFromVarDeclarator(declarator, ctx)
        if (decl) decls.push(decl)
      }
    } else if (stmt.type === 'FunctionDeclaration' && stmt.id?.name) {
      // Round-1 audit fix: previously the body walker only handled
      // `const fn = () => …`. The function-declaration form
      // `function del() {}` was silently dropped — the decl never
      // landed in `_functionNames`, so later `del()` calls in event
      // handlers emitted as `{ del }` (closure RETURNING the function
      // reference) instead of `{ del() }`. Same shape, same emit,
      // same fix as the const-arrow form via tryFunctionDecl (which
      // already accepts both shapes since FunctionDeclaration carries
      // the same `.params` / `.returnType` / `.body` API).
      const fnName = stmt.id.name as string
      const decl = tryFunctionDecl(fnName, stmt, ctx)
      if (decl) decls.push(decl)
    } else if (stmt.type === 'ReturnStatement' && stmt.argument) {
      // Fold any early-return conditionals collected before this final return
      // into a nested ternary the emitter lowers to a result-builder view.
      returnExpr = foldPending(parseExpr(stmt.argument, ctx))
    } else if (stmt.type === 'ExpressionStatement') {
      // A bare component-body statement. `onMount(fn)` — the documented
      // lifecycle escape hatch — LOWERS to a mount-time harness decl.
      // Everything else (bare `effect(...)`, stray calls) gets a NAMED
      // warning: pre-fix ANY expression statement fell through this walker
      // silently, so the documented `onMount(() => ws.connect())` pattern
      // compiled clean and did NOTHING on device.
      const call = stmt.expression as AnyNode
      if (
        call?.type === 'CallExpression' &&
        call.callee?.type === 'Identifier' &&
        call.callee.name === 'onMount' &&
        call.arguments?.length === 1 &&
        (call.arguments[0]?.type === 'ArrowFunctionExpression' ||
          call.arguments[0]?.type === 'FunctionExpression')
      ) {
        const cb = call.arguments[0] as AnyNode
        let bodyStmts: StatementIR[]
        if (cb.body?.type === 'BlockStatement') {
          bodyStmts = parseStatementBlock(cb.body, ctx)
        } else {
          bodyStmts = [{ kind: 'expr', expr: parseExpr(cb.body, ctx) }]
        }
        // A returned CLEANUP fn (onMount's unmount contract) is not emitted
        // in v1 — strip it (a bare `return <closure>` inside .onAppear /
        // LaunchedEffect would be a type error) + warn NAMED.
        const kept = bodyStmts.filter((st) => {
          const isCleanupReturn =
            st.kind === 'return' && st.expr !== undefined && st.expr.kind === 'arrow'
          if (isCleanupReturn) {
            ctx.warnings.push(
              `Component ${name}: onMount returned a cleanup function — unmount cleanup is not emitted natively yet (the mount body IS). Move teardown to the host, or track the follow-up.`,
            )
          }
          return !isCleanupReturn
        })
        decls.push({ kind: 'on-mount', body: kept })
      } else if (call?.type === 'CallExpression') {
        // A bare CALL statement (`effect(...)`, a stray side-effecting
        // call) has no native lowering — dropped + NAMED warning, so the
        // documented `onMount(() => …)` pattern written as a bare call
        // doesn't silently do nothing on device. A NON-call expression
        // statement (`void x` reference no-ops, unary/logical discards —
        // common in fixtures to mark values used) carries no side effect
        // and is silently dropped, exactly as before this walker existed:
        // warning on it was an over-eager regression (rx-full's 20 `void`
        // refs). Only genuine calls warn.
        const callee =
          call.callee?.type === 'Identifier' ? `${call.callee.name}(...)` : 'a call'
        ctx.warnings.push(
          `Component ${name}: a bare component-body statement (${callee}) is not lowered natively and was DROPPED — only declarations, onMount(fn), and the return JSX run on native. Move side effects into onMount or a handler.`,
        )
      } else if (
        call?.type === 'AssignmentExpression' ||        call?.type === 'UpdateExpression'
      ) {
        // A top-level REASSIGNMENT (`a = 5`, `a += 2`, `a++`) has a real
        // mutating effect, but the component body emits only declarations +
        // the return JSX — components run ONCE, and threading a setup-time
        // statement into the SwiftUI `var body` / Compose fn body needs a
        // ComponentIR body-statement field (a larger change). So it was
        // silently dropped here (it's an ExpressionStatement whose expression
        // is NOT a CallExpression, so it fell past the call branch above into
        // the intentional no-op drop meant for harmless `void x` discards) —
        // a SEMANTIC drop: the reassignment vanished and the render used the
        // initial value. NAMED-warn so it's never silent. (`void x` / unary /
        // logical discards stay silent — they carry no effect; only genuine
        // reassignments warn.)
        ctx.warnings.push(
          `Component ${name}: a top-level reassignment isn't emitted on native (PMTC) — a component body emits declarations + the return JSX, not setup-time statements. Compute the final value directly (\`const x = …\`) or use a signal.`,
        )
      }
    } else if (stmt.type === 'IfStatement') {
      // Early-return conditional render — the ONE control-flow shape a result
      // builder accepts (as a conditional VIEW). `if (c) return <A> else
      // return <B>` folds now (self-contained); `if (c) return <A>` collects,
      // and the subsequent top-level return supplies the else branch.
      const c = tryEarlyReturnConditional(stmt, ctx)
      if (c && c.elseExpr !== undefined) {
        returnExpr = foldPending({
          kind: 'ternary',
          cond: c.cond,
          then: c.thenExpr,
          otherwise: c.elseExpr,
        })
      } else if (c) {
        pendingConditionals.push({ cond: c.cond, thenExpr: c.thenExpr })
      } else {
        // A non-conditional-render `if` (decls in a branch, imperative body, an
        // `else` that isn't a JSX return) has no result-builder lowering —
        // keep the deferred NAMED "dropped" warning.
        droppedStmtWarnings.push(
          `Component ${name}: a top-level \`if\` statement has no native lowering and was DROPPED — an early-return conditional render (\`if (cond) return <JSX>\`, optionally \`else return <JSX>\`) DOES lower to a native conditional view, but other \`if\` shapes (imperative body, decls in the branch) don't. Render conditionally in JSX (a ternary / \`<Show>\`), or move the logic into a helper.`,
        )
      }
    } else if (!SILENTLY_OK_COMPONENT_STMT_TYPES.has(stmt.type)) {
      // ZERO-SILENT-DROP catch-all. Any statement type the walker above
      // doesn't lower — control flow (`for` / `for…of` / `for…in` /
      // `while` / `do…while` / `switch` / labeled), plus `if` / `try` /
      // `throw` / a bare block — previously VANISHED from the emit with
      // NO diagnostic: the loop/branch never ran on device and the render
      // used stale values (the exact trust hole the "zero silent failures"
      // pass targets). A component body emits declarations + the return
      // JSX (it runs ONCE); imperative control flow has no body-statement
      // slot yet — but `parseStatement` DOES lower loops/switch inside a
      // helper-function / store-method body, so the guidance points there.
      // Type-only decls + true no-ops (see the allowlist) stay silent.
      // DEFERRED (see droppedStmtWarnings) so a param-taking helper whose
      // body lowers this exact statement doesn't warn spuriously.
      droppedStmtWarnings.push(
        `Component ${name}: a top-level \`${componentStmtKeyword(stmt.type)}\` statement has no native lowering and was DROPPED — a component body emits declarations + the return JSX, not imperative control flow. Move loops/switch into a helper function that takes parameters (they DO lower there) and call it, compute values with array methods (\`.map\`/\`.reduce\`/\`.filter\`), or render conditionally/iteratively in JSX (\`<Show>\` / \`<For>\`).`,
      )
    }
  }

  if (returnExpr === null) {
    ctx.warnings.push(`Component ${name}: no return statement found; skipping.`)
    return null
  }

  // A top-level function that takes VALUE PARAMETERS and returns a NON-JSX
  // value is a pure-logic HELPER (`function dbl(x: number) { return x * 2 }`,
  // a generic `function first<T>(xs: T[]): T`), NOT a UI component. But
  // tryComponentFromTopLevel runs for EVERY top-level FunctionDeclaration with
  // no "is this a component?" gate — so such a helper was misclassified as a
  // component and emitted as a broken `struct dbl: View { x * 2 }` (its value
  // params dropped, the body referencing an unbound name) with NO warning — a
  // SILENT mis-emit that swiftc/kotlinc reject with a cryptic `cannot find 'x'
  // in scope`. PMTC now EMITS a non-generic helper at file scope (Swift `func`
  // / Kotlin `fun`, via the same `DeclIR{kind:'function'}` shape store methods
  // use) instead of skipping it — the fundamentally-correct fix. A GENERIC
  // helper still NAMED-warns (the IR can't represent `<T>`).
  //
  // The gate is deliberately NARROW — a HELPER is a function OF ITS INPUTS:
  //   (1) it takes >=1 parameter, and `props.length === 0` (those params are
  //       NOT component props — a real component's props param is object-typed
  //       / destructured, so parseProps would have populated `props`); AND
  //   (2) its return resolves to NO JSX (recursed through ternary / `&&` /
  //       `||` / `??` / parens so a `cond ? <A/> : <B/>` conditional-root
  //       COMPONENT is never misread as a helper).
  // The value-parameter requirement is what keeps a NO-PARAM function that
  // returns a value — `function C() { const out = computed(…); return out }`,
  // the ubiquitous test-harness / component-returning-a-value shape — OUT of
  // the warning (it emits unchanged). A no-param helper / hook is a deliberate
  // false-negative (rarer, and indistinguishable from that harness shape).
  // NOTE `propsParamName` is deliberately NOT checked: parseProps sets it to
  // the bare param NAME even for a value param (`function dbl(x: number)` →
  // `propsParamName: 'x'`), so gating on it would wrongly exclude every real
  // helper. `props.length === 0` is the sound "not a props component" signal.
  const hasValueParams =
    ((fn.params as AnyNode[] | undefined)?.length ?? 0) > 0 && props.length === 0
  if (hasValueParams && !returnContainsJsx(returnExpr)) {
    // A GENERIC helper (`function first<T>(xs: T[]): T`) can NOT be emitted:
    // the IR has no generic-parameter representation, so a referenced `T`
    // degrades to `unknown` and the emitted signature is uncompilable. Keep
    // it a NAMED warning (the #2090 behavior for the shape helper-emission
    // doesn't yet cover).
    const isGeneric =
      ((fn.typeParameters?.params as AnyNode[] | undefined)?.length ?? 0) > 0
    if (isGeneric) {
      ctx.warnings.push(
        `${name} looks like a GENERIC helper function — PMTC now emits non-generic top-level helper functions natively (Swift \`func\` / Kotlin \`fun\`), but generic type parameters aren't representable in the native IR yet, so \`${name}\` was skipped rather than mis-emitted with unresolved \`${'<T>'}\` types. Drop the generic, or inline the logic into the component that uses it.`,
      )
      return null
    }
    // A non-generic pure-logic helper: parse it into the same
    // `DeclIR{kind:'function'}` shape store methods use and collect it — the
    // parse return threads `helperFns` to both emitters, which emit it at file
    // scope via the reusable `emitSwiftFunction` / `emitKotlinFunction`. This
    // REPLACES the #2090 warn+skip: the silent-mis-emit-as-broken-view is now
    // a faithful native `func`/`fun`. (`number` params map to `Int` — TS has
    // no `Double` type + no param-level fractional refinement — so an
    // integer-literal call site needs no Kotlin numeric coercion.)
    const decl = tryFunctionDecl(name, fn, ctx)
    if (decl && decl.kind === 'function') {
      // Collect every non-generic helper. Two shapes previously deferred here
      // are now HANDLED downstream, so there is no per-collect gate:
      //   - a missing return annotation → `refineHelperReturns` infers the
      //     return type from the body (drops the annotation requirement);
      //   - a FRACTIONAL body (`x * 1.5`, `x / 2`, `Math.sqrt`) → the emitter
      //     now seeds the helper's Int params into the coercion ctx so the body
      //     coerces (`Double(x) * 1.5`) AND `refineHelperReturns` refines the
      //     `number` return to `Double`, so the signature matches (proven on
      //     both toolchains). Kotlin auto-promotes Int×Double, needing only the
      //     Double return. A genuinely-un-inferable body is warned + dropped by
      //     `refineHelperReturns`.
      ctx.helperFns.push(decl)
    }
    return null
  }

  // Confirmed a genuine component (past the helper carve-out) — NOW emit the
  // deferred dropped-control-flow warnings.
  for (const w of droppedStmtWarnings) ctx.warnings.push(w)

  return { name, props, propsParamName, decls, returnExpr }
}

/**
 * Does an expression contain JSX — directly, or nested through a
 * ternary / `&&` / `||` / `??` / parens? A Pyreon component's return
 * expression always resolves to JSX; a pure-logic helper's never does. Used
 * to discriminate a top-level helper function from a component so the helper
 * isn't misclassified and mis-emitted as a broken view struct. Conservative:
 * any unrecognized expression kind returns `false` (treated as no-JSX) — but
 * every JSX-bearing component-return shape in the native subset (bare element,
 * fragment, conditional root) IS recognized, so a real component can never be
 * misclassified as a helper.
 */
function returnContainsJsx(expr: ExprIR): boolean {
  switch (expr.kind) {
    case 'jsx-element':
    case 'jsx-fragment':
      return true
    case 'paren':
      return returnContainsJsx(expr.inner)
    case 'ternary':
      return returnContainsJsx(expr.then) || returnContainsJsx(expr.otherwise)
    case 'logical':
      return returnContainsJsx(expr.left) || returnContainsJsx(expr.right)
    default:
      return false
  }
}

/**
 * Shape-A follow-up (B): infer the return type of any collected helper function
 * that was declared WITHOUT an explicit `: T` annotation (`returnType: unknown`),
 * so it can be emitted natively — dropping the v1 annotation requirement.
 *
 * Uses `inferReturnType` (the same util `emitSwiftFunction` / `emitKotlinFunction`
 * already use for un-annotated function signatures) against a ctx carrying the
 * module's declared struct field types (a helper param/return can reference a
 * `type X = { … }`). Seeds the helper's params as locals, walks the body for the
 * first `return`, infers that expr's type, and SETS `h.returnType` — so BOTH the
 * emit signature AND the call-site `helperReturns` registry (built from
 * `helperFns[].returnType`) get the real type.
 *
 * A body whose type still can't be determined (a void body, a destructured-param
 * member read `inferReturnType` can't resolve, an exotic shape) keeps a NAMED
 * warning and is DROPPED from `helperFns` — never a signature-less broken `func`,
 * so this can only ever ADD coverage, never regress. Mutates `helperFns` in place
 * (splices the un-inferable ones); iterates in reverse so the splice is safe.
 */
function refineHelperReturns(
  helperFns: Extract<DeclIR, { kind: 'function' }>[],
  structs: StructIR[],
  warnings: string[],
): void {
  if (helperFns.length === 0) return
  // Structs available so a typed-struct param / return resolves; no
  // signals/computeds (a pure helper reads only its own params).
  const ctx = buildInferenceCtx([], [], structs)
  for (let i = helperFns.length - 1; i >= 0; i--) {
    const h = helperFns[i]!
    // Infer from the body when the return is UNKNOWN (no annotation), OR when
    // it's `number` — a `: number` annotation maps to `Int`, but a FRACTIONAL
    // body (`x * 1.5`, `x / 2`, `Math.sqrt`) actually returns `Double`, so the
    // Int annotation is wrong. Re-inferring a number-typed return refines it
    // Int↔Double from the body so the emitted signature matches the (now
    // Int×Double-coerced) body. A non-number annotation (string/boolean/struct)
    // is unambiguous → kept as-is.
    if (h.returnType.kind !== 'unknown' && h.returnType.kind !== 'number') continue
    const inferred = inferReturnType(h.params, h.body, ctx)
    if (inferred.kind === 'unknown') {
      if (h.returnType.kind === 'number') continue // keep the `number` annotation
      warnings.push(
        `${h.name} is a top-level helper function whose return type couldn't be inferred from its body — add an explicit return-type annotation (e.g. \`function ${h.name}(…): number\`), or inline the logic into the component. Skipped rather than mis-emitted.`,
      )
      helperFns.splice(i, 1)
    } else {
      h.returnType = inferred
    }
  }
}

/** Parse the function's first parameter as Pyreon props (object type or interface). */
function parseProps(
  params: AnyNode[] | undefined,
  ctx: ParseCtx,
): { props: import('./types').PropIR[]; propsParamName: string | undefined } {
  if (!params || params.length === 0) return { props: [], propsParamName: undefined }
  const firstParam = params[0]
  // Destructured-props shape: `function Row({ label, count }: { label:
  // string; count: number })` — the dominant real-component signature.
  // The destructured keys ARE the prop names; the body references them BARE
  // (`label`, not `props.label`), and the emit already creates one struct
  // field (Swift) / param (Compose) per prop — so a bare `label` reference
  // resolves to the field/param with NO rewrite. We just enumerate the props
  // from the type annotation; propsParamName stays undefined (nothing to
  // strip). Only the simple no-rename shape maps cleanly — a rename
  // (`{ label: lbl }`) would need aliasing → bail to the empty/unsupported
  // path (warns elsewhere), never half-binding.
  if (firstParam?.type === 'ObjectPattern') {
    const annot = firstParam.typeAnnotation?.typeAnnotation as AnyNode | undefined
    if (!annot) return { props: [], propsParamName: undefined }
    const t = resolvePropsObjectType(parseTypeAnnotation(annot, ctx), ctx)
    if (t.kind !== 'object') return { props: [], propsParamName: undefined }
    const properties = (firstParam.properties as AnyNode[] | undefined) ?? []
    const allSimpleNoRename =
      properties.length > 0 &&
      properties.every(
        (p) =>
          p?.type === 'Property' &&
          p.key?.type === 'Identifier' &&
          p.value?.type === 'Identifier' &&
          (p.key.name as string) === (p.value.name as string),
      )
    if (!allSimpleNoRename) return { props: [], propsParamName: undefined }
    return {
      props: t.fields.map((f) => ({ name: f.name, type: f.type })),
      propsParamName: undefined,
    }
  }
  // Identifier-with-annotation shape: `(props: { … })` — the annotation
  // is on `firstParam.typeAnnotation.typeAnnotation`.
  if (firstParam?.type !== 'Identifier') return { props: [], propsParamName: undefined }
  const paramName = firstParam.name as string
  const annotation = firstParam.typeAnnotation?.typeAnnotation as AnyNode | undefined
  if (!annotation) return { props: [], propsParamName: paramName }

  const objType = resolvePropsObjectType(parseTypeAnnotation(annotation, ctx), ctx)
  if (objType.kind !== 'object') {
    // Non-object type (a `props: string` edge case — the unresolvable
    // typeRef already warned inside resolvePropsObjectType). Track the
    // binding name so member rewrites still structurally work; props
    // list stays empty.
    return { props: [], propsParamName: paramName }
  }
  return {
    props: objType.fields.map((f) => ({ name: f.name, type: f.type })),
    propsParamName: paramName,
  }
}

/**
 * Resolve a NAMED props annotation (`props: CardProps`) to its
 * locally-declared object type via the `collectObjectTypeAliases`
 * pre-pass registry. An UNRESOLVABLE generic-free typeRef (an IMPORTED
 * type, an interface) warns LOUDLY: with empty props the emitted
 * component declares NO stored properties / parameters while its body
 * references them bare and call sites pass args — uncompilable on BOTH
 * targets, previously with no warning (the pre-fix behavior for every
 * named props type, the dominant real-world component shape). Any other
 * TypeIR passes through unchanged.
 */
function resolvePropsObjectType(t: TypeIR, ctx: ParseCtx): TypeIR {
  if (t.kind === 'typeRef' && t.args.length === 0) {
    const resolved = ctx.objectTypeAliases.get(t.name)
    if (resolved !== undefined) return resolved
    ctx.warnings.push(
      `Component props type \`${t.name}\` can't be resolved — PMTC only resolves an object-shape \`type ${t.name} = { … }\` declared in the SAME file (imports and interfaces aren't followed). The emitted component would reference undeclared properties and fail the native build. Declare the alias locally or inline the annotation (\`props: { … }\`).`,
    )
  }
  return t
}

/**
 * Round-3 audit fix: warn when a component declares a `props` parameter
 * without a type annotation. The parser captures `propsParamName` so
 * `props.X` member rewrites STRUCTURALLY work, but with no fields
 * extracted from the (missing) annotation the rewriter silently drops
 * everything — `props.title` references compile to unbound identifiers
 * on the native side.
 *
 * Fires only when:
 *   - the first param IS named `props` (or any identifier) — the
 *     conventional component shape; destructured params would already
 *     bail earlier and need a different fix
 *   - there's NO type annotation on the parameter
 *   - the parser captured the parameter name (so the omission isn't an
 *     unrelated bail like "no params")
 *   - the body actually references `<paramName>.X` somewhere reachable
 *     (closure / event handler / JSX expression — all count). A
 *     component with NO `props.X` reference at all is the legitimate
 *     no-props shape; warning there would be a false positive.
 *
 * Body scan: stack-based walker (no recursion) iterating every node's
 * own properties for any `MemberExpression` whose `object` is an
 * `Identifier` matching the param. TS type-only layers (`as any`,
 * `satisfies T`, `!`, parens) wrap the props identifier but their
 * inner `MemberExpression.object` still resolves to the same
 * Identifier — the walker hits them transparently because it descends
 * into every child property. A literal `(props as any).whatever`
 * therefore DOES fire (the silent-drop problem is identical when the
 * field name can't be enumerated against an annotation).
 */
function warnIfUntypedPropsParam(
  componentName: string,
  params: AnyNode[] | undefined,
  propsParamName: string | undefined,
  body: AnyNode[] | undefined,
  ctx: ParseCtx,
): void {
  if (!params || params.length === 0 || !propsParamName) return
  const firstParam = params[0]
  if (firstParam?.type !== 'Identifier') return
  // Annotated → handled by parseProps. Only the no-annotation shape is
  // the silent-drop case we warn about here.
  if (firstParam.typeAnnotation) return
  // Body never references `<propsParamName>.X` → legitimate no-props
  // shape, suppress the warning.
  if (!body || !bodyReferencesPropsParam(body, propsParamName)) return
  ctx.warnings.push(
    `Component ${componentName} has an untyped \`${propsParamName}\` parameter — type-annotate it (e.g. \`function ${componentName}(${propsParamName}: { title: string })\`) so PMTC can rewrite \`${propsParamName}.X\` references. Without the annotation, the parser cannot enumerate fields and member accesses silently drop.`,
  )
}

/**
 * Stack-based walker over a function body. Returns true if any
 * `MemberExpression` exists whose `object` (after unwrapping TS
 * type-only layers + parens) is an `Identifier` with name === paramName.
 * Descends into every child property regardless of node type —
 * closures, JSX expressions, conditionals all count as "reachable" by
 * design: the rewriter would emit unbound references for `props.X`
 * inside any of them. No new dep; uses a worklist to avoid recursion.
 *
 * Unwrap shapes recognised at the MemberExpression's object slot:
 *   - `ParenthesizedExpression` (`(props).x`)
 *   - `TSAsExpression`          (`(props as any).x` — common escape hatch)
 *   - `TSSatisfiesExpression`   (`(props satisfies X).x`)
 *   - `TSNonNullExpression`     (`props!.x`)
 *   - `TSTypeAssertion`         (`(<any>props).x` — legacy form)
 * Each layer carries its inner expression on `.expression`. Composes:
 * `((props as any) satisfies Y).x` reaches the bare `Identifier`.
 */
function bodyReferencesPropsParam(body: AnyNode[], paramName: string): boolean {
  const worklist: AnyNode[] = [...body]
  while (worklist.length > 0) {
    const node = worklist.pop()
    if (!node || typeof node !== 'object') continue
    if (node.type === 'MemberExpression') {
      const root = unwrapTypeLayers(node.object)
      if (root?.type === 'Identifier' && root.name === paramName) {
        return true
      }
    }
    // Push every child node value onto the worklist. AST nodes carry
    // their children in own enumerable properties — arrays of nodes
    // (e.g. `body`, `arguments`, `params`) AND single-node properties
    // (e.g. `object`, `argument`, `expression`). Primitive values
    // (strings, numbers, booleans) are skipped by the typeof guard at
    // the top of the loop.
    for (const key in node) {
      // Skip the `type` discriminator + oxc's position fields — none
      // carry child AST nodes, and skipping them saves work.
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') {
        continue
      }
      const value = node[key]
      if (Array.isArray(value)) {
        for (const item of value) worklist.push(item)
      } else if (value && typeof value === 'object') {
        worklist.push(value)
      }
    }
  }
  return false
}

/** Strip TS type-only wrappers + parens to reach the underlying expression. */
function unwrapTypeLayers(node: AnyNode | undefined): AnyNode | undefined {
  let current = node
  while (
    current &&
    (current.type === 'ParenthesizedExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSTypeAssertion')
  ) {
    current = current.expression
  }
  return current
}

/** Try to extract a signal / computed / function declaration from a `const x = …`. */
function tryDeclFromVarDeclarator(node: AnyNode, ctx: ParseCtx): DeclIR | null {
  const init = node.init as AnyNode | undefined
  // Hook-result destructure LOWERING — the most idiomatic native data gap.
  // `const { data, isPending } = useFetch(url)` lowers to a synthetic
  // single-binding container `const __pyHookN = useFetch(url)` (parsed via
  // the SAME single-binding path, by recursion) + one field alias per
  // destructured key, so each local rewrites to `__pyHookN.<key>` at its use
  // sites (parseExpr's Identifier case, mirroring `storeAliases`). The emit
  // is BYTE-IDENTICAL to the supported single-binding shape, and the user
  // keeps the call form — accessor fields (`data()`) vs plain (`isPending`) —
  // because the alias is a transparent `container.field` member, not an
  // auto-called read.
  //
  // Faithful + non-regressing by construction: a hook whose single-binding
  // form produces NO container (e.g. `useSecureStorage`, which warns + drops)
  // recurses to `null` and FALLS THROUGH to the warn-drop below — so this can
  // only make destructure work where single-binding already works, never
  // worse. Rest elements (`{ data, ...rest }`) and nested patterns
  // (`{ user: { id } }`) also fall through to warn-drop in v1 (no
  // half-lowered binding). `useParams` / `useLoaderData` are NOT in this set:
  // useParams has its own per-key lowering below; useLoaderData destructure
  // stays warn-drop (its read returns an opaque `T` with no field shape to
  // alias).
  const DESTRUCTURE_CONTAINER_HOOKS = new Set([
    'useFetch',
    'useQuery',
    'useForm',
    'useClipboard',
    'useStorage',
    'usePermissions',
    'useOnline',
    'useAppState',
    'useCrashReporter',
    'useColorScheme',
    'useSizeClass',
    'useNetworkStatus',
    'useGeolocation',
    'useWebSocket',
    'useSecureStorage',
    'useDatabase',
    'usePush',
    'usePayments',
    'useMap',
    'useAuth',
  ])
  if (
    node.id?.type === 'ObjectPattern' &&
    init?.type === 'CallExpression' &&
    typeof init.callee?.name === 'string' &&
    DESTRUCTURE_CONTAINER_HOOKS.has(init.callee.name as string)
  ) {
    const hook = init.callee.name as string
    const props = (node.id.properties as AnyNode[] | undefined) ?? []
    // v1 only lowers all-simple destructures: every entry a plain
    // `{ key }` or renamed `{ key: local }`. A RestElement or a nested
    // pattern (value not an Identifier) bails the WHOLE lowering so we
    // never half-bind.
    const allSimple =
      props.length > 0 &&
      props.every(
        (p) =>
          p?.type === 'Property' &&
          p.key?.type === 'Identifier' &&
          p.value?.type === 'Identifier',
      )
    if (allSimple) {
      // Recurse with an Identifier id to reach the normal hook dispatch
      // (every ObjectPattern block above is skipped for an Identifier id),
      // producing e.g. a `fetch` / `geolocation` / `auth` DeclIR named
      // __pyHookN. No parse-side name registration to duplicate — the
      // container hooks track names at EMIT time off the decl list.
      const synthName = `__pyHook${ctx.hookDestructureCounter}`
      const synthNode = {
        ...node,
        id: { type: 'Identifier', name: synthName },
      } as AnyNode
      const containerDecl = tryDeclFromVarDeclarator(synthNode, ctx)
      if (containerDecl) {
        ctx.hookDestructureCounter += 1
        for (const prop of props) {
          const key = (prop as AnyNode).key?.name as string
          const local = (prop as AnyNode).value?.name as string
          ctx.hookFieldAliases.set(local, { object: synthName, field: key })
        }
        return containerDecl
      }
      // containerDecl null → the hook has no single-binding container
      // (e.g. useSecureStorage). Fall through to the warn-drop below.
    }
    ctx.warnings.push(
      `${hook}() destructure form (\`const { … } = ${hook}(...)\`) was not lowered on native — either the hook has no single-binding container, or the pattern uses a rest element / nested binding (not yet supported). Use the single-binding shape \`const x = ${hook}(...); x.field\` (e.g. \`const q = useFetch(url); q.data()\` / \`q.isPending\`) instead. Tracked as a follow-up.`,
    )
    return null
  }
  // Store-aliasing LOWERING — `const app = useApp()` (binding a
  // `defineStore` hook result to a local) is now SUPPORTED on native by
  // recording the alias (`app` → `useApp`) and substituting it back to a
  // `useApp()` call at every use site in `parseExpr` (Identifier case).
  // So `app.store.x` lowers to exactly the same IR as the inline
  // `useApp().store.x` — emit unchanged. The decl itself produces nothing
  // (the alias is the binding); return null so no DeclIR is emitted for
  // it. `useApp` is matched against the pre-scanned `storeHookNames` so
  // this fires regardless of declaration order. Safe by construction:
  // only `const <id> = <storeHook>()` shapes (which produced an unbound
  // `Unresolved reference` BEFORE this lowering) ever record an alias, so
  // no previously-compiling code can change behavior; inline
  // `useApp().store.x` has no var binding so it's untouched, and the
  // top-level store DEFINITION is `continue`d before reaching here.
  if (
    node.id?.type === 'Identifier' &&
    init?.type === 'CallExpression' &&
    init.callee?.type === 'Identifier' &&
    typeof init.callee.name === 'string' &&
    ctx.storeHookNames.has(init.callee.name as string)
  ) {
    ctx.storeAliases.set(node.id.name as string, init.callee.name as string)
    return null
  }
  // DESTRUCTURING the api (`const { store } = useApp()`) is valid web code —
  // `defineStore` returns `() => StoreApi<T>` and `store` is a real property —
  // but it lowered to nothing, so `store.x` emitted an unbound `store` and
  // failed BOTH targets with no diagnostic. The identifier-alias lowering above
  // only fires for `const app = useApp()`; an ObjectPattern falls through.
  //
  // Warned rather than lowered: the alias map is identifier -> hook name, and a
  // destructured `store` aliases `useApp().store` — a member path, not a call —
  // so supporting it means a second alias kind threaded through parseExpr. The
  // three other shapes all work, so pointing at them costs the author one line.
  if (
    node.id?.type === 'ObjectPattern' &&
    init?.type === 'CallExpression' &&
    init.callee?.type === 'Identifier' &&
    typeof init.callee.name === 'string' &&
    ctx.storeHookNames.has(init.callee.name as string)
  ) {
    const hook = init.callee.name as string
    ctx.warnings.push(
      `Destructuring a store api (\`const { … } = ${hook}()\`) is NOT lowered on native — the destructured names emit unbound and the build fails on both targets with "cannot find 'store' in scope". Bind the api instead: \`const api = ${hook}(); api.store.x\` (or read it inline, \`${hook}().store.x\`). Both lower to the same native singleton.`,
    )
    return null
  }
  // Gap 4 PR-3 (2026-06-05 audit) — Strategy-B port for
  // `@pyreon/i18n/core`. `const i18n = createI18n({ locale, messages,
  // fallbackLocale? })` becomes a PyreonI18n reactive container; the
  // runtime port defines `t(key)`. Runs BEFORE the Tier-2 silent-drop
  // diagnostic block so `createI18n` is recognized as a real port.
  const i18nDecl = tryDeclFromCreateI18n(node, ctx)
  if (i18nDecl) return i18nDecl

  // Gap 4 PR-2 (2026-06-05 audit) — full Strategy-B port for
  // `@pyreon/machine`. `const m = createMachine({ initial, states })`
  // becomes a PyreonMachine reactive container; method calls
  // (`.send`/`.matches`/`.can`/`.nextEvents`) flow through unchanged
  // because the runtime port defines them. `m()` read-current-state
  // also works unchanged via Swift `callAsFunction()` / Kotlin
  // `operator fun invoke()`. Runs BEFORE the Tier-2 silent-drop
  // diagnostic block so `createMachine` is recognized as a real port
  // (no warning fires).
  const machineDecl = tryDeclFromCreateMachine(node, ctx)
  if (machineDecl) return machineDecl

  // Tier-2 silent-drop diagnostics from #1444 (Gap 4 PR-1) — kept for
  // the remaining 3 callees. `createI18n` and `createMachine` were
  // REMOVED from the list because they now have full ports via
  // tryDeclFromCreateI18n / tryDeclFromCreateMachine above.
  if (init?.type === 'CallExpression') {
    const calleeName = init.callee?.name as string | undefined
    const tier2StrategyB: Record<string, string> = {
      defineStore: '@pyreon/store',
      // `@pyreon/state-tree`'s public export is `model`, not
      // `createModel`. Earlier audit doc + diagnostic used the wrong
      // name → silent-drop never fired against real user code. Fixed
      // in Gap 4 follow-up (state-tree foundation PR).
      model: '@pyreon/state-tree',
      defineFeature: '@pyreon/feature',
      // Gap 4 follow-up — surface @pyreon/validate + @pyreon/validation
      // calls as Tier-2 silent-drop so authors aren't blindsided when
      // their validator-laden code reaches native targets. Both
      // packages are Strategy-A (per-validator lowering) and need
      // multi-PR work per the audit; the diagnostic at least makes
      // the limitation loud at compile time.
      //
      // @pyreon/validate (Pyreon DX overlay on Standard Schema):
      withField: '@pyreon/validate',
      // @pyreon/validation (per-validator adapter helpers):
      zodSchema: '@pyreon/validation',
      zodField: '@pyreon/validation',
      valibotSchema: '@pyreon/validation',
      valibotField: '@pyreon/validation',
      arktypeSchema: '@pyreon/validation',
      arktypeField: '@pyreon/validation',
    }
    if (calleeName && calleeName in tier2StrategyB) {
      const pkg = tier2StrategyB[calleeName]
      const bindingName =
        node.id?.type === 'Identifier'
          ? (node.id.name as string)
          : '(destructured)'
      ctx.warnings.push(
        `${calleeName}() declared (${pkg}, binding: \`${bindingName}\`) — Tier-2 package on native: parser ` +
          `recognition + runtime port not yet shipped. Setup function will not run on iOS/Android; downstream ` +
          `uses of \`${bindingName}\` emit as unresolved references and may fail swiftc/kotlinc validation. ` +
          `Use a per-target adapter (Layer 4: <NativeIOS> / <NativeAndroid>) to provide the same surface natively, ` +
          `or keep this code in a \`<Web>\`-only branch. Tracked in audit Gap 4; see ` +
          `docs/src/content/docs/multiplatform-libraries.md → "Tier 2 — pure-logic packages."`,
      )
      return null
    }
  }
  // Native readiness audit (2026-06, CRIT-4): `const data = useLoaderData<T>()`
  // is currently DROPPED on both targets — PMTC has no emit branch, AND
  // there's no diagnostic. The runtime `setLoaderData()` infrastructure
  // ships on PyreonRouter (Swift + Kotlin), but the loader auto-emit
  // that would WIRE a component-level `useLoaderData<T>()` call to it
  // is deferred — see docs/src/content/docs/multiplatform.md "Loader auto-emit is
  // intentionally deferred, not forgotten." A developer writing the
  // call gets a silent-drop: data signal is never populated, component
  // renders with undefined, no compile error, no runtime error. Warn
  // at the call site naming the binding so the path forward is obvious.
  //
  // Two shapes covered:
  //   (a) `const data = useLoaderData<User>()`  — Identifier binding
  //   (b) `const { user } = useLoaderData<{ user: User }>()` — destructure
  //       (also unsupported until loader auto-emit lands)
  if (init?.type === 'CallExpression') {
    const callee = init.callee?.name as string | undefined
    if (callee === 'useLoaderData') {
      // Phase B6 (native readiness audit): `const data = useLoaderData<T>()`
      // now emits READ-ONLY (was silent-drop pre-B6). The Identifier shape
      // emits a binding that reads the runtime container's loaderData entry
      // for the current path, type-cast to T. Auto-loader emit (firing
      // route.loader on navigation) remains future work — the warning
      // below names this gap so authors aren't surprised when their
      // useLoaderData hook stays `nil`/`null` without a host-side
      // setLoaderData() call.
      //
      // Destructure shape (`const { x } = useLoaderData<T>()`) STILL
      // silent-drops — the runtime read returns an OPAQUE T?, not a
      // shape the destructure can pattern-match against without
      // type-knowledge of T's fields. That's bigger Phase B+ work.
      const isIdentifier = node.id?.type === 'Identifier'
      const isObjectPattern = node.id?.type === 'ObjectPattern'

      // Both shapes warn. Identifier softens to "emit ships read-only,
      // auto-loader follow-up needed"; destructure keeps the original
      // silent-drop warning because the shape genuinely doesn't emit.
      const bindingDesc = isIdentifier
        ? `\`const ${node.id?.name as string} = useLoaderData<T>()\``
        : isObjectPattern
          ? '`const { ... } = useLoaderData<T>()`'
          : '`useLoaderData<T>()`'

      if (isIdentifier) {
        ctx.warnings.push(
          `useLoaderData<T>() declared (${bindingDesc}) — PMTC ships READ-ONLY emit (Phase B6): the binding reads PyreonRouter.loaderData[currentPath] cast to T. Auto-loader emit (firing a route's \`loader\` on navigation) is future work — populate loaderData via the runtime container's \`setLoaderData(path, value)\` method from your native host code today. Reference: docs/src/content/docs/multiplatform.md → "Loader auto-emit is intentionally deferred, not forgotten."`,
        )
        // Phase B6 IR — capture name + type generic. The emit reads
        // PyreonRouter.loaderData[currentPath] cast to T at the
        // declaration site (read-only).
        const name = node.id?.name as string
        const type = parseGenericTypeArg(init, ctx)
        return { kind: 'useLoaderData', name, type }
      }

      // Destructure (and other non-Identifier shapes) keep the original
      // silent-drop behavior + warning. Phase B6+ work would unwrap a
      // destructure against a known type — bigger scope.
      ctx.warnings.push(
        `useLoaderData<T>() declared (${bindingDesc}) — destructure form not yet emitted on native targets. Use the single-binding shape \`const data = useLoaderData<T>(); …data.x\` instead. Tracked as Phase B+ follow-up.`,
      )
      return null
    }
  }
  // `const { id } = useParams()` / `const { id: userId } = useParams<{...}>()`
  // — destructured router params. The ObjectPattern id has no `.name`, so this
  // must run BEFORE the name-based bail below (otherwise the decl is silently
  // dropped and the destructured locals reference undeclared identifiers).
  if (
    node.id?.type === 'ObjectPattern' &&
    init?.type === 'CallExpression' &&
    (init.callee?.name as string | undefined) === 'useParams'
  ) {
    const params: { key: string; local: string }[] = []
    for (const prop of (node.id.properties as AnyNode[] | undefined) ?? []) {
      if (prop?.type !== 'Property') continue
      const key = prop.key?.type === 'Identifier' ? (prop.key.name as string) : undefined
      const local =
        prop.value?.type === 'Identifier' ? (prop.value.name as string) : key
      if (key !== undefined && local !== undefined) params.push({ key, local })
    }
    return params.length > 0 ? { kind: 'params-destructure', params } : null
  }
  // General local object destructure — `const { x, y } = <expr>` for any RHS
  // NOT caught by the hook / store / useParams / useLoaderData lowerings
  // above (e.g. `const { x } = o()` over a typed-object signal, or
  // `const { a, b } = props`). Mirrors the hook-destructure approach:
  // synthesize a single-binding container `const __pyDestrN = <expr>`
  // (recurse — reaching the value-const / signal-read path) + alias each key
  // → `__pyDestrN.<key>` (applied in parseExpr's Identifier case). The emit
  // is then identical to the supported single-binding + member-access shape.
  // Non-regressing by construction: a RHS whose single-binding form yields no
  // decl recurses to `null` and FALLS THROUGH to the existing drop below; a
  // rest element / nested pattern bails the whole lowering (allSimple guard)
  // so we never half-bind. (The destructured object's field must resolve to a
  // known struct for `.field` to typecheck — the anonymous-object-type case
  // stays the separate struct-synthesis gap, no worse than the prior drop.)
  if (node.id?.type === 'ObjectPattern' && init) {
    const props = (node.id.properties as AnyNode[] | undefined) ?? []
    const allSimple =
      props.length > 0 &&
      props.every(
        (p) =>
          p?.type === 'Property' &&
          p.key?.type === 'Identifier' &&
          p.value?.type === 'Identifier',
      )
    if (allSimple) {
      const synthName = `__pyDestr${ctx.hookDestructureCounter}`
      const synthNode = {
        ...node,
        id: { type: 'Identifier', name: synthName },
      } as AnyNode
      const containerDecl = tryDeclFromVarDeclarator(synthNode, ctx)
      if (containerDecl) {
        ctx.hookDestructureCounter += 1
        for (const prop of props) {
          const key = (prop as AnyNode).key?.name as string
          const local = (prop as AnyNode).value?.name as string
          ctx.hookFieldAliases.set(local, { object: synthName, field: key })
        }
        return containerDecl
      }
    }
    // not lowerable → fall through to the LOUD residual warning below
  }
  // General local ARRAY destructure — `const [a, b] = <expr>` at COMPONENT
  // scope (the parallel of the object arm above; the helper/computed BODY
  // walker has its own block-scoped expansion). Previously this fell through
  // to the name-based bail (an ArrayPattern id has no `.name`) and was
  // dropped with NO warning — the emitted body then referenced `a`/`b`
  // unbound, so swiftc/kotlinc failed with "cannot find 'a' in scope" while
  // the transform reported zero warnings. Same container+alias approach as
  // the object arm: synthesize `const __pyDestrN = <expr>` (recurse — value
  // consts, signal reads, hook results all resolve there) and alias each
  // element to `__pyDestrN[i]` in parseExpr's Identifier case — the exact IR
  // of the documented explicit-index shape (`xs()[0]`), so emit + inference
  // are shared with a proven path on both targets. A hole (`[, b]`), rest
  // (`[...r]`), default (`[a = 1]`), or nested pattern bails the whole
  // lowering (allSimple guard) to the residual warning below — never a
  // half-binding.
  if (node.id?.type === 'ArrayPattern' && init) {
    const els = (node.id.elements as (AnyNode | null)[] | undefined) ?? []
    const allSimple = els.length > 0 && els.every((el) => el?.type === 'Identifier')
    if (allSimple) {
      const synthName = `__pyDestr${ctx.hookDestructureCounter}`
      const synthNode = {
        ...node,
        id: { type: 'Identifier', name: synthName },
      } as AnyNode
      const containerDecl = tryDeclFromVarDeclarator(synthNode, ctx)
      if (containerDecl) {
        ctx.hookDestructureCounter += 1
        els.forEach((el, i) => {
          ctx.hookFieldAliases.set((el as AnyNode).name as string, {
            object: synthName,
            index: i,
          })
        })
        return containerDecl
      }
    }
  }
  // A component-level destructure that did NOT lower above — a non-simple
  // pattern (nested / rest / default / hole), or a RHS whose single-binding
  // container form yields no decl. Without this, the declaration silently
  // vanishes and every later reference to the pattern's locals emits UNBOUND
  // → uncompilable native code with zero diagnostics (the exact class the
  // helper-body walker already warns on). Zero silent drops in the supported
  // vocab: fail loudly, naming the working shapes.
  if ((node.id?.type === 'ObjectPattern' || node.id?.type === 'ArrayPattern') && init) {
    ctx.warnings.push(
      'Component-body destructuring in this shape is not lowered to native — only flat `const { x, y } = …` and flat `const [a, b] = …` lower (no nesting, rest, defaults, or holes). Bind explicitly instead (`const a = o().a` / `const first = xs()[0]`); the declaration was skipped and its names would otherwise emit unbound.',
    )
    return null
  }
  const name = node.id?.name as string | undefined
  if (!name || !init) return null

  // Arrow-function declaration — `const fn = (params) => { ... }` —
  // becomes a `function` DeclIR. Parser-A from the TodoMVC walkthrough.
  // The emitter renders these as `private func` (Swift) / `private fn`
  // (Kotlin). The arrow's body can be a BlockStatement (multi-statement)
  // OR a single expression (concise arrow); we normalize both to
  // StatementIR[] so the emitter has one shape to handle.
  if (init.type === 'ArrowFunctionExpression') {
    return tryFunctionDecl(name, init, ctx)
  }

  // Phase 5b — a plain VALUE const: `const a = 5 + 3` / `const label = 'x'` /
  // `const doubled = base * 2`. Previously dropped (only call-expression
  // decls were captured), silently vanishing local consts → undefined refs on
  // native. Now emitted as a body-local let/val (captures-once, like JS
  // const). Arrows handled above; calls (signal/computed/hook/rx) handled
  // below. Object/array literals also flow through (they get the existing
  // object/array-literal emit). This widens the supported subset toward
  // "any app" — local consts are ubiquitous.
  if (init.type !== 'CallExpression') {
    return { kind: 'value', name, expr: parseExpr(init, ctx) }
  }

  // RX-1 — `@pyreon/rx` namespace lowering. Source like
  //   const active = rx.filter(todos, t => !t.done)
  //   const top5   = rx.take(active, 5)
  //   const cnt    = rx.count(active)
  // PMTC's recognition list previously knew only top-level callee names
  // (`signal`, `useStorage`, …). `rx.METHOD(...)` is a MemberExpression
  // callee, so the previous code path treated the whole declaration as
  // an unknown CallExpression and silently dropped it from emit (see
  // PR #1317's `tier2-rx-silent-drop.test.ts` regression-lock).
  //
  // This block recognises the `rx.*` namespace and rewrites each
  // supported method into the equivalent expression on the underlying
  // signal-carried collection — `rx.filter(s, p)` becomes a `computed`
  // whose body is `s().filter(p)`. The native collection methods on
  // Swift `[T]` and Kotlin `List<T>` carry identical names for the
  // v1 set (`filter` / `map` / `reverse`); per-method per-target
  // dispatch for the divergent set (`count`/`size`, `take`/`prefix`,
  // `every`/`allSatisfy`, …) is the immediate follow-up — the existing
  // computed-emit pipeline handles everything once the IR is built.
  //
  // Per-target compileability of the resulting emit is locked by the
  // hand-crafted proof in `docs/src/content/docs/multiplatform-libraries.md`
  // ("Compileability proof" — `swiftc -parse` + `kotlinc` both exit 0).
  const rxLowered = tryRxNamespaceLowering(name, init, ctx)
  if (rxLowered !== null) return rxLowered

  const calleeName = init.callee?.name as string | undefined
  if (calleeName === 'signal') {
    const generic = parseGenericTypeArg(init, ctx)
    const initialArg = init.arguments?.[0]
    const initial: ExprIR = initialArg
      ? parseExpr(initialArg, ctx)
      : { kind: 'literal', value: 0 }
    // Un-annotated `signal('')` / `signal(0)` / `signal(false)` infers
    // its type from the initial literal — same contract the store-setup
    // path applies (and what inferTypeFromInitial's own docstring
    // already claimed). Without this, an un-annotated signal emitted
    // `@State private var x: Any = ""` on Swift — `Any` breaks every
    // use site ($x bindings, .count, arithmetic). Kotlin was immune
    // only because `mutableStateOf("")` lets kotlinc infer.
    //
    // Inference fires ONLY when no generic is written at all — an
    // explicit `signal<any>(x)` keeps `unknown` (the user opted out of
    // typing; the type-mapper contract for TSAnyKeyword stays intact).
    const hasGeneric = ((init.typeArguments?.params as AnyNode[] | undefined)?.length ?? 0) > 0
    const type = hasGeneric ? generic : inferTypeFromInitial(initial)
    return { kind: 'signal', name, type, initial }
  }
  // `useSessionStorage` / `useMemoryStorage` — process-scoped storage, so
  // the honest native mapping is a plain state field with NO persistence.
  //
  // On the web, sessionStorage survives a reload and dies with the tab.
  // Native has neither a tab nor a reload: the process IS the session, so
  // in-memory state is the exact analogue rather than an approximation of
  // one. `useMemoryStorage` is definitionally that on every platform.
  //
  // Emitting them as a `signal` decl WITHOUT a storageKey is what makes
  // this correct: the same IR `useStorage` produces, minus the @AppStorage /
  // rememberSaveable persistence that would wrongly outlive the process.
  if (calleeName === 'useSessionStorage' || calleeName === 'useMemoryStorage') {
    const initialArg = init.arguments?.[1]
    const initial: ExprIR = initialArg
      ? parseExpr(initialArg, ctx)
      : { kind: 'literal', value: 0 }
    const generic = parseGenericTypeArg(init, ctx)
    const hasGeneric = ((init.typeArguments?.params as AnyNode[] | undefined)?.length ?? 0) > 0
    const type = hasGeneric ? generic : inferTypeFromInitial(initial)
    return { kind: 'signal', name, type, initial }
  }

  // G5 — `useStorage<T>('key', default)` from `@pyreon/storage` is a
  // PERSISTENT signal. Same shape as `signal()` plus a storage-key
  // string. The emitter routes storage signals to platform-idiomatic
  // persistence primitives:
  //   Swift   →  @AppStorage("key") private var x: T = default
  //   Kotlin  →  var x by rememberSaveable { mutableStateOf(default) }
  // The `_signalNames` set in the emitters picks up storage signals
  // automatically (since they're DeclIR.signal), so `todos()` correctly
  // drops parens at call sites without a separate `_storageNames` set.
  if (calleeName === 'useStorage') {
    const type = parseGenericTypeArg(init, ctx)
    const keyArg = init.arguments?.[0]
    const initialArg = init.arguments?.[1]
    // The storage key MUST be a string literal — anything else (template
    // string, identifier, member access) can't be baked into the
    // `@AppStorage(...)` string at compile time. Conservative — fall
    // through to undeclared if the key isn't a static literal.
    if (
      !keyArg ||
      (keyArg.type !== 'Literal' && keyArg.type !== 'StringLiteral') ||
      typeof keyArg.value !== 'string'
    ) {
      ctx.warnings.push(
        `Declaration ${name}: useStorage key argument must be a string literal; got ${keyArg?.type ?? 'nothing'}.`,
      )
      return null
    }
    const storageKey = keyArg.value
    const initial: ExprIR = initialArg
      ? parseExpr(initialArg, ctx)
      : { kind: 'literal', value: 0 }
    // Same initial-literal inference as plain `signal()` (no-generic
    // form only) — @AppStorage needs a concrete native type, so `Any`
    // is even worse here.
    const hasGeneric = ((init.typeArguments?.params as AnyNode[] | undefined)?.length ?? 0) > 0
    const inferredType = hasGeneric ? type : inferTypeFromInitial(initial)
    return { kind: 'signal', name, type: inferredType, initial, storageKey }
  }
  if (calleeName === 'computed') {
    const arg = init.arguments?.[0]
    if (!arg || arg.type !== 'ArrowFunctionExpression') {
      ctx.warnings.push(
        `Declaration ${name}: computed expected an arrow function argument; got ${arg?.type ?? 'nothing'}.`,
      )
      return null
    }
    const body = arg.body
    // computed-with-BlockStatement-body (multi-statement) requires the
    // same shape as a regular function-decl arrow. The emitter handles
    // it: a single-return BlockStatement renders inline as a Swift
    // computed property; anything more degrades to a getter with a
    // body. Phase 1: route through parseStatement.
    if (body.type === 'BlockStatement') {
      const stmts = parseStatementBlock(body, ctx)
      // Single-statement block that's a return → keep the legacy
      // single-expression shape so emit stays compact:
      //   computed(() => { return x })  →  computed.expr = x
      // Both shapes type-check identically; the legacy form keeps the
      // existing snapshots stable for the common-case 1-return body.
      if (stmts.length === 1 && stmts[0]?.kind === 'return' && stmts[0].expr !== undefined) {
        return { kind: 'computed', name, expr: stmts[0].expr }
      }
      // Multi-statement body — populate `body` with the full statement
      // sequence. The emit pass renders this as a Swift multi-statement
      // getter / Kotlin multi-statement `derivedStateOf` lambda body,
      // preserving any pre-return `let` bindings, `if` early-returns,
      // etc. Phase 2 follow-up closing the TodoMVC `visible: Any { xs }`
      // typecheck blocker — pre-PR the parser silently dropped
      // pre-return statements and emitted a synthetic expression.
      return { kind: 'computed', name, body: stmts }
    }
    const expr: ExprIR = parseExpr(body, ctx)
    return { kind: 'computed', name, expr }
  }
  // C4 — `@pyreon/router` hook recognition. Three shapes:
  //
  //   const router   = createRouter({ routes: [...] })
  //   const navigate = useNavigate()
  //   const params   = useParams()
  //
  // Per-target emit lives in emitSwiftDecl / emitKotlinDecl. C5 extends
  // the createRouter case to extract the `routes` config array — the
  // native emit then produces real `.navigationDestination(for:)` /
  // `NavHost { composable(...) }` blocks instead of scaffold-only
  // instances. Conservative bail: a missing / non-literal / wrong-shape
  // routes arg → undefined `routes` → emit falls back to C4 bare-instance.
  if (calleeName === 'createRouter') {
    const routes = tryExtractRoutes(init.arguments?.[0], ctx)
    // Global guards — beforeEach / afterEach arrays on the router
    // config. Captures IDENTIFIER REFS only (conservative shape);
    // inline arrow bodies are dropped here, same as per-route
    // beforeEnter bails non-arrow-expression shapes.
    const beforeEach = tryExtractGuardRefArray(init.arguments?.[0], 'beforeEach')
    const afterEach = tryExtractGuardRefArray(init.arguments?.[0], 'afterEach')
    const decl: DeclIR = { kind: 'router', name }
    if (routes !== null) decl.routes = routes
    if (beforeEach.length > 0) decl.beforeEach = beforeEach
    if (afterEach.length > 0) decl.afterEach = afterEach
    return decl
  }
  if (calleeName === 'useNavigate') {
    return { kind: 'router-hook', name, hook: 'navigate' }
  }
  if (calleeName === 'useUrlState') {
    // `const q = useUrlState('q', '')`. Both arguments must be literals so the
    // key can be baked into the emit — same conservative rule as useFetch's
    // URL and useStorage's key. A dynamic key would need a runtime lookup the
    // value type does not carry.
    const args = (init.arguments as AnyNode[] | undefined) ?? []
    const keyNode = args[0]
    const defNode = args[1]
    if (keyNode?.type !== 'Literal' || typeof keyNode.value !== 'string') return null
    // v1 is string-valued. A number/boolean default would need the web's
    // pluggable serializer baked in; coercing silently would be worse than
    // leaving it to the unlowered-hook warning.
    if (defNode !== undefined && (defNode.type !== 'Literal' || typeof defNode.value !== 'string')) {
      ctx.warnings.push(
        `const ${name} = useUrlState(${JSON.stringify(keyNode.value)}, …) lowers only with a STRING default in v1 — a typed serializer is not baked into the native emit yet. Use a string and parse it, or keep the call behind a \`<Web>\` escape hatch.`,
      )
      return null
    }
    return {
      kind: 'url-state',
      name,
      key: keyNode.value,
      defaultValue: defNode?.type === 'Literal' ? String(defNode.value) : '',
    }
  }
  if (calleeName === 'useParams') {
    // The WHOLE-OBJECT form. It lowers to a `[String: String]` / `Map`, so the
    // natural JS follow-up — `p.id` — emits `p.id`, which is not how a Swift
    // dictionary or a Kotlin map is read. That failed on BOTH targets with no
    // diagnostic, while the destructured form
    // (`const { id } = useParams()` → `useParams(router:)["id"] ?? ""`)
    // works on both and handles the Optional.
    //
    // Warn rather than rewrite `.id` → `["id"]`: member access is emitted from
    // everywhere, and narrowing a codegen rewrite to exactly this binding is a
    // change that wants the full suite green to land safely. The destructure is
    // already the supported, idiomatic shape — pointing at it costs the author
    // one line and nothing in correctness.
    ctx.warnings.push(
      `const ${name} = useParams() lowers to a native dictionary/map, so a property read like \`${name}.id\` emits \`${name}.id\` and does NOT compile on either target. Destructure instead — \`const { id } = useParams()\` — which lowers per key (\`useParams(router:)["id"] ?? ""\`) and works on both.`,
    )
    return { kind: 'router-hook', name, hook: 'params' }
  }
  // Phase 4 — `useFetch<T>('/url')`. The decoded result type comes from
  // the generic arg; the request path MUST be a string literal so it can
  // be baked into the emitted harness. Non-literal URLs (template strings,
  // identifiers) bail to undeclared — same conservative rule as useStorage.
  if (calleeName === 'useFetch') {
    const type = parseGenericTypeArg(init, ctx)
    const urlArg = init.arguments?.[0]
    if (
      !urlArg ||
      (urlArg.type !== 'Literal' && urlArg.type !== 'StringLiteral') ||
      typeof urlArg.value !== 'string'
    ) {
      ctx.warnings.push(
        `Declaration ${name}: useFetch url argument must be a string literal; got ${urlArg?.type ?? 'nothing'}.`,
      )
      return null
    }
    // No generic -> TypeIR `unknown` -> Swift emits `decode(Any.self, ...)`,
    // which does NOT compile: `Any` cannot conform to Decodable. Kotlin is
    // unaffected, so this is a Swift-only silent break, and the device-proven
    // examples all use the typed form -- which is why nothing caught it.
    if (type.kind === 'unknown') {
      ctx.warnings.push(
        `Declaration ${name}: useFetch without a response type lowers to decode(Any.self, ...) on Swift, which does NOT compile - Any cannot conform to Decodable. Give it the shape you expect: useFetch<Response>('${urlArg.value}') with a type/interface declared alongside the component. Kotlin compiles either way, so this breaks iOS only.`,
      )
    }
    // The request init — `useFetch<T>(url, { method, headers, body })`.
    //
    // Read LOUDLY. Every field here used to be discarded in silence: nothing
    // looked past `arguments[0]`, so an author writing `method: 'POST'` got a
    // GET on both targets with no diagnostic anywhere. The rule below is the
    // same one the url argument already follows — literals are baked, anything
    // non-literal WARNS rather than being quietly ignored, because a request
    // that silently uses the wrong verb is a data-corrupting no-op, not a
    // missing feature.
    const initArg = init.arguments?.[1]
    const req: { method?: string; headers?: Record<string, string>; body?: string } = {}
    if (initArg) {
      if (initArg.type !== 'ObjectExpression') {
        ctx.warnings.push(
          `Declaration ${name}: useFetch init must be an object literal to lower to native; got ${initArg.type}. The request will be a plain GET on iOS and Android.`,
        )
      } else {
        for (const prop of initArg.properties ?? []) {
          if (prop.type !== 'Property' || prop.computed) continue
          const key =
            prop.key?.type === 'Identifier'
              ? prop.key.name
              : typeof prop.key?.value === 'string'
                ? prop.key.value
                : undefined
          if (!key) continue
          const value = prop.value
          const isStringLit =
            (value?.type === 'Literal' || value?.type === 'StringLiteral') &&
            typeof value.value === 'string'

          if (key === 'method') {
            if (!isStringLit) {
              ctx.warnings.push(
                `Declaration ${name}: useFetch method must be a string literal to lower to native; got ${value?.type ?? 'nothing'}. The request will be a plain GET on iOS and Android.`,
              )
              continue
            }
            req.method = String(value.value).toUpperCase()
          } else if (key === 'body') {
            if (!isStringLit) {
              // A JSON.stringify(obj) body is the obvious next shape and is
              // NOT supported — say so rather than sending an empty body.
              ctx.warnings.push(
                `Declaration ${name}: useFetch body must be a string literal to lower to native; got ${value?.type ?? 'nothing'}. The request will be sent with NO body on iOS and Android.`,
              )
              continue
            }
            req.body = String(value.value)
          } else if (key === 'headers') {
            if (value?.type !== 'ObjectExpression') {
              ctx.warnings.push(
                `Declaration ${name}: useFetch headers must be an object literal of string literals to lower to native; got ${value?.type ?? 'nothing'}. The request will be sent with NO headers on iOS and Android.`,
              )
              continue
            }
            const headers: Record<string, string> = {}
            for (const h of value.properties ?? []) {
              if (h.type !== 'Property' || h.computed) continue
              const hk =
                h.key?.type === 'Identifier'
                  ? h.key.name
                  : typeof h.key?.value === 'string'
                    ? h.key.value
                    : undefined
              const hv = h.value
              if (
                hk &&
                (hv?.type === 'Literal' || hv?.type === 'StringLiteral') &&
                typeof hv.value === 'string'
              ) {
                headers[hk] = hv.value
              } else if (hk) {
                ctx.warnings.push(
                  `Declaration ${name}: useFetch header "${hk}" must be a string literal to lower to native; it will be OMITTED on iOS and Android.`,
                )
              }
            }
            if (Object.keys(headers).length > 0) req.headers = headers
          } else {
            // `signal`, `credentials`, `mode`, … are web-fetch options with no
            // native analogue. Naming them beats dropping them silently.
            ctx.warnings.push(
              `Declaration ${name}: useFetch init option "${key}" has no native equivalent and is ignored on iOS and Android.`,
            )
          }
        }
      }
    }

    return { kind: 'fetch', name, type, url: urlArg.value, ...req }
  }
  // `useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` from @pyreon/query
  // — useFetch + a keyed cache. v1 (conservative, same literal-only rule as
  // useFetch): queryKey = array of string/number literals (colon-joined into
  // the cache key); queryFn = inline `() => fetch('<url-literal>')`; staleTime
  // = number literal (ms). Anything else WARNS and bails to undeclared, so the
  // hook-arc's "no native lowering" diagnostic still fires rather than the
  // emit mis-lowering a shape it can't honour.
  if (calleeName === 'useQuery') {
    const type = parseGenericTypeArg(init, ctx)
    if (type.kind === 'unknown') {
      ctx.warnings.push(
        `Declaration ${name}: useQuery without a response type lowers to a decode of Any on Swift, which does NOT compile — Any cannot conform to Decodable. Give it the shape you expect: useQuery<Response>(() => ({ … })). Kotlin compiles either way, so this breaks iOS only.`,
      )
      return null
    }
    const optsFn = init.arguments?.[0] as AnyNode | undefined
    if (!optsFn || optsFn.type !== 'ArrowFunctionExpression') {
      ctx.warnings.push(
        `Declaration ${name}: useQuery expects an options function \`() => ({ queryKey, queryFn, staleTime })\`; got ${optsFn?.type ?? 'nothing'}. The @pyreon/query hooks take options as a FUNCTION so queryKey can read signals.`,
      )
      return null
    }
    const optsObj = arrowReturnedObject(optsFn)
    if (!optsObj) {
      ctx.warnings.push(
        `Declaration ${name}: useQuery options function must return an object literal \`({ queryKey, queryFn, staleTime })\` to lower to native.`,
      )
      return null
    }
    let queryKey: string | undefined
    let url: string | undefined
    let staleMillis = 0
    const req: { method?: string; headers?: Record<string, string>; body?: string } = {}
    for (const prop of (optsObj.properties as AnyNode[] | undefined) ?? []) {
      if (prop.type !== 'Property' || prop.computed) continue
      const key =
        prop.key?.type === 'Identifier'
          ? prop.key.name
          : typeof prop.key?.value === 'string'
            ? prop.key.value
            : undefined
      if (!key) continue
      if (key === 'queryKey') {
        const k = tryQueryKeyString(prop.value)
        if (k === undefined) {
          ctx.warnings.push(
            `Declaration ${name}: useQuery queryKey must be an array of string/number literals to lower to native (v1); got a non-literal. A reactive key (\`['todo', id()]\`) is a tracked follow-up.`,
          )
          return null
        }
        queryKey = k
      } else if (key === 'queryFn') {
        const f = tryQueryFnFetch(prop.value)
        if (f === undefined) {
          ctx.warnings.push(
            `Declaration ${name}: useQuery queryFn must be an inline \`() => fetch('<url-literal>')\` to lower to native (v1); a function reference or a non-literal fetch URL is a tracked follow-up.`,
          )
          return null
        }
        url = f.url
        // An inline `fetch(url, { method, headers, body })` routes through
        // PyreonHttp (mirroring useFetch); a bare `fetch(url)` stays a GET.
        if (f.init) Object.assign(req, parseFetchInitObject(f.init, name, ctx))
      } else if (key === 'staleTime') {
        const v = prop.value as AnyNode | undefined
        if ((v?.type === 'Literal' || v?.type === 'NumericLiteral') && typeof v.value === 'number') {
          staleMillis = v.value
        } else if (v) {
          ctx.warnings.push(
            `Declaration ${name}: useQuery staleTime must be a number literal (ms) to lower to native; got ${v.type}. Defaulting to 0 (always revalidate, serving the stale value instantly).`,
          )
        }
      }
    }
    if (queryKey === undefined || url === undefined) {
      ctx.warnings.push(
        `Declaration ${name}: useQuery needs both a literal queryKey and an inline fetch queryFn to lower to native (v1).`,
      )
      return null
    }
    return { kind: 'query', name, type, url, queryKey, staleMillis, ...req }
  }
  // Phase 4.2 — `useForm({ initialValues })` from @pyreon/form. The config
  // arg is optional; when present we capture the string-keyed literal
  // `initialValues` to seed the native PyreonForm container. `onSubmit` /
  // `validators` are web-only function logic — ignored on native (submission
  // flows through the container's begin/endSubmit API). Always succeeds
  // (no bail): a bare `useForm()` or an unrecognised config shape yields an
  // empty `initialValues`, and the emit produces a default-constructed form.
  if (calleeName === 'useForm') {
    const cfg = init.arguments?.[0] as AnyNode | undefined
    const decl: Extract<DeclIR, { kind: 'form' }> = {
      kind: 'form',
      name,
      initialValues: tryExtractFormInitialValues(cfg),
    }
    // v2 (form-binding arc) — validators + onSubmit. Conservative:
    // unparseable members are skipped with a warning (the form still
    // works; that validator just doesn't run natively).
    if (cfg?.type === 'ObjectExpression') {
      for (const prop of (cfg.properties as AnyNode[] | undefined) ?? []) {
        if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
        const key = (prop.key?.name ?? prop.key?.value) as string | undefined
        if (key === 'validators' && prop.value?.type === 'ObjectExpression') {
          const validators: { key: string; param: string; body: ExprIR }[] = []
          for (const v of (prop.value.properties as AnyNode[] | undefined) ?? []) {
            if (v?.type !== 'Property' && v?.type !== 'ObjectProperty') continue
            const fieldName = (v.key?.name ?? v.key?.value) as string | undefined
            const fn = v.value as AnyNode | undefined
            if (
              fieldName === undefined ||
              fn?.type !== 'ArrowFunctionExpression' ||
              (fn.params as AnyNode[] | undefined)?.length !== 1 ||
              fn.body?.type === 'BlockStatement'
            ) {
              ctx.warnings.push(
                `useForm \`${name}\`: validator \`${fieldName ?? '?'}\` must be a single-param expression-body arrow returning '' (valid) or a message — skipped natively.`,
              )
              continue
            }
            const param = ((fn.params as AnyNode[])[0] as AnyNode | undefined)?.name as
              | string
              | undefined
            if (param === undefined) continue
            validators.push({ key: fieldName, param, body: parseExpr(fn.body, ctx) })
          }
          if (validators.length > 0) decl.validators = validators
        } else if (key === 'onSubmit' && prop.value?.type === 'ArrowFunctionExpression') {
          const fn = tryFunctionDecl('__onSubmit', prop.value, ctx)
          // Optional-chain discriminant guard (see the store-walker
          // mirror above for the CodeQL rationale).
          if (fn?.kind === 'function') {
            const param = fn.params[0]?.name ?? 'values'
            decl.onSubmit = { param, body: fn.body }
          } else {
            ctx.warnings.push(
              `useForm \`${name}\`: could not parse onSubmit — the native submit() will validate but run no callback.`,
            )
          }
        }
      }
    }
    return decl
  }
  // Phase 4 — `useOnline()` from @pyreon/hooks → the PyreonNetworkStatus
  // reactive connectivity container. No arguments.
  if (calleeName === 'useOnline') {
    return { kind: 'network-status', name }
  }
  // Phase 5 (M3.7) — `useAppState()` from @pyreon/hooks → the PyreonAppState
  // reactive lifecycle container. No arguments.
  if (calleeName === 'useAppState') {
    return { kind: 'app-state', name }
  }
  // `useCrashReporter()` from @pyreon/hooks → the PyreonCrashReporter reactive
  // container. No arguments. Reactive reads `crash.lastCrash`/`crash.hadCrash`;
  // imperative `recordError`/`breadcrumb`/`clear`; `start()` auto-called.
  if (calleeName === 'useCrashReporter') {
    return { kind: 'crash-reporter', name }
  }
  // Phase 4 — `usePermissions(['posts.edit', 'posts.*'])` from
  // @pyreon/permissions. The array of literal grant keys seeds the native
  // PyreonPermissions container. Always succeeds (no bail): a bare
  // `usePermissions()` or a non-literal arg yields an empty grant set and the
  // emit produces a default-constructed container.
  if (calleeName === 'usePermissions') {
    const grants = tryExtractStringArray(init.arguments?.[0])
    // A bare `usePermissions()` is the CORRECT web call — the grants live in
    // `<PermissionsProvider>`, which has no native lowering. So the shape a
    // web author writes produced an empty native set in which every check
    // denies, silently: guarded UI simply never appeared on device, with
    // nothing to trace it by. Say so rather than emit a container that is
    // guaranteed to answer `false`.
    if (grants.length === 0 && !ctx.hasPermissionsProvider) {
      ctx.warnings.push(
        `usePermissions() \`${name}\`: no grants reach this call — there is no literal argument and no <PermissionsProvider permissions={{ … }}> in this file, so the native permission set is EMPTY and every check denies. Wrap the tree in a provider (which lowers), seed at the call site (usePermissions(["posts.*"])), or grant() before the first check.`,
      )
    }
    return { kind: 'permissions', name, grants }
  }
  // Phase 4 — `const clipboard = useClipboard()` from `@pyreon/hooks` →
  // the PyreonClipboard reactive wrapper. No arguments. V1 supports
  // the single-binding form only (the destructure shape
  // `const { copy, copied } = useClipboard()` is a documented
  // follow-up — needs the per-key rewrite that `params-destructure`
  // uses).
  // `useToggle(initial)` / `useCounter(initial, { min, max })` — pure state
  // containers with NO platform dependency: a signal plus a few mutators.
  // They needed no runtime, only a lowering, and without one the call
  // emitted verbatim and failed the native build.
  if (calleeName === 'useToggle' || calleeName === 'useCounter') {
    const firstArg = init.arguments?.[0] as AnyNode | undefined
    const initialNode = firstArg ? unwrapTypeLayers(firstArg) : undefined
    if (calleeName === 'useToggle') {
      // Default `false`, per the web signature.
      let initial = false
      if (initialNode !== undefined) {
        if (initialNode.type !== 'Literal' || typeof initialNode.value !== 'boolean') {
          ctx.warnings.push(
            `useToggle() \`${name}\`: the initial value must be a boolean literal to bake into the native state — this one is not, so the declaration is NOT lowered.`,
          )
          return null
        }
        initial = initialNode.value as boolean
      }
      return { kind: 'pure-state', name, hook: 'useToggle', initial }
    }
    let initial = 0
    if (initialNode !== undefined) {
      if (initialNode.type !== 'Literal' || typeof initialNode.value !== 'number') {
        ctx.warnings.push(
          `useCounter() \`${name}\`: the initial value must be a numeric literal to bake into the native state — this one is not, so the declaration is NOT lowered.`,
        )
        return null
      }
      initial = initialNode.value as number
    }
    // The clamp is baked into every mutator at the use site, so it has to be
    // literal. A computed bound would silently stop clamping on device.
    const bounds: { min?: number; max?: number } = {}
    const optsNode = init.arguments?.[1] as AnyNode | undefined
    const opts = optsNode ? unwrapTypeLayers(optsNode) : undefined
    if (opts !== undefined) {
      if (opts.type !== 'ObjectExpression') {
        ctx.warnings.push(
          `useCounter() \`${name}\`: the options argument must be a literal { min, max } object — this one is not, so the declaration is NOT lowered.`,
        )
        return null
      }
      for (const prop of (opts.properties as AnyNode[] | undefined) ?? []) {
        if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
        const key = prop.key?.type === 'Identifier' ? (prop.key.name as string) : undefined
        const val = unwrapTypeLayers(prop.value as AnyNode | undefined)
        if ((key !== 'min' && key !== 'max') || val?.type !== 'Literal' || typeof val.value !== 'number') {
          ctx.warnings.push(
            `useCounter() \`${name}\`: option \`${key ?? '?'}\` is not a numeric literal, so the clamp cannot be baked into the native mutators and the declaration is NOT lowered.`,
          )
          return null
        }
        bounds[key] = val.value as number
      }
    }
    const decl: DeclIR = { kind: 'pure-state', name, hook: 'useCounter', initial }
    if (bounds.min !== undefined || bounds.max !== undefined) decl.bounds = bounds
    return decl
  }
  // `useBluetooth()` from @pyreon/hooks → PyreonBluetooth. Discovery only
  // (scan / stopScan / devices / scanning / error / available); GATT stays
  // platform-specific by design.
  if (calleeName === 'useBluetooth') {
    return { kind: 'bluetooth', name }
  }
  // `useDebouncedCallback(fn, ms)` / `useThrottledCallback(fn, ms)` — see
  // the DeclIR comment for why these need a runtime.
  if (calleeName === 'useDebouncedCallback' || calleeName === 'useThrottledCallback') {
    const mode = calleeName === 'useDebouncedCallback' ? 'debounce' : 'throttle'
    const cb = unwrapTypeLayers(init.arguments?.[0] as AnyNode | undefined)
    const delayNode = unwrapTypeLayers(init.arguments?.[1] as AnyNode | undefined)
    if (cb?.type !== 'ArrowFunctionExpression' && cb?.type !== 'FunctionExpression') {
      ctx.warnings.push(
        `${calleeName}() \`${name}\`: the callback must be an inline function to lower natively — this one is not, so the declaration is NOT lowered.`,
      )
      return null
    }
    if (delayNode?.type !== 'Literal' || typeof delayNode.value !== 'number') {
      ctx.warnings.push(
        `${calleeName}() \`${name}\`: the delay must be a numeric literal to bake into the native schedule — this one is not, so the declaration is NOT lowered.`,
      )
      return null
    }
    const params = (cb.params as AnyNode[] | undefined) ?? []
    if (params.length > 1) {
      // Silently dropping the extra arguments would produce a callback that
      // runs with the wrong data rather than one that visibly does not run.
      ctx.warnings.push(
        `${calleeName}() \`${name}\`: the native runtime carries ONE argument and this callback takes ${params.length}, so the declaration is NOT lowered. Pass a single value (an object literal if you need several).`,
      )
      return null
    }
    const fn = tryFunctionDecl(name, cb, ctx)
    if (fn?.kind !== 'function') {
      ctx.warnings.push(
        `${calleeName}() \`${name}\`: could not parse the callback, so the declaration is NOT lowered.`,
      )
      return null
    }
    return { kind: 'rate-limited', name, mode, delayMs: delayNode.value as number, fn }
  }
  if (calleeName === 'useClipboard') {
    return { kind: 'clipboard', name }
  }
  // M3.1 — `const h = useHaptics()` from `@pyreon/hooks` → the
  // PyreonHaptics fire-and-forget wrapper. No arguments, no reactive
  // state. Calls are member methods (`h.impact("light")` /
  // `h.notification("success")` / `h.selection()`) that flow through
  // unchanged — the runtime container provides the method surface, so
  // (like useClipboard) there is NO `.value` rewrite and NO arg
  // transformation (the string style arg passes straight through).
  if (calleeName === 'useHaptics') {
    return { kind: 'haptics', name }
  }
  // FFI escape hatch — `const bt = useNativeModule<T>('Bluetooth')` from
  // `@pyreon/primitives`. The ONE service declaration whose emitted type
  // the framework does NOT own: it lowers to an instance of a class the
  // APP ships (`Bluetooth()` / `Bluetooth(ctx)`), so an app can add a
  // platform capability without a framework change. Methods and property
  // reads pass through unchanged, exactly like every built-in imperative
  // service, and `await bt.method()` rides the existing async lowering.
  //
  // The module name must be a STRING LITERAL at the call site (not an
  // imported const): it is emitted verbatim as a native type name, and
  // PMTC parses one file at a time, so a cross-module reference has no
  // value source here. A non-literal is a NAMED warning + bail — the
  // declaration is dropped rather than mis-emitted.
  if (calleeName === 'useNativeModule') {
    const arg = init.arguments?.[0] as AnyNode | undefined
    const moduleName = arg?.type === 'Literal' || arg?.type === 'StringLiteral'
      ? (arg.value as unknown)
      : undefined
    if (typeof moduleName !== 'string' || moduleName.length === 0) {
      ctx.warnings.push(
        `useNativeModule \`${name}\`: the module name must be a non-empty STRING LITERAL at the call site (e.g. useNativeModule<T>('Bluetooth')) — it is emitted verbatim as the Swift/Kotlin class name and PMTC resolves one file at a time, so an imported or computed name has no value here. Declaration skipped on native.`,
      )
      return null
    }
    // Emitted verbatim as a native TYPE name, so it must be a plain
    // identifier. Rejecting anything else keeps arbitrary text out of the
    // generated Swift/Kotlin (a name like `Foo(); evil()` would otherwise
    // be spliced straight into the output).
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(moduleName)) {
      ctx.warnings.push(
        `useNativeModule \`${name}\`: module name "${moduleName}" is not a valid identifier — it is emitted directly as a Swift/Kotlin class name, so it must match /^[A-Za-z_][A-Za-z0-9_]*$/. Declaration skipped on native.`,
      )
      return null
    }
    return { kind: 'native-module', name, moduleName }
  }
  // M3.2 — `const share = useShare()` from `@pyreon/hooks` → the
  // PyreonShare wrapper. No arguments. Calls are member methods with
  // STRING args (`share.text("hi")` / `share.url("...")` /
  // `share.textUrl(t, u)` / `share.canShare()`) that flow through
  // unchanged — the runtime container presents the platform share sheet,
  // so (like useHaptics/useClipboard) NO `.value` rewrite and NO arg
  // transformation.
  if (calleeName === 'useShare') {
    return { kind: 'share', name }
  }
  // M3.2b — `const linking = useLinking()` from `@pyreon/hooks` → the
  // PyreonLinking wrapper. No arguments. `linking.openUrl("...")` flows
  // through unchanged (string arg) — the runtime container hands the URL
  // to the OS (iOS `UIApplication.shared.open`, Android
  // `Intent.ACTION_VIEW`). Like useShare, Android needs a Context.
  if (calleeName === 'useLinking') {
    return { kind: 'linking', name }
  }
  // M3.3 — `const notifs = useNotifications()` from `@pyreon/hooks` → the
  // PyreonNotifications wrapper. No arguments. `notifs.notify("title","body")` /
  // `notifs.requestPermission()` — the runtime container posts a local
  // notification (iOS UNUserNotificationCenter, Android NotificationManager
  // + channel). Like useShare, Android needs a Context.
  if (calleeName === 'useNotifications') {
    return { kind: 'notifications', name }
  }
  // M3.5 / M4.5 — `const bio = useBiometrics()` → a biometric gate (iOS
  // LAContext, Android BiometricPrompt). Its `authenticate(reason?)` returns a
  // Promise<boolean>, so consumers `await bio.authenticate(...)` inside an
  // `async` handler — the FIRST async-result service, exercising the M4.5
  // `await` lowering (Task {} / scope.launch {}). No arguments at construction.
  if (calleeName === 'useBiometrics') {
    return { kind: 'biometrics', name }
  }
  // M3.4 — `const picker = useImagePicker()` → the platform photo picker (iOS
  // PHPickerViewController, Android PickVisualMedia). Its `pick()` returns a
  // Promise<string | null>, so consumers `await picker.pick()` inside an
  // `async` handler — the second async-result service after useBiometrics.
  // Needs NO photo-library permission (both system pickers run out of process).
  // No arguments at construction.
  if (calleeName === 'useImagePicker') {
    return { kind: 'image-picker', name }
  }
  // M3.8 — `const files = useFilePicker()` → the platform document picker (iOS
  // UIDocumentPickerViewController, Android Storage Access Framework
  // `OpenDocument`). Its `pick()` returns a Promise<string | null>, so
  // consumers `await files.pick()` inside an `async` handler — the document
  // sibling of useImagePicker (any file, not just photos). Needs NO storage
  // permission (both system pickers run out of process). No construction args.
  if (calleeName === 'useFilePicker') {
    return { kind: 'file-picker', name }
  }
  // Phase 4 — `const scheme = useColorScheme()` from `@pyreon/hooks`
  // → platform-native dark-mode read. No arguments. NO runtime port
  // needed — both SwiftUI (@Environment(\.colorScheme)) and Compose
  // (isSystemInDarkTheme()) ship the primitive. Emit returns the
  // same `"light" | "dark"` string shape the web hook uses.
  if (calleeName === 'useColorScheme') {
    return { kind: 'color-scheme', name }
  }
  // M2.2 — `const sizeClass = useSizeClass()` from `@pyreon/hooks`
  // → platform-native horizontal size-class read. No arguments. NO
  // runtime port needed (same shape as useColorScheme) — SwiftUI ships
  // `@Environment(\.horizontalSizeClass)` and Compose derives it from
  // `LocalConfiguration.current.screenWidthDp`. Emit returns the same
  // `"compact" | "regular"` string the web hook uses.
  if (calleeName === 'useSizeClass') {
    return { kind: 'size-class', name }
  }
  // Phase 5 — native data/services hooks. Each instantiates a runtime
  // service container (mirrors useOnline/usePermissions). No args (except
  // useWebSocket's url + useAuth's generic).
  if (calleeName === 'useGeolocation') {
    return { kind: 'geolocation', name }
  }
  if (calleeName === 'useSecureStorage') {
    // Lowered for real (the v1 warn-drop is gone): the deferral's stated
    // blocker — "Kotlin has no auto-constructible backend" — was resolved by
    // `KeystoreSecureBackend(context)` (PyreonSecureStorageAndroid.kt), so
    // both targets now construct a REAL encrypted default: Swift
    // `PyreonSecureStorage()` (Keychain), Kotlin
    // `PyreonSecureStorage(ctx)` (AndroidKeyStore AES-GCM) via the same
    // Context-threading shape as `useDatabase`.
    return { kind: 'secureStorage', name }
  }
  if (calleeName === 'useDatabase') {
    return { kind: 'database', name }
  }
  // `useFieldArray(['a', 'b'])` — the dynamic form-list container
  // (PyreonFieldArray on both targets, mirroring the web @pyreon/form
  // surface). The initial must be an array of string literals (or absent)
  // so it can be baked into the constructor — same literal rule as
  // useWebSocket's URL.
  if (calleeName === 'useFieldArray') {
    const arg = init.arguments?.[0]
    const initial: string[] = []
    if (arg !== undefined) {
      if (arg.type !== 'ArrayExpression') {
        ctx.warnings.push(
          `Declaration ${name}: useFieldArray initial must be an array literal of strings (or omitted); got ${arg.type}.`,
        )
        return null
      }
      for (const el of (arg.elements as AnyNode[] | undefined) ?? []) {
        if ((el?.type === 'Literal' || el?.type === 'StringLiteral') && typeof el.value === 'string') {
          initial.push(el.value as string)
        } else {
          ctx.warnings.push(
            `Declaration ${name}: useFieldArray initial elements must be string literals; got ${el?.type ?? 'nothing'}.`,
          )
          return null
        }
      }
    }
    return { kind: 'fieldArray', name, initial }
  }
  if (calleeName === 'usePush') {
    return { kind: 'push', name }
  }
  if (calleeName === 'usePayments') {
    return { kind: 'payments', name }
  }
  if (calleeName === 'useMap') {
    return { kind: 'map', name }
  }
  // `useAuth<User>()` — generic over the app's user type (mirrors
  // useFetch<T>'s generic capture). No-generic form falls back to a
  // placeholder type the emit handles.
  if (calleeName === 'useAuth') {
    return { kind: 'auth', name, userType: parseGenericTypeArg(init, ctx) }
  }
  // `useWebSocket('wss://…')` — the URL must be a string literal so it can
  // be baked into the emitted connect call (same rule as useFetch).
  if (calleeName === 'useWebSocket') {
    const urlArg = init.arguments?.[0]
    if (
      !urlArg ||
      (urlArg.type !== 'Literal' && urlArg.type !== 'StringLiteral') ||
      typeof urlArg.value !== 'string'
    ) {
      ctx.warnings.push(
        `Declaration ${name}: useWebSocket url argument must be a string literal; got ${urlArg?.type ?? 'nothing'}.`,
      )
      return null
    }
    return { kind: 'websocket', name, url: urlArg.value }
  }
  // EXCEPTION: an out-of-set `rx.<method>(...)` reached here because
  // `tryRxNamespaceLowering` warned + returned null (the method needs a
  // Strategy-B runtime port). `rx` is NOT a real native symbol, so binding it
  // as a value-const would emit uncompilable `let r = rx.method(...)` — keep
  // the deliberate warn-drop. (In-set rx methods become computeds earlier and
  // never reach here; only the dropped out-of-set ones do.)
  if (
    init.type === 'CallExpression' &&
    init.callee?.type === 'MemberExpression' &&
    init.callee.object?.type === 'Identifier' &&
    (init.callee.object.name as string | undefined) === 'rx'
  ) {
    return null
  }
  // Fallback — `const foo = <call>` binding an arbitrary call result that
  // none of the factory/hook branches above claimed: a signal/computed READ
  // (`const foo = o()`), a method-chain result (`const xs = arr.filter(p)`),
  // or a helper call (`const v = compute(x)`). Treat it as a value-const
  // (same shape as the non-CallExpression branch earlier): the emit binds it
  // and use sites read it. Previously these silently dropped → the local
  // became an unbound reference that broke the whole component, so binding is
  // strictly better; a genuinely-unemittable inner expression still produces
  // the same downstream failure it did when dropped. This also unblocks the
  // general object-destructure lowering above, which recurses into exactly
  // this single-binding shape.
  return { kind: 'value', name, expr: parseExpr(init, ctx) }
}

/**
 * v1 supported rx methods. Each name maps to per-target emit dispatch
 * in `emit-swift.ts` + `emit-kotlin.ts`. The list defines the closed
 * set; an unknown method name surfaces a directed warning and falls
 * through to the original silent-drop bug (strictly no regression vs
 * the original pre-RX-1 behaviour).
 *
 * v1 covers the full Strategy-A surface from the spec in
 * docs/src/content/docs/multiplatform-libraries.md — collection ops that lower to
 * native primitives on both Swift `[T]` and Kotlin `List<T>` without
 * a runtime port. The deferred set (`pipe` / `debounce` / `throttle`
 * / `combine` / `zip` / `merge` / `scan` / `distinct` / `search`)
 * carries state OR scheduling and needs Strategy B — runtime ports.
 *
 * Methods deliberately deferred from v1 (need bigger emit shapes):
 *   - `partition` (returns tuple)
 *   - `groupBy` / `keyBy` / `uniqBy` (key-extractor → dict)
 *   - `mapValues` (operates on dict, not list)
 *   - `sortBy` with string-key variant (needs cross-target key emit)
 *   - `sample` (RNG seeded per platform)
 *   - `chunk` (Swift needs stride-based slicing — verbose)
 */

/**
 * RX — `@pyreon/rx` namespace lowering. See the long-form rationale at
 * the call site in `tryExtractDecl`.
 *
 * Detects `const name = rx.METHOD(signal, ...)` shapes and rewrites them
 * into a `computed` DeclIR whose body is a `kind: 'rx-call'` ExprIR.
 * The per-target emitters (`emit-swift.ts` / `emit-kotlin.ts`) dispatch
 * on the method name and produce idiomatic Swift / Kotlin native
 * collection calls.
 *
 * Returns `null` when:
 *   - the callee isn't a MemberExpression
 *   - the MemberExpression's object isn't a bare `rx` identifier
 *   - the rx method isn't in v1's supported set (warning fires)
 *   - the source argument is missing
 *
 * Null falls through to the existing `calleeName === 'signal' | ...`
 * recognition chain. Unknown methods get a directed warning instead of
 * the original silent-drop — strictly better than `main`.
 */

// --- useQuery options-function extraction (v1) --------------------------------

/**
 * The object literal an arrow function returns, for both the concise form
 * `() => ({ … })` and the block form `() => { return { … } }`. Returns
 * undefined for anything else (so the caller warns + bails).
 */
function arrowReturnedObject(arrow: AnyNode): AnyNode | undefined {
  const body = arrow?.body
  if (!body) return undefined
  // Concise: `() => ({...})` — the body IS the ObjectExpression (the parens are
  // grouping the parser drops). Some parsers wrap in ParenthesizedExpression.
  if (body.type === 'ObjectExpression') return body
  if (body.type === 'ParenthesizedExpression' && body.expression?.type === 'ObjectExpression') {
    return body.expression
  }
  // Block: `() => { return {...} }` — find the (single) return of an object.
  if (body.type === 'BlockStatement') {
    for (const st of (body.body as AnyNode[] | undefined) ?? []) {
      if (st.type === 'ReturnStatement') {
        const arg = st.argument
        if (arg?.type === 'ObjectExpression') return arg
        if (arg?.type === 'ParenthesizedExpression' && arg.expression?.type === 'ObjectExpression') {
          return arg.expression
        }
      }
    }
  }
  return undefined
}

/**
 * Colon-join a `queryKey` array of string/number literals into the native
 * cache key. `['todos', 5]` → `"todos:5"`. Returns undefined if the node is
 * not an array of literals (v1 rejects reactive/computed keys).
 */
function tryQueryKeyString(node: AnyNode): string | undefined {
  if (!node || node.type !== 'ArrayExpression') return undefined
  const parts: string[] = []
  for (const el of (node.elements as AnyNode[] | undefined) ?? []) {
    if (!el) return undefined
    const isLit = el.type === 'Literal' || el.type === 'StringLiteral' || el.type === 'NumericLiteral'
    if (!isLit || (typeof el.value !== 'string' && typeof el.value !== 'number')) return undefined
    parts.push(String(el.value))
  }
  if (parts.length === 0) return undefined
  return parts.join(':')
}

/**
 * Extract the literal URL + optional init object from an inline
 * `queryFn: () => fetch('<url>', { method, headers, body })` (also
 * `() => fetch('<url>').then(r => r.json())`, or a block body returning one).
 * Walks the arrow's body for the first `fetch(<string-literal>, init?)` call.
 * Returns `{ url, init }` (init = the second-argument AST node, if any), or
 * undefined for a function reference or a non-literal fetch URL (v1 follow-up).
 */
function tryQueryFnFetch(node: AnyNode): { url: string; init?: AnyNode } | undefined {
  if (
    !node ||
    (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression')
  ) {
    return undefined
  }
  let found: { url: string; init?: AnyNode } | undefined
  const visit = (n: AnyNode): void => {
    if (found || !n || typeof n !== 'object') return
    if (
      n.type === 'CallExpression' &&
      n.callee?.type === 'Identifier' &&
      n.callee.name === 'fetch'
    ) {
      const arg = n.arguments?.[0]
      if (
        (arg?.type === 'Literal' || arg?.type === 'StringLiteral') &&
        typeof arg.value === 'string'
      ) {
        found = { url: arg.value, init: n.arguments?.[1] }
        return
      }
    }
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') {
        continue
      }
      const child = (n as Record<string, AnyNode>)[key]
      if (Array.isArray(child)) {
        for (const c of child) visit(c)
      } else if (child && typeof child === 'object') {
        visit(child)
      }
    }
  }
  visit(node.body)
  return found
}

/**
 * Parse a `fetch(url, { method, headers, body })` init object into the literal
 * request fields. Mirrors the useFetch rule: literals are baked, anything
 * non-literal WARNS (a silently-wrong verb/body is worse than a missing
 * feature). Returns the request fields; a missing/non-object init → GET.
 */
function parseFetchInitObject(
  initNode: AnyNode,
  name: string,
  ctx: ParseCtx,
): { method?: string; headers?: Record<string, string>; body?: string } {
  const req: { method?: string; headers?: Record<string, string>; body?: string } = {}
  if (!initNode) return req
  if (initNode.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `Declaration ${name}: useQuery queryFn fetch init must be an object literal to lower to native; got ${initNode.type}. The request will be a plain GET.`,
    )
    return req
  }
  for (const prop of (initNode.properties as AnyNode[] | undefined) ?? []) {
    if (prop.type !== 'Property' || prop.computed) continue
    const key =
      prop.key?.type === 'Identifier'
        ? prop.key.name
        : typeof prop.key?.value === 'string'
          ? prop.key.value
          : undefined
    if (!key) continue
    const value = prop.value as AnyNode | undefined
    const isStringLit =
      (value?.type === 'Literal' || value?.type === 'StringLiteral') &&
      typeof value.value === 'string'
    if (key === 'method') {
      if (!isStringLit) {
        ctx.warnings.push(
          `Declaration ${name}: useQuery queryFn fetch method must be a string literal to lower to native; got ${value?.type ?? 'nothing'}. The request will be a plain GET.`,
        )
        continue
      }
      req.method = String(value!.value).toUpperCase()
    } else if (key === 'body') {
      if (!isStringLit) {
        ctx.warnings.push(
          `Declaration ${name}: useQuery queryFn fetch body must be a string literal to lower to native; got ${value?.type ?? 'nothing'}. The request will be sent with NO body.`,
        )
        continue
      }
      req.body = String(value!.value)
    } else if (key === 'headers') {
      if (value?.type !== 'ObjectExpression') {
        ctx.warnings.push(
          `Declaration ${name}: useQuery queryFn fetch headers must be an object literal to lower to native; got ${value?.type ?? 'nothing'}. Headers will be omitted.`,
        )
        continue
      }
      const headers: Record<string, string> = {}
      for (const h of (value.properties as AnyNode[] | undefined) ?? []) {
        if (h.type !== 'Property' || h.computed) continue
        const hk =
          h.key?.type === 'Identifier'
            ? h.key.name
            : typeof h.key?.value === 'string'
              ? h.key.value
              : undefined
        const hv = h.value
        if (hk && (hv?.type === 'Literal' || hv?.type === 'StringLiteral') && typeof hv.value === 'string') {
          headers[hk] = hv.value
        }
      }
      if (Object.keys(headers).length > 0) req.headers = headers
    }
  }
  return req
}

/**
 * Collect the local names imported from `@pyreon/rx`, mapped to their
 * ORIGINAL export name. Only the standalone transforms belong here — the
 * `rx` namespace object has its own recognizer.
 */
function collectRxImportedNames(body: AnyNode[], ctx: ParseCtx): void {
  for (const node of body) {
    if (node.type !== 'ImportDeclaration') continue
    if (node.source?.value !== '@pyreon/rx') continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type !== 'ImportSpecifier') continue
      const imported = spec.imported?.name as string | undefined
      const local = spec.local?.name as string | undefined
      if (imported && local && imported !== 'rx') ctx.rxImportedNames.set(local, imported)
    }
  }
}

/**
 * `pipe(source, f1, f2, …)` does NOT lower, and this is a measured answer
 * rather than an untested guess.
 *
 * The natural emit is an immediately-applied closure per stage
 * (`{ xs in … }(nums)`), which discards the parameter's type. Compiled
 * against both real toolchains that fails on each — Swift with "value of
 * type 'Any' has no member 'count'", Kotlin with "cannot infer type for type
 * parameter 'T'". Inlining each stage by substituting its parameter would fix
 * it and is the follow-up; emitting the closure form meanwhile would ship
 * code that does not build.
 *
 * The collection transforms it composes DO lower, so the advice names a real
 * alternative rather than an escape hatch.
 */
function tryRxPipeLowering(name: string, ctx: ParseCtx): DeclIR | null {
  ctx.warnings.push(
    `Declaration ${name}: pipe() has no native lowering — each stage would emit as an immediately-applied closure, which loses its parameter type and fails to compile on both targets. Chain the standalone transforms instead (const a = filter(src, p); const b = map(a, f)), which do lower, or keep the call behind a \`<Web>\` escape hatch.`,
  )
  return null
}

function tryRxNamespaceLowering(
  name: string,
  init: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  const callee = init.callee as AnyNode | undefined
  let methodName: string | undefined
  if (callee?.type === 'MemberExpression') {
    const obj = callee.object as AnyNode | undefined
    if (obj?.type !== 'Identifier' || (obj.name as string | undefined) !== 'rx') return null
    const prop = callee.property as AnyNode | undefined
    if (prop?.type !== 'Identifier') return null
    methodName = prop.name as string | undefined
  } else if (callee?.type === 'Identifier') {
    // STANDALONE form, resolved through the IMPORT — never the bare name.
    methodName = ctx.rxImportedNames.get(callee.name as string)
    if (methodName === undefined) return null
  } else {
    return null
  }
  if (!methodName) return null
  if (methodName === 'pipe') return tryRxPipeLowering(name, ctx)

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const sourceArg = args[0]
  if (!sourceArg) {
    ctx.warnings.push(
      `Declaration ${name}: rx.${methodName} requires a signal source as its first argument.`,
    )
    return null
  }
  if (!RX_V1_METHODS.has(methodName)) {
    ctx.warnings.push(
      `Declaration ${name}: rx.${methodName} is not yet lowered to native (v1 covers ${[...RX_V1_METHODS].join(' / ')}; remaining methods need Strategy B runtime ports — see docs/src/content/docs/multiplatform-libraries.md).`,
    )
    return null
  }

  // Build the rx-call IR. The source signal becomes `signalName()` (a
  // no-arg call expression that the per-target emit lowers to the
  // unwrapped state binding). Args are method args (predicate, count,
  // initial value, etc.) — passed through verbatim.
  //
  // The rx-call IR is target-agnostic: each emitter switches on
  // `method` and produces idiomatic Swift / Kotlin. See
  // `emitSwiftExpr` / `emitKotlinExpr` `case 'rx-call':` blocks.
  const sourceExpr = parseExpr(sourceArg, ctx)
  const sourceCall: ExprIR = { kind: 'call', callee: sourceExpr, args: [] }
  const restArgs = args.slice(1).map((a) => parseExpr(a, ctx))
  const rxCallExpr: ExprIR = {
    kind: 'rx-call',
    method: methodName,
    source: sourceCall,
    args: restArgs,
  }
  return { kind: 'computed', name, expr: rxCallExpr }
}

/**
 * Gap 4 PR-2 (2026-06-05 native-readiness audit) — `createMachine({
 * initial, states })` from `@pyreon/machine` → DeclIR.machine.
 *
 * Extracts the literal `initial` string + the literal `states` map
 * (state name → event map → next state name). Non-literal configs
 * fall through to null so the parent falls through to the Tier-2
 * silent-drop diagnostic (binding emits unresolved with a warning).
 *
 * The `as const` on `initial: 'idle' as const` is unwrapped via the
 * shared `unwrapTypeLayers` helper.
 *
 * Method calls on the binding (`m.send(...)` / `m.matches(...)` /
 * `m.can(...)` / `m.nextEvents()`) flow through emit as-is — the
 * PyreonMachine runtime container defines them. `m()` also works as
 * a current-state read via Swift `callAsFunction()` / Kotlin
 * `operator fun invoke()` — no compiler-side member-access rewriting
 * needed.
 */
function tryDeclFromCreateMachine(
  node: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  const init = node.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  const calleeName = init.callee?.name as string | undefined
  if (calleeName !== 'createMachine') return null
  if (node.id?.type !== 'Identifier') return null
  const name = node.id.name as string

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const configArg = args[0]
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `createMachine declaration \`${name}\`: config argument is not an object literal — emit needs the literal { initial, states } shape to bake the transition table. Falling back to silent-drop.`,
    )
    return null
  }

  // Walk the config object: pick out `initial: 'X'` and `states: { ... }`.
  let initial: string | undefined
  let statesNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const keyName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'initial') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
        initial = valueNode.value
      }
    } else if (keyName === 'states') {
      statesNode = valueNode
    }
  }

  if (!initial) {
    ctx.warnings.push(
      `createMachine declaration \`${name}\`: \`initial\` field is missing or not a string literal — required to seed PyreonMachine. Falling back to silent-drop.`,
    )
    return null
  }
  if (!statesNode || statesNode.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `createMachine declaration \`${name}\`: \`states\` field is missing or not an object literal — required to bake the transition table. Falling back to silent-drop.`,
    )
    return null
  }

  // Parse the states map: { stateName: { on: { EVENT: nextState } }, ... }
  // Empty state objects (`done: {}`) are kept as states with no transitions —
  // they're valid terminal states.
  const transitions: Record<string, Record<string, string>> = {}
  for (const stateProp of (statesNode.properties as AnyNode[] | undefined) ?? []) {
    if (stateProp?.type !== 'Property' && stateProp?.type !== 'ObjectProperty') continue
    const stateKeyNode = stateProp.key as AnyNode | undefined
    const stateName =
      stateKeyNode?.type === 'Identifier'
        ? (stateKeyNode.name as string)
        : stateKeyNode?.type === 'Literal'
          ? String(stateKeyNode.value)
          : undefined
    if (!stateName) continue
    const stateConfig = unwrapTypeLayers(stateProp.value as AnyNode | undefined)
    transitions[stateName] = {}
    if (stateConfig?.type !== 'ObjectExpression') continue
    // Find `on: { EVENT: nextState }`
    for (const innerProp of (stateConfig.properties as AnyNode[] | undefined) ?? []) {
      if (innerProp?.type !== 'Property' && innerProp?.type !== 'ObjectProperty') continue
      const innerKeyNode = innerProp.key as AnyNode | undefined
      const innerKey =
        innerKeyNode?.type === 'Identifier'
          ? (innerKeyNode.name as string)
          : innerKeyNode?.type === 'Literal'
            ? String(innerKeyNode.value)
            : undefined
      if (innerKey !== 'on') continue
      const eventsMap = unwrapTypeLayers(innerProp.value as AnyNode | undefined)
      if (eventsMap?.type !== 'ObjectExpression') continue
      for (const eventProp of (eventsMap.properties as AnyNode[] | undefined) ?? []) {
        if (eventProp?.type !== 'Property' && eventProp?.type !== 'ObjectProperty') continue
        const evKeyNode = eventProp.key as AnyNode | undefined
        const eventName =
          evKeyNode?.type === 'Identifier'
            ? (evKeyNode.name as string)
            : evKeyNode?.type === 'Literal'
              ? String(evKeyNode.value)
              : undefined
        const evVal = unwrapTypeLayers(eventProp.value as AnyNode | undefined)
        if (
          eventName &&
          evVal?.type === 'Literal' &&
          typeof evVal.value === 'string'
        ) {
          transitions[stateName]![eventName] = evVal.value
        }
      }
    }
  }

  return { kind: 'machine', name, initial, transitions }
}

/**
 * Phase 4 — pull literal string elements out of an array argument
 * (`['a', 'b']`). Used to seed `usePermissions`' initial grant set. Returns
 * the string-literal entries; a missing / non-array / non-literal argument
 * yields an empty array so the caller never bails.
 */
/**
 * Gap 4 PR-3 — `createI18n({ locale, messages, fallbackLocale? })` from
 * `@pyreon/i18n/core` → DeclIR.i18n.
 *
 * Extracts the literal `locale` string + the literal `messages` map
 * (locale → key → value) + optional `fallbackLocale`. Non-literal
 * configs warn and fall through to silent-drop.
 *
 * v1 SCOPE: string keys, string values. Async loaders, nested message
 * objects beyond one-level (e.g. `{ user: { greeting: '...' } }`),
 * pluralization suffixes, interpolation, namespaces are deferred.
 * Top-level dot-keys ARE preserved verbatim so a `{ 'section.title':
 * 'Report' }` shape works for the lookup-by-flat-key v1 contract.
 */
function tryDeclFromCreateI18n(
  node: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  const init = node.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  const calleeName = init.callee?.name as string | undefined
  if (calleeName !== 'createI18n') return null
  if (node.id?.type !== 'Identifier') return null
  const name = node.id.name as string

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const configArg = args[0]
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `createI18n declaration \`${name}\`: config argument is not an object literal — emit needs the literal { locale, messages, fallbackLocale? } shape. Falling back to silent-drop.`,
    )
    return null
  }

  let locale: string | undefined
  let fallbackLocale: string | undefined
  let messagesNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const keyNode = prop.key as AnyNode | undefined
    const keyName =
      keyNode?.type === 'Identifier'
        ? (keyNode.name as string)
        : keyNode?.type === 'Literal'
          ? String(keyNode.value)
          : undefined
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'locale') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
        locale = valueNode.value
      }
    } else if (keyName === 'fallbackLocale') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
        fallbackLocale = valueNode.value
      }
    } else if (keyName === 'messages') {
      messagesNode = valueNode
    }
  }

  if (!locale) {
    ctx.warnings.push(
      `createI18n declaration \`${name}\`: \`locale\` field is missing or not a string literal — required to seed PyreonI18n. Falling back to silent-drop.`,
    )
    return null
  }
  if (!messagesNode || messagesNode.type !== 'ObjectExpression') {
    ctx.warnings.push(
      `createI18n declaration \`${name}\`: \`messages\` field is missing or not an object literal — required to bake the translation table. Falling back to silent-drop.`,
    )
    return null
  }

  // Parse `messages: { en: { hello: 'Hi' } }` into the nested record.
  const messages: Record<string, Record<string, string>> = {}
  for (const localeProp of (messagesNode.properties as AnyNode[] | undefined) ?? []) {
    if (localeProp?.type !== 'Property' && localeProp?.type !== 'ObjectProperty') continue
    const locKeyNode = localeProp.key as AnyNode | undefined
    const locName =
      locKeyNode?.type === 'Identifier'
        ? (locKeyNode.name as string)
        : locKeyNode?.type === 'Literal'
          ? String(locKeyNode.value)
          : undefined
    if (!locName) continue
    const dict = unwrapTypeLayers(localeProp.value as AnyNode | undefined)
    messages[locName] = {}
    if (dict?.type !== 'ObjectExpression') continue
    for (const entry of (dict.properties as AnyNode[] | undefined) ?? []) {
      if (entry?.type !== 'Property' && entry?.type !== 'ObjectProperty') continue
      const eKey = entry.key as AnyNode | undefined
      const k =
        eKey?.type === 'Identifier'
          ? (eKey.name as string)
          : eKey?.type === 'Literal'
            ? String(eKey.value)
            : undefined
      const eVal = unwrapTypeLayers(entry.value as AnyNode | undefined)
      if (k && eVal?.type === 'Literal' && typeof eVal.value === 'string') {
        messages[locName]![k] = eVal.value
      }
      // Nested objects + interpolation tokens are v1-out-of-scope —
      // silently dropped at the per-key level (the IR still has the
      // locale entry).
    }
  }

  const result: DeclIR = { kind: 'i18n', name, locale, messages }
  if (fallbackLocale !== undefined) {
    return { ...result, fallbackLocale }
  }
  return result
}

function tryExtractStringArray(arg: AnyNode | undefined): string[] {
  if (!arg || arg.type !== 'ArrayExpression') return []
  const out: string[] = []
  for (const el of (arg.elements as AnyNode[] | undefined) ?? []) {
    if (
      el &&
      (el.type === 'Literal' || el.type === 'StringLiteral') &&
      typeof el.value === 'string'
    ) {
      out.push(el.value)
    }
  }
  return out
}

/**
 * Phase 4.2 — pull the literal `initialValues` map out of a
 * `useForm({ initialValues: { email: 'a@b.com' } })` config. Returns the
 * string-keyed string-literal pairs; everything else (missing config,
 * non-object `initialValues`, non-string entries) is silently dropped so
 * the caller always gets a (possibly empty) array — `useForm` never bails.
 */
function tryExtractFormInitialValues(
  arg: AnyNode | undefined,
): { key: string; value: string }[] {
  if (!arg || arg.type !== 'ObjectExpression') return []
  const props = arg.properties as AnyNode[] | undefined
  if (!props) return []
  const ivProp = props.find(
    (p) =>
      p?.type === 'Property' &&
      p?.key?.type === 'Identifier' &&
      p?.key?.name === 'initialValues',
  )
  if (!ivProp || ivProp.value?.type !== 'ObjectExpression') return []
  const out: { key: string; value: string }[] = []
  for (const p of (ivProp.value.properties as AnyNode[] | undefined) ?? []) {
    if (p?.type !== 'Property') continue
    // Object keys are Identifiers (`email:`) or string literals (`'email':`).
    const key =
      (p.key?.type === 'Identifier' ? (p.key.name as string) : undefined) ??
      (typeof p.key?.value === 'string' ? (p.key.value as string) : undefined)
    const v = p.value
    if (
      key !== undefined &&
      (v?.type === 'Literal' || v?.type === 'StringLiteral') &&
      typeof v.value === 'string'
    ) {
      out.push({ key, value: v.value })
    }
  }
  return out
}

/**
 * Phase C5 — extract the `routes: [...]` array from the first arg of a
 * `createRouter({...})` call. Returns null when the shape is anything
 * other than the canonical literal-config form, so the caller falls
 * back to the C4 bare-instance emit (back-compat).
 *
 * Recognised shape:
 *   createRouter({
 *     routes: [
 *       { path: '/', component: Home },
 *       { path: '/users/:id', component: User },
 *     ]
 *   })
 *
 * Bail conditions (return null):
 *   - first arg missing or not an ObjectExpression
 *   - `routes` property missing or not an ArrayExpression
 *   - any array element not an ObjectExpression
 *   - any element missing `path` (string literal) or `component` (expr)
 *
 * Bail is conservative — uncertain shapes drop ALL routes, keeping the
 * scaffold emit. The compiler never emits a partial route table.
 */
function tryExtractRoutes(arg: AnyNode | undefined, ctx: ParseCtx): RouteIR[] | null {
  if (!arg || arg.type !== 'ObjectExpression') return null
  const props = arg.properties as AnyNode[] | undefined
  if (!props) return null
  const routesProp = props.find(
    (p) =>
      p?.type === 'Property' &&
      p?.key?.type === 'Identifier' &&
      p?.key?.name === 'routes',
  )
  if (!routesProp) return null
  return parseRouteArray(routesProp.value, ctx)
}

/**
 * Global-guards helper — extracts identifier refs from a `beforeEach: [fn1, fn2]`
 * / `afterEach: [fn1]` field on the createRouter config. Returns an empty
 * array if the field is absent / non-array / contains no identifier refs
 * (each silently dropped). Conservative: only IDENTIFIER REFS land in
 * the result; inline arrow bodies and member expressions are dropped
 * because they'd need closure-emit + capture machinery the per-route
 * boolean-guard shape doesn't carry into this PR.
 */
function tryExtractGuardRefArray(arg: AnyNode | undefined, key: string): string[] {
  if (!arg || arg.type !== 'ObjectExpression') return []
  const props = arg.properties as AnyNode[] | undefined
  if (!props) return []
  const prop = props.find(
    (p) =>
      p?.type === 'Property' &&
      p?.key?.type === 'Identifier' &&
      p?.key?.name === key,
  )
  if (!prop) return []
  const value = prop.value as AnyNode | undefined
  if (!value || value.type !== 'ArrayExpression') return []
  const out: string[] = []
  for (const el of (value.elements as AnyNode[] | undefined) ?? []) {
    if (el?.type === 'Identifier' && typeof el.name === 'string') {
      out.push(el.name as string)
    }
    // Non-identifier elements (arrow expressions, member access, etc.)
    // are silently dropped — closure-emit is a documented follow-up.
  }
  return out
}

/**
 * Parse a literal array of route-config objects into RouteIR[]. Shared by
 * the top-level `routes:` extraction and the nested `children:` recursion
 * (Phase 3 nested routes). Conservative: any non-literal / wrong-shape
 * element bails the WHOLE array to null (the compiler never emits a partial
 * route table) — same discipline as the original tryExtractRoutes.
 */
function parseRouteArray(arr: AnyNode | undefined, ctx: ParseCtx): RouteIR[] | null {
  if (!arr || arr.type !== 'ArrayExpression') return null
  const out: RouteIR[] = []
  for (const el of (arr.elements as AnyNode[] | undefined) ?? []) {
    if (!el || el.type !== 'ObjectExpression') return null
    const elProps = el.properties as AnyNode[] | undefined
    if (!elProps) return null
    let path: string | undefined
    let component: ExprIR | undefined
    let redirect: string | undefined
    let guard: ExprIR | undefined
    let children: RouteIR[] | undefined
    let loader: ExprIR | undefined
    let loaderUsesParams = false
    for (const p of elProps) {
      if (p?.type !== 'Property') continue
      const key = p.key?.name as string | undefined
      if (key === 'path') {
        const v = p.value
        if (
          (v?.type === 'Literal' || v?.type === 'StringLiteral') &&
          typeof v.value === 'string'
        ) {
          path = v.value
        }
      } else if (key === 'component') {
        component = parseExpr(p.value, ctx)
      } else if (key === 'redirect') {
        // Phase 3 — only a literal redirect target is captured. Function
        // redirects / `throw redirect()` are a later arc; they leave
        // `redirect` undefined here so the route still needs a component.
        const v = p.value
        if (
          (v?.type === 'Literal' || v?.type === 'StringLiteral') &&
          typeof v.value === 'string'
        ) {
          redirect = v.value
        }
      } else if (key === 'beforeEnter') {
        // Phase 3 — boolean guard. Only an arrow with an EXPRESSION body
        // (`() => isAuthed()`) is captured; the body becomes the inline
        // dispatch condition. Block-body / async / throw-redirect guards
        // leave `guard` undefined → the route emits unguarded.
        const v = p.value
        if (v?.type === 'ArrowFunctionExpression' && v.body && v.body.type !== 'BlockStatement') {
          guard = parseExpr(v.body, ctx)
        } else if (v?.type === 'ArrowFunctionExpression' && v.body?.type === 'BlockStatement') {
          // Round-3 audit fix: a block-body arrow guard silently emits
          // an UNGUARDED route. Path is captured at this point (we're
          // inside the `path === '…'` branch's sibling), so name it in
          // the warning so the path forward is obvious.
          ctx.warnings.push(
            `Per-route \`beforeEnter\` guard for ${path !== undefined ? `route "${path}"` : 'a route'} is a block-body arrow — only expression-body arrows (\`() => isAuthed()\`) are extracted; this route emits UNGUARDED. Use the expression-body form or move the logic into a named function called from an expression-body arrow (\`() => checkAccess()\`).`,
          )
        }
      } else if (key === 'children') {
        // Phase 3 nested routes — recurse into the child array. A non-literal
        // / wrong-shape children array yields null → treated as no children
        // (the parent still needs its own component to render something).
        const parsed = parseRouteArray(p.value, ctx)
        if (parsed !== null && parsed.length > 0) children = parsed
      } else if (key === 'loader') {
        // Phase 3 — per-route data loader. EXPRESSION-body arrows only; the
        // body becomes the runtime load closure fired once on the route's
        // appear (→ `setLoaderData`). Two shapes:
        //   - `() => fetchAll()`            (zero-param)
        //   - `(ctx) => …ctx.params.id…`    (param-using — lowered: every
        //      `ctx.params.X` becomes `params["X"]`, read from the dispatch
        //      branch's `matchPath(path, "/x/:id")` binding; sets
        //      `loaderUsesParams` so the emitter binds `params`).
        // A block-body loader needs statement emit (later arc) and a `ctx`
        // used for anything OTHER than `ctx.params` (e.g. `ctx.request`) has
        // no value source — both leave `loader` undefined + warn (the route
        // renders with no loader; `useLoaderData()` returns nil).
        const v = p.value
        if (v?.type === 'ArrowFunctionExpression') {
          const paramCount = Array.isArray(v.params) ? v.params.length : 0
          const ctxName =
            paramCount > 0 && v.params[0]?.type === 'Identifier'
              ? (v.params[0].name as string)
              : undefined
          if (v.body?.type === 'BlockStatement') {
            ctx.warnings.push(
              `Route \`loader\` for ${path !== undefined ? `route "${path}"` : 'a route'} is a block-body arrow — v1 extracts only expression-body arrows (\`() => fetchAll()\`); this route emits with NO loader. Use the expression-body form or move the logic into a named function called from an expression-body arrow.`,
            )
          } else if (paramCount > 1 || (paramCount === 1 && ctxName === undefined)) {
            ctx.warnings.push(
              `Route \`loader\` for ${path !== undefined ? `route "${path}"` : 'a route'} has an unsupported parameter shape — v1 supports zero-param (\`() => fetchAll()\`) or a single \`(ctx) => …ctx.params.x…\` reader; this route emits with NO loader.`,
            )
          } else if (v.body && ctxName !== undefined) {
            // `(ctx) => …` — parse, then lower `ctx.params.x` → `params["x"]`.
            const lowered = lowerRouteParams(parseExpr(v.body, ctx), ctxName)
            if (lowered.residualCtx) {
              ctx.warnings.push(
                `Route \`loader\` for ${path !== undefined ? `route "${path}"` : 'a route'} reads \`${ctxName}\` for something other than \`${ctxName}.params.*\` — v1 only threads route params into a loader; this route emits with NO loader. Move other context into the component or a named function.`,
              )
            } else {
              loader = lowered.expr
              loaderUsesParams = lowered.usesParams
            }
          } else if (v.body) {
            // Zero-param expression-body loader (unchanged).
            loader = parseExpr(v.body, ctx)
          }
        }
      }
      // Other RouteRecord fields (name, meta, etc.) are intentionally
      // ignored — the rest extends when a real app needs it.
    }
    // A route must render SOMETHING: its own component, a redirect target,
    // OR child routes (a pure layout grouping with no index component).
    if (
      path === undefined ||
      (component === undefined && redirect === undefined && children === undefined)
    ) {
      return null
    }
    const route: RouteIR = { path }
    if (component !== undefined) route.component = component
    if (redirect !== undefined) route.redirect = redirect
    if (guard !== undefined) route.guard = guard
    if (children !== undefined) route.children = children
    if (loader !== undefined) route.loader = loader
    if (loaderUsesParams) route.loaderUsesParams = true
    out.push(route)
  }
  return out
}

/**
 * Parse `const fn = (params) => { body }` into a `function` DeclIR.
 * Handles both arrow body forms:
 *   - BlockStatement: multi-statement → StatementIR[] verbatim
 *   - Expression body: wraps in `[{ kind: 'return', expr }]`
 */
function tryFunctionDecl(
  name: string,
  arrow: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  // Parse parameters with optional type annotations. TS params shape:
  // `(id: T, id2: T2)` where each param is an Identifier with
  // `typeAnnotation.typeAnnotation`.
  //
  // DESTRUCTURED params (`({ a, b }: T) => …`) lower like the hook-result
  // destructure: synthesize a positional param `__pN` (typed from the
  // pattern's annotation — a named type resolves to the declared struct) +
  // PREPEND `let a = __pN.a` per key to the body. So the body references
  // `a`/`b` exactly as written, against the same struct/field access the
  // single-param shape `(p: T) => p.a` already emits. Only all-simple
  // patterns (`{ k }` / renamed `{ k: local }`) lower; a rest element or a
  // nested pattern warns + is left un-destructured (the param still emits
  // so the function stays well-formed).
  const params: { name: string; type: TypeIR }[] = []
  const destructurePrelude: StatementIR[] = []
  let synthParamIdx = 0
  for (const p of (arrow.params as AnyNode[] | undefined) ?? []) {
    if (p?.type === 'Identifier') {
      const paramName = p.name as string
      const annot = p.typeAnnotation?.typeAnnotation as AnyNode | undefined
      const type: TypeIR = annot ? parseTypeAnnotation(annot, ctx) : { kind: 'unknown' }
      params.push({ name: paramName, type })
    } else if (p?.type === 'ObjectPattern') {
      const synthName = `__p${synthParamIdx++}`
      const annot = p.typeAnnotation?.typeAnnotation as AnyNode | undefined
      const type: TypeIR = annot ? parseTypeAnnotation(annot, ctx) : { kind: 'unknown' }
      params.push({ name: synthName, type })
      const props = (p.properties as AnyNode[] | undefined) ?? []
      const allSimple =
        props.length > 0 &&
        props.every(
          (pr) =>
            pr?.type === 'Property' &&
            pr.key?.type === 'Identifier' &&
            pr.value?.type === 'Identifier',
        )
      if (allSimple) {
        for (const pr of props) {
          const key = (pr as AnyNode).key.name as string
          const local = (pr as AnyNode).value.name as string
          destructurePrelude.push({
            kind: 'let',
            name: local,
            expr: {
              kind: 'member',
              object: { kind: 'identifier', name: synthName },
              property: key,
            },
          })
        }
      } else {
        ctx.warnings.push(
          'Destructured parameter with a rest element / nested pattern was not lowered — use simple keys (`({ a, b }: T) => …`).',
        )
      }
    }
    // Array patterns + other shapes: skip (unchanged behavior).
  }

  // Return type annotation, if any. oxc carries it on `arrow.returnType.typeAnnotation`.
  const returnTypeNode = arrow.returnType?.typeAnnotation as AnyNode | undefined
  const returnType: TypeIR = returnTypeNode
    ? parseTypeAnnotation(returnTypeNode, ctx)
    : { kind: 'unknown' }

  const body = arrow.body as AnyNode
  let stmts: StatementIR[]
  if (body.type === 'BlockStatement') {
    stmts = parseStatementBlock(body, ctx)
  } else {
    // Concise arrow body (`const fn = () => expr`): wrap as
    // `{ return expr }` for uniformity. The emitter pattern-matches
    // this case to emit `private func fn() -> T { expr }` without
    // the explicit `return` keyword on Swift.
    stmts = [{ kind: 'return', expr: parseExpr(body, ctx) }]
  }

  // Prepend the destructure prelude (`let a = __pN.a`) so the body's
  // references to the destructured locals resolve.
  return {
    kind: 'function',
    name,
    params,
    returnType,
    body: destructurePrelude.length > 0 ? [...destructurePrelude, ...stmts] : stmts,
  }
}

/**
 * Walk a BlockStatement's statements into a StatementIR[]. Handles
 * the four TodoMVC-relevant kinds (let / if / return / expr); other
 * statement types warn + drop.
 */
function parseStatementBlock(block: AnyNode, ctx: ParseCtx): StatementIR[] {
  const out: StatementIR[] = []
  for (const stmt of (block.body as AnyNode[] | undefined) ?? []) {
    // Multi-declarator (`const a = 1, b = 2`) → split into N single-decl
    // statements (Swift + Kotlin both emit one `let`/`val` per binding;
    // there is no combined-declarator form on either target). Re-parse each
    // declarator through the single-decl path so every binding shape it
    // already supports (incl. value inference) carries over verbatim.
    if (stmt.type === 'VariableDeclaration' && ((stmt.declarations as AnyNode[])?.length ?? 0) > 1) {
      for (const d of stmt.declarations as AnyNode[]) {
        const single = parseStatement({ ...stmt, declarations: [d] }, ctx)
        if (single) out.push(single)
      }
      continue
    }
    // Body-local object destructure — `const { x, y } = <expr>` inside a
    // computed / function body. `parseStatement` drops it (the ObjectPattern
    // id has no `.name`). Expand here into block-scoped `let`s: a synthetic
    // container `let __pyDestrN = <expr>` + one `let <local> = __pyDestrN.<key>`
    // per key. These are real, properly-scoped block bindings (NOT the
    // component-level `hookFieldAliases` map, which would leak across sibling
    // computeds). Mirrors the component-level lowering in
    // tryDeclFromVarDeclarator. Rest / nested patterns bail the whole
    // expansion (allSimple guard) → fall through to the single-statement
    // warn-drop, never half-binding.
    if (
      stmt.type === 'VariableDeclaration' &&
      ((stmt.declarations as AnyNode[])?.length ?? 0) === 1 &&
      (stmt.declarations as AnyNode[])[0]?.id?.type === 'ObjectPattern' &&
      (stmt.declarations as AnyNode[])[0]?.init
    ) {
      const d = (stmt.declarations as AnyNode[])[0]!
      const props = (d.id.properties as AnyNode[] | undefined) ?? []
      const allSimple =
        props.length > 0 &&
        props.every(
          (p) =>
            p?.type === 'Property' &&
            p.key?.type === 'Identifier' &&
            p.value?.type === 'Identifier',
        )
      if (allSimple) {
        const synthName = `__pyDestr${ctx.hookDestructureCounter++}`
        out.push({ kind: 'let', name: synthName, expr: parseExpr(d.init as AnyNode, ctx) })
        for (const p of props) {
          const key = (p as AnyNode).key.name as string
          const local = (p as AnyNode).value.name as string
          out.push({
            kind: 'let',
            name: local,
            expr: {
              kind: 'member',
              object: { kind: 'identifier', name: synthName },
              property: key,
            },
          })
        }
        continue
      }
    }
    // Body-local ARRAY destructure — `const [a, b] = <expr>` (the parallel of
    // the object-destructure expansion above). `parseStatement` drops it (the
    // ArrayPattern id has no `.name`). Expand into a synthetic container `let
    // __pyDestrN = <expr>` + one indexed `let <local> = __pyDestrN[i]` per
    // element. Only the all-simple shape lowers — a hole (`[, b]` → null
    // element), rest (`[...r]`), default (`[a = 1]`), or nested pattern bails
    // the whole expansion (allSimple guard) → falls through to the single-
    // statement warn-drop, never a half-binding.
    if (
      stmt.type === 'VariableDeclaration' &&
      ((stmt.declarations as AnyNode[])?.length ?? 0) === 1 &&
      (stmt.declarations as AnyNode[])[0]?.id?.type === 'ArrayPattern' &&
      (stmt.declarations as AnyNode[])[0]?.init
    ) {
      const d = (stmt.declarations as AnyNode[])[0]!
      const els = (d.id.elements as (AnyNode | null)[] | undefined) ?? []
      const allSimple = els.length > 0 && els.every((el) => el?.type === 'Identifier')
      if (allSimple) {
        const synthName = `__pyDestr${ctx.hookDestructureCounter++}`
        out.push({ kind: 'let', name: synthName, expr: parseExpr(d.init as AnyNode, ctx) })
        els.forEach((el, i) => {
          out.push({
            kind: 'let',
            name: (el as AnyNode).name as string,
            expr: {
              kind: 'index',
              object: { kind: 'identifier', name: synthName },
              index: { kind: 'literal', value: i },
            },
          })
        })
        continue
      }
    }
    // A body-local destructure that did NOT match the all-simple expansions
    // above (nested `const {a:{b}} = o`, rest `const {a,...r}` / `[a,...r]`, or
    // default `const {a = 1}`) reaches here. `parseStatement` would SILENTLY
    // drop it (the ObjectPattern/ArrayPattern id has no `.name` → returns null),
    // leaving every later reference to the would-be locals UNBOUND → invalid
    // native code with NO warning (`var x: Any { b }` where `b` was never
    // declared). Fail LOUDLY instead, naming the escape hatch — zero silent
    // drops in the supported vocab. (Flat `const {x, y} = …` / `const [a, b]
    // = …` lower above; this only fires for the shapes that don't.)
    if (
      stmt.type === 'VariableDeclaration' &&
      ((stmt.declarations as AnyNode[])?.length ?? 0) === 1 &&
      ((stmt.declarations as AnyNode[])[0]?.id?.type === 'ObjectPattern' ||
        (stmt.declarations as AnyNode[])[0]?.id?.type === 'ArrayPattern') &&
      (stmt.declarations as AnyNode[])[0]?.init
    ) {
      ctx.warnings.push(
        'Nested / rest / default destructuring in a function body is not lowered to native — bind the fields explicitly (`const a = o().a; const b = a.b`). Only flat `const { x, y } = …` and `const [a, b] = …` lower.',
      )
      continue
    }
    // Statement-position comma operator (`a.set(1), b.set(2);`) — expand
    // each sub-expression into its own statement (the sequence value is
    // discarded here; only VALUE-position sequences keep the warning).
    if (
      stmt.type === 'ExpressionStatement' &&
      (stmt.expression as AnyNode | undefined)?.type === 'SequenceExpression'
    ) {
      for (const x of ((stmt.expression as AnyNode).expressions as AnyNode[]) ?? []) {
        out.push({ kind: 'expr', expr: parseExpr(x, ctx) })
      }
      continue
    }
    const parsed = parseStatement(stmt, ctx)
    if (parsed) out.push(parsed)
  }
  markReassignedLocalsMutable(out)
  return out
}

/**
 * A `let`/`val` local that is later REASSIGNED (an `assign` statement with a
 * bare-identifier target) must emit as `var` so the reassignment typechecks
 * on Swift + Kotlin. Collect every identifier reassigned anywhere in the
 * block (incl. nested loop/if bodies — a loop accumulator is declared in the
 * outer scope and mutated inside the loop) and flip the matching `let`'s
 * `mutable` flag. Conservative: only bare-identifier targets promote a local;
 * member/index reassignment doesn't declare a local.
 */
function markReassignedLocalsMutable(stmts: StatementIR[]): void {
  const reassigned = new Set<string>()
  const collect = (list: StatementIR[]): void => {
    for (const s of list) {
      if (s.kind === 'assign' && s.target.kind === 'identifier') reassigned.add(s.target.name)
      // A bare `i++` / `i--` STATEMENT mutates `i` — it must promote the
      // local to `var`, exactly like an `assign`. Without this the loop
      // counter stayed `let` and Swift/Kotlin rejected the in-loop mutation.
      else if (
        s.kind === 'expr' &&
        s.expr.kind === 'update' &&
        s.expr.argument.kind === 'identifier'
      ) {
        reassigned.add(s.expr.argument.name)
      } else if (s.kind === 'if') {
        collect(s.then)
        if (s.elseBody) collect(s.elseBody)
      } else if (
        s.kind === 'while' ||
        s.kind === 'for-of' ||
        s.kind === 'for-range' ||
        s.kind === 'do-while'
      )
        collect(s.body)
      else if (s.kind === 'switch') for (const c of s.cases) collect(c.body)
      // Assignments inside CALLBACK arrows (`nums.forEach(x => { acc = acc +
      // x })` — the accumulate idiom) live in EXPRESSION trees, which the
      // per-kind statement walk above never enters — the outer `let acc`
      // stayed immutable and Kotlin rejected "'val' cannot be reassigned"
      // (Swift the same). A generic structural walk finds every nested
      // arrow's statement list. Over-marking is harmless (a same-named
      // arrow-LOCAL assignment promotes the outer local to var — a
      // never-mutated var is a compiler warning, not an error).
      walkForNestedArrows(s)
    }
  }
  const walkForNestedArrows = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walkForNestedArrows(x)
      return
    }
    if (n === null || typeof n !== 'object') return
    const node = n as Record<string, unknown> & { kind?: string; stmts?: StatementIR[] }
    if (node.kind === 'arrow' && Array.isArray(node.stmts) && node.stmts.length > 0) {
      collect(node.stmts)
    }
    for (const k of Object.keys(node)) {
      if (k === 'then' || k === 'elseBody' || k === 'body' || k === 'cases') continue // already walked per-kind
      walkForNestedArrows(node[k])
    }
  }
  collect(stmts)
  if (reassigned.size === 0) return
  const mark = (list: StatementIR[]): void => {
    for (const s of list) {
      if (s.kind === 'let' && reassigned.has(s.name)) s.mutable = true
      else if (s.kind === 'if') {
        mark(s.then)
        if (s.elseBody) mark(s.elseBody)
      } else if (
        s.kind === 'while' ||
        s.kind === 'for-of' ||
        s.kind === 'for-range' ||
        s.kind === 'do-while'
      )
        mark(s.body)
      else if (s.kind === 'switch') for (const c of s.cases) mark(c.body)
    }
  }
  mark(stmts)
}

/**
 * Classify a ForStatement as the canonical count-loop → `for-range` IR,
 * or null when any part is non-canonical (the caller warns). Canonical:
 * init `let/var i = <expr>`; test `i < LIMIT` / `i <= LIMIT`; update
 * `i++` / `++i` / `i += K` (positive numeric literal K); and the body
 * never REASSIGNS the counter (Swift's range binding is a `let`).
 */
function classifyForRange(
  node: AnyNode,
  ctx: ParseCtx,
): Extract<StatementIR, { kind: 'for-range' }> | null {
  const init = node.init as AnyNode | undefined
  const test = node.test as AnyNode | undefined
  const update = node.update as AnyNode | undefined
  if (!init || !test || !update) return null
  if (init.type !== 'VariableDeclaration') return null
  const decls = (init.declarations as AnyNode[] | undefined) ?? []
  if (decls.length !== 1 || decls[0]?.id?.type !== 'Identifier' || !decls[0]?.init) return null
  const item = decls[0].id.name as string
  if (
    test.type !== 'BinaryExpression' ||
    (test.operator !== '<' && test.operator !== '<=') ||
    (test.left as AnyNode)?.type !== 'Identifier' ||
    (test.left as AnyNode)?.name !== item
  ) {
    return null
  }
  let step: ExprIR | undefined
  if (
    update.type === 'UpdateExpression' &&
    update.operator === '++' &&
    (update.argument as AnyNode)?.type === 'Identifier' &&
    (update.argument as AnyNode)?.name === item
  ) {
    step = undefined
  } else if (
    update.type === 'AssignmentExpression' &&
    update.operator === '+=' &&
    (update.left as AnyNode)?.type === 'Identifier' &&
    (update.left as AnyNode)?.name === item &&
    ((update.right as AnyNode)?.type === 'Literal' ||
      (update.right as AnyNode)?.type === 'NumericLiteral') &&
    typeof (update.right as AnyNode)?.value === 'number' &&
    ((update.right as AnyNode).value as number) > 0
  ) {
    step = { kind: 'literal', value: (update.right as AnyNode).value as number }
  } else {
    return null
  }
  // The body must not REASSIGN the counter — walk the raw AST before
  // parsing (an inner shadowing loop with the same name is rare enough
  // to accept the conservative bail).
  if (astReassignsIdent(node.body as AnyNode, item)) return null
  const body = parseLoopBody(node.body as AnyNode, ctx)
  return {
    kind: 'for-range',
    item,
    from: parseExpr(decls[0].init as AnyNode, ctx),
    to: parseExpr(test.right as AnyNode, ctx),
    ...(test.operator === '<=' ? { inclusive: true } : {}),
    ...(step !== undefined ? { step } : {}),
    body,
  }
}

/** Does any AST node under `root` write to identifier `name`? */
function astReassignsIdent(root: AnyNode, name: string): boolean {
  let found = false
  const walk = (n: unknown): void => {
    if (found || n === null || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const x of n) walk(x)
      return
    }
    const node = n as AnyNode
    if (
      (node.type === 'AssignmentExpression' &&
        (node.left as AnyNode)?.type === 'Identifier' &&
        (node.left as AnyNode)?.name === name) ||
      (node.type === 'UpdateExpression' &&
        (node.argument as AnyNode)?.type === 'Identifier' &&
        (node.argument as AnyNode)?.name === name)
    ) {
      found = true
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'loc' || key === 'range' || key === 'span') continue
      walk((node as Record<string, unknown>)[key])
    }
  }
  walk(root)
  return found
}

function parseStatement(node: AnyNode, ctx: ParseCtx): StatementIR | null {
  switch (node.type) {
    case 'VariableDeclaration': {
      // Only single-decl `const`/`let`/`var` for now — multi-declarator
      // (`const a = 1, b = 2`) is rare in real Pyreon code; warn + drop.
      const declarators = (node.declarations as AnyNode[] | undefined) ?? []
      if (declarators.length !== 1) {
        ctx.warnings.push(
          `Unsupported statement: multi-declarator VariableDeclaration (${declarators.length} decls).`,
        )
        return null
      }
      const d = declarators[0]!
      const declName = d.id?.name as string | undefined
      if (!declName || !d.init) return null
      return { kind: 'let', name: declName, expr: parseExpr(d.init, ctx) }
    }
    case 'IfStatement': {
      const cond = parseExpr(node.test, ctx)
      const consequent = node.consequent as AnyNode
      const then =
        consequent?.type === 'BlockStatement'
          ? parseStatementBlock(consequent, ctx)
          : ((): StatementIR[] => {
              const s = parseStatement(consequent, ctx)
              return s ? [s] : []
            })()
      const alt = node.alternate as AnyNode | undefined
      let elseBody: StatementIR[] | undefined
      if (alt) {
        elseBody =
          alt.type === 'BlockStatement'
            ? parseStatementBlock(alt, ctx)
            : ((): StatementIR[] => {
                const s = parseStatement(alt, ctx)
                return s ? [s] : []
              })()
      }
      return elseBody ? { kind: 'if', cond, then, elseBody } : { kind: 'if', cond, then }
    }
    case 'ReturnStatement': {
      const arg = node.argument as AnyNode | undefined
      return arg ? { kind: 'return', expr: parseExpr(arg, ctx) } : { kind: 'return' }
    }
    case 'ExpressionStatement': {
      const inner = node.expression as AnyNode
      // Reassignment (`t = t + x`, `acc += 1`) → an `assign` statement.
      // Signals reassign via `.set()` (a CallExpression, handled by parseExpr
      // below), so a raw AssignmentExpression is always a plain local /
      // member / index reassignment. Only `=` + arithmetic compound ops lower
      // cleanly to BOTH targets; exotic ops (`**= &&= ||= ??=` / bitwise)
      // fall through to the warn path.
      if (inner.type === 'AssignmentExpression') {
        const op = inner.operator as string
        const SUPPORTED = ['=', '+=', '-=', '*=', '/=', '%=']
        if (SUPPORTED.includes(op)) {
          return {
            kind: 'assign',
            target: parseExpr(inner.left, ctx),
            op,
            value: parseExpr(inner.right, ctx),
          }
        }
      }
      return { kind: 'expr', expr: parseExpr(node.expression, ctx) }
    }
    case 'WhileStatement': {
      return {
        kind: 'while',
        cond: parseExpr(node.test, ctx),
        body: parseLoopBody(node.body, ctx),
      }
    }
    case 'BreakStatement':
      // Plain or labeled. Pre-fix this warn-DROPPED — a SEMANTIC mis-emit:
      // the emitted loop ran every iteration where JS would exit.
      return node.label?.name
        ? { kind: 'break', label: node.label.name as string }
        : { kind: 'break' }
    case 'ContinueStatement':
      return node.label?.name
        ? { kind: 'continue', label: node.label.name as string }
        : { kind: 'continue' }
    case 'LabeledStatement': {
      // `outer: for (…) { … break outer … }` — both targets support loop
      // labels natively (Swift `outer: for`; Kotlin `outer@ for`). Only a
      // LOOP body lowers; a labeled non-loop statement (rare) warns.
      const labelName = node.label?.name as string | undefined
      const inner = node.body as AnyNode | undefined
      if (
        labelName &&
        inner &&
        (inner.type === 'ForOfStatement' || inner.type === 'WhileStatement')
      ) {
        const loop = parseStatement(inner, ctx)
        if (loop && (loop.kind === 'for-of' || loop.kind === 'while')) {
          loop.label = labelName
          return loop
        }
        return loop
      }
      ctx.warnings.push(
        `A labeled statement is only supported on a LOOP (\`outer: for (…)\` / \`outer: while (…)\`) — other labeled statements have no native lowering.`,
      )
      return null
    }
    case 'DoWhileStatement': {
      // `do { … } while (cond)` — Swift `repeat { } while` / Kotlin
      // `do { } while ( )` map directly. Pre-fix this warn-dropped the
      // WHOLE loop, leaving semantically wrong residue.
      return {
        kind: 'do-while',
        cond: parseExpr(node.test, ctx),
        body: parseLoopBody(node.body, ctx),
      }
    }
    case 'ForStatement': {
      // The canonical C-style COUNT loop — `for (let i = START; i < LIMIT;
      // i++)` (also `<=`, and `i += K` for a positive literal step) —
      // lowers to a native RANGE loop; ranges keep `break`/`continue`
      // semantics intact (a while-desugar would skip the update on
      // `continue` → infinite loop). Anything non-canonical (other
      // conditions/updates, a counter REASSIGNED in the body — Swift's
      // range binding is immutable) warns by name; pre-fix EVERY
      // ForStatement warn-dropped the whole loop.
      const range = classifyForRange(node, ctx)
      if (range !== null) return range
      ctx.warnings.push(
        `Only the canonical count-loop lowers to native (\`for (let i = 0; i < n; i++)\`, \`<=\`, or \`i += k\` with a positive literal step; the counter must not be reassigned in the body) — rewrite this \`for\` as a \`while\` (or \`for…of\`).`,
      )
      return null
    }
    case 'ForOfStatement': {
      // `for (const x of items) { … }` — only the single-identifier
      // `const`/`let` binding lowers. Destructured (`for (const {a} of …)`)
      // or C-style `for (let i=0; …)` (a ForStatement, different node)
      // fall through to warn-drop.
      const left = node.left as AnyNode | undefined
      let item: string | undefined
      if (
        left?.type === 'VariableDeclaration' &&
        ((left.declarations as AnyNode[] | undefined) ?? []).length === 1
      ) {
        const d = (left.declarations as AnyNode[])[0]!
        if (d.id?.type === 'Identifier') item = d.id.name as string
      }
      if (item === undefined) {
        ctx.warnings.push(
          'Unsupported for-of binding — only `for (const x of …)` (single identifier) lowers on native.',
        )
        return null
      }
      return {
        kind: 'for-of',
        item,
        iterable: parseExpr(node.right, ctx),
        body: parseLoopBody(node.body, ctx),
      }
    }
    case 'SwitchStatement': {
      // `switch (x) { case 'a': …; break; default: … }`. Consecutive empty
      // `case` labels share the following body (label grouping → Swift
      // `case "a", "b":` / Kotlin `"a", "b" ->`). A trailing `break` per
      // case is stripped — Swift/Kotlin don't fall through, so JS
      // fall-through beyond label-grouping is NOT modeled (the common
      // break-terminated shape is what real code writes).
      const discriminant = parseExpr(node.discriminant, ctx)
      const cases: { tests: ExprIR[]; body: StatementIR[] }[] = []
      let pendingTests: ExprIR[] = []
      let pendingDefault = false
      for (const sc of (node.cases as AnyNode[] | undefined) ?? []) {
        const isDefault = sc.test === null || sc.test === undefined
        if (isDefault) pendingDefault = true
        else pendingTests.push(parseExpr(sc.test, ctx))
        const consequent = (sc.consequent as AnyNode[] | undefined) ?? []
        if (consequent.length === 0) continue // empty label — share next body
        const body: StatementIR[] = []
        for (const st of consequent) {
          if (st.type === 'BreakStatement' && !st.label) continue // strip (no fall-through)
          const parsed = parseStatement(st, ctx)
          if (parsed) body.push(parsed)
        }
        cases.push({ tests: pendingDefault ? [] : pendingTests, body })
        pendingTests = []
        pendingDefault = false
      }
      return { kind: 'switch', discriminant, cases }
    }
    default:
      ctx.warnings.push(`Unsupported statement: ${node.type}.`)
      return null
  }
}

/** Parse a loop/branch body that may be a `BlockStatement` or a single statement. */
function parseLoopBody(node: AnyNode | undefined, ctx: ParseCtx): StatementIR[] {
  if (!node) return []
  if (node.type === 'BlockStatement') return parseStatementBlock(node, ctx)
  const s = parseStatement(node, ctx)
  return s ? [s] : []
}

/** Extract the `T` from `signal<T>(…)`. oxc exposes generics as `typeArguments`. */
function parseGenericTypeArg(callExpr: AnyNode, ctx: ParseCtx): TypeIR {
  const params = callExpr.typeArguments?.params as AnyNode[] | undefined
  if (!params || params.length === 0) return { kind: 'unknown' }
  return parseTypeAnnotation(params[0]!, ctx)
}

function parseTypeAnnotation(node: AnyNode, ctx: ParseCtx): TypeIR {
  switch (node.type) {
    case 'TSNumberKeyword':
      return { kind: 'number' }
    case 'TSStringKeyword':
      return { kind: 'string' }
    case 'TSBooleanKeyword':
      return { kind: 'boolean' }
    case 'TSNullKeyword':
      return { kind: 'null' }
    case 'TSUndefinedKeyword':
      // `undefined` in TS — both Swift and Kotlin model this as the
      // null-ish branch of an Optional / nullable type.
      return { kind: 'undefined' }
    case 'TSAnyKeyword':
    case 'TSUnknownKeyword':
    case 'TSVoidKeyword':
    case 'TSNeverKeyword':
      // Top/bottom types — degrade to `unknown` IR (emits as `Any` /
      // `Any?` per target). Phase 1 may refine the void/never cases.
      return { kind: 'unknown' }
    case 'TSArrayType':
      return { kind: 'array', element: parseTypeAnnotation(node.elementType, ctx) }
    case 'TSParenthesizedType':
      // `(() => void) | undefined` — TS wraps the function type in parens
      // inside the union. The parens are purely syntactic: unwrap to the
      // inner type. Without this the case fell to the `unknown` default and
      // the WHOLE union degraded to `Any?` — silently compilable for
      // assignment, uncompilable the moment the callback is CALLED.
      return parseTypeAnnotation(node.typeAnnotation, ctx)
    case 'TSTupleType':
      // `[string, number]` — no TypeIR tuple kind (Swift tuples can't be
      // Codable; Kotlin has no tuples beyond Pair/Triple). Name the fix
      // instead of the generic "Unknown type annotation" the default
      // used to emit.
      ctx.warnings.push(
        `Tuple types (\`[string, number]\`) are not supported in native (PMTC) — use an object type (\`{ k: string; v: number }\`), which lowers to a struct / data class.`,
      )
      return { kind: 'unknown' }
    case 'TSTypeLiteral': {
      const fields = (node.members as AnyNode[])
        .filter((m) => m.type === 'TSPropertySignature' && m.key?.name && m.typeAnnotation)
        .map((m) => {
          const fieldType = parseTypeAnnotation(m.typeAnnotation.typeAnnotation, ctx)
          // `label?: string` — TS marks the member `optional`. Represent it
          // the same way an explicit `string | undefined` parses (union with
          // undefined) so ONE convention carries optionality end-to-end:
          // typeIsOptional/unwrapOptionalType in inference, `T?` in both
          // type emitters, and `= nil` / `= null` field defaults. Dropping
          // it (the pre-fix behavior) emitted a REQUIRED native field for an
          // optional TS one — every call/literal site omitting it failed the
          // real compile. An already-optional type (`x?: string | undefined`)
          // is left as-is — no double wrap.
          const isAlreadyOptional =
            fieldType.kind === 'union' &&
            fieldType.branches.some((b) => b.kind === 'undefined' || b.kind === 'null')
          const type =
            m.optional === true && !isAlreadyOptional
              ? ({ kind: 'union', branches: [fieldType, { kind: 'undefined' }] } as TypeIR)
              : fieldType
          return { name: m.key.name as string, type }
        })
      return { kind: 'object', fields }
    }
    case 'TSUnionType': {
      // Flat union — collapse nested unions and preserve branch order.
      const branches: TypeIR[] = []
      for (const t of node.types as AnyNode[]) {
        const parsed = parseTypeAnnotation(t, ctx)
        if (parsed.kind === 'union') branches.push(...parsed.branches)
        else branches.push(parsed)
      }
      return { kind: 'union', branches }
    }
    case 'TSTypeReference': {
      // `Foo`, `MyInterface`, `Array<T>`, `Promise<string>`, etc. The
      // Phase 0 parser doesn't follow imports so we preserve the name
      // verbatim + recursively-parsed generic args. Per-target emit
      // decides how to render. Common stdlib references (e.g. `Array`)
      // are handled by the emitter's typeRef case.
      const nameNode = node.typeName as AnyNode
      let name = '(unresolved-typeRef)'
      if (nameNode?.type === 'Identifier') name = nameNode.name as string
      else if (nameNode?.type === 'TSQualifiedName') {
        // namespaced like `Foo.Bar` — keep as-is for now
        name = `${nameNode.left?.name ?? ''}.${nameNode.right?.name ?? ''}`
      }
      const params = node.typeArguments?.params as AnyNode[] | undefined
      const args = params ? params.map((p) => parseTypeAnnotation(p, ctx)) : []
      return { kind: 'typeRef', name, args }
    }
    case 'TSFunctionType': {
      // `(a: T, b: U) => R` — capture each parameter's name + type,
      // and the return type. Names are kept in IR for debug + future
      // use; Swift / Kotlin function types are positional, so the
      // emitter drops names at emit time.
      const params = ((node.params as AnyNode[]) ?? []).map((p) => {
        const annotation = p.typeAnnotation?.typeAnnotation as AnyNode | undefined
        const type: TypeIR = annotation
          ? parseTypeAnnotation(annotation, ctx)
          : { kind: 'unknown' }
        // Omit `name` when absent — `exactOptionalPropertyTypes` disallows
        // `name: undefined` for an optional property.
        const paramName: string | undefined =
          p.type === 'Identifier' ? (p.name as string | undefined) : undefined
        return paramName !== undefined ? { name: paramName, type } : { type }
      })
      const returnAnnotation = node.returnType?.typeAnnotation as AnyNode | undefined
      const returnType: TypeIR = returnAnnotation
        ? parseTypeAnnotation(returnAnnotation, ctx)
        : { kind: 'unknown' }
      return { kind: 'function', params, returnType }
    }
    case 'TSLiteralType': {
      // String / numeric / boolean literal types — `'a' | 'b' | 'c'`
      // unions are common. Degrade the literal to its base type so the
      // union collapse produces something usable per target.
      //
      // oxc emits the literal child as type 'Literal' with the value
      // carrying the JS-level type. Walk the `value` field to discriminate.
      const lit = node.literal as AnyNode | undefined
      if (!lit) return { kind: 'unknown' }
      if (typeof lit.value === 'string') return { kind: 'string' }
      if (typeof lit.value === 'number') return { kind: 'number' }
      if (typeof lit.value === 'boolean') return { kind: 'boolean' }
      return { kind: 'unknown' }
    }
    default:
      ctx.warnings.push(`Unknown type annotation: ${node.type}.`)
      return { kind: 'unknown' }
  }
}

/**
 * Source location ("line:col", 1-based) of an oxc node, derived from its
 * byte offset into the parse source. oxc AST nodes carry `.start`/`.end` but
 * no `.loc`, so we scan newlines up to the offset. Used to point every
 * "unsupported construct" diagnostic at the EXACT site instead of a bare
 * node-type name. Returns "?:?" when the offset is absent.
 */
function locOf(node: AnyNode, ctx: ParseCtx): string {
  const off = typeof node?.start === 'number' ? node.start : -1
  if (off < 0) return '?:?'
  let line = 1
  let lastNl = -1
  const n = Math.min(off, ctx.source.length)
  for (let i = 0; i < n; i++) {
    if (ctx.source.charCodeAt(i) === 10) {
      line++
      lastNl = i
    }
  }
  return `${line}:${off - lastNl}`
}

/**
 * Push a LOCATED + ACTIONABLE "unsupported construct" warning and return a
 * safe fallback ExprIR. PMTC compiles a narrow declarative TS subset; before
 * this, out-of-subset expressions degraded to a bare `Unsupported
 * expression: <NodeType>` (no line, no fix) — or, for several constructs, a
 * SILENT `''`. That silent/locationless drop was the #1 trust-killer: the
 * construct vanished and surfaced later as a confusing swiftc/kotlinc failure,
 * or as wrong output with no signal at all. Each call now names the exact site
 * AND how to express the intent inside the supported subset, and the CLI
 * already prints `result.warnings`, so the developer actually sees it.
 */
function unsupportedExpr(
  ctx: ParseCtx,
  node: AnyNode,
  what: string,
  hint: string,
  fallback: ExprIR = { kind: 'literal', value: '' },
): ExprIR {
  ctx.warnings.push(`[${locOf(node, ctx)}] ${what} is not supported in native (PMTC) — ${hint}`)
  return fallback
}

function parseExpr(node: AnyNode, ctx: ParseCtx): ExprIR {
  switch (node.type) {
    case 'Literal':
    case 'NumericLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral': {
      // A regex literal (`/pat/flags`) is a `Literal` node carrying a `regex`
      // field. Neither target has JS regex-literal syntax + `.match`/`.test`/
      // regex-`.replace` (Swift uses `Regex`/`.firstMatch(of:)`, Kotlin
      // `Regex(...)`), so pre-fix it emitted the raw `/pat/flags` VERBATIM —
      // uncompilable Swift/Kotlin with ZERO warnings (a silent-drop). Faithful
      // regex lowering is a large semantics undertaking (flags, capture groups,
      // match-API shape); for now turn the silent mis-emit into a NAMED warning
      // + a safe `""` fallback (never the uncompilable verbatim regex).
      const regexNode = node as { regex?: { pattern: string; flags: string }; raw?: string }
      if (regexNode.regex !== undefined) {
        ctx.warnings.push(
          `[${locOf(node, ctx)}] Regex literals aren't supported in native (PMTC) — \`${regexNode.raw ?? '/…/'}\` has no Swift/Kotlin equivalent (it was emitted verbatim and uncompilable before). Rewrite string work without a RegExp, or keep regex logic in a web-only helper.`,
        )
        return { kind: 'literal', value: '' }
      }
      return { kind: 'literal', value: node.value }
    }
    case 'Identifier':
      // `undefined` as a VALUE expression (`x !== undefined`) lowers to
      // the nullish literal — Swift/Kotlin have one nullish value (nil/
      // null), and emitting the bare identifier `undefined` is an
      // unresolved reference on both targets. (The TYPE-level
      // `undefined` is a separate TypeIR kind, handled in the type
      // emitters.)
      if (node.name === 'undefined') return { kind: 'literal', value: null }
      // Store-aliasing lowering: a name bound via `const app = useApp()`
      // substitutes back to a `useApp()` call, so `app.store.x` produces
      // the same IR as the inline `useApp().store.x` (emit unchanged).
      // Only names recorded in storeAliases (genuine store-hook bindings)
      // substitute — every other identifier is untouched.
      {
        const aliasedHook = ctx.storeAliases.get(node.name as string)
        if (aliasedHook !== undefined) {
          return {
            kind: 'call',
            callee: { kind: 'identifier', name: aliasedHook },
            args: [],
          }
        }
      }
      // Hook-field-alias lowering: a name bound via `const { data } =
      // useFetch(url)` rewrites to a `container.field` member access
      // (`__pyHookN.data`), so `data()` / `isPending` lower to the same IR
      // as the supported single-binding `q.data()` / `q.isPending` — emit
      // unchanged. Only destructured locals (which previously warn-dropped)
      // are ever in this map, so no previously-compiling code can change.
      {
        const fieldAlias = ctx.hookFieldAliases.get(node.name as string)
        if (fieldAlias !== undefined) {
          if ('index' in fieldAlias) {
            // Array-destructured local (`const [a, b] = xs()`) — rewrite to
            // `__pyDestrN[i]`, the same IR as the documented explicit-index
            // shape (`xs()[0]`), so the emit + inference paths are shared.
            return {
              kind: 'index',
              object: { kind: 'identifier', name: fieldAlias.object },
              index: { kind: 'literal', value: fieldAlias.index },
            }
          }
          return {
            kind: 'member',
            object: { kind: 'identifier', name: fieldAlias.object },
            property: fieldAlias.field,
          }
        }
      }
      return { kind: 'identifier', name: node.name as string }
    case 'CallExpression': {
      // `JSON.parse(x)` / `JSON.stringify(x)` — no native lowering yet
      // (Swift needs a JSONEncoder/Decoder bridge gated on Codable
      // conformance; Kotlin needs kotlinx `Json` + imports). Pre-fix the
      // call emitted VERBATIM (`JSON.stringify(todos)`) — an unresolved
      // `JSON` reference on BOTH targets, with no warning. Fail loudly.
      if (
        node.callee?.type === 'MemberExpression' &&
        node.callee.object?.type === 'Identifier' &&
        node.callee.object.name === 'JSON' &&
        (node.callee.property?.name === 'parse' || node.callee.property?.name === 'stringify')
      ) {
        return unsupportedExpr(
          ctx,
          node,
          `\`JSON.${node.callee.property.name}\``,
          'no native lowering yet — keep data in typed signals/structs (fetch decode is handled by useFetch<T>); a serialization bridge is a tracked follow-up.',
        )
      }
      // Imperative `@pyreon/toast` call → `toast-call` ExprIR (→ PyreonToast).
      // `toast("x")` (info) or a preset `toast.success("x")` / `.error` /
      // `.warning` / `.info` / `.loading`. The message is the first argument; a
      // literal `duration` (ms) in the 2nd-arg options object sets the
      // auto-dismiss (0 = persistent); other options (onDismiss/description/
      // icon/action) are dropped in v1 (the preset method carries the type).
      if (ctx.toastNames.size > 0) {
        const c = node.callee
        const PRESETS = new Set(['success', 'error', 'warning', 'info', 'loading'])
        let toastType: string | undefined
        if (c?.type === 'Identifier' && ctx.toastNames.has(c.name)) {
          toastType = 'info'
        } else if (
          c?.type === 'MemberExpression' &&
          c.object?.type === 'Identifier' &&
          ctx.toastNames.has(c.object.name) &&
          c.property?.type === 'Identifier' &&
          PRESETS.has(c.property.name)
        ) {
          // `loading` has no distinct native variant in v1 → treat as info.
          toastType = c.property.name === 'loading' ? 'info' : c.property.name
        }
        if (toastType !== undefined) {
          const argNodes = (node.arguments as AnyNode[] | undefined) ?? []
          const message: ExprIR = argNodes[0]
            ? parseExpr(argNodes[0], ctx)
            : { kind: 'literal', value: '' }
          // A literal `duration` (ms) in the options object → auto-dismiss.
          let durationMillis: number | undefined
          const opts = argNodes[1]
          if (opts?.type === 'ObjectExpression') {
            for (const prop of (opts.properties as AnyNode[] | undefined) ?? []) {
              if (prop.type !== 'Property' || prop.computed) continue
              const key = prop.key?.type === 'Identifier' ? prop.key.name : prop.key?.value
              const val = prop.value as AnyNode | undefined
              if (
                key === 'duration' &&
                (val?.type === 'Literal' || val?.type === 'NumericLiteral') &&
                typeof val.value === 'number'
              ) {
                durationMillis = val.value
              }
            }
          }
          return durationMillis !== undefined
            ? { kind: 'toast-call', message, toastType, durationMillis }
            : { kind: 'toast-call', message, toastType }
        }
      }
      // Imperative `@pyreon/a11y` `announce("msg", { politeness })` →
      // `announce-call` ExprIR (→ PyreonA11y). The message is the first arg; an
      // options object's `politeness: 'assertive'` sets `assertive` (default
      // polite). A `clear` option is dropped in v1.
      if (
        ctx.announceNames.size > 0 &&
        node.callee?.type === 'Identifier' &&
        ctx.announceNames.has(node.callee.name)
      ) {
        const argNodes = (node.arguments as AnyNode[] | undefined) ?? []
        const message: ExprIR = argNodes[0]
          ? parseExpr(argNodes[0], ctx)
          : { kind: 'literal', value: '' }
        let assertive = false
        const opts = argNodes[1]
        if (opts?.type === 'ObjectExpression') {
          for (const prop of (opts.properties as AnyNode[] | undefined) ?? []) {
            if (prop.type !== 'Property' || prop.computed) continue
            const key = prop.key?.type === 'Identifier' ? prop.key.name : prop.key?.value
            const val = prop.value
            if (
              key === 'politeness' &&
              (val?.type === 'Literal' || val?.type === 'StringLiteral') &&
              val.value === 'assertive'
            ) {
              assertive = true
            }
          }
        }
        return { kind: 'announce-call', message, assertive }
      }
      const callee = parseExpr(node.callee, ctx)
      const args = (node.arguments as AnyNode[]).map((a) => parseExpr(a, ctx))
      // `node.optional` is set for the `f?.()` link of an optional chain
      // (oxc wraps the chain in a ChainExpression; each call carries its own
      // optional flag). Threaded to the emit → Swift `f?(args)` / Kotlin
      // `f?.invoke(args)`.
      return node.optional === true
        ? { kind: 'call', callee, args, optional: true }
        : { kind: 'call', callee, args }
    }
    case 'MemberExpression': {
      const object = parseExpr(node.object, ctx)
      // Computed access (`xs[i]`) — the property is an EXPRESSION, not
      // a name. Pre-PR-D this fell through to the member case with
      // `property: undefined` → emitted `xs.undefined`.
      if (node.computed === true) {
        // `a?.[i]` — the optional COMPUTED link carries the flag; the emit
        // lowers it to the guarded safe-index idiom (see the index IR doc).
        return node.optional === true
          ? { kind: 'index', object, index: parseExpr(node.property, ctx), optional: true }
          : { kind: 'index', object, index: parseExpr(node.property, ctx) }
      }
      const property = node.property?.name as string
      // `node.optional` is set for the `a?.b` link of an optional chain
      // (oxc wraps the whole chain in a ChainExpression, but each member
      // carries its own optional flag). Plain `a.b` has it false/undefined.
      return node.optional === true
        ? { kind: 'member', object, property, optional: true }
        : { kind: 'member', object, property }
    }
    case 'BinaryExpression': {
      // Arithmetic operators (existing) + comparison/equality operators
      // (Parser-A slice). Pyreon source uses `===` / `!==` which evaluate
      // the same as `==` / `!=` for the value types signals carry; the
      // emitter coalesces to the native target's `==` / `!=`.
      // Arithmetic + bitwise — both lower to a `binary` IR node. Bitwise
      // ops are well-defined on both targets (Swift: same symbols; Kotlin:
      // `and`/`or`/`xor`/`shl`/`shr` infix functions, mapped at emit). NOTE
      // `>>>` (JS unsigned-right-shift, uint32 semantics) is deliberately
      // NOT included — it has no faithful signed-Int lowering and keeps the
      // warn-fallback below.
      const arith = ['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>', '**'] as const
      const compMap: Record<string, '==' | '!=' | '<' | '>' | '<=' | '>='> = {
        '===': '==',
        '!==': '!=',
        '==': '==',
        '!=': '!=',
        '<': '<',
        '>': '>',
        '<=': '<=',
        '>=': '>=',
      }
      const op = node.operator as string
      if ((arith as readonly string[]).includes(op)) {
        return {
          kind: 'binary',
          op: op as (typeof arith)[number],
          left: parseExpr(node.left, ctx),
          right: parseExpr(node.right, ctx),
        }
      }
      const compOp = compMap[op]
      if (compOp) {
        return {
          kind: 'comparison',
          op: compOp,
          left: parseExpr(node.left, ctx),
          right: parseExpr(node.right, ctx),
        }
      }
      ctx.warnings.push(
        `[${locOf(node, ctx)}] Binary operator \`${op}\` is not supported in native (PMTC) — emitting \`+\` as a fallback (likely wrong); rewrite using a supported operator.`,
      )
      return {
        kind: 'binary',
        op: '+',
        left: parseExpr(node.left, ctx),
        right: parseExpr(node.right, ctx),
      }
    }
    case 'UnaryExpression': {
      // Parser-B: `!t.done`, `-x`, `+x`. Both Swift and Kotlin accept
      // these as prefix unary verbatim. Other unary operators (`typeof`,
      // `void`, `delete`) don't have idiomatic native equivalents —
      // warn + degrade. `++` / `--` are UpdateExpression, not Unary.
      const known: ('!' | '-' | '+')[] = ['!', '-', '+']
      const op = node.operator as string
      if (!(known as readonly string[]).includes(op)) {
        return unsupportedExpr(
          ctx,
          node,
          `Unary operator \`${op}\``,
          'only `!`, `-`, `+` are supported on native.',
        )
      }
      return {
        kind: 'unary',
        op: op as '!' | '-' | '+',
        argument: parseExpr(node.argument, ctx),
      }
    }
    case 'LogicalExpression': {
      // Parser-C: `a && b`, `a || b`, `a ?? b`. Short-circuit semantics
      // map identically on Swift and Kotlin for && / ||; `??` (nullish
      // coalescing, also a LogicalExpression in oxc) maps to Swift's
      // own `??` and Kotlin's Elvis `?:` at emit time.
      const knownLogical: ('&&' | '||' | '??')[] = ['&&', '||', '??']
      const op = node.operator as string
      if (!(knownLogical as readonly string[]).includes(op)) {
        return unsupportedExpr(
          ctx,
          node,
          `Logical operator \`${op}\``,
          'only `&&`, `||`, `??` are supported on native.',
        )
      }
      return {
        kind: 'logical',
        op: op as '&&' | '||' | '??',
        left: parseExpr(node.left, ctx),
        right: parseExpr(node.right, ctx),
      }
    }
    case 'SpreadElement': {
      // Array spread: `[...todos(), newTodo]`. Inside an ArrayExpression's
      // elements list, oxc emits SpreadElement entries. The emitter
      // pattern-matches array elements containing a single spread + N
      // literals to render as `target + [literals]` on Swift,
      // `target + listOf(literals)` on Kotlin (immutable concat).
      return { kind: 'spread', argument: parseExpr(node.argument, ctx) }
    }
    case 'ConditionalExpression': {
      // `cond ? a : b` — ternary. TodoMVC's toggle uses this in the
      // map callback: `t.id === id ? {...t, done: !t.done} : t`.
      return {
        kind: 'ternary',
        cond: parseExpr(node.test, ctx),
        then: parseExpr(node.consequent, ctx),
        otherwise: parseExpr(node.alternate, ctx),
      }
    }
    case 'UpdateExpression': {
      // `nextId++` (post) or `++nextId` (pre). Used by TodoMVC's
      // addTodo in the array-literal id assignment. JS post-increment
      // returns the OLD value while side-effect-incrementing; the
      // emit degrades to `x + 1` for the value (Swift / Kotlin
      // `@State` / `var` don't support `++` in expression position),
      // losing the side-effect.
      const op = node.operator as '++' | '--'
      if (op !== '++' && op !== '--') {
        return unsupportedExpr(
          ctx,
          node,
          `Update operator \`${op}\``,
          'only `++` and `--` are supported on native.',
          { kind: 'literal', value: 0 },
        )
      }
      return { kind: 'update', op, argument: parseExpr(node.argument, ctx) }
    }
    case 'ArrowFunctionExpression': {
      // A DESTRUCTURED callback param (`.map(([k, v]) => k)` /
      // `.map(({ id }) => id)`) has no lowering — the filter below keeps
      // only identifier params, so pre-fix the body referenced UNBOUND
      // names (`pairs.map({ k })` — uncompilable) with no warning. Warn
      // loudly; the fix is a plain param + member/index reads.
      for (const p of node.params as AnyNode[]) {
        if (p.type === 'ArrayPattern' || p.type === 'ObjectPattern') {
          ctx.warnings.push(
            `[${locOf(node, ctx)}] A destructured callback parameter (\`([a, b]) =>\` / \`({ a }) =>\`) is not supported in native (PMTC) — take a plain parameter and read fields/indices (\`(pair) => pair.a\`).`,
          )
        }
      }
      const params = (node.params as AnyNode[])
        .filter((p) => p.type === 'Identifier')
        .map((p) => p.name as string)
      const body = node.body
      const isExpressionBody = body.type !== 'BlockStatement'
      if (isExpressionBody) {
        // Comma-operator arrow body — `() => (a.set(1), b.set(2))`, the
        // compact multi-write handler idiom. A SequenceExpression has no
        // native VALUE lowering, but in an ARROW BODY the value is
        // discarded — lower each sub-expression to its own STATEMENT
        // (pre-fix this warned + emitted a `("")` junk body, dropping
        // BOTH writes). Value-position sequences still warn.
        const seqBody =
          body.type === 'ParenthesizedExpression' &&
          (body.expression as AnyNode | undefined)?.type === 'SequenceExpression'
            ? (body.expression as AnyNode)
            : body.type === 'SequenceExpression'
              ? body
              : undefined
        if (seqBody !== undefined) {
          const stmts: StatementIR[] = ((seqBody.expressions as AnyNode[]) ?? []).map(
            (x) => ({ kind: 'expr', expr: parseExpr(x, ctx) }),
          )
          return { kind: 'arrow', async: node.async === true, params, body: { kind: 'literal', value: '' }, stmts }
        }
        return { kind: 'arrow', async: node.async === true, params, body: parseExpr(body, ctx) }
      }
      // Block body. The common compact case — a single expression/return
      // statement (`() => { count.set(c() + 1) }`) — keeps the lean
      // single-expr `body` shape (every downstream accessor / `.update` /
      // action emit already handles it; backward-compat).
      const stmts = body.body as AnyNode[]
      if (stmts.length === 0) {
        return { kind: 'arrow', async: node.async === true, params, body: { kind: 'literal', value: '' } }
      }
      if (
        stmts.length === 1 &&
        (stmts[0]!.type === 'ExpressionStatement' || stmts[0]!.type === 'ReturnStatement')
      ) {
        const only = stmts[0]!
        const inner = only.type === 'ReturnStatement' ? only.argument : only.expression
        if (!inner) return { kind: 'arrow', async: node.async === true, params, body: { kind: 'literal', value: '' } }
        return { kind: 'arrow', async: node.async === true, params, body: parseExpr(inner, ctx) }
      }
      // MULTIPLE statements (or a single non-expr/return statement like an
      // `if`) — carry the FULL statement list. The pre-fix `.find()` kept
      // only the first matching statement and silently dropped the rest — a
      // HIGH "1 code, all platforms" bug: `onPress={() => { a.set(1);
      // b.set(2) }}` lost the `b` update on both targets. `body` is a
      // sentinel; `emitSwiftAction` / `emitKotlinAction` read `stmts`.
      const blockStmts = parseStatementBlock(body, ctx)
      return {
        kind: 'arrow',
        async: node.async === true,
        params,
        body: { kind: 'literal', value: '' },
        stmts: blockStmts,
      }
    }
    case 'ArrayExpression': {
      const elements = (node.elements as AnyNode[]).map((e) => parseExpr(e, ctx))
      return { kind: 'array', elements }
    }
    case 'ObjectExpression': {
      // G4: ObjectExpression carries both regular fields (`a: 1`) AND
      // spread members (`...x`) in `properties`. The parser previously
      // filtered out spreads silently — the partial-update idiom
      // `{ ...t, done: !t.done }` lost the spread data, leaving emit
      // targets unable to produce correct copy-with-overrides shapes.
      const properties = node.properties as AnyNode[]
      const fields: { name: string; value: ExprIR }[] = []
      const spreads: ExprIR[] = []
      for (const p of properties) {
        // A COMPUTED key (`{ [k]: v }`) has `computed: true`; its `key` is the
        // key EXPRESSION, not a static name. Pre-fix the `p.key?.name` check
        // below matched an identifier-keyed computed prop (`{ [k]: 1 }` where
        // `k` is a var) and used the VARIABLE NAME `k` as the struct field —
        // a silent mis-emit (`__Obj0(k: 1)`, and a downstream `o[k]` / `o.a`
        // read misses). A native struct/data-class needs static field names, so
        // a computed key has no faithful lowering → a NAMED warning (never the
        // silent wrong field).
        if (p.type === 'Property' && p.computed === true) {
          ctx.warnings.push(
            `[${locOf(p, ctx)}] Computed object keys (\`{ [expr]: … }\`) aren't supported in native (PMTC) — a struct/data-class needs static field names. Use static keys, or build a dictionary with \`new Map()\`.`,
          )
          continue
        }
        // A STRING-LITERAL key (`{ 'posts.*': true }`) is ordinary TS and was
        // dropped here SILENTLY — no field, no warning, unlike the computed
        // key above. Preserve it: consumers that need a static struct field
        // name check the name themselves (a permission map, for instance, is
        // read as data and never becomes a struct).
        const literalKey =
          p.type === 'Property' && p.key?.type === 'Literal' && typeof p.key.value === 'string'
            ? (p.key.value as string)
            : undefined
        if (p.type === 'Property' && (p.key?.name || literalKey !== undefined)) {
          fields.push({
            name: (p.key.name as string | undefined) ?? literalKey!,
            value: parseExpr(p.value, ctx),
          })
        } else if (p.type === 'SpreadElement') {
          spreads.push(parseExpr(p.argument, ctx))
        }
      }
      // An EMPTY object literal has no native lowering and produced no
      // warning. Both emitters render a fieldless object as `()` — Swift's
      // empty TUPLE, i.e. Void — so:
      //
      //   signal({})                    Swift: `@State private var u: Any = ()`
      //                                 compiles, but the value is Void, not an
      //                                 object. SILENT semantic break.
      //                                 Kotlin: fails to infer T.
      //   signal<{ name?: string }>({}) `@State private var u: CU = ()`
      //                                 fails on BOTH targets.
      //
      // Warned rather than lowered. Emitting an empty struct would fix the
      // first shape but NOT the second: there the literal is empty while the
      // TYPE ANNOTATION carries the fields, so a struct synthesized from the
      // literal would drop `name` and the later `u().name` would fail anyway.
      // Synthesizing from the annotation is a real feature; a warning that
      // names the shape and the fix is the honest thing to ship today.
      if (fields.length === 0 && spreads.length === 0) {
        ctx.warnings.push(
          'An EMPTY object literal `{}` has no native lowering — it emits `()` (Void on Swift), so the value is not an object on either target. Give the literal its fields (`{ name: "" }`), or model the state as separate signals.',
        )
      }
      return spreads.length > 0
        ? { kind: 'object', fields, spreads }
        : { kind: 'object', fields }
    }
    case 'ParenthesizedExpression': {
      // Parens around JSX in source (`return (<X>...)`) are syntactic
      // grouping for readability — they carry no semantic weight. Drop
      // the wrap when the inner is JSX so the emitter doesn't produce
      // `(ForEach …)` / `(if …)` parens in target output.
      const inner = parseExpr(node.expression, ctx)
      if (inner.kind === 'jsx-element' || inner.kind === 'jsx-fragment') return inner
      return { kind: 'paren', inner }
    }
    case 'JSXElement':
      return parseJsxElement(node, ctx)
    case 'JSXFragment': {
      const children = (node.children as AnyNode[])
        .map((c) => parseJsxChild(c, ctx))
        .filter((c): c is ChildIR => c !== null)
      return { kind: 'jsx-fragment', children }
    }
    case 'TemplateLiteral': {
      // The single most common out-of-subset expression (string
      // interpolation). LOWERED to native interpolation (Swift `"\(…)"`,
      // Kotlin `"${…}"`) — see the `template` ExprIR in types.ts for why
      // interpolation, not `+`-concat (Swift's `+` doesn't coerce a
      // non-String interpoland). `quasis` are the COOKED segments (resolved
      // escapes — re-escaped per-target at emit); `expressions` interleave.
      const quasis = ((node.quasis as AnyNode[] | undefined) ?? []).map(
        (q) => (q?.value?.cooked ?? q?.value?.raw ?? '') as string,
      )
      const exprs = ((node.expressions as AnyNode[] | undefined) ?? []).map((ex) =>
        parseExpr(ex, ctx),
      )
      return { kind: 'template', quasis, exprs }
    }
    case 'TaggedTemplateExpression':
      return unsupportedExpr(
        ctx,
        node,
        'A tagged template literal',
        'it has no native equivalent — call a plain function with the values instead.',
      )
    case 'ChainExpression': {
      // Optional chaining `a?.b` — oxc wraps the chain in a ChainExpression.
      // All three optional shapes LOWER now, each carrying its own `optional`
      // flag from its own parseExpr case to a per-target emit:
      //   MEMBER (`a?.b`)  → Swift `a?.b`      / Kotlin `a?.b`  (propagated
      //                      down the chain so Kotlin's nullable-access holds;
      //                      Swift accepts the redundant `?.`)
      //   INDEX  (`a?.[i]`)→ Swift `a?[i]` (or the guarded safe-index idiom)
      //                      / Kotlin `getOrNull(i)`
      //   CALL   (`f?.()`) → Swift `f?(args)`  / Kotlin `f?.invoke(args)`
      // so there's nothing to reject here — just unwrap and recurse.
      return parseExpr(node.expression, ctx)
    }
    case 'TSAsExpression':
    case 'TSTypeAssertion': {
      // A type ASSERTION is semantically transparent — the value is the inner
      // expression. Unwrap to its IR (without this, parseExpr hit `default` →
      // `unsupportedExpr` → a `""` string-literal fallback, so `[] as number[]`
      // mis-emitted as `""`). SPECIAL case: an EMPTY array literal carries no
      // element type of its own, so a bare `[]` degrades to `Any` — but the
      // cast `[] as T[]` DOES name the element type, so thread it onto the array
      // IR (`elementType`) → a typed-empty-array emit (`[Int]()` / `emptyList<Int>()`).
      const inner = parseExpr(node.expression, ctx)
      if (inner.kind === 'array' && inner.elements.length === 0 && node.typeAnnotation) {
        const castType = parseTypeAnnotation(node.typeAnnotation, ctx)
        if (castType.kind === 'array') {
          return { kind: 'array', elements: [], elementType: castType.element }
        }
      }
      return inner
    }
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      // `x satisfies T` / `x!` — transparent; the value is the inner expression.
      return parseExpr(node.expression, ctx)
    case 'NewExpression': {
      // `new Map<K, V>()` / `new Set<T>()` / `new Set(arr)` — the supported
      // collection constructors. Generic args carry the element types (a
      // bare `new Map()` has none — the local's USE sites can't type it, so
      // it stays a named warning: annotate the generics). Other `new X`
      // falls through to the default unsupported warning.
      const calleeName = node.callee?.type === 'Identifier' ? (node.callee.name as string) : ''
      const typeArgs = (node.typeArguments?.params ?? node.typeParameters?.params ?? []) as AnyNode[]
      // `new SizedMap<K, V>({ maxEntries: N, lru?: B })`. Gated on the IMPORT
      // (see collectSizedMapNames): `SizedMap` is a plausible name for a
      // user's own class, and mis-lowering someone else's constructor is
      // worse than not lowering ours.
      if (ctx.sizedMapNames.has(calleeName) && typeArgs.length === 2) {
        const optsNode = (node.arguments as AnyNode[] | undefined)?.[0]
        const readNum = (key: string): number | undefined => {
          for (const prop of (optsNode?.properties as AnyNode[] | undefined) ?? []) {
            const k = prop?.key?.name ?? prop?.key?.value
            if (k === key && prop.value?.type === 'Literal') {
              const v = prop.value.value
              if (typeof v === 'number') return v
              if (typeof v === 'boolean') return v ? 1 : 0
            }
          }
          return undefined
        }
        const maxEntries = readNum('maxEntries')
        if (optsNode?.type !== 'ObjectExpression' || maxEntries === undefined) {
          // A non-literal cap cannot be baked in — the same conservative rule
          // useFetch applies to its URL and useStorage to its key.
          ctx.warnings.push(
            `[${locOf(node, ctx)}] new ${calleeName}(...) lowers only with a LITERAL \`{ maxEntries: N }\` option object — a computed cap cannot be baked into the native emit. Use a literal, or keep the call behind a \`<Web>\` escape hatch.`,
          )
        } else {
          return {
            kind: 'new-sized-map',
            keyType: parseTypeAnnotation(typeArgs[0]!, ctx),
            valueType: parseTypeAnnotation(typeArgs[1]!, ctx),
            maxEntries,
            lru: readNum('lru') === 1,
          }
        }
      }
      if (calleeName === 'Map' && (node.arguments?.length ?? 0) === 0 && typeArgs.length === 2) {
        return {
          kind: 'new-collection',
          collection: 'map',
          keyType: parseTypeAnnotation(typeArgs[0]!, ctx),
          valueType: parseTypeAnnotation(typeArgs[1]!, ctx),
        }
      }
      if (calleeName === 'Set') {
        if ((node.arguments?.length ?? 0) === 0 && typeArgs.length === 1) {
          return {
            kind: 'new-collection',
            collection: 'set',
            elementType: parseTypeAnnotation(typeArgs[0]!, ctx),
          }
        }
        if ((node.arguments?.length ?? 0) === 1) {
          return {
            kind: 'new-collection',
            collection: 'set',
            seed: parseExpr(node.arguments[0], ctx),
          }
        }
      }
      if (calleeName === 'Map' || calleeName === 'Set') {
        return unsupportedExpr(
          ctx,
          node,
          `\`new ${calleeName}\` without explicit generic type arguments`,
          `annotate the element types — \`new ${calleeName}<...>()\` — so the native collection can be typed.`,
        )
      }
      return unsupportedExpr(
        ctx,
        node,
        `\`new ${calleeName || (node.callee?.type ?? '?')}()\``,
        'class construction is outside the supported declarative subset — model data with plain object/array signals.',
      )
    }
    case 'AwaitExpression':
      // M4.5: `await x.method()` inside an `async () => { … }` event handler.
      // Unwrap to `{ kind: 'await', expr }`; the enclosing async arrow (marked
      // `async: true` below) is wrapped by the action emitters in a
      // `Task { … }` (Swift) / `scope.launch { … }` (Kotlin) async scope where
      // this `await`/suspend call is legal. Valid JS only permits `await`
      // inside an `async` function, so a parsed `await` is always inside such
      // an arrow — a top-level component-body await would be a syntax error
      // upstream. `unwrapAccessorArrow` is applied by the callee-recognition
      // path, so no extra unwrap is needed here.
      return { kind: 'await', expr: parseExpr((node as AnyNode).argument, ctx) }
    default:
      return unsupportedExpr(
        ctx,
        node,
        `\`${node.type}\``,
        'it is outside the supported declarative subset — see the multiplatform supported-TS reference.',
      )
  }
}

function parseJsxElement(node: AnyNode, ctx: ParseCtx): ExprIR {
  const opening = node.openingElement
  const tagNode = opening.name
  let tag = 'unknown'
  if (tagNode.type === 'JSXIdentifier') tag = tagNode.name as string
  else if (tagNode.type === 'JSXMemberExpression') {
    tag = `${tagNode.object.name}.${tagNode.property.name}`
  }

  const attrs: AttrIR[] = []
  for (const attr of opening.attributes as AnyNode[]) {
    const ir = parseJsxAttr(attr, ctx)
    if (ir) attrs.push(ir)
  }

  const children: ChildIR[] = []
  for (const child of (node.children as AnyNode[]) ?? []) {
    const ir = parseJsxChild(child, ctx)
    if (ir) children.push(ir)
  }

  // Round-1 audit fix: surface diagnostic warnings for primitives
  // missing their REQUIRED prop. Pre-fix, omitting (e.g.) `<Icon>`'s
  // `name` or `<Image>`'s `src` silently fell through to the generic
  // emit, producing unbuildable native code (`Icon(size: "lg")` — no
  // such SwiftUI type, no such Compose composable). Users got cryptic
  // `swiftc` / `kotlinc` errors with no Pyreon-side signal.
  //
  // The emit shape is UNCHANGED here (generic fallthrough remains; a
  // proper safe-fallback emit is a larger follow-up). What changes is
  // that the parser now NAMES the missing prop in `result.warnings`,
  // so consumers (CLI, IDE, build scripts) can surface it. Failing
  // loud BEFORE swiftc/kotlinc is the diagnostic-quality win.
  warnIfMissingRequiredProp(tag, attrs, ctx)

  // Round-3 audit fix: when a render callback inside <For>/<Show>
  // declares a hook (`signal()` / `computed()` / `useStorage()` /
  // `useFetch()` / `useForm()`), the parser silently drops it — the
  // ArrowFunctionExpression case in parseExpr only extracts the first
  // expression/return statement and ignores all the `const` decls
  // before it. So the hook body never runs at native runtime,
  // references to its binding emit unbound, and the user has no signal
  // pointing at the cause. Warn at the For/Show site so the path
  // forward (lift the decl to the parent component) is obvious.
  if (tag === 'For' || tag === 'Show') {
    warnIfHookInsideRenderCallback(tag, node.children as AnyNode[] | undefined, ctx)
  }

  return { kind: 'jsx-element', tag, attrs, children }
}

/**
 * Round-3 audit helper: scan a <For>/<Show> child's RAW arrow body
 * for hook calls. The walker only descends into the arrow's block
 * statements — nested JSX expressions / nested arrow bodies are left
 * alone (their hooks would already get flagged on the next pass if
 * they're inside their own For/Show, and otherwise are legitimate
 * event-handler closures).
 */
function warnIfHookInsideRenderCallback(
  tag: string,
  children: AnyNode[] | undefined,
  ctx: ParseCtx,
): void {
  if (!children) return
  // Set of hook identifiers we recognise as "component-scope only".
  // Same set the body parser extracts at the top level — if it's here,
  // it should have been declared in the parent component.
  const HOOK_NAMES = new Set([
    'signal',
    'computed',
    'useStorage',
    'useFetch',
    'useForm',
    'useClipboard',
    'useHaptics',
    'useNativeModule',
    'useShare',
    'useLinking',
    'useNotifications',
    'useCrashReporter',
    'useBiometrics',
    'useImagePicker',
    'useFilePicker',
    'useColorScheme',
    'useSizeClass',
    'usePermissions',
    'useOnline',
    'useAppState',
    'useGeolocation',
    'useWebSocket',
    'useSecureStorage',
    'useDatabase',
    'usePush',
    'usePayments',
    'useMap',
    'useAuth',
  ])
  for (const child of children) {
    if (child?.type !== 'JSXExpressionContainer') continue
    const expr = child.expression
    if (expr?.type !== 'ArrowFunctionExpression') continue
    if (expr.body?.type !== 'BlockStatement') continue
    for (const stmt of (expr.body.body as AnyNode[] | undefined) ?? []) {
      if (stmt?.type !== 'VariableDeclaration') continue
      for (const d of (stmt.declarations as AnyNode[] | undefined) ?? []) {
        const init = d?.init
        if (init?.type !== 'CallExpression') continue
        const callee = init.callee?.name as string | undefined
        if (callee && HOOK_NAMES.has(callee)) {
          ctx.warnings.push(
            `Hook \`${callee}(…)\` declared inside <${tag}> render callback — PMTC only extracts hooks at component-body scope. Lift the declaration to the parent component (above the <${tag}> JSX); the closure inside <${tag}> can reference the lifted binding.`,
          )
        }
      }
    }
  }
}

/**
 * Round-1 audit helper: when a canonical primitive is used without
 * its required prop, push a clear warning naming the tag + the
 * missing prop into `ctx.warnings`. The emit path is unchanged; this
 * is diagnostic-only.
 *
 * Scoped to the 3 most-hit shapes the audit found:
 *   - `<Icon>` without `name`   (Swift SF Symbols / Compose Icon both need it)
 *   - `<Image>` without `src`   (no image without a source)
 *   - `<Link>` without `to`     (no navigation target = broken nav)
 *
 * `<Field>` without `value` is deliberately NOT warned here — the
 * existing parse path bails to undeclared for non-signal value and
 * the emit produces a generic fall-through; a clean warning there
 * needs the signal-name set which isn't available at parse time
 * (lives in the emit context). Tracked as a separate follow-up.
 */
function warnIfMissingRequiredProp(tag: string, attrs: AttrIR[], ctx: ParseCtx): void {
  const hasAttr = (name: string): boolean =>
    attrs.some((a) => a.kind === 'attr' && a.name === name)
  if (tag === 'Icon' && !hasAttr('name')) {
    ctx.warnings.push(
      "<Icon> requires a `name` prop (e.g. `<Icon name=\"star\"/>`). Without it the emit falls through to generic and produces an unbuildable `Icon(…)` literal on both Swift and Kotlin.",
    )
  } else if (tag === 'Image' && !hasAttr('src')) {
    ctx.warnings.push(
      '<Image> requires a `src` prop (e.g. `<Image src="/a.png"/>`). Without it the emit falls through to generic and produces an unbuildable `Image(…)` / `AsyncImage(…)` call with no source.',
    )
  } else if (tag === 'Link' && !hasAttr('to')) {
    ctx.warnings.push(
      '<Link> requires a `to` prop (e.g. `<Link to="/users"/>`). Without it the nav target is missing on both targets — emit falls through to generic.',
    )
  }
  // Round-2 follow-up: warn on silent-no-op shapes (props that ARE
  // accepted in the type system but currently produce zero emit on
  // both targets). Each of these used to silently drop the prop with
  // no diagnostic — users wrote them assuming they worked.

  // <Press> with NEITHER onPress NOR onLongPress → a no-op clickable
  // element. Real-user trap: it looks interactive but does nothing. A
  // long-press-ONLY `<Press onLongPress={fn}>` is legitimate (the tap
  // action is intentionally empty), so it must NOT warn.
  if (
    tag === 'Press' &&
    !attrs.some(
      (a) =>
        a.kind === 'event' &&
        (a.name === 'press' ||
          a.name === 'longpress' ||
          a.name === 'swipeleft' ||
          a.name === 'swiperight'),
    )
  ) {
    ctx.warnings.push(
      '<Press> without an `onPress`, `onLongPress`, or `onSwipeLeft`/`onSwipeRight` handler emits a no-op clickable element on both targets (button with empty action / Box with no-op clickable modifier). Add `onPress={fn}` or use the plain primitive directly.',
    )
  }

  // <Link prefetch=…> — accepted in the web type, silently dropped
  // on native (no equivalent for SwiftUI NavigationLink or Compose
  // navigation). Warn so users know it's a web-only optimization.
  if (tag === 'Link' && hasAttr('prefetch')) {
    ctx.warnings.push(
      '<Link prefetch={…}> is silently ignored on native targets — prefetch is a web-only optimization. The link still renders + navigates correctly; the hint just has no effect on iOS/Android.',
    )
  }

  // <Stack align=…> / <Inline align=…> / <Layer align=…> with an
  // UNKNOWN literal value silently falls back to the default
  // alignment. Warn for the 4 most common typo shapes.
  if (tag === 'Stack' || tag === 'Inline' || tag === 'Layer') {
    const alignAttr = attrs.find(
      (a) => a.kind === 'attr' && a.name === 'align',
    ) as Extract<AttrIR, { kind: 'attr' }> | undefined
    if (alignAttr && alignAttr.value.kind === 'literal') {
      const v = alignAttr.value.value
      if (typeof v === 'string') {
        // Canonical accepted values per canonical-primitives.ts
        // resolveAlign: 'start' / 'center' / 'end' / 'stretch'
        // (and the per-axis variants Layer uses).
        const validAligns = new Set([
          'start',
          'center',
          'end',
          'stretch',
          'top',
          'bottom',
          'leading',
          'trailing',
        ])
        if (!validAligns.has(v)) {
          ctx.warnings.push(
            `<${tag} align="${v}"> uses an unrecognized align value — silently falls back to the default alignment on both targets. Accepted: start / center / end / stretch (plus top/bottom/leading/trailing for <Layer>).`,
          )
        }
      }
    }
  }
}

function parseJsxAttr(node: AnyNode, ctx: ParseCtx): AttrIR | null {
  // JSX spread attribute: `<Comp {...props} />`. oxc shape:
  // `JSXSpreadAttribute` with `.argument`. Captured as a spread AttrIR; the
  // emitter expands it against the target component's declared props.
  if (node.type === 'JSXSpreadAttribute') {
    return { kind: 'spread', argument: parseExpr(node.argument, ctx) }
  }
  if (node.type !== 'JSXAttribute' || !node.name?.name) return null
  const rawName = node.name.name as string
  const value = node.value

  const exprValue: ExprIR =
    value?.type === 'JSXExpressionContainer'
      ? parseExpr(value.expression, ctx)
      : value?.type === 'Literal' || value?.type === 'StringLiteral'
        ? { kind: 'literal', value: value.value }
        : { kind: 'literal', value: true }

  if (rawName.startsWith('on') && rawName.length > 2 && rawName[2]! >= 'A' && rawName[2]! <= 'Z') {
    return { kind: 'event', name: rawName.slice(2).toLowerCase(), handler: exprValue }
  }
  return { kind: 'attr', name: rawName, value: exprValue }
}

function parseJsxChild(node: AnyNode, ctx: ParseCtx): ChildIR | null {
  if (node.type === 'JSXText') {
    // JSX whitespace handling per Babel / React convention:
    //
    //   - JSXText that's ALL whitespace + newlines is dropped
    //   - Multi-line text (formatted JSX with newlines between tags)
    //     collapses whitespace + trims edges — that's just layout
    //     whitespace, not content
    //   - Single-line text preserves whitespace AS-IS — including
    //     the trailing space in `<Text>Count: {count}</Text>` before
    //     the `{count}` expression. Without this, the emit produced
    //     `Text("Count:\(count)")` instead of `"Count: \(count)"`.
    //
    // The naive pre-PR-9 `.trim()` was correct for layout whitespace
    // but wrong for content-adjacent whitespace.
    const raw = node.value as string
    if (!/\S/.test(raw)) return null
    const v = /\n/.test(raw) ? raw.replace(/\s+/g, ' ').trim() : raw
    if (v === '') return null
    return { kind: 'text', value: v }
  }
  if (node.type === 'JSXExpressionContainer') {
    // A comment-only container — `{/* … */}` — has a `JSXEmptyExpression`
    // inside (no real expression). It's idiomatic JSX (inline notes in
    // markup) and produces NO output on any target; skip it silently
    // rather than routing it through parseExpr's default arm, which would
    // warn "Unsupported expression: JSXEmptyExpression".
    if (node.expression?.type === 'JSXEmptyExpression') return null
    return { kind: 'expr', expr: parseExpr(node.expression, ctx) }
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return { kind: 'expr', expr: parseExpr(node, ctx) }
  }
  return null
}

