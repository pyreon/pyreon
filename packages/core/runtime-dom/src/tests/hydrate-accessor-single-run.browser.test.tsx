/**
 * Real-Chromium lock for the hydration single-evaluation contract (the
 * happy-dom specs with the real compiler + SSR are in
 * `hydrate-accessor-single-run.test.tsx`). Neither the compiler nor
 * `renderToString` runs in the page, so the server HTML below is exactly what
 * `renderToString` emits for the same `h()` trees (regenerate it if the SSR
 * shape changes). Each accessor counts its evaluations during hydration.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { hydrateRoot } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

function hydrate(html: string, view: () => unknown): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const dispose = hydrateRoot(host, h(view as never, null))
  return {
    host,
    dispose: () => {
      dispose()
      host.remove()
    },
  }
}

describe('hydration evaluates a reactive accessor once (real Chromium)', () => {
  it('range-marked VNode accessor: 1 call, adopted, live', () => {
    let calls = 0
    const on = signal(true)
    const { host, dispose } = hydrate('<div><span>a</span><!--$--><b>on</b><!--/$--></div>', () =>
      h('div', null, h('span', null, 'a'), () => {
        calls++
        return on() ? h('b', null, 'on') : h('i', null, 'off')
      }),
    )
    const b = host.querySelector('b')
    expect(calls).toBe(1)
    expect(b?.textContent).toBe('on')
    on.set(false)
    expect(host.querySelector('b')).toBeNull()
    expect(host.querySelector('i')?.textContent).toBe('off')
    dispose()
  })

  it('sole keyed .map accessor: 1 call, keyed list reused on update', () => {
    let calls = 0
    const items = signal([1, 2, 3])
    const { host, dispose } = hydrate('<ul><li>1</li><li>2</li><li>3</li></ul>', () =>
      h('ul', null, () => {
        calls++
        return items().map((i) => h('li', { key: i }, String(i)))
      }),
    )
    expect(calls).toBe(1)
    const li1 = host.querySelectorAll('li')[0]
    items.set([1, 2, 3, 4])
    expect(host.querySelectorAll('li')).toHaveLength(4)
    expect(host.querySelectorAll('li')[0]).toBe(li1)
    dispose()
  })

  it('reactive text between elements: 1 call, the server text node is updated in place', () => {
    let calls = 0
    const n = signal(1)
    const { host, dispose } = hydrate('<p><b>x</b><!--$-->1<!--/$--><i>y</i></p>', () =>
      h('p', null, h('b', null, 'x'), () => {
        calls++
        return n()
      }, h('i', null, 'y')),
    )
    expect(calls).toBe(1)
    const text = [...host.querySelector('p')!.childNodes].find((c) => c.nodeType === 3)
    n.set(2)
    expect(host.querySelector('p')!.textContent).toBe('x2y')
    expect(text?.textContent).toBe('2')
    dispose()
  })
})
