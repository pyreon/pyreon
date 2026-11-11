// The terminal report of `create-multiplatform`, in the shared Pyreon CLI
// theme (`@pyreon/ansi`): a header line naming what ran, the next-step
// commands in an aligned column, and a verdict line with the file count and
// elapsed time; on failure, `✗ error:` with the message wrapped at 100
// columns. Snapshots freeze the look at every colour level, on both
// backgrounds and in ASCII, with ESC made visible as `␛`.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatError, formatSummary, main, type OutputStyle, run } from '../index'
import { OWN_VERSION } from '../own-version'

const ESC = String.fromCharCode(27)
const visible = (s: string): string => s.replaceAll(ESC, '␛').replaceAll(OWN_VERSION, '<version>')

const SUMMARY = { name: 'my-app', dir: 'my-app', files: 30, elapsedMs: 42 }
const LONG_ERROR = new Error(
  'Project name "MyApp" must start with a lowercase letter. Native targets (Xcode + Gradle) reject leading digits/special chars. Try "myapp" instead.',
)

const STYLES: Array<[string, OutputStyle]> = [
  ['colour level 0 (NO_COLOR)', { color: 0, unicode: true }],
  ['colour level 1 (16 colours)', { color: 1, unicode: true }],
  ['colour level 2, dark', { color: 2, theme: 'dark', unicode: true }],
  ['colour level 2, light', { color: 2, theme: 'light', unicode: true }],
  ['ASCII', { color: 0, unicode: false }],
]

describe('rendered report (snapshots)', () => {
  for (const [label, style] of STYLES) {
    it(label, () => {
      expect(visible(`${formatSummary(SUMMARY, style)}\n=====\n${formatError(LONG_ERROR, style)}`)).toMatchSnapshot()
    })
  }
})

describe('report shape', () => {
  it('first line says what ran; last line is the verdict with count and elapsed', () => {
    const lines = formatSummary(SUMMARY, { color: 0, unicode: true }).split('\n')
    expect(lines[0]).toBe(`create-multiplatform · ${OWN_VERSION}`)
    expect(lines.at(-1)).toBe('✓ scaffolded my-app → my-app/ · 30 files · 42 ms')
    expect(lines).toContain('  next    cd my-app && npm install && npm run dev')
  })

  it('wraps a long error at 100 columns, never inside a word, keeping the message whole', () => {
    const lines = formatError(LONG_ERROR, { color: 0, unicode: true }).split('\n')
    expect(lines[0]).toBe(`create-multiplatform · ${OWN_VERSION}`)
    expect(lines[1]?.startsWith('✗ error: Project name "MyApp"')).toBe(true)
    expect(lines.length).toBeGreaterThan(2)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(100)
    expect(lines.slice(1).map((l) => l.replace(/^✗ error: |^ {2}/, '')).join(' ')).toBe(LONG_ERROR.message)
  })

  it('never splits a path longer than the line', () => {
    const path = `/tmp/${'x'.repeat(120)}`
    const out = formatError(new Error(`Target directory "${path}" already exists.`), { color: 0, width: 100 })
    expect(out).toContain(`"${path}"`)
  })

  it('a non-Error throw is still reported', () => {
    expect(formatError('boom', { color: 0, unicode: true }).split('\n')[1]).toBe('✗ error: boom')
  })
})

describe('colour detection (FORCE_COLOR / TERM=dumb / NO_COLOR are honoured)', () => {
  const keys = ['NO_COLOR', 'FORCE_COLOR', 'TERM', 'COLORTERM', 'PYREON_CLI_THEME'] as const
  let saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
    for (const k of keys) delete process.env[k]
    process.env.TERM = 'xterm-256color'
  })
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('FORCE_COLOR=3 colours a pipe in truecolor; FORCE_COLOR=1 in 16 colours', () => {
    process.env.FORCE_COLOR = '3'
    expect(formatSummary(SUMMARY)).toContain(`${ESC}[38;2;`)
    process.env.FORCE_COLOR = '1'
    expect(formatSummary(SUMMARY)).toContain(`${ESC}[32m`)
  })

  it('NO_COLOR, FORCE_COLOR=0 and TERM=dumb print no escape at all', () => {
    for (const env of [{ NO_COLOR: '1', FORCE_COLOR: '3' }, { FORCE_COLOR: '0' }, { TERM: 'dumb', FORCE_COLOR: '3' }]) {
      Object.assign(process.env, env)
      expect(formatSummary(SUMMARY)).not.toContain(ESC)
      expect(formatError(LONG_ERROR)).not.toContain(ESC)
      for (const k of keys) delete process.env[k]
    }
  })

  it('PYREON_CLI_THEME=light switches to the light palette', () => {
    process.env.FORCE_COLOR = '3'
    process.env.PYREON_CLI_THEME = 'light'
    // ok on light: #15703A
    expect(formatSummary(SUMMARY)).toContain(`${ESC}[38;2;21;112;58m`)
  })
})

describe('main / run against a real directory', () => {
  let base: string
  const out: string[] = []
  const err: string[] = []
  const log = console.log
  const error = console.error
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'create-multiplatform-output-'))
    out.length = 0
    err.length = 0
    console.log = (...a: unknown[]) => void out.push(a.join(' '))
    console.error = (...a: unknown[]) => void err.push(a.join(' '))
  })
  afterEach(() => {
    console.log = log
    console.error = error
    rmSync(base, { recursive: true, force: true })
  })

  it('prints the header first and the verdict last, with the real file count', async () => {
    const dir = join(base, 'demo')
    expect(await run(['demo', '--dir', dir], { color: 0, unicode: true })).toBe(0)
    const lines = out.join('\n').split('\n')
    expect(lines[0]).toBe(`create-multiplatform · ${OWN_VERSION}`)
    expect(lines.at(-1)?.startsWith(`✓ scaffolded demo → ${dir}/ · `)).toBe(true)
    expect(lines.at(-1)).toMatch(/ · \d+ files · (\d+ ms|\d+\.\d s)$/)
    expect(err).toEqual([])
  })

  it('a refused scaffold goes to stderr as ✗ error and exits 1', async () => {
    writeFileSync(join(base, 'marker'), '')
    expect(await run(['demo', '--dir', base], { color: 0, unicode: true })).toBe(1)
    expect(out).toEqual([])
    expect(err.join('\n')).toContain('✗ error: Target directory')
    // `main` itself still throws the unformatted message, as before.
    await expect(main(['demo', '--dir', base])).rejects.toThrow(/already exists and is non-empty/)
  })
})
