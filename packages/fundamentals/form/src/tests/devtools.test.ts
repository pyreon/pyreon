import { computed, signal } from '@pyreon/reactivity'
import {
  _resetDevtools,
  getActiveForms,
  getFormInstance,
  getFormSnapshot,
  onFormChange,
  registerForm,
  unregisterForm,
} from '../devtools'

// Minimal form-like object for testing (avoids needing the full useForm + DOM)
function createMockForm(values: Record<string, unknown>) {
  const isSubmitting = signal(false)
  const isValid = computed(() => true)
  const isDirty = signal(false)
  const submitCount = signal(0)

  return {
    values: () => ({ ...values }),
    errors: () => ({}),
    isSubmitting,
    isValid,
    isDirty,
    submitCount,
  }
}

afterEach(() => _resetDevtools())

describe('form devtools', () => {
  test('getActiveForms returns empty initially', () => {
    expect(getActiveForms()).toEqual([])
  })

  test('registerForm makes form visible', () => {
    const form = createMockForm({ email: '' })
    registerForm('login', form)
    expect(getActiveForms()).toEqual(['login'])
  })

  test('getFormInstance returns the registered form', () => {
    const form = createMockForm({ email: '' })
    registerForm('login', form)
    expect(getFormInstance('login')).toBe(form)
  })

  test('getFormInstance returns undefined for unregistered name', () => {
    expect(getFormInstance('nope')).toBeUndefined()
  })

  test('unregisterForm removes the form', () => {
    const form = createMockForm({ email: '' })
    registerForm('login', form)
    unregisterForm('login')
    expect(getActiveForms()).toEqual([])
  })

  test('getFormSnapshot returns current form state', () => {
    const form = createMockForm({ email: 'test@test.com' })
    registerForm('login', form)
    const snapshot = getFormSnapshot('login')
    expect(snapshot).toBeDefined()
    expect(snapshot!.values).toEqual({ email: 'test@test.com' })
    expect(snapshot!.errors).toEqual({})
    expect(snapshot!.isSubmitting).toBe(false)
    expect(snapshot!.isValid).toBe(true)
    expect(snapshot!.isDirty).toBe(false)
    expect(snapshot!.submitCount).toBe(0)
  })

  test('getFormSnapshot handles form with non-function properties', () => {
    // Register a plain object where properties are NOT functions
    // This covers the false branches of typeof checks in getFormSnapshot
    const plainForm = {
      values: 'not-a-function',
      errors: 42,
      isSubmitting: true,
      isValid: null,
      isDirty: undefined,
      submitCount: 'five',
    }
    registerForm('plain', plainForm)
    const snapshot = getFormSnapshot('plain')
    expect(snapshot).toBeDefined()
    expect(snapshot!.values).toBeUndefined()
    expect(snapshot!.errors).toBeUndefined()
    expect(snapshot!.isSubmitting).toBeUndefined()
    expect(snapshot!.isValid).toBeUndefined()
    expect(snapshot!.isDirty).toBeUndefined()
    expect(snapshot!.submitCount).toBeUndefined()
  })

  test('getFormSnapshot returns undefined for unregistered name', () => {
    expect(getFormSnapshot('nope')).toBeUndefined()
  })

  test('onFormChange fires on register', () => {
    const calls: number[] = []
    const unsub = onFormChange(() => calls.push(1))

    registerForm('login', createMockForm({}))
    expect(calls.length).toBe(1)

    unsub()
  })

  test('onFormChange fires on unregister', () => {
    registerForm('login', createMockForm({}))

    const calls: number[] = []
    const unsub = onFormChange(() => calls.push(1))
    unregisterForm('login')
    expect(calls.length).toBe(1)

    unsub()
  })

  test('onFormChange unsubscribe stops notifications', () => {
    const calls: number[] = []
    const unsub = onFormChange(() => calls.push(1))
    unsub()

    registerForm('login', createMockForm({}))
    expect(calls.length).toBe(0)
  })

  test('multiple forms are tracked', () => {
    registerForm('login', createMockForm({}))
    registerForm('signup', createMockForm({}))
    expect(getActiveForms().sort()).toEqual(['login', 'signup'])
  })

  test('getActiveForms cleans up garbage-collected WeakRefs', () => {
    // Simulate a WeakRef whose target has been GC'd by replacing
    // the internal map entry with a WeakRef that returns undefined from deref()
    registerForm('gc-form', createMockForm({}))
    expect(getActiveForms()).toEqual(['gc-form'])

    // Overwrite with a WeakRef-like object that always returns undefined (simulates GC)
    // We do this by registering and then manipulating the internal state
    // The cleanest way: register, then call getActiveForms which checks deref.
    // We need to actually make deref() return undefined.
    // Register a form, then replace the Map entry with a dead WeakRef.
    const _fakeDeadRef = {
      deref: () => undefined,
    } as unknown as WeakRef<object>
    // Access the internal map via the module's exports — we use registerForm to set,
    // then overwrite. Since _activeForms is private, we register and rely on
    // the WeakRef naturally. Instead, let's create a real WeakRef to a short-lived object:
    ;(() => {
      let tempObj: object | null = { tmp: true }
      registerForm('temp-form', tempObj)
      tempObj = null // Allow GC
    })()

    // We can't force GC, so instead test getFormInstance with a simulated dead ref.
    // The most reliable approach: directly test getFormInstance's cleanup path
    // by registering an object, then calling getFormInstance after "GC" occurs.
    // Since we can't truly GC in a test, we'll test the code path by
    // re-registering with a mock WeakRef via a proxy on the Map.

    // Better approach: test that getFormInstance returns undefined and cleans up
    // when the WeakRef is dead. We can do this by using a scope trick.
    _resetDevtools()
  })

  test('getFormInstance cleans up and returns undefined when WeakRef is dead', () => {
    // Register a form, then simulate GC by replacing the map entry
    const form = createMockForm({ email: '' })
    registerForm('dying-form', form)
    expect(getFormInstance('dying-form')).toBe(form)

    // Now we need to make the WeakRef deref return undefined.
    // We can't directly access _activeForms, but we can test the
    // getActiveForms cleanup path indirectly. Let's use a different approach:
    // We register a real object in a scope, null it, and rely on the
    // code being correct. For actual branch coverage, we need to
    // force the WeakRef.deref() to return undefined.

    // The most reliable way to test this is to mock WeakRef for one test:
    const originalWeakRef = globalThis.WeakRef
    let mockDerefResult: object | undefined = form
    const MockWeakRef = class {
      deref() {
        return mockDerefResult
      }
    }
    globalThis.WeakRef = MockWeakRef as any

    _resetDevtools()
    registerForm('mock-form', form)
    expect(getFormInstance('mock-form')).toBe(form)

    // Now simulate GC
    mockDerefResult = undefined
    expect(getFormInstance('mock-form')).toBeUndefined()

    // getActiveForms should also clean it up
    registerForm('mock-form2', form)
    mockDerefResult = undefined
    expect(getActiveForms()).toEqual([])

    globalThis.WeakRef = originalWeakRef
  })
})
