import { mount } from '@pyreon/runtime-dom'
import { syncedSignal } from '@pyreon/sync'
import {
  connectViaBroadcastChannel,
  createYjsDoc,
  persistViaIndexedDB,
  syncedText,
} from '@pyreon/sync/yjs'

// One Yjs doc per tab. It is:
//   - PERSISTED to IndexedDB (edits survive a reload / work offline), and
//   - SYNCED across same-origin tabs via BroadcastChannel (zero network).
// Open this page in two tabs and edits in one appear in the other; reload and
// the last edit is still there.
const ROOM = 'pyreon-sync-yjs-demo'
const doc = createYjsDoc()
const persist = persistViaIndexedDB(doc, ROOM)

// Load any persisted state BEFORE seeding, so create-if-missing adopts the
// persisted value instead of racing a fresh 'untitled' seed against the async
// IndexedDB load.
await persist.whenSynced

connectViaBroadcastChannel(doc, ROOM)

// A scalar field (last-writer-wins) ...
const title = syncedSignal({ doc, key: 'title', initial: 'untitled' })
// ... and a COLLABORATIVE text field (character-level CRDT merge — concurrent
// edits from both tabs are both kept, no lost characters).
const body = syncedText(doc, 'body')

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
  </main>
)

mount(<App />, document.getElementById('app')!)
