import { cx, type VNodeChild } from '@pyreon/core'
import type { RichTextProps } from '../types'

/**
 * Mount component for a {@link createRichTextEditor} instance. Creates the
 * TipTap editor inside a container `<div>` on render (lazy-loading the
 * engine). The instance is framework-independent — create it with
 * `createRichTextEditor`, mount it here.
 *
 * Lifecycle: like `@pyreon/code`'s `<CodeEditor>`, the editor instance is
 * **user-owned** — call `editor.dispose()` in your `onCleanup` /
 * `onUnmount` if the instance won't be reused (the component does not
 * auto-dispose, so the same instance can be re-mounted).
 *
 * @example
 * ```tsx
 * const editor = createRichTextEditor({ content: '<p>Hello</p>' })
 * <RichText instance={editor} style="min-height: 12rem" />
 * ```
 */
export function RichText(props: RichTextProps): VNodeChild {
  const { instance } = props

  const containerRef = (el: Element | null): void => {
    if (!el) return
    void instance._mount(el as HTMLElement)
  }

  return (
    <div ref={containerRef} class={cx(['pyreon-rich-text', props.class])} style={props.style ?? ''} />
  )
}
