import { h, type VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { sheet } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import type { Theme } from '@pyreon/ui-theme'
import { afterAll, beforeAll } from 'vitest'

/**
 * A component's emitted CSS, read in happy-dom.
 *
 * happy-dom has no cascade worth trusting, and its CSS parser drops a whole
 * rule that contains nesting (`&:hover { … }`), so the live `cssRules` of a
 * rocketstyle class read back EMPTY. What the styler hands `sheet.insert` is
 * the exact text a browser receives, so this records that text per class name
 * and parses it: the declarations on the element itself, and each nested
 * block (`&:hover`, `&:focus-visible`, …) by its selector.
 *
 * Real computed colours (contrast, cascade between layers) stay with the
 * `*.browser.test.tsx` suites; this is the node-side statement of what a
 * component asks the browser to draw.
 *
 * Usage: call {@link recordEmittedStyles} once at the top of a test file,
 * then {@link renderStyles} per case.
 */

export type Declarations = Record<string, string>

export interface EmittedStyles {
  /** Declarations on the element: the `elements` layer, then `rocketstyle` over it (the sheet's layer order). */
  base: Declarations
  /** Nested blocks by selector, e.g. `&:hover`, `&:focus-visible`. */
  nested: Record<string, Declarations>
}

interface Recorded {
  cssText: string
  layer: string | undefined
}

const recorded = new Map<string, Recorded>()

/**
 * Wraps `sheet.insert` for the current test file so every class the styler
 * creates (or answers from its cache) can be mapped back to its CSS text.
 * A plain wrapper rather than `vi.spyOn`: the shared config sets
 * `mockReset`, which would drop a spy between tests while the styler's
 * class cache keeps answering repeat renders without a second insert.
 */
export const recordEmittedStyles = (): void => {
  let original: typeof sheet.insert | undefined

  beforeAll(() => {
    const insert = sheet.insert.bind(sheet)
    original = sheet.insert
    sheet.insert = (cssText, insertLayer, use) => {
      const className = insert(cssText, insertLayer, use)
      recorded.set(className, { cssText, layer: insertLayer })
      return className
    }
  })

  afterAll(() => {
    if (original) sheet.insert = original
    recorded.clear()
  })
}

/** Splits CSS text at top-level `;` and `{ … }` blocks, respecting quotes and parentheses. */
const parse = (cssText: string, into: EmittedStyles, prefix = ''): void => {
  let buffer = ''
  let i = 0
  const declare = (raw: string) => {
    const colon = raw.indexOf(':')
    if (colon === -1) return
    const prop = raw.slice(0, colon).trim()
    const value = raw.slice(colon + 1).trim()
    if (!prop || !value) return
    const target = prefix ? (into.nested[prefix] ??= {}) : into.base
    target[prop] = value
  }

  while (i < cssText.length) {
    const ch = cssText[i]!
    if (ch === '"' || ch === "'") {
      const close = cssText.indexOf(ch, i + 1)
      const end = close === -1 ? cssText.length : close + 1
      buffer += cssText.slice(i, end)
      i = end
      continue
    }
    if (ch === '(') {
      let depth = 0
      let j = i
      for (; j < cssText.length; j++) {
        if (cssText[j] === '(') depth++
        else if (cssText[j] === ')' && --depth === 0) break
      }
      buffer += cssText.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (ch === '{') {
      let depth = 0
      let j = i
      for (; j < cssText.length; j++) {
        if (cssText[j] === '{') depth++
        else if (cssText[j] === '}' && --depth === 0) break
      }
      const selector = buffer.trim()
      buffer = ''
      into.nested[prefix ? `${prefix} ${selector}` : selector] ??= {}
      parse(cssText.slice(i + 1, j), into, prefix ? `${prefix} ${selector}` : selector)
      i = j + 1
      continue
    }
    if (ch === ';') {
      declare(buffer)
      buffer = ''
      i++
      continue
    }
    buffer += ch
    i++
  }
  declare(buffer)
}

const LAYER_ORDER = ['elements', 'rocketstyle']

/** The emitted styles of one element, from the classes the styler recorded for it. */
export const emittedStylesOf = (el: Element): EmittedStyles => {
  const out: EmittedStyles = { base: {}, nested: {} }
  const found = [...el.classList]
    .map((c) => recorded.get(c))
    .filter((r): r is Recorded => r !== undefined)
    .sort((a, b) => LAYER_ORDER.indexOf(a.layer ?? '') - LAYER_ORDER.indexOf(b.layer ?? ''))
  if (found.length === 0) {
    throw new Error(
      `[Pyreon] no recorded styler class on <${el.tagName.toLowerCase()} class="${el.className}">. Call recordEmittedStyles() at the top of the test file.`,
    )
  }
  for (const r of found) parse(r.cssText, out)

  return out
}

/**
 * Mounts `node` through the real `h()` under `<PyreonUI theme mode>` and
 * returns the emitted styles of its `[data-measure]` element.
 */
export const renderStyles = (node: VNodeChild, theme: Theme, mode: 'light' | 'dark'): EmittedStyles => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(h(PyreonUI, { theme, mode }, node), root)
  try {
    const el = root.querySelector('[data-measure]')
    if (!el) throw new Error('[Pyreon] renderStyles: the rendered tree has no [data-measure] element; put the attribute on the component to measure.')
    return emittedStylesOf(el)
  } finally {
    dispose()
    root.remove()
  }
}

/** Splits a CSS value at top-level spaces (`rgba(1, 2, 3)` stays whole). */
const splitValue = (value: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ' ' && depth === 0) {
      if (current) parts.push(current)
      current = ''
    } else current += ch
  }
  if (current) parts.push(current)

  return parts
}

const EDGE_INDEX = { top: 0, right: 1, bottom: 2, left: 3 } as const

/**
 * The colour of one border edge as declared: the longhand
 * (`border-bottom-color`) when present, else that edge of the
 * `border-color` shorthand. unistyle folds edge longhands into the shorthand
 * when it can, so a test asserting the bottom edge must read both.
 */
export const borderEdgeColor = (decls: Declarations | undefined, edge: keyof typeof EDGE_INDEX): string | undefined => {
  if (!decls) return undefined
  const longhand = decls[`border-${edge}-color`]
  if (longhand) return longhand
  const shorthand = decls['border-color']
  if (!shorthand) return undefined
  const values = splitValue(shorthand)
  // CSS shorthand expansion: 1 value = all, 2 = vertical/horizontal, 3 = top/horizontal/bottom, 4 = each.
  const i = EDGE_INDEX[edge]
  if (values.length === 1) return values[0]
  if (values.length === 2) return values[i % 2]
  if (values.length === 3) return values[i === 3 ? 1 : i]

  return values[i]
}
