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
  /**
   * Called if mounting the TipTap engine fails — a broken extension set
   * (e.g. `starterKit: false` with no schema-providing extension), a
   * throwing custom extension, or a failed dynamic import of `@tiptap/*`.
   * Without this, a mount failure surfaces only as an unhandled promise
   * rejection (the editor silently never mounts). When provided it takes the
   * error; otherwise a `[Pyreon]`-prefixed message is logged in development.
   */
  onError?: (error: Error) => void
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
  /** Plain-text content (computed). Exact `getText()` once mounted. */
  text: Computed<string>
  /**
   * Whether the document has no text (computed). Derived from the document
   * JSON, so it is accurate before mount / after dispose (a media-only doc
   * reconciles on mount).
   */
  isEmpty: Computed<boolean>
  /**
   * Visible character count (computed) — sums text-node lengths, excluding the
   * `\n\n` block separators `getText()` inserts. Derived from the document JSON,
   * so a stored-JSON draft has a real count before the (lazy) engine mounts.
   */
  characterCount: Computed<number>
  /**
   * Whitespace-delimited word count (computed). Derived from the document JSON
   * (block boundaries never merge words), so it works before mount.
   */
  wordCount: Computed<number>
  /** Whether an undo step is available (computed). */
  canUndo: Computed<boolean>
  /** Whether a redo step is available (computed). */
  canRedo: Computed<boolean>
  /** Focus state (reactive). */
  focused: Signal<boolean>
  /**
   * Whether the document is editable — a writable `Signal`. `editable()` reads
   * reactively (e.g. to label a read-only toggle); `editable.set(false)` flips
   * the live editor to read-only at runtime.
   */
  editable: Signal<boolean>
  /** The underlying TipTap `Editor`, or `null` until mounted. */
  view: Signal<Editor | null>
  /**
   * Whether a mark/node is active at the current selection — reactive (reads
   * the transaction counter, so it re-derives on edits + selection moves).
   * The toolbar primitive: `editor.isActive('bold')`,
   * `editor.isActive('heading', { level: 2 })`. Call inside a reactive scope.
   */
  isActive: (name: string | Record<string, unknown>, attrs?: Record<string, unknown>) => boolean
  /**
   * The TipTap command chain for the mounted editor, or `null` before mount.
   * `editor.chain()?.toggleBold().run()`. The escape hatch for every command
   * (toggleBold / toggleItalic / toggleHeading / toggleBulletList / …).
   */
  chain: () => ReturnType<Editor['chain']> | null
  /** Imperatively focus the editor (no-op before mount). */
  focus: () => void
  /** Imperatively blur the editor (no-op before mount). */
  blur: () => void
  /** Undo the last change (no-op before mount). */
  undo: () => void
  /** Redo the last undone change (no-op before mount). */
  redo: () => void
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
