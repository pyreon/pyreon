import { describe, expect, it } from 'vitest'
import { getPlatformPackageName } from '../load-native'

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
