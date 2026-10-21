/**
 * `omit` / `pick` assign plain data descriptors instead of calling
 * `Object.defineProperty`. Differential against the old verbatim
 * defineProperty copy: identical own descriptors for every shape, and a
 * `__proto__` own key stays an own key (never a prototype write).
 */
import { omit, pick } from '../utils'

const getter = () => 1

function makeSource(): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  Object.defineProperty(o, 'plain', { value: 1, writable: true, enumerable: true, configurable: true })
  Object.defineProperty(o, 'readonly', { value: 2, writable: false, enumerable: true, configurable: true })
  Object.defineProperty(o, 'hidden', { value: 3, writable: true, enumerable: false, configurable: true })
  Object.defineProperty(o, 'locked', { value: 4, writable: true, enumerable: true, configurable: false })
  Object.defineProperty(o, 'getter', { get: getter, enumerable: true, configurable: true })
  Object.defineProperty(o, '__proto__', { value: { polluted: true }, writable: true, enumerable: true, configurable: true })
  Object.defineProperty(o, 'dropped', { value: 5, writable: true, enumerable: true, configurable: true })
  return o
}

function oldVerbatim(src: object, keys: string[]): object {
  const out = {}
  for (const k of keys) Object.defineProperty(out, k, Object.getOwnPropertyDescriptor(src, k)!)
  return out
}

describe('omit / pick fast path', () => {
  it('omit copies every kept descriptor exactly', () => {
    const src = makeSource()
    const out = omit(src, ['dropped'])
    const kept = Object.getOwnPropertyNames(src).filter((k) => k !== 'dropped')
    expect(Object.getOwnPropertyDescriptors(out)).toEqual(Object.getOwnPropertyDescriptors(oldVerbatim(src, kept)))
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.hasOwn(out, '__proto__')).toBe(true)
  })

  it('omit with a pre-built Set behaves the same', () => {
    const src = makeSource()
    const out = omit(src, new Set(['dropped', 'getter']))
    const kept = Object.getOwnPropertyNames(src).filter((k) => k !== 'dropped' && k !== 'getter')
    expect(Object.getOwnPropertyDescriptors(out)).toEqual(Object.getOwnPropertyDescriptors(oldVerbatim(src, kept)))
  })

  it('pick copies every requested descriptor exactly', () => {
    const src = makeSource()
    const keys = ['plain', 'readonly', 'locked', 'getter', '__proto__']
    const out = pick(src, keys)
    expect(Object.getOwnPropertyDescriptors(out)).toEqual(Object.getOwnPropertyDescriptors(oldVerbatim(src, keys)))
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  })
})
