import { bindEditorToSignal, CodeEditor, createEditor } from '@pyreon/code'
import { For, onUnmount } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import type { SyncedText } from '@pyreon/sync/yjs'
import { canEdit } from '../state/permissions'
import { type BoardDoc, CARD_LABELS, type CardLabel } from '../sync/board-doc'

/**
 * The card detail panel. It edits the card's scalar fields (title, label —
 * @pyreon/sync syncedList item patch) AND a COLLABORATIVE notes document
 * (@pyreon/code editor bound to a `syncedText` via `bindEditorToSignal` — the
 * flagship pairing: a CodeMirror editor whose buffer is a CRDT, so two people
 * edit the same notes with character-level merge).
 *
 * Lifecycle: the notes `syncedText` + the editor binding are created on open and
 * disposed on close / card-switch (this component remounts when `cardId`
 * changes, so `onUnmount` tears both down).
 */
// DEV diag: counts CardPanel setups across the page lifetime (remount detector).
let _panelMounts = 0

export function CardPanel(props: { board: BoardDoc; cardId: string; onClose: () => void }) {
  const board = props.board
  const cardId = props.cardId

  // Reactive view of the card across all columns (reads the synced lists).
  const card = () => board.findCard(cardId)?.card ?? null

  // Collaborative notes: a Y.Text bound to a CodeMirror editor. The editor's
  // buffer and the syncedText stay in lockstep (bindEditorToSignal guards the
  // editor↔signal loop; syncedText guards the CRDT echo) → a peer's keystrokes
  // appear here, merged.
  const notes: SyncedText = board.openNotes(cardId)
  const editor = createEditor({ value: notes(), language: 'markdown' })
  const binding = bindEditorToSignal({
    editor,
    signal: notes,
    serialize: (text: string) => text,
    parse: (text) => text,
  })
  // DEV-only test hook: expose the active card's notes signal (CRDT reader) +
  // the editor instance, so the e2e can drive the editor programmatically and
  // assert the CRDT value on each peer. Stripped from production builds.
  // (Simulated OS keystrokes don't reliably reach a cold-mounted CodeMirror's
  // doc state on a fresh CI runner — the editor's `insert()` dispatches a real
  // CM transaction, which always fires the updateListener → syncedText write.)
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const w = window as unknown as {
      __cardNotes?: () => string
      __cardEditor?: { insert: (text: string) => void }
      __cardDiag?: () => unknown
    }
    w.__cardNotes = () => notes()
    w.__cardEditor = editor
    // Chain-splitting diagnostics for the CI-only notes break. Each field is
    // one link of: CM doc → editor.value → binding effect → notes signal.
    // `probeRuns` is an effects-alive canary on the SAME component scope as
    // the binding — if a parent boundary disposed this scope while leaving
    // the DOM in place (the dead-effects bug class), it freezes at 1.
    // `mounts` counts CardPanel setups — >1 means a remount/double-mount
    // split the window hooks across instances.
    _panelMounts++
    let probeRuns = 0
    effect(() => {
      editor.value()
      probeRuns++
    })
    w.__cardDiag = () => ({
      cardId,
      mounts: _panelMounts,
      viewNull: editor.view.peek() == null,
      cmDoc: editor.view.peek()?.state.doc.toString() ?? '<no-view>',
      editorValue: editor.value.peek(),
      notesSignal: notes.peek(),
      probeRuns,
    })
  }
  onUnmount(() => {
    binding.dispose()
    notes.dispose()
  })

  function setLabel(label: CardLabel): void {
    board.updateCard(cardId, { label })
  }

  return (
    <aside class="panel" data-testid="card-panel">
      <header style="display:flex;justify-content:space-between;align-items:center">
        <strong>Card</strong>
        <button class="btn" onClick={props.onClose} data-testid="panel-close">
          Close
        </button>
      </header>

      {/* Title — a synced scalar (commit on blur to avoid per-keystroke list churn). */}
      <input
        class="name-input"
        style="width:100%"
        placeholder="Card title"
        value={() => card()?.title ?? ''}
        onChange={(e) => board.updateCard(cardId, { title: e.currentTarget.value })}
        readOnly={() => !canEdit()}
        data-testid="card-title-input"
      />

      {/* Label picker — synced scalar. */}
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:12px;color:var(--muted)">Label</span>
        <For each={[...CARD_LABELS]} by={(l) => l}>
          {(label) => (
            <button
              class="label-swatch"
              data-label={label}
              data-selected={() => (card()?.label === label ? 'true' : 'false')}
              title={label}
              disabled={() => !canEdit()}
              onClick={() => setLabel(label)}
            />
          )}
        </For>
      </div>

      {/* Collaborative notes — @pyreon/code editor over a Y.Text. */}
      <p style="color:var(--muted);font-size:12px;margin:4px 0 0">
        Notes — collaborative (CodeMirror over a CRDT). Two people keep both their edits.
      </p>
      <div class="notes-editor" data-testid="card-notes">
        <CodeEditor instance={editor} />
      </div>

      <button
        class="btn"
        style="border-color:var(--off);color:var(--off)"
        disabled={() => !canEdit()}
        onClick={() => {
          board.deleteCard(cardId)
          props.onClose()
        }}
        data-testid="card-delete"
      >
        Delete card
      </button>
    </aside>
  )
}
