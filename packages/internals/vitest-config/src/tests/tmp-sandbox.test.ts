import {
  existsSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import setup, {
  createSandbox,
  OWNER_FILE,
  STALE_DEAD_OWNER_MS,
  STALE_NO_OWNER_MS,
  sweepStaleSandboxes,
} from '../tmp-sandbox.ts'

const HOUR = 60 * 60 * 1000

/** A pid that certainly belonged to a process that has exited. */
function deadPid(): number {
  const r = spawnSync(process.execPath, ['-e', ''])
  return r.pid as number
}

function fakeSandbox(parent: string, name: string, owner?: { pid: number; startedAt: number }): string {
  const dir = join(parent, name)
  mkdirSync(dir)
  writeFileSync(join(dir, 'payload.txt'), 'x')
  if (owner) writeFileSync(join(dir, OWNER_FILE), JSON.stringify(owner))

  return dir
}

describe('tmp sandbox', () => {
  it('workers see a per-run TMPDIR, so tmpdir() lands inside it', () => {
    expect(basename(tmpdir())).toMatch(/^pyreon-vitest-/)
    const scratch = mkdtempSync(join(tmpdir(), 'probe-'))
    expect(dirname(scratch)).toBe(tmpdir())
  })

  it('spawned processes inherit the sandbox', () => {
    const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("os").tmpdir())'])
    const childTmp = r.stdout.toString()
    expect(basename(childTmp)).toMatch(/^pyreon-vitest-/)
    expect(childTmp).toBe(tmpdir())
  })

  it('teardown removes everything created inside and restores the env', () => {
    const before = process.env.TMPDIR
    const teardown = setup()
    const dir = process.env.TMPDIR as string
    expect(dir).not.toBe(before)
    const leak = mkdtempSync(join(tmpdir(), 'leak-'))
    writeFileSync(join(leak, 'f.txt'), 'x')
    teardown()
    expect(existsSync(dir)).toBe(false)
    expect(process.env.TMPDIR).toBe(before)
  })

  it('restores a variable that was set and removes one that was not', () => {
    const saved = { TEMP: process.env.TEMP, TMP: process.env.TMP }
    process.env.TEMP = '/was/set'
    delete process.env.TMP
    try {
      const teardown = setup()
      expect(process.env.TMP).toBe(process.env.TMPDIR)
      teardown()
      expect(process.env.TEMP).toBe('/was/set')
      expect('TMP' in process.env).toBe(false)
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })

  it('PYREON_TEST_KEEP_TMP=1 keeps the directory and says where it is', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.PYREON_TEST_KEEP_TMP = '1'
    let dir = ''
    try {
      const teardown = setup()
      dir = process.env.TMPDIR as string
      teardown()
      expect(existsSync(dir)).toBe(true)
      expect(warn).toHaveBeenCalledWith(`[pyreon] kept test temp dir: ${dir}`)
    } finally {
      delete process.env.PYREON_TEST_KEEP_TMP
      warn.mockRestore()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  describe('sweep of sandboxes left by killed runs', () => {
    it('removes a sandbox whose owner is dead and that is older than the margin', () => {
      const parent = mkdtempSync(join(tmpdir(), 'sweep-'))
      const now = Date.now()
      const stale = fakeSandbox(parent, 'pyreon-vitest-AAAAAA', {
        pid: deadPid(),
        startedAt: now - STALE_DEAD_OWNER_MS - HOUR,
      })
      expect(sweepStaleSandboxes(parent, now)).toEqual([stale])
      expect(existsSync(stale)).toBe(false)
    })

    it('keeps an old sandbox whose owner is still alive', () => {
      const parent = mkdtempSync(join(tmpdir(), 'sweep-'))
      const now = Date.now()
      const live = fakeSandbox(parent, 'pyreon-vitest-BBBBBB', {
        pid: process.pid,
        startedAt: now - 10 * STALE_DEAD_OWNER_MS,
      })
      expect(sweepStaleSandboxes(parent, now)).toEqual([])
      expect(existsSync(join(live, 'payload.txt'))).toBe(true)
    })

    it('keeps a young sandbox even when its owner is dead', () => {
      const parent = mkdtempSync(join(tmpdir(), 'sweep-'))
      const now = Date.now()
      const young = fakeSandbox(parent, 'pyreon-vitest-CCCCCC', {
        pid: deadPid(),
        startedAt: now - STALE_DEAD_OWNER_MS / 2,
      })
      expect(sweepStaleSandboxes(parent, now)).toEqual([])
      expect(existsSync(young)).toBe(true)
    })

    it('applies only the longer age rule to a sandbox with no owner file', () => {
      const parent = mkdtempSync(join(tmpdir(), 'sweep-'))
      const now = Date.now()
      const recent = fakeSandbox(parent, 'pyreon-vitest-DDDDDD')
      const ancient = fakeSandbox(parent, 'pyreon-vitest-EEEEEE')
      const recentTime = new Date(now - STALE_DEAD_OWNER_MS - HOUR)
      const ancientTime = new Date(now - STALE_NO_OWNER_MS - HOUR)
      utimesSync(recent, recentTime, recentTime)
      utimesSync(ancient, ancientTime, ancientTime)
      expect(sweepStaleSandboxes(parent, now)).toEqual([ancient])
      expect(existsSync(recent)).toBe(true)
    })

    it('never touches a path that is not exactly a sandbox directory', () => {
      const parent = mkdtempSync(join(tmpdir(), 'sweep-'))
      const outside = mkdtempSync(join(tmpdir(), 'outside-'))
      writeFileSync(join(outside, 'keep.txt'), 'x')
      const old = { pid: deadPid(), startedAt: 0 }
      const ancient = new Date(0)
      // Look-alike names: wrong suffix length, wrong prefix, extra suffix.
      for (const name of ['pyreon-vitest-ABC', 'pyreon-vitest-FFFFFFF', 'xpyreon-vitest-GGGGGG', 'other']) {
        const dir = fakeSandbox(parent, name, old)
        utimesSync(dir, ancient, ancient)
      }
      // The right name, but a file and a symlink rather than a directory.
      writeFileSync(join(parent, 'pyreon-vitest-HHHHHH'), 'x')
      writeFileSync(join(outside, OWNER_FILE), JSON.stringify(old))
      symlinkSync(outside, join(parent, 'pyreon-vitest-IIIIII'))
      const before = readdirSync(parent).sort()

      expect(sweepStaleSandboxes(parent, Date.now())).toEqual([])
      expect(readdirSync(parent).sort()).toEqual(before)
      expect(existsSync(join(outside, 'keep.txt'))).toBe(true)
    })

    it('setup records its owner and sweeps stale siblings in its own parent', () => {
      const parent = mkdtempSync(join(tmpdir(), 'sweep-'))
      const stale = fakeSandbox(parent, 'pyreon-vitest-JJJJJJ', { pid: deadPid(), startedAt: 0 })
      const before = process.env.TMPDIR
      const teardown = createSandbox(parent)
      try {
        const dir = process.env.TMPDIR as string
        expect(dirname(dir)).toBe(parent)
        expect(existsSync(stale)).toBe(false)
        expect(JSON.parse(readFileSync(join(dir, OWNER_FILE), 'utf8')).pid).toBe(process.pid)
      } finally {
        teardown()
      }
      expect(process.env.TMPDIR).toBe(before)
      expect(readdirSync(parent)).toEqual([])
    })
  })

  it('a run killed by SIGTERM removes its sandbox and still dies from the signal', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'signal-'))
    const module = join(import.meta.dirname, '..', 'tmp-sandbox.ts')
    const script = [
      `import { createSandbox } from ${JSON.stringify(module)}`,
      `createSandbox(${JSON.stringify(parent)})`,
      `process.stdout.write('ready')`,
      `setInterval(() => {}, 1000)`,
    ].join('\n')
    const child = spawn('bun', ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] })
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('ready')) resolve()
      })
      child.on('error', reject)
      child.on('exit', () => reject(new Error('child exited before it was ready')))
    })
    expect(readdirSync(parent)).toHaveLength(1)
    const exited = new Promise<NodeJS.Signals | null>((resolve) => {
      child.on('exit', (_code, signal) => resolve(signal))
    })
    child.kill('SIGTERM')
    expect(await exited).toBe('SIGTERM')
    expect(readdirSync(parent)).toEqual([])
  })
})
