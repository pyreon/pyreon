import { computed, signal } from '@pyreon/reactivity'
import { defineStore, resetAllStores } from '../index'

afterEach(() => resetAllStores())

// ─── Integration tests — store + reactivity ──────────────────────────────────

describe('Store integration — reactive composition', () => {
  it('component-like consumer reads store state via signals', () => {
    const useCounter = defineStore('int-counter', () => {
      const count = signal(42)
      const double = computed(() => count() * 2)
      return { count, double }
    })

    const { store } = useCounter()
    expect(store.count()).toBe(42)
    expect(store.double()).toBe(84)
  })

  it('store action updates signal and derived computed reacts', () => {
    const useCounter = defineStore('int-action', () => {
      const count = signal(0)
      const increment = () => count.update((n) => n + 1)
      const double = computed(() => count() * 2)
      return { count, increment, double }
    })

    const { store } = useCounter()
    expect(store.count()).toBe(0)
    store.increment()
    store.increment()
    expect(store.count()).toBe(2)
    expect(store.double()).toBe(4)
  })

  it('multiple consumers share same store and see updates', () => {
    const useShared = defineStore('int-shared', () => {
      const count = signal(0)
      return { count }
    })

    const consumer1 = useShared()
    const consumer2 = useShared()

    expect(consumer1).toBe(consumer2)
    consumer1.store.count.set(99)
    expect(consumer2.store.count()).toBe(99)
  })

  it('store reset reflects initial state in all consumers', () => {
    const useResettable = defineStore('int-resettable', () => ({
      count: signal(0),
      name: signal('initial'),
    }))

    const api = useResettable()
    api.store.count.set(50)
    api.store.name.set('changed')

    api.reset()
    expect(api.store.count()).toBe(0)
    expect(api.store.name()).toBe('initial')
  })

  it('store dispose allows re-creation with fresh state', () => {
    const useDisposable = defineStore('int-disposable', () => ({
      count: signal(0),
    }))

    const api1 = useDisposable()
    api1.store.count.set(100)

    // Track that subscriber stops after dispose
    let subCalled = 0
    api1.subscribe(() => {
      subCalled++
    })
    api1.store.count.set(101)
    expect(subCalled).toBe(1)

    api1.dispose()

    // Old subscriber should not fire
    api1.store.count.set(200)
    expect(subCalled).toBe(1)

    // New store instance is fresh
    const api2 = useDisposable()
    expect(api2).not.toBe(api1)
    expect(api2.store.count()).toBe(0)
  })
})
