// The sync relay for the collab-board example — a thin wrapper over
// `@pyreon/sync/server`'s `createSyncServer`. It brokers Yjs sync between
// clients in the same room across DIFFERENT origins/devices (BroadcastChannel
// only bridges tabs of the SAME origin; only a relay crosses the network).
//
//   bun examples/collab-board/relay.ts            # ws://127.0.0.1:5190/<room>
//   SYNC_RELAY_PORT=9000 bun …/relay.ts           # custom port
//
// It attaches to a plain Node http server that also answers a health endpoint,
// so Playwright's HTTP readiness probe on the port succeeds while the same port
// brokers WebSocket sync.
import { createServer } from 'node:http'
import { createSyncServer } from '@pyreon/sync/server'

const port = Number(process.env.SYNC_RELAY_PORT ?? 5190)

const http = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('collab-board relay ok')
})

await createSyncServer({
  server: http,
  // The per-room/per-doc authorization gate — THE real access control (the
  // client-side viewer/editor toggle is only a UX gate). A production relay
  // verifies a per-user token here (e.g. a signed JWT in `ctx.token`) and
  // returns false to reject with close code 4401 before any data flows. This
  // demo allows every room so it runs with zero auth setup.
  authorize: ({ room }) => room.length > 0,
})

http.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[collab-board relay] listening — ws://127.0.0.1:${port}/<room>`)
})
