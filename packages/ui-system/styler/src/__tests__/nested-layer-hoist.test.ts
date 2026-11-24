import { accessInternal } from '@pyreon/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LAYER_ORDER, StyleSheet } from '../sheet'

/**
 * A NAMED `@layer <name> { … }` block inside a component's CSS goes into that
 * TOP-LEVEL layer, under the component's own class name, instead of becoming a
 * sublayer of the component's `layer` option (#4354). `@pyreon/elements` uses
 * it to put a per-instance `css` prop in `@layer instance`, above the
 * component's theme in `@layer rocketstyle`, while the rest of the same class
 * stays in `@layer elements`. One class name, two layers: nothing per instance
 * is added to any cache.
 */

function makeSSRSheet(): StyleSheet {
  const originalDoc = globalThis.document
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true, writable: true })
  const s = new StyleSheet()
  Object.defineProperty(globalThis, 'document', { value: originalDoc, configurable: true, writable: true })

  return s
}

const ORDER = '@layer elements, rocketstyle, instance;'

describe('nested @layer blocks are hoisted to their own top-level layer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('declares the instance layer last in the framework order', () => {
    expect(LAYER_ORDER).toEqual(['elements', 'rocketstyle', 'instance'])
  })

  it('a plain property: base in the component layer, the block in its own', () => {
    const s = makeSSRSheet()
    const cls = s.insert('display: flex; @layer instance{color: red;}', 'elements')
    const rules = s.getStyleRules()
    expect(rules).toEqual([
      `@layer elements{.${cls}{display: flex;}}`,
      `@layer instance{.${cls}{color: red;}}`,
    ])
  })

  it('a pseudo-class inside the block stays nested under the same selector', () => {
    const s = makeSSRSheet()
    const cls = s.insert('display: flex; @layer instance{&:hover { color: red; }}', 'elements')
    expect(s.getStyleRules()).toContain(`@layer instance{.${cls}{&:hover { color: red; }}}`)
  })

  it('@media inside the block becomes its own rule in that layer', () => {
    const s = makeSSRSheet()
    const cls = s.insert(
      'display: flex; @layer instance{grid-template-columns: 1fr; @media (min-width: 768px){grid-template-columns: repeat(3, 1fr);}}',
      'elements',
    )
    expect(s.getStyleRules()).toEqual([
      `@layer elements{.${cls}{display: flex;}}`,
      `@layer instance{.${cls}{grid-template-columns: 1fr;}}`,
      `@layer instance{@media (min-width: 768px){.${cls}{grid-template-columns: repeat(3, 1fr);}}}`,
    ])
  })

  it('a block inside @media keeps the media condition (responsive instance css)', () => {
    const s = makeSSRSheet()
    const cls = s.insert('display: flex; @media (min-width: 48em){width: 100%; @layer instance{color: blue;}}', 'elements')
    expect(s.getStyleRules()).toEqual([
      `@layer elements{.${cls}{display: flex;}}`,
      `@layer elements{@media (min-width: 48em){.${cls}{width: 100%;}}}`,
      `@layer instance{@media (min-width: 48em){.${cls}{color: blue;}}}`,
    ])
  })

  it('a media block holding only a layer block, and one holding another media block', () => {
    const s = makeSSRSheet()
    const cls = s.insert(
      'color: red; @media (min-width: 48em){@layer instance{color: blue;}} @media (min-width: 64em){width: 1px; @media (hover: hover){width: 2px;} @layer instance{@layer x{width: 3px;}}}',
      'elements',
    )
    expect(s.getStyleRules()).toEqual([
      `@layer elements{.${cls}{color: red;}}`,
      `@layer elements{@media (min-width: 64em){.${cls}{width: 1px;}}}`,
      `@layer elements{@media (min-width: 64em){@media (hover: hover){.${cls}{width: 2px;}}}}`,
      `@layer instance{@media (min-width: 48em){.${cls}{color: blue;}}}`,
      `@layer instance.x{@media (min-width: 64em){.${cls}{width: 3px;}}}`,
    ])
  })

  it('an unterminated block leaves the CSS unsplit, as before', () => {
    const s = makeSSRSheet()
    const cls = s.insert('color: red; @layer instance{color: blue;', 'elements')
    expect(s.getStyleRules()).toEqual([`@layer elements{.${cls}{color: red; @layer instance{color: blue;}}`])
  })

  it('a block nested in a block is the dotted sublayer, as in CSS', () => {
    const s = makeSSRSheet()
    const cls = s.insert('@layer a{color: red; @layer b{color: blue;}}', 'elements')
    expect(s.getStyleRules()).toEqual([`@layer a{.${cls}{color: red;}}`, `@layer a.b{.${cls}{color: blue;}}`])
  })

  it('an anonymous @layer block is left where it was', () => {
    const s = makeSSRSheet()
    const cls = s.insert('color: red; @layer {color: blue;}', 'elements')
    expect(s.getStyleRules()).toEqual([`@layer elements{.${cls}{color: red; @layer {color: blue;}}}`])
  })

  it('the class name is the hash of the CSS text, so SSR and client agree', () => {
    const css = 'display: flex; @layer instance{color: red;}'
    expect(makeSSRSheet().insert(css, 'elements')).toBe(new StyleSheet().insert(css, 'elements'))
  })

  it('the order statement is emitted once, first, when hoisted rules exist', () => {
    const s = makeSSRSheet()
    s.insert('display: flex; @layer instance{color: red;}', 'elements')
    s.insert('color: blue;', 'rocketstyle')
    const tag = s.getStyleTag()
    const css = tag.slice(tag.indexOf('>') + 1)
    expect(css.indexOf(ORDER)).toBe(0)
    expect(css.split(ORDER).length - 1).toBe(1)
  })

  it('without @layer support (client fallback) hoisted rules are emitted unwrapped, after the base', () => {
    const s = new StyleSheet()
    const internal = accessInternal<{ supportsLayer: boolean; sheet: CSSStyleSheet }>(s)
    internal.supportsLayer = false
    const attempted: string[] = []
    vi.spyOn(internal.sheet, 'insertRule').mockImplementation((rule: string) => {
      attempted.push(rule)
      return 0
    })
    // Distinct CSS per client test: client sheets share (and hydrate from) one
    // <style> element, so a class another test inserted counts as present.
    const cls = s.insert('display: block; @layer instance{color: teal;}', 'elements')
    expect(attempted).toEqual([`.${cls}{display: block;}`, `.${cls}{color: teal;}`])
  })

  it('with @layer support on the client the hoisted rules carry their layer', () => {
    const s = new StyleSheet()
    const internal = accessInternal<{ supportsLayer: boolean; sheet: CSSStyleSheet }>(s)
    internal.supportsLayer = true
    const attempted: string[] = []
    vi.spyOn(internal.sheet, 'insertRule').mockImplementation((rule: string) => {
      attempted.push(rule)
      return 0
    })
    const cls = s.insert('display: inline; @layer instance{color: navy;}', 'elements')
    expect(attempted).toEqual([`@layer elements{.${cls}{display: inline;}}`, `@layer instance{.${cls}{color: navy;}}`])
  })
})
