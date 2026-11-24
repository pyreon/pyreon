/**
 * `exitAfterFlush` (#4799): a command that prints and then exits must not
 * lose the output a PIPED reader has not taken yet. `process.exit()` ends the
 * process at once, and on macOS (Node and Bun) a piped stdout is written
 * asynchronously, so `pyreon doctor --ci --json | jq` saw the first 64 KiB.
 *
 * The child writes 3,000,000 bytes and keeps a handle open (a worker pool or a
 * server in a real command), so the exit has to be forced. The parent reads
 * slowly (paused for 300 ms), the way `| (sleep 1; wc -c)` or a busy CI
 * runner does. Bisect: replace `exitAfterFlush`'s body with
 * `process.exit(code)` and the `flush` cases receive 65,536 bytes.
 */
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterStreamsFlush, exitAfterFlush } from '../exit'

const CHILD = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'flush-child.ts')
const TOTAL = 3_000_000

const hasBun = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0
// Node strips the fixture's types natively from 23.6 / 22.18 (CI runs 24).
const nodeBin = process.versions.bun ? 'node' : process.execPath

interface Run {
  bytes: number
  code: number | null
  stderr: string
}

function run(runtime: string, mode: 'flush' | 'bare'): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(runtime, [CHILD, mode], { stdio: ['ignore', 'pipe', 'pipe'] })
    let bytes = 0
    let stderr = ''
    child.stdout.pause()
    setTimeout(() => child.stdout.resume(), 300)
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ bytes, code, stderr }))
  })
}

describe('exitAfterFlush', () => {
  const runtimes = [['node', nodeBin], ...(hasBun ? [['bun', 'bun']] : [])] as const

  for (const [name, bin] of runtimes) {
    it(`${name}: a slow piped reader gets every byte, and the exit code is kept`, async () => {
      const r = await run(bin, 'flush')
      expect(r.bytes).toBe(TOTAL)
      expect(r.code).toBe(3)
      expect(r.stderr).toContain('stderr-tail')
      expect(r.stderr).not.toContain('Error')
    }, 20_000)

    // The control: proves this harness sees the truncation at all. macOS only,
    // where piped stdio is asynchronous on both runtimes.
    describe.skipIf(process.platform !== 'darwin')('control', () => {
      it(`${name}: a bare process.exit loses what the pipe has not taken`, async () => {
        const r = await run(bin, 'bare')
        expect(r.bytes).toBeLessThan(TOTAL)
        expect(r.code).toBe(3)
      }, 20_000)
    })
  }

  it('a reader that closes early (`| head`) still exits with the code', async () => {
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(nodeBin, [CHILD, 'flush'], { stdio: ['ignore', 'pipe', 'ignore'] })
      child.stdout.once('data', () => child.stdout.destroy())
      child.on('error', reject)
      child.on('close', resolve)
    })
    expect(code).toBe(3)
  }, 20_000)
})

describe('a child that exits through exitAfterFlush leaves a shared stdout usable', () => {
  // `zero create` runs create-zero with inherited stdio, and a test runner's
  // worker shares its stdout socket with what it spawns. Ending stdout on Node
  // shuts that socket down for everyone, and the parent's next write failed
  // with EPIPE.
  const PARENT = join(dirname(CHILD), 'inherit-parent.mjs')
  for (const [name, bin] of [['node', nodeBin], ...(hasBun ? [['bun', 'bun']] : [])] as const) {
    it(`${name} child`, async () => {
      const out = await new Promise<string>((resolve, reject) => {
        // `pipe` is a socketpair on Unix, like a test worker's stdout.
        const parent = spawn(nodeBin, [PARENT, bin, CHILD], { stdio: ['ignore', 'pipe', 'pipe'] })
        let text = ''
        parent.stdout.on('data', (c: Buffer) => {
          text += c.toString()
        })
        parent.on('error', reject)
        parent.on('close', () => resolve(text))
      })
      expect(out.endsWith('parent-after\n')).toBe(true)
    }, 20_000)
  }
})

describe('afterStreamsFlush', () => {
  // In-process half: the branches the subprocesses cannot report coverage for.
  const slowStream = (written: string[]) =>
    new Writable({
      write(chunk, _enc, cb) {
        setTimeout(() => {
          written.push(String(chunk))
          cb()
        }, 20)
      },
    })

  for (const how of ['write', 'end'] as const) {
    it(`${how}: waits for what was queued on every stream`, async () => {
      const written: string[] = []
      const slow = slowStream(written)
      slow.write('a')
      slow.write('b')
      const other = new PassThrough().resume()
      const done = vi.fn()
      afterStreamsFlush([slow, other], how, done)
      expect(done).not.toHaveBeenCalled()
      await new Promise((r) => setTimeout(r, 120))
      expect(written.filter(Boolean)).toEqual(['a', 'b'])
      expect(done).toHaveBeenCalledTimes(1)
    })
  }

  it('counts an already finished or destroyed stream, an error, and no streams at all', async () => {
    const finished = new PassThrough().resume()
    finished.end()
    await new Promise((r) => finished.once('finish', r))
    const destroyed = new PassThrough()
    destroyed.destroy()
    const failing = new Writable({
      write(_chunk, _enc, cb) {
        cb(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      },
    })
    failing.on('error', () => {})
    const done = vi.fn()
    afterStreamsFlush([finished, destroyed, failing], 'write', done)
    await new Promise((r) => setTimeout(r, 20))
    expect(done).toHaveBeenCalledTimes(1)

    const none = vi.fn()
    afterStreamsFlush([], 'end', none)
    expect(none).toHaveBeenCalledTimes(1)
  })

  it('exitAfterFlush on Node sets exitCode, flushes with a write (never end), then exits with the code', async () => {
    const previous = process.exitCode
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const writes = [process.stdout, process.stderr].map((s) =>
      vi.spyOn(s, 'write').mockImplementation(((_chunk: unknown, cb?: () => void) => {
        queueMicrotask(() => cb?.())
        return true
      }) as never),
    )
    const ends = [process.stdout, process.stderr].map((s) => vi.spyOn(s, 'end'))
    try {
      void exitAfterFlush(7)
      expect(process.exitCode).toBe(7)
      expect(exit).not.toHaveBeenCalled()
      await new Promise((r) => setTimeout(r, 0))
      expect(exit).toHaveBeenCalledWith(7)
      for (const e of ends) expect(e).not.toHaveBeenCalled()
    } finally {
      exit.mockRestore()
      for (const w of writes) w.mockRestore()
      for (const e of ends) e.mockRestore()
      process.exitCode = previous
    }
  })
})
