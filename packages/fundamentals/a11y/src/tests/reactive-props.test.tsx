import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { LiveRegion, SkipLink, VisuallyHidden } from '../index'

// The compiler lowers `<LiveRegion politeness={mode()} aria-label={l()}>` to
// GETTER-backed props. A destructure in the component read each one once, so
// every signal-driven prop on these components froze at its first value.
function host() {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}

describe('a11y components keep signal-driven props live', () => {
  it('VisuallyHidden forwards a reactive attribute', () => {
    const el = host()
    const id = signal('one')
    const dispose = mount(h(VisuallyHidden, { 'data-x': _rp(() => id()) } as never, 'hi'), el)
    const node = el.querySelector('[data-x]')!
    expect(node.getAttribute('data-x')).toBe('one')
    id.set('two')
    expect(node.getAttribute('data-x')).toBe('two')
    dispose()
  })

  it('LiveRegion: politeness drives aria-live and role reactively; rest stays live', () => {
    const el = host()
    const mode = signal<'polite' | 'assertive'>('polite')
    const label = signal('a')
    const dispose = mount(
      h(LiveRegion, { politeness: _rp(() => mode()), 'aria-label': _rp(() => label()) } as never, 'msg'),
      el,
    )
    const node = el.querySelector('[aria-live]')!
    expect(node.getAttribute('aria-live')).toBe('polite')
    expect(node.getAttribute('role')).toBe('status')
    mode.set('assertive')
    label.set('b')
    expect(node.getAttribute('aria-live')).toBe('assertive')
    expect(node.getAttribute('role')).toBe('alert')
    expect(node.getAttribute('aria-label')).toBe('b')
    dispose()
  })

  it('SkipLink: a reactive href updates the attribute', () => {
    const el = host()
    const target = signal('#main')
    const dispose = mount(h(SkipLink, { href: _rp(() => target()) } as never), el)
    const a = el.querySelector('a')!
    expect(a.getAttribute('href')).toBe('#main')
    target.set('#content')
    expect(a.getAttribute('href')).toBe('#content')
    dispose()
  })
})
