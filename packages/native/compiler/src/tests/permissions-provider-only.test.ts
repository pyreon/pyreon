// A file that PROVIDES permissions and reads none of them must compile on its
// own.
//
// The environment key (Swift `EnvironmentValues.pyreonPermissions`) and the
// Compose local (`LocalPyreonPermissions`) used to be emitted inline, and only
// when a file contained a permission READ. A root layout that wraps the app in
// `<PermissionsProvider>` — the usual place for one — reads nothing, so its
// emit referenced a key it never declared:
//   Kotlin: unresolved reference 'LocalPyreonPermissions'
//   Swift:  value of type 'EnvironmentValues' has no member 'pyreonPermissions'
// Both now live in @pyreon/permissions' co-located runtime, declared once for
// the whole app — which is also what lets a provider in one file reach a reader
// in another (see multi-module-compile.test.ts).

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SRC = `import { PermissionsProvider } from '@pyreon/permissions'
import { Stack, Text } from '@pyreon/primitives'
export function Shell() {
  return (
    <PermissionsProvider permissions={{ 'posts.read': true }}>
      <Stack><Text>shell</Text></Stack>
    </PermissionsProvider>
  )
}`

describe('<PermissionsProvider> with no reader in the file', () => {
  it('injects through the runtime key and declares none itself (both targets)', () => {
    const swift = transform(SRC, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('.environment(\\.pyreonPermissions,')
    expect(swift.code).not.toMatch(/extension EnvironmentValues|PyreonPermissionsKey/)

    const kotlin = transform(SRC, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('LocalPyreonPermissions provides')
    expect(kotlin.code).not.toMatch(/val LocalPyreonPermissions/)
  })

  it.skipIf(!isSwiftcAvailable())('typechecks on its own against swiftc', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    if (r.skipped) return
    expect(r.error ?? '').toBe('')
    expect(r.ok).toBe(true)
  }, 180_000)

  it.skipIf(!isKotlincAvailable())('compiles on its own against kotlinc', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.error ?? '').toBe('')
    expect(r.ok).toBe(true)
  }, 300_000)
})
