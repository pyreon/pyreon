import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUploader, uploadError } from '../index'
import { uploadMutation } from '../query'
import { fakeTransport, file, flush } from './helpers'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('uploadMutation', () => {
  it('resolves with the files when every one is done', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport })
    const promise = uploadMutation(up).mutationFn([file('a'), file('b')])

    t.calls[0]!.resolve('A')
    t.calls[1]!.resolve('B')
    await flush()
    await vi.advanceTimersByTimeAsync(100)
    const done = await promise

    expect(done.map((f) => f.result())).toEqual(['A', 'B'])
    up.dispose()
  })

  it('rejects with the typed error of the first file that fails, and with the reasons of a rejected file', async () => {
    const t = fakeTransport()
    const up = createUploader({ transport: t.transport, retry: false, rules: { maxSize: 50 } })
    const failing = uploadMutation(up).mutationFn([file('a', 10)])

    failing.catch(() => {})
    t.calls[0]!.reject(uploadError('server', 'nope', { status: 422, retryable: false }))
    await flush()
    await vi.advanceTimersByTimeAsync(100)
    await expect(failing).rejects.toMatchObject({ message: 'nope', uploadError: { status: 422 }, file: { name: 'a' } })
    const refused = uploadMutation(up).mutationFn([file('big', 500)])

    await expect(refused).rejects.toMatchObject({ uploadError: { kind: 'rejected' } })
    await expect(uploadMutation(up).mutationFn([])).resolves.toEqual([])
    up.dispose()
  })
})
