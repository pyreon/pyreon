import type { Computed, Signal } from '@pyreon/reactivity'
import type { AnyExtension, Editor, JSONContent } from '@tiptap/core'

// Re-export the ProseMirror document JSON shape so consumers type drafts
// without a direct @tiptap dependency.
export type { JSONContent } from '@tiptap/core'

/** Configuration for {@link createRichTextEditor}. */
export interface RichTextConfig {
  /**
   * Initial document. An HTML string (`'<p>Hi</p>'`) or ProseMirror JSON
   * (`{ type: 'doc', content: [...] }`). Defaults to an empty document.
   */
  content?: string | JSONContent
  /** Whether the document is editable (default `true`). Read-only when `false`. */
  editable?: boolean
  /**
   * Accessible name for the editor. The content area is a `role="textbox"`,
   * which has no name unless one is supplied — a screen reader otherwise
   * announces just "edit text, multiline". Defaults to `"Rich text editor"`.
   */
  ariaLabel?: string
  /** Include the TipTap StarterKit (paragraph, headings, bold/italic, lists, …). Default `true`. */
  starterKit?: boolean
  /** Extra TipTap extensions, appended after StarterKit. */
  extensions?: AnyExtension[]
  /** Autofocus the editor on mount (default `false`). */
  autofocus?: boolean
  /** Called with the document JSON on every change. */
  onChange?: (json: JSONContent) => void
}

/**
 * A reactive rich-text editor instance. Mirrors `@pyreon/code`'s
 * `EditorInstance`: document state is signal-backed; the TipTap `Editor`
 * is created on mount via the `<RichText>` component.
 */
export interface RichTextEditor {
  /**
   * The document as ProseMirror JSON — a writable `Signal`. `editor.json()`
   * reads reactively; `editor.json.set(next)` replaces the editor content
   * (loop-safe). Before mount it holds the initial content.
   */
  json: Signal<JSONContent>
  /** Rendered HTML (computed; reads the live editor once mounted). */
  html: Computed<string>
  /** Plain-text content (computed). */
  text: Computed<string>
  /** Whether the document is empty (computed). */
  isEmpty: Computed<boolean>
  /** Plain-text character count (computed). */
  characterCount: Computed<number>
  /** Whether an undo step is available (computed). */
  canUndo: Computed<boolean>
  /** Whether a redo step is available (computed). */
  canRedo: Computed<boolean>
  /** Focus state (reactive). */
  focused: Signal<boolean>
  /** The underlying TipTap `Editor`, or `null` until mounted. */
  view: Signal<Editor | null>
  /**
   * The TipTap command chain for the mounted editor, or `null` before mount.
   * `editor.chain()?.toggleBold().run()`.
   */
  chain: () => ReturnType<Editor['chain']> | null
  /** Imperatively focus the editor (no-op before mount). */
  focus: () => void
  /** Tear down the editor + its DOM. Call from `onCleanup` / `onUnmount`. */
  dispose: () => void
  /** @internal — mount the editor into a container element (called by `<RichText>`). */
  _mount: (parent: HTMLElement) => Promise<void>
}

/** Props for the `<RichText>` mount component. */
export interface RichTextProps {
  /** The instance from {@link createRichTextEditor}. */
  instance: RichTextEditor
  /** Class for the container element. */
  class?: string
  /** Inline style for the container element. */
  style?: string
}
