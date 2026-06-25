import { effect } from '@pyreon/reactivity'
import type { JSONContent, RichTextEditor } from './types'

/**
 * A signal-shaped binding source — a real Pyreon `Signal<T>` or any object
 * exposing the same `() => T` reader + `set(value)` writer (+ optional `peek`).
 */
export interface SignalLike<T> {
  (): T
  set: (value: T) => void
  peek?: () => T
}

export interface BindRichTextToSignalOptions<T> {
  /** Editor instance to bind. */
  editor: RichTextEditor
  /** External state to mirror (a `Signal` or `SignalLike`). */
  signal: SignalLike<T>
  /**
   * Serialization the external signal holds:
   * - `'json'` (default) — `T` is `JSONContent` (the ProseMirror document).
   * - `'html'` — `T` is an HTML `string`.
   */
  format?: 'json' | 'html'
  /** Called if applying a value to the editor (or reading it back) throws. */
  onError?: (error: Error) => void
}

export interface RichTextBinding {
  /** Stop the binding (disposes both directions). Call from `onCleanup`. */
  dispose: () => void
}

/**
 * Two-way bind a Pyreon `Signal` to a rich-text editor's content, with
 * built-in loop prevention — the editor mirror of `@pyreon/code`'s
 * `bindEditorToSignal`. Use `format: 'json'` to persist/restore the
 * structured document, or `format: 'html'` for an HTML string.
 *
 * @example
 * ```ts
 * const draft = signal<JSONContent>({ type: 'doc', content: [] })
 * const editor = createRichTextEditor()
 * const binding = bindRichTextToSignal({ editor, signal: draft })
 * onCleanup(() => binding.dispose())
 * ```
 */
export function bindRichTextToSignal<T = JSONContent>(
  options: BindRichTextToSignalOptions<T>,
): RichTextBinding {
  const { editor, signal, format = 'json', onError } = options

  // Two flags break the echo race: each direction bails if the opposite
  // write is already in flight (same shape as `bindEditorToSignal`).
  let applyingFromSignal = false
  let applyingFromEditor = false

  // External → editor.
  const signalToEditor = effect(() => {
    const value = signal()
    if (applyingFromEditor) return
    applyingFromSignal = true
    try {
      if (format === 'html') {
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        const e = editor.view.peek()
        if (e && (value as string) !== e.getHTML()) {
          e.commands.setContent(value as string)
        }
      } else {
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        if (JSON.stringify(value) !== JSON.stringify(editor.json.peek())) {
          editor.json.set(value as unknown as JSONContent)
        }
      }
    } catch (err) {
      onError?.(err as Error)
    } finally {
      applyingFromSignal = false
    }
  })

  // Editor → external.
  const editorToSignal = effect(() => {
    const out = format === 'html' ? editor.html() : editor.json()
    /* v8 ignore next — defensive loop guard. The external→editor sync path
       sets applyingFromSignal then resets it inside the same synchronous
       block; Pyreon defers a cross-effect re-run past that block (the flag is
       already false when this effect re-runs), so the bail is unreachable
       under the current scheduler but kept to match @pyreon/code's guard. */
    if (applyingFromSignal) return
    applyingFromEditor = true
    try {
      signal.set(out as unknown as T)
    } catch (err) {
      onError?.(err as Error)
    } finally {
      applyingFromEditor = false
    }
  })

  return {
    dispose: () => {
      signalToEditor.dispose()
      editorToSignal.dispose()
    },
  }
}
