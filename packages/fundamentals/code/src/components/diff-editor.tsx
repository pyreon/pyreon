import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { getOriginalDoc, MergeView, originalDocChangeEffect, unifiedMergeView } from '@codemirror/merge'
import { ChangeSet, EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { VNodeChild } from '@pyreon/core'
import { onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { watch } from '@pyreon/reactivity'
import { loadLanguage } from '../languages'
import { resolveTheme } from '../themes'
import type { DiffEditorProps } from '../types'

const readText = (value: string | Signal<string>): string =>
  typeof value === 'string' ? value : value()

const isSignal = (value: string | Signal<string>): value is Signal<string> =>
  typeof value === 'function'

/**
 * Side-by-side or inline diff editor using @codemirror/merge.
 *
 * Supports reactive `original` and `modified` props — pass a Signal<string>
 * and the diff view updates automatically when the signal changes.
 *
 * @example
 * ```tsx
 * <DiffEditor
 *   original="const x = 1"
 *   modified="const x = 2"
 *   language="typescript"
 *   theme="dark"
 *   style="height: 400px"
 * />
 * ```
 */
export function DiffEditor(props: DiffEditorProps): VNodeChild {
  const {
    original,
    modified,
    language = 'plain',
    theme = 'light',
    inline = false,
    readOnly = true,
    onError,
  } = props

  let mergeView: MergeView | null = null
  // Unified (inline) mode builds a single EditorView carrying the
  // unifiedMergeView extension instead of a side-by-side MergeView.
  let unifiedView: EditorView | null = null
  // `containerRef` lazy-loads the language grammar (async), so the component
  // can unmount WHILE that import is in flight. `onUnmount` sets this; the ref
  // bails after the await so it never builds a MergeView that `onUnmount` has
  // already (no-op) torn down — the dispose-during-pending-mount leak.
  let unmounted = false
  const cleanups: (() => void)[] = []

  const containerRef = async (el: Element | null) => {
    if (!el) return

    try {
      const langExt = await loadLanguage(language)
      // Unmounted while the grammar loaded — abort before creating a leaked view.
      if (unmounted) return
      const themeExt = resolveTheme(theme)

      const extensions: Extension[] = [
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        langExt,
        themeExt,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
      ]

      const originalText = readText(original)
      const modifiedText = readText(modified)

      // Clear previous content
      ;(el as HTMLElement).innerHTML = ''

      if (inline) {
        // ── Unified (inline) diff — ONE editor showing the modified doc with
        // the original rendered as deleted-chunk widgets above each change.
        unifiedView = new EditorView({
          parent: el as HTMLElement,
          state: EditorState.create({
            doc: modifiedText,
            extensions: [
              ...extensions,
              unifiedMergeView({
                original: originalText,
                // Accept/reject chunk buttons only make sense when the
                // modified side is user-editable.
                mergeControls: !readOnly,
                collapseUnchanged: { margin: 3, minSize: 4 },
              }),
            ],
          }),
        })

        // Track signal changes reactively — modified drives the editor doc,
        // original drives the compared-against document via the merge
        // package's dedicated state effect.
        if (isSignal(modified)) {
          const stop = watch(modified, (text) => {
            if (!unifiedView) return
            unifiedView.dispatch({
              changes: { from: 0, to: unifiedView.state.doc.length, insert: text },
            })
          })
          cleanups.push(stop)
        }

        if (isSignal(original)) {
          const stop = watch(original, (text) => {
            if (!unifiedView) return
            const orig = getOriginalDoc(unifiedView.state)
            unifiedView.dispatch({
              effects: originalDocChangeEffect(
                unifiedView.state,
                ChangeSet.of({ from: 0, to: orig.length, insert: text }, orig.length),
              ),
            })
          })
          cleanups.push(stop)
        }

        return
      }

      mergeView = new MergeView({
        a: { doc: originalText, extensions },
        b: { doc: modifiedText, extensions },
        parent: el as HTMLElement,
        collapseUnchanged: { margin: 3, minSize: 4 },
      })

      // Track signal changes and update MergeView editors reactively
      if (isSignal(original)) {
        const stop = watch(original, (text) => {
          if (!mergeView) return
          const editor = mergeView.a
          editor.dispatch({
            changes: { from: 0, to: editor.state.doc.length, insert: text },
          })
        })
        cleanups.push(stop)
      }

      if (isSignal(modified)) {
        const stop = watch(modified, (text) => {
          if (!mergeView) return
          const editor = mergeView.b
          editor.dispatch({
            changes: { from: 0, to: editor.state.doc.length, insert: text },
          })
        })
        cleanups.push(stop)
      }
    } catch (err) {
      // Build failed (failed grammar import, throwing extension). Surface it
      // instead of leaving an unhandled promise rejection.
      const error = err instanceof Error ? err : new Error(String(err))
      if (onError) {
        onError(error)
      } else if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error('[Pyreon] @pyreon/code DiffEditor failed to mount:', error)
      }
    }
  }

  onUnmount(() => {
    unmounted = true
    for (const cleanup of cleanups) cleanup()
    mergeView?.destroy()
    mergeView = null
    unifiedView?.destroy()
    unifiedView = null
  })

  const baseStyle = `width: 100%; height: 100%; overflow: hidden; ${props.style ?? ''}`

  return (
    <div ref={containerRef} class={`pyreon-diff-editor ${props.class ?? ''}`} style={baseStyle} />
  )
}
