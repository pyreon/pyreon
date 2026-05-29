/**
 * @vitest-environment happy-dom
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { createIcon, createNamedIcon, Icon } from '../icon'

// Real-`h()` mount tests (test-environment-parity rule): exercise the actual
// Icon / createIcon components through the real runtime, not a mock vnode.
// Icon renders a FULL loaded svg (component form OR raw-markup string) — the
// only meaningful coverage is mounting it and reading the produced DOM.

let container: HTMLElement

afterEach(() => {
  container?.remove()
})

function render(vnode: unknown): HTMLElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  mount(vnode as never, container)
  return container
}

// A stand-in for an imported `./x.svg?component` — a real, complete <svg>.
const StarSvg = (props: Record<string, unknown>) =>
  h('svg', { viewBox: '0 0 10 10', ...props }, h('path', { d: 'M5 0 6 4Z' }))

const RAW = '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="4"></circle></svg>'

describe('Icon — component form (`as`)', () => {
  it('renders the imported SVG directly, no host wrapper', () => {
    const root = render(h(Icon, { as: StarSvg }))
    const svg = root.querySelector('svg')
    expect(svg).toBeTruthy()
    // Rendered directly into the container — the <svg> IS the root.
    expect(svg?.parentElement).toBe(container)
    expect(root.querySelector('span')).toBeNull()
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M5 0 6 4Z')
  })

  it('applies the container-fill + currentColor defaults', () => {
    const svg = render(h(Icon, { as: StarSvg })).querySelector('svg')
    expect(svg?.getAttribute('fill')).toBe('currentColor')
    expect(svg?.getAttribute('style')).toBe('display: block; width: 100%; height: 100%;')
    // The svg's own viewBox survives (not clobbered by Icon).
    expect(svg?.getAttribute('viewBox')).toBe('0 0 10 10')
  })

  it('consumer props pass through and override the defaults', () => {
    const svg = render(
      h(Icon, { as: StarSvg, class: 'brand', fill: 'none', 'aria-label': 'star' }),
    ).querySelector('svg')
    expect(svg?.getAttribute('class')).toBe('brand')
    expect(svg?.getAttribute('fill')).toBe('none')
    expect(svg?.getAttribute('aria-label')).toBe('star')
  })
})

describe('Icon — raw-markup form (`svg`)', () => {
  it('inlines the full loaded svg inside a single <span> host', () => {
    const root = render(h(Icon, { svg: RAW }))
    const span = root.querySelector('span')
    expect(span?.parentElement).toBe(container)
    const svg = span?.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 8 8')
    expect(svg?.querySelector('circle')?.getAttribute('r')).toBe('4')
  })

  it('the host carries the fill default + consumer pass-through props', () => {
    const span = render(
      h(Icon, { svg: RAW, class: 'icon-host', 'aria-hidden': 'true' }),
    ).querySelector('span')
    expect(span?.getAttribute('style')).toBe('display: block; width: 100%; height: 100%;')
    expect(span?.getAttribute('class')).toBe('icon-host')
    expect(span?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('Icon — no source', () => {
  it('renders nothing when neither `as` nor `svg` is given', () => {
    const root = render(h(Icon, null))
    expect(root.querySelector('svg')).toBeNull()
    expect(root.querySelector('span')).toBeNull()
  })
})

describe('createIcon — reusable loaded glyph', () => {
  it('from a raw-markup string → renders the full svg via <Icon>', () => {
    const Check = createIcon(RAW)
    const root = render(h(Check, { class: 'c' }))
    const svg = root.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 8 8')
    expect(root.querySelector('span')?.getAttribute('class')).toBe('c')
  })

  it('from an imported SVG component → renders it directly + forwards props', () => {
    const Star = createIcon(StarSvg)
    const svg = render(h(Star, { 'aria-label': 'star', fill: 'gold' })).querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toBe('star')
    expect(svg?.getAttribute('fill')).toBe('gold')
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M5 0 6 4Z')
  })
})

describe('createNamedIcon — typed set runtime', () => {
  const RAW_A = '<svg viewBox="0 0 4 4"><rect width="4" height="4"></rect></svg>'
  const RAW_B = '<svg viewBox="0 0 6 6"><circle r="3"></circle></svg>'

  it('inline mode: name → raw svg inlined via <Icon> (one <span> host)', () => {
    const Icon = createNamedIcon({ box: RAW_A, dot: RAW_B })
    const root = render(h(Icon, { name: 'dot', class: 'x' }))
    const svg = root.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 6 6')
    expect(svg?.querySelector('circle')?.getAttribute('r')).toBe('3')
    expect(root.querySelector('span')?.getAttribute('class')).toBe('x')
  })

  it('inline mode: switching name resolves the other entry', () => {
    const Icon = createNamedIcon({ box: RAW_A, dot: RAW_B })
    const svg = render(h(Icon, { name: 'box' })).querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 4 4')
    expect(svg?.querySelector('rect')).toBeTruthy()
  })

  it('image mode: name → <img> with the asset URL, original colors, no svg mutation', () => {
    const Icon = createNamedIcon(
      { logo: '/assets/logo.svg', mark: '/assets/mark.svg' },
      { mode: 'image' },
    )
    const root = render(h(Icon, { name: 'logo', class: 'brand' }))
    const img = root.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/assets/logo.svg')
    expect(img?.getAttribute('alt')).toBe('')
    expect(img?.getAttribute('class')).toBe('brand')
    expect(root.querySelector('svg')).toBeNull()
  })

  it('image mode: alt prop is forwarded onto the <img>', () => {
    const Icon = createNamedIcon({ logo: '/l.svg' }, { mode: 'image' })
    const img = render(h(Icon, { name: 'logo', alt: 'Company logo' })).querySelector('img')
    expect(img?.getAttribute('alt')).toBe('Company logo')
  })
})
