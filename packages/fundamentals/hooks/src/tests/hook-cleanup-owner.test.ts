// A hook's teardown must run when its COMPONENT unmounts — and only then.
//
// Every hook here used to register teardown with `@pyreon/reactivity`'s
// `onCleanup` during setup. That API only registers inside an effect RUN, so:
//   - at a root mount it was silently dropped (unmount left the GPS watch,
//     socket and window listeners running), and
//   - inside a boundary's effect (a <For> row, a <Show>, a routed page) it was
//     attached to the BOUNDARY's effect, so adding one row tore down the
//     resources of every row that stayed mounted.
// See src/lifecycle.ts. These specs mount through the REAL runtime.
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEventListener } from '../useEventListener'
import { useGeolocation } from '../useGeolocation'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function installGeo() {
  let next = 0
  const clearWatch = vi.fn()
  const watchPosition = vi.fn(() => ++next)
  vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } })
  return { clearWatch, watchPosition }
}

describe('hook teardown is owned by the component', () => {
  it('a root-mounted component stops its GPS watch on unmount', () => {
    const g = installGeo()
    function Map() {
      useGeolocation().start()
      return h('div', null)
    }
    const dispose = mount(h(Map, null), document.createElement('div'))
    expect(g.watchPosition).toHaveBeenCalledTimes(1)
    dispose()
    expect(g.clearWatch).toHaveBeenCalledWith(1)
  })

  it('a root-mounted component removes its window listener on unmount', () => {
    const handler = vi.fn()
    function C() {
      useEventListener('resize', handler)
      return h('div', null)
    }
    const dispose = mount(h(C, null), document.createElement('div'))
    dispose()
    window.dispatchEvent(new Event('resize'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('adding a <For> row does not tear down the rows that stay mounted', () => {
    const g = installGeo()
    function Row() {
      useGeolocation().start()
      return h('div', null)
    }
    const items = signal([1, 2])
    const dispose = mount(
      h('div', null, h(For as never, { each: items, by: (x: number) => x }, () => h(Row, null))),
      document.createElement('div'),
    )
    items.set([1, 2, 3])
    expect(g.clearWatch).not.toHaveBeenCalled()
    items.set([2, 3])
    // Exactly the removed row's watch is cleared.
    expect(g.clearWatch).toHaveBeenCalledTimes(1)
    expect(g.clearWatch).toHaveBeenCalledWith(1)
    dispose()
    expect(g.clearWatch).toHaveBeenCalledTimes(3)
  })

  it('no hook registers setup teardown through bare onCleanup', () => {
    // Structural lock for the class: `onCleanup` imported from
    // @pyreon/reactivity anywhere but lifecycle.ts reopens it.
    const dir = join(__dirname, '..')
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && f !== 'lifecycle.ts' && f !== 'manifest.ts')
      .filter((f) =>
        /import\s*\{[^}]*\bonCleanup\b[^}]*\}\s*from\s*'@pyreon\/reactivity'/.test(
          readFileSync(join(dir, f), 'utf8'),
        ),
      )
    expect(offenders).toEqual([])
  })
})
