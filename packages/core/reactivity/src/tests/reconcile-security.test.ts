import { reconcile } from '../reconcile'
import { createStore } from '../store'

// Regression: prototype-pollution hardening for the documented
// "apply an untrusted API response straight into a store" path.
// `JSON.parse('{"__proto__":{…}}')` produces an OWN enumerable
// `__proto__` key that `Object.keys` returns — the canonical
// merge-path pollution vector. Both `reconcile()` and the store
// proxy `set` trap must refuse the dangerous keys.
describe('reconcile / store — prototype pollution hardening', () => {
  afterEach(() => {
    // Scrub any pollution so a failure here can't cascade into other suites.
    delete (Object.prototype as Record<string, unknown>).polluted
    delete (Object.prototype as Record<string, unknown>).isAdmin
  })

  test('reconcile ignores a JSON __proto__ payload (no Object.prototype mutation)', () => {
    const state = createStore<Record<string, unknown>>({ user: { name: 'a' } })
    const malicious = JSON.parse('{"__proto__":{"polluted":"yes"},"user":{"name":"b"}}')

    reconcile(malicious, state)

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype)
    // Legitimate data still reconciled.
    expect((state.user as { name: string }).name).toBe('b')
  })

  test('reconcile ignores nested constructor.prototype payload', () => {
    const state = createStore<Record<string, unknown>>({})
    const malicious = JSON.parse('{"constructor":{"prototype":{"isAdmin":true}}}')

    reconcile(malicious, state)

    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  test('store proxy set trap refuses __proto__ assignment', () => {
    const state = createStore<Record<string, unknown>>({})
    ;(state as Record<string, unknown>).__proto__ = { polluted: 'yes' }

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(state)).toBe(Object.prototype)
  })
})
