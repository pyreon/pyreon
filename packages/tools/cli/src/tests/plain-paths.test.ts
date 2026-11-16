import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { plain, type PlainOptions } from '../plain'

let tmp: string
let logs: string[]

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'px-plain-paths-'))
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '))
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

const opts = (over: Partial<PlainOptions>): PlainOptions => ({
  paths: [],
  cwd: tmp,
  json: false,
  write: false,
  ...over,
})
const write = (name: string, src: string): string => {
  const p = join(tmp, name)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, src, 'utf8')
  return p
}

describe('pyreon plain — which files it reads', () => {
  it('a path that does not exist, and a file that is not source, match nothing (--json stays JSON)', async () => {
    write('readme.md', '# x\n')
    expect(await plain(opts({ paths: ['missing.tsx', 'readme.md'], json: true }))).toBe(0)
    expect(JSON.parse(logs.join('\n'))).toEqual({ files: [], declined: {}, matched: 0 })
  })

  it('a directory walk leaves test files out and says how many, unless --include-tests', async () => {
    write('src/View.tsx', 'export const v = 1\n')
    write('src/View.test.tsx', 'export const t = 1\n')
    await plain(opts({ paths: ['src'] }))
    const text = logs.join('\n').replace(/\s+/g, ' ')
    expect(text).toContain('1 test file skipped')
    expect(text).toContain('Pass --include-tests')

    logs.length = 0
    await plain(opts({ paths: ['src'], includeTests: true }))
    expect(logs.join('\n')).not.toContain('test file skipped')
  })
})
