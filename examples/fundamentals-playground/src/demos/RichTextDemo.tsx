import { computed, onCleanup, signal } from '@pyreon/reactivity'
import type { JSONContent } from '@pyreon/rich-text'
import { bindRichTextToSignal, createRichTextEditor, RichText } from '@pyreon/rich-text'

const SAMPLE = `<h1>Pyreon Rich Text</h1>
<p>A reactive WYSIWYG editor — a thin <strong>signal-backed</strong> layer over
<em>TipTap</em> (ProseMirror). Try the <s>toolbar</s> toolbar above.</p>
<ul><li>Bullet lists</li><li>and more</li></ul>
<blockquote>The document is a Signal&lt;JSONContent&gt;.</blockquote>`

export function RichTextDemo() {
  const editor = createRichTextEditor({
    content: SAMPLE,
    ariaLabel: 'Demo rich-text body',
  })

  // ── Two-way binding: an external draft signal <-> the editor document ──
  const draft = signal<JSONContent>(editor.json())
  const binding = bindRichTextToSignal({ editor, signal: draft })

  // Editor instance + binding are user-owned — tear both down on unmount.
  onCleanup(() => {
    binding.dispose()
    editor.dispose()
  })

  const log = signal<string[]>([])
  const addLog = (msg: string) => log.update((l) => [...l.slice(-9), msg])

  // Toolbar descriptor: [label, command, isActive-check]. The command runs
  // through editor.chain(); the active check is read reactively per render.
  type Tool = { label: string; run: () => void; active: () => boolean; title: string }
  const marks: Tool[] = [
    { label: 'B', title: 'Bold', run: () => editor.chain()?.toggleBold().run(), active: () => editor.isActive('bold') },
    { label: 'I', title: 'Italic', run: () => editor.chain()?.toggleItalic().run(), active: () => editor.isActive('italic') },
    { label: 'S', title: 'Strike', run: () => editor.chain()?.toggleStrike().run(), active: () => editor.isActive('strike') },
    { label: '< >', title: 'Inline code', run: () => editor.chain()?.toggleCode().run(), active: () => editor.isActive('code') },
  ]
  const blocks: Tool[] = [
    { label: 'H1', title: 'Heading 1', run: () => editor.chain()?.toggleHeading({ level: 1 }).run(), active: () => editor.isActive('heading', { level: 1 }) },
    { label: 'H2', title: 'Heading 2', run: () => editor.chain()?.toggleHeading({ level: 2 }).run(), active: () => editor.isActive('heading', { level: 2 }) },
    { label: 'H3', title: 'Heading 3', run: () => editor.chain()?.toggleHeading({ level: 3 }).run(), active: () => editor.isActive('heading', { level: 3 }) },
    { label: '• List', title: 'Bullet list', run: () => editor.chain()?.toggleBulletList().run(), active: () => editor.isActive('bulletList') },
    { label: '1. List', title: 'Ordered list', run: () => editor.chain()?.toggleOrderedList().run(), active: () => editor.isActive('orderedList') },
    { label: '❝ Quote', title: 'Blockquote', run: () => editor.chain()?.toggleBlockquote().run(), active: () => editor.isActive('blockquote') },
    { label: '{ } Block', title: 'Code block', run: () => editor.chain()?.toggleCodeBlock().run(), active: () => editor.isActive('codeBlock') },
  ]

  const toolButton = (t: Tool) => (
    <button
      type="button"
      title={t.title}
      class={() => (t.active() ? 'active' : '')}
      onClick={() => {
        t.run()
        editor.focus()
        addLog(t.title)
      }}
    >
      {t.label}
    </button>
  )

  const stateView = computed(() =>
    JSON.stringify(
      {
        editable: editor.editable(),
        focused: editor.focused(),
        isEmpty: editor.isEmpty(),
        characterCount: editor.characterCount(),
        wordCount: editor.wordCount(),
        canUndo: editor.canUndo(),
        canRedo: editor.canRedo(),
      },
      null,
      2,
    ),
  )

  return (
    <div>
      <h2>Rich Text</h2>
      <p class="desc">
        Reactive WYSIWYG editor built as a thin signal-backed layer over TipTap (ProseMirror).
        The document is a <code>Signal&lt;JSONContent&gt;</code>; the toolbar uses
        <code>editor.chain()</code> for commands and the reactive <code>editor.isActive()</code>{' '}
        for active-state highlighting. MIT throughout; collaboration composes with{' '}
        <code>@pyreon/sync</code>.
      </p>

      {/* Toolbar + editor */}
      <div class="section">
        <h3>Editor</h3>
        <div class="row" style="flex-wrap: wrap; gap: 4px; margin-bottom: 8px">
          {marks.map(toolButton)}
          <span style="width: 8px" />
          {blocks.map(toolButton)}
          <span style="width: 8px" />
          <button
            type="button"
            title="Horizontal rule"
            onClick={() => {
              editor.chain()?.setHorizontalRule().run()
              addLog('Horizontal rule')
            }}
          >
            ──
          </button>
        </div>

        <div class="row" style="flex-wrap: wrap; gap: 4px; margin-bottom: 8px">
          <button type="button" disabled={() => !editor.canUndo()} onClick={() => { editor.undo(); addLog('Undo') }}>
            ↶ Undo
          </button>
          <button type="button" disabled={() => !editor.canRedo()} onClick={() => { editor.redo(); addLog('Redo') }}>
            ↷ Redo
          </button>
          <button type="button" onClick={() => { editor.chain()?.clearContent().run(); addLog('Cleared') }}>
            Clear
          </button>
          <button type="button" onClick={() => { editor.json.set(editor.json()); editor.chain()?.setContent(SAMPLE).run(); addLog('Reset sample') }}>
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              editor.editable.set(!editor.editable())
              addLog(`Editable → ${editor.editable()}`)
            }}
          >
            {() => (editor.editable() ? 'Make Read-Only' : 'Make Editable')}
          </button>
          <button type="button" onClick={() => { editor.focus(); addLog('Focus') }}>
            Focus
          </button>
        </div>

        <RichText
          instance={editor}
          style="border: 1px solid #333; border-radius: 8px; min-height: 200px; padding: 12px; background: #1e1e1e"
        />

        {/* Status bar */}
        <div style="display: flex; gap: 16px; padding: 6px 12px; background: #1e1e1e; color: #888; font-size: 12px; font-family: monospace; border-radius: 0 0 8px 8px; border: 1px solid #333; border-top: none">
          <span>{() => `${editor.wordCount()} words`}</span>
          <span>{() => `${editor.characterCount()} chars`}</span>
          <span>{() => (editor.focused() ? 'Focused' : 'Blurred')}</span>
          <span>{() => (editor.editable() ? 'Editable' : 'Read-only')}</span>
          <span>{() => (editor.isEmpty() ? 'Empty' : 'Has content')}</span>
        </div>
      </div>

      {/* Two-way binding */}
      <div class="section">
        <h3>Two-Way Binding (bindRichTextToSignal)</h3>
        <p style="font-size: 13px; opacity: 0.7">
          An external <code>Signal&lt;JSONContent&gt;</code> is bound to the editor. Type above —
          the signal updates. Click below — the editor updates. Loop-safe.
        </p>
        <div class="row" style="margin-bottom: 8px">
          <button
            type="button"
            onClick={() =>
              draft.set({
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set from the bound signal ✨' }] }],
              })
            }
          >
            draft.set(…)
          </button>
        </div>
        <pre style="background: #1e1e1e; color: #9cdcfe; padding: 12px; border-radius: 8px; font-size: 12px; max-height: 160px; overflow: auto">
          {() => JSON.stringify(draft(), null, 2)}
        </pre>
      </div>

      {/* Reactive state + HTML output */}
      <div class="section">
        <h3>Reactive State</h3>
        <pre style="background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; font-size: 13px">
          {() => stateView()}
        </pre>
      </div>

      <div class="section">
        <h3>Rendered HTML (editor.html)</h3>
        <pre style="background: #1e1e1e; color: #ce9178; padding: 12px; border-radius: 8px; font-size: 12px; max-height: 160px; overflow: auto; white-space: pre-wrap">
          {() => editor.html()}
        </pre>
      </div>

      {/* Action log */}
      <div class="section">
        <h3>Action Log</h3>
        <div class="log">
          {() => (log().length === 0 ? 'Use the toolbar above to interact with the editor.' : log().join('\n'))}
        </div>
      </div>
    </div>
  )
}
