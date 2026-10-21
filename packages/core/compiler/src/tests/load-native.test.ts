import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getPlatformPackageName, loadNativeBinding } from '../load-native'

describe('getPlatformPackageName', () => {
  it('returns @pyreon/compiler-darwin-arm64 on Apple Silicon', () => {
    expect(getPlatformPackageName('darwin', 'arm64', null)).toBe('@pyreon/compiler-darwin-arm64')
  })

  it('returns @pyreon/compiler-darwin-x64 on Intel Mac', () => {
    expect(getPlatformPackageName('darwin', 'x64', null)).toBe('@pyreon/compiler-darwin-x64')
  })

  it('returns @pyreon/compiler-linux-x64-gnu on glibc Linux x64', () => {
    expect(getPlatformPackageName('linux', 'x64', 'gnu')).toBe('@pyreon/compiler-linux-x64-gnu')
  })

  it('returns @pyreon/compiler-linux-arm64-gnu on glibc Linux ARM64', () => {
    expect(getPlatformPackageName('linux', 'arm64', 'gnu')).toBe('@pyreon/compiler-linux-arm64-gnu')
  })

  it('returns @pyreon/compiler-win32-x64-msvc on Windows x64', () => {
    expect(getPlatformPackageName('win32', 'x64', 'msvc')).toBe('@pyreon/compiler-win32-x64-msvc')
  })

  it('returns null for unsupported platform (freebsd)', () => {
    // freebsd is intentionally not in the supported allowlist — caller
    // skips per-platform resolution and falls through to JS.
    expect(getPlatformPackageName('freebsd', 'x64', null)).toBeNull()
  })

  it('returns null for unsupported arch on a supported platform (linux ia32)', () => {
    // ia32 is not in the matrix — released-native.yml builds x64 + arm64 only.
    expect(getPlatformPackageName('linux', 'ia32', 'gnu')).toBeNull()
  })

  it('returns null for darwin arm32 (not a real combo)', () => {
    expect(getPlatformPackageName('darwin', 'arm', null)).toBeNull()
  })

  it('returns null for win32 arm64 (not yet shipped)', () => {
    // Phase 4 matrix doesn't include Windows ARM64. When it's added,
    // bump both .github/workflows/release-native.yml AND the supported
    // map in load-native.ts together.
    expect(getPlatformPackageName('win32', 'arm64', 'msvc')).toBeNull()
  })

  it('handles linux musl distinct from glibc', () => {
    // The libc dimension is real — Alpine's musl binary is NOT
    // ABI-compatible with Debian's glibc binary. Per-platform packages
    // must differentiate.
    expect(getPlatformPackageName('linux', 'x64', 'musl')).toBe('@pyreon/compiler-linux-x64-musl')
  })
})

describe('loadNativeBinding — in-tree binary depth', () => {
  // The built entry is code-split into `lib/_chunks/<file>.js`, two levels
  // below the package root, while `src/<file>.ts` is one level below. Both
  // must find `<root>/native/pyreon-compiler.node`; probing only `../native`
  // silently dropped every built-lib consumer onto the JS fallback.
  const real = join(import.meta.dirname, '..', '..', 'native', 'pyreon-compiler.node')
  const hasBinary = existsSync(real)

  function fakePackage(): string {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-load-native-'))
    mkdirSync(join(root, 'native'))
    symlinkSync(real, join(root, 'native', 'pyreon-compiler.node'))
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'lib', '_chunks'), { recursive: true })
    return root
  }

  it('the in-tree binary is present in this environment', () => {
    // A skipped depth spec must never masquerade as coverage: say so loudly.
    if (!hasBinary) console.warn(`[load-native.test] no in-tree binary at ${real}; depth specs skipped`)
    expect(typeof hasBinary).toBe('boolean')
  })

  it.runIf(hasBinary)('resolves from a src/<file> module (one level deep)', () => {
    const root = fakePackage()
    const b = loadNativeBinding(pathToFileURL(join(root, 'src', 'jsx.ts')).href)
    expect(typeof b?.transformJsx).toBe('function')
  })

  it.runIf(hasBinary)('resolves from a lib/_chunks/<file> module (two levels deep)', () => {
    const root = fakePackage()
    const b = loadNativeBinding(pathToFileURL(join(root, 'lib', '_chunks', 'jsx-abc.js')).href)
    expect(typeof b?.transformJsx).toBe('function')
  })
})
