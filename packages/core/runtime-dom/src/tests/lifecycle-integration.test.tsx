import { defineComponent, For, Fragment, h, onMount, onUnmount, Show } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '../index'

// ─── Helpers ────────────────────────────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

// ─── Show toggle ────────────────────────────────────────────────────────────

describe('lifecycle — Show toggle', () => {
  test('show=true — child mounts, signal reactive', () => {
    const el = container()
    const text = signal('hello')
    mount(
      h(Show, { when: () => true }, h('div', null, () => text())),
      el,
    )
    expect(el.textContent).toBe('hello')
    text.set('world')
    expect(el.textContent).toBe('world')
  })

  test('show=false — child unmounts', () => {
    const el = container()
    const visible = signal(false)
    mount(
      h(Show, { when: visible }, h('div', { id: 'child' }, 'content')),
      el,
    )
    expect(el.querySelector('#child')).toBeNull()
  })

  test('show=true again — fresh mount, signal still reactive', () => {
    const el = container()
    const visible = signal(true)
    const text = signal('initial')
    mount(
      h(Show, { when: visible }, h('div', { id: 'child' }, () => text())),
      el,
    )
    expect(el.querySelector('#child')?.textContent).toBe('initial')

    // Hide
    visible.set(false)
    expect(el.querySelector('#child')).toBeNull()

    // Show again
    visible.set(true)
    expect(el.querySelector('#child')).not.toBeNull()

    // Signal should still be reactive in new mount
    text.set('updated')
    expect(el.querySelector('#child')?.textContent).toBe('updated')
  })

  test('rapid toggle (true -> false -> true) — no duplicate effects', () => {
    const el = container()
    const visible = signal(true)
    let mountCount = 0

    const Child = defineComponent(() => {
      mountCount++
      return h('div', null, 'child')
    })

    mount(h(Show, { when: visible }, h(Child, null)), el)
    expect(mountCount).toBe(1)

    // Rapid toggle
    visible.set(false)
    visible.set(true)
    // After rapid toggle, component should be mounted exactly once more
    expect(mountCount).toBe(2)

    visible.set(false)
    visible.set(true)
    expect(mountCount).toBe(3)
  })
})

// ─── For list ───────────────────────────────────────────────────────────────

describe('lifecycle — For list', () => {
  type Item = { id: number; label: string }

  test('render list of 3 items — 3 DOM nodes', () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: 'Alice' },
      { id: 2, label: 'Bob' },
      { id: 3, label: 'Charlie' },
    ])
    mount(
      h(
        'ul',
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h('li', { key: r.id }, r.label) }),
      ),
      el,
    )
    expect(el.querySelectorAll('li').length).toBe(3)
    expect(el.querySelectorAll('li')[0]?.textContent).toBe('Alice')
    expect(el.querySelectorAll('li')[1]?.textContent).toBe('Bob')
    expect(el.querySelectorAll('li')[2]?.textContent).toBe('Charlie')
  })

  test('add item — 4 DOM nodes, existing unchanged', () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: 'Alice' },
      { id: 2, label: 'Bob' },
      { id: 3, label: 'Charlie' },
    ])
    mount(
      h(
        'ul',
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h('li', { key: r.id }, r.label) }),
      ),
      el,
    )
    const firstLi = el.querySelectorAll('li')[0]

    items.set([...items(), { id: 4, label: 'Dave' }])
    expect(el.querySelectorAll('li').length).toBe(4)
    expect(el.querySelectorAll('li')[3]?.textContent).toBe('Dave')
    // Existing nodes should be reused (same DOM identity)
    expect(el.querySelectorAll('li')[0]).toBe(firstLi)
  })

  test('remove item — 2 DOM nodes', () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: 'Alice' },
      { id: 2, label: 'Bob' },
      { id: 3, label: 'Charlie' },
    ])
    mount(
      h(
        'ul',
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h('li', { key: r.id }, r.label) }),
      ),
      el,
    )
    items.set([{ id: 1, label: 'Alice' }, { id: 3, label: 'Charlie' }])
    expect(el.querySelectorAll('li').length).toBe(2)
    expect(el.querySelectorAll('li')[0]?.textContent).toBe('Alice')
    expect(el.querySelectorAll('li')[1]?.textContent).toBe('Charlie')
  })

  test('update item signal — only that item DOM changes', () => {
    const el = container()
    const items = signal([
      { id: 1, name: signal('Alice') },
      { id: 2, name: signal('Bob') },
    ])
    mount(
      h(
        'ul',
        null,
        For({
          each: items,
          by: (r) => r.id,
          children: (r) => h('li', { key: r.id }, () => r.name()),
        }),
      ),
      el,
    )
    expect(el.querySelectorAll('li')[0]?.textContent).toBe('Alice')

    // Update only the first item's signal
    items()[0]!.name.set('Alicia')
    expect(el.querySelectorAll('li')[0]?.textContent).toBe('Alicia')
    // Second item unchanged
    expect(el.querySelectorAll('li')[1]?.textContent).toBe('Bob')
  })

  test('reorder items — DOM reordered without remount', () => {
    const el = container()
    const r1: Item = { id: 1, label: 'a' }
    const r2: Item = { id: 2, label: 'b' }
    const r3: Item = { id: 3, label: 'c' }
    const items = signal<Item[]>([r1, r2, r3])
    mount(
      h(
        'ul',
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h('li', { key: r.id }, r.label) }),
      ),
      el,
    )
    const origLi1 = el.querySelectorAll('li')[0]
    const origLi2 = el.querySelectorAll('li')[1]
    const origLi3 = el.querySelectorAll('li')[2]

    // Reverse order
    items.set([r3, r2, r1])
    const lis = el.querySelectorAll('li')
    expect(lis[0]?.textContent).toBe('c')
    expect(lis[1]?.textContent).toBe('b')
    expect(lis[2]?.textContent).toBe('a')
    // DOM nodes should be reused (moved, not recreated)
    expect(lis[0]).toBe(origLi3)
    expect(lis[1]).toBe(origLi2)
    expect(lis[2]).toBe(origLi1)
  })
})

// ─── Effect cleanup ─────────────────────────────────────────────────────────

describe('lifecycle — effect cleanup', () => {
  test('effect inside component — runs on mount', () => {
    const el = container()
    let effectRan = false
    const Comp = defineComponent(() => {
      onMount(() => {
        effectRan = true
      })
      return h('div', null, 'mounted')
    })
    mount(h(Comp, null), el)
    expect(effectRan).toBe(true)
  })

  test('unmount component — effect cleaned up (verify via mock)', () => {
    const el = container()
    let cleanupCalled = false
    const Comp = defineComponent(() => {
      onMount(() => {
        return () => {
          cleanupCalled = true
        }
      })
      return h('div', null, 'with-cleanup')
    })
    const unmount = mount(h(Comp, null), el)
    expect(cleanupCalled).toBe(false)

    unmount()
    expect(cleanupCalled).toBe(true)
  })

  test('mount 10 components — unmount all — verify no lingering effects', () => {
    const el = container()
    let cleanupCount = 0
    const totalComponents = 10

    const Comp = defineComponent(() => {
      onUnmount(() => {
        cleanupCount++
      })
      return h('span', null, 'item')
    })

    const unmount = mount(
      h(
        'div',
        null,
        ...Array.from({ length: totalComponents }, (_, i) => h(Comp, { key: i })),
      ),
      el,
    )
    expect(el.querySelectorAll('span').length).toBe(totalComponents)

    unmount()
    expect(cleanupCount).toBe(totalComponents)
  })
})

// ─── Deep nesting ───────────────────────────────────────────────────────────

describe('lifecycle — deep nesting', () => {
  test('4 levels of components with signals — all reactive', () => {
    const el = container()
    const s1 = signal('L1')
    const s2 = signal('L2')
    const s3 = signal('L3')
    const s4 = signal('L4')

    const Level4 = () => h('span', { class: 'l4' }, () => s4())
    const Level3 = () => h('div', { class: 'l3' }, () => s3(), h(Level4, null))
    const Level2 = () => h('div', { class: 'l2' }, () => s2(), h(Level3, null))
    const Level1 = () => h('div', { class: 'l1' }, () => s1(), h(Level2, null))

    mount(h(Level1, null), el)
    expect(el.textContent).toContain('L1')
    expect(el.textContent).toContain('L2')
    expect(el.textContent).toContain('L3')
    expect(el.textContent).toContain('L4')

    s1.set('L1-updated')
    expect(el.textContent).toContain('L1-updated')

    s4.set('L4-updated')
    expect(el.textContent).toContain('L4-updated')

    // Middle levels also reactive
    s2.set('L2-updated')
    s3.set('L3-updated')
    expect(el.textContent).toContain('L2-updated')
    expect(el.textContent).toContain('L3-updated')
  })

  test('unmount root — all nested effects cleaned', () => {
    const el = container()
    let cleanupCount = 0

    const Level4 = defineComponent(() => {
      onUnmount(() => { cleanupCount++ })
      return h('span', null, 'l4')
    })
    const Level3 = defineComponent(() => {
      onUnmount(() => { cleanupCount++ })
      return h('div', null, 'l3', h(Level4, null))
    })
    const Level2 = defineComponent(() => {
      onUnmount(() => { cleanupCount++ })
      return h('div', null, 'l2', h(Level3, null))
    })
    const Level1 = defineComponent(() => {
      onUnmount(() => { cleanupCount++ })
      return h('div', null, 'l1', h(Level2, null))
    })

    const unmount = mount(h(Level1, null), el)
    expect(el.textContent).toContain('l1')
    expect(el.textContent).toContain('l4')

    unmount()
    expect(cleanupCount).toBe(4)
  })
})
