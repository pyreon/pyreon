import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
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
})
