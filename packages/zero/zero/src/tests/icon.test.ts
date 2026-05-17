/**
 * @vitest-environment happy-dom
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { createIcon, Icon } from '../icon'

// Real-`h()` mount tests (test-environment-parity rule): exercise the actual
// Icon / createIcon components through the real runtime, not a mock vnode.
// Icon has no extractable pure logic — its entire contract is "render a plain
// <svg>, defaults overridable by spread, children passed through" — so the
// only meaningful coverage is mounting it and reading the produced DOM.

let container: HTMLElement

afterEach(() => {
  container?.remove()
})

function render(vnode: unknown): SVGElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  mount(vnode as never, container)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('expected an <svg> root')
  return svg
}

describe('Icon — defaults', () => {
  it('renders a plain <svg> as the root (no wrapper element)', () => {
    const svg = render(h(Icon, null))
    expect(svg.parentElement).toBe(container)
    expect(container.children).toHaveLength(1)
  })

  it('applies the container-filling defaults', () => {
    const svg = render(h(Icon, null))
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('fill')).toBe('currentColor')
    // runtime-dom normalizes inline style strings (spaces after `:`, trailing `;`).
    expect(svg.getAttribute('style')).toBe('display: block; width: 100%; height: 100%;')
  })

  it('renders children inside the <svg>', () => {
    const svg = render(h(Icon, null, h('path', { d: 'M20 6 9 17l-5-5' })))
    const path = svg.querySelector('path')
    expect(path?.getAttribute('d')).toBe('M20 6 9 17l-5-5')
  })
})

describe('Icon — props pass through and override defaults', () => {
  it('a passed viewBox overrides the default', () => {
    const svg = render(h(Icon, { viewBox: '0 0 16 16' }))
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16')
  })

  it('class / aria-label / fill pass straight through', () => {
    const svg = render(
      h(Icon, { class: 'text-green-600', 'aria-label': 'done', fill: 'none' }),
    )
    expect(svg.getAttribute('class')).toBe('text-green-600')
    expect(svg.getAttribute('aria-label')).toBe('done')
    expect(svg.getAttribute('fill')).toBe('none')
  })

  it('a passed style overrides the default sizing style', () => {
    const svg = render(h(Icon, { style: 'width:2rem' }))
    expect(svg.getAttribute('style')).toBe('width: 2rem;')
  })
})

describe('createIcon — reusable glyph component', () => {
  it('bakes in the viewBox + paths, still a plain container-filling <svg>', () => {
    const Check = createIcon('0 0 24 24', h('path', { d: 'M20 6 9 17l-5-5' }))
    const svg = render(h(Check, null))
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('fill')).toBe('currentColor')
    expect(svg.querySelector('path')?.getAttribute('d')).toBe('M20 6 9 17l-5-5')
  })

  it('forwards consumer props onto the rendered <svg>', () => {
    const Logo = createIcon('0 0 32 32', h('circle', { cx: 16, cy: 16, r: 8 }))
    const svg = render(h(Logo, { class: 'brand', 'aria-hidden': 'true' }))
    expect(svg.getAttribute('class')).toBe('brand')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('circle')?.getAttribute('r')).toBe('8')
  })
})
