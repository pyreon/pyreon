/**
 * A readonly proxy must reject EVERY write path, not only `[[Set]]` and
 * `[[Delete]]`. A Proxy forwards each internal method it does not trap to the
 * target, so `Object.defineProperty`, `Object.setPrototypeOf` and
 * `Object.preventExtensions` (and `Object.freeze`, which uses the last two)
 * used to mutate the source behind a "readonly" view — at the top level and
 * through every nested readonly proxy. A descriptor read was a second way to
 * reach the raw nested source.
 */
import { readonly, shallowReadonly } from '../index'

interface Src {
  role: string
  nested: { admin: boolean }
}

const fresh = (): Src => ({ role: 'user', nested: { admin: false } })

describe('readonly() rejects every write path and never mutates the source', () => {
  it('Object.defineProperty on the proxy throws and leaves the source alone', () => {
    const src = fresh()
    const ro = readonly(src)
    expect(() =>
      Object.defineProperty(ro, 'role', { value: 'admin', writable: true, configurable: true, enumerable: true }),
    ).toThrow(/\[Pyreon\] Cannot define property "role" on a readonly object/)
    expect(() => Object.defineProperty(ro, 'added', { value: 1 })).toThrow(/readonly/)
    expect(src.role).toBe('user')
    expect(Object.hasOwn(src, 'added')).toBe(false)
  })

  it('Reflect.defineProperty does not mutate the source either', () => {
    const src = fresh()
    const ro = readonly(src)
    expect(() => Reflect.defineProperty(ro, 'role', { value: 'admin' })).toThrow(/readonly/)
    expect(src.role).toBe('user')
  })

  it('Object.setPrototypeOf on the proxy throws and leaves the prototype alone', () => {
    const src = fresh()
    const ro = readonly(src)
    expect(() => Object.setPrototypeOf(ro, { isAdmin: true })).toThrow(
      /\[Pyreon\] Cannot set the prototype of a readonly object/,
    )
    expect(Object.getPrototypeOf(src)).toBe(Object.prototype)
    expect((src as unknown as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  it('Object.preventExtensions / freeze / seal on the proxy throw and leave the source extensible', () => {
    const src = fresh()
    const ro = readonly(src)
    expect(() => Object.preventExtensions(ro)).toThrow(/\[Pyreon\] Cannot prevent extensions/)
    expect(() => Object.freeze(ro)).toThrow(/readonly/)
    expect(() => Object.seal(ro)).toThrow(/readonly/)
    expect(Object.isExtensible(src)).toBe(true)
    expect(Object.isFrozen(src)).toBe(false)
    expect(Object.getOwnPropertyDescriptor(src, 'role')?.writable).toBe(true)
  })

  it('nested readonly proxies reject defineProperty / setPrototypeOf too', () => {
    const src = fresh()
    const ro = readonly(src)
    expect(() => Object.defineProperty(ro.nested, 'admin', { value: true })).toThrow(/readonly/)
    expect(() => Object.setPrototypeOf(ro.nested, null)).toThrow(/readonly/)
    expect(() => Object.preventExtensions(ro.nested)).toThrow(/readonly/)
    expect(src.nested.admin).toBe(false)
    expect(Object.getPrototypeOf(src.nested)).toBe(Object.prototype)
    expect(Object.isExtensible(src.nested)).toBe(true)
  })

  it('a descriptor read hands out a readonly nested value, not the raw source', () => {
    const src = fresh()
    const ro = readonly(src)
    const desc = Object.getOwnPropertyDescriptor(ro, 'nested')
    const nested = desc?.value as { admin: boolean }
    expect(() => {
      nested.admin = true
    }).toThrow(/readonly/)
    const all = Object.getOwnPropertyDescriptors(ro)
    expect(() => {
      ;(all.nested.value as { admin: boolean }).admin = true
    }).toThrow(/readonly/)
    expect(src.nested.admin).toBe(false)
    // Primitive descriptors are untouched.
    expect(Object.getOwnPropertyDescriptor(ro, 'role')).toEqual({
      value: 'user',
      writable: true,
      enumerable: true,
      configurable: true,
    })
  })

  it('reads are unaffected', () => {
    const ro = readonly(fresh())
    expect(ro.role).toBe('user')
    expect(ro.nested.admin).toBe(false)
    expect(Object.keys(ro)).toEqual(['role', 'nested'])
    expect({ ...ro }.role).toBe('user')
    expect(JSON.stringify(ro)).toBe('{"role":"user","nested":{"admin":false}}')
  })
})

describe('shallowReadonly() rejects every top-level write path', () => {
  it('defineProperty / setPrototypeOf / preventExtensions throw and leave the source alone', () => {
    const src = fresh()
    const ro = shallowReadonly(src)
    expect(() => Object.defineProperty(ro, 'role', { value: 'admin' })).toThrow(/readonly/)
    expect(() => Object.setPrototypeOf(ro, { isAdmin: true })).toThrow(/readonly/)
    expect(() => Object.preventExtensions(ro)).toThrow(/readonly/)
    expect(src.role).toBe('user')
    expect(Object.getPrototypeOf(src)).toBe(Object.prototype)
    expect(Object.isExtensible(src)).toBe(true)
  })

  it('nested objects stay mutable by design (shallow)', () => {
    const src = fresh()
    const ro = shallowReadonly(src)
    Object.defineProperty(ro.nested, 'admin', { value: true })
    expect(src.nested.admin).toBe(true)
  })
})
