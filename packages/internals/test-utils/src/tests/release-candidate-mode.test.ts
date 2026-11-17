/**
 * The release-candidate mechanics: changesets pre mode (`.changeset/pre.json`)
 * produces `1.0.0-rc.N`, and every release consumer must route those versions
 * to the pre-mode dist-tag and through the maintainer's major switch.
 *
 * What broke without them (each reproduced in a scratch checkout):
 *   - publish.ts passed no `--tag`: npm 11 rejects every prerelease
 *     ("You must specify a tag using --tag when publishing a prerelease
 *     version"), so an rc release failed on all 75 packages; an older npm would
 *     have moved `latest` to the rc.
 *   - cap-changeset-bumps rewrote the deliberate 1.0 `major` changeset to
 *     `minor` at release time, so the cut versioned to 0.54.0-rc.0.
 *   - check-published-state compared with `latest` and dropped prerelease
 *     suffixes: an rc on npm read as a dead release, and rc.1 (repo) equalled
 *     rc.0 (npm), so an rc that never published passed.
 *   - scaffold-smoke compared with `latest`, skipping the npm-install cells
 *     for the whole rc series.
 *   - heal-release-chain refused every prerelease, so an rc got no umbrella
 *     tag, no GitHub Release and no native binaries.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  compareSemver,
  distTagFor,
  isPreModeVersion,
  parsePreState,
  resolvePublishTag,
  type PreState,
} from '../../../../../scripts/release-channel'
import { classifyOneZeroMove, majorReleaseAllowed } from '../../../../../scripts/major-release'
import { checkNoMajor, majorOffenders } from '../../../../../scripts/check-no-major-changesets'
import { shouldCapMajors } from '../../../../../scripts/cap-changeset-bumps'
import { cmpSemver, classifyLag, npmChannelVersion } from '../../../../../scripts/check-published-state'
import { chainDefinedFor, githubReleaseArgs, parsePublishResult } from '../../../../../scripts/heal-release-chain'
import { shouldSkipIsolatedCell } from '../../../../../scripts/scaffold-smoke'
import { breakingBump, changesetProblems } from '../../../../../scripts/check-breaking-changeset-codemod'

const RC: PreState = { mode: 'pre', tag: 'rc' }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')

describe('release-channel — which dist-tag a version ships on', () => {
  it('stable → latest, with or without pre mode', () => {
    expect(distTagFor('0.54.0', null)).toBe('latest')
    expect(distTagFor('0.54.0', RC)).toBe('latest')
    expect(distTagFor('1.0.0', null)).toBe('latest')
  })

  it('a pre-mode version → the pre.json tag, in pre and exit mode', () => {
    expect(distTagFor('1.0.0-rc.0', RC)).toBe('rc')
    expect(distTagFor('1.0.0-rc.12', { mode: 'exit', tag: 'rc' })).toBe('rc')
  })

  it('refuses a prerelease no pre mode accounts for — it must never reach latest', () => {
    expect(() => distTagFor('1.0.0-rc.0', null)).toThrow(/Refusing to publish it to "latest"/)
    expect(() => distTagFor('1.0.0-beta.0', RC)).toThrow(/"rc" mode/)
    expect(() => distTagFor('0.51.1-alpha-20260810', RC)).toThrow()
  })

  it('an explicit --tag wins (snapshots use next), but never latest for a prerelease', () => {
    expect(resolvePublishTag('0.51.1-alpha-20260810', 'next', null)).toBe('next')
    expect(resolvePublishTag('1.0.0-rc.0', undefined, RC)).toBe('rc')
    expect(() => resolvePublishTag('1.0.0-rc.0', 'latest', RC)).toThrow(/--tag latest/)
    expect(() => resolvePublishTag('1.0.0', 'bad tag', null)).toThrow(/invalid --tag/)
  })

  it('parses pre.json and rejects a tag that could alias latest or break a URL', () => {
    expect(parsePreState(JSON.stringify({ mode: 'pre', tag: 'rc', initialVersions: {}, changesets: [] }))).toEqual(RC)
    expect(() => parsePreState(JSON.stringify({ mode: 'pre', tag: 'latest' }))).toThrow()
    expect(() => parsePreState(JSON.stringify({ mode: 'pre', tag: '../x' }))).toThrow()
    expect(() => parsePreState(JSON.stringify({ mode: 'weird', tag: 'rc' }))).toThrow()
  })

  it('isPreModeVersion matches only <tag>.<n>', () => {
    expect(isPreModeVersion('1.0.0-rc.3', RC)).toBe(true)
    expect(isPreModeVersion('1.0.0-rc', RC)).toBe(false)
    expect(isPreModeVersion('1.0.0-rc.3', null)).toBe(false)
  })

  it('compareSemver follows semver precedence', () => {
    expect(compareSemver('1.0.0-rc.1', '1.0.0-rc.0')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0-rc.10', '1.0.0-rc.9')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '1.0.0-rc.9')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0-rc.0', '0.54.0')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0-rc.0', '1.0.0-rc.0')).toBe(0)
    expect(compareSemver('1.0.0-1', '1.0.0-rc')).toBeLessThan(0)
    expect(() => compareSemver('x', '1.0.0')).toThrow()
  })
})

describe('the major switch — exactly the approved transition', () => {
  it('nothing is approved by default (the switch ships unset)', () => {
    expect(majorReleaseAllowed('0.54.0')).toBe(false)
  })

  it("'1.0.0' allows 0.x → 1.0.0 and the 1.0.0 rc series, nothing else", () => {
    expect(majorReleaseAllowed('0.54.0', '1.0.0')).toBe(true)
    expect(majorReleaseAllowed('0.54.0-rc.2', '1.0.0')).toBe(true)
    expect(majorReleaseAllowed('1.0.0-rc.0', '1.0.0')).toBe(true)
    expect(majorReleaseAllowed('1.0.0-rc.7', '1.0.0')).toBe(true)
    // Once 1.0.0 is out the switch is inert: another major would be 2.0.0.
    expect(majorReleaseAllowed('1.0.0', '1.0.0')).toBe(false)
    expect(majorReleaseAllowed('1.2.0', '1.0.0')).toBe(false)
    expect(majorReleaseAllowed('1.1.0-rc.0', '1.0.0')).toBe(false)
  })

  it('a malformed approval allows nothing', () => {
    expect(majorReleaseAllowed('0.54.0', '1.1.0')).toBe(false)
    expect(majorReleaseAllowed('0.54.0', '1.0.0-rc.0')).toBe(false)
    expect(majorReleaseAllowed('0.54.0', '2.0.0')).toBe(false)
  })

  it('check-no-major: rejects an unapproved major, accepts the approved one', () => {
    const files = [
      { name: 'one-oh.md', text: "---\n'@pyreon/core': major\n---\n\nPyreon 1.0.\n" },
      { name: 'fix.md', text: "---\n'@pyreon/router': patch\n---\n\nImpact: major\n" },
    ]
    expect(majorOffenders(files)).toEqual(["one-oh.md: '@pyreon/core': major"])
    expect(checkNoMajor(files, '0.54.0', null).ok).toBe(false)
    expect(checkNoMajor(files, '0.54.0', '1.0.0')).toMatchObject({ ok: true, approvedTarget: '1.0.0' })
    // A major merged during the rc series still lands in the approved 1.0.0.
    expect(checkNoMajor(files, '1.0.0-rc.3', '1.0.0').ok).toBe(true)
    expect(checkNoMajor(files, '1.0.0', '1.0.0').ok).toBe(false)
  })

  it('check-no-major reads only the frontmatter (body prose like "Impact: major" is not a bump)', () => {
    expect(checkNoMajor([{ name: 'a.md', text: "---\n'@pyreon/core': minor\n---\n\nImpact: major\n" }], '0.54.0', null).ok).toBe(true)
  })

  it('cap-changeset-bumps leaves the approved major alone and caps everything else', () => {
    expect(shouldCapMajors('0.54.0', null)).toBe(true)
    expect(shouldCapMajors('0.54.0', '1.0.0')).toBe(false)
    expect(shouldCapMajors('1.0.0-rc.1', '1.0.0')).toBe(false)
    expect(shouldCapMajors('1.0.0', '1.0.0')).toBe(true)
  })

  it('cap-version-bumps: approved moves pass, pre exit is not a cascade, an unapproved rc fails', () => {
    expect(classifyOneZeroMove('1.0.0-rc.0', '0.54.0', '1.0.0')).toBe('approved')
    expect(classifyOneZeroMove('1.0.0', '0.54.0', '1.0.0')).toBe('approved')
    expect(classifyOneZeroMove('1.0.0', '1.0.0-rc.4', '1.0.0')).toBe('none')
    expect(classifyOneZeroMove('1.0.0', '1.0.0-rc.4', null)).toBe('none')
    expect(classifyOneZeroMove('1.0.0', '0.54.0', null)).toBe('cap')
    expect(classifyOneZeroMove('1.0.0-rc.0', '0.54.0', null)).toBe('refuse')
    expect(classifyOneZeroMove('0.55.0-rc.0', '0.54.0', null)).toBe('none')
  })
})

describe('check-published-state — compares against the version’s own dist-tag', () => {
  it('cmpSemver no longer drops the prerelease (rc.1 must not equal rc.0)', () => {
    expect(cmpSemver('1.0.0-rc.1', '1.0.0-rc.0')).toBeGreaterThan(0)
    expect(classifyLag([{ pkg: '@pyreon/core', npm: '1.0.0-rc.0' }], [{ pkg: '@pyreon/core', repo: '1.0.0-rc.1' }])).toEqual([
      { pkg: '@pyreon/core', repo: '1.0.0-rc.1', npm: '1.0.0-rc.0' },
    ])
    expect(classifyLag([{ pkg: '@pyreon/core', npm: '1.0.0-rc.1' }], [{ pkg: '@pyreon/core', repo: '1.0.0-rc.1' }])).toEqual([])
  })

  it('reads the rc tag, and falls back to latest only while the tag does not exist', async () => {
    const registry: Record<string, Record<string, string>> = {
      '@pyreon/core': { latest: '0.54.0', rc: '1.0.0-rc.1' },
      '@pyreon/zero': { latest: '0.54.0' },
    }
    const asked: string[] = []
    const lookup = async (pkg: string, tag: string) => {
      asked.push(`${pkg}@${tag}`)
      return registry[pkg]?.[tag] ?? null
    }
    expect(await npmChannelVersion('@pyreon/core', 'rc', lookup)).toBe('1.0.0-rc.1')
    expect(await npmChannelVersion('@pyreon/zero', 'rc', lookup)).toBe('0.54.0')
    expect(await npmChannelVersion('@pyreon/new', 'rc', lookup)).toBeNull()
    expect(await npmChannelVersion('@pyreon/core', 'latest', lookup)).toBe('0.54.0')
    const answered: string[] = []
    await npmChannelVersion('@pyreon/zero', 'rc', lookup, undefined, (t) => answered.push(t))
    await npmChannelVersion('@pyreon/core', 'rc', lookup, undefined, (t) => answered.push(t))
    expect(answered).toEqual(['latest', 'rc'])
    expect(asked).toEqual([
      '@pyreon/core@rc',
      '@pyreon/zero@rc',
      '@pyreon/zero@latest',
      '@pyreon/new@rc',
      '@pyreon/new@latest',
      '@pyreon/core@latest',
      '@pyreon/zero@rc',
      '@pyreon/zero@latest',
      '@pyreon/core@rc',
    ])
  })
})

describe('heal-release-chain — a release candidate is a cut, a snapshot is not', () => {
  const result = (version: string) => JSON.stringify({ version, published: ['@pyreon/core'] })

  it('finalizes a pre-mode rc, still refuses a snapshot', () => {
    expect(parsePublishResult(result('1.0.0-rc.0'), RC)?.version).toBe('1.0.0-rc.0')
    expect(parsePublishResult(result('1.0.0-rc.0'), null)).toBeNull()
    expect(parsePublishResult(result('0.51.1-alpha-20260810'), RC)).toBeNull()
    expect(chainDefinedFor('1.0.0', null)).toBe(true)
  })

  it('marks an rc GitHub Release as a prerelease, never a stable one', () => {
    expect(githubReleaseArgs('v1.0.0-rc.0', '1.0.0-rc.0', 'n')).toContain('--prerelease')
    expect(githubReleaseArgs('v1.0.0', '1.0.0', 'n')).not.toContain('--prerelease')
  })
})

describe('scaffold-smoke — the isolated cells keep running during an rc series', () => {
  const env = { GITHUB_HEAD_REF: process.env['GITHUB_HEAD_REF'], OVERRIDE: process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] }
  const run = (workspace: string, registry: Record<string, string>, pre: PreState | null) => {
    delete process.env['GITHUB_HEAD_REF']
    delete process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE']
    try {
      return shouldSkipIsolatedCell({
        readWorkspaceVersion: () => workspace,
        fetchNpmVersion: (_pkg, tag) => registry[tag] ?? null,
        readPreState: () => pre,
      })
    } finally {
      if (env.GITHUB_HEAD_REF !== undefined) process.env['GITHUB_HEAD_REF'] = env.GITHUB_HEAD_REF
      if (env.OVERRIDE !== undefined) process.env['PYREON_SKIP_ISOLATED_SCAFFOLD_SMOKE'] = env.OVERRIDE
    }
  }

  it('runs when the workspace rc is on the rc tag (latest is still 0.x)', () => {
    expect(run('1.0.0-rc.1', { latest: '0.54.0', rc: '1.0.0-rc.1' }, RC).skip).toBe(false)
  })

  it('skips while that rc is not published yet', () => {
    const r = run('1.0.0-rc.2', { latest: '0.54.0', rc: '1.0.0-rc.1' }, RC)
    expect(r.skip).toBe(true)
    expect(r.reason).toContain('npm rc is 1.0.0-rc.1')
  })

  it('skips before the first rc exists (falls back to latest)', () => {
    const r = run('1.0.0-rc.0', { latest: '0.54.0' }, RC)
    expect(r.skip).toBe(true)
    expect(r.reason).toContain('npm latest is 0.54.0')
  })

  it('compares rc.10 above rc.9 (the old comparator sorted it below and ran a doomed install)', () => {
    expect(run('1.0.0-rc.10', { latest: '0.54.0', rc: '1.0.0-rc.9' }, RC).skip).toBe(true)
  })
})

describe('check-breaking-changeset-codemod — breaking means minor in 0.x, major from 1.0', () => {
  const CM = new Map<string, string>()
  const zero = (bump: string) => `---\n'@pyreon/zero': ${bump}\n---\n\nChanged.\n`
  it('breakingBump follows the fixed group version', () => {
    expect(breakingBump('0.54.0')).toBe('minor')
    expect(breakingBump('1.0.0-rc.0')).toBe('major')
    expect(breakingBump('1.3.0')).toBe('major')
  })
  it('after 1.0 a zero major needs the Upgrade line and a minor does not', () => {
    expect(changesetProblems('a.md', zero('major'), CM, 'major')[0]).toContain('major bump of @pyreon/zero')
    expect(changesetProblems('a.md', zero('minor'), CM, 'major')).toEqual([])
  })
})

describe('wiring — the workflows and publish.ts use the channel', () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

  it('release-native triggers on rc tags and publishes on the version’s dist-tag', () => {
    const wf = read('.github/workflows/release-native.yml')
    expect(wf).toContain("- 'v[0-9]+.[0-9]+.[0-9]+-*'")
    expect(wf).toContain('DIST_TAG=$(bun "$GITHUB_WORKSPACE/scripts/release-channel.ts" dist-tag "$VERSION")')
    expect(wf).toMatch(/npm@11\.16\.0 publish --provenance --access public --tag "\$DIST_TAG"/)
  })

  it('publish.ts always passes the resolved dist-tag', () => {
    const src = read('scripts/publish.ts')
    expect(src).toContain('resolvePublishTag(pkg.version, explicitTag, preState)')
    expect(src).toContain("args.push('--tag', distTag)")
    // Internal lockstep edges go through the exact-pin rule (publish-ranges.test.ts).
    expect(src).toContain('lockstep: fixedGroup.has(pkgName) && fixedGroup.has(name)')
  })
})
