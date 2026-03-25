import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { MergeView } from "@codemirror/merge"
import { EditorState, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import type { VNodeChild } from "@pyreon/core"
import type { Signal } from "@pyreon/reactivity"
import { loadLanguage } from "../languages"
import { resolveTheme } from "../themes"
import type { DiffEditorProps } from "../types"

/**
 * Side-by-side or inline diff editor using @codemirror/merge.
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
    language = "plain",
    theme = "light",
    readOnly = true,
    inline = false,
  } = props

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

    const originalText = typeof original === "string" ? original : (original as Signal<string>)()
    const modifiedText = typeof modified === "string" ? modified : (modified as Signal<string>)()

    // Clear previous content
    ;(el as HTMLElement).innerHTML = ""

    if (inline) {
      // Unified/inline diff view
      new MergeView({
        a: {
          doc: originalText,
          extensions,
        },
        b: {
          doc: modifiedText,
          extensions,
        },
        parent: el as HTMLElement,
        collapseUnchanged: { margin: 3, minSize: 4 },
      })
    } else {
      // Side-by-side diff
      new MergeView({
        a: {
          doc: originalText,
          extensions,
        },
        b: {
          doc: modifiedText,
          extensions,
        },
        parent: el as HTMLElement,
        collapseUnchanged: { margin: 3, minSize: 4 },
      })
    }
  }

  const baseStyle = `width: 100%; height: 100%; overflow: hidden; ${props.style ?? ""}`

  return (
    <div ref={containerRef} class={`pyreon-diff-editor ${props.class ?? ""}`} style={baseStyle} />
  )
}
