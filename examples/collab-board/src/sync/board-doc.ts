// ─────────────────────────────────────────────────────────────────────────────
// The sync layer — the ONE place @pyreon/sync is wired. Everything else in the
// app treats a board's data as ordinary signals.
//
// A board is one CRDT document (one room). Its data:
//   • title       → syncedStore({ title }, { doc })   (a scalar field)
//   • each column → syncedList<Card>(doc, 'col:<id>')  (positional-merge list)
//   • a card's    → syncedText(doc, 'desc:<cardId>')   (character-merge text,
//     description     created on demand — see CardPanel)
//
// Transports + persistence are wired per board and torn down on `dispose()`
// (the board route owns the lifecycle — see routes/board.tsx). This is NOT a
// module-level cache: caching docs across navigation would leak the WebSocket /
// BroadcastChannel / IndexedDB connections.
// ─────────────────────────────────────────────────────────────────────────────
import { signal, type Signal } from '@pyreon/reactivity'
import { type SyncedStore, syncedStore } from '@pyreon/sync'
import {
  connectViaBroadcastChannel,
  connectViaWebSocket,
  createYjsDoc,
  persistViaIndexedDB,
  type SyncedList,
  type SyncedText,
  syncedList,
  syncedText,
} from '@pyreon/sync/yjs'

export type ColumnId = 'todo' | 'doing' | 'done'
export const COLUMN_IDS: readonly ColumnId[] = ['todo', 'doing', 'done']
export const COLUMN_LABELS: Record<ColumnId, string> = {
  todo: 'To Do',
  doing: 'Doing',
  done: 'Done',
}

export interface Card {
  id: string
  title: string
}

/**
 * Connection state, surfaced for the toolbar + toast.
 * - `local`      — no relay configured; cross-TAB sync only (BroadcastChannel).
 * - `connecting` — a relay is configured and we're opening the socket.
 * - `online`     — the relay socket is open (cross-DEVICE sync live).
 * - `offline`    — the relay socket dropped (offline edits replay on reconnect).
 */
export type ConnectionState = 'local' | 'connecting' | 'online' | 'offline'

export interface BoardDoc {
  readonly roomId: string
  readonly columns: Record<ColumnId, SyncedList<Card>>
  /** The board title — reactive read; valid once `ready()` is true. */
  title(): string
  setTitle(value: string): void
  /** Create a collaborative description editor for a card. Caller disposes it. */
  openDescription(cardId: string): SyncedText
  readonly connection: Signal<ConnectionState>
  /** Flips true once persisted IndexedDB state has loaded (see below). */
  readonly ready: Signal<boolean>
  dispose(): void
}

/** Collision-resistant card id (NOT Date.now()+Math.random()). */
export function newCardId(): string {
  return crypto.randomUUID()
}

/**
 * Build the sync layer for one board (room). `relayUrl` enables cross-device
 * sync; when null, only same-origin cross-tab sync (BroadcastChannel) is active.
 */
export function createBoardDoc(roomId: string, relayUrl: string | null): BoardDoc {
  const doc = createYjsDoc()
  const persist = persistViaIndexedDB(doc, `collab-board:${roomId}`)

  // Columns seed nothing → safe to create before `whenSynced`; the list
  // observer populates them when IndexedDB (or a peer) loads.
  const columns: Record<ColumnId, SyncedList<Card>> = {
    todo: syncedList<Card>(doc, 'col:todo'),
    doing: syncedList<Card>(doc, 'col:doing'),
    done: syncedList<Card>(doc, 'col:done'),
  }

  // The title DOES seed an initial value, so it must wait for persisted state
  // to load first — otherwise the create-if-missing seed could race the async
  // IndexedDB load and clobber a previously-saved title. This is the documented
  // `whenSynced` contract, and the reason the board shows a brief loading gate.
  const ready = signal(false)
  let titleStore: SyncedStore<{ title: string }> | null = null
  void persist.whenSynced.then(() => {
    titleStore = syncedStore({ title: '' }, { doc })
    ready.set(true)
  })

  const connection = signal<ConnectionState>(relayUrl ? 'connecting' : 'local')
  const bc = connectViaBroadcastChannel(doc, roomId)
  const ws = relayUrl
    ? connectViaWebSocket(doc, `${relayUrl}/${roomId}`, {
        onConnect: () => connection.set('online'),
        onDisconnect: () => connection.set('offline'),
      })
    : null

  let disposed = false

  return {
    roomId,
    columns,
    title: () => titleStore?.title() ?? '',
    setTitle: (value) => titleStore?.title.set(value),
    openDescription: (cardId) => syncedText(doc, `desc:${cardId}`),
    connection,
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      ws?.disconnect()
      bc.disconnect()
      for (const col of Object.values(columns)) col.dispose()
      titleStore?.dispose()
      void persist.destroy()
    },
  }
}
