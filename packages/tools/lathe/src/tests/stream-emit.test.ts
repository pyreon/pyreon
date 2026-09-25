/**
 * Streaming operations — `<op>Stream` + `use<Op>Stream`, for every client.
 *
 * Three layers: the IR reading (which schema is the EVENT type, for each way a
 * spec can say it), the emitted shape, and a consumer file the real TypeScript
 * compiler checks against the generated tree — a typed event field, a typed
 * hook, and `@ts-expect-error` lines that must STILL be errors (an unused one
 * is TS2578, so a loosened type fails the test).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveConfig, type ClientName } from '../core/config'
import { generate } from '../core/generate'
import { loadOpenApi } from '../input/openapi'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const SPEC = readFileSync(join(__dirname, 'fixtures', 'streams.json'), 'utf8')
const CLIENTS = ['pyreon', 'fetch', 'axios', 'ky'] as const

const file = (client: ClientName, path: string, plugins?: string[]): string => {
  const cfg = resolveConfig({ input: 'x', client, ...(plugins ? { plugins: plugins as never } : {}) })
  const out = generate(SPEC, cfg).files.find((f) => f.path === path)
  if (!out) throw new Error(`no ${path}`)
  return out.contents
}

describe('reading the event type', () => {
  const ops = new Map(loadOpenApi(SPEC).doc.operations.map((o) => [o.id, o]))

  it('reads an SSE `schema` $ref as the JSON event type', () => {
    expect(ops.get('roomEvents')?.stream).toEqual({
      format: 'sse',
      media: 'text/event-stream',
      data: 'json',
      event: { kind: 'ref', name: 'RoomEvent' },
    })
  })

  it("reads 3.2 `itemSchema.properties.data.contentSchema`, ALONGSIDE the JSON response", () => {
    const chat = ops.get('createChat')
    expect(chat?.stream?.event).toEqual({ kind: 'ref', name: 'ChatChunk' })
    expect(chat?.response).toEqual({ kind: 'ref', name: 'ChatCompletion' })
    expect(chat?.responseMedia).toBeUndefined()
  })

  it('reads an NDJSON `itemSchema` and keeps the spec media type', () => {
    const rows = ops.get('exportRows')?.stream
    expect(rows?.format).toBe('ndjson')
    expect(rows?.media).toBe('application/jsonl')
    expect(rows?.event.kind).toBe('object')
  })

  it('a `type: string` SSE schema is text data', () => {
    expect(ops.get('tailLog')?.stream).toMatchObject({ format: 'sse', data: 'text' })
  })

  it('treats `application/stream+json` as a stream, never as one JSON document', () => {
    const spec = (content: Record<string, unknown>) =>
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'T', version: '1' },
        paths: { '/s': { get: { operationId: 's', responses: { 200: { content } } } } },
      })
    const op = loadOpenApi(spec({ 'application/stream+json': { schema: { type: 'object' } } })).doc.operations[0]
    expect(op?.stream?.format).toBe('ndjson')
    expect(op?.responseMedia).toBe('application/stream+json')
  })

  it('reads an NDJSON `array` schema as its items, and an itemSchema with no `data` as the data type', () => {
    const spec = (content: Record<string, unknown>) =>
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'T', version: '1' },
        paths: { '/s': { get: { operationId: 's', responses: { 200: { content } } } } },
      })
    const arr = loadOpenApi(
      spec({ 'application/x-ndjson': { schema: { type: 'array', items: { type: 'integer' } } } }),
    ).doc
    expect(arr.operations[0]?.stream?.event).toEqual({ kind: 'number', integer: true })
    expect(arr.notes.map((n) => n.code)).toContain('stream-event')
    const noData = loadOpenApi(spec({ 'text/event-stream': { itemSchema: { type: 'integer' } } })).doc
    expect(noData.operations[0]?.stream).toMatchObject({ data: 'json', event: { kind: 'number' } })
    const textData = loadOpenApi(
      spec({ 'text/event-stream': { itemSchema: { type: 'object', properties: { data: { type: 'string' } } } } }),
    ).doc
    expect(textData.operations[0]?.stream).toMatchObject({ data: 'text' })
    const jsonData = loadOpenApi(
      spec({ 'text/event-stream': { itemSchema: { type: 'object', properties: { data: { type: 'object' } } } } }),
    ).doc
    expect(jsonData.operations[0]?.stream).toMatchObject({ data: 'json', event: { kind: 'object' } })
    const bare = loadOpenApi(spec({ 'application/x-ndjson': {} })).doc
    expect(bare.operations[0]?.stream?.event.kind).toBe('unknown')
    const plain = loadOpenApi(spec({ 'application/x-ndjson': { schema: { type: 'object' } } })).doc
    expect(plain.operations[0]?.stream?.event.kind).toBe('object')
  })
})

describe('the `streams` config', () => {
  const run = (streams: Record<string, unknown>) =>
    generate(SPEC, resolveConfig({ input: 'x', streams: streams as never }))

  it('declares a stream the spec does not describe, typed by a model', () => {
    const { doc } = run({ createRoom: { format: 'sse', event: 'RoomEvent' } })
    expect(doc.operations.find((o) => o.id === 'createRoom')?.stream).toEqual({
      format: 'sse',
      media: 'text/event-stream',
      data: 'json',
      event: { kind: 'ref', name: 'RoomEvent' },
    })
  })

  it('overrides the spec, keeping its media type when the format agrees', () => {
    const { doc } = run({ exportRows: { event: 'RoomEvent' }, tailLog: { data: 'json' } })
    const rows = doc.operations.find((o) => o.id === 'exportRows')?.stream
    expect(rows).toMatchObject({ media: 'application/jsonl', event: { kind: 'ref', name: 'RoomEvent' } })
    expect(doc.operations.find((o) => o.id === 'tailLog')?.stream?.data).toBe('json')
    const swapped = run({ tailLog: { format: 'ndjson' } }).doc.operations.find((o) => o.id === 'tailLog')?.stream
    expect(swapped).toMatchObject({ format: 'ndjson', media: 'application/x-ndjson', event: { kind: 'unknown' } })
  })

  it.each([
    [{ createRom: { format: 'sse' } }, /names no operation\. Did you mean `createRoom`/],
    [{ createRoom: {} }, /`format: 'sse' \| 'ndjson'` is required/],
    [{ createRoom: { format: 'websocket' } }, /unknown format/],
    [{ exportRows: { data: 'text' } }, /`data` applies to SSE only/],
    [{ createRoom: { format: 'sse', event: 'RoomEvnt' } }, /not a model in this spec\. Did you mean `RoomEvent`/],
  ])('refuses %o with an actionable error', (streams, message) => {
    expect(() => run(streams)).toThrow(message)
    expect(() => run(streams)).toThrow(/^\[Pyreon\] lathe: `streams\./)
  })

  it('refuses a stream whose name would collide with an operation', () => {
    const spec = JSON.parse(SPEC) as { paths: Record<string, unknown> }
    spec.paths['/clash'] = { get: { operationId: 'createRoomStream', responses: {} } }
    expect(() =>
      generate(JSON.stringify(spec), resolveConfig({ input: 'x', streams: { createRoom: { format: 'sse' } } })),
    ).toThrow(/already an operation/)
  })
})

describe('emitted shape', () => {
  it('a JSON + SSE operation keeps its JSON endpoint and gains a raw-body twin', () => {
    const chat = file('pyreon', 'endpoints/chat.ts')
    expect(chat).toContain("api.endpoint<'POST /chat', typeof ChatCompletion, { json: ChatRequest }>")
    expect(chat).toContain("const createChat$stream = /* @__PURE__ */ api.endpoint<'POST /chat', undefined, { json: ChatRequest }, 'stream'>('POST /chat', { responseType: 'stream' })")
    expect(chat).toContain('parse: streamEvent(ChatChunk), reconnect: false,')
  })

  it('a stream-only GET reuses its endpoint, reconnects by default, and gets NO useQuery', () => {
    const rooms = file('pyreon', 'endpoints/rooms.ts')
    expect(rooms).not.toContain('roomEvents$stream')
    expect(rooms).toMatch(/roomEvents\(\{ \.\.\.rest, signal: ctx\.signal/)
    expect(rooms).not.toContain('reconnect: false')
    const hooks = file('pyreon', 'queries/rooms.ts')
    expect(hooks).toContain('export function useRoomEventsStream(')
    expect(hooks).not.toContain('export function useRoomEvents(')
    expect(hooks).not.toContain('useQuery')
  })

  it('sends the spec media type as `accept` when it is not the default', () => {
    expect(file('pyreon', 'endpoints/rows.ts')).toContain("accept: 'application/jsonl'")
  })

  it('a spec with no stream emits nothing stream-related anywhere', () => {
    const plain = JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://t.test' }],
      paths: { '/a': { get: { operationId: 'a', responses: { 200: { content: { 'application/json': { schema: { type: 'string' } } } } } } } },
    })
    for (const client of CLIENTS) {
      const out = generate(plain, resolveConfig({ input: 'x', client })).files.map((f) => f.contents).join('\n')
      expect(out).not.toMatch(/Stream\(|@pyreon\/http\/stream|streamEvent|useStream/)
    }
  })
})

const CONSUMER = `
import { createChatStream, createChat } from './endpoints/chat'
import { roomEventsStream } from './endpoints/rooms'
import { exportRowsStream, tailLogStream } from './endpoints/rows'
import { useRoomEventsStream } from './queries/rooms'
import { useTailLogStream, useExportRowsStream } from './queries/rows'
import { useCreateChatStream as useChat, useCreateChat } from './queries/chat'

export async function consume(): Promise<void> {
  for await (const ev of roomEventsStream({ params: { room: 'a' } })) {
    const kind: string = ev.data.kind
    const at: number = ev.data.at
    void kind
    void at
    // @ts-expect-error -- not a field of RoomEvent
    void ev.data.nope
  }
  // @ts-expect-error -- the path parameter is required
  roomEventsStream({})
  for await (const ev of createChatStream({ json: { prompt: 'hi', stream: true } })) {
    const delta: string = ev.data.delta
    void delta
  }
  // @ts-expect-error -- the body is required and typed
  createChatStream({ json: { nope: 1 } })
  const full = await createChat({ json: { prompt: 'hi' } })
  const text: string = full.text
  void text
  for await (const row of exportRowsStream({ query: { limit: 5 } })) {
    const id: number = row.id
    void id
  }
  for await (const ev of tailLogStream(undefined, { reconnect: { attempts: 1 } })) {
    const line: string = ev.data
    void line
  }
  const s = exportRowsStream()
  s.close()
}

export function hooks(room: () => string): void {
  const live = useRoomEventsStream(() => ({ params: { room: room() } }), { maxEvents: 50 })
  const latest = live.latest()
  if (latest) {
    const k: string = latest.data.kind
    void k
  }
  const tail = useTailLogStream({ stream: { lastEventId: '9' } })
  const all: readonly { data: string }[] = tail.events()
  void all
  const rows = useExportRowsStream(() => undefined)
  void rows.status()
  const chat = useChat(() => ({ json: { prompt: 'x' } }))
  void chat.error()
  void useCreateChat
}
`

describe('the generated tree typechecks, and the types are the event types', () => {
  afterAll(() => {
    for (const c of CLIENTS) cleanTypecheck(`streams-${c}`)
  })
  for (const client of CLIENTS) {
    it(`${client}`, () => {
      const { errors } = typecheckSpec(
        `streams-${client}`,
        SPEC,
        { client, plugins: ['schemas', 'client', 'queries', 'mocks'] },
        { extra: { 'consumer.ts': CONSUMER }, noUnused: true },
      )
      expect(errors).toEqual([])
    }, 60_000)
  }
})

describe('the contract surface records streams', () => {
  const surface = (streams?: Record<string, unknown>) =>
    generate(SPEC, resolveConfig({ input: 'x', ...(streams ? { streams: streams as never } : {}) })).surface

  it('renders what one event carries, and carries tag/summary as metadata', () => {
    const s = surface()
    expect(s.operations.roomEvents).toMatchObject({ stream: 'sse RoomEvent', tag: 'rooms', summary: 'Live events in a room' })
    expect(s.operations.tailLog?.stream).toBe('sse string')
    expect(s.operations.exportRows?.stream).toBe('ndjson { id: integer; name?: string }')
  })

  it('a stream appearing is additive; changing or removing one is breaking', async () => {
    const { diffSurface } = await import('../core/surface')
    const before = surface()
    const added = surface({ createRoom: { format: 'sse', event: 'RoomEvent' } })
    expect(diffSurface(before, added)).toContainEqual(
      expect.objectContaining({ severity: 'additive', code: 'stream-added', subject: 'createRoom' }),
    )
    const changed = surface({ roomEvents: { event: 'ChatChunk' } })
    expect(diffSurface(before, changed)).toContainEqual(
      expect.objectContaining({ severity: 'breaking', code: 'stream-changed', detail: 'stream sse RoomEvent → sse ChatChunk' }),
    )
    expect(diffSurface(added, before)).toContainEqual(
      expect.objectContaining({ severity: 'breaking', code: 'stream-removed', subject: 'createRoom' }),
    )
  })

  it('metadata never produces a change', async () => {
    const { diffSurface } = await import('../core/surface')
    const a = surface()
    const b = structuredClone(a)
    for (const op of Object.values(b.operations)) {
      op.summary = 'reworded'
      op.tag = 'moved'
    }
    expect(diffSurface(a, b)).toEqual([])
  })
})
