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
 * Add a method here only when a plugin needs it, and add its row to the
 * "Element lowering plugins" table in `.agents/guides/multiplatform/README.md`.
 */

import type { JsxElementIR } from './types'

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
  /** Push onto the emitter's warning sink (surfaced as `result.warnings`). */
  warn(message: string): void
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
  /** Report a lowering limitation to the author. */
  warn(message: string): void
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
    warn: (message) => backend.warn(message),
  }
}
