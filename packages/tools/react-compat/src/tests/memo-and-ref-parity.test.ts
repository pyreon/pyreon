// React parity: `memo` must never skip a render the component asked for
// itself, and `useRef()` starts at `undefined`.
import { mount } from '@pyreon/runtime-dom'
import { createContext, memo, useContext, useRef, useState } from '../index'
import { jsx } from '../jsx-runtime'

// oxlint-disable-next-line typescript/no-unsafe-function-type -- test helper accepts any component shape
const j = (type: string | Function, props: Record<string, unknown>, ...children: unknown[]) =>
  jsx(type as Parameters<typeof jsx>[0], (children.length ? { ...props, children: children.length === 1 ? children[0] : children } : props) as never)

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('memo — self-triggered renders are never skipped', () => {
  test('a memo component re-renders on its own useState update', async () => {
    let setN!: (n: number) => void
    const Counter = memo((props: { label: string }) => {
      const [n, s] = useState(0)
      setN = s
      return j('span', {}, props.label, ':', String(n))
    })
    const el = container()
    mount(j(Counter, { label: 'x' }), el)
    expect(el.textContent).toBe('x:0')

    setN(1)
    await flush()
    expect(el.textContent).toBe('x:1')
    setN(2)
    await flush()
    expect(el.textContent).toBe('x:2')
  })

  test('a memo component re-renders when the context it reads changes', async () => {
    const Ctx = createContext('a')
    let setV!: (v: string) => void
    const Reader = memo((_props: { k: number }) => j('b', {}, useContext(Ctx)))
    const App = () => {
      const [v, s] = useState('a')
      setV = s
      return j(Ctx.Provider, { value: v }, j(Reader, { k: 1 }))
    }
    const el = container()
    mount(j(App, {}), el)
    expect(el.textContent).toBe('a')
    setV('b')
    await flush()
    expect(el.textContent).toBe('b')
  })
})

describe('useRef', () => {
  test('useRef() starts at undefined, so the lazy-init idiom works', () => {
    let created = 0
    let seen: unknown = 'unset'
    const C = () => {
      const ref = useRef<{ id: number }>()
      if (ref.current === undefined) ref.current = { id: ++created }
      seen = ref.current
      return null
    }
    mount(j(C, {}), container())
    expect(created).toBe(1)
    expect(seen).toEqual({ id: 1 })
  })

  test('useRef(null) and useRef(value) keep their initial value', () => {
    let seen: unknown[] = []
    const C = () => {
      seen = [useRef(null).current, useRef(0).current, useRef(undefined).current]
      return null
    }
    mount(j(C, {}), container())
    expect(seen).toEqual([null, 0, undefined])
  })
})
