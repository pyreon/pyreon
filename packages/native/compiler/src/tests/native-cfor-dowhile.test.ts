import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// C-style `for` + `do…while` (iter48, sweep batch 7 — completes the loop
// vocabulary). Pre-fix EVERY ForStatement and DoWhileStatement
// warn-dropped the WHOLE loop; the do-while residue was semantically
// wrong (post-loop reads saw initial values). The canonical count-loop
// lowers to a native RANGE (Swift `0..<n` / stride, Kotlin `0 until n`
// / step) — ranges keep break/continue semantics intact (a while-desugar
// would skip the update on `continue`). Non-canonical shapes (decrement,
// non-literal step, counter reassigned in the body — Swift's range
// binding is immutable) warn by name.

const CANONICAL = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const items = signal<number[]>([1, 2, 3])
  const n = signal(0)
  const run = () => {
    for (let i = 0; i < 5; i++) {
      n.set(n() + i)
    }
    for (let j = 1; j <= 3; j++) {
      n.set(n() + j)
    }
    for (let k = 0; k < 10; k += 2) {
      n.set(n() + k)
    }
    for (let m = 0; m < items().length; m++) {
      n.set(n() + m)
    }
  }
  return <Stack gap="sm"><Button onPress={() => run()}>go</Button></Stack>
}`

const DOWHILE = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const run = () => {
    let k = 0
    do {
      k = k + 1
    } while (k < 3)
    n.set(k)
  }
  return <Stack gap="sm"><Button onPress={() => run()}>go</Button></Stack>
}`

describe('canonical C-style count-loops lower to native ranges', () => {
  it('Swift: exclusive / inclusive / stepped / length-bound forms', () => {
    const out = transform(CANONICAL, { target: 'swift' })
    expect(out.code).toContain('for i in 0..<5 {')
    expect(out.code).toContain('for j in 1...3 {')
    expect(out.code).toContain('for k in stride(from: 0, to: 10, by: 2) {')
    expect(out.code).toContain('for m in 0..<items.count {')
    expect(out.warnings ?? []).toEqual([])
  })

  it('Kotlin: until / .. / step forms', () => {
    const out = transform(CANONICAL, { target: 'kotlin' })
    expect(out.code).toContain('for (i in 0 until 5) {')
    expect(out.code).toContain('for (j in 1..3) {')
    expect(out.code).toContain('for (k in 0 until 10 step 2) {')
    expect(out.code).toContain('for (m in 0 until items.length) {')
    expect(out.warnings ?? []).toEqual([])
  })

  it('a NON-canonical for (decrement) warns by name and drops nothing silently', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const run = () => {
    for (let i = 5; i > 0; i--) {
      n.set(n() + i)
    }
  }
  return <Stack gap="sm"><Button onPress={() => run()}>go</Button></Stack>
}`
    const out = transform(src, { target: 'swift' })
    expect(
      (out.warnings ?? []).some((w) => w.includes('canonical count-loop')),
    ).toBe(true)
  })

  it('a counter REASSIGNED in the body bails (Swift range binding is immutable)', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const run = () => {
    for (let i = 0; i < 5; i++) {
      if (n() > 2) i = 5
      n.set(n() + i)
    }
  }
  return <Stack gap="sm"><Button onPress={() => run()}>go</Button></Stack>
}`
    const out = transform(src, { target: 'swift' })
    expect(out.code).not.toContain('for i in')
    expect(
      (out.warnings ?? []).some((w) => w.includes('canonical count-loop')),
    ).toBe(true)
  })
})

describe('do…while lowers directly', () => {
  it('Swift: repeat { } while', () => {
    const out = transform(DOWHILE, { target: 'swift' })
    expect(out.code).toMatch(/repeat \{\n\s+k = k \+ 1\n\s+\} while k < 3/)
    expect(out.warnings ?? []).toEqual([])
  })

  it('Kotlin: do { } while ( )', () => {
    const out = transform(DOWHILE, { target: 'kotlin' })
    expect(out.code).toMatch(/do \{\n\s+k = k \+ 1\n\s+\} while \(k < 3\)/)
    expect(out.warnings ?? []).toEqual([])
  })
})
