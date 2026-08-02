/** @jsxImportSource @pyreon/core */
/**
 * Element's `gap` prop on the SIMPLE path (and the needsFix childFix layer).
 *
 * `gap: Responsive` was typed on Element from inception but wired ONLY into
 * the compound path's Content slot margins — a simple element (the dominant
 * case: a row/column of arbitrary children) silently dropped it, forcing
 * consumers into theme-level flex `gap` overrides. The fix renders modern CSS
 * `gap` from the wrapper bundle; the compound path deliberately keeps its
 * slot-margin machinery (Element's WRAPPER_PROPS gates gap to the simple
 * path), so the two mechanisms can never double up.
 *
 * Bisect-verified: reverting the Wrapper/styled gap line (or the bundle
 * threading) fails the simple + button specs with no `gap:` declaration in
 * the element's resolved rules.
 */
import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Element } from '../Element'

let cleanups: (() => void)[] = []
const mountInDom = (vnode: VNode) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(vnode, root)
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  return root
}

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

/** All styler-injected CSS text whose selector matches any of el's classes. */
const rulesFor = (el: HTMLElement): string => {
  const classes = [...el.classList]
  let out = ''
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(rules)) {
      const text = rule.cssText ?? ''
      if (classes.some((c) => text.includes(`.${c}`))) out += text
    }
  }
  return out
}

describe('Element gap — simple path', () => {
  it('renders CSS gap on a simple div element', () => {
    const root = mountInDom(
      h(Element, { tag: 'div', contentDirection: 'inline', gap: 8 }, [
        h('span', {}, 'a'),
        h('span', {}, 'b'),
      ]) as VNode,
    )
    const el = root.querySelector('div[data-pyr-element]') as HTMLElement
    expect(el).not.toBeNull()
    // unistyle's value() renders numbers in rem against rootSize 16.
    expect(rulesFor(el)).toContain('gap: 0.5rem')
  })

  it('renders CSS gap on the needsFix childFix layer for a button', () => {
    const root = mountInDom(
      h(Element, { tag: 'button', contentDirection: 'inline', gap: 12 }, [
        h('span', {}, 'icon'),
        h('span', {}, 'label'),
      ]) as VNode,
    )
    const btn = root.querySelector('button') as HTMLElement
    expect(btn).not.toBeNull()
    // The two-layer flex fix: the INNER span is the flex container that owns
    // the children — gap must land there, not (only) on the root.
    const inner = btn.firstElementChild as HTMLElement
    expect(inner?.tagName).toBe('SPAN')
    expect(rulesFor(inner)).toContain('gap: 0.75rem')
  })

  it('does NOT feed wrapper gap on the compound path (slot margins own it)', () => {
    const root = mountInDom(
      h(
        Element,
        { tag: 'div', gap: 10, beforeContent: h('span', {}, 'before') },
        h('span', {}, 'content'),
      ) as VNode,
    )
    const el = root.querySelector('div[data-pyr-element]') as HTMLElement
    expect(el).not.toBeNull()
    // The WRAPPER's own rules carry no CSS gap — spacing between slots is the
    // Content margin machinery, asserted by the existing Content tests.
    const wrapperOwnRules = rulesFor(el)
    expect(wrapperOwnRules).not.toContain('gap: 0.625rem')
  })

  it('a simple element without gap renders no gap declaration', () => {
    const root = mountInDom(
      h(Element, { tag: 'div', contentDirection: 'inline' }, [h('span', {}, 'a')]) as VNode,
    )
    const el = root.querySelector('div[data-pyr-element]') as HTMLElement
    expect(rulesFor(el)).not.toContain('gap:')
  })
})
