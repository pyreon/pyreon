// Solid parity: `onCleanup` registers on the CURRENT owner — the running
// `createEffect` (before each re-run + on dispose) or the enclosing
// `createRoot` (on dispose) — not always "component unmount".
import { createEffect, createRoot, createSignal, onCleanup } from '../index'

describe('onCleanup owner', () => {
  test('inside createEffect it runs before each re-run and on dispose', () => {
    const log: string[] = []
    let set!: (v: number) => void
    let dispose!: () => void
    createRoot((d) => {
      dispose = d
      const [v, setV] = createSignal(0)
      set = setV
      createEffect(() => {
        const cur = v()
        log.push(`run${cur}`)
        onCleanup(() => log.push(`clean${cur}`))
      })
    })
    set(1)
    set(2)
    dispose()
    expect(log).toEqual(['run0', 'clean0', 'run1', 'clean1', 'run2', 'clean2'])
  })

  test('inside createRoot it runs when the root is disposed', () => {
    const log: string[] = []
    createRoot((dispose) => {
      onCleanup(() => log.push('root'))
      expect(log).toEqual([])
      dispose()
    })
    expect(log).toEqual(['root'])
  })
})
