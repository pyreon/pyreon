// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../scripts')
const VALID = 'git+https://github.com/pyreon/pyreon.git'
const FORK = 'git+https://github.com/pyreon/pyreon-fork.git'

function fixture(run: (root: string, manifests: string[]) => void, repository: string | undefined) {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-provenance-preflight-'))
  try {
    mkdirSync(join(root, 'scripts'))
    for (const name of [
      'check-release-readiness.ts',
      'publish.ts',
      'publish-retry.ts',
      'publish-order.ts',
      'publish-classify.ts',
      'run-pool.ts',
      'strip-bun-condition.ts',
      'release-repository.ts',
    ]) {
      if (existsSync(join(SCRIPTS, name)))
        copyFileSync(join(SCRIPTS, name), join(root, 'scripts', name))
    }
    const manifests = ['core', 'broken'].map((name) => {
      const dir = join(root, 'packages', 'core', name)
      mkdirSync(dir, { recursive: true })
      const path = join(dir, 'package.json')
      const url = name === 'core' ? VALID : repository
      writeFileSync(
        path,
        JSON.stringify({
          name: `@pyreon/${name}`,
          version: '0.51.0',
          publishConfig: { access: 'public' },
          ...(url === undefined ? {} : { repository: { type: 'git', url } }),
        }),
      )
      return path
    })
    mkdirSync(join(root, '.changeset'))
    writeFileSync(
      join(root, '.changeset', 'config.json'),
      JSON.stringify({ fixed: [['@pyreon/core', '@pyreon/broken']] }),
    )
    mkdirSync(join(root, 'bin'))
    // Registry lookups return unknown; the publish boundary records arguments.
    // Execute the real Bun CLI and preflight without contacting or publishing to npm.
    writeFileSync(join(root, 'bin', 'npm'), '#!/bin/sh\nexit 1\n')
    writeFileSync(
      join(root, 'bin', 'bunx'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TASK_NPM_CALLS"\n',
    )
    for (const name of ['npm', 'bunx']) chmodSync(join(root, 'bin', name), 0o755)
    run(root, manifests)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function cli(root: string, script: string, args: string[] = []) {
  return spawnSync('bun', [join(root, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      CI: '1',
      HAS_SKIP_LABEL: 'false',
      PATH: `${join(root, 'bin')}:${process.env.PATH}`,
      TASK_NPM_CALLS: join(root, 'npm-calls'),
    },
  })
}

describe('release provenance preflight — real command boundaries', () => {
  it('the readiness gate rejects a different repository sharing the expected prefix', () => {
    fixture((root) => {
      const result = cli(root, 'check-release-readiness.ts')
      expect(result.status, result.stdout + result.stderr).toBe(1)
    }, FORK)
  })

  it.each([FORK, undefined])(
    'refuses the whole plan before rewriting manifests or invoking npm publish for repository %s',
    (repository) => {
      fixture((root, manifests) => {
        const before = manifests.map((path) => readFileSync(path, 'utf8'))
        const result = cli(root, 'publish.ts', ['--dry-run'])
        expect(result.status, result.stdout + result.stderr).toBe(1)
        expect(existsSync(join(root, 'npm-calls'))).toBe(false)
        expect(manifests.map((path) => readFileSync(path, 'utf8'))).toEqual(before)
      }, repository)
    },
  )

  it('allows valid metadata through both commands and restores the dry-run manifests', () => {
    fixture((root, manifests) => {
      const before = manifests.map((path) => readFileSync(path, 'utf8'))
      const gate = cli(root, 'check-release-readiness.ts')
      expect(gate.status, gate.stdout + gate.stderr).toBe(0)
      const publish = cli(root, 'publish.ts', ['--dry-run'])
      expect(publish.status, publish.stdout + publish.stderr).toBe(0)
      const calls = readFileSync(join(root, 'npm-calls'), 'utf8').trim().split('\n')
      expect(calls).toHaveLength(2)
      for (const call of calls)
        expect(call).toContain('publish --access public --ignore-scripts --dry-run')
      expect(manifests.map((path) => readFileSync(path, 'utf8'))).toEqual(before)
      expect(existsSync(join(root, 'publish-result.json'))).toBe(false)
    }, VALID)
  })
})
