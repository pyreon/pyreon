import { afterEach, describe, expect, it } from 'vitest'
import { createRoot } from '../dom'
import { createElement, h, useState } from '../index'
import { jsx } from '../jsx-runtime'

// `React.createElement(Comp)` (and the `h` alias) used core's raw `h()`, so a
// component built without JSX skipped the compat hook wrapper: its first
// `useState` threw "[Pyreon] Hook called outside of a component render".

const tick = () => new Promise<void>((r) => setTimeout(r, 10))
afterEach(() => {
  document.body.innerHTML = ''
})

function Counter(props: { start?: number }) {
  const [n, setN] = useState(props.start ?? 0)
  return createElement('button', { onClick: () => setN(n + 1) }, `count ${n}`)
}

describe('react-compat createElement wraps components like JSX', () => {
  it('a hook-using component built with createElement renders and updates', async () => {
    const el = document.body.appendChild(document.createElement('div'))
    createRoot(el).render(createElement(Counter, { start: 5 }))
    await tick()
    expect(el.textContent).toBe('count 5')
    el.querySelector('button')!.click()
    await tick()
    expect(el.textContent).toBe('count 6')
  })

  it('h is createElement, and both build the same type as jsx()', () => {
    expect(h).toBe(createElement)
    expect(createElement(Counter, null).type).toBe(jsx(Counter, {}).type)
  })

  it('key comes out of props; positional children become props.children for a component', () => {
    let seen: unknown
    const Box = (p: { children?: unknown }) => {
      seen = p.children
      return null
    }
    const vnode = createElement(Box, { key: 'b' }, 'x', 'y')
    expect(vnode.key).toBe('b')
    const el = document.body.appendChild(document.createElement('div'))
    createRoot(el).render(vnode)
    expect(seen).toEqual(['x', 'y'])
  })
})
