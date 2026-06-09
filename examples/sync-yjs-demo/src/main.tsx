import { For } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { syncedSignal } from '@pyreon/sync'
import {
  connectViaBroadcastChannel,
  connectViaWebSocket,
  createYjsDoc,
  persistViaIndexedDB,
  syncedList,
  syncedText,
} from '@pyreon/sync/yjs'

// One Yjs doc per tab. Two transport modes:
//   - DEFAULT (same-origin): PERSISTED to IndexedDB (edits survive reload / work
//     offline) + SYNCED across same-origin tabs via BroadcastChannel (zero
//     network). Open in two tabs — edits cross; reload — the last edit survives.
//   - `?ws=<relay-url>`: CROSS-DEVICE sync over a WebSocket relay ONLY (no
//     BroadcastChannel, no persistence). Two SEPARATE browser contexts can't
//     share a BroadcastChannel, so convergence there proves the relay path.
const ROOM = 'pyreon-sync-yjs-demo'
const doc = createYjsDoc()

const wsUrl = new URLSearchParams(location.search).get('ws')
if (wsUrl) {
  connectViaWebSocket(doc, wsUrl)
} else {
  const persist = persistViaIndexedDB(doc, ROOM)
  // Load any persisted state BEFORE seeding, so create-if-missing adopts the
  // persisted value instead of racing a fresh 'untitled' seed against the async
  // IndexedDB load.
  await persist.whenSynced
  connectViaBroadcastChannel(doc, ROOM)
}

// A scalar field (last-writer-wins) ...
const title = syncedSignal({ doc, key: 'title', initial: 'untitled' })
// ... and a COLLABORATIVE text field (character-level CRDT merge — concurrent
// edits from both tabs are both kept, no lost characters).
const body = syncedText(doc, 'body')
// ... and a COLLABORATIVE list (positional CRDT merge — concurrent adds from
// both tabs are both kept, no lost items).
const items = syncedList<string>(doc, 'items')

const App = () => (
  <main>
    {/* Compiled `_bindText`: the synced signal binds to this text node's .data,
        so a remote edit patches exactly this node — no re-render. */}
    <h1 data-testid="title">{() => title()}</h1>
    <input
      data-testid="input"
      value={() => title()}
      onInput={(e) => title.set((e.currentTarget as HTMLInputElement).value)}
    />
    <button data-testid="set-a" onClick={() => title.set('from-tab-A')}>
      Set from A
    </button>
    <button data-testid="set-b" onClick={() => title.set('from-tab-B')}>
      Set from B
    </button>

    {/* Collaborative text — concurrent edits MERGE (no lost characters). */}
    <textarea
      data-testid="body"
      value={() => body()}
      onInput={(e) => body.set((e.currentTarget as HTMLTextAreaElement).value)}
    />
    <button data-testid="ins-a" onClick={() => body.insert(0, 'AAA')}>
      Insert AAA at start
    </button>
    <button data-testid="ins-b" onClick={() => body.insert(0, 'BBB')}>
      Insert BBB at start
    </button>

    {/* Collaborative list — concurrent adds MERGE (no lost items). */}
    <ul data-testid="items">
      <For each={() => items()} by={(it) => it}>
        {(it) => <li class="item">{it}</li>}
      </For>
    </ul>
    <button data-testid="add-a" onClick={() => items.push('item-A')}>
      Add item-A
    </button>
    <button data-testid="add-b" onClick={() => items.push('item-B')}>
      Add item-B
    </button>
  </main>
)

mount(<App />, document.getElementById('app')!)
