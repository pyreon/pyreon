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

// The app page (Vite dev server, :5189) and this relay (:5190) are DIFFERENT
// origins, so the relay's cross-site WebSocket guard closes the page's upgrade
// with 4403 unless its origin is allowed. This demo allows loopback pages on
// any port (dev server, preview, a second browser on this machine) plus any
// origins listed in SYNC_ALLOWED_ORIGINS (comma-separated, e.g. a LAN address
// for a second device). A production relay lists its app's exact origin(s).
const extraOrigins = new Set(
  (process.env.SYNC_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
)
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const allowedOrigins = (origin: string): boolean => {
  if (extraOrigins.has(origin)) return true
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK.has(url.hostname)
  } catch {
    return false
  }
}

await createSyncServer({
  server: http,
  allowedOrigins,
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
