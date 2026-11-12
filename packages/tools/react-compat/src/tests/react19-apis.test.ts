/**
 * React 19.x APIs the compat layer did not export (#4366): `useEffectEvent`,
 * `Activity`, `ViewTransition` and `cache`. With `pyreon({ compat: 'react' })`
 * an `import { useEffectEvent } from 'react'` failed at import. Each export
 * now exists and behaves as React's does on the client (the documented
 * differences are in the jsdoc and react-compat.md).
 *
 * Bisect-verified: without the exports the import itself fails
 * ("does not provide an export named …") and every spec here fails.
 */
import { mount } from '@pyreon/runtime-dom'
import { jsx } from '../jsx-runtime'
import * as React from '../index'
import { Activity, cache, useEffect, useEffectEvent, useState, ViewTransition } from '../index'

const tick = () => new Promise<void>((r) => queueMicrotask(r))

describe('React 19.x compat APIs', () => {
  it('are exported from the react entry', () => {
    for (const name of ['useEffectEvent', 'Activity', 'ViewTransition', 'cache']) {
      expect(typeof (React as Record<string, unknown>)[name]).toBe('function')
    }
  })

  it('useEffectEvent returns a stable function that calls the latest callback', async () => {
    const seen: number[] = []
    const fns = new Set<unknown>()
    let bump: () => void = () => {}
    function Comp() {
      const [n, setN] = useState(0)
      bump = () => setN((v) => v + 1)
      const onEvent = useEffectEvent(() => seen.push(n))
      fns.add(onEvent)
      useEffect(() => {
        onEvent()
      }, [])
      ;(globalThis as { __fire?: () => void }).__fire = onEvent
      return null
    }
    const el = document.createElement('div')
    const dispose = mount(jsx(Comp, {}), el)
    await tick()
    bump()
    await tick()
    await tick()
    ;(globalThis as { __fire?: () => void }).__fire!()
    expect(fns.size).toBe(1)
    expect(seen).toEqual([0, 1])
    dispose()
  })

  it('Activity shows its children when visible and keeps them hidden when hidden', () => {
    const el = document.createElement('div')
    const dispose = mount(
      jsx('section', {
        children: [
          jsx(Activity, { mode: 'visible', children: jsx('p', { children: 'shown' }) }),
          jsx(Activity, { mode: 'hidden', children: jsx('p', { children: 'kept' }) }),
        ],
      }),
      el,
    )
    const [shown, kept] = Array.from(el.querySelectorAll<HTMLElement>('[data-activity]'))
    expect(shown!.style.display).toBe('contents')
    expect(shown!.textContent).toBe('shown')
    expect(kept!.style.display).toBe('none')
    expect(kept!.textContent).toBe('kept')
    dispose()
  })

  it('ViewTransition renders its children', () => {
    const el = document.createElement('div')
    const dispose = mount(jsx(ViewTransition, { children: jsx('b', { children: 'x' }) }), el)
    expect(el.querySelector('b')?.textContent).toBe('x')
    dispose()
  })

  it('cache returns the function unchanged on the client, as React does', () => {
    const fn = (a: number) => a * 2
    expect(cache(fn)).toBe(fn)
  })
})
