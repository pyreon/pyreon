import { cx, useProvidedColorMode } from '@pyreon/core'
import { watch } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'
import type { CodeEditorProps, EditorInstance } from '../types'

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
  // Read through `props`: components run once, so destructuring would pin this
  // to the first instance if a caller ever swapped it.

  // An editor created without a `theme` follows the app's colour mode
  // (`<PyreonUI mode>` / `<ColorModeProvider mode>` from @pyreon/core) when the
  // app set one; with none it keeps its light default. A sync INTO the
  // editor's own writable signal (not a derived value), re-run only when the
  // app's mode flips, and disposed with this component.
  const appMode = useProvidedColorMode()
  const followsApp = !(props.instance as EditorInstance & { _themeExplicit?: boolean })._themeExplicit
  if (appMode !== undefined && followsApp) {
    watch(appMode, (mode) => props.instance.theme.set(mode), { immediate: true })
  }

  const containerRef = (el: Element | null) => {
    if (!el) return

    // Mount the editor into the container
    const mountable = props.instance as EditorInstance & {
      _mount?: (parent: HTMLElement) => Promise<void>
    }
    if (mountable._mount) {
      mountable._mount(el as HTMLElement)
    }
  }

  const baseStyle = `width: 100%; height: 100%; overflow: hidden; ${props.style ?? ''}`

  return (
    <div ref={containerRef} class={cx(['pyreon-code-editor', props.class])} style={baseStyle} />
  )
}
