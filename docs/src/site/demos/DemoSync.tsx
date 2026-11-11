import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { connectYDocs, createYjsDoc, syncedList, type YjsCrdtDoc } from '@pyreon/sync/yjs'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, PaperButton, PaperField, PaperHint, PaperLabel } from '../kit/demo'
import { PaperActions, PaperList, PaperMono, PaperRow, PaperTag } from '../kit/demo-parts'

/**
 * Sync demo (`sync.json` → demo): two in-page devices, each with its own
 * real Yjs document and a real `syncedList`, linked with `connectYDocs` (the
 * in-memory stand-in for the WebSocket relay). Taking either device offline
 * drops the link; edits keep landing in each device's own document.
 * Reconnecting re-runs the state exchange, so both sides' offline edits
 * merge with none lost. Only the wire is in-page: no WebSocket, no server.
 * (`connectYDocs` never re-forwards a received update, #4381, so the two docs are
 * linked directly rather than through a third "relay" doc.)
 */
interface Item {
  id: string
  text: string
  by: string
}

interface Peer {
  name: string
  doc: YjsCrdtDoc
  online: ReturnType<typeof signal<boolean>>
  /** Items added since this device went offline. */
  waiting: ReturnType<typeof signal<number>>
  count: number
}

export default function DemoSync() {
  const make = (name: string): Peer => ({ name, doc: createYjsDoc(), online: signal(true), waiting: signal(0), count: 0 })
  const peers = [make('Laptop'), make('Phone')] as const
  let link: { disconnect: () => void } | null = connectYDocs(peers[0].doc, peers[1].doc)

  const toggle = (p: Peer) => {
    p.online.set(!p.online.peek())
    const up = peers.every((x) => x.online.peek())
    if (up && !link) {
      link = connectYDocs(peers[0].doc, peers[1].doc)
      for (const x of peers) x.waiting.set(0)
    } else if (!up && link) {
      link.disconnect()
      link = null
    }
  }

  // Seeded one after the other while connected, so the server render and the
  // client agree on the order.
  const seed: [Peer, string][] = [
    [peers[0], 'Draft the launch post'],
    [peers[1], 'Record the demo'],
  ]

  return (
    <DemoGrid>
      <For each={peers} by={(p) => p.name}>
        {(p) => {
          const list = syncedList<Item>(p.doc, 'items')
          const add = (text: string) => {
            p.count++
            list.push({ id: `${p.name}-${p.count}`, text, by: p.name })
            if (!link) p.waiting.update((n) => n + 1)
          }
          for (const [owner, text] of seed) if (owner === p) add(text)
          const draft = signal('')
          const inputId = `sync-new-${p.name.toLowerCase()}`
          const submit = (ev: Event) => {
            ev.preventDefault()
            const t = draft.peek().trim()
            if (!t) return
            add(t)
            draft.set('')
          }
          return (
            <DemoSurface aria-label={`${p.name} device`}>
              <PaperRow>
                <strong>{p.name}</strong>
                {() => <PaperTag state={p.online() ? 'ok' : 'warn'}>{p.online() ? 'online' : 'offline'}</PaperTag>}
              </PaperRow>
              <form onSubmit={submit}>
                <PaperLabel for={inputId}>New item</PaperLabel>
                <PaperActions>
                  <PaperField>
                    <input id={inputId} value={() => draft()} onInput={(e: Event) => draft.set((e.target as HTMLInputElement).value)} placeholder="Add an item" autoComplete="off" />
                  </PaperField>
                  <PaperButton type="submit">Add</PaperButton>
                </PaperActions>
              </form>
              <PaperList aria-label={`${p.name} list`}>
                <For each={() => list()} by={(i) => i.id}>
                  {(i) => (
                    <li>
                      <PaperRow>
                        <span>{i.text}</span>
                        <PaperMono>{i.by}</PaperMono>
                      </PaperRow>
                    </li>
                  )}
                </For>
              </PaperList>
              <PaperHint aria-live="polite">
                {() =>
                  p.waiting() > 0
                    ? `${p.waiting()} change(s) kept on this device until both are online.`
                    : p.online()
                      ? peers.every((x) => x.online())
                        ? 'In sync.'
                        : 'The other device is offline.'
                      : 'Offline: edits stay here.'}
              </PaperHint>
              <PaperButton type="button" onClick={() => toggle(p)}>
                {() => (p.online() ? 'Go offline' : 'Reconnect')}
              </PaperButton>
            </DemoSurface>
          )
        }}
      </For>
    </DemoGrid>
  )
}
