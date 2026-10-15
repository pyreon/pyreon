/**
 * Reactive text bindings compare an update against the string they last
 * wrote, not against `node.data` read back from the DOM. The read-back cost a
 * DOM call and a fresh string on every update (measured ~5% of the dbmon tick).
 *
 * Each binding still reads the node ONCE, on its first run, so a
 * hydration-adopted node whose server text already matches is not rewritten.
 */
import { signal } from '@pyreon/reactivity'
import { bindPolymorphicText } from '../mount'
import { _bindText } from '../template'

/** Count reads and writes of one Text node's `data`, delegating to the real accessor. */
function instrument(node: Text): { reads: number; writes: number } {
  const counts = { reads: 0, writes: 0 }
  let proto: object | null = Object.getPrototypeOf(node)
  let desc: PropertyDescriptor | undefined
  while (proto !== null && desc === undefined) {
    desc = Object.getOwnPropertyDescriptor(proto, 'data')
    proto = Object.getPrototypeOf(proto)
  }
  if (!desc?.get || !desc.set) throw new Error('Text.data accessor not found')
  const { get, set } = desc
  Object.defineProperty(node, 'data', {
    configurable: true,
    get() {
      counts.reads++
      return get.call(node)
    },
    set(v: string) {
      counts.writes++
      set.call(node, v)
    },
  })
  return counts
}

function textIn(initial: string): Text {
  const host = document.createElement('div')
  const node = document.createTextNode(initial)
  host.appendChild(node)
  return node
}

describe('text bindings do not read node.data back on update', () => {
  it('_bindText fast path (signal source)', () => {
    const node = textIn('')
    const counts = instrument(node)
    const s = signal('a')
    const dispose = _bindText(s, node)
    for (let i = 0; i < 10; i++) s.set(`v${i}`)
    expect(node.textContent).toBe('v9')
    expect(counts.reads).toBe(1)
    expect(counts.writes).toBe(11)
    dispose()
  })

  it('_bindText slow path (bare callable)', () => {
    const node = textIn('')
    const counts = instrument(node)
    const s = signal(0)
    const dispose = _bindText(() => s() * 2, node)
    for (let i = 1; i <= 10; i++) s.set(i)
    expect(node.textContent).toBe('20')
    expect(counts.reads).toBe(1)
    expect(counts.writes).toBe(11)
    dispose()
  })

  it('bindPolymorphicText (generic accessor)', () => {
    const node = textIn('')
    const counts = instrument(node)
    const s = signal('x')
    const dispose = bindPolymorphicText(() => `${s()}!`, node, node.parentNode as Node)
    for (let i = 0; i < 10; i++) s.set(`y${i}`)
    expect(node.textContent).toBe('y9!')
    expect(counts.reads).toBe(1)
    expect(counts.writes).toBe(11)
    dispose()
  })

  it('an adopted node whose text already matches is not rewritten', () => {
    const node = textIn('ready')
    const counts = instrument(node)
    const s = signal('ready')
    const dispose = _bindText(s, node)
    expect(counts.writes).toBe(0)
    s.set('next')
    expect(node.textContent).toBe('next')
    expect(counts.writes).toBe(1)
    dispose()
  })

  it('values that stringify the same are not rewritten', () => {
    const node = textIn('')
    const counts = instrument(node)
    const s = signal<string | number>(1)
    const dispose = _bindText(s, node)
    s.set('1')
    expect(node.textContent).toBe('1')
    expect(counts.writes).toBe(1)
    dispose()
  })
})
