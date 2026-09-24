import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import setup from '../tmp-sandbox.ts'

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
})
