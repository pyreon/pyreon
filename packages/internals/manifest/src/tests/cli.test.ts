import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// CLI coverage for scripts/gen-docs.ts. Runs the actual script as a
// subprocess against a fixture repo copy so the exit-code contract
// (0 in sync, 1 with drift or missing entry) is locked in. Unit tests
// only cover the pure functions; this file covers the CLI wrapper.

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SELF), '../../../../..')
const CLI_PATH = join(REPO_ROOT, 'scripts', 'gen-docs.ts')

function runCli(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  // Run from the fixture cwd so REPO_ROOT inside the CLI resolves to
  // the fixture, not the real repo. gen-docs.ts computes REPO_ROOT as
  // `dirname(SELF)/..` — walking up from `scripts/` — so we mirror the
  // directory shape inside the fixture.
  const result = spawnSync('bun', [join(cwd, 'scripts', 'gen-docs.ts'), ...args], {
    cwd,
    encoding: 'utf8',
  })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function setupFixture(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'gen-docs-cli-'))

  // Copy scripts/ (gen-docs.ts + gen-docs-core.ts) + manifest package
  // into the fixture, preserving relative paths. CLI computes
  // REPO_ROOT as `dirname(self)/..`, so placing gen-docs.ts at
  // <fixture>/scripts/ makes REPO_ROOT resolve to <fixture>.
  mkdirSync(join(root, 'scripts'), { recursive: true })
  cpSync(join(REPO_ROOT, 'scripts', 'gen-docs.ts'), join(root, 'scripts', 'gen-docs.ts'))
  cpSync(
    join(REPO_ROOT, 'scripts', 'gen-docs-core.ts'),
    join(root, 'scripts', 'gen-docs-core.ts'),
  )
  cpSync(
    join(REPO_ROOT, 'packages', 'internals', 'manifest'),
    join(root, 'packages', 'internals', 'manifest'),
    { recursive: true },
  )

  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function writeFixtureManifest(root: string, category: string, pkg: string, body: string) {
  const dir = join(root, 'packages', category, pkg, 'src')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.ts'), body)
}

describe('gen-docs CLI', () => {
  let fixture: { root: string; cleanup: () => void }

  beforeEach(() => {
    fixture = setupFixture()
  })

  afterEach(() => {
    fixture.cleanup()
  })

  it('exits 0 and reports no changes when there are no manifests', () => {
    writeFileSync(join(fixture.root, 'llms.txt'), '# llms.txt\n')
    const r = runCli([], fixture.root)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('no manifests found')
  })

  it('--check exits 0 when in sync', () => {
    writeFixtureManifest(
      fixture.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/x', tagline: 'does things', description: 'd', category: 'universal' as const, features: [], api: [] }`,
    )
    writeFileSync(
      join(fixture.root, 'llms.txt'),
      '# llms.txt\n\n- @pyreon/x — does things\n',
    )
    const r = runCli(['--check'], fixture.root)
    expect(r.code).toBe(0)
  })

  it('--check exits 1 and prints diff when drift detected', () => {
    writeFixtureManifest(
      fixture.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/x', tagline: 'NEW tagline', description: 'd', category: 'universal' as const, features: [], api: [] }`,
    )
    writeFileSync(
      join(fixture.root, 'llms.txt'),
      '# llms.txt\n\n- @pyreon/x — old tagline\n',
    )
    const r = runCli(['--check'], fixture.root)
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('out of sync')
    // Diff output shows both sides
    expect(r.stderr).toContain('- - @pyreon/x — old tagline')
    expect(r.stderr).toContain('+ - @pyreon/x — NEW tagline')
    // Fix pointer present
    expect(r.stderr).toContain('bun run gen-docs')
  })

  it('exits 1 and reports missing-entry error when manifest has no bullet in llms.txt', () => {
    writeFixtureManifest(
      fixture.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/orphan', tagline: 't', description: 'd', category: 'universal' as const, features: [], api: [] }`,
    )
    writeFileSync(join(fixture.root, 'llms.txt'), '# llms.txt\n\n- @pyreon/other — nope\n')
    const r = runCli(['--check'], fixture.root)
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('no matching bullet')
    expect(r.stderr).toContain('@pyreon/orphan')
  })

  it('write mode (no --check) actually writes llms.txt', () => {
    writeFixtureManifest(
      fixture.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/x', tagline: 'NEW', description: 'd', category: 'universal' as const, features: [], api: [] }`,
    )
    const llmsPath = join(fixture.root, 'llms.txt')
    writeFileSync(llmsPath, '# llms.txt\n\n- @pyreon/x — old\n')
    const r = runCli([], fixture.root)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('1 line regenerated')
    expect(readFileSync(llmsPath, 'utf8')).toContain('- @pyreon/x — NEW')
  })

  it('is idempotent on write — second invocation reports no changes', () => {
    writeFixtureManifest(
      fixture.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/x', tagline: 'stable', description: 'd', category: 'universal' as const, features: [], api: [] }`,
    )
    writeFileSync(
      join(fixture.root, 'llms.txt'),
      '# llms.txt\n\n- @pyreon/x — stable\n',
    )
    const first = runCli([], fixture.root)
    expect(first.code).toBe(0)
    const second = runCli([], fixture.root)
    expect(second.code).toBe(0)
    expect(second.stdout).toContain('no changes')
  })
})
