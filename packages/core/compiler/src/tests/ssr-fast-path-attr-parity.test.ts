/**
 * Three attribute seams where the compile-to-string SSR fast path diverged
 * from `renderProp` (the h() path it must be byte-identical to), locked on
 * BOTH backends (`transformJSX` prefers the native binary):
 *
 *  1. a LOWERCASE handler (`onclick`) — `renderPropSkipped` drops it by name
 *     set; the fast path skipped only `/^on[A-Z]/`, so `onclick={fn}` reached
 *     `_ssrAttrGen`, which INVOKES a function value during render;
 *  2. a literal `aria-x={false}` — `renderPropValue` emits `aria-x="false"`;
 *     the fast path omitted it;
 *  3. `x.join()` / `n.toFixed()` — proved "string" by METHOD NAME on an
 *     untyped receiver, so a user object's `join()` returning null baked
 *     `name="null"` where the h() path omits; and `String(x)` proved a string
 *     even when the module rebinds `String`.
 */
import { transformJSX, transformJSX_JS } from '../jsx'

const both = (src: string) => [
  transformJSX(src, 't.tsx', { ssr: true, ssrTemplate: true }).code,
  transformJSX_JS(src, 't.tsx', { ssr: true, ssrTemplate: true }).code,
]

describe('SSR fast path — attribute parity with renderProp', () => {
  test('a lowercase handler is dropped like key/ref/onClick — the value is never emitted', () => {
    for (const code of both(`const A = <button onclick={handler} onClick={h2}>x</button>`)) {
      expect(code).toContain('_ssr(')
      expect(code).not.toContain('onclick')
      expect(code).not.toContain('handler')
    }
    for (const code of both(`const A = <button onclick="alert(1)">x</button>`)) {
      expect(code).not.toContain('onclick')
    }
    // `once` / `onyx` are ordinary attributes, not handlers.
    for (const code of both(`const A = <b once="1" onyx={v}>x</b>`)) {
      expect(code).toContain('once=')
      expect(code).toContain('onyx')
    }
  })

  test('a literal aria-*={false} bakes aria-*="false"', () => {
    for (const code of both(`const A = <div aria-hidden={false} hidden={false}>x</div>`)) {
      expect(code).toContain('aria-hidden=\\"false\\"')
      expect(code).not.toContain(' hidden')
    }
  })

  test('a method call is NOT a string proof — keeps the null-safe runtime helper', () => {
    for (const code of both(`const A = <div data-a={x.join(',')} data-b={n.toFixed(2)}>x</div>`)) {
      expect(code).toContain('_ssrAttrGen("data-a"')
      expect(code).toContain('_ssrAttrGen("data-b"')
    }
  })

  test('String(x) bakes only while String is the global', () => {
    for (const code of both(`const A = <div data-a={String(x)}>x</div>`)) {
      expect(code).toContain('data-a=\\"')
      expect(code).not.toContain('_ssrAttrGen')
    }
    for (const code of both(`function String(v) { return null }\nconst A = <div data-a={String(x)}>x</div>`)) {
      expect(code).toContain('_ssrAttrGen("data-a"')
    }
    for (const code of both(`import { String } from './s'\nconst A = <div data-a={String(x)}>x</div>`)) {
      expect(code).toContain('_ssrAttrGen("data-a"')
    }
  })
})
