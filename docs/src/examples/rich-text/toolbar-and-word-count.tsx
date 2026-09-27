import { h } from '@pyreon/core'
import { createRichTextEditor, RichText } from '@pyreon/rich-text'

// createRichTextEditor() builds a framework-independent instance — TipTap
// itself lazy-loads the moment <RichText> first mounts it below.
const editor = createRichTextEditor({
  content: '<p>Try <strong>bold</strong>, <em>italic</em>, and a bullet list.</p>',
  ariaLabel: 'Example rich text document',
})

const toolbarButton = (label: string, active: () => boolean, onClick: () => void) =>
  h('button', {
    type: 'button',
    onClick,
    style: () => ({ fontWeight: active() ? '700' : '400', background: active() ? 'var(--accent)' : undefined }),
  }, label)

/**
 * The live counterpart to the "Building a toolbar" snippet above — a
 * REAL TipTap instance behind a signal-backed API. `editor.isActive()`
 * is reactive, so the toolbar buttons highlight as you move the cursor;
 * `editor.wordCount`/`characterCount` are derived from the document JSON.
 */
export default function ToolbarAndWordCount() {
  return h('div', { class: 'col' },
    h('div', { class: 'row', style: { gap: '6px', marginBottom: '6px' } },
      toolbarButton('Bold', () => editor.isActive('bold'), () => editor.chain()?.toggleBold().run()),
      toolbarButton('Italic', () => editor.isActive('italic'), () => editor.chain()?.toggleItalic().run()),
      toolbarButton('• List', () => editor.isActive('bulletList'), () => editor.chain()?.toggleBulletList().run()),
      h('button', { type: 'button', onClick: () => editor.undo(), disabled: () => !editor.canUndo() }, '↶'),
      h('button', { type: 'button', onClick: () => editor.redo(), disabled: () => !editor.canRedo() }, '↷'),
    ),
    h(RichText, { instance: editor, class: 'card', style: 'min-height: 8rem;' }),
    h('div', { class: 'muted', style: { marginTop: '6px', fontSize: '12px' } },
      () => `${editor.wordCount()} words · ${editor.characterCount()} characters`,
    ),
  )
}
