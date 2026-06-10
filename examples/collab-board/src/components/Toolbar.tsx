import { displayName, theme, toggleTheme } from '../state/identity'
import { canEdit, setRole } from '../state/permissions'
import type { BoardDoc, ConnectionState } from '../sync/board-doc'
import { PresenceBar } from './PresenceBar'

const CONN_LABEL: Record<ConnectionState, string> = {
  local: 'Local only',
  connecting: 'Connecting…',
  online: 'Online',
  offline: 'Offline',
}

export function Toolbar(props: { board: BoardDoc }) {
  const board = props.board
  return (
    <div class="toolbar">
      {/* Board title — a synced scalar field (@pyreon/sync syncedStore). */}
      <input
        class="title-input"
        placeholder="Untitled board"
        value={() => board.title()}
        onInput={(e) => board.setTitle(e.currentTarget.value)}
        readOnly={() => !canEdit()}
        data-testid="board-title"
      />
      <span class="spacer" />
      {/* Live collaborators (@pyreon/sync presence list + heartbeat). */}
      <PresenceBar board={board} />
      {/* Device-local identity (@pyreon/storage) — per-device, not synced. */}
      <input
        class="name-input"
        placeholder="Your name"
        value={() => displayName()}
        onInput={(e) => displayName.set(e.currentTarget.value)}
        data-testid="display-name"
      />
      {/* Viewer/Editor UI gate (@pyreon/permissions). */}
      <button
        class="btn"
        onClick={() => setRole(canEdit() ? 'viewer' : 'editor')}
        data-testid="role-toggle"
      >
        {() => (canEdit() ? 'Editing' : 'Viewing')}
      </button>
      {/* Theme toggle (@pyreon/storage-backed). */}
      <button class="btn" onClick={toggleTheme} data-testid="theme-toggle">
        {() => (theme() === 'dark' ? 'Light' : 'Dark')}
      </button>
      {/* Connection status (driven by the @pyreon/sync transport callbacks). */}
      <span class={() => `conn ${board.connection()}`} data-testid="conn">
        <span class="dot" />
        {() => CONN_LABEL[board.connection()]}
      </span>
    </div>
  )
}
