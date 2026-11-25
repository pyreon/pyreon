// @vitest-environment happy-dom
/**
 * The child-text rule (`child-text.ts`): which child values a renderer MOUNTS
 * and what text every other value has. `@pyreon/runtime-dom` and
 * `@pyreon/runtime-server` call these three functions from every text sink,
 * and their end-to-end agreement (fresh mount = SSR = hydrated, per value kind
 * and per sink) is locked in runtime-dom's `child-text-parity.test.tsx`. This
 * file locks the rule itself, where it lives: each kind of value, the
 * structural/text boundary, and the agreement with `_fuse`, the one text sink
 * `@pyreon/core` owns.
 */
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { _fuse, Fragment, h } from '../index'
import { _childText, _isStructuralChild, _isVNodeLike } from '../internal'
import type { NativeItem, VNode } from '../types'

/** A NativeItem as `_tpl()` / `createTemplate()` returns it. */
function nativeItem(): NativeItem {
  return { __isNative: true, el: document.createElement('span'), cleanup: null }
}

function Comp(): VNode {
  return h('i', null)
}

/** Every text-kind value with the characters the rule gives it. */
const TEXT_VALUES: { name: string; value: unknown; text: string }[] = [
  { name: 'a string', value: 'hello', text: 'hello' },
  { name: 'the empty string', value: '', text: '' },
  { name: 'markup in a string (the rule never escapes)', value: '<b>&</b>', text: '<b>&</b>' },
  { name: 'a number', value: 42, text: '42' },
  { name: 'zero', value: 0, text: '0' },
  { name: 'negative zero', value: -0, text: '0' },
  { name: 'NaN', value: Number.NaN, text: 'NaN' },
  { name: 'Infinity', value: Number.POSITIVE_INFINITY, text: 'Infinity' },
  { name: 'a bigint', value: BigInt('12345678901234567890'), text: '12345678901234567890' },
  { name: 'null', value: null, text: '' },
  { name: 'undefined', value: undefined, text: '' },
  { name: 'true', value: true, text: '' },
  { name: 'false', value: false, text: '' },
  { name: 'an empty array', value: [], text: '' },
  { name: 'an array of strings (no commas)', value: ['a', 'b'], text: 'ab' },
  { name: 'an array with holes of nothing', value: ['a', null, undefined, 'b'], text: 'ab' },
  { name: 'an array with booleans and zero', value: ['a', false, true, 0], text: 'a0' },
  { name: 'nested arrays (flattened)', value: [['a', ['b']], 1, [BigInt(2)]], text: 'ab12' },
  {
    name: 'a sparse array',
    value: (() => {
      const a: unknown[] = ['a']
      a[2] = 'c'
      return a
    })(),
    text: 'ac',
  },
  { name: 'a Date', value: new Date(0), text: String(new Date(0)) },
  { name: 'an object with toString', value: { toString: () => 'T' }, text: 'T' },
  { name: 'a plain object', value: { a: 1 }, text: '[object Object]' },
  { name: 'an object inside an array', value: ['x', { toString: () => 'T' }], text: 'xT' },
  { name: 'a symbol', value: Symbol('s'), text: 'Symbol(s)' },
]

describe('_childText — the text of a child value', () => {
  for (const { name, value, text } of TEXT_VALUES) {
    it(`${name} → ${JSON.stringify(text)}`, () => {
      expect(_childText(value)).toBe(text)
    })
  }

  it('an array is never joined with commas, unlike String(array)', () => {
    const v = ['a', null, false, 'b']
    expect(String(v)).toBe('a,,false,b')
    expect(_childText(v)).toBe('ab')
  })

  it('a boolean inside an array renders nothing, at any depth', () => {
    expect(_childText([true, [false, [true]]])).toBe('')
  })

  it('an object whose toString throws propagates the error (no swallowed fallback)', () => {
    const bad = {
      toString(): string {
        throw new Error('boom')
      },
    }
    expect(() => _childText(bad)).toThrow('boom')
  })
})

describe('_isVNodeLike — the two object shapes a renderer mounts', () => {
  it('a VNode from the real h(): element, component, fragment', () => {
    expect(_isVNodeLike(h('div', null))).toBe(true)
    expect(_isVNodeLike(h('div', { id: 'a' }, 'x'))).toBe(true)
    expect(_isVNodeLike(h(Comp, null))).toBe(true)
    expect(_isVNodeLike(h(Fragment, null, 'a', 'b'))).toBe(true)
  })

  it('a hand-built object with the VNode shape (VNodes carry no brand)', () => {
    expect(_isVNodeLike({ type: 'div', props: {}, children: [] })).toBe(true)
  })

  it('a NativeItem, which has none of the VNode keys', () => {
    const item = nativeItem()
    expect('type' in item).toBe(false)
    expect(_isVNodeLike(item)).toBe(true)
  })

  it('an object missing any one of type / props / children is not a VNode', () => {
    expect(_isVNodeLike({ props: {}, children: [] })).toBe(false)
    expect(_isVNodeLike({ type: 'div', children: [] })).toBe(false)
    expect(_isVNodeLike({ type: 'div', props: {} })).toBe(false)
    expect(_isVNodeLike({})).toBe(false)
  })

  it('__isNative must be exactly true', () => {
    expect(_isVNodeLike({ __isNative: false })).toBe(false)
    expect(_isVNodeLike({ __isNative: 1 })).toBe(false)
  })

  it('a Date, an array and a class instance are not VNodes', () => {
    class Money {
      constructor(readonly type: string) {}
    }
    expect(_isVNodeLike(new Date(0))).toBe(false)
    expect(_isVNodeLike(['a'])).toBe(false)
    expect(_isVNodeLike(new Money('eur'))).toBe(false)
  })
})

describe('_isStructuralChild — mounted, not stringified', () => {
  it('every text-kind value is not structural', () => {
    for (const { name, value } of TEXT_VALUES) {
      expect(_isStructuralChild(value), name).toBe(false)
    }
  })

  it('a function is structural: an accessor, a signal, a component reference', () => {
    const count = signal(1)
    expect(_isStructuralChild(() => 'x')).toBe(true)
    expect(_isStructuralChild(count)).toBe(true)
    expect(_isStructuralChild(Comp)).toBe(true)
  })

  it('a VNode from the real h() and a NativeItem are structural', () => {
    expect(_isStructuralChild(h('b', null, 'x'))).toBe(true)
    expect(_isStructuralChild(h(Comp, null))).toBe(true)
    expect(_isStructuralChild(nativeItem())).toBe(true)
  })

  it('an array is structural when it holds a structural value at any depth', () => {
    expect(_isStructuralChild(['a', h('b', null)])).toBe(true)
    expect(_isStructuralChild(['a', () => 'x'])).toBe(true)
    expect(_isStructuralChild(['a', ['b', [nativeItem()]]])).toBe(true)
    expect(_isStructuralChild([[], [null, [h('i', null)]]])).toBe(true)
  })

  it('an array of only text-kind values is text, however nested', () => {
    expect(_isStructuralChild(['a', 1, null, false, [BigInt(1), [new Date(0), { a: 1 }]]])).toBe(
      false,
    )
    expect(_isStructuralChild([[], [[]]])).toBe(false)
  })

  it('the children array of a real h() call splits the same way', () => {
    const bold = h('b', null)
    const accessor = (): string => 'x'
    const vnode = h('p', null, 'a', 1, null, false, bold, accessor, ['c', 'd'])
    expect(vnode.children.filter((c) => _isStructuralChild(c))).toEqual([bold, accessor])
    expect(_childText(vnode.children.filter((c) => !_isStructuralChild(c)))).toBe('a1cd')
  })
})

describe('_fuse agrees with the rule', () => {
  it('a fused run of primitives is the text of the same values as one array child', () => {
    const runs: unknown[][] = [
      ['Hello ', 'Ada', '!'],
      [3, ' items'],
      [1.5, true, 'x'],
      [null, 'a', undefined, 'b', false],
      [0, ''],
      [BigInt(7), ' ', Number.NaN],
      [],
    ]
    for (const parts of runs) expect(_fuse(...parts)).toBe(_childText(parts))
  })

  it('hands back the parts for every structural value, so the consumer mounts it', () => {
    for (const structural of [h('b', null), () => 'x', nativeItem(), ['a', h('i', null)]]) {
      expect(_isStructuralChild(structural)).toBe(true)
      const parts: unknown[] = ['a', structural]
      expect(_fuse(...parts)).toEqual(parts)
    }
  })
})
