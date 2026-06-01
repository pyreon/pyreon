import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  consumerPackagesTouched,
  discoverPackages,
  evaluateGate,
  findOwningPackage,
  isChangesetFile,
  isConsumerAffectingFile,
  readChangesetIgnore,
  type GateInputs,
  type PackageInfo,
} from '../../../../../scripts/check-changeset-required'

/**
 * Tests for the changeset-required gate (`scripts/check-changeset-required.ts`).
 *
 * **Why this matters**: the pre-fix gate was inline shell in
 * `.github/workflows/changeset-check.yml` that matched ANY file under
 * `packages/`. That fired on private packages (`@pyreon/test-utils`,
 * `@pyreon/manifest`, `@pyreon/perf-harness`, `@pyreon/vitest-config`,
 * `@pyreon/playwright-config`, `@pyreon/devtools`, `@pyreon/ui-*`, every
 * `@pyreon/native-*`) — none of which ship to npm consumers, so a
 * changeset would be cosmetic. Every CI-only / test-only / internal-
 * tooling PR ended up with the `skip-changeset` label applied
 * manually; the label dance was a workaround for a too-coarse
 * detector.
 *
 * **Same shape as `check-diagnose-catalog.test.ts`** (PR #1167): the
 * script exposes pure predicates and a typed policy evaluator; the
 * runner in `main()` is a thin git/env/filesystem adapter. The
 * "no subprocess-tested scripts" rule from workflow.md keeps us out of
 * the brittle shell-output capture territory.
 *
 * Contract pinned here:
 *
 *  - Files in a PRIVATE package → NOT consumer-affecting.
 *  - Files in a changeset-`ignore`d package (examples / docs / ai-reference)
 *    → NOT consumer-affecting.
 *  - Files outside `packages/` / `examples/` / `docs/` → NOT
 *    consumer-affecting (the workflow-level `git diff -- 'packages/**'`
 *    was already filtering these; the new script does it semantically
 *    via package discovery).
 *  - Files in a non-private, non-ignored package → consumer-affecting,
 *    requires a changeset.
 *  - `.changeset/*.md` add OR delete satisfies the gate.
 *  - `.changeset/README.md` / `config.json` don't count as changeset
 *    activity (infrastructure, not changesets).
 */

// ─── findOwningPackage ──────────────────────────────────────────────────────

const REPO = '/fake/repo'
const PACKAGES: PackageInfo[] = [
  { name: '@pyreon/router', dir: `${REPO}/packages/core/router`, private: false },
  { name: '@pyreon/core', dir: `${REPO}/packages/core/core`, private: false },
  { name: '@pyreon/test-utils', dir: `${REPO}/packages/internals/test-utils`, private: true },
  { name: '@pyreon/manifest', dir: `${REPO}/packages/internals/manifest`, private: true },
  { name: '@pyreon/perf-harness', dir: `${REPO}/packages/internals/perf-harness`, private: true },
  { name: '@pyreon/ui-components', dir: `${REPO}/packages/ui/components`, private: true },
  { name: '@pyreon/devtools', dir: `${REPO}/packages/tools/devtools`, private: true },
  { name: '@pyreon/zero', dir: `${REPO}/packages/zero/zero`, private: false },
  { name: '@pyreon/playground', dir: `${REPO}/examples/playground`, private: true },
  { name: '@pyreon/docs', dir: `${REPO}/docs`, private: true },
]

const IGNORED = new Set<string>([
  '@pyreon/playground',
  '@pyreon/docs',
  '@pyreon/example-react-compat',
])

describe('findOwningPackage', () => {
  it('finds the longest matching path prefix (not parent dir)', () => {
    const owner = findOwningPackage(
      'packages/core/router/src/router.ts',
      PACKAGES,
      REPO,
    )
    expect(owner?.name).toBe('@pyreon/router')
  })

  it('returns null for files outside any workspace', () => {
    expect(findOwningPackage('scripts/foo.ts', PACKAGES, REPO)).toBeNull()
    expect(findOwningPackage('.github/workflows/ci.yml', PACKAGES, REPO)).toBeNull()
    expect(findOwningPackage('package.json', PACKAGES, REPO)).toBeNull()
    expect(findOwningPackage('CLAUDE.md', PACKAGES, REPO)).toBeNull()
  })

  it('handles deeply nested paths', () => {
    const owner = findOwningPackage(
      'packages/zero/zero/src/server/handler.ts',
      PACKAGES,
      REPO,
    )
    expect(owner?.name).toBe('@pyreon/zero')
  })

  it('handles example workspaces', () => {
    const owner = findOwningPackage(
      'examples/playground/src/main.tsx',
      PACKAGES,
      REPO,
    )
    expect(owner?.name).toBe('@pyreon/playground')
  })

  it('handles the docs workspace', () => {
    const owner = findOwningPackage('docs/docs/index.md', PACKAGES, REPO)
    expect(owner?.name).toBe('@pyreon/docs')
  })

  it('does not match on substring (must be directory prefix)', () => {
    // A hypothetical file `packages/core/routerXX/foo.ts` should NOT
    // match `@pyreon/router` — `packages/core/router/` requires the
    // trailing slash boundary.
    const owner = findOwningPackage(
      'packages/core/routerXX/foo.ts',
      PACKAGES,
      REPO,
    )
    expect(owner).toBeNull()
  })
})

// ─── isConsumerAffectingFile ────────────────────────────────────────────────

describe('isConsumerAffectingFile', () => {
  describe('PRIVATE packages — NOT consumer-affecting (the #1167 follow-up case)', () => {
    it('rejects @pyreon/test-utils (private — test infra)', () => {
      expect(
        isConsumerAffectingFile(
          'packages/internals/test-utils/src/tests/check-diagnose-catalog.test.ts',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })

    it('rejects @pyreon/manifest (private — docs/MCP generation infra)', () => {
      expect(
        isConsumerAffectingFile(
          'packages/internals/manifest/src/render.ts',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })

    it('rejects @pyreon/perf-harness (private — dev-time counters)', () => {
      expect(
        isConsumerAffectingFile(
          'packages/internals/perf-harness/src/index.ts',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })

    it('rejects @pyreon/ui-components (private — demo component library)', () => {
      expect(
        isConsumerAffectingFile(
          'packages/ui/components/src/Button.tsx',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })

    it('rejects @pyreon/devtools (private — Chrome extension, never to npm)', () => {
      expect(
        isConsumerAffectingFile(
          'packages/tools/devtools/src/panel.ts',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })
  })

  describe('IGNORED packages (per changeset config) — NOT consumer-affecting', () => {
    it('rejects examples/playground (in .changeset/config.json ignore)', () => {
      expect(
        isConsumerAffectingFile(
          'examples/playground/src/main.tsx',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })

    it('rejects the docs workspace (in ignore list)', () => {
      expect(
        isConsumerAffectingFile(
          'docs/docs/index.md',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })
  })

  describe('Files outside any workspace — NOT consumer-affecting', () => {
    it('rejects scripts/', () => {
      expect(
        isConsumerAffectingFile('scripts/affected.ts', PACKAGES, IGNORED, REPO),
      ).toBe(false)
    })

    it('rejects .github/workflows/', () => {
      expect(
        isConsumerAffectingFile(
          '.github/workflows/ci.yml',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })

    it('rejects root config files', () => {
      expect(isConsumerAffectingFile('package.json', PACKAGES, IGNORED, REPO)).toBe(false)
      expect(isConsumerAffectingFile('bun.lock', PACKAGES, IGNORED, REPO)).toBe(false)
      expect(isConsumerAffectingFile('tsconfig.json', PACKAGES, IGNORED, REPO)).toBe(false)
    })

    it('rejects .claude/ rules', () => {
      expect(
        isConsumerAffectingFile(
          '.claude/rules/workflow.md',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(false)
    })
  })

  describe('Published packages — consumer-affecting', () => {
    it('accepts a source file in @pyreon/router', () => {
      expect(
        isConsumerAffectingFile(
          'packages/core/router/src/router.ts',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(true)
    })

    it('accepts a package.json change in a published package (deps may affect consumer install graph)', () => {
      expect(
        isConsumerAffectingFile(
          'packages/core/router/package.json',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(true)
    })

    it('accepts a test file in a published package — currently consumer-affecting (conservative; trade-off documented in script)', () => {
      // Trade-off: a test-only change in a published package doesn't
      // affect end users, but distinguishing test from source reliably
      // adds complexity AND a file-extension-based test-skip would let
      // genuine source-impacting changes slip through if they happen to
      // sit in test-shaped paths. We keep this conservative; users can
      // apply `skip-changeset` for genuinely test-only PRs.
      expect(
        isConsumerAffectingFile(
          'packages/core/router/src/tests/router.test.ts',
          PACKAGES,
          IGNORED,
          REPO,
        ),
      ).toBe(true)
    })
  })
})

// ─── consumerPackagesTouched ────────────────────────────────────────────────

describe('consumerPackagesTouched', () => {
  it('returns an empty array when only private packages are touched', () => {
    const files = [
      'packages/internals/test-utils/src/tests/foo.test.ts',
      'packages/internals/perf-harness/src/counters.ts',
      'packages/tools/devtools/src/panel.ts',
    ]
    expect(consumerPackagesTouched(files, PACKAGES, IGNORED, REPO)).toEqual([])
  })

  it('lists each unique published package touched', () => {
    const files = [
      'packages/core/router/src/router.ts',
      'packages/core/router/src/match.ts',
      'packages/core/core/src/signal.ts',
      'packages/internals/test-utils/src/tests/foo.test.ts',
    ]
    expect(consumerPackagesTouched(files, PACKAGES, IGNORED, REPO)).toEqual([
      '@pyreon/core',
      '@pyreon/router',
    ])
  })

  it('returns only the published packages from a mixed list', () => {
    const files = [
      'packages/core/router/src/router.ts',
      'examples/playground/src/main.tsx',
      'scripts/foo.ts',
      'packages/internals/manifest/src/index.ts',
    ]
    expect(consumerPackagesTouched(files, PACKAGES, IGNORED, REPO)).toEqual([
      '@pyreon/router',
    ])
  })
})

// ─── isChangesetFile ────────────────────────────────────────────────────────

describe('isChangesetFile', () => {
  it('matches a normal changeset file', () => {
    expect(isChangesetFile('.changeset/release-0.26.2-synced.md')).toBe(true)
  })

  it('matches a kebab-case slug', () => {
    expect(isChangesetFile('.changeset/fancy-rabbits-yell.md')).toBe(true)
  })

  it('rejects README.md', () => {
    expect(isChangesetFile('.changeset/README.md')).toBe(false)
  })

  it('rejects config.json', () => {
    expect(isChangesetFile('.changeset/config.json')).toBe(false)
  })

  it('rejects non-.changeset paths', () => {
    expect(isChangesetFile('packages/core/router/CHANGELOG.md')).toBe(false)
    expect(isChangesetFile('docs/changeset.md')).toBe(false)
  })

  it('rejects non-md files inside .changeset/', () => {
    expect(isChangesetFile('.changeset/foo.txt')).toBe(false)
    expect(isChangesetFile('.changeset/foo.json')).toBe(false)
  })
})

// ─── evaluateGate ───────────────────────────────────────────────────────────

describe('evaluateGate', () => {
  const ok = (over: Partial<GateInputs> = {}): GateInputs => ({
    files: ['packages/core/router/src/router.ts'],
    packages: PACKAGES,
    ignoredNames: IGNORED,
    repoRoot: REPO,
    hasSkipLabel: false,
    ...over,
  })

  it('skips when only private packages are touched (the PR #1167 follow-up shape)', () => {
    const res = evaluateGate(
      ok({
        files: [
          'scripts/check-diagnose-catalog.ts',
          'packages/internals/test-utils/src/tests/check-diagnose-catalog.test.ts',
          '.claude/rules/workflow.md',
        ],
      }),
    )
    expect(res).toEqual({ kind: 'skip-no-consumer-files' })
  })

  it('skips when only ignored packages are touched', () => {
    const res = evaluateGate(
      ok({
        files: [
          'examples/playground/src/main.tsx',
          'docs/docs/index.md',
        ],
      }),
    )
    expect(res.kind).toBe('skip-no-consumer-files')
  })

  it('skips when files are outside any workspace', () => {
    const res = evaluateGate(
      ok({
        files: ['package.json', 'bun.lock', '.github/workflows/ci.yml'],
      }),
    )
    expect(res.kind).toBe('skip-no-consumer-files')
  })

  it('skips when the skip-changeset label is present (even with published-package changes)', () => {
    const res = evaluateGate(ok({ hasSkipLabel: true }))
    expect(res.kind).toBe('skip-label')
  })

  it('passes when a changeset is added alongside a published-package change', () => {
    const res = evaluateGate(
      ok({
        files: [
          'packages/core/router/src/router.ts',
          '.changeset/fix-router-bug.md',
        ],
      }),
    )
    expect(res).toEqual({
      kind: 'ok-changeset-activity',
      activity: ['.changeset/fix-router-bug.md'],
    })
  })

  it('passes when a changeset is CONSUMED (deleted by Version PR) alongside a published-package change', () => {
    // The Version PR deletes existing changeset files when it bumps
    // package versions. `git diff --diff-filter=ACDMRTUXB` includes the
    // deletions in the changed-file list (the script's `git diff`
    // invocation also adds these via `--diff-filter=AD`-equivalent
    // semantics on the script side, matching the pre-fix shell behaviour).
    const res = evaluateGate(
      ok({
        files: [
          'packages/core/router/src/router.ts',
          'packages/core/router/CHANGELOG.md',
          '.changeset/fix-router-bug.md', // — appears in diff whether added or deleted
        ],
      }),
    )
    expect(res.kind).toBe('ok-changeset-activity')
  })

  it('fails when a published-package change has no changeset and no label', () => {
    const res = evaluateGate(ok())
    expect(res).toEqual({
      kind: 'fail-no-changeset',
      touched: ['@pyreon/router'],
    })
  })

  it('label-skip takes priority over a fail-no-changeset (legitimate bypass)', () => {
    const res = evaluateGate(ok({ hasSkipLabel: true }))
    expect(res.kind).toBe('skip-label')
  })

  it('skip-no-consumer-files takes priority over the label (label unnecessary)', () => {
    // Order of evaluation: no-consumer-files first; the label decision
    // never runs. Documents the precedence so future refactors don't
    // accidentally invert it (skipping unnecessary work is preferred
    // over a label that wouldn't be needed).
    const res = evaluateGate(
      ok({
        files: ['packages/internals/test-utils/src/tests/foo.test.ts'],
        hasSkipLabel: true,
      }),
    )
    expect(res.kind).toBe('skip-no-consumer-files')
  })

  it('changeset-only PR (e.g. someone manually adds a changeset) does NOT auto-pass — must touch a published package', () => {
    // Edge case: if a PR ONLY adds a changeset file and nothing else,
    // skip-no-consumer-files fires (the .changeset file isn't in any
    // package). This is correct — there's no published change to gate.
    const res = evaluateGate(
      ok({
        files: ['.changeset/orphan-changeset.md'],
      }),
    )
    expect(res.kind).toBe('skip-no-consumer-files')
  })
})

// ─── discoverPackages + readChangesetIgnore (filesystem-driven integration) ──

describe('discoverPackages + readChangesetIgnore', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'changeset-gate-test-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  function writePkg(relDir: string, json: object): void {
    const dir = join(tmp, relDir)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify(json, null, 2))
  }

  it('discovers all packages under packages/, examples/, docs/', () => {
    writePkg('packages/core/router', {
      name: '@pyreon/router',
    })
    writePkg('packages/internals/test-utils', {
      name: '@pyreon/test-utils',
      private: true,
    })
    writePkg('examples/playground', {
      name: '@pyreon/playground',
      private: true,
    })
    writePkg('docs', { name: '@pyreon/docs', private: true })

    const result = discoverPackages(tmp)
    const names = result.map((p) => p.name).sort()
    expect(names).toEqual([
      '@pyreon/docs',
      '@pyreon/playground',
      '@pyreon/router',
      '@pyreon/test-utils',
    ])
    expect(result.find((p) => p.name === '@pyreon/router')?.private).toBe(false)
    expect(result.find((p) => p.name === '@pyreon/test-utils')?.private).toBe(true)
  })

  it('skips package.json files missing a "name" field', () => {
    writePkg('packages/core/named', { name: '@pyreon/named' })
    writePkg('packages/core/anonymous', { version: '0.0.0' })

    const result = discoverPackages(tmp)
    expect(result.map((p) => p.name)).toEqual(['@pyreon/named'])
  })

  it('reads ignore from .changeset/config.json', () => {
    mkdirSync(join(tmp, '.changeset'), { recursive: true })
    writeFileSync(
      join(tmp, '.changeset', 'config.json'),
      JSON.stringify({
        ignore: ['@pyreon/playground', '@pyreon/docs'],
      }),
    )
    expect(readChangesetIgnore(tmp)).toEqual(['@pyreon/playground', '@pyreon/docs'])
  })

  it('returns [] when .changeset/config.json is missing', () => {
    expect(readChangesetIgnore(tmp)).toEqual([])
  })

  it('returns [] when config.json is malformed (defense-in-depth)', () => {
    mkdirSync(join(tmp, '.changeset'), { recursive: true })
    writeFileSync(join(tmp, '.changeset', 'config.json'), 'not valid json{')
    expect(readChangesetIgnore(tmp)).toEqual([])
  })

  it('returns [] when config.json has no `ignore` field', () => {
    mkdirSync(join(tmp, '.changeset'), { recursive: true })
    writeFileSync(
      join(tmp, '.changeset', 'config.json'),
      JSON.stringify({ baseBranch: 'main' }),
    )
    expect(readChangesetIgnore(tmp)).toEqual([])
  })
})

// ─── Sanity: real-repo end-to-end smoke ─────────────────────────────────────

describe('real-repo smoke (the actual Pyreon monorepo)', () => {
  // Resolves the monorepo root from the test file location.
  // packages/internals/test-utils/src/tests/<this> → ../../../../../
  const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..')

  it('discovers the expected private packages', () => {
    const packages = discoverPackages(REPO_ROOT)
    const privateNames = packages.filter((p) => p.private).map((p) => p.name).sort()
    // Spot-check the key ones — full list will drift as packages are
    // added; the assertion is "these MUST be in the private set" not
    // "the private set is EXACTLY these".
    expect(privateNames).toContain('@pyreon/test-utils')
    expect(privateNames).toContain('@pyreon/manifest')
    expect(privateNames).toContain('@pyreon/perf-harness')
    expect(privateNames).toContain('@pyreon/vitest-config')
    expect(privateNames).toContain('@pyreon/playwright-config')
    expect(privateNames).toContain('@pyreon/devtools')
  })

  it('reads the real ignore list', () => {
    const ignore = readChangesetIgnore(REPO_ROOT)
    expect(ignore).toContain('@pyreon/playground')
    expect(ignore).toContain('@pyreon/docs')
  })

  it('PR #1167\'s file list correctly skips the gate (the regression this fix prevents)', () => {
    const packages = discoverPackages(REPO_ROOT)
    const ignoredNames = new Set(readChangesetIgnore(REPO_ROOT))

    // Reconstruct PR #1167's actual file changes:
    const files = [
      'scripts/check-diagnose-catalog.ts',
      'packages/internals/test-utils/src/tests/check-diagnose-catalog.test.ts',
      '.claude/rules/workflow.md',
    ]

    const result = evaluateGate({
      files,
      packages,
      ignoredNames,
      repoRoot: REPO_ROOT,
      hasSkipLabel: false,
    })

    expect(result.kind).toBe('skip-no-consumer-files')
  })
})
