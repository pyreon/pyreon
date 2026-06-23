import { s } from '@pyreon/validate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applySnapshot,
  clone,
  destroy,
  getSnapshot,
  getType,
  isAlive,
  model,
} from '../index'

describe('lifecycle — .lifecycle() / afterCreate / beforeDestroy', () => {
  it('runs afterCreate once at create, seeing the fully-built instance', () => {
    const seen: string[] = []
    const M = model({ state: { count: 0 } })
      .views((self) => ({ doubled: () => self.count() * 2 }))
      .actions((self) => ({ inc: () => self.count.update((n) => n + 1) }))
      .lifecycle((self) => ({
        afterCreate: () => {
          // self has state + views + actions by now
          seen.push(`count=${self.count()} doubled=${self.doubled()}`)
          self.inc()
        },
      }))
    const m = M.create({ count: 5 })
    expect(seen).toEqual(['count=5 doubled=10'])
    expect(m.count()).toBe(6) // afterCreate's inc() ran
  })

  it('runs beforeDestroy on destroy(); isAlive flips', () => {
    let torn = 0
    const M = model({ state: { x: 0 } }).lifecycle(() => ({
      beforeDestroy: () => {
        torn++
      },
    }))
    const m = M.create()
    expect(isAlive(m)).toBe(true)
    destroy(m)
    expect(torn).toBe(1)
    expect(isAlive(m)).toBe(false)
  })

  it('destroy is idempotent (beforeDestroy runs once)', () => {
    let torn = 0
    const M = model({ state: { x: 0 } }).lifecycle(() => ({
      beforeDestroy: () => {
        torn++
      },
    }))
    const m = M.create()
    destroy(m)
    destroy(m)
    destroy(m)
    expect(torn).toBe(1)
  })

  it('destroy recurses into field-nested children (subtree teardown)', () => {
    const order: string[] = []
    const Child = model({ state: { v: 0 } }).lifecycle(() => ({
      beforeDestroy: () => order.push('child'),
    }))
    const Parent = model({ state: { child: Child } }).lifecycle(() => ({
      beforeDestroy: () => order.push('parent'),
    }))
    const p = Parent.create()
    destroy(p)
    // parent's beforeDestroy runs first, then it recurses into the child
    expect(order).toEqual(['parent', 'child'])
    expect(isAlive(p.child())).toBe(false)
  })

  it('afterCreate fires bottom-up for nested field-models (child before parent)', () => {
    const order: string[] = []
    const Child = model({ state: { v: 0 } }).lifecycle(() => ({
      afterCreate: () => order.push('child'),
    }))
    const Parent = model({ state: { child: Child, name: '' } }).lifecycle(() => ({
      afterCreate: () => order.push('parent'),
    }))
    Parent.create()
    expect(order).toEqual(['child', 'parent'])
  })

  it('multiple .lifecycle() blocks: beforeDestroy runs LIFO (mirrors setup)', () => {
    const order: string[] = []
    const M = model({ state: { x: 0 } })
      .lifecycle(() => ({ beforeDestroy: () => order.push('a') }))
      .lifecycle(() => ({ beforeDestroy: () => order.push('b') }))
    const m = M.create()
    destroy(m)
    expect(order).toEqual(['b', 'a'])
  })

  it('throws on an unknown lifecycle handler key (typo guard)', () => {
    const M = model({ state: { x: 0 } }).lifecycle(
      () => ({ afterCreated: () => {} }) as never,
    )
    expect(() => M.create()).toThrow(/unknown handler "afterCreated"/)
  })
})

describe('lifecycle — alive-guard', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('action on a destroyed instance dev-warns + no-ops', () => {
    const M = model({ state: { count: 0 } }).actions((self) => ({
      inc: () => self.count.update((n) => n + 1),
    }))
    const m = M.create()
    destroy(m)
    m.inc()
    expect(m.count()).toBe(0) // no-op
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('destroyed model instance'))
  })

  it('schema mutation helper on a destroyed instance dev-warns + no-ops', () => {
    const M = model({
      schema: s.object({ name: s.string() }),
      initial: { name: 'a' },
    })
    const m = M.create()
    destroy(m)
    m.set({ name: 'b' })
    expect(m.name()).toBe('a') // no-op
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('destroyed model instance'))
  })
})

describe('lifecycle — clone / getType', () => {
  it('clone produces an independent instance (plain mode)', () => {
    const M = model({ state: { count: 0, tags: [] as string[] } }).actions((self) => ({
      inc: () => self.count.update((n) => n + 1),
    }))
    const a = M.create({ count: 3, tags: ['x'] })
    const b = clone(a)
    expect(getSnapshot(b)).toEqual({ count: 3, tags: ['x'] })
    b.inc()
    expect(b.count()).toBe(4)
    expect(a.count()).toBe(3) // original untouched
  })

  it('clone re-validates through the schema (schema mode)', () => {
    const M = model({
      schema: s.object({ name: s.string(), age: s.number() }),
      initial: { name: '', age: 0 },
    })
    const a = M.create({ name: 'Ada', age: 36 })
    const b = clone(a)
    expect(getSnapshot(b)).toEqual({ name: 'Ada', age: 36 })
    expect(b).not.toBe(a)
  })

  it('getType returns the definition; create from it works', () => {
    const M = model({ state: { x: 1 } })
    const m = M.create()
    expect(getType(m)).toBe(M)
  })

  it('clone throws on a non-instance', () => {
    expect(() => clone({} as never)).toThrow(/not a model instance/)
  })
})

describe('lifecycle — applySnapshot re-validates in schema mode', () => {
  it('rejects an invalid snapshot (schema is the source of truth)', () => {
    const M = model({
      schema: s.object({ name: s.string(), age: s.number() }),
      initial: { name: 'a', age: 1 },
    })
    const m = M.create()
    // age must be a number — an invalid snapshot must throw, not write raw.
    expect(() => applySnapshot(m, { age: 'not-a-number' } as never)).toThrow()
    expect(m.age()).toBe(1) // unchanged
  })

  it('accepts a valid partial snapshot (absent keys unchanged)', () => {
    const M = model({
      schema: s.object({ name: s.string(), age: s.number() }),
      initial: { name: 'a', age: 1 },
    })
    const m = M.create({ name: 'a', age: 1 })
    applySnapshot(m, { name: 'b' } as never)
    expect(m.name()).toBe('b')
    expect(m.age()).toBe(1) // absent from the partial snapshot → unchanged
  })
})
