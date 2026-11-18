/**
 * The typed `styles` override must not create a class, or a cache entry, per
 * instance (Memory-leak class C: an unbounded per-definition cache).
 *
 * - Equal override CONTENT (separate objects) shares one class: `internStyles`
 *   maps it to one canonical object, so the `$element` bundle interns and the
 *   styler's class cache hits; the sheet gains exactly one rule.
 * - Distinct overrides are bounded: the intern LRU holds at most 256 entries,
 *   the bundle class cache is a WeakMap on the (LRU-held) bundle, and each
 *   sheet rule is evictable under the sheet's `maxCacheSize` once no element
 *   in the document carries its class.
 */
import { h } from '@pyreon/core'
import { sheet } from '@pyreon/styler'
import { mountReactive } from '@pyreon/test-utils'
import { PyreonUI } from '@pyreon/ui-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Element } from '../Element'
import { internStyles, internStylesSizeForTest } from '../helpers/instanceStyles'
import { Text } from '../Text'

const theme = { rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768 } }
const N = 1000

const classesOf = (root: ParentNode, selector: string): Set<string> => {
  const out = new Set<string>()
  for (const el of root.querySelectorAll(selector)) out.add(el.className)

  return out
}

/** The live client sheet's rules, as text. */
const liveRules = (): string[] => {
  const el = document.querySelector<HTMLStyleElement>('style[data-pyreon-styler]')

  return el?.sheet ? Array.from(el.sheet.cssRules, (r) => r.cssText) : []
}

describe('typed styles override: caching', () => {
  let cleanup: (() => void) | undefined
  beforeEach(() => sheet.reset())
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  it('equal content in separate objects is interned to one object (key order does not matter)', () => {
    const a = internStyles({ color: 'red', paddingTop: { xs: 4, md: 8 } })
    const b = internStyles({ paddingTop: { md: 8, xs: 4 }, color: 'red' })
    expect(b).toBe(a)
    expect(internStyles({ color: 'blue' })).not.toBe(a)
  })

  it(`${N} Elements with the same override content share one class and add one rule`, () => {
    const before = sheet.cacheSize
    const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
    const prev = g.__pyreon_count__
    let hits = 0
    g.__pyreon_count__ = (name) => {
      if (name === 'styler.elClassCache.hit') hits++
    }
    const items = Array.from({ length: N }, (_, i) =>
      // A fresh object per instance, as an inline JSX literal would be.
      h(Element as never, { 'data-i': i, styles: { gridTemplateColumns: { md: 'repeat(3, 1fr)' }, color: 'red' } }),
    )
    const { container, cleanup: c } = mountReactive(h(PyreonUI as never, { theme }, ...items))
    g.__pyreon_count__ = prev
    cleanup = c
    const classes = classesOf(container, '[data-i]')
    expect(classes.size).toBe(1)
    // …and that class carries the override (happy-dom has no @layer, so the
    // hoisted instance rule is emitted unwrapped; the browser tests check the layer).
    const [cls] = [...classes]
    expect(liveRules().some((r) => r.includes(`.${cls}`) && r.includes('repeat(3, 1fr)'))).toBe(true)
    // Every instance after the first answers from the bundle class cache (the
    // interned bundle), without re-running the CSS pipeline.
    expect(hits).toBe(N - 1)
    // One Element rule for the whole set (base layout + the instance block).
    expect(sheet.cacheSize - before).toBe(1)
  })

  it(`${N} Texts with the same override content share one class`, () => {
    const items = Array.from({ length: N }, (_, i) => h(Text as never, { 'data-i': i, styles: { color: 'red' } }, 'x'))
    const { container, cleanup: c } = mountReactive(h(PyreonUI as never, { theme }, ...items))
    cleanup = c
    expect(classesOf(container, '[data-i]').size).toBe(1)
  })

  it(`${N} distinct overrides stay bounded and leave nothing pinned after unmount`, () => {
    const before = sheet.cacheSize
    const items = Array.from({ length: N }, (_, i) =>
      h(Element as never, { 'data-i': i, styles: { paddingTop: i } }),
    )
    const { container, cleanup: c } = mountReactive(h(PyreonUI as never, { theme }, ...items))
    const classes = classesOf(container, '[data-i]')
    // One class per DISTINCT override (not per instance, not more).
    expect(classes.size).toBe(N)
    expect(sheet.cacheSize - before).toBe(N)
    // The intern LRU is capped.
    expect(internStylesSizeForTest()).toBeLessThanOrEqual(256)

    c()
    // After unmount no element in the document carries any of these classes,
    // so every one of the N rules is evictable by the sheet's maxCacheSize
    // pass (it skips only classes some element still carries).
    for (const cls of classes) expect(document.querySelector(`.${cls.split(' ')[0]}`)).toBeNull()
    expect(internStylesSizeForTest()).toBeLessThanOrEqual(256)
  })
})
