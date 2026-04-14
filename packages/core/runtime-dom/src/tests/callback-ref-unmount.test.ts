import { h } from '@pyreon/core'
import { mount } from '../index'

describe('callback refs — called with null on unmount', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('invokes the callback with the element on mount and null on unmount', () => {
    const calls: Array<Element | null> = []
    const myRef = (el: Element | null) => {
      calls.push(el)
    }

    const dispose = mount(h('div', { ref: myRef }), container)

    expect(calls.length).toBe(1)
    expect(calls[0]).toBe(container.querySelector('div'))

    dispose()

    expect(calls.length).toBe(2)
    expect(calls[1]).toBe(null)
  })

  it('invokes the callback with null when a nested element unmounts', () => {
    const calls: Array<Element | null> = []
    const myRef = (el: Element | null) => {
      calls.push(el)
    }

    const dispose = mount(
      h('section', null, h('div', { ref: myRef })),
      container,
    )

    expect(calls.length).toBe(1)
    expect(calls[0]?.tagName).toBe('DIV')

    dispose()

    expect(calls.length).toBe(2)
    expect(calls[1]).toBe(null)
  })
})
