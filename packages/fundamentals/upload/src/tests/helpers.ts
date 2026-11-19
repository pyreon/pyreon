import type { Transport, TransportContext, TransportFile } from '../types'

export interface Call {
  file: TransportFile
  ctx: TransportContext
  resolve(value?: unknown): void
  reject(error: unknown): void
  settled: boolean
}

/** A transport whose uploads the test settles by hand. */
export function fakeTransport(): { transport: Transport; calls: Call[]; running(): number } {
  const calls: Call[] = []

  return {
    calls,
    running: () => calls.filter((c) => !c.settled && !c.ctx.signal.aborted).length,
    transport: {
      upload(file, ctx) {
        return new Promise((resolve, reject) => {
          const call: Call = {
            file,
            ctx,
            settled: false,
            resolve: (v) => {
              call.settled = true
              resolve(v)
            },
            reject: (e) => {
              call.settled = true
              reject(e)
            },
          }

          calls.push(call)
        })
      },
    },
  }
}

export const file = (name: string, size = 100, type = 'text/plain'): File => new File([new Uint8Array(size)], name, { type, lastModified: 1 })

export const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
