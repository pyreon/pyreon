// RX — comprehensive unit tests for the full Strategy-A lowering set.
//
// Asserts that EVERY rx method in `RX_V1_METHODS` produces the
// documented per-target emit shape. The swiftc + kotlinc validation
// gates (validate-swift.test.ts / validate-kotlin.test.ts) prove the
// emit COMPILES; this file proves the emit has the SHAPE the docs say
// (so a future per-target dispatch regression surfaces here even if
// the resulting code happens to still typecheck).
//
// One describe block per method; per-target assertions inside.
// Each `transform()` call goes through the full PMTC pipeline
// (parse → infer → emit), so this is integration coverage, not unit
// coverage of the dispatch table alone.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function emit(src: string, target: 'swift' | 'kotlin'): string {
  return transform(src, { target }).code
}

const PREAMBLE = `
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

export function P() {
  const xs = signal<number[]>([])
  const mayb = signal<(number | null)[]>([])
  const nest = signal<number[][]>([])
`

function probe(decl: string, source = 'xs'): string {
  // Helper — build a tiny source file with one rx.METHOD binding and
  // a void-discard so unused-vars stays quiet. The `decl` arg is the
  // rx call WITHOUT the surrounding `const x = ` (we add that here).
  void source
  return `${PREAMBLE}
  const r = ${decl}
  void r
  return null
}
`
}

describe('RX — full Strategy-A lowering (every v1 method)', () => {
  // ============ Transforms returning a new collection ============

  describe('rx.filter(s, p)', () => {
    const src = probe('rx.filter(xs, (n) => n > 0)')
    it('Swift: xs.filter({ n in n > 0 })', () => {
      expect(emit(src, 'swift')).toMatch(/xs\.filter\(\{ n in n > 0 \}\)/)
    })
    it('Kotlin: xs.filter({ n -> n > 0 })', () => {
      expect(emit(src, 'kotlin')).toMatch(/xs\.filter\(\{ n -> n > 0 \}\)/)
    })
  })

  describe('rx.map(s, f)', () => {
    const src = probe('rx.map(xs, (n) => n * 2)')
    it('Swift: xs.map({ n in n * 2 })', () => {
      expect(emit(src, 'swift')).toMatch(/xs\.map\(\{ n in n \* 2 \}\)/)
    })
    it('Kotlin: xs.map({ n -> n * 2 })', () => {
      expect(emit(src, 'kotlin')).toMatch(/xs\.map\(\{ n -> n \* 2 \}\)/)
    })
  })

  describe('rx.reverse(s)', () => {
    const src = probe('rx.reverse(xs)')
    it('Swift: xs.reversed() (NOT .reverse())', () => {
      const out = emit(src, 'swift')
      expect(out).toContain('xs.reversed()')
      expect(out).not.toMatch(/xs\.reverse\(\)/)
    })
    it('Kotlin: xs.reversed() (NOT .reverse())', () => {
      const out = emit(src, 'kotlin')
      expect(out).toContain('xs.reversed()')
      expect(out).not.toMatch(/xs\.reverse\(\)/)
    })
  })

  describe('rx.compact(s)', () => {
    const src = probe('rx.compact(mayb)', 'mayb')
    it('Swift: mayb.compactMap { $0 }', () => {
      expect(emit(src, 'swift')).toContain('mayb.compactMap { $0 }')
    })
    it('Kotlin: mayb.filterNotNull()', () => {
      expect(emit(src, 'kotlin')).toContain('mayb.filterNotNull()')
    })
  })

  describe('rx.flatten(s)', () => {
    const src = probe('rx.flatten(nest)', 'nest')
    it('Swift: Array(nest.joined())', () => {
      expect(emit(src, 'swift')).toContain('Array(nest.joined())')
    })
    it('Kotlin: nest.flatten()', () => {
      expect(emit(src, 'kotlin')).toContain('nest.flatten()')
    })
  })

  describe('rx.unique(s)', () => {
    const src = probe('rx.unique(xs)')
    it('Swift: Array(Set(xs)) — requires Hashable', () => {
      expect(emit(src, 'swift')).toContain('Array(Set(xs))')
    })
    it('Kotlin: xs.distinct()', () => {
      expect(emit(src, 'kotlin')).toContain('xs.distinct()')
    })
  })

  // ============ Bounded transforms ============

  describe('rx.take(s, n)', () => {
    const src = probe('rx.take(xs, 5)')
    it('Swift: Array(xs.prefix(5))', () => {
      expect(emit(src, 'swift')).toContain('Array(xs.prefix(5))')
    })
    it('Kotlin: xs.take(5)', () => {
      expect(emit(src, 'kotlin')).toContain('xs.take(5)')
    })
  })

  describe('rx.skip(s, n)', () => {
    const src = probe('rx.skip(xs, 3)')
    it('Swift: Array(xs.dropFirst(3))', () => {
      expect(emit(src, 'swift')).toContain('Array(xs.dropFirst(3))')
    })
    it('Kotlin: xs.drop(3)', () => {
      expect(emit(src, 'kotlin')).toContain('xs.drop(3)')
    })
  })

  describe('rx.takeWhile(s, p)', () => {
    const src = probe('rx.takeWhile(xs, (n) => n > 0)')
    it('Swift: Array(xs.prefix(while: { n in n > 0 }))', () => {
      expect(emit(src, 'swift')).toMatch(/Array\(xs\.prefix\(while: \{ n in n > 0 \}\)\)/)
    })
    it('Kotlin: xs.takeWhile({ n -> n > 0 })', () => {
      expect(emit(src, 'kotlin')).toMatch(/xs\.takeWhile\(\{ n -> n > 0 \}\)/)
    })
  })

  describe('rx.dropWhile(s, p)', () => {
    const src = probe('rx.dropWhile(xs, (n) => n < 0)')
    it('Swift: Array(xs.drop(while: { n in n < 0 }))', () => {
      expect(emit(src, 'swift')).toMatch(/Array\(xs\.drop\(while: \{ n in n < 0 \}\)\)/)
    })
    it('Kotlin: xs.dropWhile({ n -> n < 0 })', () => {
      expect(emit(src, 'kotlin')).toMatch(/xs\.dropWhile\(\{ n -> n < 0 \}\)/)
    })
  })

  // ============ Scalar accessors ============

  describe('rx.first(s)', () => {
    const src = probe('rx.first(xs)')
    it('Swift: xs.first (property)', () => {
      // .first is a property (no parens) returning Optional<T>.
      expect(emit(src, 'swift')).toMatch(/\{ xs\.first \}/)
    })
    it('Kotlin: xs.firstOrNull()', () => {
      expect(emit(src, 'kotlin')).toContain('xs.firstOrNull()')
    })
  })

  describe('rx.last(s)', () => {
    const src = probe('rx.last(xs)')
    it('Swift: xs.last (property)', () => {
      expect(emit(src, 'swift')).toMatch(/\{ xs\.last \}/)
    })
    it('Kotlin: xs.lastOrNull()', () => {
      expect(emit(src, 'kotlin')).toContain('xs.lastOrNull()')
    })
  })

  describe('rx.find(s, p)', () => {
    const src = probe('rx.find(xs, (n) => n > 0)')
    it('Swift: xs.first(where: { n in n > 0 })', () => {
      expect(emit(src, 'swift')).toMatch(/xs\.first\(where: \{ n in n > 0 \}\)/)
    })
    it('Kotlin: xs.find({ n -> n > 0 })', () => {
      expect(emit(src, 'kotlin')).toMatch(/xs\.find\(\{ n -> n > 0 \}\)/)
    })
  })

  describe('rx.some(s, p)', () => {
    const src = probe('rx.some(xs, (n) => n > 0)')
    it('Swift: xs.contains(where: { n in n > 0 })', () => {
      expect(emit(src, 'swift')).toMatch(/xs\.contains\(where: \{ n in n > 0 \}\)/)
    })
    it('Kotlin: xs.any({ n -> n > 0 })', () => {
      expect(emit(src, 'kotlin')).toMatch(/xs\.any\(\{ n -> n > 0 \}\)/)
    })
  })

  describe('rx.every(s, p)', () => {
    const src = probe('rx.every(xs, (n) => n > 0)')
    it('Swift: xs.allSatisfy({ n in n > 0 })', () => {
      expect(emit(src, 'swift')).toMatch(/xs\.allSatisfy\(\{ n in n > 0 \}\)/)
    })
    it('Kotlin: xs.all({ n -> n > 0 })', () => {
      expect(emit(src, 'kotlin')).toMatch(/xs\.all\(\{ n -> n > 0 \}\)/)
    })
  })

  // ============ Aggregations ============

  describe('rx.count(s)', () => {
    const src = probe('rx.count(xs)')
    it('Swift: xs.count', () => {
      expect(emit(src, 'swift')).toMatch(/\{ xs\.count \}/)
    })
    it('Kotlin: xs.size (property, NOT count())', () => {
      const out = emit(src, 'kotlin')
      expect(out).toMatch(/\{ xs\.size \}/)
      expect(out).not.toMatch(/xs\.count\(\)/)
    })
  })

  describe('rx.sum(s)', () => {
    const src = probe('rx.sum(xs)')
    it('Swift: xs.reduce(0, +)', () => {
      expect(emit(src, 'swift')).toContain('xs.reduce(0, +)')
    })
    it('Kotlin: xs.sum()', () => {
      expect(emit(src, 'kotlin')).toContain('xs.sum()')
    })
  })

  describe('rx.min(s)', () => {
    const src = probe('rx.min(xs)')
    it('Swift: xs.min()', () => {
      expect(emit(src, 'swift')).toContain('xs.min()')
    })
    it('Kotlin: xs.minOrNull() (NOT .min())', () => {
      const out = emit(src, 'kotlin')
      expect(out).toContain('xs.minOrNull()')
      expect(out).not.toMatch(/xs\.min\(\)/)
    })
  })

  describe('rx.max(s)', () => {
    const src = probe('rx.max(xs)')
    it('Swift: xs.max()', () => {
      expect(emit(src, 'swift')).toContain('xs.max()')
    })
    it('Kotlin: xs.maxOrNull() (NOT .max())', () => {
      const out = emit(src, 'kotlin')
      expect(out).toContain('xs.maxOrNull()')
      expect(out).not.toMatch(/xs\.max\(\)/)
    })
  })

  describe('rx.reduce(s, f, init)', () => {
    const src = probe('rx.reduce(xs, (acc, n) => acc + n, 0)')
    it('Swift: xs.reduce(0, { acc, n in acc + n }) — initial-then-reducer order', () => {
      expect(emit(src, 'swift')).toMatch(/xs\.reduce\(0, \{ acc, n in acc \+ n \}\)/)
    })
    it('Kotlin: xs.fold(0, { acc, n -> acc + n }) — fold, not reduce', () => {
      expect(emit(src, 'kotlin')).toMatch(/xs\.fold\(0, \{ acc, n -> acc \+ n \}\)/)
    })
  })

  describe('rx.average(s)', () => {
    const src = probe('rx.average(xs)')
    it('Swift: empty-checked IIFE returning Double', () => {
      const out = emit(src, 'swift')
      expect(out).toContain('__xs.isEmpty')
      expect(out).toContain('Double(__xs.reduce(0, +))')
      expect(out).toContain('Double(__xs.count)')
    })
    it('Kotlin: empty-checked let block returning 0.0 or sum/size', () => {
      const out = emit(src, 'kotlin')
      expect(out).toContain('xs.let')
      expect(out).toContain('it.isEmpty()')
      expect(out).toContain('it.sum().toDouble()')
    })
  })

  // ============ Defensive — methods that need Strategy B (not v1) ============

  describe('out-of-set methods (Strategy B — needs runtime port)', () => {
    const src = probe('rx.debounce(xs, 100)')
    it('Swift: warns + drops binding', () => {
      const r = transform(src, { target: 'swift' })
      expect(r.code).not.toMatch(/\bvar r\b|\blet r\b/)
      expect((r.warnings ?? []).some((w) => /rx\.debounce is not yet lowered/.test(w))).toBe(true)
    })
    it('Kotlin: warns + drops binding', () => {
      const r = transform(src, { target: 'kotlin' })
      expect(r.code).not.toMatch(/\bvar r\b|\bval r\b/)
      expect((r.warnings ?? []).some((w) => /rx\.debounce is not yet lowered/.test(w))).toBe(true)
    })
  })
})
