/**
 * Regression: a READ-ONLY IDL accessor crashed the runtime `h()` mount path.
 *
 * `setStaticProp` routed on `key in el` — "does this property EXIST?" — and then
 * ASSIGNED, which needs the stronger "is it WRITABLE?". `in` is true for a
 * getter-only accessor, and framework code is ESM (hence strict mode), so the
 * assignment THREW instead of silently no-opping and took the whole mount down:
 *
 *   TypeError: Cannot set property list of #<HTMLInputElement> which has only a getter
 *
 * `list` is an ADVERTISED JSX prop (`list?: string` in jsx-runtime.ts), so this
 * was reachable from documented API. The COMPILED path was unaffected (it routes
 * generic attrs through `_setAttr`/`applyAttrProp`, which has no property
 * branch), so vite-plugin apps were safe while `@pyreon/testing`, the auto-JSX
 * browser suites and the compat layers were not.
 *
 * happy-dom models these as getter-only and throws in strict mode identically to
 * Chromium (verified before relying on it), so this node suite is load-bearing.
 * `readonly-idl-prop.browser.test.tsx` re-proves it end-to-end in real Chromium.
 */
import { h } from '@pyreon/core'
import { mount } from '../index'
import { applyProp, applyProps } from '../props'

// Getter-only IDL accessors reachable from user code. Verified read-only in BOTH
// real Chromium and happy-dom; deliberately NOT hardcoded in src (the guard is
// structural), only asserted here.
const READONLY: [tag: string, key: string, value: string][] = [
  ['input', 'list', 'dl'],
  ['input', 'form', 'f1'],
  ['select', 'options', 'x'],
  ['table', 'rows', '1'],
  ['video', 'buffered', 'x'],
]

describe('read-only IDL accessors do not crash the property branch', () => {
  test.each(READONLY)('<%s %s> falls back to setAttribute instead of throwing', (tag, key, val) => {
    const el = document.createElement(tag)
    expect(() => applyProp(el, key, val)).not.toThrow()
    expect(el.getAttribute(key)).toBe(val)
  })

  test('the accessors under test really are getter-only in this environment', () => {
    // Guards the suite itself: if happy-dom ever grows a setter for these, the
    // specs above would pass vacuously (assignment succeeds, no fallback taken)
    // and stop protecting anything.
    for (const [tag, key] of READONLY) {
      const el = document.createElement(tag)
      let desc: PropertyDescriptor | undefined
      let obj: object | null = el
      while (obj && !desc) {
        desc = Object.getOwnPropertyDescriptor(obj, key)
        obj = Object.getPrototypeOf(obj) as object | null
      }
      expect(`${tag}.${key}: ${desc ? (desc.get && !desc.set ? 'getter-only' : 'writable') : 'absent'}`).toBe(
        `${tag}.${key}: getter-only`,
      )
    }
  })

  test('mounting <input list="dl"> renders the attribute (the advertised JSX prop)', () => {
    const host = document.createElement('div')
    expect(() => mount(h('input', { list: 'dl' }), host)).not.toThrow()
    expect((host.firstChild as HTMLInputElement).getAttribute('list')).toBe('dl')
  })

  test('a DOM-element SPREAD carrying a read-only key survives too', () => {
    // `applyProps` funnels into the same helper, so the spread route
    // (`<input {...rest}>`) had the identical crash.
    const el = document.createElement('input')
    expect(() => applyProps(el, { ...{ list: 'dl', placeholder: 'p' } })).not.toThrow()
    expect(el.getAttribute('list')).toBe('dl')
    expect(el.placeholder).toBe('p')
  })

  test('a REACTIVE read-only prop does not throw either', () => {
    // applyProp wraps a function value in renderEffect -> applyStaticProp, so
    // the accessor form reaches the same branch.
    const el = document.createElement('input')
    expect(() => applyProps(el, { list: () => 'dl' })).not.toThrow()
    expect(el.getAttribute('list')).toBe('dl')
  })

  test('WRITABLE properties still take the property branch (no regression)', () => {
    // The guard must not silently demote ordinary props to attributes: these
    // assert the PROPERTY was written, which setAttribute alone would not do
    // for a non-reflecting prop like `value`.
    const input = document.createElement('input')
    applyProp(input, 'value', 'v')
    expect(input.value).toBe('v')
    expect(input.hasAttribute('value')).toBe(false) // property, not attribute

    applyProp(input, 'placeholder', 'p')
    expect(input.placeholder).toBe('p')

    const a = document.createElement('a')
    applyProp(a, 'href', '/x')
    expect(a.getAttribute('href')).toBe('/x')
  })
})
