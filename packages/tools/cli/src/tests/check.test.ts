import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { check, type CheckOptions } from '../check'

/**
 * `pyreon check` — fast, file-scoped compiler-detector scan.
 *
 * Tests drive `check()` with EXPLICIT paths (the git-changed default is
 * environment-dependent) and assert the two load-bearing contracts:
 * (1) exit code — 1 on findings, 0 clean (so it gates pre-commit/CI), and
 * (2) the finding + inline fix actually surfaces.
 */
let tmp: string
let logs: string[]

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'px-check-'))
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(tmp, { recursive: true, force: true })
})

const opts = (over: Partial<CheckOptions>): CheckOptions => ({
  paths: [],
  cwd: tmp,
  json: false,
  fix: false,
  ...over,
})
const write = (name: string, src: string): string => {
  const p = join(tmp, name)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, src, 'utf8')
  return p
}
const out = () => logs.join('\n')

const BAD = `import { signal } from '@pyreon/reactivity'
export function C() {
  const count = signal(0)
  count(5)
  return <For each={[1, 2, 3]}>{(n) => <li>{n}</li>}</For>
}
`

describe('pyreon check — exit contract', () => {
  it('exits 1 and surfaces the finding + inline fix on anti-patterns', async () => {
    const f = write('bad.tsx', BAD)
    const code = await check(opts({ paths: [f] }))
    expect(code).toBe(1)
    expect(out()).toContain('signal-write-as-call')
    expect(out()).toContain('count.set(5)') // the inline fix
    expect(out()).toContain('for-missing-by')
  })

  it('exits 0 and reports clean on a file with no anti-patterns', async () => {
    const f = write('clean.ts', 'export const x = 1\n')
    const code = await check(opts({ paths: [f] }))
    expect(code).toBe(0)
    expect(out()).toContain('no Pyreon anti-patterns')
  })

  it('exits 0 when no source files match (e.g. a .md path)', async () => {
    const f = write('readme.md', '# hi\n')
    const code = await check(opts({ paths: [f] }))
    expect(code).toBe(0)
  })
})

describe('pyreon check — output modes', () => {
  it('--json emits parseable JSON with findings + fields', async () => {
    const f = write('bad.tsx', BAD)
    const code = await check(opts({ paths: [f], json: true }))
    expect(code).toBe(1)
    const parsed = JSON.parse(out())
    expect(parsed.findingCount).toBeGreaterThanOrEqual(2)
    expect(parsed.findings[0]).toMatchObject({
      code: expect.any(String),
      line: expect.any(Number),
      source: expect.stringMatching(/pyreon|react/),
      suggested: expect.any(String),
    })
  })
})

describe('pyreon check — --fix', () => {
  it('applies the mechanically-safe auto-fix in place, leaves the rest', async () => {
    const f = write('fixme.tsx', BAD)
    const code = await check(opts({ paths: [f], fix: true }))
    // signal-write-as-call is auto-fixable → written; for-missing-by is not.
    expect(readFileSync(f, 'utf8')).toContain('count.set(5)')
    expect(readFileSync(f, 'utf8')).not.toMatch(/\bcount\(5\)/)
    expect(out()).toContain('applied 1 auto-fix')
    expect(code).toBe(1) // for-missing-by remains
  })
})

describe('pyreon check — directory expansion', () => {
  it('recurses a directory arg and skips node_modules', async () => {
    write('nested/bad.tsx', BAD)
    write('nested/ok.ts', 'export const y = 2\n')
    write('node_modules/pkg/also-bad.tsx', BAD) // MUST be skipped
    const code = await check(opts({ paths: [tmp] }))
    expect(code).toBe(1)
    expect(out()).toContain('nested/bad.tsx')
    expect(out()).not.toContain('node_modules')
  })
})
