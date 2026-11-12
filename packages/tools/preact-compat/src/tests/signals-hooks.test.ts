/**
 * `@preact/signals`' component hooks (#4366): `useSignal`, `useComputed`,
 * `useSignalEffect`. The compat alias maps `@preact/signals` to
 * `@pyreon/preact-compat/signals`, which exported only `signal` / `computed` /
 * `effect` / `batch`, so `import { useSignal } from '@preact/signals'` failed
 * at import under `compat: 'preact'`.
 *
 * Bisect-verified: without the hooks the import fails and every spec does.
 */
import { mount } from '@pyreon/runtime-dom'
import { jsx } from '../jsx-runtime'
import * as signals from '../signals'
import { signal, useComputed, useSignal, useSignalEffect } from '../signals'
import { useState } from '../hooks'

const tick = () => new Promise<void>((r) => queueMicrotask(r))

describe('@preact/signals hooks', () => {
  it('are exported from the signals entry', () => {
    for (const name of ['useSignal', 'useComputed', 'useSignalEffect']) {
      expect(typeof (signals as Record<string, unknown>)[name]).toBe('function')
    }
  })

  it('useSignal keeps one signal per instance across re-renders', async () => {
    const seen = new Set<{ value: number }>()
    let rerender: () => void = () => {}
    function Comp() {
      const [, setN] = useState(0)
      rerender = () => setN((n) => n + 1)
      const count = useSignal(5)
      seen.add(count)
      return jsx('p', { children: String(count.peek()) })
    }
    const el = document.createElement('div')
    const dispose = mount(jsx(Comp, {}), el)
    rerender()
    await tick()
    await tick()
    expect(seen.size).toBe(1)
    expect([...seen][0]!.value).toBe(5)
    dispose()
  })

  it('useComputed derives from signals and from the latest closure', async () => {
    const base = signal(2)
    let doubled: { value: number } | undefined
    function Comp(props: { k: number }) {
      doubled = useComputed(() => base.value * props.k)
      return null
    }
    const el = document.createElement('div')
    const dispose = mount(jsx(Comp as never, { k: 2 }), el)
    expect(doubled!.value).toBe(4)
    base.value = 5
    expect(doubled!.value).toBe(10)
    dispose()
  })

  it('useSignalEffect re-runs on signal changes and is disposed on unmount', async () => {
    const s = signal(1)
    const log: string[] = []
    function Comp() {
      useSignalEffect(() => {
        log.push(`run ${s.value}`)
        return () => log.push('cleanup')
      })
      return null
    }
    const el = document.createElement('div')
    const dispose = mount(jsx(Comp, {}), el)
    await tick()
    s.value = 2
    dispose()
    s.value = 3
    expect(log).toEqual(['run 1', 'cleanup', 'run 2', 'cleanup'])
  })
})
