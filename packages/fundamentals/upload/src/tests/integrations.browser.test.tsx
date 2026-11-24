import { QueryClient, QueryClientProvider, useMutation } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { createUploader } from '../index'
import { uploadMutation } from '../query'
import { xhrTransport } from '../transport-xhr'

const cleanups: (() => void)[] = []
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
/** Waits on a server-side handshake or an outcome, not on how fast this machine is. CI is slow. */
const LONG = 60_000

const until = async (cond: () => boolean | Promise<boolean>, ms = LONG): Promise<void> => {
  const start = Date.now()

  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for a condition')
    await sleep(20)
  }
}

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

describe('an upload as a real @pyreon/query mutation', () => {
  it('useMutation reports pending, then success, while the uploader exposes progress', async () => {
    // The gate of `test-server.ts`: the server reads 256 KB, then stops reading until it is released, and TCP back-pressure
    // holds the browser back (48 MB is more than the socket buffers absorb). "Pending with progress" is then a state the test
    // waits for, not a moment it samples.
    const id = `mutation-${Math.random().toString(36).slice(2)}`
    const uploader = createUploader({ transport: xhrTransport({ url: `/__u/gate?id=${id}&hold=${256 * 1024}` }) })
    let m!: ReturnType<typeof useMutation<unknown, Error, readonly File[]>>
    const App = (): never => {
      m = useMutation(uploadMutation(uploader) as never) as never

      return null as never
    }
    const root = document.createElement('div')

    document.body.appendChild(root)
    const client = new QueryClient()
    const unmount = mount(<QueryClientProvider client={client}><App /></QueryClientProvider> as never, root)

    cleanups.push(() => {
      unmount()
      uploader.dispose()
      root.remove()
    })
    expect(m.isIdle()).toBe(true)
    m.mutate([new File([new Uint8Array(48 * 1024 * 1024)], 'm.bin')])
    await until(async () => (await (await fetch(`/__u/gate-state?id=${id}`, { signal: AbortSignal.timeout(30_000) })).json()).held === true && uploader.progress().ratio > 0)
    const mid = uploader.progress().ratio

    expect(m.isPending()).toBe(true)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    await fetch(`/__u/gate-release?id=${id}`, { signal: AbortSignal.timeout(30_000) })
    await until(() => m.isSuccess())
    expect(uploader.progress().ratio).toBe(1)
    expect((m.data() as { name: string }[])[0]!.name).toBe('m.bin')
  }, 3 * LONG)

  it('a failing upload makes the mutation an error that carries the upload error', async () => {
    const uploader = createUploader({ transport: xhrTransport({ url: '/__u/status?code=422' }), retry: false })
    let m!: ReturnType<typeof useMutation<unknown, Error, readonly File[]>>
    const App = (): never => {
      m = useMutation(uploadMutation(uploader) as never) as never

      return null as never
    }
    const root = document.createElement('div')

    document.body.appendChild(root)
    const unmount = mount(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><App /></QueryClientProvider> as never, root)

    cleanups.push(() => {
      unmount()
      uploader.dispose()
      root.remove()
    })
    m.mutate([new File([new Uint8Array(10)], 'x.bin')])
    await until(() => m.isError())
    expect((m.error() as unknown as { uploadError: { status: number } }).uploadError.status).toBe(422)
  })
})
