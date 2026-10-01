import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const SCRIPT = join(ROOT, 'scripts/install-playwright.sh')

// Exercise the actual bash entry. The command fixture models privilege
// boundaries and writes a trace to disk, so stderr timing cannot affect tests.
const COMMAND = `#!${process.execPath}
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { spawnSync, spawn } = require('node:child_process')
const { basename, join } = require('node:path')
const name = basename(process.argv[1])
const args = process.argv.slice(2)
const dir = process.env.FIXTURE
appendFileSync(join(dir, 'trace'), JSON.stringify({ name, args, root: process.env.FIXTURE_ROOT === 'yes' }) + '\\n')
function run(cmd, argv, env = process.env) {
  const r = spawnSync(cmd, argv, { env, stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
function count(key) {
  const file = join(dir, key)
  const n = existsSync(file) ? Number(readFileSync(file, 'utf8')) + 1 : 1
  writeFileSync(file, String(n))
  return n
}
if (name === 'sudo') {
  // timeout outside sudo cannot terminate root apt. Reject that arrangement.
  run(args[0], args.slice(1), { ...process.env, FIXTURE_ROOT: 'yes' })
}
if (name === 'timeout') {
  if (!['--kill-after=15s', '--signal=KILL'].includes(args[0])) process.exit(90)
  if (args.includes('install-deps') || args.includes('dpkg')) {
    if (process.env.FIXTURE_ROOT !== 'yes') process.exit(91)
  } else if (process.env.FIXTURE_ROOT === 'yes') process.exit(92)
  if (process.env.SCENARIO === 'hang' && args.includes('install-deps')) {
    // Real GNU timeout + a stubborn grandchild reproduce lock survival on
    // Linux. Shorten only the budgets, keeping the script's process tree.
    run('/usr/bin/timeout', [args[0], '1s', ...args.slice(2)])
  }
  run(args[2], args.slice(3))
}
if (name === 'node') {
  if (args[0] === '-p') run(process.env.REAL_NODE, args)
  if (args.includes('install-deps')) {
    const n = count('deps')
    if (process.env.SCENARIO === 'hang' && n === 1) {
      spawn(process.env.REAL_NODE, ['-e', "process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.env.FIXTURE + '/apt-pid', String(process.pid)); setInterval(() => {}, 1000)"], { stdio: 'ignore' })
      setInterval(() => {}, 1000)
    } else {
      if (process.env.SCENARIO === 'hang') {
        const pid = Number(readFileSync(join(dir, 'apt-pid'), 'utf8'))
        // A surviving apt still owns the lock; a zombie no longer does.
        if (existsSync('/proc/' + pid + '/stat') && !readFileSync('/proc/' + pid + '/stat', 'utf8').includes(') Z ')) process.exit(93)
      }
      process.exit(process.env.SCENARIO === 'deps-fail' || process.env.SCENARIO === 'repair-fail' || (process.env.SCENARIO === 'deps-retry' && n === 1) ? 124 : 0)
    }
  } else if (args.includes('install')) {
    const n = count('downloads')
    process.exit(process.env.SCENARIO === 'download-fail' || (process.env.SCENARIO === 'download-retry' && n === 1) ? 1 : 0)
  } else process.exit(94)
}
if (name === 'dpkg') process.exit(process.env.SCENARIO === 'repair-fail' ? 1 : 0)
if (name === 'grep') process.exit(1)
if (name !== 'node') process.exit(0)
`

interface Call {
  name: string
  args: string[]
  root: boolean
}

function install(scenario: string, engines = ['webkit', 'firefox']) {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-pw-install-'))
  try {
    for (const command of ['sudo', 'timeout', 'node', 'dpkg', 'tee', 'grep', 'xargs']) {
      const file = join(dir, command)
      writeFileSync(file, COMMAND)
      chmodSync(file, 0o755)
    }
    const result = spawnSync('bash', [SCRIPT, ...engines], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        FIXTURE: dir,
        FIXTURE_ROOT: 'no',
        REAL_NODE: process.execPath,
        SCENARIO: scenario,
      },
      stdio: 'ignore',
      timeout: 15_000,
    })
    const calls: Call[] = engines.length
      ? readFileSync(join(dir, 'trace'), 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : []
    return { status: result.status, calls }
  } finally {
    const aptPid = join(dir, 'apt-pid')
    if (existsSync(aptPid)) {
      try {
        process.kill(Number(readFileSync(aptPid, 'utf8')), 'SIGKILL')
      } catch {
        // The passing timeout case has already killed this exact fixture.
      }
    }
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('Playwright install entry', () => {
  it('installs OS dependencies as root and downloads browsers as the runner user', () => {
    const result = install('ok')
    expect(result.status).toBe(0)
    const deps = result.calls.find((c) => c.name === 'node' && c.args.includes('install-deps'))!
    const download = result.calls.find((c) => c.name === 'node' && c.args.includes('install'))!
    expect(deps.root).toBe(true)
    expect(download.root).toBe(false)
    expect(deps.args.slice(-2)).toEqual(['webkit', 'firefox'])
    expect(download.args.slice(-2)).toEqual(['webkit', 'firefox'])
  })

  it('repairs interrupted dpkg before retrying a transient dependency failure', () => {
    const result = install('deps-retry')
    expect(result.status).toBe(0)
    const operations = result.calls.filter(
      (c) => (c.name === 'node' && c.args[0] !== '-p') || c.name === 'dpkg',
    )
    expect(operations.map((c) => (c.name === 'dpkg' ? 'repair' : c.args[1]))).toEqual([
      'install-deps',
      'repair',
      'install-deps',
      'install',
    ])
  })

  it('fails closed for missing WebKit/Firefox dependencies without downloading unusable browsers', () => {
    const result = install('deps-fail')
    expect(result.status).toBe(1)
    expect(result.calls.some((c) => c.args.includes('install'))).toBe(false)
  })

  it('retains the Chromium-only fallback to preinstalled OS libraries', () => {
    expect(install('deps-fail', ['chromium']).status).toBe(0)
  })

  it('stops if interrupted dpkg cannot be repaired', () => {
    const result = install('repair-fail')
    expect(result.status).toBe(1)
    expect(
      result.calls.filter((c) => c.name === 'node' && c.args.includes('install-deps')),
    ).toHaveLength(1)
  })

  it('retries a transient browser download but fails a persistent outage', () => {
    expect(install('download-retry').status).toBe(0)
    expect(install('download-fail').status).toBe(1)
  })

  it('rejects an empty engine list', () => {
    expect(install('ok', []).status).toBe(1)
  })

  describe.skipIf(process.platform !== 'linux')('real GNU timeout process groups', () => {
    it('kills a TERM-resistant apt grandchild even when its parent exits on TERM', () => {
      const result = install('hang')
      expect(result.status).toBe(0)
      expect(
        result.calls.filter((c) => c.name === 'node' && c.args.includes('install-deps')),
      ).toHaveLength(2)
    })
  })
})
