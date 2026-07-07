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
  RouteIR,
  StatementIR,
  StoreDefnIR,
  StructIR,
  TypeIR,
  ZodFieldConstraints,
  ZodFieldType,
  ZodSchemaDefnIR,
} from './types'
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
  hookFieldAliases: Map<string, { object: string; field: string }>
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
}

export function parsePyreon(source: string, filename = 'input.tsx'): ParseResult {
  const ctx: ParseCtx = {
    warnings: [],
    source,
    storeHookNames: new Set(),
    objectTypeAliases: new Map(),
    storeAliases: new Map(),
    hookFieldAliases: new Map(),
    hookDestructureCounter: 0,
    helperFns: [],
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
  const components: ComponentIR[] = []
  const enums: EnumIR[] = []
  const structs: StructIR[] = []
  const moduleDecls: ModuleDeclIR[] = []
  const stores: StoreDefnIR[] = []
  const models: ModelDefnIR[] = []
  const fieldMetas: FieldMetaDefnIR[] = []
  const features: FeatureDefnIR[] = []
  const zodSchemas: ZodSchemaDefnIR[] = []

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
      continue
    }
    // Gap 4 follow-up — @pyreon/validation Valibot v1.
    const vs = tryValibotSchemaDefnFromTopLevel(node, ctx)
    if (vs) {
      zodSchemas.push(vs) // shared IR (single struct shape)
      continue
    }
    // Gap 4 follow-up — @pyreon/validation ArkType v1.
    const as = tryArktypeSchemaDefnFromTopLevel(node, ctx)
    if (as) {
      zodSchemas.push(as)
      continue
    }
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
    helperFns: ctx.helperFns,
    warnings: ctx.warnings,
  }
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
  if (decl.type === 'TSInterfaceDeclaration') {
    const name = (decl.id?.name as string | undefined) ?? 'an interface'
    ctx.warnings.push(
      `Top-level \`interface ${name}\` is NOT compiled to native (it emits nothing → native code referencing it won't compile). PMTC synthesizes a struct/data-class from an object-literal type alias, not an interface — use \`type ${name} = { … }\` instead.`,
    )
  } else if (decl.type === 'TSEnumDeclaration') {
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
const WEB_ONLY_PACKAGES = new Set([
  '@pyreon/charts',
  '@pyreon/code',
  '@pyreon/flow',
  '@pyreon/document',
  '@pyreon/document-primitives',
  '@pyreon/connector-document',
  '@pyreon/elements',
  '@pyreon/ui-components',
  '@pyreon/ui-primitives',
  '@pyreon/coolgrid',
  '@pyreon/styler',
  '@pyreon/rocketstyle',
  '@pyreon/unistyle',
  '@pyreon/kinetic',
  '@pyreon/kinetic-presets',
  '@pyreon/dnd',
  '@pyreon/toast',
  '@pyreon/table',
  '@pyreon/virtual',
])

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
    if (WEB_ONLY_PACKAGES.has(pkg) && !seen.has(pkg)) {
      seen.add(pkg)
      ctx.warnings.push(
        `${pkg} is WEB-ONLY — it renders via the DOM / a browser-only library and has NO native (iOS/Android) emit, so PMTC can't compile it. On native, render it behind a \`<Web>\` escape hatch (web target only), or use a platform-native equivalent inside \`<NativeIOS>\` / \`<NativeAndroid>\`. The shared, multi-platform UI vocabulary lives in \`@pyreon/primitives\` (Stack / Text / Button / …) — those compile to all three targets.`,
      )
    }
  }
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
  const body = setup.body as AnyNode
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

  // RHS must be a CallExpression whose callee is `model({...}).create`.
  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  const createCallee = init.callee as AnyNode | undefined
  if (createCallee?.type !== 'MemberExpression') return null
  if (createCallee.property?.type !== 'Identifier') return null
  if ((createCallee.property.name as string) !== 'create') return null
  // .create() must be called on a `model({...})` call.
  const modelCall = createCallee.object as AnyNode | undefined
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
    if (typeof v === 'string') {
      fields.push({ name: fieldName, type: 'string', initial: v })
    } else if (typeof v === 'number') {
      fields.push({ name: fieldName, type: 'number', initial: v })
    } else if (typeof v === 'boolean') {
      fields.push({ name: fieldName, type: 'boolean', initial: v })
    } else {
      ctx.warnings.push(
        `model declaration \`${instanceName}\`: state field \`${fieldName}\` is not a string / number / boolean literal. Silently dropping.`,
      )
    }
  }

  if (fields.length === 0) {
    ctx.warnings.push(
      `model declaration \`${instanceName}\`: no recognizable state fields. Falling back to silent-drop.`,
    )
    return null
  }

  return { instanceName, modelId: instanceName, fields }
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
  schemaFn: string,
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
    /* libraryDisplay (unused here) */ schemaFn,
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
  schemaFn: string,
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
  schemaFn: string,
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
  schemaFn: string,
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
  if (init.callee?.type !== 'Identifier') return null
  if ((init.callee.name as string) !== schemaFn) return null

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const innerCall = args[0]
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
      `${schemaFn} declaration \`${bindingName}\`: ${prefix}.object() argument must be a literal shape — v1 emit needs the literal { field: ${prefix}.X() } map. Falling back to silent-drop.`,
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
        ? extractTypeAndConstraints(innerArg, prefix)
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
      for (const obj of collectObjectLiterals(d.initial)) {
        for (const f of obj.fields) {
          const sf = struct.fields.find((x) => x.name === f.name)
          if (sf === undefined || sf.type.kind !== 'number' || sf.type.float === true) continue
          if (
            f.value.kind === 'literal' &&
            typeof f.value.value === 'number' &&
            !Number.isInteger(f.value.value)
          ) {
            sf.type = { kind: 'number', float: true }
          }
        }
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
  if (structs.length === 0) return
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
      const elemName =
        srcType.kind === 'array' && srcType.element.kind === 'typeRef'
          ? srcType.element.name
          : undefined
      const elemType = elemName === undefined ? undefined : structObjectType(elemName)
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
  if (parsed.fields.length === 0) {
    ctx.warnings.push(`Struct ${name}: skipped — empty object type.`)
    return null
  }
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
    hookFieldAliases: new Map(),
    hookDestructureCounter: 0,
    helperFns: [],
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
      returnExpr = parseExpr(stmt.argument, ctx)
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
      // ONE deferred shape keeps a NAMED warning here (never a broken emit — no
      // regression from #2090): a FRACTIONAL body (a non-integer literal /
      // division / `Math.*`) → the `number`→Int param + Int-return emit is a
      // Double mismatch inside the body (`x * 1.5` on an `Int` param), which
      // needs the element-callback-style Int×Double coercion threaded into the
      // helper body — a tracked follow-up.
      //
      // A missing return-type annotation is NO LONGER gated here: a
      // post-parse refine pass (`refineHelperReturns`) infers the return type
      // from the body (via `inferReturnType`, the same util the emitters use),
      // so `function dbl(x: number) { return x * 2 }` — no `: number` — emits.
      // Only a genuinely-un-inferable body (return type stays `unknown` after
      // inference) is warned + dropped there.
      if (helperBodyIsFractional(decl.body)) {
        ctx.warnings.push(
          `${name} is a top-level helper function whose body does fractional math (a non-integer literal / division / \`Math.*\`) — PMTC's \`number\`→\`Int\` params don't yet coerce to \`Double\` inside a helper body, so \`${name}\` was skipped rather than mis-emitted. Inline the logic into the component (where Int×Double coercion is supported), or track the follow-up.`,
        )
      } else {
        ctx.helperFns.push(decl)
      }
    }
    return null
  }

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
 * Does a helper body produce a `Double` (fractional) value anywhere PMTC would
 * need Int→Double coercion the helper-body emit doesn't yet apply? A `number`
 * param maps to `Int`, so a helper doing `x * 1.5` (Int × Double literal) or
 * `x / 2` (division → Double) emits an uncompilable body — so such helpers are
 * DEFERRED (kept as a NAMED warning, never a broken emit). The known
 * Double-producing sources: a non-integer numeric literal, a `/` division, a
 * `Math.*` reference, and `parseFloat` / `Number(...)`. Conservative by
 * construction — a false positive over-warns (a helper isn't emitted, which is
 * safe); a false negative (a Double path this misses) is caught by the
 * real-toolchain corpus (`native-helper-fn-emit.test.ts`) before merge, since
 * the emit would fail `swiftc -typecheck` / `kotlinc`.
 */
function helperBodyIsFractional(stmts: StatementIR[]): boolean {
  const exprFrac = (e: ExprIR | undefined): boolean => {
    if (!e) return false
    switch (e.kind) {
      case 'literal':
        return typeof e.value === 'number' && !Number.isInteger(e.value)
      case 'binary':
        return e.op === '/' || exprFrac(e.left) || exprFrac(e.right)
      case 'comparison':
        return exprFrac(e.left) || exprFrac(e.right)
      case 'logical':
        return exprFrac(e.left) || exprFrac(e.right)
      case 'ternary':
        return exprFrac(e.cond) || exprFrac(e.then) || exprFrac(e.otherwise)
      case 'paren':
        return exprFrac(e.inner)
      case 'unary':
        return exprFrac(e.argument)
      case 'update':
        return exprFrac(e.argument)
      case 'index':
        return exprFrac(e.object) || exprFrac(e.index)
      case 'array':
        return e.elements.some((el) => exprFrac(el))
      case 'spread':
        return exprFrac(e.argument)
      case 'member':
        // `Math.PI` etc. — a Math member reference is Double-valued.
        return (
          (e.object.kind === 'identifier' && e.object.name === 'Math') ||
          exprFrac(e.object)
        )
      case 'call': {
        // `parseFloat(...)` / `Number(...)` → Double; a `Math.*(...)` call →
        // Double (conservatively — floor/round wrap but a follow-up handles
        // that). Any fractional argument also taints the call.
        if (e.callee.kind === 'identifier') {
          if (e.callee.name === 'parseFloat' || e.callee.name === 'Number') return true
        }
        if (
          e.callee.kind === 'member' &&
          e.callee.object.kind === 'identifier' &&
          e.callee.object.name === 'Math'
        ) {
          return true
        }
        return exprFrac(e.callee) || e.args.some((a) => exprFrac(a))
      }
      default:
        return false
    }
  }
  const stmtFrac = (s: StatementIR): boolean => {
    switch (s.kind) {
      case 'return':
        return exprFrac(s.expr)
      case 'let':
        return exprFrac(s.expr)
      case 'expr':
        return exprFrac(s.expr)
      case 'assign':
        return exprFrac(s.value)
      case 'if':
        return (
          exprFrac(s.cond) ||
          s.then.some(stmtFrac) ||
          (s.elseBody?.some(stmtFrac) ?? false)
        )
      case 'while':
      case 'do-while':
        return exprFrac(s.cond) || s.body.some(stmtFrac)
      case 'for-of':
        return exprFrac(s.iterable) || s.body.some(stmtFrac)
      case 'for-range':
        return s.body.some(stmtFrac)
      case 'switch':
        return exprFrac(s.discriminant) || s.cases.some((c) => c.body.some(stmtFrac))
      default:
        return false
    }
  }
  return stmts.some(stmtFrac)
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
    if (h.returnType.kind !== 'unknown') continue
    const inferred = inferReturnType(h.params, h.body, ctx)
    if (inferred.kind === 'unknown') {
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
    'useForm',
    'useClipboard',
    'useStorage',
    'usePermissions',
    'useOnline',
    'useColorScheme',
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
    // not lowerable → fall through to the drop below (unchanged behavior)
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
  if (calleeName === 'useParams') {
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
    return { kind: 'fetch', name, type, url: urlArg.value }
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
  // Phase 4 — `usePermissions(['posts.edit', 'posts.*'])` from
  // @pyreon/permissions. The array of literal grant keys seeds the native
  // PyreonPermissions container. Always succeeds (no bail): a bare
  // `usePermissions()` or a non-literal arg yields an empty grant set and the
  // emit produces a default-constructed container.
  if (calleeName === 'usePermissions') {
    return { kind: 'permissions', name, grants: tryExtractStringArray(init.arguments?.[0]) }
  }
  // Phase 4 — `const clipboard = useClipboard()` from `@pyreon/hooks` →
  // the PyreonClipboard reactive wrapper. No arguments. V1 supports
  // the single-binding form only (the destructure shape
  // `const { copy, copied } = useClipboard()` is a documented
  // follow-up — needs the per-key rewrite that `params-destructure`
  // uses).
  if (calleeName === 'useClipboard') {
    return { kind: 'clipboard', name }
  }
  // Phase 4 — `const scheme = useColorScheme()` from `@pyreon/hooks`
  // → platform-native dark-mode read. No arguments. NO runtime port
  // needed — both SwiftUI (@Environment(\.colorScheme)) and Compose
  // (isSystemInDarkTheme()) ship the primitive. Emit returns the
  // same `"light" | "dark"` string shape the web hook uses.
  if (calleeName === 'useColorScheme') {
    return { kind: 'color-scheme', name }
  }
  // Phase 5 — native data/services hooks. Each instantiates a runtime
  // service container (mirrors useOnline/usePermissions). No args (except
  // useWebSocket's url + useAuth's generic).
  if (calleeName === 'useGeolocation') {
    return { kind: 'geolocation', name }
  }
  if (calleeName === 'useSecureStorage') {
    // Deferred (v1): the Kotlin PyreonSecureStorage REQUIRES an app-injected
    // backend (EncryptedSharedPreferences) — no no-arg constructor — so the
    // compiler can't auto-instantiate it cleanly on Android (a silent
    // in-memory fallback for a SECRET store would be a security footgun).
    // Warns + drops until the backend-injection emit lands. Swift has a real
    // Keychain default; the deferral is for cross-target symmetry. Use the
    // runtime container directly from native host code today.
    ctx.warnings.push(
      `useSecureStorage() declared (\`${name}\`) — emit deferred (v1): the Kotlin secret store needs an app-injected EncryptedSharedPreferences backend, so PMTC can't auto-construct it. Wire PyreonSecureStorage from native host code, or keep in a <Web>-only branch. Tracked as a native data-hook follow-up.`,
    )
    return null
  }
  if (calleeName === 'useDatabase') {
    return { kind: 'database', name }
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
function tryRxNamespaceLowering(
  name: string,
  init: AnyNode,
  ctx: ParseCtx,
): DeclIR | null {
  const callee = init.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression') return null
  const obj = callee.object as AnyNode | undefined
  if (obj?.type !== 'Identifier' || (obj.name as string | undefined) !== 'rx') return null
  const prop = callee.property as AnyNode | undefined
  if (prop?.type !== 'Identifier') return null
  const methodName = prop.name as string | undefined
  if (!methodName) return null

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
          return { kind: 'arrow', params, body: { kind: 'literal', value: '' }, stmts }
        }
        return { kind: 'arrow', params, body: parseExpr(body, ctx) }
      }
      // Block body. The common compact case — a single expression/return
      // statement (`() => { count.set(c() + 1) }`) — keeps the lean
      // single-expr `body` shape (every downstream accessor / `.update` /
      // action emit already handles it; backward-compat).
      const stmts = body.body as AnyNode[]
      if (stmts.length === 0) {
        return { kind: 'arrow', params, body: { kind: 'literal', value: '' } }
      }
      if (
        stmts.length === 1 &&
        (stmts[0]!.type === 'ExpressionStatement' || stmts[0]!.type === 'ReturnStatement')
      ) {
        const only = stmts[0]!
        const inner = only.type === 'ReturnStatement' ? only.argument : only.expression
        if (!inner) return { kind: 'arrow', params, body: { kind: 'literal', value: '' } }
        return { kind: 'arrow', params, body: parseExpr(inner, ctx) }
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
        if (p.type === 'Property' && p.key?.name) {
          fields.push({ name: p.key.name as string, value: parseExpr(p.value, ctx) })
        } else if (p.type === 'SpreadElement') {
          spreads.push(parseExpr(p.argument, ctx))
        }
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
      return unsupportedExpr(
        ctx,
        node,
        '`await` in a component body',
        'load async data via `useFetch(url)` or a route `loader` — both emit native URLSession / ktor fetches.',
      )
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
    'useColorScheme',
    'usePermissions',
    'useOnline',
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

  // <Press> without onPress → emit a clickable element with empty
  // action. Real-user trap: the element looks interactive but does
  // nothing on tap.
  if (tag === 'Press' && !attrs.some((a) => a.kind === 'event' && a.name === 'press')) {
    ctx.warnings.push(
      '<Press> without an `onPress` handler emits a no-op clickable element on both targets (button with empty action / Box with no-op clickable modifier). Add `onPress={fn}` or use the plain primitive directly.',
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

