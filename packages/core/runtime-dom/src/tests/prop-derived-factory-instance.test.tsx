/**
 * Regression lock — a prop-derived `const` holding a HOOK / FACTORY result must
 * be ONE instance, shared by every binding and every event handler.
 *
 * The prop-derived inlining pass splices a const's initializer back in at each
 * JSX use site so `const a = props.x + 1` stays reactive. Applied to a stateful
 * factory it mints a fresh instance PER BINDING: the handlers mutate the
 * component body's instance, every binding watches its own, and the UI is
 * simply inert. No throw, no warning, no failing unit test — the component's
 * own suite passes because it never drives the feature end to end.
 *
 * Shipped twice before this lock existed:
 *  - `@pyreon/atlas`'s `createModel`, worked around per-site by writing `let`
 *    (the inliner ignores `let`) — folklore, so `@pyreon/loom`'s Observatory
 *    later wrote `const` and inherited the same dead UI.
 *  - `@pyreon/zero-content`'s `useSearch`, which left the pyreon.dev search
 *    overlay dead on every page: Cmd+K flipped a signal nothing was bound to.
 *
 * The emit-level assertions live in the compiler's
 * `prop-derived-factory-call.test.ts`; this file proves the USER-VISIBLE half —
 * a click updates the DOM — through the REAL transform, because that is the
 * only layer at which the bug was ever observable.
 *
 * Bisect-verified: reverting `isFactoryConventionName` in
 * `packages/core/compiler/src/jsx.ts` makes the two "one instance" specs fail
 * with the DOM frozen at its initial text.
 */
import { transformSync } from 'esbuild'
import { transformJSX } from '@pyreon/compiler'
import { Fragment, _lc, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setClass,
  _setStyle,
  _tpl,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _mountChild,
  _lc,
  bindPolymorphicText,
  h,
  Fragment,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const stripImports = (c: string) => c.replace(/^import[^\n]*\n/gm, '')
const lowerResidualJsx = (c: string) =>
  transformSync(c, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code

function build(source: string): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', {})
  const body = lowerResidualJsx(stripImports(code).replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, `${body}\nreturn App`)(...DEP_VALUES) as () => unknown
}

function render(source: string): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  mount(h(build(source) as never, { label: 'L' }), host)
  return host
}

afterEach(() => {
  document.body.innerHTML = ''
})

// A factory in the shape every real one takes: it OWNS signals, and its
// consumers reach them through the returned object. `made` counts instances so
// a re-invocation is visible even when the DOM assertion cannot distinguish it.
const FACTORY = `
let made = 0
function useThing(opts) {
  made++
  const open = signal(false)
  return { open, toggle: () => open.set(!open()), label: () => opts.label, made: () => made }
}
`

describe('a prop-derived const holding a factory result is ONE instance', () => {
  it('a handler-driven toggle updates a class binding', () => {
    const host = render(`${FACTORY}
      const App = (props) => {
        const s = useThing({ label: props.label })
        return <div class={() => (s.open() ? 'on' : 'off')} onClick={() => s.toggle()}>x</div>
      }`)
    const el = host.querySelector('div')!
    expect(el.getAttribute('class')).toBe('off')
    el.click()
    expect(el.getAttribute('class')).toBe('on')
  })

  it('a handler-driven toggle updates a reactive CHILD', () => {
    const host = render(`${FACTORY}
      const App = (props) => {
        const s = useThing({ label: props.label })
        return <div onClick={() => s.toggle()}>{() => (s.open() ? 'OPEN' : 'CLOSED')}</div>
      }`)
    const el = host.querySelector('div')!
    expect(el.textContent).toBe('CLOSED')
    el.click()
    expect(el.textContent).toBe('OPEN')
  })

  it('the factory runs exactly ONCE no matter how many bindings read it', () => {
    // Four separate use sites — under the bug each one minted its own instance.
    const host = render(`${FACTORY}
      const App = (props) => {
        const s = useThing({ label: props.label })
        return <div class={() => (s.open() ? 'on' : 'off')} title={() => s.label()}>
          <i>{() => s.made()}</i><b>{() => s.label()}</b>
        </div>
      }`)
    expect(host.querySelector('i')!.textContent).toBe('1')
    expect(host.querySelector('b')!.textContent).toBe('L')
  })

  it('the same holds for a `createX` factory', () => {
    const host = render(`
      let made = 0
      function createModel(label) {
        made++
        const view = signal('a')
        return { view, flip: () => view.set('b'), made: () => made }
      }
      const App = (props) => {
        const m = createModel(props.label)
        return <div class={() => m.view()} onClick={() => m.flip()}>{() => m.made()}</div>
      }`)
    const el = host.querySelector('div')!
    expect(el.textContent).toBe('1')
    expect(el.getAttribute('class')).toBe('a')
    el.click()
    expect(el.getAttribute('class')).toBe('b')
  })

  it('SCOPE LIMIT: an unrecognised pure callee stays inlined, hence reactive', () => {
    // The fix must not trade a silent state bug for a silent staleness bug.
    const host = render(`
      const join = (a, b) => a + '-' + b
      const App = (props) => {
        const flag = signal('x')
        const cls = join(props.label, flag())
        return <div class={cls} onClick={() => flag.set('y')}>t</div>
      }`)
    const el = host.querySelector('div')!
    expect(el.getAttribute('class')).toBe('L-x')
    el.click()
    expect(el.getAttribute('class')).toBe('L-y')
  })
})
