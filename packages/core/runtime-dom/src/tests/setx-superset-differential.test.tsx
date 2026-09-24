/**
 * Every `_setX` helper the compiler emits (`_setAttr` / `_setValue` /
 * `_setStyle`) must be a SUPERSET of the `setStaticProp` branches that sit ABOVE
 * its dispatch point on the h() path — otherwise a value that the h() and SSR
 * paths refuse or normalize is written raw by the compiled template path.
 *
 * Three instances of the class, found together:
 *   - `_setAttr` had no URL guard: compiled `<a href={u}>` with
 *     `"javascript:alert(1)"` WROTE the attribute while h() + SSR dropped it.
 *   - `_setValue` had no nullish guard: compiled `<input value={undefined}>`
 *     showed the literal text "undefined" (`HTMLInputElement.value` only maps
 *     null → '' — undefined stringifies) while h() + SSR render an empty box.
 *   - `_setStyle` never cleared a STRING style on a nullish flip (object styles
 *     cleared), so `style={c ? 'color:red' : undefined}` kept `color: red`.
 *
 * The oracle is DIFFERENTIAL: for every attribute × payload the compiled mount
 * (real `transformJSX`), the `h()` mount and `renderToString` must agree. A
 * hand-written expectation table would encode this file's assumptions; the
 * three paths disagreeing is the defect.
 */
import { transformJSX } from '@pyreon/compiler'
import { query } from '@pyreon/test-utils'
import { Fragment, h, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { _ssrAttrGen, renderToString } from '@pyreon/runtime-server'
import { _tpl, _bindText, _bindDirect, _setChild, _setChildAt } from '../template'
import {
  _applyProps,
  _setAttr,
  _setClass,
  _setStyle,
  _setValue,
  _setHtml,
  bindPolymorphicText,
  mountChild,
  _bindProp,
} from '../index'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindProp,
  _bindDirect,
  _setChild,
  _setChildAt,
  bindPolymorphicText,
  _applyProps,
  _setStyle,
  _setClass,
  _setAttr,
  _setValue,
  _setHtml,
  _rp,
  _rpd,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

/**
 * Compile a JSX expression through the REAL transform and mount it.
 *
 * The source MUST be wrapped in an enclosing element (`wrap()`): a childless
 * element at the top level of a module is left as RAW JSX by `transformJSX` —
 * `jsx: preserve` means esbuild's automatic runtime finishes it — so it never
 * reaches `_tpl`, and `new Function` would choke on the `<`. Every real app's
 * markup is nested, which is exactly the shape that templatizes, so wrapping
 * tests the path that ships rather than the degenerate top-level one.
 */
function compiledMount(source: string, globals: Record<string, unknown>) {
  const { code } = transformJSX(source, 'test.tsx')
  const body = stripImports(code)
  if (/^\s*</m.test(body.replace(/^const .*$/gm, '')) && !body.includes('_tpl('))
    throw new Error(`source did not templatize (left as raw JSX): ${source}`)
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `return ${body}`)
  const result = fn(...DEP_VALUES, ...Object.values(globals))
  // DETACHED container, deliberately: happy-dom NAVIGATES a connected
  // `<iframe src>` for real, so attaching one turns every URL payload into a
  // fetch attempt (`URL scheme "mailto" is not supported` …) and buries the run
  // in stack traces. Nothing under test needs a connected tree — these are
  // attribute/property writes.
  const container = document.createElement('div')
  const cleanup = mountChild(result, container)
  return { container, cleanup, code }
}

function hMount(vnode: unknown) {
  const container = document.createElement('div')
  const cleanup = mountChild(vnode as never, container)
  return { container, cleanup }
}

/** `attr="…"` value from SSR HTML, or null when the attribute is absent. */
function ssrAttr(html: string, attr: string): string | null {
  const m = new RegExp(` ${attr.replace(':', '\\:')}="([^"]*)"`).exec(html)
  return m ? m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null
}

// URL-bearing attribute × host element. `xlink:href` is SVG's URL attribute,
// whose qualified name is not `href` — the sanitizer already guards it by
// `localName`; the three renderers must too.
const URL_SITES: [tag: string, attr: string, extra?: string][] = [
  ['a', 'href'],
  ['iframe', 'src'],
  ['form', 'action'],
  ['button', 'formaction'],
  ['object', 'data'],
  ['video', 'poster'],
  ['blockquote', 'cite'],
  ['img', 'src'],
]

const UNSAFE = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  '\tjavascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
]
const SAFE = ['/ok', 'https://example.com/x', '#frag', 'mailto:a@b.c']

describe('_setAttr URL guard — compiled ≡ h() ≡ SSR', () => {
  for (const [tag, attr] of URL_SITES) {
    for (const payload of [...UNSAFE, ...SAFE]) {
      it(`<${tag} ${attr}={u}> with ${JSON.stringify(payload)}`, async () => {
        const self = tag === 'img'
        const jsx = self
          ? `<div><${tag} ${attr}={u} /></div>`
          : `<div><${tag} ${attr}={u}>x</${tag}></div>`
        const compiled = compiledMount(jsx, { u: payload })
        const vnode = () =>
          h('div', null, self ? h(tag, { [attr]: payload }) : h(tag, { [attr]: payload }, 'x'))
        const via = hMount(vnode())
        const ssr = await renderToString(vnode())
        const target = (c: HTMLElement) => c.querySelector(tag)!
        const compiledVal = target(compiled.container).getAttribute(attr)
        const hVal = target(via.container).getAttribute(attr)
        const ssrVal = ssrAttr(ssr, attr)
        // The three paths agree — and for an unsafe payload all three DROP it.
        expect(compiledVal, `compiled vs h() on ${tag}/${attr}`).toBe(hVal)
        expect(ssrVal, `SSR vs h() on ${tag}/${attr}`).toBe(hVal)
        if (UNSAFE.includes(payload)) expect(hVal).toBeNull()
        else expect(hVal).toBe(payload)
        compiled.cleanup()
        via.cleanup()
      })
    }
  }

  it('the compiled path resolves an accessor BEFORE the guard (an accessor returning javascript: is blocked)', () => {
    const { container, cleanup } = compiledMount('<div><a href={u}>x</a></div>', {
      u: () => 'javascript:alert(1)',
    })
    expect(container.querySelector('a')!.getAttribute('href')).toBeNull()
    cleanup()
  })

  it('_bindDirect bare-signal updater reaches the guard on every write', () => {
    const src = signal('/ok')
    const { code } = transformJSX(
      'const C = () => { const src = signal("/ok"); return <div><a href={src()}>x</a></div> }',
      'test.tsx',
    )
    expect(code).toContain('_bindDirect(')
    const body = stripImports(code)
    const fn = new Function(...DEP_NAMES, `${body}\nreturn C`)
    // Inject OUR signal so the test can drive it: shadow the module-level one by
    // re-evaluating with `signal` returning it.
    const C = fn(...DEP_VALUES.map((d, i) => (DEP_NAMES[i] === 'signal' ? () => src : d)))
    const container = document.createElement('div')
    const cleanup = mountChild(h(C, {}), container)
    const a = container.querySelector('a')!
    expect(a.getAttribute('href')).toBe('/ok')
    src.set('javascript:alert(1)')
    expect(a.getAttribute('href')).toBe('/ok') // blocked write leaves the last safe value
    src.set('/next')
    expect(a.getAttribute('href')).toBe('/next')
    cleanup()
  })

  it('a safe image data: URI on <img src> is still allowed on all three paths', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const compiled = compiledMount('<div><img src={u} /></div>', { u: png })
    const via = hMount(h('img', { src: png }))
    const ssr = await renderToString(h('img', { src: png }))
    expect(compiled.container.querySelector('img')!.getAttribute('src')).toBe(png)
    expect(via.container.querySelector('img')!.getAttribute('src')).toBe(png)
    expect(ssrAttr(ssr, 'src')).toBe(png)
    compiled.cleanup()
    via.cleanup()
  })
})

describe('_setValue nullish — compiled ≡ h() ≡ SSR', () => {
  for (const [label, v] of [
    ['undefined', undefined],
    ['null', null],
  ] as const) {
    it(`<input value={${label}}> renders an EMPTY field on every path`, async () => {
      const compiled = compiledMount('<div><input value={u} /></div>', { u: v })
      const via = hMount(h('input', { value: v }))
      const ssr = await renderToString(h('input', { value: v }))
      const ci = compiled.container.querySelector('input')!
      const hi = via.container.querySelector('input')!
      expect(ci.value, 'compiled .value').toBe(hi.value)
      expect(hi.value).toBe('')
      expect(ci.hasAttribute('value')).toBe(hi.hasAttribute('value'))
      expect(ssrAttr(ssr, 'value')).toBeNull()
      expect(ci.defaultValue).toBe('')
      compiled.cleanup()
      via.cleanup()
    })

    it(`<textarea value={${label}}> renders empty on the compiled path`, () => {
      const compiled = compiledMount('<div><textarea value={u} /></div>', { u: v })
      expect(compiled.container.querySelector('textarea')!.value).toBe('')
      compiled.cleanup()
    })
  }

  it('a later nullish write clears a previously-typed value (property reset) without touching the default', () => {
    const el = document.createElement('input')
    _setValue(el, 'first')
    expect(el.defaultValue).toBe('first')
    _setValue(el, undefined)
    expect(el.value).toBe('')
    expect(el.defaultValue).toBe('first')
  })

  it('a first nullish application does NOT consume the one-shot default establishment', () => {
    const el = document.createElement('input')
    _setValue(el, null)
    _setValue(el, 'later')
    expect(el.defaultValue).toBe('later')
  })
})

describe('_setStyle string → nullish flip clears — compiled ≡ h()', () => {
  it('string style is cleared on a nullish flip (h() path)', () => {
    const on = signal<string | undefined>('color: red')
    const { container, cleanup } = hMount(h('div', { style: () => on() }))
    const el = query(container, 'div')
    expect(el.style.color).toBe('red')
    on.set(undefined)
    expect(el.style.color).toBe('')
    expect(el.getAttribute('style') ?? '').toBe('')
    // And a string can be re-applied afterwards (the skip cache was reset).
    on.set('color: red')
    expect(el.style.color).toBe('red')
    cleanup()
  })

  it('string style is cleared on a nullish flip (compiled path)', () => {
    const on = signal<string | undefined>('color: red')
    const { code } = transformJSX(
      'const C = () => { const on = signal("color: red"); return <section><div style={on()}>x</div></section> }',
      'test.tsx',
    )
    const body = stripImports(code)
    const fn = new Function(...DEP_NAMES, `${body}\nreturn C`)
    const C = fn(...DEP_VALUES.map((d, i) => (DEP_NAMES[i] === 'signal' ? () => on : d)))
    const container = document.createElement('div')
    const cleanup = mountChild(h(C, {}), container)
    const el = query(container, 'div')
    expect(el.style.color).toBe('red')
    on.set(undefined)
    expect(el.style.color).toBe('')
    on.set('color: blue')
    expect(el.style.color).toBe('blue')
    cleanup()
  })

  it('object style still clears on a nullish flip (unchanged behaviour)', () => {
    const el = document.createElement('div')
    _setStyle(el, { color: 'red' })
    _setStyle(el, null)
    expect(el.style.color).toBe('')
  })

  it('string → object → nullish clears everything', () => {
    const el = document.createElement('div')
    _setStyle(el, 'color: red')
    _setStyle(el, { background: 'blue' })
    // object mode replaces string mode's tracked state; the earlier cssText
    // declarations are untracked keys and stay (pre-existing contract) …
    _setStyle(el, undefined)
    expect(el.style.background).toBe('')
  })
})

/**
 * Event-handler NAMES are the same superset class as the URL guard above, and
 * the one that had been closed on exactly ONE of its cells. SSR's
 * `renderPropSkipped` refused `onclick`; the three other sinks in the
 * (renderer x namespace x vocabulary) matrix did not:
 *
 *   A1  h() path, SVG/MathML — the foreign-namespace branch in `setStaticProp`
 *       `setAttribute`s ANY name and returns, so `<svg onload>` was written.
 *   A2  the same for a nested SVG child (`<rect onclick>`).
 *   B   `_setAttr` (the compiled sink) had no handler branch at all, so
 *       `onclick={expr}` landed on PLAIN HTML.
 *   B2  and a FUNCTION-valued one was CALLED to build the string — user code
 *       executed during render, the client twin of the SSR half of #3432.
 *   C   `_ssrAttrGen` (the compiled SSR sink) serialized it, because the
 *       compiler's own `on*` bail is `/^on[A-Z]/` — camelCase only.
 *
 * Verified live in real Chromium before the fix (see
 * `event-handler-attr.browser.test.tsx`): A2, B and the SVG `_setAttr` case all
 * EXECUTED the attribute's script. happy-dom is the wrong oracle for liveness,
 * so the assertions here are about the attribute being ABSENT and the three
 * paths agreeing; the browser file owns the "and it would have run" half.
 */
describe('event-handler attributes — compiled ≡ h() ≡ SSR', () => {
  // [label, jsx, vnode factory, selector, attribute]
  const SITES: [string, string, () => unknown, string, string][] = [
    [
      'A1 svg onload',
      '<div><svg onload={v} /></div>',
      () => h('div', null, h('svg', { onload: 'alert(1)' })),
      'svg',
      'onload',
    ],
    [
      'A2 nested svg child onclick',
      '<div><svg><rect onclick={v} /></svg></div>',
      () => h('div', null, h('svg', null, h('rect', { onclick: 'alert(1)' }))),
      'rect',
      'onclick',
    ],
    [
      'A3 svg SMIL onbegin (a name the HTML-only set missed)',
      '<div><svg><animate onbegin={v} /></svg></div>',
      () => h('div', null, h('svg', null, h('animate', { onbegin: 'alert(1)' }))),
      'animate',
      'onbegin',
    ],
    [
      'B plain HTML onclick',
      '<div><button onclick={v}>x</button></div>',
      () => h('div', null, h('button', { onclick: 'alert(1)' }, 'x')),
      'button',
      'onclick',
    ],
    // B3 (vendor-legacy `onmousewheel`) moved to event-handler-attr.browser.test.tsx:
    // the client asks the ELEMENT which names are handlers (`key in el`), and
    // happy-dom's <button> does not define `onmousewheel` — Chromium's does.
    // The claim is about Chromium, so it is asserted there.
  ]

  for (const [label, jsx, vnode, sel, attr] of SITES) {
    it(`${label} is refused on all three paths`, async () => {
      const compiled = compiledMount(jsx, { v: 'alert(1)' })
      const via = hMount(vnode())
      const ssr = await renderToString(vnode() as never)
      const compiledVal = compiled.container.querySelector(sel)!.getAttribute(attr)
      const hVal = via.container.querySelector(sel)!.getAttribute(attr)
      expect(compiledVal, `compiled vs h() on ${sel}/${attr}`).toBe(hVal)
      expect(ssrAttr(ssr, attr), `SSR vs h() on ${sel}/${attr}`).toBe(hVal)
      expect(hVal, 'the handler attribute must be absent').toBeNull()
      compiled.cleanup()
      via.cleanup()
    })
  }

  it('B2 `_setAttr` does not INVOKE a function-valued handler name', () => {
    const el = document.createElement('div')
    let called = false
    _setAttr(el, 'onclick', () => {
      called = true
      return 'alert(1)'
    })
    // The refusal sits ABOVE the accessor resolution, so the closure is never
    // run — the whole point of the ordering.
    expect(called, 'a function-valued handler name must never be called').toBe(false)
    expect(el.getAttribute('onclick')).toBeNull()
  })

  it('C the compiled SSR sink refuses it too (`_ssrAttrGen`)', () => {
    expect(_ssrAttrGen('onclick', 'alert(1)')).toBe('')
    expect(_ssrAttrGen('onbegin', 'alert(1)')).toBe('')
    let called = false
    expect(
      _ssrAttrGen('onclick', () => {
        called = true
        return 'alert(1)'
      }),
    ).toBe('')
    expect(called, 'a function-valued handler name must never be called').toBe(false)
  })

  it('C2 the compiler now BAILS on a lowercase handler — it never reaches `_ssrAttrGen`', () => {
    // This spec exists to notice the moment the routing changes, and it has:
    // it used to pin that a lowercase `on*` REACHED `_ssrAttrGen`, so that the
    // refusal above was demonstrably on a live path. The compiler now skips
    // lowercase handlers at the attribute seam (`SSR_EVENT_HANDLER_ATTRS`,
    // identity-locked to core's `EVENT_HANDLER_ATTRS`), which is strictly
    // better — the handler is dropped BEFORE any helper sees it, so it can
    // never be invoked during a render.
    //
    // The invariant is unchanged: say out loud which path is live. So the
    // assertion is inverted rather than deleted, and the case above is
    // re-read as defence in depth — `_ssrAttrGen` is exported, and a backend
    // composing its own document can still call it directly.
    const { code } = transformJSX('const N = <div onclick={hx}>x</div>', 'case.tsx', {
      ssr: true,
      ssrTemplate: true,
    })
    expect(code, 'a lowercase handler must not reach the lean SSR attr helper').not.toContain(
      '_ssrAttrGen("onclick"',
    )
    // And it is DROPPED, not re-routed to some other sink that would emit it.
    expect(code, 'nor any other sink that would serialize it').not.toContain('onclick')
  })

  it('camelCase `onClick` still binds a real listener (control)', () => {
    let fired = 0
    const { container, cleanup } = hMount(h('button', { onClick: () => fired++ }, 'x'))
    const btn = query(container, 'button') as unknown as HTMLElement & Record<string, unknown>
    // `click` is DELEGATED, so the binding is an `__ev_click` expando invoked by
    // the delegation root — a detached container has none, hence the structural
    // assertion. It is the load-bearing one anyway: it proves `applyProp` routed
    // the prop to `applyEventProp` rather than to the attribute sink.
    expect(typeof btn.__ev_click, 'the documented camelCase prop must keep working').toBe(
      'function',
    )
    expect(btn.getAttribute('onclick'), 'and never as an attribute').toBeNull()
    ;(btn.__ev_click as (e: Event) => void)(new Event('click'))
    expect(fired).toBe(1)
    // A NON-delegated handler takes the real `addEventListener` path.
    const el = document.createElement('div')
    let entered = 0
    const c2 = hMount(h('div', { onMouseEnter: () => entered++ }))
    c2.container.querySelector('div')!.dispatchEvent(new Event('mouseenter'))
    expect(entered).toBe(1)
    void el
    c2.cleanup()
    cleanup()
  })

  it('ordinary SVG attributes still render (control)', async () => {
    const jsx = '<div><svg><rect width={v} /></svg></div>'
    const compiled = compiledMount(jsx, { v: '10' })
    const vnode = () => h('div', null, h('svg', null, h('rect', { width: '10' })))
    const via = hMount(vnode())
    const ssr = await renderToString(vnode() as never)
    expect(compiled.container.querySelector('rect')!.getAttribute('width')).toBe('10')
    expect(via.container.querySelector('rect')!.getAttribute('width')).toBe('10')
    expect(ssrAttr(ssr, 'width')).toBe('10')
    compiled.cleanup()
    via.cleanup()
  })

  it('`once` / `onyx` / `only` are ordinary attributes and still render (control)', () => {
    // The reason the guard is a NAME SET and not `/^on[a-z]/`; an existing SSR
    // spec asserts the same, and the client must not disagree with it.
    for (const name of ['once', 'onyx', 'only', 'on']) {
      const el = document.createElement('div')
      _setAttr(el, name, 'x')
      expect(el.getAttribute(name), `${name} is not a handler`).toBe('x')
    }
  })
})
