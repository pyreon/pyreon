/**
 * `_slot` — the SSR compile's range for a fixed child on a client `<!>`
 * placeholder (#4385 case D). `renderNode` brackets exactly the children that
 * are functions, so `_slot` must hand back ONE function: an accessor around a
 * plain value, the value itself when it already is one (never a second level,
 * which would render two ranges where the client expects one).
 */
import { _slot, h } from '../index'

describe('_slot', () => {
  it('wraps a plain value in an accessor that returns it unchanged', () => {
    const vnode = h('b', null, 'x')
    for (const v of ['s', 0, null, undefined, false, vnode, ['a', vnode]]) {
      const acc = _slot(v)
      expect(typeof acc).toBe('function')
      expect(acc()).toBe(v)
    }
  })

  it('passes a function value through, so it renders as one range', () => {
    const fn = () => 'f'
    expect(_slot(fn)).toBe(fn)
  })
})
