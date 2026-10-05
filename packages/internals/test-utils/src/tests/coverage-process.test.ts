import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classifyCoverageExecution } from '../../../../../scripts/check-coverage'
import { captureCoverageProcess } from '../../../../../scripts/coverage-process'

const SUMMARY = `=============================== Coverage summary ===============================
Statements   : 100% ( 1/1 )
Branches     : 100% ( 1/1 )
Functions    : 100% ( 1/1 )
Lines        : 100% ( 1/1 )
================================================================================`

let dir: string
const pidFile = () => join(dir, 'pids.json')
const recordedPids = (): number[] =>
  existsSync(pidFile()) ? JSON.parse(readFileSync(pidFile(), 'utf8')) : []
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Outer failure guard also makes the old, unbounded implementation testable. */
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('coverage deadline did not settle')), 8_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function expectStopped(pids: number[]) {
  for (let i = 0; i < 40 && pids.some(alive); i++) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  expect(pids.filter(alive), 'owned fixture processes survived the deadline').toEqual([])
}

function run(source: string, timeoutMs = 2_000) {
  return bounded(
    captureCoverageProcess(process.execPath, ['-e', source], {
      cwd: dir,
      env: process.env,
      timeoutMs,
    }),
  )
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-coverage-process-'))
})
afterEach(() => {
  // Also clean up when bisecting to the original TERM-only implementation.
  // PIDs come only from this test's private fixture directory.
  for (const pid of recordedPids()) {
    if (process.platform !== 'win32') {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        /* no owned group remains */
      }
    }
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* already exited */
    }
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('coverage process deadlines', () => {
  it('preserves both output streams and a successful exit', async () => {
    const result = await run("console.log('out'); console.error('err')")
    expect(result).toMatchObject({ code: 0, signal: null, timedOut: false })
    // Capturing both streams is the contract; ordering between them is not.
    expect(result.output).toContain('out')
    expect(result.output).toContain('err')
  })

  it('preserves a nonzero exit and spawn errors', async () => {
    expect(await run('process.exit(7)')).toMatchObject({ code: 7, timedOut: false })
    const missing = await bounded(
      captureCoverageProcess(join(dir, 'missing-command'), [], {
        cwd: dir,
        env: process.env,
        timeoutMs: 2_000,
      }),
    )
    expect(missing.error).toContain('ENOENT')
    expect(classifyCoverageExecution(missing, '@pyreon/fixture', 95)).toMatchObject({
      kind: 'unparseable',
      timedOut: false,
    })
  })

  it('forcibly terminates a child that ignores TERM', async () => {
    const result = await run(`
      require('node:fs').writeFileSync(${JSON.stringify(pidFile())}, JSON.stringify([process.pid]));
      process.on('SIGTERM', () => {});
      setInterval(() => {}, 1000);
    `)
    expect(result.timedOut).toBe(true)
    expect(recordedPids()).toHaveLength(1)
    await expectStopped(recordedPids())
  }, 12_000)

  it.skipIf(process.platform === 'win32')(
    'terminates descendants holding pipes after their parent exits',
    async () => {
      const descendant = `
      require('node:fs').writeFileSync(${JSON.stringify(join(dir, 'ready'))}, 'ready');
      process.on('SIGTERM', () => {});
      setInterval(() => {}, 1000);
    `
      const result = await run(`
      const fs = require('node:fs');
      const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {
        stdio: ['ignore', 'inherit', 'inherit']
      });
      fs.writeFileSync(${JSON.stringify(pidFile())}, JSON.stringify([process.pid, child.pid]));
      const ready = setInterval(() => {
        if (fs.existsSync(${JSON.stringify(join(dir, 'ready'))})) process.exit(0);
      }, 10);
    `)
      expect(result).toMatchObject({ code: 0, timedOut: true })
      expect(recordedPids()).toHaveLength(2)
      await expectStopped(recordedPids())
    },
    12_000,
  )

  it.skipIf(process.platform === 'win32')(
    'still escalates when TERM makes the parent close before its descendant',
    async () => {
      const descendant = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
      const result = await run(`
        const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {
          stdio: 'ignore'
        });
        require('node:fs').writeFileSync(${JSON.stringify(pidFile())}, JSON.stringify([process.pid, child.pid]));
        setInterval(() => {}, 1000);
      `)
      expect(result.timedOut).toBe(true)
      expect(recordedPids()).toHaveLength(2)
      await expectStopped(recordedPids())
    },
    12_000,
  )
})

describe('incomplete coverage cannot pass', () => {
  it('rejects a printed summary from a child killed by a signal', () => {
    expect(
      classifyCoverageExecution(
        {
          output: SUMMARY,
          code: null,
          signal: 'SIGKILL',
          timedOut: false,
        },
        '@pyreon/fixture',
        95,
      ),
    ).toMatchObject({ kind: 'unparseable', timedOut: false })
  })

  it('rejects a printed 100% summary when the run timed out', () => {
    const execution = { output: SUMMARY, code: 0, signal: null, timedOut: true }
    expect(classifyCoverageExecution(execution, '@pyreon/fixture', 95)).toMatchObject({
      package: '@pyreon/fixture',
      kind: 'unparseable',
      timedOut: true,
    })
    expect(
      classifyCoverageExecution({ ...execution, timedOut: false }, '@pyreon/fixture', 95),
    ).toMatchObject({ statements: 100, pass: true })
  })
})
