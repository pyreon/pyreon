/**
 * Dead-binding elision in the DOM bindings. A component prop that is an own
 * DATA property (a literal or a folded value — reactive props are getters) can
 * never change, so `_bindProp` writes it once and returns the shared
 * `_noopDispose`; a tracked binding that read nothing (`_bindText`'s fallback,
 * `bindPolymorphicText`, attribute `renderEffect`s) does the same. Anything
 * that reads a signal stays live, and a first value that MOUNTED a subtree
 * keeps a disposer that removes it.
 */
import { transformJSX } from '@pyreon/compiler'
import {
  _fuse,
  _lc,
  _rp,
  _rpd,
  _wrapSpread,
  For,
  Fragment,
  h,
  mergeProps,
  type VNodeChild,
} from '@pyreon/core'
import {
  _bind,
  _noopDispose,
  computed,
  EffectScope,
  effectScope,
  getCurrentScope,
  renderEffect,
  setCurrentScope,
  signal,
} from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindProp,
  _bindText,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
  _setAttr,
  _setClass,
  _setStyle,
  _setStyleOnce,
  _setValue,
  _tpl,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

afterEach(() => {
  document.body.innerHTML = ''
})

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _bindProp,
  _applyProps,
  _setStyle,
  _setStyleOnce,
  _setAttr,
  _setClass,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
  _setValue,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  _lc,
  _fuse,
  _rp,
  _rpd,
  _wrapSpread,
  signal,
  computed,
  mergeProps,
  renderEffect,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)
const lower = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code
function compileApp(source: string, S: unknown[]): () => VNodeChild {
  const { code } = transformJSX(source, 'test.tsx', {} as never)
  const body = lower(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, 'S', `${body}\nreturn App`)(
    ...DEP_VALUES,
    S,
  ) as () => VNodeChild
}

function withScope<T>(fn: () => T): { result: T; empty: boolean; stop: () => void } {
  const scope = effectScope()
  const prev = getCurrentScope()
  setCurrentScope(scope)
  try {
    return { result: fn(), empty: scope._isEmpty(), stop: () => scope.stop() }
  } finally {
    setCurrentScope(prev)
  }
}

function textIn(parent: HTMLElement, data = ' '): Text {
  const t = document.createTextNode(data)
  parent.appendChild(t)
  return t
}

describe('_bindProp on a data property', () => {
  it('writes a primitive once and returns the shared no-op, registering nothing', () => {
    const el = document.createElement('span')
    const t = textIn(el)
    const { result, empty } = withScope(() => _bindProp({ label: 'Name' }, 'label', t, el))
    expect(t.data).toBe('Name')
    expect(result).toBe(_noopDispose)
    expect(empty).toBe(true)
  })

  it('coerces like the poly core: null / undefined / false → empty, numbers and true → String()', () => {
    const el = document.createElement('span')
    for (const [v, out] of [
      [null, ''],
      [undefined, ''],
      [false, ''],
      [0, '0'],
      [true, 'true'],
      ['', ''],
    ] as const) {
      const t = textIn(el)
      expect(_bindProp({ v }, 'v', t, el)).toBe(_noopDispose)
      expect(t.data).toBe(out)
    }
  })

  it('leaves an adopted node whose text already matches untouched', () => {
    const el = document.createElement('span')
    const t = textIn(el, 'Name')
    let writes = 0
    const proto = Object.getPrototypeOf(t) as object
    const desc =
      Object.getOwnPropertyDescriptor(proto, 'data') ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'data')!
    Object.defineProperty(t, 'data', {
      get() {
        return desc.get!.call(this)
      },
      set(v) {
        writes++
        desc.set!.call(this, v)
      },
      configurable: true,
    })
    _bindProp({ label: 'Name' }, 'label', t, el)
    expect(writes).toBe(0)
  })

  it('a data property holding a VNode still mounts it, and the disposer removes it', () => {
    const el = document.createElement('div')
    const t = textIn(el)
    const dispose = _bindProp({ slot: h('b', null, 'bold') }, 'slot', t, el)
    expect(el.innerHTML).toContain('<b>bold</b>')
    expect(dispose).not.toBe(_noopDispose)
    dispose()
    expect(el.innerHTML).not.toContain('<b>')
  })

  it('a getter prop that reads a signal stays live', () => {
    const el = document.createElement('span')
    const t = textIn(el)
    const s = signal('a')
    const props = {}
    Object.defineProperty(props, 'label', { get: () => `${s()}!`, enumerable: true })
    const { result, empty, stop } = withScope(() => _bindProp(props, 'label', t, el))
    expect(t.data).toBe('a!')
    expect(result).not.toBe(_noopDispose)
    expect(empty).toBe(false)
    s.set('b')
    expect(t.data).toBe('b!')
    stop()
    s.set('c')
    expect(t.data).toBe('b!')
  })
})

describe('tracked text bindings that read nothing', () => {
  it('bindPolymorphicText over a constant string is dead', () => {
    const el = document.createElement('span')
    const t = textIn(el)
    expect(bindPolymorphicText(() => 'x', t, el)).toBe(_noopDispose)
    expect(t.data).toBe('x')
  })

  it('bindPolymorphicText over a constant VNode keeps the subtree disposer', () => {
    const el = document.createElement('div')
    const t = textIn(el)
    const dispose = bindPolymorphicText(() => h('i', null, 'it'), t, el)
    expect(dispose).not.toBe(_noopDispose)
    expect(el.innerHTML).toContain('<i>it</i>')
    dispose()
    expect(el.innerHTML).not.toContain('<i>')
  })

  it('_bindText fallback over a constant is dead; over a signal it stays live', () => {
    const el = document.createElement('span')
    const t1 = textIn(el)
    expect(_bindText((() => 7) as never, t1)).toBe(_noopDispose)
    expect(t1.data).toBe('7')
    const s = signal(1)
    const t2 = textIn(el)
    const d = _bindText((() => s() * 2) as never, t2)
    expect(d).not.toBe(_noopDispose)
    s.set(2)
    expect(t2.data).toBe('4')
    d()
  })
})

describe('compiled components', () => {
  const ROW = `function FormRow(props) {
    return <label class="row"><span>{props.label}</span><input name={props.name} /><em>{props.hint}</em></label>
  }\n`

  it('literal props mount with no live binding; a signal prop beside them stays reactive', () => {
    const src =
      ROW +
      `const hint = signal('h1'); S[0] = hint
       const App = () => <div><FormRow label="Name" name="n" hint={hint()} /></div>`
    const S: unknown[] = []
    const App = compileApp(src, S)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const unmount = mount(h(App, null), host)
    expect(host.querySelector('span')!.textContent).toBe('Name')
    expect(host.querySelector('input')!.getAttribute('name')).toBe('n')
    expect(host.querySelector('em')!.textContent).toBe('h1')
    ;(S[0] as ReturnType<typeof signal<string>>).set('h2')
    expect(host.querySelector('em')!.textContent).toBe('h2')
    unmount()
    expect(host.innerHTML).toBe('')
  })

  it('a component whose bindings are all static registers no binding disposer', () => {
    const count = (src: string) => {
      const App = compileApp(ROW + src, [])
      const host = document.createElement('div')
      const add = EffectScope.prototype.add
      let adds = 0
      let text = ''
      EffectScope.prototype.add = function (this: EffectScope, e: { dispose(): void }) {
        adds++
        return add.call(this, e)
      }
      try {
        const unmount = mount(h(App, null), host)
        text = host.textContent ?? ''
        unmount()
      } finally {
        EffectScope.prototype.add = add
      }
      return { adds, text }
    }
    const fixed = count(`const App = () => <FormRow label="Name" name="n" hint="h" />`)
    const live = count(
      `const s = signal('h'); const App = () => <FormRow label="Name" name={s()} hint={s()} />`,
    )
    // Three bindings (label text, name attr, hint text): all dead with literal
    // props. With signal props the `name` attribute effect registers with the
    // scope; `hint` takes `_bindText`'s direct tier, which never does.
    expect(live.adds - fixed.adds).toBe(1)
    expect(fixed.text).toBe('Nameh')
    expect(live.text).toBe('Nameh')
    expect(fixed.adds).toBe(0)
  })
})
