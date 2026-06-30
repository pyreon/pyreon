import { computed, signal, wrapSignal } from '@pyreon/reactivity'
import type { AnyExtension, Editor, JSONContent } from '@tiptap/core'
import type { RichTextConfig, RichTextEditor } from './types'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [] }

/**
 * Create a reactive WYSIWYG rich-text editor instance.
 *
 * The document state (`json` / `html` / `text` / counts / undo-redo) is
 * backed by signals; the TipTap `Editor` (over ProseMirror) is created
 * lazily when the instance is mounted via `<RichText>` — so `@tiptap/*`
 * stays out of the initial bundle (same lazy-load shape as
 * `@pyreon/code`'s languages and `@pyreon/charts`' ECharts).
 *
 * @example
 * ```tsx
 * const editor = createRichTextEditor({ content: '<p>Hello</p>' })
 *
 * editor.json()                 // reactive ProseMirror JSON
 * editor.json.set(draft)        // replace content (loop-safe)
 * editor.text()                 // reactive plain text
 * editor.chain()?.toggleBold().run()
 *
 * <RichText instance={editor} style="min-height: 12rem" />
 * ```
 */
export function createRichTextEditor(config: RichTextConfig = {}): RichTextEditor {
  const {
    content = '',
    editable: initialEditable = true,
    ariaLabel = 'Rich text editor',
    starterKit = true,
    extensions: userExtensions = [],
    autofocus = false,
    onChange,
    onError,
  } = config

  // ── Reactive state ───────────────────────────────────────────────────
  const baseJson = signal<JSONContent>(
    typeof content === 'object' && content ? content : EMPTY_DOC,
  )
  const focused = signal(false)
  const view = signal<Editor | null>(null)
  const baseEditable = signal(initialEditable)
  // Bumped on every transaction so the read-through computeds re-derive.
  const docVersion = signal(0)

  // `editable` is a writable facade: reads delegate to baseEditable; `.set`
  // flips the live editor's editable state (when mounted) then commits to base
  // — the runtime read-only toggle (mirrors `@pyreon/code`'s `readOnly`).
  const editable = wrapSignal(baseEditable, {
    set: (next) => {
      view.peek()?.setEditable(next)
      baseEditable.set(next)
    },
  })

  // Loop guard: when WE push content into the editor (`json.set`), the
  // editor's `onUpdate` fires — skip writing back to `baseJson` (we set it
  // explicitly), exactly like `@pyreon/code`'s CM↔signal compare guard.
  let applyingExternal = false
  // The content the editor is created with at mount (covers a string OR a
  // pre-mount `json.set`).
  let pendingContent: string | JSONContent = content
  // Mount-attempt generation. `_mount` lazy-imports `@tiptap/*` (async), so a
  // `dispose()` or a newer `_mount` can land WHILE an import is in flight.
  // `dispose()` bumps this; `_mount` captures it before its awaits and bails
  // (without creating a leaked editor) if it changed — closes the
  // dispose-during-pending-mount leak (orphaned ProseMirror view + DOM).
  let mountToken = 0
  // True once a mount has successfully created the editor. After that, the
  // live document lives in `baseJson` (kept current by `onUpdate` / `json.set`),
  // so a re-mount (dispose → mount the SAME instance, the documented
  // user-owned lifecycle) seeds from the CURRENT doc — not the stale
  // config-time `pendingContent`, which would silently revert edits.
  let hasMountedOnce = false

  // `json` is a writable facade: reads/peek/subscribe delegate to baseJson;
  // `.set` pushes into the live editor (when mounted) then commits to base.
  const json = wrapSignal(baseJson, {
    set: (next) => {
      const e = view.peek()
      if (e) {
        applyingExternal = true
        e.commands.setContent(next)
        applyingExternal = false
      } else {
        pendingContent = next
      }
      baseJson.set(next)
    },
  })

  const readEditor = (): Editor | null => {
    docVersion() // subscribe — re-derive on each transaction
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    return view.peek()
  }

  const html = computed(() => readEditor()?.getHTML() ?? (typeof content === 'string' ? content : ''))
  const text = computed(() => readEditor()?.getText() ?? '')
  const isEmpty = computed(() => readEditor()?.isEmpty ?? true)
  const characterCount = computed(() => readEditor()?.getText().length ?? 0)
  const wordCount = computed(() => {
    const t = readEditor()?.getText().trim() ?? ''
    return t === '' ? 0 : t.split(/\s+/).length
  })
  const canUndo = computed(() => readEditor()?.can().undo() ?? false)
  const canRedo = computed(() => readEditor()?.can().redo() ?? false)

  /**
   * Whether a mark/node is active at the current selection — reactive (reads
   * the transaction counter, so it re-derives on every edit + selection
   * move). The toolbar primitive: `editor.isActive('bold')`,
   * `editor.isActive('heading', { level: 2 })`. Read it inside a reactive
   * scope (a `() => …` thunk in JSX, an `effect`, a `computed`).
   */
  const isActive = (name: string | Record<string, unknown>, attrs?: Record<string, unknown>): boolean => {
    docVersion() // subscribe — re-derive on each transaction / selection change
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const e = view.peek()
    if (!e) return false
    return typeof name === 'string' ? e.isActive(name, attrs) : e.isActive(name)
  }

  const chain = (): ReturnType<Editor['chain']> | null => view.peek()?.chain() ?? null
  const focus = (): void => {
    view.peek()?.commands.focus()
  }
  const blur = (): void => {
    view.peek()?.commands.blur()
  }
  const undo = (): void => {
    view.peek()?.chain().undo().run()
  }
  const redo = (): void => {
    view.peek()?.chain().redo().run()
  }
  const dispose = (): void => {
    // Invalidate any in-flight `_mount` so a mount whose dynamic import is
    // still loading won't create a live editor AFTER we've torn down.
    mountToken++
    const e = view.peek()
    if (e) {
      e.destroy()
      view.set(null)
    }
  }

  const _mount = async (parent: HTMLElement): Promise<void> => {
    if (view.peek()) return // already mounted

    // Claim this mount attempt. If `dispose()` (or a newer `_mount`) bumps the
    // token while the dynamic imports below are in flight, we bail before
    // creating the editor — no leaked ProseMirror view + contenteditable DOM.
    const token = ++mountToken

    try {
      const { Editor } = await import('@tiptap/core')
      const exts: AnyExtension[] = []
      if (starterKit) {
        const { StarterKit } = await import('@tiptap/starter-kit')
        exts.push(StarterKit)
      }
      exts.push(...userExtensions)

      // Superseded while loading (disposed / re-mounted) — abort cleanly.
      if (token !== mountToken) return

      const editor = new Editor({
        element: parent,
        extensions: exts,
        // First mount: the config content (a string lives only in
        // `pendingContent`). Re-mount: the live document from `baseJson`.
        content: hasMountedOnce ? baseJson.peek() : pendingContent,
        // honor a pre-mount `editable.set(false)` (config default otherwise).
        editable: baseEditable.peek(),
        autofocus,
        // a11y: the contenteditable content area is a labeled multiline textbox.
        editorProps: {
          attributes: {
            role: 'textbox',
            'aria-multiline': 'true',
            'aria-label': ariaLabel,
          },
        },
        onUpdate: ({ editor: e }) => {
          docVersion.update((v) => v + 1)
          if (!applyingExternal) {
            const next = e.getJSON()
            baseJson.set(next)
            onChange?.(next)
          }
        },
        onSelectionUpdate: () => docVersion.update((v) => v + 1),
        onFocus: () => focused.set(true),
        onBlur: () => focused.set(false),
      })

      // Disposed during the synchronous `new Editor` (defensive) — destroy the
      // just-created view rather than leaking it.
      if (token !== mountToken) {
        editor.destroy()
        return
      }

      view.set(editor)
      hasMountedOnce = true
      // Normalize the signal to the editor's parsed doc (covers string content).
      baseJson.set(editor.getJSON())
      docVersion.update((v) => v + 1)
    } catch (err) {
      // Mount failed (broken extension set, throwing extension, failed import).
      // Surface it instead of leaving an unhandled promise rejection: route to
      // the user `onError`, else log a `[Pyreon]`-prefixed message in dev.
      const error = err instanceof Error ? err : new Error(String(err))
      if (onError) {
        onError(error)
      } else if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error('[Pyreon] @pyreon/rich-text failed to mount the editor:', error)
      }
    }
  }

  return {
    json,
    html,
    text,
    isEmpty,
    characterCount,
    wordCount,
    canUndo,
    canRedo,
    focused,
    editable,
    view,
    isActive,
    chain,
    focus,
    blur,
    undo,
    redo,
    dispose,
    _mount,
  }
}
