import { describe, expect, it } from 'vitest'
import {
  checkLockfilePyreonVersions,
  checkLockfileSources,
  checkScaffoldSpecs,
  missingText,
  type PackageLock,
  parseArgs,
  pyreonNameOf,
  resolveDistTag,
} from '../../../../../scripts/post-publish-smoke'

const R = 'https://registry.npmjs.org/'
const tgz = (name: string, v: string) => `${R}${name}/-/${name.split('/').pop()}-${v}.tgz`

function lockOf(packages: NonNullable<PackageLock['packages']>): {
  lock: PackageLock
  raw: string
} {
  const lock: PackageLock = { lockfileVersion: 3, packages }
  return { lock, raw: JSON.stringify(lock, null, 2) }
}

const HEALTHY = {
  '': { name: 'app', version: '0.0.1' },
  'node_modules/@pyreon/core': { version: '0.54.0', resolved: tgz('@pyreon/core', '0.54.0') },
  'node_modules/@pyreon/zero': { version: '0.54.0', resolved: tgz('@pyreon/zero', '0.54.0') },
  'node_modules/vite': { version: '8.0.16', resolved: tgz('vite', '8.0.16') },
  'node_modules/vite/node_modules/@pyreon/core': {
    version: '0.54.0',
    resolved: tgz('@pyreon/core', '0.54.0'),
  },
  'node_modules/some-pkg/node_modules/bundled': { version: '1.0.0', inBundle: true },
}

describe('post-publish-smoke — parseArgs', () => {
  it('defaults to the latest dist-tag', () => {
    expect(parseArgs([])).toEqual({
      tag: 'latest',
      expectVersion: undefined,
      only: [],
      keep: false,
    })
  })

  it('reads --tag, --expect-version, --only (repeatable, csv) and --keep', () => {
    expect(
      parseArgs([
        '--tag',
        'rc',
        '--expect-version=1.0.0-rc.1',
        '--only',
        'a,b',
        '--only=c',
        '--keep',
      ]),
    ).toEqual({ tag: 'rc', expectVersion: '1.0.0-rc.1', only: ['a', 'b', 'c'], keep: true })
  })

  it('rejects an unknown flag, a missing value, a tag that is not a plain name and a non-semver version', () => {
    expect(() => parseArgs(['--tga', 'rc'])).toThrow(/unknown argument/)
    expect(() => parseArgs(['--tag'])).toThrow(/needs a value/)
    expect(() => parseArgs(['--tag', '../x'])).toThrow(/invalid dist-tag/)
    expect(() => parseArgs(['--expect-version', 'latest'])).toThrow(/invalid --expect-version/)
  })
})

describe('post-publish-smoke — resolveDistTag', () => {
  const packument = { 'dist-tags': { latest: '0.54.0', rc: '1.0.0-rc.0' } }

  it('returns the version the tag points at', () => {
    expect(resolveDistTag(packument, '@pyreon/create-zero', 'latest')).toBe('0.54.0')
    expect(resolveDistTag(packument, '@pyreon/create-zero', 'rc')).toBe('1.0.0-rc.0')
  })

  it('fails on a tag npm does not have, naming the tags it does have', () => {
    expect(() => resolveDistTag(packument, '@pyreon/create-zero', 'next')).toThrow(
      /no dist-tag "next".*latest=0\.54\.0, rc=1\.0\.0-rc\.0/,
    )
    expect(() => resolveDistTag({}, '@pyreon/create-zero', 'latest')).toThrow(/Tags: \(none\)/)
  })

  it('rejects a tag value that is not a semver version (registry data is untrusted)', () => {
    for (const bad of ['../../etc', '1.0.0\n| injected |', 'latest', '1.0']) {
      expect(() => resolveDistTag({ 'dist-tags': { latest: bad } }, '@pyreon/create-zero', 'latest')).toThrow(
        /not a semver version/,
      )
    }
  })

  it('fails when the tag did not move to the expected (just released) version', () => {
    expect(resolveDistTag(packument, 'p', 'latest', '0.54.0')).toBe('0.54.0')
    expect(() => resolveDistTag(packument, 'p', 'latest', '0.55.0')).toThrow(
      /p@latest is 0\.54\.0, expected 0\.55\.0/,
    )
  })
})

describe('post-publish-smoke — checkScaffoldSpecs', () => {
  it('passes a scaffold whose @pyreon/* deps are all ^version and whose other deps are registry ranges', () => {
    const pkg = {
      dependencies: { '@pyreon/core': '^0.54.0', zod: '^4.4.3' },
      devDependencies: { '@pyreon/vite-plugin': '0.54.0', vite: '^8.0.16' },
    }
    expect(checkScaffoldSpecs(pkg, '0.54.0')).toEqual([])
  })

  it('flags a scaffolder that stamps an older version (the shape a stale create-zero ships)', () => {
    expect(checkScaffoldSpecs({ dependencies: { '@pyreon/core': '^0.53.0' } }, '0.54.0')).toEqual([
      '@pyreon/core: spec "^0.53.0", expected "^0.54.0"',
    ])
  })

  it('flags every local or git source, for @pyreon/* and third-party deps alike', () => {
    const problems = checkScaffoldSpecs(
      {
        dependencies: {
          '@pyreon/core': 'workspace:*',
          '@pyreon/zero': 'link:../zero',
          a: 'file:../a',
          b: 'git+https://github.com/x/b.git',
          c: 'github:x/c',
          d: '../d',
          e: 'https://example.com/e.tgz',
        },
      },
      '0.54.0',
    )
    expect(problems).toHaveLength(7)
    for (const p of problems) expect(p).toMatch(/non-registry spec/)
  })

  it('fails a scaffold with no @pyreon/* dependency at all (nothing would be tested)', () => {
    expect(checkScaffoldSpecs({ dependencies: { vite: '^8.0.0' } }, '0.54.0')).toEqual([
      'the scaffold declares no @pyreon/* dependency',
    ])
  })
})

describe('post-publish-smoke — checkLockfileSources', () => {
  it('passes a lockfile resolved entirely from the registry (bundled deps carry no resolved URL)', () => {
    const { lock, raw } = lockOf(HEALTHY)
    expect(checkLockfileSources(lock, raw)).toEqual([])
  })

  it('flags a linked entry (a workspace or file: directory symlinked in)', () => {
    const { lock, raw } = lockOf({
      ...HEALTHY,
      'node_modules/@pyreon/core': { resolved: '../../packages/core/core', link: true },
    })
    expect(checkLockfileSources(lock, raw)).toEqual([
      'node_modules/@pyreon/core: linked (not installed from the registry)',
    ])
  })

  it('flags a resolved URL outside the registry: a local tarball, git, or another registry', () => {
    const { lock, raw } = lockOf({
      ...HEALTHY,
      'node_modules/a': { version: '1.0.0', resolved: 'file:../a-1.0.0.tgz' },
      'node_modules/b': { version: '1.0.0', resolved: 'git+ssh://git@github.com/x/b.git#abc' },
      'node_modules/c': {
        version: '1.0.0',
        resolved: 'https://registry.example.com/c/-/c-1.0.0.tgz',
      },
    })
    const problems = checkLockfileSources(lock, raw)
    expect(problems).toContain('node_modules/a: resolved from "file:../a-1.0.0.tgz"')
    expect(problems).toContain(
      'node_modules/b: resolved from "git+ssh://git@github.com/x/b.git#abc"',
    )
    expect(problems).toContain(
      'node_modules/c: resolved from "https://registry.example.com/c/-/c-1.0.0.tgz"',
    )
    expect(problems).toContain('the lockfile text contains "file:"')
  })

  it('flags an entry with no resolved URL that is not bundled, and a local protocol as the version', () => {
    const { lock, raw } = lockOf({
      ...HEALTHY,
      'node_modules/x': { version: '1.0.0' },
      'node_modules/y': { version: 'workspace:*', resolved: tgz('y', '1.0.0') },
    })
    const problems = checkLockfileSources(lock, raw)
    expect(problems).toContain('node_modules/x: no "resolved" URL')
    expect(problems).toContain('node_modules/y: version "workspace:*"')
    expect(problems).toContain('the lockfile text contains "workspace:"')
  })

  it('flags a root that declares workspaces, and a lockfile it cannot read (v1, or no packages map)', () => {
    const { lock, raw } = lockOf({
      ...HEALTHY,
      '': { name: 'app', workspaces: ['packages/*'] } as never,
    })
    expect(checkLockfileSources(lock, raw)).toEqual(['the root package declares workspaces'])
    expect(checkLockfileSources({ lockfileVersion: 1 }, '{}')[0]).toMatch(/unsupported lockfile/)
    expect(checkLockfileSources({}, '{}')[0]).toMatch(/unsupported lockfile/)
  })
})

describe('post-publish-smoke — @pyreon/* versions', () => {
  it('pyreonNameOf finds @pyreon packages at the top level and nested, and nothing else', () => {
    expect(pyreonNameOf('node_modules/@pyreon/core')).toBe('@pyreon/core')
    expect(pyreonNameOf('node_modules/vite/node_modules/@pyreon/core')).toBe('@pyreon/core')
    expect(pyreonNameOf('node_modules/@pyreon/core/node_modules/x')).toBeNull()
    expect(pyreonNameOf('node_modules/@pyreonx/core')).toBeNull()
    expect(pyreonNameOf('')).toBeNull()
  })

  it('passes when every @pyreon/* (nested copies included) is the dist-tag version', () => {
    const { lock } = lockOf(HEALTHY)
    expect(checkLockfilePyreonVersions(lock, ['@pyreon/core', '@pyreon/zero'], '0.54.0')).toEqual(
      [],
    )
  })

  it('flags any @pyreon/* at another version, including a nested copy', () => {
    const { lock } = lockOf({
      ...HEALTHY,
      'node_modules/vite/node_modules/@pyreon/core': {
        version: '0.53.0',
        resolved: tgz('@pyreon/core', '0.53.0'),
      },
    })
    expect(checkLockfilePyreonVersions(lock, ['@pyreon/core'], '0.54.0')).toEqual([
      'node_modules/vite/node_modules/@pyreon/core: 0.53.0, expected 0.54.0',
    ])
  })

  it('flags a declared @pyreon/* dependency that is not in the lockfile', () => {
    const { lock } = lockOf(HEALTHY)
    expect(checkLockfilePyreonVersions(lock, ['@pyreon/router'], '0.54.0')).toEqual([
      '@pyreon/router: declared but not in the lockfile',
    ])
  })
})

describe('post-publish-smoke — missingText (content, not structure)', () => {
  const needles = ['Stay fast.', 'Signal-Based Reactivity']

  it('passes a page that rendered the route', () => {
    const html =
      '<div id="app"><section class="hero"><h1>Build fast.<br/><span>Stay fast.</span></h1></section><h3>Signal-Based Reactivity</h3></div>'
    expect(missingText(html, needles)).toEqual([])
  })

  it('fails the empty shell a broken SSR serves, even though the root has children', () => {
    // A shell with a non-empty root (a layout wrapper, a script tag) is what a
    // "root has children" assertion accepts. Only route text tells them apart.
    const shell =
      '<!doctype html><html><head><title>Pyreon Zero</title></head><body><div id="app"><!--pyreon-app--><div class="layout"></div></div><script type="module" src="/assets/index.js"></script></body></html>'
    expect(missingText(shell, needles)).toEqual(needles)
  })
})
