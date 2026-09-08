// Two hand-written sets are load-bearing for the emit's honesty. Both are
// "closed by something outside this repo", which is the only condition under
// which enumerating is better than the usual hand-maintained silent hole — and
// both need a gate that FAILS when the outside thing moves, or the enumeration
// rots into exactly that hole.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TS_UTILITY_TYPE_NAMES } from '../parse'
import { UNMAPPED_ARRAY_METHODS, UNMAPPED_STRING_METHODS } from '../unlowered-props'

const SRC = resolve(import.meta.dirname, '..')

describe('TS_UTILITY_TYPE_NAMES is the complete lib.es5.d.ts set', () => {
  // Transcribed from the TypeScript handbook's "Utility Types" chapter. If a
  // future TS release adds one, this list is what has to move — and the
  // failure lands here rather than as a `Foo<…>` leaking into emitted Swift.
  const DOCUMENTED = [
    'Awaited', 'Capitalize', 'ConstructorParameters', 'Exclude', 'Extract',
    'InstanceType', 'Lowercase', 'NoInfer', 'NonNullable', 'Omit',
    'OmitThisParameter', 'Parameters', 'Partial', 'Pick', 'Readonly', 'Record',
    'Required', 'ReturnType', 'ThisParameterType', 'ThisType', 'Uncapitalize',
    'Uppercase',
  ]
  it('matches exactly — no name dropped, none invented', () => {
    expect([...TS_UTILITY_TYPE_NAMES].sort()).toEqual([...DOCUMENTED].sort())
  })
  it('is non-empty (an empty set would make every utility type leak silently)', () => {
    expect(TS_UTILITY_TYPE_NAMES.length).toBeGreaterThan(15)
  })
})

describe('the unmapped-method sets stay in sync with the emitters', () => {
  const swift = readFileSync(join(SRC, 'emit-swift.ts'), 'utf8')
  const kotlin = readFileSync(join(SRC, 'emit-kotlin.ts'), 'utf8')
  const all = [...UNMAPPED_ARRAY_METHODS, ...UNMAPPED_STRING_METHODS]

  it('is non-empty on both halves', () => {
    expect(UNMAPPED_ARRAY_METHODS.length).toBeGreaterThan(5)
    expect(UNMAPPED_STRING_METHODS.length).toBeGreaterThan(3)
  })

  // The direction that rots: someone MAPS one of these and forgets to remove
  // it, so the emitter both lowers it correctly and warns that it cannot.
  it.each(all)('`%s` has no `case` in either emitter (it would be double-handled)', (m) => {
    const pattern = new RegExp(`case '${m}':`)
    expect(pattern.test(swift), `emit-swift.ts has case '${m}'`).toBe(false)
    expect(pattern.test(kotlin), `emit-kotlin.ts has case '${m}'`).toBe(false)
  })

  it('the two halves do not overlap (a name belongs to one receiver kind)', () => {
    const dup = UNMAPPED_ARRAY_METHODS.filter((m) => UNMAPPED_STRING_METHODS.includes(m))
    expect(dup).toEqual([])
  })
})
