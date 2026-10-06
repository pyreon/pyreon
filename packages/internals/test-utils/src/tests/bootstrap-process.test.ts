// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureCoverageProcess } from '../../../../../scripts/coverage-process'

let root: string
const pids = () => {
  const file = join(root, 'pids.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as number[]) : []
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-bootstrap-process-'))
})
afterEach(() => {
  for (const pid of pids()) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* no owned group remains */
    }
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* already exited */
    }
  }
  rmSync(root, { recursive: true, force: true })
})

const helper = new URL('../../../../../scripts/bootstrap-attribution.ts', import.meta.url).href
function owned(source: string) {
  return `setInterval(() => {
    try { process.kill(${process.pid}, 0) }
    catch (e) { if (e.code === 'ESRCH') process.exit(0) }
  }, 100).unref(); ${source}`
}
async function wrapper(source: string, timeoutMs: number) {
  const file = join(root, 'runner.ts')
  writeFileSync(
    file,
    `import { spawnBatchAttributed } from ${JSON.stringify(helper)};
    const r = await spawnBatchAttributed(${JSON.stringify(process.execPath)},
      ['-e', ${JSON.stringify(owned(source))}], {
        cwd: ${JSON.stringify(root)}, timeoutMs: ${timeoutMs},
        stdout: d => process.stdout.write(d), stderr: d => process.stderr.write(d)
      });
    console.log('VERDICT:' + JSON.stringify(r));
    // Deliberately let the runtime exit naturally. process.exit hides open pipes.
  `,
  )
  return captureCoverageProcess('bun', [file], { cwd: root, env: process.env, timeoutMs: 6_000 })
}
function verdict(output: string) {
  return JSON.parse(
    output
      .split('\n')
      .find((line) => line.startsWith('VERDICT:'))!
      .slice(8),
  )
}
function descendant(exitCode: number | null) {
  const ready = join(root, 'ready')
  const child = owned(`require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready');
    process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`)
  return `const fs = require('node:fs');
    const child = require('node:child_process').spawn(process.execPath,
      ['-e', ${JSON.stringify(child)}], {stdio: ['ignore', 'inherit', 'inherit']});
    fs.writeFileSync(${JSON.stringify(join(root, 'pids.json'))}, JSON.stringify([process.pid, child.pid]));
    process.on('SIGTERM', () => {});
    const ready = setInterval(() => {
      if (!fs.existsSync(${JSON.stringify(ready)})) return;
      clearInterval(ready); console.log('started');
      ${exitCode === null ? '' : `process.exit(${exitCode});`}
    }, 10);
    setInterval(() => {}, 1000);`
}

describe.skipIf(process.platform === 'win32')('bootstrap runtime termination', () => {
  it.each([3, 0, null])(
    'exits naturally and stops pipe holders (parent exit code: %s)',
    async (exitCode) => {
      const result = await wrapper(descendant(exitCode), exitCode === null ? 1_000 : 4_000)
      expect(result.timedOut, 'bootstrap resolved its promise but its process stayed alive').toBe(
        false,
      )
      expect(result.code, result.output).toBe(0)
      const batch = verdict(result.output)
      expect(batch).toMatchObject({ ok: false, timedOut: exitCode === null })
      expect(batch.output).toContain('started')
      expect(batch.output).toContain(exitCode === null ? 'timed out' : 'pipes remained open')
      expect(pids()).toHaveLength(2)
      for (let i = 0; i < 40; i++) {
        const alive = pids().filter((pid) => {
          try {
            process.kill(pid, 0)
            return true
          } catch {
            return false
          }
        })
        if (!alive.length) return
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error('owned build descendants survived bootstrap completion')
    },
  )
  it('streams and captures both outputs and exits after a clean build', async () => {
    const result = await wrapper("console.log('out'); console.error('err')", 4_000)
    expect(result).toMatchObject({ timedOut: false, code: 0 })
    expect(result.output).toContain('out')
    expect(result.output).toContain('err')
    expect(verdict(result.output)).toMatchObject({
      ok: true,
      timedOut: false,
    })
  })
})
