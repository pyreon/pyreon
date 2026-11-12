import { afterEach, describe, expect, it } from 'vitest'
import { useState } from '../hooks'
import { createElement, h, render } from '../index'
import { jsx } from '../jsx-runtime'

// Preact apps build trees with `h()` as often as with JSX. `h` / `createElement`
// were core's raw `h()`, so a component built with them skipped the compat hook
// wrapper and threw "[Pyreon] Hook called outside of a component render".

const tick = () => new Promise<void>((r) => setTimeout(r, 10))
afterEach(() => {
  document.body.innerHTML = ''
})

function Counter() {
  const [n, setN] = useState(0)
  return h('button', { onClick: () => setN(n + 1) }, `count ${n}`)
}

describe('preact-compat h wraps components like JSX', () => {
  it('render(h(App), el): a hook-using root renders and updates', async () => {
    const el = document.body.appendChild(document.createElement('div'))
    render(h(Counter, null), el)
    await tick()
    expect(el.textContent).toBe('count 0')
    el.querySelector('button')!.click()
    await tick()
    expect(el.textContent).toBe('count 1')
  })

  it('h and createElement are the same factory, matching jsx()', () => {
    expect(createElement).toBe(h)
    expect(h(Counter, null).type).toBe(jsx(Counter, {}).type)
  })
})
