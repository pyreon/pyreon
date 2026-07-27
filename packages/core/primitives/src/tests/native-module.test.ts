// The web half of the native-module FFI. On iOS/Android PMTC replaces
// `useNativeModule('X')` with the app's own Swift/Kotlin class at compile
// time (see the compiler's native-module-ffi spec); on web the SAME source
// resolves the implementation registered by `defineNativeModule`, which is
// what keeps one `.tsx` running on all three targets.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _resetNativeModules,
  defineNativeModule,
  hasNativeModule,
  useNativeModule,
} from '../native-module'

type Bluetooth = {
  isSupported(): boolean
  connect(id: string): Promise<boolean>
}

afterEach(() => {
  _resetNativeModules()
  vi.restoreAllMocks()
})

describe('defineNativeModule / useNativeModule', () => {
  it('resolves the registered implementation by name', async () => {
    defineNativeModule<Bluetooth>('Bluetooth', {
      isSupported: () => true,
      connect: async (id) => id === 'cuff',
    })

    const bt = useNativeModule<Bluetooth>('Bluetooth')
    expect(bt.isSupported()).toBe(true)
    await expect(bt.connect('cuff')).resolves.toBe(true)
    await expect(bt.connect('other')).resolves.toBe(false)
  })

  it('returns the implementation so it can be exported and tested directly', () => {
    const impl = { isSupported: () => false, connect: async () => false }
    expect(defineNativeModule<Bluetooth>('Bluetooth', impl)).toBe(impl)
  })

  it('keeps modules isolated by name', () => {
    defineNativeModule('A', { tag: () => 'a' })
    defineNativeModule('B', { tag: () => 'b' })
    expect(useNativeModule<{ tag(): string }>('A').tag()).toBe('a')
    expect(useNativeModule<{ tag(): string }>('B').tag()).toBe('b')
  })

  it('THROWS an actionable error when no web implementation is registered', () => {
    // A silent `undefined` would surface as "cannot read property of
    // undefined" deep inside a handler, far from the missing registration.
    expect(() => useNativeModule('Bluetooth')).toThrow(/No web implementation registered/)
    expect(() => useNativeModule('Bluetooth')).toThrow(/defineNativeModule\("Bluetooth"/)
  })

  it('hasNativeModule feature-gates without triggering the throw', () => {
    expect(hasNativeModule('Bluetooth')).toBe(false)
    defineNativeModule('Bluetooth', { isSupported: () => true })
    expect(hasNativeModule('Bluetooth')).toBe(true)
  })

  it('re-registering replaces rather than accumulating (bounded registry)', () => {
    defineNativeModule('X', { tag: () => 'first' })
    defineNativeModule('X', { tag: () => 'second' })
    expect(useNativeModule<{ tag(): string }>('X').tag()).toBe('second')
  })
})

describe('dev warnings', () => {
  it('warns on an empty module name (it is the key AND the native class name)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    defineNativeModule('', { a: 1 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('non-empty module name'))
  })

  it('warns on a duplicate registration', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    defineNativeModule('Dup', { a: 1 })
    defineNativeModule('Dup', { a: 2 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('called twice'))
  })

  it('does NOT warn on a normal single registration', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    defineNativeModule('Clean', { a: 1 })
    expect(warn).not.toHaveBeenCalled()
  })
})
