/**
 * Coverage tests for `runDistributionGate`'s findPackages edge cases.
 *
 * Each scenario covers one defensive branch in the package discovery
 * loop (no packages/ root, malformed package.json, non-string name,
 * private package, unreadable category dir). Closes lines 42, 54, 62
 * that the real repo doesn't exercise.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _isCanonicalRepositoryUrl,
  _repositoryUrl,
  runDistributionGate,
} from '../doctor/gates/distribution'

describe('distribution gate — findPackages edge cases', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-dist-edges-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns no findings when packages/ dir does not exist (line 42)', async () => {
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.length).toBe(0)
  })

  it('skips packages with malformed package.json (line 54)', async () => {
    fs.mkdirSync(path.join(tmp, 'packages/core/foo'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'packages/core/foo/package.json'), '{invalid json')
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.length).toBe(0)
  })

  it('skips packages with non-string name field (line 62)', async () => {
    fs.mkdirSync(path.join(tmp, 'packages/core/foo'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'packages/core/foo/package.json'),
      JSON.stringify({ name: 123, version: '0.1.0' }),
    )
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.length).toBe(0)
  })

  it('skips private packages', async () => {
    fs.mkdirSync(path.join(tmp, 'packages/core/foo'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'packages/core/foo/package.json'),
      JSON.stringify({ name: '@pyreon/foo', private: true, version: '0.1.0' }),
    )
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.length).toBe(0)
  })
})

describe('distribution gate — Rule 5: co-located native ports must ship', () => {
  let tmp: string
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-dist-native-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  const writePkg = (files: string[]): void => {
    fs.mkdirSync(path.join(tmp, 'packages/fundamentals/sync'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'packages/fundamentals/sync/package.json'),
      JSON.stringify({
        name: '@pyreon/sync',
        version: '0.1.0',
        sideEffects: false,
        files,
        pyreon: { native: { swift: 'native/swift', kotlin: 'native/kotlin' } },
      }),
    )
  }

  it('flags a pyreon.native package whose files array omits the native dirs', async () => {
    writePkg(['lib', 'src', 'README.md', 'LICENSE'])
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    const shipping = result.findings.filter(
      (f) => f.code === 'distribution/native-source-not-shipped',
    )
    expect(shipping).toHaveLength(2) // swift + kotlin
    expect(shipping[0]?.severity).toBe('error')
  })

  it('does NOT flag when the native dirs are in files', async () => {
    writePkg(['lib', 'src', 'README.md', 'LICENSE', 'native/swift', 'native/kotlin'])
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(
      result.findings.some((f) => f.code === 'distribution/native-source-not-shipped'),
    ).toBe(false)
  })

  it('accepts a parent dir in files (`native` covers `native/swift`)', async () => {
    writePkg(['lib', 'native'])
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(
      result.findings.some((f) => f.code === 'distribution/native-source-not-shipped'),
    ).toBe(false)
  })
})

describe('_repositoryUrl — reads the url from both npm repository shapes', () => {
  it('reads the bare-string form', () => {
    expect(_repositoryUrl('git+https://github.com/x/y.git')).toBe(
      'git+https://github.com/x/y.git',
    )
  })
  it('reads the { type, url } object form', () => {
    expect(
      _repositoryUrl({ type: 'git', url: 'https://github.com/x/y.git' }),
    ).toBe('https://github.com/x/y.git')
  })
  it('returns null when the field is absent', () => {
    expect(_repositoryUrl(undefined)).toBeNull()
  })
  it('returns null when the object has no string url', () => {
    expect(_repositoryUrl({ type: 'git' })).toBeNull()
    expect(_repositoryUrl({ url: 42 })).toBeNull()
  })
})

describe('_isCanonicalRepositoryUrl — matches only npm-untouched forms', () => {
  it('accepts the git+ prefixes', () => {
    expect(_isCanonicalRepositoryUrl('git+https://github.com/x/y.git')).toBe(true)
    expect(_isCanonicalRepositoryUrl('git+ssh://git@github.com/x/y.git')).toBe(true)
  })
  it('accepts the host shorthands', () => {
    expect(_isCanonicalRepositoryUrl('github:pyreon/pyreon')).toBe(true)
    expect(_isCanonicalRepositoryUrl('gitlab:x/y')).toBe(true)
  })
  it('rejects the bare https/.git form npm normalizes', () => {
    expect(_isCanonicalRepositoryUrl('https://github.com/x/y.git')).toBe(false)
  })
  it('rejects the git@/git:// forms npm ALSO normalizes', () => {
    expect(_isCanonicalRepositoryUrl('git@github.com:x/y.git')).toBe(false)
    expect(_isCanonicalRepositoryUrl('git://github.com/x/y.git')).toBe(false)
  })
})

describe('distribution gate — Rule 4: canonical repository.url', () => {
  let tmp: string
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-dist-repo-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  const writePkg = (repository: unknown) => {
    fs.mkdirSync(path.join(tmp, 'packages/core/foo'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'packages/core/foo/package.json'),
      JSON.stringify({
        name: '@pyreon/foo',
        version: '0.1.0',
        sideEffects: false,
        repository,
      }),
    )
  }

  it('FIRES on a non-canonical (bare https/.git) repository.url', async () => {
    writePkg({ type: 'git', url: 'https://github.com/pyreon/pyreon.git' })
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.map((f) => f.code)).toContain(
      'distribution/non-canonical-repository-url',
    )
  })

  it('does NOT fire on the canonical git+ form', async () => {
    writePkg({ type: 'git', url: 'git+https://github.com/pyreon/pyreon.git' })
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.map((f) => f.code)).not.toContain(
      'distribution/non-canonical-repository-url',
    )
  })

  it('does NOT fire when there is no repository field at all', async () => {
    writePkg(undefined)
    const result = await runDistributionGate({ cwd: tmp, skipPackProbe: true })
    expect(result.findings.map((f) => f.code)).not.toContain(
      'distribution/non-canonical-repository-url',
    )
  })
})
