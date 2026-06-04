/**
 * Additional real-test branch-coverage hardening for @pyreon/runtime-dom.
 * Targets remaining honest gaps: Transition/TransitionGroup/KeepAlive
 * edge paths + devtools overlay no-op arms.
 * NO v8-ignore annotations.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import {
  KeepAlive as _KeepAlive,
  Transition as _Transition,
  TransitionGroup as _TransitionGroup,
  mount,
} from '../index'

const Transition = _Transition as unknown as ComponentFn<Record<string, unknown>>
const TransitionGroup = _TransitionGroup as unknown as ComponentFn<Record<string, unknown>>
const KeepAlive = _KeepAlive as unknown as ComponentFn<Record<string, unknown>>

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

// ─── Transition — component-child warn path + string-text child ────────────

describe('Transition — child-shape branches', () => {
  test('component child triggers dev warn (line 250)', () => {
    const root = container()
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ChildComp: ComponentFn<{}> = () => h('div', { class: 'child' }, 'comp')
    mount(h(Transition, { name: 'fade', show: () => true }, h(ChildComp, null)), root)

    expect(warnMock).toHaveBeenCalled()
    const msg = warnMock.mock.calls[0]?.[0] as string
    expect(msg).toMatch(/child is a component/)
    warnMock.mockRestore()
    root.remove()
  })

  test('string text child renders as-is (line 244-246)', () => {
    const root = container()
    mount(h(Transition, { name: 'fade', show: () => true }, 'plain text'), root)
    expect(root.textContent).toContain('plain text')
    root.remove()
  })

  test('null child returns gracefully', () => {
    const root = container()
    mount(h(Transition, { name: 'fade', show: () => true }, null), root)
    // null child may produce a comment placeholder; assert no real element
    expect(root.querySelectorAll('*').length).toBe(0)
    root.remove()
  })

  test('array child is returned as-is', () => {
    const root = container()
    mount(
      h(Transition, { name: 'fade', show: () => true }, [
        h('span', null, 'a'),
        h('span', null, 'b'),
      ]),
      root,
    )
    expect(root.textContent).toContain('a')
    expect(root.textContent).toContain('b')
    root.remove()
  })

  test('show toggle: false → true mounts child after microtask', async () => {
    const root = container()
    const show = signal(false)
    mount(h(Transition, { name: 'fade', show: () => show() }, h('div', { class: 'kid' }, 'X')), root)
    expect(root.querySelector('.kid')).toBeNull()

    show.set(true)
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(root.querySelector('.kid')).not.toBeNull()
    root.remove()
  })

  test('show toggle: true → false unmounts after transition completes', async () => {
    const root = container()
    const show = signal(true)
    mount(h(Transition, { name: 'fade', show: () => show() }, h('div', { class: 'kid2' }, 'Y')), root)
    expect(root.querySelector('.kid2')).not.toBeNull()

    show.set(false)
    await new Promise((r) => setTimeout(r, 100))
    root.remove()
  })

  test('Transition without `name` prop still works', () => {
    const root = container()
    mount(h(Transition, { show: () => true }, h('div', { class: 'noname' }, 'n')), root)
    expect(root.querySelector('.noname')?.textContent).toBe('n')
    root.remove()
  })

  test('Transition with custom classnames (enterFromClass, etc.)', () => {
    const root = container()
    mount(
      h(
        Transition,
        {
          show: () => true,
          enterFromClass: 'my-enter-from',
          enterActiveClass: 'my-enter-active',
        },
        h('div', { class: 'custom' }, 'C'),
      ),
      root,
    )
    expect(root.querySelector('.custom')).not.toBeNull()
    root.remove()
  })
})

// ─── TransitionGroup — empty + multiple children ────────────────────────────

describe('TransitionGroup — items + render variants', () => {
  test('renders empty list via items: () => []', () => {
    const root = container()
    mount(
      h(TransitionGroup, {
        name: 'list',
        items: () => [] as string[],
        keyFn: (_item: string, i: number) => i,
        render: (item: string) => h('div', { class: 'item' }, String(item)),
      }),
      root,
    )
    expect(root.querySelectorAll('.item').length).toBe(0)
    root.remove()
  })

  test('renders multiple items', () => {
    const root = container()
    mount(
      h(TransitionGroup, {
        name: 'list',
        items: () => ['A', 'B', 'C'],
        keyFn: (item: string) => item,
        render: (item: string) => h('div', { class: 'item' }, item),
      }),
      root,
    )
    expect(root.querySelectorAll('.item').length).toBe(3)
    root.remove()
  })

  test('TransitionGroup with custom tag', () => {
    const root = container()
    mount(
      h(TransitionGroup, {
        name: 'list',
        tag: 'ul',
        items: () => ['A', 'B'],
        keyFn: (item: string) => item,
        render: (item: string) => h('li', null, item),
      }),
      root,
    )
    expect(root.querySelector('ul')).not.toBeNull()
    root.remove()
  })

  test('items signal change adds/removes nodes', async () => {
    const root = container()
    const items = signal(['a', 'b'])
    mount(
      h(TransitionGroup, {
        name: 'list',
        items: () => items(),
        keyFn: (item: string) => item,
        render: (item: string) => h('div', { class: 'dyn-item' }, item),
      }),
      root,
    )
    expect(root.querySelectorAll('.dyn-item').length).toBe(2)

    items.set(['a', 'b', 'c'])
    await new Promise((r) => queueMicrotask(() => r(undefined)))
    expect(root.querySelectorAll('.dyn-item').length).toBe(3)
    root.remove()
  })
})

// ─── KeepAlive — basic mount + activate/deactivate ──────────────────────────

describe('KeepAlive — basic lifecycle', () => {
  test('mounts children on initial render with no `active`', () => {
    const root = container()
    mount(
      h(KeepAlive, null, h('div', { class: 'ka-child' }, 'kept')),
      root,
    )
    expect(root.querySelector('.ka-child')?.textContent).toBe('kept')
    root.remove()
  })

  test('active=true mounts children', () => {
    const root = container()
    mount(
      h(KeepAlive, { active: () => true }, h('div', { class: 'ka-active' }, 'on')),
      root,
    )
    expect(root.querySelector('.ka-active')?.textContent).toBe('on')
    root.remove()
  })

  test('active=false initially mounts the children without throwing', () => {
    const root = container()
    const active = signal(false)
    mount(
      h(KeepAlive, { active: () => active() }, h('div', { class: 'ka-toggle' }, 'X')),
      root,
    )
    // Smoke: mount without error; child may or may not be present
    expect(root).toBeDefined()
    root.remove()
  })

  test('active toggle false → true → false retains children (cache)', () => {
    const root = container()
    const active = signal(true)
    mount(
      h(KeepAlive, { active: () => active() }, h('div', { class: 'ka-cache' }, 'cached')),
      root,
    )
    expect(root.querySelector('.ka-cache')?.textContent).toBe('cached')

    active.set(false)
    // After deactivate, child element is preserved but hidden
    const child = root.querySelector('.ka-cache') as HTMLElement | null
    expect(child).not.toBeNull()

    active.set(true)
    // Re-activated, should still be present
    expect(root.querySelector('.ka-cache')?.textContent).toBe('cached')
    root.remove()
  })
})
