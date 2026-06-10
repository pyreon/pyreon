import { For, onUnmount } from '@pyreon/core'
import { useInterval } from '@pyreon/hooks'
import { displayName, userColor } from '../state/identity'
import type { BoardDoc, PresenceEntry } from '../sync/board-doc'

// One stable id per browser TAB (a tab is one collaborator). Module-level so it
// survives PresenceBar remounts when switching boards.
const MY_CLIENT_ID = crypto.randomUUID()
const HEARTBEAT_MS = 5_000
const ONLINE_WINDOW_MS = 15_000

/**
 * Live "who's here" bar. Presence is modeled as a `syncedList` (see board-doc):
 * each client upserts its own entry on mount, heartbeats `at` every few seconds,
 * and removes it on unmount. The bar shows entries seen within the last ~15s, so
 * a crashed client fades out. (A production app would use Yjs's ephemeral
 * awareness protocol; this demonstrates presence with only the sync primitives.)
 */
export function PresenceBar(props: { board: BoardDoc }) {
  const presence = props.board.presence

  const upsert = (): void => {
    const me: PresenceEntry = {
      clientId: MY_CLIENT_ID,
      name: displayName() || 'Anonymous',
      color: userColor(),
      at: Date.now(),
    }
    const list = presence()
    const idx = list.findIndex((e) => e.clientId === MY_CLIENT_ID)
    if (idx >= 0) presence.set(list.map((e) => (e.clientId === MY_CLIENT_ID ? me : e)))
    else presence.push(me)
  }

  upsert() // announce on mount
  useInterval(upsert, HEARTBEAT_MS) // heartbeat (auto-cleared on unmount)
  onUnmount(() => {
    const idx = presence().findIndex((e) => e.clientId === MY_CLIENT_ID)
    if (idx >= 0) presence.delete(idx, 1)
  })

  const online = (): PresenceEntry[] => {
    const now = Date.now()
    return presence().filter((e) => now - e.at < ONLINE_WINDOW_MS)
  }

  return (
    <span class="presence" data-testid="presence">
      <For each={() => online()} by={(e) => e.clientId}>
        {(entry) => (
          <span
            class="avatar"
            title={entry.clientId === MY_CLIENT_ID ? `${entry.name} (you)` : entry.name}
            style={`background:${entry.color}`}
          >
            {(entry.name[0] ?? '?').toUpperCase()}
          </span>
        )}
      </For>
    </span>
  )
}
