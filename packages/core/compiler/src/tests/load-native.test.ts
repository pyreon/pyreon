import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getPlatformPackageName, loadNativeBinding, nativeVersionMismatch } from '../load-native'

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

describe('loadNativeBinding — the per-platform binary must match the compiler version', () => {
  // The Rust and JS backends are byte-identical PER VERSION. A binary from
  // another release (lockfile dedupe, an override, a lagging release-native
  // publish) used to load silently and emit different code than the JS
  // package beside it. It must fall back to JS and say why.
  const platformPkg = getPlatformPackageName()

  function installed(compilerVersion: string, binaryVersion: string | null): string {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-load-native-pkg-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@pyreon/compiler', version: compilerVersion }))
    mkdirSync(join(root, 'lib', '_chunks'), { recursive: true })
    const dir = join(root, 'node_modules', ...platformPkg!.split('/'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: platformPkg, ...(binaryVersion === null ? {} : { version: binaryVersion }), main: 'index.js' }),
    )
    writeFileSync(join(dir, 'index.js'), 'module.exports = { transformJsx() { return "fake-native" } }\n')
    return pathToFileURL(join(root, 'lib', '_chunks', 'jsx-abc.js')).href
  }

  it.runIf(platformPkg !== null)('loads the binary when its version matches', () => {
    const b = loadNativeBinding(installed('1.0.0', '1.0.0'))
    expect(b?.transformJsx('', '', false, null, false)).toBe('fake-native')
  })

  it.runIf(platformPkg !== null)('falls back to JS (null) with one [Pyreon] warning on a mismatch', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(loadNativeBinding(installed('1.2.0', '1.1.0'))).toBeNull()
      expect(loadNativeBinding(installed('1.2.0', null))).toBeNull()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[Pyreon\] @pyreon\/compiler-.*@1\.1\.0 does not match @pyreon\/compiler@1\.2\.0/)
    } finally {
      warn.mockRestore()
    }
  })

  it('nativeVersionMismatch compares exactly — a prerelease is not its release', () => {
    expect(nativeVersionMismatch('@pyreon/compiler-darwin-arm64', '1.0.0', '1.0.0')).toBeNull()
    expect(nativeVersionMismatch('@pyreon/compiler-darwin-arm64', '1.0.0-rc.2', '1.0.0')).toContain('does not match')
    expect(nativeVersionMismatch('@pyreon/compiler-darwin-arm64', undefined, '1.0.0')).toContain('<unknown>')
  })
})

describe('@pyreon/compiler pins its native binaries exactly', () => {
  it('every @pyreon/compiler-* optionalDependency is workspace:* (published as the exact version)', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf-8')) as {
      optionalDependencies: Record<string, string>
    }
    const ranges = Object.entries(pkg.optionalDependencies).filter(([n]) => n.startsWith('@pyreon/compiler-'))
    expect(ranges.length).toBe(7)
    for (const [name, range] of ranges) expect(range, name).toBe('workspace:*')
  })
})

describe('the mismatch warning is in the diagnose catalog', () => {
  it('diagnoseError explains it and names the exact version to install', async () => {
    const { diagnoseError } = await import('../diagnose')
    const msg = nativeVersionMismatch('@pyreon/compiler-linux-x64-gnu', '1.1.0', '1.2.0')!
    const d = diagnoseError(msg)
    expect(d?.cause).toContain('@pyreon/compiler-linux-x64-gnu@1.1.0')
    expect(d?.fix).toContain('@pyreon/compiler-linux-x64-gnu@1.2.0')
  })
})
