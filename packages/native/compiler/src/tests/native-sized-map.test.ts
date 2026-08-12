// `new SizedMap<K, V>({ maxEntries })` lowers to the co-located
// PyreonSizedMap runtime on both targets.
//
// Without this the runtime is dead code: the constructor fell through to the
// generic "class constructors are not supported" path and emitted `let m = ""`
// — an empty STRING where a map was expected. A co-located runtime that
// nothing can reach is not a crossing.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const app = (decl: string) =>
  `import { SizedMap } from '@pyreon/sized-map'
import { Stack, Text } from '@pyreon/primitives'
export function C(){ ${decl}; return (<Stack><Text>x</Text></Stack>) }`

describe('SizedMap lowering', () => {
  it('lowers the default FIFO form on both targets', () => {
    const src = app('const m = new SizedMap<string, number>({ maxEntries: 5 })')
    expect(transform(src, { target: 'swift' }).code).toContain(
      'PyreonSizedMap<String, Int>(maxEntries: 5)',
    )
    expect(transform(src, { target: 'kotlin' }).code).toContain(
      'PyreonSizedMap<String, Int>(maxEntries = 5)',
    )
  })

  // `lru` is emitted ONLY when true, so the default call stays as short as the
  // source that produced it.
  it('carries the lru flag when opted in, and omits it otherwise', () => {
    const lru = app('const m = new SizedMap<string, number>({ maxEntries: 5, lru: true })')
    expect(transform(lru, { target: 'swift' }).code).toContain('lru: true')
    expect(transform(lru, { target: 'kotlin' }).code).toContain('lru = true')
    const fifo = app('const m = new SizedMap<string, number>({ maxEntries: 5 })')
    expect(transform(fifo, { target: 'swift' }).code).not.toContain('lru')
  })

  // A computed cap cannot be baked into the emit — the conservative rule
  // useFetch applies to its URL and useStorage to its key. It declines WITH a
  // reason rather than emitting a wrong constant.
  it('declines a non-literal maxEntries, naming why', () => {
    const src = app('const n = 5; const m = new SizedMap<string, number>({ maxEntries: n })')
    const { code, warnings } = transform(src, { target: 'swift' })
    expect(code).not.toContain('PyreonSizedMap')
    expect(warnings.some((w) => w.includes('LITERAL'))).toBe(true)
  })

  // The recognizer gates on the IMPORT. `SizedMap` is a plausible name for a
  // user's own class, and silently rewriting someone else's constructor would
  // be worse than not lowering ours.
  it("does NOT hijack a user's own SizedMap class", () => {
    const src = `class SizedMap { constructor(o: unknown) {} }
import { Stack } from '@pyreon/primitives'
export function C(){ const m = new SizedMap({ maxEntries: 5 }); return (<Stack />) }`
    expect(transform(src, { target: 'swift' }).code).not.toContain('PyreonSizedMap')
  })

  it('lowers through a RENAMED import', () => {
    const src = `import { SizedMap as Bounded } from '@pyreon/sized-map'
import { Stack } from '@pyreon/primitives'
export function C(){ const m = new Bounded<string, number>({ maxEntries: 3 }); return (<Stack />) }`
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonSizedMap<String, Int>')
  })
})
