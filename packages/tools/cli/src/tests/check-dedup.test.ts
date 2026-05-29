/**
 * Tests for `runCheckDedupGate` (PR E of the bullet-proof
 * cross-module-instance plan).
 *
 * Three lockfile formats supported: bun.lock (JSON), package-lock.json,
 * pnpm-lock.yaml. Each pure parser is exported as `_internal` and
 * exercised here on synthetic fixtures — no filesystem dependencies, no
 * subprocess. The orchestrator-level integration test exercises the
 * full runCheckDedupGate function against a temp dir.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _detectDuplicates,
  _parseBunLock,
  _parseNpmLock,
  _parsePnpmLock,
  runCheckDedupGate,
} from '../doctor/gates/check-dedup'

describe('_parseBunLock', () => {
  it('returns empty for malformed JSON', () => {
    const result = _parseBunLock('not json{')
    expect(result.size).toBe(0)
  })

  it('returns empty when no @pyreon/* packages present', () => {
    const lock = JSON.stringify({
      lockfileVersion: 1,
      packages: {
        react: ['react@19.0.0'],
        'react-dom': ['react-dom@19.0.0'],
      },
    })
    expect(_parseBunLock(lock).size).toBe(0)
  })

  it('captures a single @pyreon/* version', () => {
    const lock = JSON.stringify({
      lockfileVersion: 1,
      packages: {
        '@pyreon/core': ['@pyreon/core@0.24.6', '', {}],
      },
    })
    const result = _parseBunLock(lock)
    expect(result.size).toBe(1)
    expect(result.get('@pyreon/core')?.versions).toEqual(new Set(['0.24.6']))
  })

  it('captures TWO distinct versions of the same package (the bug class)', () => {
    const lock = JSON.stringify({
      lockfileVersion: 1,
      packages: {
        '@pyreon/core': ['@pyreon/core@0.24.6', '', {}],
        'some-dep/@pyreon/core': ['@pyreon/core@0.23.0', '', {}],
      },
    })
    const result = _parseBunLock(lock)
    expect(result.get('@pyreon/core')?.versions).toEqual(new Set(['0.24.6', '0.23.0']))
  })

  it('skips workspace: resolutions (never duplicated)', () => {
    const lock = JSON.stringify({
      lockfileVersion: 1,
      packages: {
        '@pyreon/core': ['@pyreon/core@workspace:packages/core/core', '', {}],
      },
    })
    expect(_parseBunLock(lock).size).toBe(0)
  })
})

describe('_parseNpmLock', () => {
  it('captures from node_modules/@pyreon/* paths', () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/@pyreon/core': { version: '0.24.6' },
        'node_modules/@pyreon/router': { version: '0.24.6' },
      },
    })
    const result = _parseNpmLock(lock)
    expect(result.get('@pyreon/core')?.versions).toEqual(new Set(['0.24.6']))
    expect(result.get('@pyreon/router')?.versions).toEqual(new Set(['0.24.6']))
  })

  it('captures nested node_modules paths (transitive dup)', () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        'node_modules/@pyreon/core': { version: '0.24.6' },
        'node_modules/some-dep/node_modules/@pyreon/core': {
          version: '0.23.0',
        },
      },
    })
    expect(_parseNpmLock(lock).get('@pyreon/core')?.versions).toEqual(new Set(['0.24.6', '0.23.0']))
  })

  it('ignores non-@pyreon packages', () => {
    const lock = JSON.stringify({
      packages: { 'node_modules/react': { version: '19.0.0' } },
    })
    expect(_parseNpmLock(lock).size).toBe(0)
  })

  it('returns empty for malformed JSON', () => {
    expect(_parseNpmLock('not json{').size).toBe(0)
  })

  it('returns empty when root is not an object', () => {
    expect(_parseNpmLock('null').size).toBe(0)
    expect(_parseNpmLock('"string"').size).toBe(0)
  })

  it('returns empty when packages is missing or not an object', () => {
    expect(_parseNpmLock(JSON.stringify({})).size).toBe(0)
    expect(_parseNpmLock(JSON.stringify({ packages: null })).size).toBe(0)
  })

  it('skips entries whose key has no node_modules/@pkg suffix', () => {
    const lock = JSON.stringify({
      packages: {
        '': { name: 'root' },
        'node_modules/react': { version: '19.0.0' },
      },
    })
    expect(_parseNpmLock(lock).size).toBe(0)
  })

  it('skips entries whose value has no version', () => {
    const lock = JSON.stringify({
      packages: {
        'node_modules/@pyreon/core': { resolved: 'https://example.com' },
      },
    })
    expect(_parseNpmLock(lock).size).toBe(0)
  })
})

describe('_parsePnpmLock', () => {
  it('captures v9+ format /@pyreon/core@1.0.0:', () => {
    const lock = `
packages:
  /@pyreon/core@0.24.6:
    resolution: {integrity: ...}
  /@pyreon/router@0.24.6:
    resolution: {integrity: ...}
`
    const result = _parsePnpmLock(lock)
    expect(result.get('@pyreon/core')?.versions).toEqual(new Set(['0.24.6']))
    expect(result.get('@pyreon/router')?.versions).toEqual(new Set(['0.24.6']))
  })

  it('captures multiple versions (dup)', () => {
    const lock = `
packages:
  /@pyreon/core@0.24.6:
    resolution: {integrity: ...}
  /@pyreon/core@0.23.0:
    resolution: {integrity: ...}
`
    expect(_parsePnpmLock(lock).get('@pyreon/core')?.versions).toEqual(
      new Set(['0.24.6', '0.23.0']),
    )
  })

  it('strips pnpm peer-suffix — same version with different peers is NOT a dup', () => {
    // Regression: pnpm v9+ writes `/@pyreon/core@1.0.0(react@19.0.0):`
    // to differentiate same-version installs that resolved against
    // different peer deps. The two entries are NOT a real duplicate
    // (same code, same version, just peer metadata). The parser must
    // strip the `(...)` suffix to avoid false-positive `multiple-versions`
    // findings.
    const lock = `
packages:
  /@pyreon/core@0.24.6:
    resolution: {integrity: ...}
  /@pyreon/core@0.24.6(react@19.0.0):
    resolution: {integrity: ...}
  /@pyreon/core@0.24.6(react@18.2.0):
    resolution: {integrity: ...}
`
    // All three rows are the same version `0.24.6` (just different peer
    // contexts) — must count as ONE version, not three.
    expect(_parsePnpmLock(lock).get('@pyreon/core')?.versions).toEqual(new Set(['0.24.6']))
  })

  it('peer-suffix DOES NOT mask a genuine version dup', () => {
    // Even with peer suffixes present, a genuine multi-version install
    // must still be detected.
    const lock = `
packages:
  /@pyreon/core@0.24.6(react@19.0.0):
    resolution: {integrity: ...}
  /@pyreon/core@0.23.0(react@19.0.0):
    resolution: {integrity: ...}
`
    expect(_parsePnpmLock(lock).get('@pyreon/core')?.versions).toEqual(
      new Set(['0.24.6', '0.23.0']),
    )
  })

  it('preserves build-metadata versions (no `(` to strip)', () => {
    const lock = `
packages:
  /@pyreon/core@0.24.6-beta.1+build.42:
    resolution: {integrity: ...}
`
    expect(_parsePnpmLock(lock).get('@pyreon/core')?.versions).toEqual(
      new Set(['0.24.6-beta.1+build.42']),
    )
  })
})

describe('_detectDuplicates', () => {
  it('emits no findings when every package has exactly one version', () => {
    const packages = new Map([
      ['@pyreon/core', { name: '@pyreon/core', versions: new Set(['0.24.6']) }],
      ['@pyreon/router', { name: '@pyreon/router', versions: new Set(['0.24.6']) }],
    ])
    const findings = _detectDuplicates(packages, '/tmp/bun.lock', '/tmp')
    expect(findings).toHaveLength(0)
  })

  it('emits ONE finding per package with multiple versions', () => {
    const packages = new Map([
      ['@pyreon/core', { name: '@pyreon/core', versions: new Set(['0.24.6', '0.23.0']) }],
    ])
    const findings = _detectDuplicates(packages, '/tmp/bun.lock', '/tmp')
    expect(findings).toHaveLength(1)
    expect(findings[0]!.code).toBe('check-dedup/multiple-versions')
    expect(findings[0]!.severity).toBe('error')
    expect(findings[0]!.message).toContain('@pyreon/core')
    expect(findings[0]!.message).toContain('0.23.0, 0.24.6')
    expect(findings[0]!.fix).toContain('PYREON_SINGLE_INSTANCE=warn')
  })

  it('emits one finding per duplicated package across multiple packages', () => {
    const packages = new Map([
      ['@pyreon/core', { name: '@pyreon/core', versions: new Set(['0.24.6', '0.23.0']) }],
      ['@pyreon/router', { name: '@pyreon/router', versions: new Set(['0.24.6', '0.22.0']) }],
      ['@pyreon/clean', { name: '@pyreon/clean', versions: new Set(['0.24.6']) }],
    ])
    const findings = _detectDuplicates(packages, '/tmp/bun.lock', '/tmp')
    expect(findings).toHaveLength(2)
    const names = findings.map((f) => f.message.split(' ')[0])
    expect(names).toContain('@pyreon/core')
    expect(names).toContain('@pyreon/router')
  })
})

describe('runCheckDedupGate — integration', () => {
  let fixtureRoot: string

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'pyreon-dedup-fixture-'))
  })

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
  })

  it('returns empty findings for a clean lockfile', async () => {
    writeFileSync(
      join(fixtureRoot, 'bun.lock'),
      JSON.stringify({
        lockfileVersion: 1,
        packages: {
          '@pyreon/core': ['@pyreon/core@0.24.6', '', {}],
          '@pyreon/router': ['@pyreon/router@0.24.6', '', {}],
        },
      }),
    )

    const result = await runCheckDedupGate({ cwd: fixtureRoot })
    expect(result.findings).toHaveLength(0)
    expect(result.gate).toBe('check-dedup')
    expect(result.meta.scanned).toBe(1)
  })

  it('flags a real dup in bun.lock', async () => {
    writeFileSync(
      join(fixtureRoot, 'bun.lock'),
      JSON.stringify({
        lockfileVersion: 1,
        packages: {
          '@pyreon/core': ['@pyreon/core@0.24.6', '', {}],
          'some-dep/@pyreon/core': ['@pyreon/core@0.23.0', '', {}],
        },
      }),
    )

    const result = await runCheckDedupGate({ cwd: fixtureRoot })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]!.message).toContain('@pyreon/core')
    expect(result.findings[0]!.severity).toBe('error')
  })

  it('flags a real dup in package-lock.json', async () => {
    writeFileSync(
      join(fixtureRoot, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/@pyreon/core': { version: '0.24.6' },
          'node_modules/sub/node_modules/@pyreon/core': { version: '0.23.0' },
        },
      }),
    )

    const result = await runCheckDedupGate({ cwd: fixtureRoot })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]!.message).toContain('@pyreon/core')
  })

  it('flags a real dup in pnpm-lock.yaml', async () => {
    writeFileSync(
      join(fixtureRoot, 'pnpm-lock.yaml'),
      `
packages:
  /@pyreon/core@0.24.6:
    resolution: {integrity: ...}
  /@pyreon/core@0.23.0:
    resolution: {integrity: ...}
`,
    )

    const result = await runCheckDedupGate({ cwd: fixtureRoot })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]!.message).toContain('@pyreon/core')
  })

  it('returns empty findings when no lockfile present', async () => {
    const result = await runCheckDedupGate({ cwd: fixtureRoot })
    expect(result.findings).toHaveLength(0)
    expect(result.meta.scanned).toBe(0)
  })

  it('skips a lockfile that exists but cannot be read (e.g. a directory at the path)', async () => {
    // Create a directory at `bun.lock` — readFileSync will throw EISDIR,
    // exercising the catch branch in runCheckDedupGate.
    mkdirSync(join(fixtureRoot, 'bun.lock'))
    const result = await runCheckDedupGate({ cwd: fixtureRoot })
    // The file existed (so it counted as scanned) but readFileSync
    // failed, so no findings emitted.
    expect(result.meta.scanned).toBe(1)
    expect(result.findings).toHaveLength(0)
  })

  it('scans multiple lockfiles if both present (edge case)', async () => {
    writeFileSync(
      join(fixtureRoot, 'bun.lock'),
      JSON.stringify({
        lockfileVersion: 1,
        packages: {
          '@pyreon/core': ['@pyreon/core@0.24.6', '', {}],
        },
      }),
    )
    writeFileSync(join(fixtureRoot, 'package-lock.json'), JSON.stringify({ packages: {} }))

    const result = await runCheckDedupGate({ cwd: fixtureRoot })
    expect(result.meta.scanned).toBe(2)
    expect(result.findings).toHaveLength(0)
  })
})

describe('runCheckDedupGate — full workspace lockfile (real bun.lock)', () => {
  // Regression: this exercises the gate against the actual repo's
  // bun.lock. The workspace uses `workspace:*` resolutions for every
  // @pyreon/* package, so the gate must emit ZERO findings even though
  // the lockfile has hundreds of @pyreon/* entries.
  it('finds NO dupes in the workspace bun.lock (all workspace:* resolutions)', async () => {
    // Walk up to find the workspace bun.lock — the file is co-located
    // with the test under the same monorepo root.
    let dir = process.cwd()
    let lockfile: string | undefined
    for (let i = 0; i < 10; i++) {
      const candidate = join(dir, 'bun.lock')
      try {
        const fs = await import('node:fs')
        if (fs.existsSync(candidate)) {
          lockfile = candidate
          break
        }
      } catch {
        // continue
      }
      const parent = join(dir, '..')
      if (parent === dir) break
      dir = parent
    }
    if (!lockfile) return // No workspace bun.lock found — skip silently.

    const result = await runCheckDedupGate({ cwd: dir })
    // Workspace has zero genuine dupes — every @pyreon/* is workspace:*.
    expect(result.findings).toHaveLength(0)
  })
})
