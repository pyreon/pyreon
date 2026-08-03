#!/usr/bin/env bun
// ws-echo-server — the loopback WebSocket peer for the useWebSocket device
// proof. Echoes every text frame back as `echo:<frame>`, so the device test
// can assert a full round trip (send → server → receive → re-render)
// through the REAL network stack.
//
// Reachability per platform:
//   - iOS Simulator shares the host loopback — ws://localhost:8790 just works.
//   - Android emulator needs `adb reverse tcp:8790 tcp:8790` (maps the
//     DEVICE's localhost:8790 back to the host), so the SAME shared-source
//     literal URL works on both platforms.
//
// Zero dependencies (Bun.serve websocket). Started by the device-test
// harness (locally by hand or scripts; in CI by the native-device workflow
// step) — NOT a long-lived service.
// 8790, NOT 8787: the native-device workflow's tasks fixture server already
// owns 8787 on the same runner — a collision found by reading the adjacent
// workflow step before shipping.
const port = Number(process.env.PYREON_WS_PORT ?? 8790)

// Media-row fixture: a solid-red 48x48 PNG served over plain HTTP on the
// SAME port (the ws upgrade branch ignores ordinary GETs). The remote-image
// device tests point <Image src="http://localhost:8790/dot.png"> here and
// assert the RENDERED pixel is red — bytes fetched through the real network
// stack, decoded, and drawn; a placeholder, a failed fetch, or a dropped
// AsyncImage emit all read as not-red. Solid red so any sample point is
// discriminating; embedded so the server stays dependency-free.
const RED_DOT_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAQUlEQVR4nO3OQQ0AMBAEofNvupWx8yBBAPfuUvYDISEhoZj9QEhISChmPxASEhKK2Q+EhISEYvYDISEhoZj9oB763xP3eV+LAIgAAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
)

Bun.serve({
  port,
  fetch(req, server) {
    if (new URL(req.url).pathname === '/dot.png') {
      return new Response(RED_DOT_PNG, {
        headers: { 'content-type': 'image/png' },
      })
    }
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
