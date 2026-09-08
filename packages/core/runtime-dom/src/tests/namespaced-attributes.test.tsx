/**
 * Namespaced JSX attributes — the DRIFT LOCK for the real-Chromium twin.
 *
 * `namespaced-attributes.browser.test.tsx` hand-writes the compiled shapes and
 * the server bytes because neither `@pyreon/compiler` (oxc-parser's native
 * binding) nor `@pyreon/runtime-server` (`node:async_hooks`) can load in the
 * page. This file is what makes those hand-written strings evidence rather than
 * a guess: it drives the REAL `transformJSX` and the REAL `renderToString` and
 * asserts they emit exactly those strings.
 *
 * It deliberately asserts NOTHING about namespaces. happy-dom auto-namespaces
 * `setAttribute('xlink:href', …)` by PREFIX — measured — where Chromium creates
 * a null-namespace attribute, so every namespace assertion here would pass
 * against the broken build. That half is the browser twin's job, and splitting
 * it this way is the point: this file locks the COMPILER, that one locks the
 * BROWSER.
 */
import { transformJSX, transformJSX_JS } from '@pyreon/compiler'
import { describe, expect, it } from 'vitest'

const emit = (src: string): string =>
  transformJSX(src, 'test.tsx').code.replace(/^import\s+.*$/gm, '').trim()

describe('compiler emit — namespaced attributes reach the template path', () => {
  it('TEMPLATIZES rather than bailing to h()', () => {
    // The bail this replaced cost the element its template: the JSX was left
    // verbatim in the output for the downstream transform.
    const code = emit('const A = () => <svg><use xlink:href="#icon"/></svg>')
    expect(code).toContain('_tpl(')
    // The bail left the JSX verbatim (`() => <svg><use …/></svg>`) for the
    // downstream transform. `<use` appears in the BAKED string either way, so
    // the discriminator is the JSX syntax that survives only a bail: a
    // self-closing tag, and an element in return position.
    expect(code).not.toContain('/>')
    expect(code).not.toMatch(/=>\s*</)
  })

  it('bakes the QUALIFIED name into the template HTML', () => {
    const code = emit('const A = () => <svg><use xlink:href="#icon"/></svg>')
    expect(code).toContain('xlink:href=\\"#icon\\"')
    // The pre-bail JS backend baked `<use ="/static">` — an EMPTY name.
    expect(code).not.toContain('<use =')
  })

  it('passes the QUALIFIED name to _setAttr for a dynamic value', () => {
    const code = emit('const B = (props) => <svg><use xlink:href={props.id}/></svg>')
    expect(code).toContain('_setAttr(__e0, "xlink:href", props.id)')
    // The pre-bail JS backend emitted `_setAttr(el, "", u)`.
    expect(code).not.toContain('_setAttr(__e0, ""')
  })

  it('does not disturb an unnamespaced sibling on the same element', () => {
    const code = emit('const C = (p) => <svg><use xlink:href={p.id} class="i"/></svg>')
    expect(code).toContain('class=\\"i\\"')
    expect(code).toContain('_setAttr(__e0, "xlink:href", p.id)')
  })
})

describe('the browser twin’s hand-written shapes are what the compiler emits', () => {
  // Each pair is (source, the exact string the browser test hand-writes).
  const CASES: Array<[string, string, string]> = [
    [
      'STATIC_TPL',
      '<svg width="100" height="100"><use xlink:href="#icon"/></svg>',
      '_tpl("<svg width=\\"100\\" height=\\"100\\"><use xlink:href=\\"#icon\\"></use></svg>", () => null)',
    ],
    [
      'xml:lang in SVG',
      '<svg><text xml:lang="cs">x</text></svg>',
      '_tpl("<svg><text xml:lang=\\"cs\\">x</text></svg>", () => null)',
    ],
    [
      'xml:lang on HTML',
      '<p xml:lang="cs">x</p>',
      '_tpl("<p xml:lang=\\"cs\\">x</p>", () => null)',
    ],
  ]
  for (const [name, src, expected] of CASES) {
    it(`${name} emits the hand-written template verbatim`, () => {
      expect(emit(src)).toBe(expected)
    })
  }

  it('the DYNAMIC shape emits the hand-written bind body', () => {
    expect(emit('<svg width="100" height="100"><use xlink:href={id()}/></svg>')).toBe(
      '_tpl("<svg width=\\"100\\" height=\\"100\\"><use></use></svg>", (__root) => {\n' +
        '  const __e0 = __root.firstElementChild;\n' +
        '  const __d0 = _bindDirect(id, (v) => _setAttr(__e0, "xlink:href", v));\n' +
        '  return __d0\n' +
        '})',
    )
  })

  it('the SIBLINGS shape emits the hand-written ref walk', () => {
    expect(
      emit(
        '<svg width="100" height="100"><title>t</title>' +
          '<use xlink:href={id()} class="i"/><desc>d</desc></svg>',
      ),
    ).toBe(
      '_tpl("<svg width=\\"100\\" height=\\"100\\"><title>t</title>' +
        '<use class=\\"i\\"></use><desc>d</desc></svg>", (__root) => {\n' +
        '  const __e0 = __root.firstElementChild.nextElementSibling;\n' +
        '  const __d0 = _bindDirect(id, (v) => _setAttr(__e0, "xlink:href", v));\n' +
        '  return __d0\n' +
        '})',
    )
  })
})

describe('both backends agree byte-for-byte', () => {
  // `transformJSX` prefers the NATIVE binary, so an assertion on it alone says
  // nothing about the JS fallback (and vice versa). The native-equivalence suite
  // carries the general corpus; these are the shapes THIS change introduced.
  const SOURCES = [
    'const A = () => <svg><use xlink:href="#icon"/></svg>',
    'const B = (props) => <svg><use xlink:href={props.id}/></svg>',
    'const C = () => <p xml:lang="cs">x</p>',
    'const D = (p) => <svg><title>t</title><use xlink:href={p.id} class="i"/></svg>',
    'const E = () => <svg><use xlink:href="#a" xlink:title="t"/></svg>',
    'const F = (p) => <svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href={p.id}/></svg>',
  ]
  for (const src of SOURCES) {
    it(`native === JS for: ${src.slice(0, 52)}`, () => {
      expect(transformJSX(src, 't.tsx').code).toBe(transformJSX_JS(src, 't.tsx').code)
    })
  }
})
