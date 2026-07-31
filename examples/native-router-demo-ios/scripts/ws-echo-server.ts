#!/usr/bin/env bun
// ws-echo-server — the loopback WebSocket peer for the useWebSocket device
// proof. Echoes every text frame back as `echo:<frame>`, so the device test
// can assert a full round trip (send → server → receive → re-render)
// through the REAL network stack.
//
// Reachability per platform:
//   - iOS Simulator shares the host loopback — ws://localhost:8787 just works.
//   - Android emulator needs `adb reverse tcp:8787 tcp:8787` (maps the
//     DEVICE's localhost:8787 back to the host), so the SAME shared-source
//     literal URL works on both platforms.
//
// Zero dependencies (Bun.serve websocket). Started by the device-test
// harness (locally by hand or scripts; in CI by the native-device workflow
// step) — NOT a long-lived service.
const port = Number(process.env.PYREON_WS_PORT ?? 8787)

Bun.serve({
  port,
  fetch(req, server) {
    if (server.upgrade(req)) return undefined
    return new Response('websocket echo server — connect with a ws client', {
      status: 426,
    })
  },
  websocket: {
    message(ws, message) {
      ws.send(`echo:${message}`)
    },
  },
})

console.log(`[ws-echo] listening on ws://localhost:${port}`)
