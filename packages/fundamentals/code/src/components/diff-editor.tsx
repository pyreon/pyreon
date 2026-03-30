import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { MergeView } from "@codemirror/merge"
import { EditorState, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import type { VNodeChild } from "@pyreon/core"
import { onUnmount } from "@pyreon/core"
import type { Signal } from "@pyreon/reactivity"
import { watch } from "@pyreon/reactivity"
import { loadLanguage } from "../languages"
import { resolveTheme } from "../themes"
import type { DiffEditorProps } from "../types"

const readText = (value: string | Signal<string>): string =>
  typeof value === "string" ? value : value()

const isSignal = (value: string | Signal<string>): value is Signal<string> =>
  typeof value === "function"

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
  const { original, modified, language = "plain", theme = "light", readOnly = true } = props

  let mergeView: MergeView | null = null
  const cleanups: (() => void)[] = []

  const containerRef = async (el: Element | null) => {
    if (!el) return

    const langExt = await loadLanguage(language)
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
    ;(el as HTMLElement).innerHTML = ""

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
  }

  onUnmount(() => {
    for (const cleanup of cleanups) cleanup()
    mergeView?.destroy()
    mergeView = null
  })

  const baseStyle = `width: 100%; height: 100%; overflow: hidden; ${props.style ?? ""}`

  return (
    <div ref={containerRef} class={`pyreon-diff-editor ${props.class ?? ""}`} style={baseStyle} />
  )
}
