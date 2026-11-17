// sync-relay.ts — a local relay for `connectPyreonSync` (OFF-1), started by
// stream-server.ts on port 8792 (`PYREON_SYNC_PORT`). The iOS Simulator shares
// the host's localhost; Android reaches it through `adb reverse tcp:8792`.
//
// The relay is itself a PEER: it holds a web `PyreonCrdtDoc` ('relay'),
// merges every client's ops into it and forwards them to the other clients,
// and sends its full state to a client that connects — the wire protocol of
// `connectPyreonSync` (`{ ops: PyreonCrdtOp[] }`, JSON). The HTTP side lets a
// device test act as the remote writer and read what the device sent:
//
//   GET /sync/reset              a fresh relay doc, every client dropped
//   GET /sync/clients            how many clients are connected
//   GET /sync/set?key=&value=    write a key in the relay doc; the op goes to every client
//   GET /sync/get?key=           the relay doc's value for the key ('' when unset)
//
// Keys live in the `pyreon` map, the one `syncedSignal` uses by default.
import type { ServerWebSocket } from 'bun'
import { PyreonCrdtDoc, type PyreonCrdtOp } from '../../../packages/fundamentals/sync/src/crdt/pyreon-adapter'
import { REMOTE_ORIGIN } from '../../../packages/fundamentals/sync/src/crdt/types'

const port = Number(process.env.PYREON_SYNC_PORT ?? 8792)
const MAP = 'pyreon'

let doc = new PyreonCrdtDoc('relay')
let offOps = doc._onOps((ops) => broadcast(JSON.stringify({ ops })))
const clients = new Set<ServerWebSocket<unknown>>()

function broadcast(data: string, except?: ServerWebSocket<unknown>): void {
  for (const ws of clients) if (ws !== except) ws.send(data)
}

function reset(): void {
  offOps()
  doc.destroy()
  for (const ws of clients) ws.close()
  clients.clear()
  doc = new PyreonCrdtDoc('relay')
  offOps = doc._onOps((ops) => broadcast(JSON.stringify({ ops })))
}

Bun.serve({
  port,
  hostname: '127.0.0.1',
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === '/sync') {
      return server.upgrade(req) ? undefined : new Response('expected a WebSocket upgrade', { status: 400 })
    }
    if (url.pathname === '/sync/reset') {
      reset()
      return new Response('reset')
    }
    if (url.pathname === '/sync/clients') return new Response(String(clients.size))
    if (url.pathname === '/sync/set') {
      doc.getMap(MAP).set(url.searchParams.get('key') ?? '', url.searchParams.get('value') ?? '')
      return new Response('ok')
    }
    if (url.pathname === '/sync/get') {
      const v = doc.getMap(MAP).get(url.searchParams.get('key') ?? '')
      return new Response(v === undefined || v === null ? '' : String(v))
    }
    return new Response('not found', { status: 404 })
  },
  websocket: {
    open(ws) {
      clients.add(ws)
      ws.send(JSON.stringify({ ops: doc.encodeState() }))
    },
    message(ws, message) {
      let parsed: { ops?: PyreonCrdtOp[] }
      try {
        parsed = JSON.parse(String(message))
      } catch {
        return
      }
      if (!Array.isArray(parsed.ops) || parsed.ops.length === 0) return
      // Merged as REMOTE, which emits no ops of its own — so it is forwarded
      // here explicitly, to every client but the sender.
      doc.applyOps(parsed.ops, REMOTE_ORIGIN)
      broadcast(JSON.stringify({ ops: parsed.ops }), ws)
    },
    close(ws) {
      clients.delete(ws)
    },
  },
})

console.log(`[sync-relay] listening on ws://127.0.0.1:${port}/sync`)
