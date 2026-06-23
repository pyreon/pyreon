import { For, type VNodeChild } from '@pyreon/core'
import { signal, type Signal } from '@pyreon/reactivity'
import { createYjsDoc, syncedList } from '@pyreon/sync/yjs'

/**
 * Live `@pyreon/sync` example for the Sync docs page — a `syncedList` (Y.Array
 * CRDT) rendered as a signal-native list.
 *
 * The point: a synced value IS a signal. `items()` reads reactively and
 * `items.push(...)` / `items.delete(...)` are CRDT ops, so the `<For>` below
 * is fine-grained — adding one item patches one `<li>`, never a re-render.
 *
 * It's a LOCAL CRDT here (no transport), which is honest: the value of sync is
 * collaboration, and the SAME rendering code becomes cross-device with a
 * WebSocket transport, offline-durable with IndexedDB persistence, or cross-tab
 * with a BroadcastChannel — the JSX never changes because the list is a signal.
 * See "Transports & persistence" below.
 *
 * The `shared` prop is part of the `<Example>` contract; this example has no
 * cross-mount signal to bridge, so it's accepted and ignored.
 */
export default function SyncedListCrdt(_props: {
  shared?: Signal<unknown>
}): VNodeChild {
  const doc = createYjsDoc()
  const items = syncedList<{ id: number; text: string }>(doc, 'docs-sync-items')
  const draft = signal('')
  let nextId = 0

  const add = () => {
    const text = draft().trim()
    if (text === '') return
    items.push({ id: nextId++, text })
    draft.set('')
  }

  return (
    <div class="example-col" data-testid="synced-list">
      <div style="display: flex; gap: 8px;">
        <input
          data-testid="sl-input"
          value={() => draft()}
          placeholder="Add an item…"
          onInput={(e) => draft.set((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if ((e as KeyboardEvent).key === 'Enter') add()
          }}
        />
        <button type="button" data-testid="sl-add" onClick={add}>
          Add
        </button>
        <button
          type="button"
          data-testid="sl-clear"
          onClick={() => items.delete(0, items().length)}
        >
          Clear
        </button>
      </div>
      <ul data-testid="sl-items" style="margin: 10px 0 0; padding-left: 18px;">
        <For each={() => items()} by={(it) => it.id}>
          {(it) => (
            <li class="sl-item">
              {it.text}{' '}
              <button
                type="button"
                class="sl-remove"
                title="Remove"
                onClick={() => {
                  const idx = items().findIndex((x) => x.id === it.id)
                  if (idx >= 0) items.delete(idx, 1)
                }}
              >
                ✕
              </button>
            </li>
          )}
        </For>
      </ul>
      <p class="example-muted">
        A local CRDT list — add a transport (WebSocket / BroadcastChannel) or
        IndexedDB persistence and this exact code is collaborative + durable.
      </p>
    </div>
  )
}
