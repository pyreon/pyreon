import { bindEditorToSignal, CodeEditor, createEditor } from '@pyreon/code'
import { For, onUnmount } from '@pyreon/core'
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
