#!/usr/bin/env bun
// stream-server — the loopback peer for the useStream device proof
// (TasksApp's /streams screen). Two endpoints:
//
//   GET /sse     Server-Sent Events. A connection WITHOUT `Last-Event-ID`
//                sets `retry: 300`, sends ids 1 and 2, then HALF of event 3,
//                and DESTROYS the socket — a network failure mid-event, not a
//                clean end (a clean end would close the stream instead of
//                reconnecting, on every target). A connection WITH
//                `Last-Event-ID` gets ids 3 and 4 and ends cleanly. Every
//                payload echoes the id the server received as `resumed`, so a
//                reconnect that forgot to resume is visible in the UI.
//   GET /ndjson  Three rows, then a clean end.
//   GET /health  200 — the CI readiness poll.
//
// Stateless by design: the response depends only on the request's headers, so
// XCUITest's `-test-iterations 3` and relaunches replay the same script.
//
// Reachability: the iOS Simulator shares the host loopback; the Android job
// runs `adb reverse tcp:8791 tcp:8791`, so the ONE literal
// `http://127.0.0.1:8791` in the shared source works on both.
//
// node:http rather than Bun.serve: destroying the socket mid-body (no
// terminating chunk) is the whole point of /sse, and `res.socket.destroy()` is
// the direct way to do it.
import { createServer } from 'node:http'

const port = Number(process.env.PYREON_STREAM_PORT ?? 8791)

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (path === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  if (path === '/ndjson') {
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' })
    res.end('{"n":1,"resumed":""}\n{"n":2,"resumed":""}\n{"n":3,"resumed":""}\n')
    return
  }
  if (path === '/sse') {
    const header = req.headers['last-event-id']
    const resumed = typeof header === 'string' ? header : ''
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const ev = (id: number): string => `id: ${id}\ndata: {"n":${id},"resumed":"${resumed}"}\n\n`
    if (resumed === '') {
      res.write(`retry: 300\n\n${ev(1)}${ev(2)}`)
      res.write('id: 3\ndata: {"n":')
      setTimeout(() => res.socket?.destroy(), 100)
    } else {
      res.end(`${ev(3)}${ev(4)}`)
    }
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[stream-server] listening on http://127.0.0.1:${port}`)
})
