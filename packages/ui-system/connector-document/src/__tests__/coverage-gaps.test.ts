import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import {
  parseBoxModel,
  parseCssDimension,
  parseLineHeight,
} from '../cssValueParser'
import type { DocumentMarker } from '../extractDocumentTree'
import { extractDocumentTree } from '../extractDocumentTree'
import { resolveStyles } from '../resolveStyles'

// ─── cssValueParser branch gaps ──────────────────────────────────────────
//
// The full-suite merged coverage leaves three branch arms uncovered. Each
// is a genuine value-shape the existing tests never feed.

describe('cssValueParser — remaining branch arms', () => {
  it('parseBoxModel returns undefined for a 5+-value shorthand (length !== 4 fall-through)', () => {
    // 4-value is the largest supported shorthand; 5+ parts fall through every
    // length branch to the trailing `return undefined`. Exercises the false
    // side of `if (nums.length === 4)`.
    expect(parseBoxModel('1px 2px 3px 4px 5px')).toBeUndefined()
  })

  it('parseLineHeight returns undefined for an unparseable non-normal unit value', () => {
    // 'auto' is not a number, not 'normal', and parseCssDimension can't parse
    // it → `dim` is undefined → the `if (dim != null) return dim` else arm
    // falls through to the trailing `return undefined`.
    expect(parseLineHeight('auto')).toBeUndefined()
    expect(parseLineHeight('calc(1em + 2px)')).toBeUndefined()
  })

  it('parseCssDimension passes a raw number through unchanged (number-guard consequent)', () => {
    // The bare-identifier `return value` on the typeof-number guard. Existing
    // tests already call this with numbers; this keeps the contract explicit
    // alongside the other arms in one place.
    expect(parseCssDimension(42)).toBe(42)
    expect(parseCssDimension(0)).toBe(0)
    expect(parseCssDimension(-3.5)).toBe(-3.5)
  })

  it('parseCssDimension returns undefined for null/undefined/non-string-non-number (typeof-string guard)', () => {
    // null/undefined are not strings → the `typeof value !== 'string'`
    // consequent fires. Also covers a boolean/object that the type signature
    // technically forbids but a `value as string | number` cast at a call
    // site could let through at runtime.
    expect(parseCssDimension(null)).toBeUndefined()
    expect(parseCssDimension(undefined)).toBeUndefined()
    expect(parseCssDimension(true as unknown as string)).toBeUndefined()
    expect(parseCssDimension({} as unknown as string)).toBeUndefined()
  })
})

// ─── resolveStyles branch gaps ───────────────────────────────────────────

describe('resolveStyles — non-px dimension fall-through', () => {
  it('keeps a non-parseable width/height/maxWidth string verbatim (?? fallback right arm)', () => {
    // width: '100%' → parseCssDimension('100%') is undefined → the
    // `w ?? (rocketstyle.width as string)` right arm fires, keeping the
    // original string. Same for height and maxWidth. The existing tests only
    // exercise the LEFT arm (parseable px) for width/height; maxWidth's
    // string-fallback was the only one covered.
    const result = resolveStyles({
      width: '100%',
      height: 'calc(100vh - 40px)',
      maxWidth: 'min(90vw, 1200px)',
    })
    expect(result.width).toBe('100%')
    expect(result.height).toBe('calc(100vh - 40px)')
    expect(result.maxWidth).toBe('min(90vw, 1200px)')
  })

  it('remapStringValues passes a non-string value through untouched (resolveVar ternary else)', () => {
    // The resolveVar shallow-copy maps only STRING values; non-string values
    // (numbers/booleans) take the ternary else arm and pass through verbatim.
    // A resolveVar that throws on non-strings proves the else arm is taken.
    const resolveVar = (v: unknown): unknown => {
      if (typeof v !== 'string') throw new Error('resolveVar should only see strings')
      return v.replace('var(--c)', '#abc')
    }
    const result = resolveStyles({ color: 'var(--c)', fontSize: 18, opacity: 0.5 }, 16, resolveVar)
    expect(result.color).toBe('#abc')
    expect(result.fontSize).toBe(18)
    expect(result.opacity).toBe(0.5)
  })
})

// ─── extractDocumentTree branch gaps ─────────────────────────────────────

const docComponent = (docType: string) => {
  const fn = ((props: { children?: unknown }) =>
    h('div', props as any, props.children as any)) as ((...args: any[]) => any) & DocumentMarker
  ;(fn as any)._documentType = docType
  return fn
}

describe('extractDocumentTree — branch gaps', () => {
  it('reads _documentType from the rocketstyle `.meta` static (getDocumentType meta path)', () => {
    // Real rocketstyle primitives expose `_documentType` on `fn.meta`, not on
    // the function directly. getDocumentType's `meta?._documentType` arm.
    const HeadingViaMeta = ((props: { _documentProps?: unknown }) =>
      h('div', props)) as ((...args: any[]) => any) & { meta: { _documentType: string } }
    ;(HeadingViaMeta as any).meta = { _documentType: 'heading' }

    const tree = extractDocumentTree(
      h(HeadingViaMeta as any, { _documentProps: { level: 2 } }, 'Title'),
    )
    expect(tree.type).toBe('heading')
    expect(tree.props).toEqual({ level: 2 })
  })

  it('flattens a nested ARRAY child (flattenChildren Array.isArray arm)', () => {
    // h() spreads varargs, so to land a literal array as a single child we
    // hand-construct the vnode's children list with a nested array inside.
    const Section = docComponent('section')
    const Text = docComponent('text')
    const inner = h(Text, {}, 'nested') as any
    const tree: any = {
      type: Section,
      props: {},
      children: [[inner, 'loose-string']],
    }
    const result = extractDocumentTree(tree)
    expect(result.type).toBe('section')
    expect(result.children).toHaveLength(2)
    expect((result.children[0] as any).type).toBe('text')
    expect(result.children[1]).toBe('loose-string')
  })

  it('resolves a getter child returning an ARRAY (flattenChildren resolved-Array arm)', () => {
    const Section = docComponent('section')
    const Text = docComponent('text')
    const tree = h(Section, {}, () => [h(Text, {}, 'a') as any, h(Text, {}, 'b') as any] as any)
    const result = extractDocumentTree(tree)
    expect(result.type).toBe('section')
    expect(result.children).toHaveLength(2)
    expect((result.children[0] as any).children).toEqual(['a'])
    expect((result.children[1] as any).children).toEqual(['b'])
  })

  it('drops a non-VNode object child (extractChildren isVNode false arm)', () => {
    // An object that is not null/string/number AND fails isVNode (no
    // type/props) is silently dropped.
    const Section = docComponent('section')
    const tree: any = {
      type: Section,
      props: {},
      children: [{ notAVNode: true }, 'kept'],
    }
    const result = extractDocumentTree(tree)
    expect(result.children).toEqual(['kept'])
  })

  it('drops a child whose extractNode returns null (extractChildren extracted-null arm)', () => {
    // A DOM element with NO children → extractNode('span', ...) returns null →
    // the `else if (extracted != null)` arm is false → nothing pushed.
    const Section = docComponent('section')
    const tree = h(Section, {}, h('span', {}) as any, 'after')
    const result = extractDocumentTree(tree)
    // The empty span contributes nothing; only the string survives.
    expect(result.children).toEqual(['after'])
  })

  it('Path C handles a SINGLE child via children[0] AND multiple via the array (children-length ternary)', () => {
    // rsAttrs fast path: when children.length === 1, mergedProps.children is
    // the single child; when > 1, it is the array. The attrs callback reads
    // children so both arms are observable.
    let seenSingle: unknown
    let seenMulti: unknown
    const makeRocketDoc = (sink: (c: unknown) => void) => {
      const fn = ((props: any) => h('div', props, props.children)) as ((p: any) => any) &
        DocumentMarker
      ;(fn as any)._documentType = 'document'
      ;(fn as any).__rs_attrs = [
        (props: { children?: unknown }) => {
          sink(props.children)
          return { _documentProps: { ok: true } }
        },
      ]
      return fn
    }

    extractDocumentTree(h(makeRocketDoc((c) => (seenSingle = c)) as any, {}, 'only'))
    extractDocumentTree(h(makeRocketDoc((c) => (seenMulti = c)) as any, {}, 'a', 'b', 'c'))

    expect(seenSingle).toBe('only')
    expect(Array.isArray(seenMulti)).toBe(true)
    expect(seenMulti).toEqual(['a', 'b', 'c'])
  })

  it('Path C with __rs_attrs that return NO _documentProps (attrsResult else arm)', () => {
    // rsAttrs runs but produces no _documentProps key → rawDocProps stays
    // undefined → docProps is {}. The node still extracts with empty props.
    const fn = ((props: any) => h('div', props, props.children)) as ((p: any) => any) &
      DocumentMarker
    ;(fn as any)._documentType = 'section'
    ;(fn as any).__rs_attrs = [() => ({ someUnrelatedAttr: 'x' })]

    const tree = extractDocumentTree(h(fn as any, {}, 'body'))
    expect(tree.type).toBe('section')
    expect(tree.props).toEqual({})
    expect(tree.children).toEqual(['body'])
  })

  it('Path B where the component returns a NON-VNode (isVNode(result) false arm)', () => {
    // Non-rocketstyle docComponent (no __rs_attrs) whose body returns a
    // primitive → isVNode(result) is false → rawDocProps stays undefined.
    const fn = (() => null) as unknown as ((p: any) => any) & DocumentMarker
    ;(fn as any)._documentType = 'divider'

    const tree = extractDocumentTree(h(fn as any, {}))
    expect(tree.type).toBe('divider')
    expect(tree.props).toEqual({})
  })

  it('docType vnode with children explicitly null uses the `?? []` fallback', () => {
    // Hand-constructed vnode whose `children` is null (real h() always sets
    // []). Exercises `extractChildren(children ?? [])` right arm for a
    // documentType node.
    const Section = docComponent('section')
    const tree: any = { type: Section, props: { _documentProps: { x: 1 } }, children: null }
    const result = extractDocumentTree(tree)
    expect(result.type).toBe('section')
    expect(result.props).toEqual({ x: 1 })
    expect(result.children).toEqual([])
  })

  it('function-without-documentType passing MULTIPLE children uses the array arm', () => {
    // A plain wrapper component (no _documentType) that receives >1 children
    // → mergedProps.children is the array (the `: children` ternary else arm).
    const Text = docComponent('text')
    const Wrapper = (props: any) => {
      // assert the wrapper saw an array of two children
      expect(Array.isArray(props.children)).toBe(true)
      return h(Text, {}, ...(props.children as any[]))
    }
    const tree = h(Wrapper as any, {}, 'one', 'two')
    const result = extractDocumentTree(tree)
    expect(result.type).toBe('text')
    expect(result.children).toEqual(['one', 'two'])
  })

  it('function-without-documentType returning a non-string/non-number primitive yields null', () => {
    // Body returns undefined → not a vnode, not string, not number →
    // extractNode returns null → outer wraps in an empty document.
    const Fn = (() => undefined) as any
    const result = extractDocumentTree(h(Fn, {}))
    expect(result.type).toBe('document')
    expect(result.children).toEqual([])
  })

  it('a vnode with a non-string, non-function type returns null (trailing return)', () => {
    // type is neither a function (no docType, not a component) nor a string —
    // none of the branches fire and extractNode falls through to `return
    // null`. Hand-constructed: numeric type passes isVNode (has type+props).
    const tree: any = { type: 123, props: {}, children: ['x'] }
    const result = extractDocumentTree(tree)
    expect(result.type).toBe('document')
    expect(result.children).toEqual([])
  })

  it('a DOM-element vnode with children explicitly null uses the `?? []` fallback', () => {
    // String-type element with children: null → extractChildren(children ??
    // []) right arm → [] → returns null → outer wraps as empty document.
    const tree: any = { type: 'div', props: {}, children: null }
    const result = extractDocumentTree(tree)
    expect(result.type).toBe('document')
    expect(result.children).toEqual([])
  })
})
