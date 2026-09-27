/**
 * The CLI's argument and first-run contract. Every spec here was a silent
 * wrong answer before: a typo'd flag was ignored, a spaced value became the
 * directory, and a scan of a member package reported "fabric clean".
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseArgs } from '../cli/args'
import { runCli } from '../cli/index'
import { validateLoomSection } from '../core/config'
import { makeFixtureWorkspace } from './fixture'

let root: string
let out: string[]
let err: string[]

beforeAll(() => {
  root = makeFixtureWorkspace()
})
afterAll(() => rmSync(root, { recursive: true, force: true }))
afterEach(() => vi.restoreAllMocks())

function capture(): void {
  out = []
  err = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    err.push(String(chunk))
    return true
  })
}

const SPEC = { booleans: ['--strict'], values: ['--out'], maxPositionals: 1 }

describe('parseArgs', () => {
  it('reads a value flag in both the spaced and the = form', () => {
    for (const argv of [['--out', 'site'], ['--out=site']]) {
      const parsed = parseArgs(argv, SPEC)
      expect(parsed.ok && parsed.args.values.get('--out')).toBe('site')
      expect(parsed.ok && parsed.args.positionals).toEqual([])
    }
  })

  it('rejects an unknown flag with a suggestion', () => {
    expect(parseArgs(['--stirct'], SPEC)).toEqual({
      ok: false,
      error: 'unknown option --stirct. Did you mean --strict?',
    })
  })

  it('rejects a value flag with no value and a surplus positional', () => {
    expect(parseArgs(['--out'], SPEC).ok).toBe(false)
    expect(parseArgs(['a', 'b'], SPEC).ok).toBe(false)
  })
})

describe('runCli argument handling', () => {
  it('fails on a typo instead of running the scan', async () => {
    capture()
    expect(await runCli(['scan', root, '--stirct'])).toBe(1)
    expect(err.join('')).toContain('Did you mean --strict?')
    expect(out.join('')).toBe('')
  })

  it('prints the version and per-command help', async () => {
    capture()
    expect(await runCli(['--version'])).toBe(0)
    expect(out.join('')).toMatch(/^\d+\.\d+\.\d+/)
    capture()
    expect(await runCli(['scan', '--help'])).toBe(0)
    expect(out.join('')).toContain('loom <command>')
  })

  it('rejects a port that is not a port', async () => {
    capture()
    expect(await runCli(['dev', root, '--port', 'abc'])).toBe(1)
    expect(err.join('')).toContain('--port must be a whole number')
  })
})

describe('an empty scan is not a clean pass', () => {
  it('from a member package: fails and names the workspace root', async () => {
    capture()
    const member = join(root, 'packages', 'app')
    expect(await runCli(['scan', member, '--no-write'])).toBe(1)
    expect(err.join('')).toContain('declares no `workspaces`')
    expect(err.join('')).toContain(`run \`loom scan ${root}\``)
    expect(out.join('')).not.toContain('fabric clean')
  })

  it('from a root whose globs match nothing', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'loom-empty-'))
    try {
      mkdirSync(join(empty, 'packages'))
      writeFileSync(join(empty, 'package.json'), JSON.stringify({ name: 'r', workspaces: ['packages/*'] }))
      capture()
      expect(await runCli(['scan', empty, '--no-write'])).toBe(1)
      expect(err.join('')).toContain('its globs match no packages')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('config keys', () => {
  it('rejects a misspelled key with a suggestion', () => {
    expect(() => validateLoomSection({ strickt: true }, 'package.json')).toThrow(
      /unknown `loom.strickt`. Did you mean `strict`\?/,
    )
  })
})
