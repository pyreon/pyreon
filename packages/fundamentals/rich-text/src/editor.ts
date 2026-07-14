import { computed, signal, wrapSignal } from '@pyreon/reactivity'
import type { AnyExtension, Editor, JSONContent } from '@tiptap/core'
import type { RichTextConfig, RichTextEditor } from './types'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [] }

// ── Pure ProseMirror-JSON walkers ──────────────────────────────────────────
// text / character-count / word-count / isEmpty derive DIRECTLY from the
// document JSON (`baseJson`), not the mounted TipTap engine. Three payoffs:
//   1. They work BEFORE mount + AFTER dispose — a stored-JSON draft reports a
//      real character/word count and an accurate `isEmpty` without ever
//      loading the (lazy) engine (draft lists, SSR previews).
//   2. They re-derive only when the DOCUMENT changes (`baseJson`), never on a
//      pure selection move — moving the cursor no longer re-runs a live
//      word-counter effect (the engine bumps one counter for BOTH update and
//      selection events; content computeds must not subscribe to selection).
//   3. `characterCount` counts the VISIBLE characters, not the `\n\n` block
//      separators TipTap's `getText()` inserts between blocks (`aaa`+`bbb`
//      across two paragraphs is 6, not 8).
// Schema-less by design (StarterKit-accurate). A custom node whose rendered
// text differs from its concatenated text descendants may count differently
// than its live `getText()` — documented; the 99% (StarterKit) case is exact.

/** Push every text node's string (depth-first) into `acc`. */
function collectTextNodes(node: JSONContent, acc: string[]): void {
  if (node.type === 'text') {
    if (node.text) acc.push(node.text)
    return
  }
  const kids = node.content
  if (kids) for (const child of kids) collectTextNodes(child, acc)
}

/** Total VISIBLE character count — sum of every text node's length. */
function countChars(node: JSONContent): number {
  const acc: string[] = []
  collectTextNodes(node, acc)
  let total = 0
  for (const s of acc) total += s.length
  return total
}

/**
 * Concatenate each textblock's inline text (marks joined without a separator,
 * so a mark-split word stays one word), one string per block.
 */
function collectBlockTexts(node: JSONContent, out: string[]): void {
  const kids = node.content
  if (!kids || kids.length === 0) return
  // A textblock has at least one direct text child; concatenate its inline
  // text as a single block. Otherwise it's a container — recurse into it.
  if (kids.some((c) => c.type === 'text')) {
    const acc: string[] = []
    collectTextNodes(node, acc)
    out.push(acc.join(''))
  } else {
    for (const child of kids) collectBlockTexts(child, out)
  }
}

/** Whitespace-delimited word count (block boundaries never merge words). */
function countWords(node: JSONContent): number {
  const blocks: string[] = []
  collectBlockTexts(node, blocks)
  let total = 0
  for (const b of blocks) {
    const t = b.trim()
    if (t !== '') total += t.split(/\s+/).length
  }
  return total
}

/** Best-effort plain text — blocks joined with `\n\n` (matches `getText`). */
function extractText(node: JSONContent): string {
  const blocks: string[] = []
  collectBlockTexts(node, blocks)
  return blocks.join('\n\n')
}

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
  // Two transaction counters, deliberately split. `docVersion` bumps only on a
  // CONTENT change (`onUpdate`); `selectionVersion` bumps on a selection move
  // (`onSelectionUpdate`). Content computeds that read the live engine
  // (`html` / `canUndo` / `canRedo`) subscribe to `docVersion` ONLY, so a cursor
  // move doesn't re-run them; `isActive` (mark/node state depends on BOTH the
  // marks present and where the cursor sits) subscribes to both.
  const docVersion = signal(0)
  const selectionVersion = signal(0)

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
    docVersion() // subscribe — re-derive on each CONTENT change (not selection)
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    return view.peek()
  }

  // Engine-derived, CONTENT-reactive (read the live editor once mounted; skip
  // selection-only churn by subscribing to `docVersion`, not selection).
  const html = computed(() => readEditor()?.getHTML() ?? (typeof content === 'string' ? content : ''))
  const canUndo = computed(() => readEditor()?.can().undo() ?? false)
  const canRedo = computed(() => readEditor()?.can().redo() ?? false)

  // Document-derived (pure walkers over `baseJson`). They track the DOCUMENT,
  // not the engine — so they work before mount / after dispose, don't re-run on
  // a pure cursor move, and count visible characters (no `\n\n` separators).
  // `text` prefers the live engine's exact `getText()` when mounted (custom
  // node serializers), falling back to the walker before mount.
  const text = computed(() => readEditor()?.getText() ?? extractText(baseJson()))
  const characterCount = computed(() => countChars(baseJson()))
  const wordCount = computed(() => countWords(baseJson()))
  const isEmpty = computed(() => countChars(baseJson()) === 0)

  /**
   * Whether a mark/node is active at the current selection — reactive (reads
   * the transaction counter, so it re-derives on every edit + selection
   * move). The toolbar primitive: `editor.isActive('bold')`,
   * `editor.isActive('heading', { level: 2 })`. Read it inside a reactive
   * scope (a `() => …` thunk in JSX, an `effect`, a `computed`).
   */
  const isActive = (name: string | Record<string, unknown>, attrs?: Record<string, unknown>): boolean => {
    // Active-state depends on BOTH content (which marks/nodes exist) AND the
    // selection (where the cursor sits) — subscribe to both counters.
    docVersion()
    selectionVersion()
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
        onSelectionUpdate: () => selectionVersion.update((v) => v + 1),
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
