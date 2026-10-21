import { describe, expect, it } from 'vitest'
import { isCompanionRef, resolveCompanion, type CompanionContext } from '../../../../../scripts/native-companions'

const ctx = (dependencies: string[]): CompanionContext => ({
  root: '/repo',
  owner: { name: '@pyreon/auth', dependencies },
  packages: new Map([
    ['@pyreon/storage', { name: '@pyreon/storage', swiftDir: '/repo/storage/native/swift', kotlinDir: '/repo/storage/native/kotlin' }],
    ['@pyreon/kotlin-only', { name: '@pyreon/kotlin-only', kotlinDir: '/repo/k/native/kotlin' }],
  ]),
})

describe('native companions', () => {
  it('classifies refs', () => {
    expect(isCompanionRef('@base/PyreonHttp.kt')).toBe(true)
    expect(isCompanionRef('@pyreon/storage/PyreonSecureStorage.kt')).toBe(true)
    expect(isCompanionRef('PyreonOidc.kt')).toBe(false)
  })

  it('resolves @base/ into the base runtime of each language', () => {
    expect(resolveCompanion('@base/PyreonHttp.swift', 'swift', ctx([]))).toEqual({
      ok: true,
      path: '/repo/packages/native/runtime-swift/Sources/PyreonRuntime/PyreonHttp.swift',
    })
    expect(resolveCompanion('@base/PyreonHttp.kt', 'kotlin', ctx([]))).toEqual({
      ok: true,
      path: '/repo/packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonHttp.kt',
    })
  })

  it('resolves a declared dependency package file', () => {
    expect(resolveCompanion('@pyreon/storage/PyreonSecureStorage.swift', 'swift', ctx(['@pyreon/storage']))).toEqual({
      ok: true,
      path: '/repo/storage/native/swift/PyreonSecureStorage.swift',
    })
    expect(resolveCompanion('@pyreon/storage/PyreonSecureStorage.kt', 'kotlin', ctx(['@pyreon/storage']))).toEqual({
      ok: true,
      path: '/repo/storage/native/kotlin/com/pyreon/runtime/PyreonSecureStorage.kt',
    })
  })

  it('refuses a package the app build would not contain', () => {
    const r = resolveCompanion('@pyreon/storage/PyreonSecureStorage.swift', 'swift', ctx([]))
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.error).toMatch(/not a dependency of @pyreon\/auth/)
  })

  it('refuses malformed refs, the wrong extension, self refs and a missing language', () => {
    const deps = ctx(['@pyreon/storage', '@pyreon/kotlin-only'])
    for (const [ref, lang, msg] of [
      ['@base/PyreonHttp.kt', 'swift', /\.swift file/],
      ['@base/a/b.swift', 'swift', /expected @base/],
      ['@pyreon/storage/x/y.swift', 'swift', /expected @base/],
      ['@pyreon/auth/PyreonOidc.swift', 'swift', /names the package itself/],
      ['@pyreon/kotlin-only/X.swift', 'swift', /ships no swift sources/],
    ] as const) {
      const r = resolveCompanion(ref, lang, deps)
      expect(r.ok, ref).toBe(false)
      expect(!r.ok && r.error, ref).toMatch(msg)
    }
  })
})
