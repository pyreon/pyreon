import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import { AUTHOR_POOL, LIVE_BODIES, channels, initialMessages } from './seed'
import type { Message } from './types'

/**
 * Dev-server chat backend for the "live server" chat view
 * (`src/routes/chat/live/[id].tsx`). Dev only: it runs inside `vite` /
 * `bun run dev`, so the view and its e2e spec need no separate service.
 *
 *   GET  /api/chat/history/:channelId   the seeded history (JSON)
 *   GET  /api/chat/stream/:channelId    `text/event-stream`: an `open` ping,
 *                                       then a message every 2–4 s and every
 *                                       message sent to that channel
 *   POST /api/chat/send                 `{ channelId, body, author? }` → the
 *                                       stored message; also broadcast on the
 *                                       channel's stream
 *
 * A production app puts the same three endpoints on its server; the view's
 * `useQuery` / `useSSE` / `useMutation` code does not change.
 */
export function chatServer(): Plugin {
  const subscribers = new Map<string, Set<ServerResponse>>()
  // One pending push timer per channel, replaced on every tick.
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let liveLoopStarted = false

  function broadcast(channelId: string, message: Message): void {
    const payload = `data: ${JSON.stringify(message)}\n\n`
    for (const res of subscribers.get(channelId) ?? []) {
      try {
        res.write(payload)
      } catch {
        // The client went away; its `close` handler removes it.
      }
    }
  }

  function makeMessage(channelId: string, body: string, author: { name: string; color: string }): Message {
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
    if (liveLoopStarted) return
    liveLoopStarted = true
    for (const channel of channels) {
      const tick = (): void => {
        if ((subscribers.get(channel.id)?.size ?? 0) > 0) {
          const bodies = LIVE_BODIES[channel.id] ?? ['👍']
          const body = bodies[Math.floor(Math.random() * bodies.length)] as string
          const author = AUTHOR_POOL[Math.floor(Math.random() * AUTHOR_POOL.length)]!
          broadcast(channel.id, makeMessage(channel.id, body, author))
        }
        timers.set(channel.id, setTimeout(tick, 2000 + Math.random() * 2000))
      }
      timers.set(channel.id, setTimeout(tick, 2000 + Math.random() * 2000))
    }
  }

  const handle: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next) => {
    const url = req.url ?? '/'

    const stream = /^\/api\/chat\/stream\/([^/?]+)/.exec(url)
    if (req.method === 'GET' && stream) {
      const channelId = decodeURIComponent(stream[1]!)
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
      req.on('close', () => set.delete(res))
      res.write(`data: ${JSON.stringify({ kind: 'open', channelId })}\n\n`)
      return
    }

    const history = /^\/api\/chat\/history\/([^/?]+)/.exec(url)
    if (req.method === 'GET' && history) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(initialMessages[decodeURIComponent(history[1]!)] ?? []))
      return
    }

    if (req.method === 'POST' && url === '/api/chat/send') {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        try {
          const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            channelId: string
            body: string
            author?: { name: string; color: string }
          }
          const message = makeMessage(input.channelId, input.body, input.author ?? { name: 'You', color: '#4338ca' })
          broadcast(input.channelId, message)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(message))
        } catch (error) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (error as Error).message }))
        }
      })
      return
    }

    next()
  }

  return {
    name: 'app-showcase-chat-server',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handle)
      // Stop the push timers with the server, so a restarted dev server
      // (or a test harness) does not keep the old loop alive.
      server.httpServer?.once('close', () => {
        for (const t of timers.values()) clearTimeout(t)
        timers.clear()
        subscribers.clear()
        liveLoopStarted = false
      })
    },
  }
}
