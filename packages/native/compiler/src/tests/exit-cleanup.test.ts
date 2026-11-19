// `onProcessEnd` (used by the Kotlin daemon for its spool directory and JVM):
// the cleanup runs on exit and on SIGINT / SIGTERM / SIGHUP, and a signal
// still ends the process. Each case runs a real `bun` child whose TMPDIR is a
// private `mkdtemp` parent created here.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const MODULE = resolve(import.meta.dirname, '../exit-cleanup.ts')

const CHILD = `
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onProcessEnd } from ${JSON.stringify(MODULE)}
const dir = mkdtempSync(join(tmpdir(), 'spool-'))
const release = onProcessEnd(() => rmSync(dir, { recursive: true, force: true }))
console.log(dir)
const mode = process.argv[2]
if (mode === 'exit') process.exit(4)
if (mode === 'release') { release(); process.exit(0) }
setInterval(() => {}, 1000)
`

let parent = ''

function script(): string {
  const file = join(parent, 'child.ts')
  writeFileSync(file, CHILD)
  return file
}

const spools = (): string[] => readdirSync(parent).filter((n) => n.startsWith('spool-'))

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'pyreon-exit-cleanup-test-'))
})

afterEach(() => {
  rmSync(parent, { recursive: true, force: true })
})

describe('onProcessEnd', () => {
  it.each(['SIGTERM', 'SIGINT', 'SIGHUP'] as const)(
    'runs on %s and the process dies from it',
    async (signal) => {
      const r = await new Promise<{ dir: string; signal: NodeJS.Signals | null }>((done, fail) => {
        const child = spawn('bun', [script(), 'wait'], {
          env: { ...process.env, TMPDIR: parent },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let out = ''
        child.stdout.on('data', (b: Buffer) => {
          out += b.toString()
          if (out.includes('\n')) child.kill(signal)
        })
        child.on('error', fail)
        child.on('close', (_code, sig) => done({ dir: out.split('\n')[0]!.trim(), signal: sig }))
      })
      expect(r.dir.startsWith(parent)).toBe(true)
      expect(r.signal).toBe(signal)
      expect(existsSync(r.dir)).toBe(false)
    },
  )

  it('runs on a normal exit', () => {
    const r = spawnSync('bun', [script(), 'exit'], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: parent },
    })
    expect(r.status).toBe(4)
    expect(spools()).toEqual([])
  })

  it('does not run after release()', () => {
    const r = spawnSync('bun', [script(), 'release'], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: parent },
    })
    expect(r.status).toBe(0)
    expect(spools()).toHaveLength(1)
  })
})
