/**
 * The generated `<op>Stream` functions, EXECUTED against a real HTTP server —
 * for every client.
 *
 * What only a socket can prove: partial chunks reassemble into events, a
 * dropped GET stream reconnects carrying `Last-Event-ID`, the POST body and
 * the configured headers reach the server (so the stream really runs through
 * the client's own pipeline), each event is validated per
 * `configureApi({ validate })`, and the generated mocks answer with a stream
 * the generated function can read.
 */
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { resolveConfig, type ClientName } from '../core/config'
import { generate } from '../core/generate'

const SPEC = readFileSync(join(__dirname, 'fixtures', 'streams.json'), 'utf8')
const CLIENTS: ClientName[] = ['pyreon', 'fetch', 'axios', 'ky']
const ROOT = join(__dirname, '.generated')

interface Seen {
  url: string
  method: string
  accept: string | undefined
  lastEventId: string | undefined
  auth: string | undefined
  body: string
}

let server: Server
let base = ''
let seen: Seen[] = []
let roomHits = 0

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += String(c)
    })
    req.on('end', () => resolve(data))
  })
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req)
  const url = req.url ?? ''
  seen.push({
    url,
    method: req.method ?? '',
    accept: req.headers.accept,
    lastEventId: req.headers['last-event-id'] as string | undefined,
    auth: req.headers.authorization,
    body,
  })
  const sse = () => res.writeHead(200, { 'content-type': 'text/event-stream' })
  if (url.startsWith('/v1/rooms/lobby/events')) {
    roomHits++
    sse()
    if (roomHits === 1) {
      res.write('retry: 5\nid: 1\ndata: {"kind":"join",')
      await pause(5)
      res.write('"at":1}\n\n')
      setTimeout(() => res.destroy(), 10)
      return
    }
    res.end('id: 2\ndata: {"kind":"leave","at":2}\n\n')
    return
  }
  if (url === '/v1/chat') {
    sse()
    const prompt = (JSON.parse(body) as { prompt: string }).prompt
    if (prompt === 'bad') {
      res.end('data: {"nope":1}\n\n')
      return
    }
    res.write('data: {"delta":"he"}\n\nda')
    await pause(5)
    res.end('ta: {"delta":"llo"}\n\n')
    return
  }
  if (url.startsWith('/v1/rows')) {
    res.writeHead(200, { 'content-type': 'application/jsonl' })
    res.end('{"id":1,"name":"a"}\n{"id":2}')
    return
  }
  if (url === '/v1/log') {
    sse()
    res.end('data: line one\n\n')
    return
  }
  res.writeHead(404).end()
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void handle(req, res)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
  for (const c of CLIENTS) rmSync(join(ROOT, `streams-rt-${c}`), { recursive: true, force: true })
})

beforeEach(() => {
  seen = []
  roomHits = 0
})

type Stream<T> = AsyncIterable<T> & { close(): void }
interface Mod {
  roomEventsStream(
    args: { params: { room: string } },
    options?: { lastEventId?: string },
  ): Stream<{ type: string; data: { kind: string; at: number }; id: string }>
  createChatStream(args: { json: { prompt: string } }): Stream<{ data: { delta: string } }>
  createChat(args: { json: { prompt: string } }): Promise<unknown>
  exportRowsStream(args?: { query?: { limit?: number } }): Stream<{ id: number; name?: string }>
  tailLogStream(): Stream<{ data: string }>
  configureApi(c: Record<string, unknown>): void
  installMocks(): void
  setDevTransport(t: null): void
}

async function load(client: ClientName): Promise<Mod> {
  const dir = join(ROOT, `streams-rt-${client}`)
  rmSync(dir, { recursive: true, force: true })
  const { files } = generate(SPEC, resolveConfig({ input: 'x', client, plugins: ['schemas', 'client', 'mocks'] }))
  for (const f of files) {
    const p = join(dir, f.path)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, f.contents)
  }
  const mods = await Promise.all(
    ['client.ts', 'mocks.ts', 'endpoints/rooms.ts', 'endpoints/chat.ts', 'endpoints/rows.ts'].map(
      (p) => import(join(dir, p)) as Promise<Record<string, unknown>>,
    ),
  )
  const mod = Object.assign({}, ...mods) as Mod
  mod.setDevTransport(null)
  mod.configureApi({ baseUrl: base, validate: 'strict', headers: { authorization: 'Bearer t0k' } })
  return mod
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of it) out.push(v)
  return out
}

for (const client of CLIENTS) {
  describe(`generated ${client} client — streams`, () => {
    it('reassembles partial chunks, reconnects a dropped GET with Last-Event-ID, through the client pipeline', async () => {
      const gen = await load(client)
      const events = await collect(gen.roomEventsStream({ params: { room: 'lobby' } }))
      expect(events.map((e) => [e.id, e.data.kind, e.data.at])).toEqual([
        ['1', 'join', 1],
        ['2', 'leave', 2],
      ])
      expect(seen.map((s) => s.lastEventId)).toEqual([undefined, '1'])
      expect(seen.every((s) => s.accept?.includes('text/event-stream'))).toBe(true)
      // configureApi's headers reached the server: the stream is a real call
      // through this client, not a side channel around it.
      expect(seen.every((s) => s.auth === 'Bearer t0k')).toBe(true)
    })

    it('POSTs the body and streams validated events', async () => {
      const gen = await load(client)
      const events = await collect(gen.createChatStream({ json: { prompt: 'hi' } }))
      expect(events.map((e) => e.data.delta).join('')).toBe('hello')
      expect(seen[0]?.method).toBe('POST')
      expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ prompt: 'hi' })
    })

    it("rejects an event that fails its schema under `validate: 'strict'`, passes it under 'warn'", async () => {
      const gen = await load(client)
      const err = await collect(gen.createChatStream({ json: { prompt: 'bad' } })).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toMatch(/did not match its schema/)
      // POST is not reconnected: one request, even though it failed.
      expect(seen).toHaveLength(1)

      gen.configureApi({ validate: 'warn' })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const passed = await collect(gen.createChatStream({ json: { prompt: 'bad' } }))
      expect(passed.map((e) => e.data)).toEqual([{ nope: 1 }])
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    it('streams NDJSON lines with the spec media type as `accept`, and a query', async () => {
      const gen = await load(client)
      const rows = await collect(gen.exportRowsStream({ query: { limit: 2 } }))
      expect(rows).toEqual([{ id: 1, name: 'a' }, { id: 2 }])
      expect(seen[0]?.url).toBe('/v1/rows?limit=2')
      expect(seen[0]?.accept).toContain('application/jsonl')
    })

    it('keeps text SSE data as strings', async () => {
      const gen = await load(client)
      expect((await collect(gen.tailLogStream())).map((e) => e.data)).toEqual(['line one'])
    })

    it('the generated mocks answer with a REAL stream: several events, ids, resume, and JSON beside a stream', async () => {
      const gen = await load(client)
      gen.installMocks()
      try {
        const events = await collect(gen.roomEventsStream({ params: { room: 'lobby' } }))
        expect(events.map((e) => e.id)).toEqual(['1', '2', '3'])
        expect(events.every((e) => typeof e.data.kind === 'string' && typeof e.data.at === 'number')).toBe(true)
        // A dual JSON + SSE operation: the stream route is picked by the
        // Accept the stream sends, the plain call still gets JSON.
        const chat = await collect(gen.createChatStream({ json: { prompt: 'hi' } }))
        expect(chat.map((e) => e.data.delta)).toEqual(['sample delta', 'sample delta 1', 'sample delta 2'])
        expect(await gen.createChat({ json: { prompt: 'hi' } })).toEqual({ text: 'sample text' })
        const rows = await collect(gen.exportRowsStream())
        expect(rows).toHaveLength(3)
        expect(rows.every((r) => typeof r.id === 'number')).toBe(true)
        expect((await collect(gen.tailLogStream())).map((e) => e.data)).toEqual(['sample 1', 'sample 2', 'sample 3'])
        expect(seen).toEqual([])
      } finally {
        gen.setDevTransport(null)
      }
    })

    it('a mocked stream resumes after the Last-Event-ID it is sent', async () => {
      const gen = await load(client)
      gen.installMocks()
      try {
        const resumed = await collect(gen.roomEventsStream({ params: { room: 'lobby' } }, { lastEventId: '2' }))
        expect(resumed.map((e) => e.id)).toEqual(['3'])
      } finally {
        gen.setDevTransport(null)
      }
    })
  })
}
