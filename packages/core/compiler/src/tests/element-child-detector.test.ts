/**
 * P0 element-child collapse — PR 1 (detector + serializer, measurement
 * gate). `detectCollapsibleShape` bails on ANY element child; this
 * detector recognises the SAFE subset (recursively-static DOM-element
 * subtrees) so a later PR's SSR resolver can bake the whole subtree into
 * the `_rsCollapse` template with nothing reactive lost.
 *
 * Contract under test (mirrors the conservative discipline of the full
 * `detectCollapsibleShape` + the `on*`-handler partial detector — every
 * uncertain signal bails):
 *
 *   - lowercase DOM tag + string-literal props + static-text/static-elem
 *     children → StaticChildNode tree (recursive)
 *   - component child (uppercase tag) → null (own reactivity)
 *   - `on*` handler on the child → null (can't survive baking)
 *   - `{expr}` prop / spread / boolean attr → null
 *   - `{expr}` child / fragment child → null
 *   - serializer: structurally-different subtrees → different strings
 *     (key-collision guard); identical subtrees → identical strings
 *
 * Bisect-verify (documented in the PR body): replace the body of
 * `detectStaticElementChild` with `return null` → the POSITIVE specs
 * fail with `expected null to be …`; the NEGATIVE specs still pass
 * (they assert null). Restore → all green. The asymmetry proves the
 * positive assertions are load-bearing on the static-recursion logic.
 */
import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import {
  collectStaticChildren,
  detectStaticElementChild,
  serializeStaticChildren,
  type StaticChild,
} from '../jsx'

/** Parse a JSX snippet and return its first JSXElement node. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstJsxElement(code: string): any {
  const { program } = parseSync('input.tsx', code, { sourceType: 'module', lang: 'tsx' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let found: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (node: any): void => {
    if (found || !node || typeof node !== 'object') return
    if (node.type === 'JSXElement') {
      found = node
      return
    }
    for (const k in node) {
      const v = node[k]
      if (Array.isArray(v)) for (const c of v) visit(c)
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v)
    }
  }
  visit(program)
  return found
}

describe('detectStaticElementChild — positive (recursively-static)', () => {
  it('accepts a static DOM element with literal props + text', () => {
    const node = firstJsxElement('<span class="x">Save</span>')
    const result = detectStaticElementChild(node)
    expect(result).toEqual({ tag: 'span', props: { class: 'x' }, children: ['Save'] })
  })

  it('accepts a nested static subtree (recursive)', () => {
    const node = firstJsxElement('<span class="a"><b data-k="v">Hi</b></span>')
    const result = detectStaticElementChild(node)
    expect(result).toEqual({
      tag: 'span',
      props: { class: 'a' },
      children: [{ tag: 'b', props: { 'data-k': 'v' }, children: ['Hi'] }],
    })
  })

  it('accepts mixed text + element children, preserving inline whitespace (cleanJsxText)', () => {
    // Single-line text has no newline → preserved verbatim, so the space
    // before <b> survives (faithful for PR 2 reconstruction — would
    // otherwise render "Savenow" instead of "Save now").
    const node = firstJsxElement('<span>Save <b>now</b></span>')
    const result = detectStaticElementChild(node)
    expect(result).toEqual({
      tag: 'span',
      props: {},
      children: ['Save ', { tag: 'b', props: {}, children: ['now'] }],
    })
  })

  it('drops newline-only whitespace between elements (JSX semantics)', () => {
    // Multiline indentation between elements is whitespace-only-with-newline
    // → cleanJsxText drops it, matching how JSX itself renders (no stray
    // whitespace nodes). Real corpus shape (Stack/Progress demos).
    const node = firstJsxElement(`<span>
      <b>a</b>
      <i>b</i>
    </span>`)
    const result = detectStaticElementChild(node)
    expect(result).toEqual({
      tag: 'span',
      props: {},
      children: [
        { tag: 'b', props: {}, children: ['a'] },
        { tag: 'i', props: {}, children: ['b'] },
      ],
    })
  })

  it('accepts a self-closing static element (no children)', () => {
    const node = firstJsxElement('<hr class="rule" />')
    expect(detectStaticElementChild(node)).toEqual({
      tag: 'hr',
      props: { class: 'rule' },
      children: [],
    })
  })

  it('accepts a static SVG icon subtree (the prime element-child use case)', () => {
    const node = firstJsxElement(
      '<svg viewBox="0 0 16 16" width="16"><path d="M1 1h14v14H1z" fill="currentColor" /></svg>',
    )
    expect(detectStaticElementChild(node)).toEqual({
      tag: 'svg',
      props: { viewBox: '0 0 16 16', width: '16' },
      children: [
        { tag: 'path', props: { d: 'M1 1h14v14H1z', fill: 'currentColor' }, children: [] },
      ],
    })
  })

  it('accepts deeply-nested static subtrees (3 levels)', () => {
    const node = firstJsxElement('<div class="a"><span class="b"><em class="c">x</em></span></div>')
    expect(detectStaticElementChild(node)).toEqual({
      tag: 'div',
      props: { class: 'a' },
      children: [
        {
          tag: 'span',
          props: { class: 'b' },
          children: [{ tag: 'em', props: { class: 'c' }, children: ['x'] }],
        },
      ],
    })
  })
})

describe('detectStaticElementChild — negative (hard bail)', () => {
  it('bails on a component child (uppercase tag)', () => {
    expect(detectStaticElementChild(firstJsxElement('<Icon name="x" />'))).toBeNull()
  })

  it('bails on an on* handler on the element', () => {
    expect(
      detectStaticElementChild(firstJsxElement('<span onClick={h}>x</span>')),
    ).toBeNull()
  })

  it('bails on a dynamic {expr} prop', () => {
    expect(
      detectStaticElementChild(firstJsxElement('<span class={dyn}>x</span>')),
    ).toBeNull()
  })

  it('bails on a spread attribute', () => {
    expect(
      detectStaticElementChild(firstJsxElement('<span {...rest}>x</span>')),
    ).toBeNull()
  })

  it('bails on a boolean (valueless) attribute', () => {
    expect(detectStaticElementChild(firstJsxElement('<span hidden>x</span>'))).toBeNull()
  })

  it('bails on an expression child', () => {
    expect(
      detectStaticElementChild(firstJsxElement('<span>{value}</span>')),
    ).toBeNull()
  })

  it('bails when a NESTED child is non-static (recursive bail)', () => {
    expect(
      detectStaticElementChild(firstJsxElement('<span><b onClick={h}>x</b></span>')),
    ).toBeNull()
    expect(
      detectStaticElementChild(firstJsxElement('<span><Inner /></span>')),
    ).toBeNull()
  })

  it('bails on a style object-literal prop (not a string literal)', () => {
    // `style={{ color: 'red' }}` is a JSXExpressionContainer wrapping an
    // object — NOT a string literal — so it bails. (The real corpus uses
    // string `style="…"` on static children, which IS accepted.)
    expect(
      detectStaticElementChild(firstJsxElement("<span style={{ color: 'red' }}>x</span>")),
    ).toBeNull()
  })

  it('bails on a fragment child', () => {
    expect(
      detectStaticElementChild(firstJsxElement('<span><>x</></span>')),
    ).toBeNull()
  })

  it('bails on a JSX-comment child (empty expression container)', () => {
    expect(
      detectStaticElementChild(firstJsxElement('<span>{/* c */}x</span>')),
    ).toBeNull()
  })
})

describe('collectStaticChildren — parent children list', () => {
  it('collects a parent element-child list', () => {
    const node = firstJsxElement('<button class="b">Save <span>now</span></button>')
    expect(collectStaticChildren(node)).toEqual([
      'Save ',
      { tag: 'span', props: {}, children: ['now'] },
    ])
  })

  it('bails when any child is non-static', () => {
    const node = firstJsxElement('<button>Save <Icon /></button>')
    expect(collectStaticChildren(node)).toBeNull()
  })
})

describe('serializeStaticChildren — determinism + discrimination', () => {
  const ser = (children: StaticChild[]) => serializeStaticChildren(children)

  it('is deterministic — identical subtrees produce identical strings', () => {
    const a: StaticChild[] = [{ tag: 'span', props: { class: 'x' }, children: ['Save'] }]
    const b: StaticChild[] = [{ tag: 'span', props: { class: 'x' }, children: ['Save'] }]
    expect(ser(a)).toBe(ser(b))
  })

  it('is prop-order-independent (sorted keys)', () => {
    const a: StaticChild[] = [{ tag: 'span', props: { a: '1', b: '2' }, children: [] }]
    const b: StaticChild[] = [{ tag: 'span', props: { b: '2', a: '1' }, children: [] }]
    expect(ser(a)).toBe(ser(b))
  })

  it('discriminates different tags', () => {
    expect(ser([{ tag: 'span', props: {}, children: ['x'] }])).not.toBe(
      ser([{ tag: 'b', props: {}, children: ['x'] }]),
    )
  })

  it('discriminates different text', () => {
    expect(ser(['Save'])).not.toBe(ser(['Send']))
  })

  it('discriminates different prop values', () => {
    expect(ser([{ tag: 'span', props: { class: 'x' }, children: [] }])).not.toBe(
      ser([{ tag: 'span', props: { class: 'y' }, children: [] }]),
    )
  })

  it('discriminates different child structure', () => {
    expect(ser([{ tag: 'span', props: {}, children: ['x'] }])).not.toBe(
      ser([{ tag: 'span', props: {}, children: [{ tag: 'b', props: {}, children: ['x'] }] }]),
    )
  })

  it('a text segment cannot forge an element marker', () => {
    // Text content that LOOKS like a tag name must not collide with a
    // real element node — the C0 control-char delimiters guarantee it.
    expect(ser(['span'])).not.toBe(ser([{ tag: 'span', props: {}, children: [] }]))
  })
})
