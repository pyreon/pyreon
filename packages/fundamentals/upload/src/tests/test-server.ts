import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { mountResumableServers } from './servers'

/**
 * A local HTTP server for the real-Chromium tests, mounted on the test runner's own dev server (same origin, so no CORS).
 * Routes live under `/__u/`:
 *   POST /sink?chunk=<bytes>&every=<ms>   read the body slowly (so upload progress is observable) and answer { received }
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

export function uploadTestServer(): Plugin {
  const state: State = { active: 0, counts: new Map() }

  return {
    name: 'pyreon-upload-test-server',
    configureServer(server) {
      mountResumableServers(server)
      server.middlewares.use('/__u', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x')
        const q = url.searchParams
        const key = q.get('key') ?? url.pathname

        if (url.pathname === '/active') return json(res, 200, { active: state.active })
        if (url.pathname === '/count') return json(res, 200, { count: state.counts.get(q.get('key') ?? '') ?? 0 })
        if (url.pathname === '/reset') {
          state.counts.clear()

          return json(res, 200, { ok: true })
        }
        if (url.pathname === '/noetag') {
          req.resume()

          return void req.on('end', () => json(res, 200, { ok: true }))
        }
        if (req.method !== 'POST') return next()
        state.active++
        state.counts.set(key, (state.counts.get(key) ?? 0) + 1)
        let counted = true
        const done = (): void => {
          if (counted) state.active--
          counted = false
        }

        res.on('close', done)
        if (url.pathname === '/sink') {
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
      })
    },
  }
}
