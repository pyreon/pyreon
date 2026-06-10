import { onUnmount } from '@pyreon/core'
import type { SyncedText } from '@pyreon/sync/yjs'
import { canEdit } from '../state/permissions'
import type { BoardDoc } from '../sync/board-doc'

/**
 * The card detail panel — a COLLABORATIVE description backed by `syncedText`
 * (Y.Text, character-level merge: two people typing keep BOTH their edits,
 * unlike a scalar last-writer-wins field). The editor is created on open and
 * disposed on close / card-switch (this component remounts when `cardId`
 * changes, so `onUnmount` tears down the previous card's Y.Text observer).
 *
 * Writes are immediate (not throttled): `syncedText.set` applies a minimal
 * prefix/suffix diff, so per-keystroke writes are cheap and keep the controlled
 * textarea in lockstep with the synced value. (Throttling would fight a
 * controlled input — `@pyreon/hooks`' throttle fits high-frequency NON-controlled
 * signals like a presence cursor, which is out of scope here.)
 */
export function CardPanel(props: { board: BoardDoc; cardId: string; onClose: () => void }) {
  const description: SyncedText = props.board.openDescription(props.cardId)
  onUnmount(() => description.dispose())

  return (
    <aside class="panel" data-testid="card-panel">
      <header style="display:flex;justify-content:space-between;align-items:center">
        <strong>Description</strong>
        <button class="btn" onClick={props.onClose} data-testid="panel-close">
          Close
        </button>
      </header>
      <p style="color:var(--muted);font-size:12px;margin:0">
        Collaborative (Y.Text) — concurrent edits from two people are both kept.
      </p>
      <textarea
        placeholder="Add a description…"
        value={() => description()}
        onInput={(e) => description.set(e.currentTarget.value)}
        readOnly={() => !canEdit()}
        data-testid="card-desc"
      />
    </aside>
  )
}
