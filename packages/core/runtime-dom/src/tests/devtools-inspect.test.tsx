/**
 * #4446: the devtools hook exposes, on request, a mounted component's props
 * (`getComponentProps(id)`, a shallow bounded preview) and the reactive nodes
 * it owns (`reactive.nodesForComponent(id)`, graph node ids). Neither is
 * stored as a snapshot: the props preview is computed per call from the live
 * props object, and the registry's reference to that object and to the
 * component scope is dropped when the component unmounts. The retention proof
 * needs `--expose-gc` (wired in the package vitest config).
 */
import { _rp, h, onMount } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { _devInspectable, registerComponent, unregisterComponent } from '../devtools'
import { mount } from '../index'

interface Owned {
  id: number
  name: string
  kind: string
}
interface Hook {
  getAllComponents(): { id: string; name: string }[]
  getComponentProps(id: string): Record<string, string> | null
  reactive: {
    activate(): void
    nodesForComponent(id: string): Owned[]
    getGraph(): { nodes: { id: number }[] }
  }
}
const hook = (): Hook =>
  (globalThis as unknown as { __PYREON_DEVTOOLS__: Hook }).__PYREON_DEVTOOLS__
const idOf = (name: string): string => {
  const e = hook()
    .getAllComponents()
    .find((c) => c.name === name)
  if (!e) throw new Error(`[test] no registered component named ${name}`)
  return e.id
}

function host(): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

describe('getComponentProps — a preview computed on request', () => {
  it('previews each prop like a graph value; reactive props show their current value', () => {
    const count = signal(1)
    function Card(props: {
      title: string
      count: number
      tags: string[]
      onPick: () => void
      meta: object
    }) {
      return h('div', null, () => String(props.count))
    }
    function onPick() {}
    const dispose = mount(
      h(Card, {
        title: 'Inbox',
        count: _rp(() => count()) as unknown as number,
        tags: ['a', 'b'],
        onPick,
        meta: { a: 1 },
      }),
      host(),
    )
    // `count` is an `_rp` thunk, the shape the compiler gives a reactive prop,
    // so it reaches the component as a getter.
    const id = idOf('Card')
    const first = hook().getComponentProps(id)!
    expect(first.count).toBe('1')
    expect(first.title).toBe('"Inbox"')
    expect(first.tags).toBe('Array(2)')
    expect(first.onPick).toBe('[Function onPick]')
    expect(first.meta).toBe('{a}')
    count.set(7)
    // Not a stored snapshot: the next call reads the live value.
    expect(hook().getComponentProps(id)!.count).toBe('7')
    dispose()
  })

  it('reads reactive props without tracking', () => {
    const n = signal(1)
    function P(props: { n: number }) {
      return h('i', null, () => String(props.n))
    }
    const dispose = mount(h(P, { n: _rp(() => n()) as unknown as number }), host())
    const id = idOf('P')
    let runs = 0
    const stop = effect(() => {
      runs++
      hook().getComponentProps(id)
    })
    n.set(2)
    expect(runs).toBe(1)
    stop.dispose()
    dispose()
  })

  it('bounds the preview: 60 characters per value, 50 props, a throwing getter is reported', () => {
    const props: Record<string, unknown> = { long: 'x'.repeat(500) }
    for (let i = 0; i < 80; i++) props[`p${i}`] = i
    Object.defineProperty(props, 'bad', {
      enumerable: true,
      get() {
        throw new Error('boom')
      },
    })
    registerComponent('inspect-bounds', 'Bounds', null, null)
    _devInspectable('inspect-bounds', null as never, props)
    try {
      const out = hook().getComponentProps('inspect-bounds')!
      expect(out.long!.length).toBeLessThanOrEqual(61)
      expect(Object.keys(out)).toHaveLength(50)
    } finally {
      unregisterComponent('inspect-bounds')
    }
    const bad: Record<string, unknown> = {}
    Object.defineProperty(bad, 'bad', {
      enumerable: true,
      get() {
        throw new Error('boom')
      },
    })
    registerComponent('inspect-bad', 'Bad', null, null)
    _devInspectable('inspect-bad', null as never, bad)
    try {
      expect(hook().getComponentProps('inspect-bad')).toEqual({ bad: '[threw]' })
    } finally {
      unregisterComponent('inspect-bad')
    }
  })

  it('null for an unknown id and after unmount; an unregistered id is never recorded', () => {
    function Gone(props: { a: number }) {
      return h('b', null, String(props.a))
    }
    const dispose = mount(h(Gone, { a: 1 }), host())
    const id = idOf('Gone')
    expect(hook().getComponentProps(id)).toEqual({ a: '1' })
    dispose()
    expect(hook().getComponentProps(id)).toBeNull()
    expect(hook().getComponentProps('nope')).toBeNull()
    _devInspectable('never-registered', null as never, { a: 1 })
    expect(hook().getComponentProps('never-registered')).toBeNull()
  })
})

describe('reactive.nodesForComponent — owned signals, computeds and effects', () => {
  it('lists what the component created in setup and onMount, not its children', () => {
    function Child() {
      const childSig = signal(0, { name: 'childSig' })
      return h('i', null, () => String(childSig()))
    }
    function Owner() {
      const draft = signal('', { name: 'draft' })
      const len = computed(() => draft().length)
      effect(() => {
        len()
      })
      onMount(() => {
        effect(() => {
          draft()
        })
      })
      return h('div', null, h(Child, null))
    }
    const dispose = mount(h(Owner, null), host())
    const owned = hook().reactive.nodesForComponent(idOf('Owner'))
    expect(owned.map((n) => n.kind)).toEqual(['signal', 'derived', 'effect', 'effect'])
    expect(owned[0]!.name).toBe('draft')
    expect(owned.some((n) => n.name === 'childSig')).toBe(false)
    expect(
      hook()
        .reactive.nodesForComponent(idOf('Child'))
        .map((n) => n.name),
    ).toEqual(['childSig'])
    // Ids are graph node ids (the graph reads empty until a client activates it).
    hook().reactive.activate()
    const graphIds = new Set(
      hook()
        .reactive.getGraph()
        .nodes.map((n) => n.id),
    )
    for (const n of owned) expect(graphIds.has(n.id)).toBe(true)
    const ownerId = idOf('Owner')
    dispose()
    expect(hook().reactive.nodesForComponent(ownerId)).toEqual([])
  })

  it('[] for an unknown id', () => {
    expect(hook().reactive.nodesForComponent('nope')).toEqual([])
  })
})

const hasGc = typeof globalThis.gc === 'function'

describe.skipIf(!hasGc)('no retention after unmount', () => {
  it('the registry lets go of the props object and the scope when the component unmounts', async () => {
    let propsRef: WeakRef<object> | undefined
    const dispose = (() => {
      function Heavy(props: { data: number[] }) {
        propsRef = new WeakRef(props)
        return h('p', null, String(props.data.length))
      }
      return mount(h(Heavy, { data: new Array(1000).fill(0) }), host())
    })()
    dispose()
    document.body.innerHTML = ''
    globalThis.gc!()
    await new Promise((r) => setTimeout(r, 0))
    globalThis.gc!()
    expect(propsRef!.deref()).toBeUndefined()
  })
})
