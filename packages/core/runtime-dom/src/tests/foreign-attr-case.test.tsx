/**
 * #4466: the attribute NAME a camelCase prop is written under on an SVG/MathML
 * element. The rule is the HTML parser's — lowercase, then restore its closed
 * "adjust SVG attributes" table (MathML: `definitionURL`) — so an assigned
 * attribute lands where a parsed one (SSR bytes, a `_tpl` bake) does.
 * happy-dom does not reproduce the Chromium symptom (it is not focusable);
 * `foreign-attr-case.browser.test.tsx` asserts that. Here: the name rule, the
 * compiled emit the browser test replays, and SSR agreement.
 */
import { transformJSX } from '@pyreon/compiler'
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { foreignAttrName } from '../props'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

describe('foreignAttrName (#4466)', () => {
  const svg = document.createElementNS(SVG_NS, 'g')
  const math = document.createElementNS(MATHML_NS, 'mi')
  const div = document.createElement('div')

  it.each([
    ['tabIndex', 'tabindex'],
    ['autoFocus', 'autofocus'],
    ['crossOrigin', 'crossorigin'],
    ['referrerPolicy', 'referrerpolicy'],
    ['hrefLang', 'hreflang'],
  ])('SVG: the HTML IDL name %s is written as %s', (key, attr) => {
    expect(foreignAttrName(svg, key)).toBe(attr)
  })

  it.each([
    'viewBox',
    'preserveAspectRatio',
    'gradientUnits',
    'gradientTransform',
    'clipPathUnits',
    'stdDeviation',
    'refX',
    'textLength',
    'xChannelSelector',
  ])('SVG: the parser-cased attribute %s keeps its case', (key) => {
    expect(foreignAttrName(svg, key)).toBe(key)
  })

  it('MathML: tabIndex lowercases, definitionURL keeps its case', () => {
    expect(foreignAttrName(math, 'tabIndex')).toBe('tabindex')
    expect(foreignAttrName(math, 'definitionURL')).toBe('definitionURL')
  })

  it('HTML elements and lowercase names are untouched', () => {
    expect(foreignAttrName(div, 'tabIndex')).toBe('tabIndex')
    expect(foreignAttrName(svg, 'data-x')).toBe('data-x')
    expect(foreignAttrName(svg, 'aria-label')).toBe('aria-label')
    expect(foreignAttrName(svg, 'xlink:href')).toBe('xlink:href')
  })

  it('the compiled emit replayed by the browser test', () => {
    const { code } = transformJSX(
      `import { signal } from '@pyreon/reactivity'\nconst t = signal(0)\nexport const C = () => <svg><g id="c" tabIndex={t()} /></svg>`,
      'c.tsx',
    )
    expect(code).toContain('_tpl("<svg><g id=\\"c\\"></g></svg>"')
    expect(code).toContain('_bindDirect(t, (v) => _setAttr(__e0, "tabIndex", v))')
  })

  it('SSR writes the same lowercase name the client now writes', async () => {
    const html = await renderToString(h('svg', null, h('g', { tabIndex: 0, viewBox: '0 0 1 1' })))
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('viewBox="0 0 1 1"')
  })
})
