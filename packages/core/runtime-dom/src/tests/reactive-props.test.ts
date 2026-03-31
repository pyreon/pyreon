import { h, splitProps } from '@pyreon/core'
import { _rp } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

describe('reactive component props', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('updates DOM when a reactive prop changes (no remount)', () => {
    const active = signal(false)
    let mountCount = 0

    const Inner = (props: any) => {
      mountCount++
      return h('span', { 'data-active': () => String(props.active) })
    }

    const Outer = () => {
      return h(Inner, { active: _rp(() => active()) })
    }

    mount(h(Outer, null), container)

    expect(mountCount).toBe(1)
    expect(container.querySelector('span')?.getAttribute('data-active')).toBe('false')

    active.set(true)

    // Inner should NOT have remounted — mountCount stays 1
    expect(mountCount).toBe(1)
    expect(container.querySelector('span')?.getAttribute('data-active')).toBe('true')
  })

  it('non-reactive props stay static', () => {
    let value = ''
    const Comp = (props: any) => {
      value = props.label
      return h('span', null, props.label)
    }

    mount(h(Comp, { label: 'hello' }), container)
    expect(value).toBe('hello')
  })

  it('event handlers are NOT wrapped as getters', () => {
    let clicked = false
    const Comp = (props: any) => {
      return h('button', { onClick: props.onClick }, 'click')
    }

    mount(h(Comp, { onClick: () => { clicked = true } }), container)
    container.querySelector('button')?.click()
    expect(clicked).toBe(true)
  })

  it('user accessor props (like Show when) stay as functions', () => {
    let receivedWhen: unknown
    const MyShow = (props: any) => {
      receivedWhen = props.when
      return props.when() ? h('div', null, 'visible') : null
    }

    const show = signal(true)
    mount(h(MyShow, { when: () => show() }), container)

    // when should be a function (NOT converted to getter)
    expect(typeof receivedWhen).toBe('function')
  })

  it('props.x read inside effect tracks the signal', () => {
    const count = signal(0)
    const values: number[] = []

    const Comp = (props: any) => {
      // Read props.count inside a reactive child accessor
      return h('div', null, () => {
        const v = props.count
        values.push(v)
        return String(v)
      })
    }

    mount(h(Comp, { count: _rp(() => count()) }), container)
    expect(container.textContent).toBe('0')

    count.set(5)
    expect(container.textContent).toBe('5')

    count.set(10)
    expect(container.textContent).toBe('10')

    // Values tracked — getter called multiple times proves reactivity
    expect(values.length).toBeGreaterThan(1)
    expect(values[values.length - 1]).toBe(10)
  })

  it('splitProps preserves getter reactivity', () => {
    const active = signal(false)

    const Comp = (props: any) => {
      const [own, rest] = splitProps(props, ['active'])
      // own.active should be a getter — reactive when read in tracked scope
      return h('div', {
        'data-active': () => String(own.active),
        'data-rest': () => JSON.stringify(Object.keys(rest)),
      })
    }

    mount(h(Comp, { active: _rp(() => active()), label: 'test' }), container)
    expect(container.querySelector('div')?.getAttribute('data-active')).toBe('false')

    active.set(true)
    expect(container.querySelector('div')?.getAttribute('data-active')).toBe('true')
  })

  it('VNode prop as single JSX element — stable, not re-created', () => {
    let iconMountCount = 0

    const Icon = (props: any) => {
      iconMountCount++
      return h('i', { 'data-name': () => props.name })
    }

    // Simulate what the compiler produces for:
    // <Wrapper icon={<Icon name={_rp(() => name())} />} />
    // The compiler does NOT wrap the outer JSX — Icon is created once
    // with reactive inner props.
    const name = signal('check')
    const iconVNode = h(Icon, { name: _rp(() => name()) })

    const Wrapper = (props: any) => {
      return h('div', null, props.icon)
    }

    mount(h(Wrapper, { icon: iconVNode }), container)
    expect(iconMountCount).toBe(1)
    expect(container.querySelector('i')?.getAttribute('data-name')).toBe('check')

    name.set('close')
    expect(iconMountCount).toBe(1) // NOT remounted
    expect(container.querySelector('i')?.getAttribute('data-name')).toBe('close')
  })
})
