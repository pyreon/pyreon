import {
  _resetDevtools,
  getActiveModels,
  getModelInstance,
  getModelSnapshot,
  onModelChange,
  registerInstance,
  unregisterInstance,
} from '../devtools'
import { model } from '../index'

const Counter = model({
  state: { count: 0 },
  actions: (self) => ({
    inc: () => self.count.update((c: number) => c + 1),
  }),
})

afterEach(() => _resetDevtools())

describe('state-tree devtools', () => {
  test('getActiveModels returns empty initially', () => {
    expect(getActiveModels()).toEqual([])
  })

  test('registerInstance makes model visible', () => {
    const counter = Counter.create()
    registerInstance('app-counter', counter)
    expect(getActiveModels()).toEqual(['app-counter'])
  })

  test('getModelInstance returns the registered instance', () => {
    const counter = Counter.create()
    registerInstance('app-counter', counter)
    expect(getModelInstance('app-counter')).toBe(counter)
  })

  test('getModelInstance returns undefined for unregistered name', () => {
    expect(getModelInstance('nope')).toBeUndefined()
  })

  test('unregisterInstance removes the model', () => {
    const counter = Counter.create()
    registerInstance('app-counter', counter)
    unregisterInstance('app-counter')
    expect(getActiveModels()).toEqual([])
  })

  test('getModelSnapshot returns current snapshot', () => {
    const counter = Counter.create({ count: 5 })
    registerInstance('app-counter', counter)
    expect(getModelSnapshot('app-counter')).toEqual({ count: 5 })
  })

  test('getModelSnapshot reflects mutations', () => {
    const counter = Counter.create()
    registerInstance('app-counter', counter)
    counter.inc()
    counter.inc()
    expect(getModelSnapshot('app-counter')).toEqual({ count: 2 })
  })

  test('getModelSnapshot returns undefined for unregistered name', () => {
    expect(getModelSnapshot('nope')).toBeUndefined()
  })

  test('onModelChange fires on register', () => {
    const calls: number[] = []
    const unsub = onModelChange(() => calls.push(1))

    const counter = Counter.create()
    registerInstance('app-counter', counter)
    expect(calls.length).toBe(1)

    unsub()
  })

  test('onModelChange fires on unregister', () => {
    const counter = Counter.create()
    registerInstance('app-counter', counter)

    const calls: number[] = []
    const unsub = onModelChange(() => calls.push(1))
    unregisterInstance('app-counter')
    expect(calls.length).toBe(1)

    unsub()
  })

  test('onModelChange unsubscribe stops notifications', () => {
    const calls: number[] = []
    const unsub = onModelChange(() => calls.push(1))
    unsub()

    registerInstance('app-counter', Counter.create())
    expect(calls.length).toBe(0)
  })

  test('multiple instances are tracked', () => {
    registerInstance('a', Counter.create())
    registerInstance('b', Counter.create())
    expect(getActiveModels().sort()).toEqual(['a', 'b'])
  })

  test("getModelInstance returns undefined and cleans up when WeakRef target is GC'd", () => {
    // We simulate a GC'd WeakRef by monkey-patching the registered WeakRef's deref.
    const counter = Counter.create()
    registerInstance('gc-test', counter)

    // Verify it's accessible
    expect(getModelInstance('gc-test')).toBe(counter)

    // Now register a new entry with a fake WeakRef-like object that returns undefined.
    // Since _activeModels is a Map<string, WeakRef<object>>, we can re-register
    // to overwrite the entry, but registerInstance creates a real WeakRef.
    // Instead, we'll unregister and then test getModelInstance on a missing key.
    // But that tests the !ref branch (line 53), not the !instance branch (lines 55-57).

    // The only way to test lines 55-57 is to have a WeakRef whose deref() returns undefined.
    // We achieve this by creating the WeakRef with the mocked constructor before registering.
    _resetDevtools()

    const OriginalWeakRef = globalThis.WeakRef
    let collected = false
    class GCWeakRef {
      _target: any
      constructor(target: any) {
        this._target = target
      }
      deref() {
        return collected ? undefined : this._target
      }
    }
    globalThis.WeakRef = GCWeakRef as any

    try {
      const c2 = Counter.create()
      registerInstance('gc-victim', c2)

      // Before GC
      expect(getModelInstance('gc-victim')).toBe(c2)
      expect(getActiveModels()).toContain('gc-victim')

      // Simulate GC
      collected = true

      // getActiveModels cleans up dead refs first (line 43 branch)
      expect(getActiveModels()).not.toContain('gc-victim')

      // Re-register to test getModelInstance's GC cleanup path (lines 55-57)
      registerInstance('gc-victim-2', Counter.create())
      collected = true

      // getModelInstance hits lines 55-57: instance is undefined, deletes entry, returns undefined
      expect(getModelInstance('gc-victim-2')).toBeUndefined()

      // getModelSnapshot returns undefined for GC'd instance
      expect(getModelSnapshot('gc-victim-2')).toBeUndefined()
    } finally {
      globalThis.WeakRef = OriginalWeakRef
    }
  })
})
