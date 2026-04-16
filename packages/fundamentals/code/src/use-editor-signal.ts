import { onUnmount } from '@pyreon/core'
import { bindEditorToSignal } from './bind-signal'
import type {
  BindEditorToSignalOptions,
  SignalLike,
} from './bind-signal'
import type { EditorInstance } from './types'

/**
 * Reactive hook for binding an editor instance to a signal with automatic
 * cleanup. Wraps `bindEditorToSignal` and calls `dispose()` on unmount,
 * eliminating the need for manual cleanup.
 *
 * @example
 * ```tsx
 * import { createEditor, useEditorSignal } from '@pyreon/code'
 * import { signal } from '@pyreon/reactivity'
 *
 * function MyEditor() {
 *   const code = signal('console.log("hello")')
 *   const editor = createEditor({
 *     value: code(),
 *     language: 'javascript',
 *   })
 *
 *   // Auto-cleanup on unmount — no need to call dispose manually
 *   useEditorSignal({
 *     editor,
 *     signal: code,
 *     serialize: (val) => val,
 *     parse: (text) => text,
 *   })
 *
 *   return <CodeEditor instance={editor} />
 * }
 * ```
 */
export function useEditorSignal<T>(
  options: BindEditorToSignalOptions<T>,
): void {
  const binding = bindEditorToSignal(options)

  // Auto-dispose when the component unmounts
  onUnmount(() => {
    binding.dispose()
  })
}
