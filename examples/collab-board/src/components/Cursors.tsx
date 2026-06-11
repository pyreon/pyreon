import { For } from '@pyreon/core'
import { useEventListener, useThrottledCallback } from '@pyreon/hooks'
import type { BoardDoc } from '../sync/board-doc'

/**
 * Live collaborator cursors over Yjs awareness (`board.presence`). On every
 * mousemove we publish our pointer into our own awareness `cursor` field
 * (throttled — a high-frequency, NON-controlled signal, which is exactly where
 * `useThrottledCallback` earns its place); `setLocalField` patches only `cursor`,
 * leaving the `name`/`color` PresenceBar publishes untouched. We render every
 * OTHER peer's cursor (`presence.others()`), each keyed by `clientId` so it
 * mounts once and its position patches in place as the peer moves.
 *
 * Cursor coordinates are raw viewport points (no scroll / window-size
 * normalization) — fine for this showcase; a production app maps to content
 * coordinates for pixel parity across differently-sized windows.
 */
export function Cursors(props: { board: BoardDoc }) {
  const presence = props.board.presence

  const publish = useThrottledCallback((e: MouseEvent) => {
    presence.setLocalField('cursor', { x: e.clientX, y: e.clientY })
  }, 50)
  useEventListener('mousemove', publish)

  return (
    <div class="cursor-layer" aria-hidden="true">
      <For each={() => presence.others().filter((p) => p.state.cursor)} by={(p) => p.clientId}>
        {(peer) => (
          <div
            class="remote-cursor"
            data-testid="remote-cursor"
            style={() =>
              `transform:translate(${peer.state.cursor?.x ?? 0}px,${peer.state.cursor?.y ?? 0}px)`
            }
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill={peer.state.color}>
              <path d="M3 3 L3 16 L7 12 L9.5 17.5 L11.5 16.5 L9 11 L14 11 Z" />
            </svg>
            <span class="remote-cursor-label" style={`background:${peer.state.color}`}>
              {peer.state.name}
            </span>
          </div>
        )}
      </For>
    </div>
  )
}
