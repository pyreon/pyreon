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

// Video-row fixture: a 1s solid-red 48x48 H.264 mp4 (12 frames, generated
// clean-room via AVAssetWriter — no third-party bytes) served on the same
// port. The <Video> device tests point PyreonVideoPlayer here with
// autoPlay+muted+loop and assert the STATUS text flips to "playing" —
// playback state through the real AVPlayer / ExoPlayer pipeline. Loop so
// the 1s clip cannot race the poll back to "paused".
const CLIP_MP4 = Uint8Array.from(
  atob(
    'AAAAHGZ0eXBtcDQyAAAAAWlzb21tcDQxbXA0MgAAAAFtZGF0AAAAAAAAAdAAAAA6BgUyR1ZK3FxMQz+U78URPNFDqAEAAAMAAQMAAAMAAQIAAeYACwAAAwAAAwAANSAMA4kkAQ3/////gAAAAEEluCAf3gjjxv9/b8RwrinTMfCmIAKDvaxgqlGTe0ZabuCWlkE1KhzjPcwigF2Vo//9yHoACUmWbUA9bwAiaIaCCAAAABkh4RBfQDBAPUeTtnSqxbCzc2AB1lLPyt3AAAAAGyGogoS/sUcoSy7thtd3YAaHtHxMABQVWt760AAAABgBqMGP/7nuZ5GyPElCKiSCD6ACetH/dkgAAAAWAajDi/9M0Vx6QsFO86GxABGS+nmqYAAAACAh4yGiIn/WsN96c33X0jSojcb7QOECmRJ6ACaOGy2J6gAAAB4hqQaET/7PkiT3C3CVOa0PuBnuAuPX9OAAxnDhvTwAAAAWAalFj/9TDGAsKmPKLW44gAnr8fUQIAAAABYBqUeP/1MMXd6hKu50E74AIW8d2FqAAAAAGSHlLaIi/4dqVsUOU4spdjQCAA1q7wn/e0AAAAAWIamKhE87931KP0OMiXx/YAJtO69ijAAAABYBqcmP/1MMYCwqY8otbjiACevx9RAgAAADZm1vb3YAAABsbXZoZAAAAADmmKsm5pirJgAAAlgAAAJYAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAALydHJhawAAAFx0a2hkAAAAAeaYqybmmKsmAAAAAQAAAAAAAAJYAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAwAAAAMAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAACWAAAAGQAAQAAAAACam1kaWEAAAAgbWRoZAAAAADmmKsm5pirJgAAAlgAAAJYVcQAAAAAADFoZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAQ29yZSBNZWRpYSBWaWRlbwAAAAIRbWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAB0XN0YmwAAAChc3RzZAAAAAAAAAABAAAAkWF2YzEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAMAAwAEgAAABIAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY//8AAAAnYXZjQwFkAAv/4QAMJ2QAC6xWUMN4EmGUAQAEKO48sP34+AAAAAAKZmllbAEAAAAACmNocm0AAAAAABhzdHRzAAAAAAAAAAEAAAAMAAAAMgAAAHBjdHRzAAAAAAAAAAwAAAABAAAAZAAAAAEAAAD6AAAAAQAAAGQAAAABAAAAAAAAAAEAAAAyAAAAAQAAAPoAAAABAAAAZAAAAAEAAAAAAAAAAQAAADIAAAABAAAAyAAAAAEAAABkAAAAAQAAAAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABhzZHRwAAAAACAQEBgYEBAYGBAQGAAAABxzdHNjAAAAAAAAAAEAAAABAAAADAAAAAEAAABEc3RzegAAAAAAAAAAAAAADAAAAIMAAAAdAAAAHwAAABwAAAAaAAAAJAAAACIAAAAaAAAAGgAAAB0AAAAaAAAAGgAAABRzdGNvAAAAAAAAAAEAAAAs',
  ),
  (c) => c.charCodeAt(0),
)

/**
 * A Range-honouring response over a fixed byte buffer.
 *
 * AVFoundation refuses progressive HTTP playback from a server that ignores
 * Range headers — AVURLAsset probes with byte-range requests and stalls forever
 * on plain 200s. Shared by the video and audio fixtures so the second one
 * cannot be written without it, which is exactly the trap the first one fell
 * into ("Video: waiting" against a perfectly healthy 200).
 */
function rangeResponse(req: Request, bytes: Uint8Array, contentType: string): Response {
  const range = req.headers.get('range')
  const total = bytes.byteLength
  if (range !== null) {
    const m = /bytes=(\d+)-(\d*)/.exec(range)
    const start = m ? Number(m[1]) : 0
    const end = m && m[2] !== '' ? Math.min(Number(m[2]), total - 1) : total - 1
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: {
        'content-type': contentType,
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${total}`,
        'content-length': String(end - start + 1),
      },
    })
  }
  return new Response(bytes, {
    headers: {
      'content-type': contentType,
      'accept-ranges': 'bytes',
      'content-length': String(total),
    },
  })
}

Bun.serve({
  port,
  fetch(req, server) {
    if (new URL(req.url).pathname === '/dot.png') {
      return new Response(RED_DOT_PNG, {
        headers: { 'content-type': 'image/png' },
      })
    }
    // Networking-row http-VERB fixture: reflect the request back as JSON so a
    // device test can prove the METHOD and BODY survived the whole lowering —
    // shared source -> PyreonHttpRequest -> URLSession / OkHttp -> the wire.
    // Reflecting rather than asserting is deliberate: the test compares what
    // the SERVER saw, so a request that silently degraded to GET (the exact
    // bug this arc fixes) reads as `method: "GET"` instead of quietly passing.
    // The <Audio> device fixture. Serves the SAME bytes as /clip.mp4 under an
    // audio content-type: the point of the route is the LOWERING (a primitive
    // that had no Compose implementation at all and named a Swift engine that
    // existed only in a stub), not the codec, and an MP4 container is a legal
    // source for both AVPlayer and ExoPlayer. Range-honoured for the same
    // reason the video route is — AVURLAsset probes with byte ranges and
    // stalls forever on a plain 200.
    if (new URL(req.url).pathname === '/clip.m4a') {
      return rangeResponse(req, CLIP_MP4, 'audio/mp4')
    }
    if (new URL(req.url).pathname === '/clip.mp4') {
      // AVFoundation refuses progressive HTTP playback from a server that
      // ignores Range headers — AVURLAsset probes with byte-range requests
      // and stalls forever on plain 200s (the device test observed
      // "Video: waiting" with a perfectly healthy 200 fixture; the PNG
      // fetch never surfaced this because URLSession GETs don't need
      // ranges). Honour Range with a 206 + Content-Range slice.
      const range = req.headers.get('range')
      const total = CLIP_MP4.byteLength
      if (range !== null) {
        const m = /bytes=(\d+)-(\d*)/.exec(range)
        const start = m ? Number(m[1]) : 0
        const end = m && m[2] !== '' ? Math.min(Number(m[2]), total - 1) : total - 1
        return new Response(CLIP_MP4.slice(start, end + 1), {
          status: 206,
          headers: {
            'content-type': 'video/mp4',
            'accept-ranges': 'bytes',
            'content-range': `bytes ${start}-${end}/${total}`,
            'content-length': String(end - start + 1),
          },
        })
      }
      return new Response(CLIP_MP4, {
        headers: {
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
          'content-length': String(total),
        },
      })
    }
    if (new URL(req.url).pathname === '/echo') {
      return req.text().then(
        (body) =>
          new Response(
            JSON.stringify({
              id: 'srv-1',
              method: req.method,
              body,
              contentType: req.headers.get('content-type') ?? '',
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      )
    }
    // A deliberate non-2xx, so the emitted `isOK`/`isOk` guard has something
    // to reject on. Without it a status check is untestable.
    if (new URL(req.url).pathname === '/boom') {
      return new Response('{"error":"nope"}', {
        status: 500,
        headers: { 'content-type': 'application/json' },
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

console.log(`[ws-echo] listening on ws://localhost:${port} (+ http /echo, /boom, /dot.png)`)
