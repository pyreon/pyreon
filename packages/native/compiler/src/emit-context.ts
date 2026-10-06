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
import type { ExprIR, ExtDecl, JsxElementIR, TypeIR } from './types'

export type EmitTarget = 'swift' | 'kotlin'

/** A literal attribute value the compiler can read at compile time. */
export type StaticAttrValue = string | number | boolean

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
export interface SwiftEmitContextBackend extends EmitContextBackend {
  /** `readStringAttrExpr` — a string attribute as Swift text (a literal, or an interpolation of the expression). */
  stringAttr(el: JsxElementIR, name: string, indent: number): string | undefined
  /** `emitSwiftLayoutModifiers` — the modifier chain for the element's styling props. */
  layoutModifiers(el: JsxElementIR): string
  /** `emitSwiftAction` — an event handler as a Swift closure body. */
  action(handler: ExprIR, indent: number): string
  /** `resolveFunctionHandler` — the name of the module function an expression refers to, if it is one. */
  handlerName(handler: ExprIR): string | undefined
  /** `_moduleConstExprs.get` — a module-level `const`'s initializer. */
  constExpr(name: string): ExprIR | undefined
  /** `_chartThemeScope` — the compile-time colour-mode scope enclosing the element (opaque; the plugin that stored it types it). */
  colorScope(): object | undefined
  /** `_usesColorScheme = true`. */
  markColorSchemeUsed(): void
  /** `_hostStateDecls` + `_swiftHostStateSeq`. */
  hostState: HostStateSlot
}

export interface EmitContext {
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
}

/**
 * The context a Swift element lowering receives: the shared facade plus the
 * members only the Swift emitter has state for today. A member moves up to
 * {@link EmitContext} when the Kotlin emitter supplies it too.
 */
export interface SwiftEmitContext extends EmitContext {
  /** A string attribute as Swift text — a literal, or an interpolation of the expression — or `undefined` when absent. */
  stringAttr(el: JsxElementIR, name: string, at?: number): string | undefined
  /** The modifier chain (`.padding(…).background(…)`) for the element's own styling props. */
  layoutModifiers(el: JsxElementIR): string
  /** An event handler as a Swift closure body, at `at` (default: this context's indentation). */
  action(handler: ExprIR, at?: number): string
  /** The name of the module-level function `handler` refers to, or `undefined` when it is anything else. */
  handlerName(handler: ExprIR): string | undefined
  /** The initializer of the module-level `const` named `name`, or `undefined`. */
  constExpr(name: string): ExprIR | undefined
  /**
   * The compile-time colour-mode scope enclosing the element, as the value its
   * owner stored — or `undefined` outside any scope. READ-ONLY: the scope is
   * entered and left by the core's `<PyreonUI mode>` / `<ColorModeProvider>` /
   * `<ChartThemeProvider>` handling (saved and restored in `finally`, so
   * providers nest and a sibling inherits nothing). The facade does not know
   * the value's type; the plugin that reads it names it (`colorScope<T>()`).
   */
  colorScope<T extends object>(): T | undefined
  /** Tell the emitter the component reads SwiftUI's colour scheme, so it injects `@Environment(\.colorScheme) pyreonColorScheme`. */
  markColorSchemeUsed(): void
  /** The component's `@State` declaration list (see {@link HostStateSlot}). */
  readonly hostState: HostStateSlot
}

export function createEmitContext(
  target: EmitTarget,
  backend: EmitContextBackend,
  indent: number,
): EmitContext {
  return {
    target,
    indent,
    emit: (el, at = indent) => backend.emit(el, at),
    pad: (n = indent) => ' '.repeat(n),
    staticAttr: (el, name) => backend.staticAttr(el, name),
    stringLiteral: (value) => backend.stringLiteral(value),
    ident: (name) => backend.identifier(name),
    warn: (message) => backend.warn(message),
    expr: (e, at = indent) => backend.expr(e, at),
    exprAs: (type, e, at = indent) => backend.exprAs(type, e, at),
    decls: (plugin, type) => backend.scope().decls(plugin, type),
    state: (key, init) => backend.scope().state(key, init),
    deferred: (key, fallback) => backend.scope().deferred(key, fallback),
    resolveDeferred: (key, value) => backend.scope().resolveDeferred(key, value),
  }
}

export function createSwiftEmitContext(backend: SwiftEmitContextBackend, indent: number): SwiftEmitContext {
  return {
    ...createEmitContext('swift', backend, indent),
    stringAttr: (el, name, at = indent) => backend.stringAttr(el, name, at),
    layoutModifiers: (el) => backend.layoutModifiers(el),
    action: (handler, at = indent) => backend.action(handler, at),
    handlerName: (handler) => backend.handlerName(handler),
    constExpr: (name) => backend.constExpr(name),
    colorScope: <T extends object>() => backend.colorScope() as T | undefined,
    markColorSchemeUsed: () => backend.markColorSchemeUsed(),
    hostState: backend.hostState,
  }
}
