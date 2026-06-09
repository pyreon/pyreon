// Tiny WebSocket relay for the cross-context e2e (and a runnable local demo of
// `@pyreon/sync/server`). It attaches the relay to a plain Node http server that
// also answers a health endpoint — so Playwright's HTTP readiness probe on the
// port succeeds while the same port brokers WebSocket sync.
//
//   bun examples/sync-yjs-demo/relay.ts        # ws://127.0.0.1:5186
//   SYNC_RELAY_PORT=9000 bun …/relay.ts        # custom port
//
// Open the demo in two SEPARATE browsers/profiles pointed at
// `?ws=ws://127.0.0.1:5186/<room>` and edits cross the network (no shared
// origin, so BroadcastChannel can't bridge them — only this relay can).
import { createServer } from 'node:http'
import { createSyncServer } from '@pyreon/sync/server'

const port = Number(process.env.SYNC_RELAY_PORT ?? 5186)

const http = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('sync-relay ok')
})

await createSyncServer({ server: http })

http.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[sync-relay] listening — ws://127.0.0.1:${port}/<room>`)
})
