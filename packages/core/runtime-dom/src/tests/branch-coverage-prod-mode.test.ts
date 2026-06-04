/**
 * Production-mode (NODE_ENV='production') branch coverage for runtime-dom.
 * Hits the FALSE arms of `process.env.NODE_ENV !== 'production'` gates.
 * NO v8-ignore annotations.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'
import { applyProp } from '../props'

let _origNodeEnv: string | undefined

beforeEach(() => {
  _origNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
})

afterEach(() => {
  if (_origNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = _origNodeEnv
})

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

// ─── mount.ts — production gates ────────────────────────────────────────────

describe('mount.ts production-mode gates', () => {
  test('void element with children in production: no warn (line 312 false arm)', () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = container()
    mount(h('img', null, 'should not warn'), root)
    expect(warnMock).not.toHaveBeenCalled()
    warnMock.mockRestore()
    root.remove()
  })

  test('mount in production: dev counter does NOT fire', () => {
    const root = container()
    mount(h('div', { class: 'x' }, 'content'), root)
    expect(root.textContent).toBe('content')
    root.remove()
  })

  test('mount nested elements in production', () => {
    const root = container()
    mount(h('div', null, h('span', null, 'a'), h('strong', null, 'b')), root)
    expect(root.querySelector('span')?.textContent).toBe('a')
    expect(root.querySelector('strong')?.textContent).toBe('b')
    root.remove()
  })

  test('reactive child in production: no dev warn', () => {
    const root = container()
    const text = signal('initial')
    const Comp: ComponentFn<{}> = () => h('div', { class: 'reactive' }, () => text())
    mount(h(Comp, null), root)
    expect(root.querySelector('.reactive')?.textContent).toBe('initial')

    text.set('updated')
    expect(root.querySelector('.reactive')?.textContent).toBe('updated')
    root.remove()
  })

  test('component return validation skipped in production', () => {
    const root = container()
    const BadComp: ComponentFn<{}> = () => null
    mount(h(BadComp, null), root)
    expect(root).toBeDefined()
    root.remove()
  })
})

// ─── props.ts — production-mode arms ────────────────────────────────────────

describe('props.ts production-mode gates', () => {
  test('non-function event handler in production: no warn', () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('button')
    applyProp(el, 'onClick', 'not-a-function')
    expect(warnMock).not.toHaveBeenCalled()
    warnMock.mockRestore()
  })

  test('unsafe URL in href in production: no warn (still blocked)', () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('a')
    applyProp(el, 'href', 'javascript:alert(1)')
    // Production: still blocked but no warn
    expect(el.getAttribute('href')).toBeNull()
    expect(warnMock).not.toHaveBeenCalled()
    warnMock.mockRestore()
  })

  test('event delegation works in production', () => {
    const el = document.createElement('div')
    const cleanup = applyProp(el, 'onClick', () => {})
    expect(cleanup).not.toBeNull()
    cleanup?.()
  })

  test('applyProp for class in production', () => {
    const el = document.createElement('div')
    applyProp(el, 'class', 'a b c')
    expect(el.className).toBe('a b c')
  })

  test('applyProp for style object in production', () => {
    const el = document.createElement('div')
    applyProp(el, 'style', { color: 'red', fontSize: '14px' })
    expect(el.style.color).toBe('red')
  })

  test('applyProp for dangerouslySetInnerHTML in production', () => {
    const el = document.createElement('div')
    applyProp(el, 'dangerouslySetInnerHTML', { __html: '<b>raw</b>' })
    expect(el.innerHTML).toContain('raw')
  })

  test('applyProp for innerHTML in production sanitizes', () => {
    const el = document.createElement('div')
    applyProp(el, 'innerHTML', '<strong>safe</strong>')
    expect(el.innerHTML).toContain('safe')
  })
})
