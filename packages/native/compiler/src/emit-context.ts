/**
 * The EmitContext facade — the ONLY surface an element-lowering plugin may use
 * to emit target code.
 *
 * An emitter's state (alias imports, const maps, the warning sink, the
 * recursive `emitXJsx` dispatcher) is module-level in `emit-swift.ts` /
 * `emit-kotlin.ts`. A plugin must not import those modules (the boundary test
 * in `tests/plugin-boundary.test.ts` enforces it), so each emitter hands the
 * plugin a context that CLOSES OVER that state. The plugin's per-target
 * `swift` / `kotlin` functions hold every target difference; the facade has no
 * per-target logic of its own.
 *
 * Also the context a `DeclEmitter` (`call-lowering.ts`) receives, so the same
 * facade serves element lowerings and declaration emitters.
 *
 * Add a method here only when a plugin needs it, and add its row to the
 * "Element lowering plugins" table in `.agents/guides/multiplatform/README.md`.
 */

import type { PluginScope } from './plugin-scope'
import type { ChildIR, DeclIR, ExprIR, ExtDecl, JsxElementIR, StatementIR, TypeIR } from './types'

export type EmitTarget = 'swift' | 'kotlin'

/** A plugin-owned declaration scope, independent of any library or target class. */
export interface MemberEmitScope {
  readonly name: string
  readonly declarations: readonly DeclIR[]
  /** The parameter through which member bodies address this scope's signal values. */
  readonly receiver?: string | undefined
  /** Use the target's observable-class member spelling (Swift Observation). */
  readonly observable?: boolean | undefined
}

/** A literal attribute value the compiler can read at compile time. */
export type StaticAttrValue = string | number | boolean

/** The component being emitted, as a plugin may read it. */
export interface ComponentInfo {
  /** The component's name (`''` outside a component). */
  readonly name: string
  /** The name of its props parameter (`props` in `(props: P) => …`), when it has one. */
  readonly propsParamName: string | undefined
  /** Its body-level `const`s (and their initializers) that are value-shaped — what a JSX attribute may name. */
  readonly valueConsts: ReadonlyMap<string, ExprIR>
  /** Whether `tag` names a component declared in the file being emitted (so it is not the plugin's to claim). */
  isDeclared(tag: string): boolean
}

/**
 * The struct registry the emitter keeps for the file: structs the source
 * declared, and the ones synthesised for object literals. A plugin that builds
 * a typed container from a literal (a flow's node rows) must resolve to the
 * SAME names the rest of the file's literals do, so it asks here rather than
 * keeping a registry of its own.
 */
export interface StructRegistry {
  /**
   * The struct for an inline object TYPE: a declared one with the same typed
   * fields, else one with the same field names, else a synthesised one (which
   * this call registers). `null` when the shape cannot be named.
   */
  forTypeFields(fields: readonly { name: string; type: TypeIR }[]): string | null
  /**
   * The struct a LITERAL's fields resolve to — the lookup every `{…}` literal in
   * the file uses (declared by value shape, by field names, by subset, then a
   * synthesised one). `null` when none applies.
   */
  forLiteralFields(fields: readonly { name: string; value: ExprIR }[]): string | null
  /** Register a NEW synthesised struct with these fields and return its name (a union of heterogeneous rows). */
  synthesize(fields: readonly { name: string; type: TypeIR }[]): string
}

/**
 * The emitter's WebView plumbing, for a plugin that hosts a page in `<WebView>`.
 * Each member delegates to the helper the core's own `<WebView>` lowering uses.
 */
export interface WebViewFacade {
  /** An attribute's value as a reactive expression (an accessor arrow unwrapped), or `undefined` when absent. */
  dynamicAttr(el: JsxElementIR, name: string): ExprIR | undefined
  /** A `data` / `graph` payload as the target's JSON-encoding call. */
  dataArg(value: ExprIR): string
  /** A `(message) => …` handler as the target's message callback. */
  messageHandler(handler: ExprIR): string
}

/** The emitter state a plugin-facing context reads beyond the basics — what a real emitter supplies and a toy backend may omit. */
export interface EmitContextBackendExtras {
  /** Emit inside a fresh declaration scope; restore the enclosing scope even when emission throws. */
  memberScope<T>(scope: MemberEmitScope, run: () => T): T
  /** Render a native member function through the compiler's ordinary function emitter. */
  functionDeclaration(decl: Extract<DeclIR, { kind: 'function' }>): string
  /** An argument emitted against a known native parameter type. */
  argument(e: ExprIR, type: TypeIR | undefined, indent: number): string
  /** A member accessed from outside a target-observable class. */
  observableIdent(name: string): string
  /** The component being emitted. */
  component(): ComponentInfo
  /** `_functionNames.has` — `name` is a function declared in the file (module level or component body). */
  isFunctionName(name: string): boolean
  /** `emitSwiftChild` / `emitKotlinChild` — one JSX child at `indent`. */
  child(child: ChildIR, indent: number): string
  /** `emitSwiftGeneric` / `emitKotlinGeneric` — the element as an unclaimed component call, bypassing every lowering. */
  generic(el: JsxElementIR, indent: number): string
  /** `swiftType` / `kotlinType` — the target spelling of a type. */
  typeText(type: TypeIR): string
  /** The target type name of a typed container's element (a table row, a sortable item) — see {@link EmitContext.rowType}. */
  rowType(element: TypeIR): string
  /** The fields of a typed container's element — see {@link EmitContext.rowFields}. */
  rowFields(element: TypeIR): readonly { name: string; type: TypeIR }[]
  /** The emitter's expression-type inference over the active component. */
  inferType(e: ExprIR): TypeIR
  /** The file's struct registry. */
  structs: StructRegistry
  /** Push `message` unless the sink already holds it. */
  warnOnce(message: string): void
  /** The WebView plumbing. */
  webView: WebViewFacade
  /** The per-FILE plugin memory (the module scope's state bag). */
  fileState<T>(key: string, init: () => T): T
  /** `emitSwiftLayoutModifiers` / `emitKotlinLayoutModifier` with `handled` props the caller already consumed. */
  layoutModifiersFor(el: JsxElementIR, handled: ReadonlySet<string>): string
  /** `emitSwiftStatement` / `emitKotlinStatement` over a statement list, with `locals` typed for inference where the emitter keeps an inference context for handler locals. */
  statements(stmts: readonly StatementIR[], indent: number, locals?: ReadonlyMap<string, TypeIR>): string[]
}

/** What a target emitter supplies; `createEmitContext` adds the pure helpers. */
export interface EmitContextBackend {
  /** Re-enter the target's JSX dispatcher (`emitSwiftJsx` / `emitKotlinJsx`). */
  emit(el: JsxElementIR, indent: number): string
  /** `readStaticAttr` / `readStaticAttrKotlin` — literal or const-resolved. */
  staticAttr(el: JsxElementIR, name: string): StaticAttrValue | undefined
  /** `swiftStr` / `kotlinStr` — a quoted, escaped string literal. */
  stringLiteral(value: string): string
  /** `swiftIdent` / `kotlinIdent` — a binding name made safe as a target identifier (keywords escaped). */
  identifier(name: string): string
  /** Push onto the emitter's warning sink (surfaced as `result.warnings`). */
  warn(message: string): void
  /** `emitSwiftExpr` / `emitKotlinExpr` — an expression, at `indent`. */
  expr(e: ExprIR, indent: number): string
  /** The same, with `type` steering how an object / array literal is typed (`withExpectedType`). */
  exprAs(type: TypeIR | undefined, e: ExprIR, indent: number): string
  /** The emitter's current per-component scope (declarations, state, deferred substitutions). */
  scope(): PluginScope
  /** `readStringAttrExpr` / `readStringAttrExprKotlin` — a string attribute as target text (a literal, or an interpolation of the expression). */
  stringAttr(el: JsxElementIR, name: string, indent: number): string | undefined
  /** `emitSwiftLayoutModifiers` / `emitKotlinLayoutModifier` — the modifier chain for the element's styling props. */
  layoutModifiers(el: JsxElementIR): string
  /** `emitSwiftAction` / `emitKotlinAction` — an event handler as a closure body. */
  action(handler: ExprIR, indent: number): string
  /** `_moduleConstExprs.get` / `_moduleConstExprsKotlin.get` — a module-level `const`'s initializer. */
  constExpr(name: string): ExprIR | undefined
  /** `_colorScope` — the compile-time colour-mode scope enclosing the element (opaque; the plugin that stored it types it). */
  colorScope(): object | undefined
}

/**
 * The Swift emitter's per-component `@State` declaration list — the lines the
 * component body receives ahead of its own statements. A host that needs
 * private view state (a zoom window, a hover index) declares it here; the
 * emitter inserts the lines when the component ends.
 */
export interface HostStateSlot {
  /** Add one declaration line (`@State private var … = …`). */
  declare(line: string): void
  /** The component's declarations so far, in order. */
  lines(): readonly string[]
  /** Replace every declaration from index `start` on (a host that renames or drops what it declared). */
  replaceFrom(start: number, lines: readonly string[]): void
  /** A number never returned before in this file — for suffixing a name two hosts would otherwise share. */
  freshSuffix(): number
}

/** What the Swift emitter supplies beyond {@link EmitContextBackend}. */
export interface SwiftEmitContextBackend extends EmitContextBackend, EmitContextBackendExtras {
  /** `resolveFunctionHandler` — the name of the module function an expression refers to, if it is one. */
  handlerName(handler: ExprIR): string | undefined
  /** `inlineValueConsts` — `expr` with the component's value-shaped `const`s substituted in. */
  inlineConsts(e: ExprIR): ExprIR
  /** `_usesColorScheme = true`. */
  markColorSchemeUsed(): void
  /** `_hostStateDecls` + `_swiftHostStateSeq`. */
  hostState: HostStateSlot
}

export interface EmitContext {
  /** Own signals/computeds/functions and an optional signal receiver, scoped for the synchronous callback. */
  memberScope<T>(scope: MemberEmitScope, run: () => T): T
  /** Emit a member function, including default parameters, return types and statement bodies. */
  functionDeclaration(decl: Extract<DeclIR, { kind: 'function' }>): string
  /** Convert numeric arguments when the known parameter stores fractional values. */
  argument(e: ExprIR, type: TypeIR | undefined, at?: number): string
  /** The target's spelling for a member of an observable class. */
  observableIdent(name: string): string
  readonly target: EmitTarget
  /** Indentation (in spaces) of the element being emitted. */
  readonly indent: number
  /** Emit another element through the full dispatcher; `indent` defaults to this one's. */
  emit(el: JsxElementIR, indent?: number): string
  /** `n` spaces; defaults to this element's indentation. */
  pad(n?: number): string
  /** A literal / const-resolved attribute value, or `undefined` when absent or dynamic. */
  staticAttr(el: JsxElementIR, name: string): StaticAttrValue | undefined
  /** A quoted string literal in the target language. */
  stringLiteral(value: string): string
  /** A name made safe as an identifier in the target language (reserved words escaped). */
  ident(name: string): string
  /** Report a lowering limitation to the author. */
  warn(message: string): void
  /** An expression emitted through the full dispatcher, at `at` (default: this context's indentation). */
  expr(e: ExprIR, at?: number): string
  /** An expression emitted with `type` as the expected type (steers an object / array literal's struct); `undefined` clears an inherited expectation. */
  exprAs(type: TypeIR | undefined, e: ExprIR, at?: number): string
  /** A string attribute as target text — a literal, or an interpolation of the expression — or `undefined` when absent. */
  stringAttr(el: JsxElementIR, name: string, at?: number): string | undefined
  /** The modifier chain (`.padding(…).background(…)`) for the element's own styling props. */
  layoutModifiers(el: JsxElementIR): string
  /** An event handler as a closure body, at `at` (default: this context's indentation). */
  action(handler: ExprIR, at?: number): string
  /** The initializer of the module-level `const` named `name`, or `undefined`. */
  constExpr(name: string): ExprIR | undefined
  /**
   * The compile-time colour-mode scope enclosing the element, as the value its
   * owner stored — or `undefined` outside any scope. READ-ONLY: the scope is
   * entered and left by the core's `<PyreonUI mode>` / `<ColorModeProvider>`
   * handling and by any plugin-declared scope provider (`CompilerPlugin.scopes`;
   * saved and restored in `finally`, so providers nest and a sibling inherits nothing). The facade does not know
   * the value's type; the plugin that reads it names it (`colorScope<T>()`).
   */
  colorScope<T extends object>(): T | undefined
  /** The ext declarations of `(plugin, type)` in the component being emitted. */
  decls(plugin: string, type: string): readonly ExtDecl[]
  /**
   * Plugin memory that lives for ONE component (a fresh bag per component, and
   * per file): `init` runs the first time `key` is read. Namespace the key with
   * your plugin name — the bag is shared by every plugin in the component.
   */
  state<T>(key: string, init: () => T): T
  /**
   * An opaque token to embed in emitted text when the value is only known after
   * the component body has been emitted. It is replaced once the body is done;
   * `fallback` is used when nothing resolved it, and without one an unresolved
   * token is an ERROR naming `key` (a placeholder must never ship). Namespace
   * the key with your plugin name.
   */
  deferred(key: string, fallback?: string): string
  /** Supply the text for `key`; callable from any emit code that learns it later. */
  resolveDeferred(key: string, value: string): void
  /** The component being emitted: its name, props parameter, value constants. */
  component(): ComponentInfo
  /** Whether `name` is a function declared in the file. */
  isFunctionName(name: string): boolean
  /** One JSX child, emitted through the full dispatcher at `at` (default: this context's indentation). */
  child(child: ChildIR, at?: number): string
  /**
   * The element emitted as the compiler's generic component call (`Name(attr: …) { children }`), WITHOUT consulting
   * any lowering — what an element lowering falls back to when it declines a shape it cannot lower. `emit` would
   * re-enter the dispatcher and claim the same tag again.
   */
  generic(el: JsxElementIR, at?: number): string
  /** The target's spelling of `type`. */
  typeText(type: TypeIR): string
  /**
   * The target type name a typed container's ELEMENT spells to: a declared struct, the struct synthesized for an
   * inline object, or the scalar's own type — what a generic container (`PyreonTableState<Row>`) is instantiated
   * with. Unlike {@link EmitContext.typeText} it resolves against the component being emitted, so an element whose
   * struct the component itself synthesized names that struct.
   */
  rowType(element: TypeIR): string
  /** The fields of a container element: an inline object's own, or the declared / synthesized struct a type reference names. */
  rowFields(element: TypeIR): readonly { name: string; type: TypeIR }[]
  /** The type the emitter infers for `e` in the active component. */
  inferType(e: ExprIR): TypeIR
  /** The file's struct registry (declared and synthesised structs). */
  readonly structs: StructRegistry
  /** Report a limitation unless the exact message was already reported. */
  warnOnce(message: string): void
  /** The WebView plumbing (see {@link WebViewFacade}). */
  readonly webView: WebViewFacade
  /**
   * Plugin memory that lives for ONE FILE: `init` runs the first time `key` is
   * read, and the value is shared by every component of the file and by
   * `prepareEmit`. Namespace the key with your plugin name.
   */
  fileState<T>(key: string, init: () => T): T
  /** Like {@link EmitContext.layoutModifiers}, for an element whose `handled` props the caller consumed itself. */
  layoutModifiersFor(el: JsxElementIR, handled: ReadonlySet<string>): string
  /**
   * A statement list (a callback body a recognizer carried in its payload) as target statements, one
   * string each. `locals` names parameters whose types the body's inference should know (`(ev) => …`
   * over a typed stream item); the Swift emitter seeds them (and the body's own `let`s), the Kotlin
   * emitter infers handler locals itself and ignores them.
   */
  statements(stmts: readonly StatementIR[], indent: number, locals?: ReadonlyMap<string, TypeIR>): string[]
}

/**
 * The context a Swift element lowering receives: the shared facade plus the
 * members only the Swift emitter has state for. A member moves up to
 * {@link EmitContext} when the Kotlin emitter supplies it too (the string /
 * layout / action / const / colour-scope members did when the Kotlin chart
 * hosts moved); what is left here has no Compose analogue.
 */
export interface SwiftEmitContext extends EmitContext {
  /** The name of the module-level function `handler` refers to, or `undefined` when it is anything else. */
  handlerName(handler: ExprIR): string | undefined
  /** `expr` with the component's value-shaped `const`s (and their initializers, transitively) substituted in. */
  inlineConsts(e: ExprIR): ExprIR
  /** Tell the emitter the component reads SwiftUI's colour scheme, so it injects `@Environment(\.colorScheme) pyreonColorScheme`. */
  markColorSchemeUsed(): void
  /** The component's `@State` declaration list (see {@link HostStateSlot}). */
  readonly hostState: HostStateSlot
}

/** What the Kotlin emitter supplies beyond {@link EmitContextBackend}. */
export interface KotlinEmitContextBackend extends EmitContextBackend, EmitContextBackendExtras {
  /** `kotlinIntArg` — an argument to an `Int`-only Kotlin API. */
  intArg(e: ExprIR, indent: number): string
}

/**
 * The context a Kotlin element lowering receives: the shared facade plus the
 * members only the Kotlin emitter has state for.
 */
export interface KotlinEmitContext extends EmitContext {
  /**
   * An argument to a Kotlin API whose parameter is `Int` (a subscript, `take`,
   * a Compose parameter). TS integers are `Long` on Kotlin, so the value
   * narrows at exactly the call that needs it; a literal is emitted bare.
   */
  intArg(e: ExprIR, at?: number): string
}

export function createKotlinEmitContext(backend: KotlinEmitContextBackend, indent: number): KotlinEmitContext {
  return {
    ...createEmitContext('kotlin', backend, indent),
    intArg: (e, at = indent) => backend.intArg(e, at),
  }
}

/** The member `name` of a context built without it: an error naming it (a real emitter supplies every one). */
function missing(name: string): never {
  throw new Error(`[Pyreon] this EmitContext was built without \`${name}\` — only a real emitter supplies it.`)
}

export function createEmitContext(
  target: EmitTarget,
  backend: EmitContextBackend & Partial<EmitContextBackendExtras>,
  indent: number,
): EmitContext {
  return {
    target,
    indent,
    memberScope: (scope, run) => (backend.memberScope ?? (() => missing('memberScope')))(scope, run),
    functionDeclaration: (decl) => (backend.functionDeclaration ?? (() => missing('functionDeclaration')))(decl),
    argument: (e, type, at = indent) => (backend.argument ?? (() => missing('argument')))(e, type, at),
    observableIdent: (name) => (backend.observableIdent ?? (() => missing('observableIdent')))(name),
    emit: (el, at = indent) => backend.emit(el, at),
    pad: (n = indent) => ' '.repeat(n),
    staticAttr: (el, name) => backend.staticAttr(el, name),
    stringLiteral: (value) => backend.stringLiteral(value),
    ident: (name) => backend.identifier(name),
    warn: (message) => backend.warn(message),
    expr: (e, at = indent) => backend.expr(e, at),
    exprAs: (type, e, at = indent) => backend.exprAs(type, e, at),
    stringAttr: (el, name, at = indent) => backend.stringAttr(el, name, at),
    layoutModifiers: (el) => backend.layoutModifiers(el),
    action: (handler, at = indent) => backend.action(handler, at),
    constExpr: (name) => backend.constExpr(name),
    colorScope: <T extends object>() => backend.colorScope() as T | undefined,
    decls: (plugin, type) => backend.scope().decls(plugin, type),
    state: (key, init) => backend.scope().state(key, init),
    deferred: (key, fallback) => backend.scope().deferred(key, fallback),
    resolveDeferred: (key, value) => backend.scope().resolveDeferred(key, value),
    component: () => (backend.component ?? (() => missing('component')))(),
    isFunctionName: (name) => (backend.isFunctionName ?? (() => missing('isFunctionName')))(name),
    child: (child, at = indent) => (backend.child ?? (() => missing('child')))(child, at),
    generic: (el, at = indent) => (backend.generic ?? (() => missing('generic')))(el, at),
    typeText: (type) => (backend.typeText ?? (() => missing('typeText')))(type),
    rowType: (element) => (backend.rowType ?? (() => missing('rowType')))(element),
    rowFields: (element) => (backend.rowFields ?? (() => missing('rowFields')))(element),
    inferType: (e) => (backend.inferType ?? (() => missing('inferType')))(e),
    structs: backend.structs ?? {
      forTypeFields: () => missing('structs'),
      forLiteralFields: () => missing('structs'),
      synthesize: () => missing('structs'),
    },
    warnOnce: (message) => (backend.warnOnce ?? (() => missing('warnOnce')))(message),
    webView: backend.webView ?? {
      dynamicAttr: () => missing('webView'),
      dataArg: () => missing('webView'),
      messageHandler: () => missing('webView'),
    },
    fileState: (key, init) => (backend.fileState ?? (() => missing('fileState')))(key, init),
    layoutModifiersFor: (el, handled) => (backend.layoutModifiersFor ?? (() => missing('layoutModifiersFor')))(el, handled),
    statements: (stmts, at, locals) => (backend.statements ?? (() => missing('statements')))(stmts, at, locals),
  }
}

export function createSwiftEmitContext(backend: SwiftEmitContextBackend, indent: number): SwiftEmitContext {
  return {
    ...createEmitContext('swift', backend, indent),
    handlerName: (handler) => backend.handlerName(handler),
    inlineConsts: (e) => backend.inlineConsts(e),
    markColorSchemeUsed: () => backend.markColorSchemeUsed(),
    hostState: backend.hostState,
  }
}
