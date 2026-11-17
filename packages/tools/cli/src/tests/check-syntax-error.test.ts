import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { check, type CheckOptions } from '../check'

/**
 * `pyreon check` on a file that does not parse. The detectors parse with an
 * error-recovering parser and return nothing for code they cannot read, so a
 * broken file used to pass silently ("no Pyreon anti-patterns", exit 0).
 */
let tmp: string
let logs: string[]

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'px-check-syntax-'))
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

const opts = (over: Partial<CheckOptions>): CheckOptions => ({ paths: [], cwd: tmp, json: false, fix: false, ...over })

const write = (name: string, src: string): string => {
  const p = join(tmp, name)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, src, 'utf8')

  return p
}

describe('pyreon check — files that do not parse', () => {
  it('reports a syntax-error finding and exits non-zero', async () => {
    write('src/Broken.tsx', 'export const C = () => <div>\n')
    const code = await check(opts({ paths: ['src'], json: true }))
    expect(code).toBe(1)
    const out = JSON.parse(logs.join('\n')) as { findings: Array<Record<string, unknown>> }
    expect(out.findings).toEqual([
      {
        file: join('src', 'Broken.tsx'),
        line: 1,
        column: 24,
        code: 'syntax-error',
        source: 'syntax',
        message:
          "JSX element 'div' has no corresponding closing tag. (1 more syntax error in this file) The file does not parse, so the detectors cannot vouch for it.",
        suggested: 'fix the syntax error, then run pyreon check again',
        fixable: false,
      },
    ])
  })

  it('the text verdict is a failure, not "no Pyreon anti-patterns"', async () => {
    write('src/stray.ts', 'const x = 1 )) }\n')
    expect(await check(opts({ paths: ['src'] }))).toBe(1)
    const out = logs.join('\n')
    expect(out).toContain('syntax-error')
    expect(out).not.toContain('no Pyreon anti-patterns')
  })

  it('--fix leaves an unparseable file untouched', async () => {
    const src = `import { signal } from '@pyreon/reactivity'\nexport function C() {\n  const count = signal(0)\n  count(5)\n  return <div>\n}\n`
    const file = write('src/C.tsx', src)
    expect(await check(opts({ paths: ['src'], fix: true }))).toBe(1)
    expect(readFileSync(file, 'utf8')).toBe(src)
  })

  it('a .ts file with an angle-bracket cast parses (TS mode, not TSX)', async () => {
    write('src/cast.ts', 'declare const b: unknown\nexport const a = <number>b\n')
    expect(await check(opts({ paths: ['src'] }))).toBe(0)
  })
})
