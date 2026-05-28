import pyreon from '@pyreon/vite-plugin'
import zero, { nodeAdapter } from '@pyreon/zero/server'
import type { Connect, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { AUTHORS, LIVE_BODIES, channels, initialHistory } from './src/lib/seed'

/**
 * Dev-only SSE endpoint + send endpoint.
 *
 * GET /api/stream/:channelId — `text/event-stream` connection. The
 * server pushes a fresh message every 2-4s on the given channel,
 * picked deterministically from the seed corpus so the demo reads
 * naturally. Subscribers from OTHER channels also receive their
 * channel's broadcasts (mirrors a real chat backend).
 *
 * POST /api/send — accepts `{ channelId, body }`. The server
 * acknowledges with the persisted message (id + timestamp) AND
 * broadcasts it to all subscribers of that channel.
 *
 * GET /api/history/:channelId — returns the initial history array.
 *
 * Pure dev-only — no real backend, runs entirely from `bun run dev`.
 */
function chatBackendPlugin() {
  // Per-channel subscriber sets keyed by channelId.
  const subscribers = new Map<string, Set<ServerResponse>>()
  let liveIntervalSet = false

  function broadcast(channelId: string, message: unknown): void {
    const subs = subscribers.get(channelId)
    if (!subs || subs.size === 0) return
    const payload = `data: ${JSON.stringify(message)}\n\n`
    for (const res of subs) {
      try {
        res.write(payload)
      } catch {
        /* client gone — cleanup happens on close */
      }
    }
  }

  function makeMessage(channelId: string, body: string, author: { name: string; color: string }): unknown {
    return {
      id: `srv_${channelId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      channelId,
      author: author.name,
      authorColor: author.color,
      body,
      createdAt: new Date().toISOString(),
    }
  }

  function startLiveLoop(): void {
    if (liveIntervalSet) return
    liveIntervalSet = true
    // Per-channel interval — different cadence per channel keeps the
    // demo interesting + tests cross-channel subscription routing.
    for (const channel of channels) {
      const tick = () => {
        const subs = subscribers.get(channel.id)
        if (subs && subs.size > 0) {
          const bodies = LIVE_BODIES[channel.id] ?? ['👍']
          const body = bodies[Math.floor(Math.random() * bodies.length)] as string
          const author = AUTHORS[Math.floor(Math.random() * AUTHORS.length)] as {
            name: string
            color: string
          }
          broadcast(channel.id, makeMessage(channel.id, body, author))
        }
        // Next tick 2-4s later.
        setTimeout(tick, 2000 + Math.random() * 2000)
      }
      setTimeout(tick, 2000 + Math.random() * 2000)
    }
  }

  return {
    name: 'chat-backend',
    // Run BEFORE @pyreon/zero (which registers an SPA 404 handler that
    // swallows /api/* requests sent without an HTML Accept header).
    enforce: 'pre' as const,
    configureServer(server: ViteDevServer) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        const url = req.url ?? '/'

        // SSE stream
        const streamMatch = url.match(/^\/api\/stream\/([^/?]+)/)
        if (req.method === 'GET' && streamMatch) {
          const channelId = streamMatch[1] as string
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')
          res.flushHeaders?.()
          let set = subscribers.get(channelId)
          if (!set) {
            set = new Set()
            subscribers.set(channelId, set)
          }
          set.add(res)
          startLiveLoop()
          req.on('close', () => {
            set?.delete(res)
          })
          // Emit a ping so the client sees the open.
          res.write(`data: ${JSON.stringify({ kind: 'open', channelId })}\n\n`)
          return
        }

        // History
        const historyMatch = url.match(/^\/api\/history\/([^/?]+)/)
        if (req.method === 'GET' && historyMatch) {
          const channelId = historyMatch[1] as string
          const history = initialHistory[channelId] ?? []
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(history))
          return
        }

        // Send
        if (req.method === 'POST' && url === '/api/send') {
          const chunks: Buffer[] = []
          req.on('data', (c: Buffer) => chunks.push(c))
          req.on('end', () => {
            try {
              const { channelId, body, author } = JSON.parse(
                Buffer.concat(chunks).toString('utf8'),
              ) as { channelId: string; body: string; author?: { name: string; color: string } }
              const useAuthor = author ?? { name: 'You', color: '#4338ca' }
              const message = makeMessage(channelId, body, useAuthor)
              broadcast(channelId, message)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(message))
            } catch (err) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: (err as Error).message }))
            }
          })
          return
        }

        next()
      }
      // Register BEFORE Vite's SPA fallback so /api/* requests are caught.
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) =>
        middleware(req, res, next),
      )
    },
  }
}

export default {
  // After the W24 fix in @pyreon/zero (Zero's dev 404 handler skips
  // `/api/*` paths), plugin order between chatBackendPlugin and zero
  // doesn't matter — user plugins registering /api/* middleware are
  // no longer shadowed regardless of order. Canonical conventional
  // order: pyreon → zero → app-specific.
  plugins: [pyreon(), zero({ mode: 'spa', adapter: nodeAdapter() }), chatBackendPlugin()],
}
