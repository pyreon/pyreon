// A bare `arr.sort(cmp)` STATEMENT sorts the array in place. The value-position
// lowering is the non-mutating `sorted(by:)` / `sortedWith`, so a statement used
// to discard the sorted copy: the array stayed unsorted with no error — only an
// "unused result" warning on Swift and nothing at all on Kotlin. It shipped in
// the native chart engine: a boxplot's quartiles were read off UNSORTED data.
// Statement position now takes the mutating `sort(by:)` / `sortWith`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `export function median(xs: number[]): number {
  const sorted: number[] = []
  for (const x of xs) sorted.push(x)
  sorted.sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}
export function copy(xs: number[]): number[] {
  const out = xs.sort((a, b) => b - a)
  return out
}`

describe('Array.prototype.sort as a statement', () => {
  it('Swift: the statement mutates; the value position stays a copy', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('sorted.sort(by: { a, b in (a - b) < 0 })')
    expect(out).not.toContain('sorted.sorted(by:')
    expect(out).toMatch(/let out = xs\.sorted\(by: \{ a, b in \(b - a\) < 0 \}\)/)
  })

  it('Kotlin: the statement mutates; the value position stays a copy', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('sorted.sortWith(Comparator {')
    expect(out).not.toContain('sorted.sortedWith(')
    expect(out).toMatch(/val out = xs\.sortedWith\(Comparator \{/)
  })
})
