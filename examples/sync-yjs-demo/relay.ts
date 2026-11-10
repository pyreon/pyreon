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

// The demo page (Vite dev server) and this relay are DIFFERENT origins (other
// port), so the relay's cross-site WebSocket guard closes the page's upgrade
// with 4403 unless its origin is allowed. This demo allows loopback pages on
// any port plus any origins listed in SYNC_ALLOWED_ORIGINS (comma-separated).
// A production relay lists its app's exact origin(s).
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

await createSyncServer({ server: http, allowedOrigins })

http.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[sync-relay] listening — ws://127.0.0.1:${port}/<room>`)
})
