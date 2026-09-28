// @vitest-environment happy-dom
/**
 * `use<Op>Stream` under the GENERATED mocks — mounted for real, no server.
 *
 * The point of stream mocks is that a component consuming a stream can be
 * built and tested with `installMocks()` alone. That only holds if the mock
 * answers with a real stream body (several events, with ids) and, for an
 * operation that answers JSON too, picks the stream by the request's Accept.
 * Mounted through the real runtime and the real query client for both shapes.
 */
import { h } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const SPEC = readFileSync(join(__dirname, 'fixtures', 'streams.json'), 'utf8')

interface Live<T> {
  events: () => readonly T[]
  latest: () => T | undefined
  status: () => string
  error: () => unknown
}

afterAll(() => cleanEmitted('stream-hook-mocks'))

const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('use<Op>Stream receives the generated mock stream', () => {
  it('stream-only and JSON+stream operations both yield every mocked event', async () => {
    const e = emitToDisk('stream-hook-mocks', SPEC, { plugins: ['schemas', 'client', 'queries', 'mocks'] })
    const { installMocks } = await e.load<{ installMocks(): void }>('mocks.ts')
    const rooms = await e.load<{
      useRoomEventsStream(args: () => { params: { room: string } }): Live<{ id: string; data: { kind: string } }>
    }>('queries/rooms.ts')
    const chat = await e.load<{
      useCreateChatStream(args: () => { json: { prompt: string } }): Live<{ id: string; data: { delta: string } }>
    }>('queries/chat.ts')
    installMocks()

    let room!: Live<{ id: string; data: { kind: string } }>
    let completion!: Live<{ id: string; data: { delta: string } }>
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(
      h(QueryClientProvider, { client: new QueryClient() }, () => {
        room = rooms.useRoomEventsStream(() => ({ params: { room: 'lobby' } }))
        completion = chat.useCreateChatStream(() => ({ json: { prompt: 'hi' } }))
        return h('p', null, () => completion.events().map((ev) => ev.data.delta).join('|'))
      }),
      host,
    )
    await settle()

    expect(room.error()).toBeUndefined()
    expect(room.events().map((ev) => ev.id)).toEqual(['1', '2', '3'])
    expect(room.status()).toBe('closed')
    expect(completion.error()).toBeUndefined()
    expect(completion.latest()?.data.delta).toBe('sample delta 2')
    expect(host.textContent).toBe('sample delta|sample delta 1|sample delta 2')

    dispose()
    host.remove()
  })
})
