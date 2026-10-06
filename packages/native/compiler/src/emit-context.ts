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
  exprAs(type: TypeIR, e: ExprIR, indent: number): string
  /** The emitter's current per-component scope (declarations, state, deferred substitutions). */
  scope(): PluginScope
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
  /** An expression emitted through the full dispatcher, at this context's indentation. */
  expr(e: ExprIR): string
  /** An expression emitted with `type` as the expected type (steers an object / array literal's struct). */
  exprAs(type: TypeIR, e: ExprIR): string
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
    expr: (e) => backend.expr(e, indent),
    exprAs: (type, e) => backend.exprAs(type, e, indent),
    decls: (plugin, type) => backend.scope().decls(plugin, type),
    state: (key, init) => backend.scope().state(key, init),
    deferred: (key, fallback) => backend.scope().deferred(key, fallback),
    resolveDeferred: (key, value) => backend.scope().resolveDeferred(key, value),
  }
}
