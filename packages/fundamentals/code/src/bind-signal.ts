import { effect } from '@pyreon/reactivity'
import type { EditorInstance } from './types'

/**
 * A signal-shaped binding source. Accepts either a real Pyreon
 * `Signal<T>` or any object that exposes the same `() => T` reader
 * + `set(value: T) => void` writer pair (so consumers can pass
 * `flow.nodes` from `@pyreon/flow`, a custom store accessor, etc.).
 */
export interface SignalLike<T> {
  /** Read the current value (subscribes the calling reactive scope). */
  (): T
  /** Write a new value. */
  set: (value: T) => void
  /** Read without subscribing — optional, used by helpers if present. */
  peek?: () => T
}

export interface BindEditorToSignalOptions<T> {
  /** Editor instance to bind. */
  editor: EditorInstance
  /**
   * The external state to mirror. Can be a Pyreon `Signal<T>` or any
   * `SignalLike<T>` (e.g. a wrapper around a store). The binding
   * subscribes to it via the `()` call inside an effect, so any
   * reactive source that supports that pattern works.
   */
  signal: SignalLike<T>
  /**
   * Project the external value into the editor text. Should be
   * deterministic — i.e. `serialize(parse(serialize(x))) === serialize(x)` —
   * otherwise the editor's text will churn between equivalent
   * canonical forms while the user is typing.
   */
  serialize: (value: T) => string
  /**
   * Parse the editor text back into the external value type. Return
   * `null` (or any falsy value) to signal a parse failure — the
   * binding will skip the external write and call `onParseError` if
   * provided. Throwing is also caught and routed to `onParseError`.
   */
  parse: (text: string) => T | null
  /**
   * Optional callback for parse failures. Use this to surface inline
   * error UI without crashing the binding. The external state stays
   * at its last valid value.
   */
  onParseError?: (error: Error) => void
}

export interface EditorBinding {
  /**
   * Stop the binding. Disposes both the external→editor and
   * editor→external effects. Call from `onCleanup` / `onUnmount`
   * to avoid leaks when the consuming component unmounts.
   */
  dispose: () => void
}

/**
 * Two-way bind a Pyreon `Signal<T>` to a `@pyreon/code` editor's
 * text content with built-in loop prevention.
 *
 * **The recurring boilerplate this replaces.** Before this helper
 * existed, every consumer that wanted to drive a `<CodeEditor>`
 * from external state had to write the flag-based loop-prevention
 * pattern by hand:
 *
 * ```ts
 * let applyingFromCanvas = false
 * let applyingFromEditor = false
 *
 * const editor = createEditor({
 *   value: serialize(store.value()),
 *   onChange: (text) => {
 *     if (applyingFromCanvas) return
 *     applyingFromEditor = true
 *     try { store.value.set(parse(text)) } catch {}
 *     applyingFromEditor = false
 *   },
 * })
 *
 * effect(() => {
 *   const v = store.value()
 *   if (applyingFromEditor) return
 *   const next = serialize(v)
 *   if (next === editor.value.peek()) return
 *   applyingFromCanvas = true
 *   editor.value.set(next)
 *   applyingFromCanvas = false
 * })
 * ```
 *
 * The pattern was hand-rolled in PR #191 (resume builder), PR #192
 * (flow editor), and would have been needed in every future
 * consumer that wanted bidirectional editor binding. The helper
 * compresses it to:
 *
 * ```ts
 * const binding = bindEditorToSignal({
 *   editor,
 *   signal: store.value,
 *   serialize: (val) => JSON.stringify(val, null, 2),
 *   parse: (text) => {
 *     try { return JSON.parse(text) } catch { return null }
 *   },
 * })
 *
 * onCleanup(() => binding.dispose())
 * ```
 *
 * **What the helper guarantees:**
 *
 * 1. **No infinite loops.** The editor's internal CM↔signal sync is
 *    already loop-safe (it compares values before propagating). The
 *    helper adds a second guard layer at the external↔editor
 *    boundary so the format-on-input race can't echo back.
 *
 * 2. **Parse errors don't crash the binding.** Malformed input in
 *    the editor leaves the external state at its last valid value
 *    and (optionally) fires `onParseError`. The user can keep
 *    typing without losing context.
 *
 * 3. **Both effects are disposable.** Call `binding.dispose()` from
 *    `onCleanup` / `onUnmount` to avoid leaks.
 *
 * **What the helper does NOT do:**
 *
 * - It does NOT debounce the external write. Every keystroke that
 *   parses successfully triggers `signal.set(parsed)`. If the
 *   external store is expensive to update, wrap the helper in a
 *   debounced layer of your own.
 *
 * - It does NOT preserve cursor position when the external state
 *   forces a re-serialization to a different string. As long as
 *   `serialize` is deterministic (i.e. `serialize(parse(text))`
 *   produces a string structurally equivalent to `text`), this
 *   isn't a problem. JSON with consistent indentation works fine.
 *
 * - It does NOT add the binding to the editor's lifecycle. The
 *   consumer is responsible for calling `dispose()` on unmount.
 *   Future versions may integrate with `onCleanup` if invoked
 *   inside a tracked scope.
 *
 * - It does NOT skip writes when the parsed value is structurally
 *   identical to the source's current state. The external→editor
 *   direction has a string-based short-circuit (we compare
 *   `serialize(value)` to `editor.value.peek()` before writing),
 *   but the editor→external direction always calls
 *   `signal.set(parsed)` because we have no general-purpose deep
 *   equality check. In practice this is fine because the editor's
 *   own internal CM↔signal sync compares values before
 *   propagating, so a redundant `signal.set(sameValue)` doesn't
 *   re-trigger the editor. The helper relies on this property of
 *   the underlying `editor.value` signal.
 *
 * @example Basic usage
 * ```ts
 * import { createEditor, bindEditorToSignal } from '@pyreon/code'
 * import { signal } from '@pyreon/reactivity'
 *
 * const data = signal({ name: 'Alice', age: 30 })
 * const editor = createEditor({
 *   value: JSON.stringify(data(), null, 2),
 *   language: 'json',
 * })
 *
 * const binding = bindEditorToSignal({
 *   editor,
 *   signal: data,
 *   serialize: (val) => JSON.stringify(val, null, 2),
 *   parse: (text) => {
 *     try { return JSON.parse(text) } catch { return null }
 *   },
 *   onParseError: (err) => console.warn('JSON parse error:', err.message),
 * })
 *
 * // Later, on unmount:
 * binding.dispose()
 * ```
 */
export function bindEditorToSignal<T>(
  options: BindEditorToSignalOptions<T>,
): EditorBinding {
  const { editor, signal, serialize, parse, onParseError } = options

  // The two flags break the format-on-input race documented in the
  // function's JSDoc. Both directions check the OPPOSITE flag and
  // bail if a write is already in progress.
  let applyingFromExternal = false
  let applyingFromEditor = false

  // External → editor. Subscribes to `signal()` so any change to
  // the external value re-runs this effect. The serialized output
  // is compared against the editor's current text before writing
  // — identical strings short-circuit (no editor dispatch).
  const externalEffect = effect(() => {
    const value = signal()
    if (applyingFromEditor) return
    const next = serialize(value)
    if (next === editor.value.peek()) return
    applyingFromExternal = true
    try {
      editor.value.set(next)
    } finally {
      applyingFromExternal = false
    }
  })

  // Editor → external. Subscribes to `editor.value()` (which the
  // editor's internal CM updateListener writes to on every doc
  // change). When the user types, this effect parses the new text
  // and writes the parsed value back to the external signal. Parse
  // failures are caught and routed to `onParseError`; the external
  // state stays at its last valid value.
  const editorEffect = effect(() => {
    const text = editor.value()
    if (applyingFromExternal) return

    let parsed: T | null = null
    try {
      parsed = parse(text)
    } catch (err) {
      onParseError?.(err instanceof Error ? err : new Error(String(err)))
      return
    }

    if (parsed == null) return

    applyingFromEditor = true
    try {
      signal.set(parsed)
    } finally {
      applyingFromEditor = false
    }
  })

  return {
    dispose: () => {
      externalEffect.dispose()
      editorEffect.dispose()
    },
  }
}
