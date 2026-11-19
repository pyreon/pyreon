// `scripts/remove-on-exit.ts`: a registered scratch path is removed
// however the process ends — normal exit, `process.exit(n)`, an uncaught
// error, or SIGINT / SIGTERM / SIGHUP — and a signal still kills the process.
//
// Every case runs a real child process (`bun`) whose TMPDIR is a private
// `mkdtemp` parent created here, so the child only ever creates and removes
// paths inside that parent.

import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HELPER = resolve(import.meta.dirname, '../../../../../scripts/remove-on-exit.ts')

let parent = ''

/**
 * The child creates `<TMPDIR>/scratch-*`, registers it, prints its path, then
 * does what `mode` says. `worktree:<repo>` adds a git worktree of `<repo>`
 * inside the scratch dir and registers that too.
 */
const CHILD = `
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { removeOnExit } from ${JSON.stringify(HELPER)}

const mode = process.argv[2] ?? 'wait'
const dir = mkdtempSync(join(tmpdir(), 'scratch-'))
writeFileSync(join(dir, 'file.txt'), 'x')
if (process.env.OUTSIDE) symlinkSync(process.env.OUTSIDE, join(dir, 'link'))
const remove = removeOnExit(dir)
if (mode.startsWith('worktree:')) {
  const repo = mode.slice('worktree:'.length)
  const tree = join(dir, 'tree')
  removeOnExit(tree, { gitWorktree: repo })
  spawnSync('git', ['worktree', 'add', '--detach', tree], { cwd: repo, stdio: 'ignore' })
}
if (mode === 'other-listener') process.on('SIGTERM', () => { console.log('other listener'); setTimeout(() => process.exit(7), 50) })
console.log(dir)
if (mode === 'throw') throw new Error('boom')
if (mode === 'exit') process.exit(3)
if (mode === 'dispose') { remove(); remove(); console.log('disposed') ; process.exit(0) }
if (mode === 'sync') { spawnSync('sleep', ['1']); remove(); console.log('finished'); process.exitCode = 0 }
else if (mode === 'return') {} else setInterval(() => {}, 1000)
`

function childScript(): string {
  const file = join(parent, 'child.ts')
  writeFileSync(file, CHILD)
  return file
}

function scratchDirs(): string[] {
  return readdirSync(parent).filter((n) => n.startsWith('scratch-'))
}

/** Run to completion. */
function runChild(mode: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bun', [childScript(), mode], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: parent, ...env },
  })
}

/** Start, wait for the registered path on stdout, send `signal`, wait for the end. */
function killChild(
  mode: string,
  signal: NodeJS.Signals,
): Promise<{ dir: string; code: number | null; signal: NodeJS.Signals | null; stdout: string }> {
  return new Promise((done, fail) => {
    const child = spawn('bun', [childScript(), mode], {
      env: { ...process.env, TMPDIR: parent },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let dir = ''
    child.stdout.on('data', (b: Buffer) => {
      stdout += b.toString()
      const first = stdout.split('\n')[0] ?? ''
      if (dir === '' && stdout.includes('\n')) {
        dir = first.trim()
        child.kill(signal)
      }
    })
    child.on('error', fail)
    child.on('close', (code, sig) => done({ dir, code, signal: sig, stdout }))
  })
}

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'pyreon-remove-on-exit-test-'))
})

afterEach(() => {
  rmSync(parent, { recursive: true, force: true })
})

describe('removeOnExit', () => {
  it.each(['SIGTERM', 'SIGINT', 'SIGHUP'] as const)(
    'removes the path on %s and the process still dies from the signal',
    async (signal) => {
      const r = await killChild('wait', signal)
      expect(r.dir.startsWith(parent)).toBe(true)
      expect(r.signal).toBe(signal)
      expect(existsSync(r.dir)).toBe(false)
      expect(scratchDirs()).toEqual([])
    },
  )

  it.each([
    ['return', 0],
    ['exit', 3],
    ['throw', 1],
  ] as const)('removes the path when the process ends by %s (exit %i)', (mode, status) => {
    const r = runChild(mode)
    expect(r.status).toBe(status)
    expect(r.stdout.split('\n')[0]?.startsWith(parent)).toBe(true)
    expect(scratchDirs()).toEqual([])
  })

  it('the returned function removes now and is idempotent', () => {
    const r = runChild('dispose')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('disposed')
    expect(scratchDirs()).toEqual([])
  })

  it('leaves the shutdown to another SIGTERM listener, after cleaning up', async () => {
    const r = await killChild('other-listener', 'SIGTERM')
    expect(r.stdout).toContain('other listener')
    expect(r.signal).toBe(null)
    expect(r.code).toBe(7)
    expect(existsSync(r.dir)).toBe(false)
  })

  it('a signal that arrives during spawnSync is handled late, not lost', async () => {
    // The handler can only run once the synchronous child returns. By then the
    // script's own cleanup has run and nothing is pending, but the signal must
    // still end the process rather than be swallowed.
    const r = await killChild('sync', 'SIGTERM')
    expect(r.stdout).toContain('finished')
    expect(r.signal).toBe('SIGTERM')
    expect(existsSync(r.dir)).toBe(false)
  })

  it('does not follow a symlink out of the registered directory', () => {
    const outside = join(parent, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'keep.txt'), 'keep')
    const r = runChild('exit', { OUTSIDE: outside })
    expect(r.status).toBe(3)
    expect(scratchDirs()).toEqual([])
    expect(readdirSync(outside)).toEqual(['keep.txt'])
  })

  it('removes and unregisters a git worktree on SIGTERM', async () => {
    const repo = join(parent, 'repo')
    mkdirSync(repo)
    const git = (...args: string[]) =>
      spawnSync('git', args, {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: parent },
      })
    git('init', '-q')
    writeFileSync(join(repo, 'a.txt'), 'a')
    git('add', 'a.txt')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init')
    const r = await killChild(`worktree:${repo}`, 'SIGTERM')
    expect(r.signal).toBe('SIGTERM')
    expect(existsSync(r.dir)).toBe(false)
    expect(git('worktree', 'list', '--porcelain').stdout).not.toContain(r.dir)
  })

  it('refuses a relative path, the temp dir itself, or the root', () => {
    const run = (path: string) =>
      spawnSync(
        'bun',
        [
          '-e',
          `import { removeOnExit } from ${JSON.stringify(HELPER)}; removeOnExit(${JSON.stringify(path)})`,
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, TMPDIR: parent },
        },
      )
    for (const p of ['relative/dir', parent, '/']) {
      const r = run(p)
      expect(r.status).not.toBe(0)
      expect(r.stderr).toContain('[Pyreon] removeOnExit refuses')
    }
  })
})
