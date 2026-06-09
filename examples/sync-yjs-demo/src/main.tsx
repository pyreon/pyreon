import { mount } from '@pyreon/runtime-dom'
import { syncedSignal } from '@pyreon/sync'
import { connectViaBroadcastChannel, createYjsDoc } from '@pyreon/sync/yjs'

// One Yjs doc per tab, synced across same-origin tabs via BroadcastChannel —
// zero network, fully local-first. Open this page in two tabs and edits in one
// appear in the other.
const doc = createYjsDoc()
connectViaBroadcastChannel(doc, 'pyreon-sync-yjs-demo')

const title = syncedSignal({ doc, key: 'title', initial: 'untitled' })

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
  </main>
)

mount(<App />, document.getElementById('app')!)
