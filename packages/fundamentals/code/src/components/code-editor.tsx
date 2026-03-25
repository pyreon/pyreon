import type { VNodeChild } from "@pyreon/core"
import type { CodeEditorProps, EditorInstance } from "../types"

/**
 * Code editor component — mounts a CodeMirror 6 instance.
 *
 * @example
 * ```tsx
 * const editor = createEditor({
 *   value: 'const x = 1',
 *   language: 'typescript',
 *   theme: 'dark',
 * })
 *
 * <CodeEditor instance={editor} style="height: 400px" />
 * ```
 */
export function CodeEditor(props: CodeEditorProps): VNodeChild {
  const { instance } = props

  const containerRef = (el: Element | null) => {
    if (!el) return

    // Mount the editor into the container
    const mountable = instance as EditorInstance & {
      _mount?: (parent: HTMLElement) => Promise<void>
    }
    if (mountable._mount) {
      mountable._mount(el as HTMLElement)
    }
  }

  const baseStyle = `width: 100%; height: 100%; overflow: hidden; ${props.style ?? ""}`

  return (
    <div ref={containerRef} class={`pyreon-code-editor ${props.class ?? ""}`} style={baseStyle} />
  )
}
