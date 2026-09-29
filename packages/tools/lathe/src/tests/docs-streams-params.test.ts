/**
 * The generated reference pages for what the other docs suites do not reach:
 * streaming operations (with and without the hooks plugin), header and cookie
 * parameters, required text / binary bodies, and the typed sample values a
 * usage snippet fills required parameters with.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveConfig, type PluginName } from '../core/config'
import { generate } from '../core/generate'

const STREAMS = readFileSync(join(__dirname, 'fixtures', 'streams.json'), 'utf8')
const docs = (spec: string, plugins: PluginName[]) =>
  generate(spec, resolveConfig({ input: 'x', plugins }))
    .files.filter((f) => f.path.startsWith('docs/'))
    .map((f) => f.contents)
    .join('\n')

describe('stream operations on the reference pages', () => {
  it('name the stream function and hook, the media and the event type, with both usages', () => {
    const page = docs(STREAMS, ['schemas', 'client', 'queries', 'docs'])
    expect(page).toContain('- **Stream** — `text/event-stream` events of `RoomEvent`, via `roomEventsStream` / `useRoomEventsStream` (web only)')
    expect(page).toContain('- **Stream** — `text/event-stream` events of `string`, via `tailLogStream`')
    expect(page).toContain('`application/jsonl` lines of')
    expect(page).toContain('for await (const row of exportRowsStream())')
    expect(page).toContain("for await (const event of roomEventsStream({ params: { room: '…' } }))")
    expect(page).toContain("const live = useRoomEventsStream(() => ({ params: { room: '…' } }))")
    expect(page).toContain('const live = useTailLogStream()')
  })

  it('without the hooks plugin, the stream usage stops at the function', () => {
    const page = docs(STREAMS, ['schemas', 'client', 'docs'])
    expect(page).toContain('via `roomEventsStream` (web only)')
    expect(page).not.toContain('useRoomEventsStream')
  })
})

describe('parameters and bodies', () => {
  const SPEC = JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'P', version: '1' },
    servers: [{ url: 'https://p.test' }],
    paths: {
      '/items/{id}': {
        put: {
          operationId: 'putNote',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'dry', in: 'query', required: true, schema: { type: 'boolean' } },
            { name: 'mode', in: 'query', required: true, schema: { type: 'string', enum: ["o'k", 'b'] } },
            { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
            { name: 'session', in: 'cookie', required: true, schema: { type: 'string' } },
          ],
          requestBody: { required: true, content: { 'text/plain': { schema: { type: 'string' } } } },
          responses: { 204: { description: 'ok' } },
        },
      },
      '/blobs': {
        post: {
          operationId: 'upload',
          requestBody: { required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          responses: { 204: { description: 'ok' } },
        },
      },
    },
  })
  const page = docs(SPEC, ['schemas', 'client', 'docs'])

  it('lists header and cookie parameters with whether each is required', () => {
    expect(page).toContain('| `X-Trace` | header | no | `string` |')
    expect(page).toContain('| `session` | cookie | yes | `string` |')
  })

  it('fills required parameters with typed samples, an enum value escaped', () => {
    expect(page).toContain('params: { id: 1 }')
    expect(page).toContain("query: { dry: true, mode: 'o\\'k' }")
  })

  it('a required text body is a string, a binary one a Blob, with the media type named', () => {
    expect(page).toContain("body: /* … */ ''")
    expect(page).toContain('body: /* … */ new Blob()')
    expect(page).toContain('as `application/octet-stream`')
  })
})
