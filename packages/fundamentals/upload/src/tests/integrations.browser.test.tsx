import { QueryClient, QueryClientProvider, useMutation } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { createUploader } from '../index'
import { uploadMutation } from '../query'
import { xhrTransport } from '../transport-xhr'

const cleanups: (() => void)[] = []
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

describe('an upload as a real @pyreon/query mutation', () => {
  it('useMutation reports pending, then success, while the uploader exposes progress', async () => {
    const uploader = createUploader({ transport: xhrTransport({ url: '/__u/sink?chunk=131072&every=20' }) })
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
    m.mutate([new File([new Uint8Array(3 * 1024 * 1024)], 'm.bin')])
    await sleep(100)
    expect(m.isPending()).toBe(true)
    const seen: number[] = []

    for (let i = 0; i < 200 && !m.isSuccess(); i++) {
      seen.push(uploader.progress().ratio)
      await sleep(30)
    }
    expect(m.isSuccess()).toBe(true)
    expect(uploader.progress().ratio).toBe(1)
    expect(new Set(seen).size).toBeGreaterThan(2)
    expect((m.data() as { name: string }[])[0]!.name).toBe('m.bin')
  })

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
    for (let i = 0; i < 100 && !m.isError(); i++) await sleep(30)
    expect(m.isError()).toBe(true)
    expect((m.error() as unknown as { uploadError: { status: number } }).uploadError.status).toBe(422)
  })
})
