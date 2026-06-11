import { For } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { displayName, userColor } from '../state/identity'
import type { BoardDoc } from '../sync/board-doc'

/**
 * Live "who's here" bar — real Yjs **awareness** (ephemeral presence), via
 * `board.presence` (`syncedAwareness`). Each client publishes its name + color;
 * a peer that disconnects is removed instantly (no heartbeat, no last-seen
 * filtering, no ghost entries — the awareness protocol handles that). We publish
 * `name`/`color` here as fields so the live cursor (`Cursors.tsx`) can patch the
 * `cursor` field independently without clobbering them.
 */
export function PresenceBar(props: { board: BoardDoc }) {
  const presence = props.board.presence

  // Publish + keep our identity fields in sync (reactive — updates when the user
  // renames / recolors). setLocalField patches one field, so it never wipes the
  // cursor field the Cursors overlay maintains. ONE effect per field so a rename
  // doesn't also re-broadcast the (unchanged) color, and vice-versa.
  effect(() => presence.setLocalField('name', displayName() || 'Anonymous'))
  effect(() => presence.setLocalField('color', userColor()))

  return (
    <span class="presence" data-testid="presence">
      <For each={() => presence.states()} by={(p) => p.clientId}>
        {(peer) => (
          <span
            class="avatar"
            title={peer.isLocal ? `${peer.state.name} (you)` : peer.state.name}
            style={`background:${peer.state.color}`}
          >
            {(peer.state.name?.[0] ?? '?').toUpperCase()}
          </span>
        )}
      </For>
    </span>
  )
}
