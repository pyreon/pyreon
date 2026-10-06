import nativePlugin from '../native-plugin'

// `@pyreon/hooks` owns its native lowering as data. The compiler keeps a
// generated copy and `scripts/check-native-plugin-types.ts` proves every
// Swift/Kotlin type named here is declared; these specs pin the contract a
// consumer (and the generator) relies on, so a malformed entry fails here with
// the hook named instead of surfacing as a broken emit on a device.

const entries = Object.entries(nativePlugin.services)

describe('@pyreon/hooks native plugin', () => {
  it('identifies itself as the plugin for @pyreon/hooks, so a discovered copy replaces the built-in', () => {
    expect(nativePlugin.name).toBe('@pyreon/hooks')
    expect(nativePlugin.apiVersion).toBe(1)
    expect(nativePlugin.modules).toEqual(['@pyreon/hooks'])
  })

  it('has real services to describe (a count of zero would make every spec below vacuous)', () => {
    expect(entries.length).toBeGreaterThan(10)
  })

  it.each(entries)('%s: is a use* hook with a Swift initialiser and Kotlin declaration lines', (hook, spec) => {
    expect(hook).toMatch(/^use[A-Z][A-Za-z0-9]*$/)
    expect(spec.swift).toMatch(/^[A-Z][A-Za-z0-9]*\(/)
    expect(spec.kotlin.length).toBeGreaterThan(0)
    for (const line of spec.kotlin) expect(typeof line).toBe('string')
  })

  it.each(entries)('%s: the Kotlin lines declare the binding through the {id} placeholder', (_hook, spec) => {
    // `{id}` is replaced with the component's own binding name; a declaration
    // that never mentions it would define nothing the emitted code can read.
    expect(spec.kotlin.some((line) => line.includes('{id}'))).toBe(true)
  })

  it('keeps hook names unique and legacyKinds unique per hook', () => {
    const hooks = entries.map(([hook]) => hook)
    expect(new Set(hooks).size).toBe(hooks.length)
    const kinds = entries.map(([, spec]) => spec.legacyKind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })
})
