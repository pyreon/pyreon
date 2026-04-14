import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliIO } from '../../../../../scripts/gen-docs-core'
import { main } from '../../../../../scripts/gen-docs-core'

// CLI coverage for the generator's `main()` entry. Most tests run
// IN-PROCESS via the injectable {stdout, stderr, exit} I/O — faster
// (~1ms per test vs ~200ms subprocess) and deterministic. One
// subprocess smoke test remains to cover the `bun scripts/gen-docs.ts`
// entry shape end-to-end.

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SELF), '../../../../..')

function fixture(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'gen-docs-cli-'))
  // Root package.json for workspaces-based category derivation. Mimic
  // the real shape so `getPackageCategories` finds the same set.
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      workspaces: [
        'packages/core/*',
        'packages/fundamentals/*',
        'packages/tools/*',
        'packages/ui-system/*',
        'packages/internals/*',
        'packages/zero/*',
      ],
    }),
  )
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function writeManifest(root: string, category: string, pkg: string, body: string) {
  const dir = join(root, 'packages', category, pkg, 'src')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.ts'), body)
}

/**
 * Write minimal llms.txt + llms-full.txt into the fixture. `main()`
 * reads both; absence of either triggers an ENOENT before the sync
 * check. A section landing-point for every manifest is required so
 * the "missing entry" path only fires when deliberately tested.
 */
function writeLlmsFiles(
  root: string,
  llmsTxtBody: string,
  llmsFullBody = '# llms-full.txt\n',
) {
  writeFileSync(join(root, 'llms.txt'), llmsTxtBody)
  writeFileSync(join(root, 'llms-full.txt'), llmsFullBody)
}

interface Captured {
  stdout: string[]
  stderr: string[]
  exitCode: number | undefined
}

class ExitError extends Error {
  constructor(public code: number) {
    super(`exit(${code})`)
  }
}

function captureIO(): { io: CliIO; captured: Captured } {
  const captured: Captured = { stdout: [], stderr: [], exitCode: undefined }
  const io: CliIO = {
    stdout: (s) => {
      captured.stdout.push(s)
    },
    stderr: (s) => {
      captured.stderr.push(s)
    },
    exit: (code) => {
      captured.exitCode = code
      throw new ExitError(code)
    },
  }
  return { io, captured }
}

async function runMain(root: string, args: string[]): Promise<Captured> {
  const { io, captured } = captureIO()
  try {
    await main(root, args, io)
  } catch (e) {
    if (!(e instanceof ExitError)) throw e
  }
  return captured
}

describe('gen-docs main() — in-process', () => {
  let fx: { root: string; cleanup: () => void }

  beforeEach(() => {
    fx = fixture()
  })

  afterEach(() => {
    fx.cleanup()
  })

  it('reports no manifests when fixture is empty', async () => {
    writeLlmsFiles(fx.root, '# llms.txt\n')
    const out = await runMain(fx.root, [])
    expect(out.exitCode).toBeUndefined() // no exit = success
    expect(out.stdout.join('\n')).toContain('no manifests found')
  })

  it('--check exits 0 when in sync', async () => {
    writeManifest(
      fx.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/x', tagline: 'does things', description: 'd', category: 'universal' as const, features: [], api: [], longExample: 'const x = 1' }`,
    )
    writeLlmsFiles(
      fx.root,
      '# llms.txt\n\n- @pyreon/x — does things\n',
      '# llms-full.txt\n\n## @pyreon/x — does things\n\n```typescript\nconst x = 1\n```\n',
    )
    const out = await runMain(fx.root, ['--check'])
    expect(out.exitCode).toBeUndefined()
  })

  it('--check exits 1 and prints diff on drift', async () => {
    writeManifest(
      fx.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/x', tagline: 'NEW', description: 'd', category: 'universal' as const, features: [], api: [], longExample: 'const x = 1' }`,
    )
    writeLlmsFiles(
      fx.root,
      '# llms.txt\n\n- @pyreon/x — old\n',
      '# llms-full.txt\n\n## @pyreon/x — old\n\n```typescript\nold body\n```\n',
    )
    const out = await runMain(fx.root, ['--check'])
    expect(out.exitCode).toBe(1)
    const err = out.stderr.join('\n')
    expect(err).toContain('out of sync')
    expect(err).toContain('- - @pyreon/x — old')
    expect(err).toContain('+ - @pyreon/x — NEW')
    expect(err).toContain('bun run gen-docs')
  })

  it('exits 1 on missing-entry error with placement hint', async () => {
    writeManifest(
      fx.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/orphan', tagline: 't', description: 'd', category: 'universal' as const, features: [], api: [], longExample: 'x' }`,
    )
    writeLlmsFiles(fx.root, '# llms.txt\n\n- @pyreon/other — nope\n', '# llms-full.txt\n')
    const out = await runMain(fx.root, ['--check'])
    expect(out.exitCode).toBe(1)
    const err = out.stderr.join('\n')
    expect(err).toContain('no matching llms.txt entry')
    expect(err).toContain('@pyreon/orphan')
    // Placement hint lists the valid category sections
    expect(err).toContain('core')
    expect(err).toContain('fundamentals')
  })

  it('write mode actually writes both llms.txt and llms-full.txt', async () => {
    writeManifest(
      fx.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/x', tagline: 'NEW', description: 'd', category: 'universal' as const, features: [], api: [], longExample: 'new body' }`,
    )
    const llmsPath = join(fx.root, 'llms.txt')
    const llmsFullPath = join(fx.root, 'llms-full.txt')
    writeLlmsFiles(
      fx.root,
      '# llms.txt\n\n- @pyreon/x — old\n',
      '# llms-full.txt\n\n## @pyreon/x — old\n\n```typescript\nold body\n```\n',
    )
    const out = await runMain(fx.root, [])
    expect(out.exitCode).toBeUndefined()
    const stdout = out.stdout.join('\n')
    expect(stdout).toContain('llms.txt: 1 line regenerated')
    expect(stdout).toContain('llms-full.txt: 1 section regenerated')
    expect(readFileSync(llmsPath, 'utf8')).toContain('- @pyreon/x — NEW')
    expect(readFileSync(llmsFullPath, 'utf8')).toContain('new body')
  })

  it('is idempotent — second run reports no changes on both files', async () => {
    writeManifest(
      fx.root,
      'fundamentals',
      'x',
      `export default { name: '@pyreon/x', tagline: 'stable', description: 'd', category: 'universal' as const, features: [], api: [], longExample: 'body' }`,
    )
    writeLlmsFiles(
      fx.root,
      '# llms.txt\n\n- @pyreon/x — stable\n',
      '# llms-full.txt\n\n## @pyreon/x — stable\n\n```typescript\nbody\n```\n',
    )
    const first = await runMain(fx.root, [])
    expect(first.exitCode).toBeUndefined()
    const second = await runMain(fx.root, [])
    expect(second.exitCode).toBeUndefined()
    const stdout = second.stdout.join('\n')
    expect(stdout).toContain('llms.txt: no changes')
    expect(stdout).toContain('llms-full.txt: no changes')
  })
})

describe('gen-docs CLI — subprocess smoke', () => {
  // ONE subprocess test that verifies the actual `bun scripts/gen-docs.ts`
  // entry shape works end-to-end. Faster in-process coverage in the
  // suite above; this is the environment-parity guard.

  it('CLI exits 0 on the real repo (--check)', () => {
    const result = spawnSync('bun', [join(REPO_ROOT, 'scripts', 'gen-docs.ts'), '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30000,
    })
    expect(result.status).toBe(0)
  })
})

// Smoke fixture copy for the subprocess path above. Unused in the
// in-process suite but kept for potential follow-up subprocess
// coverage (e.g. asserting the shebang-wrapped entry actually runs).
void cpSync
