import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { mountResumableServers } from './servers'

/**
 * A local HTTP server for the real-Chromium tests, mounted on the test runner's own dev server (same origin, so no CORS).
 * Routes live under `/__u/`:
 *   POST /sink?chunk=<bytes>&every=<ms>   read the body slowly and answer { received }
 *   POST /gate?id=G&hold=<bytes>          read <hold> bytes, then stop reading (back-pressure) until /gate-release; answer { received }
 *   GET  /gate-state?id=G                 what the gate saw: { requests, received, length, held, closed, complete, ended, cut }
 *   GET  /gate-release?id=G               read on: the held request (and every later one for G) goes through
 *   POST /status?code=N&retryAfter=...    answer N with a JSON body (and a Retry-After header)
 *   POST /flaky?key=K&fail=N              answer 503 the first N times for key K, then 200
 *   PUT  /noetag                          answer 200 with no ETag header
 *   POST /hang                            read the body and never answer
 *   POST /echo                            answer the request headers and the body size
 *   GET  /active                          how many requests are open right now
 *   GET  /count?key=K                     how many requests the route for key K has seen
 *   GET  /reset                           forget the counters
 */
interface State {
  active: number
  counts: Map<string, number>
  gates: Map<string, Gate>
}

/**
 * A handshake instead of a timing guess. The gate reads `hold` bytes of a request body, then pauses the request stream: Node
 * stops reading the socket, the kernel buffers fill and TCP flow control stops the browser from sending more. The test then
 * observes the mid-upload state, and releases (or cancels). The body must be bigger than what the socket buffers on both ends
 * can absorb (a few MB on Linux and macOS loopback), so the tests that rely on the browser being held back send 48 MB.
 */
interface Gate {
  requests: number
  released: boolean
  /** The latest request: bytes read, its Content-Length, whether it is held, closed, and whether its whole body arrived. */
  received: number
  length: number
  held: boolean
  closed: boolean
  complete: boolean
  /** One per open request on this gate, so a release lets every held request read on. */
  resumers: Set<() => void>
  /** Requests whose whole body arrived, and requests the client cut off mid-body. */
  ended: number
  cut: number
}

const gateOf = (state: State, id: string): Gate => {
  let gate = state.gates.get(id)

  if (gate === undefined) {
    gate = { requests: 0, released: false, received: 0, length: 0, held: false, closed: false, complete: false, resumers: new Set(), ended: 0, cut: 0 }
    state.gates.set(id, gate)
  }

  return gate
}

function readGated(req: IncomingMessage, res: ServerResponse, gate: Gate, hold: number): void {
  gate.requests++
  Object.assign(gate, { received: 0, length: Number(req.headers['content-length'] ?? 0), held: false, closed: false, complete: false })
  const resume = (): void => {
    gate.held = false
    req.resume()
  }

  gate.resumers.add(resume)
  let got = 0
  let paused = false

  req.on('data', (data: Buffer) => {
    got += data.length
    gate.received = got
    if (!gate.released && !paused && got >= hold) {
      paused = true
      gate.held = true
      req.pause()
    }
  })
  req.on('end', () => {
    gate.ended++
    gate.complete = req.complete
    json(res, 200, { received: got, type: req.headers['content-type']?.split(';')[0] })
  })
  // An aborted request ends here without 'end': the client went away mid-body.
  req.on('close', () => {
    gate.resumers.delete(resume)
    if (!req.complete) gate.cut++
    gate.complete = req.complete
    gate.closed = true
  })
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

function readThrottled(req: IncomingMessage, chunk: number, every: number): Promise<number> {
  return new Promise((resolve) => {
    let received = 0
    let tick = 0

    req.on('data', (data: Buffer) => {
      received += data.length
      tick += data.length
      if (every > 0 && tick >= chunk) {
        tick = 0
        req.pause()
        setTimeout(() => req.resume(), every)
      }
    })
    req.on('end', () => resolve(received))
    req.on('error', () => resolve(received))
    req.on('close', () => resolve(received))
  })
}

/** The GET routes that inspect or steer the server. Answers true when it handled the request. */
function control(state: State, url: URL, req: IncomingMessage, res: ServerResponse): boolean {
  const q = url.searchParams
  const gate = (): Gate => gateOf(state, q.get('id') ?? '')

  switch (url.pathname) {
    case '/active':
      json(res, 200, { active: state.active })
      return true
    case '/count':
      json(res, 200, { count: state.counts.get(q.get('key') ?? '') ?? 0 })
      return true
    case '/gate-state': {
      const g = gate()

      json(res, 200, { requests: g.requests, received: g.received, length: g.length, held: g.held, closed: g.closed, complete: g.complete, ended: g.ended, cut: g.cut })
      return true
    }
    case '/gate-release': {
      const g = gate()

      g.released = true
      for (const r of g.resumers) r()
      json(res, 200, { ok: true })

      return true
    }
    case '/reset':
      state.counts.clear()
      state.gates.clear()
      json(res, 200, { ok: true })

      return true
    case '/noetag':
      req.resume()
      req.on('end', () => json(res, 200, { ok: true }))
      return true
    default:
      return false
  }
}

/** The POST routes: each request is counted in `active` while it is open. */
function receive(state: State, url: URL, req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const q = url.searchParams
  const key = q.get('key') ?? url.pathname

  state.active++
  state.counts.set(key, (state.counts.get(key) ?? 0) + 1)
  let counted = true
  const done = (): void => {
    if (counted) state.active--
    counted = false
  }

  res.on('close', done)
  if (url.pathname === '/gate') {
    readGated(req, res, gateOf(state, q.get('id') ?? ''), Number(q.get('hold') ?? 262_144))
  } else if (url.pathname === '/sink') {
    void readThrottled(req, Number(q.get('chunk') ?? 262_144), Number(q.get('every') ?? 30)).then((received) => json(res, 200, { received, type: req.headers['content-type']?.split(';')[0] }))
  } else if (url.pathname === '/status') {
    void readThrottled(req, 1e9, 0).then(() => json(res, Number(q.get('code') ?? 400), { error: 'nope', field: 'file' }, q.get('retryAfter') === null ? {} : { 'retry-after': q.get('retryAfter')! }))
  } else if (url.pathname === '/flaky') {
    void readThrottled(req, 1e9, 0).then(() => (state.counts.get(key)! <= Number(q.get('fail') ?? 1) ? json(res, 503, { error: 'busy' }) : json(res, 200, { ok: true, attempt: state.counts.get(key) })))
  } else if (url.pathname === '/hang') {
    void readThrottled(req, 1e9, 0)
  } else if (url.pathname === '/echo') {
    void readThrottled(req, 1e9, 0).then((received) => json(res, 200, { received, authorization: req.headers.authorization ?? null, custom: req.headers['x-custom'] ?? null }))
  } else next()
}

export function uploadTestServer(): Plugin {
  const state: State = { active: 0, counts: new Map(), gates: new Map() }

  return {
    name: 'pyreon-upload-test-server',
    configureServer(server) {
      mountResumableServers(server)
      server.middlewares.use('/__u', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x')

        if (control(state, url, req, res)) return
        if (req.method !== 'POST') return next()
        receive(state, url, req, res, next)
      })
    },
  }
}
