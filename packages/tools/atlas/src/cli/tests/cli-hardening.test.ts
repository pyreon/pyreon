/**
 * The CLI's input contract and the build's safety rails. Each spec here was a
 * silent wrong answer, or worse, before:
 *
 *   - unknown flags were ignored (`atlas scan --json` printed text; a typo'd
 *     `--outt` built into the default location);
 *   - `atlas build --out <dir>` emptied whatever directory it was given —
 *     `--out .` deleted the project;
 *   - a scoped `atlas verify <C> --check` diffed one component against the
 *     whole catalog, so every other component read as a regression;
 *   - a component whose module failed to load exited 0.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertSafeOutDir, OUT_MARKER } from '../../build/static'
import { relativizePaths, splitBakedRpc } from '../../build/bake'
import { readBakedRpcFile } from '../../ui/lens-client'
import { runCli, validateArgs } from '../run'

let dir: string
let stdout: string[]
let stderr: string[]

const write = (rel: string, body: string): void => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-harden-'))
  stdout = []
  stderr = []
  vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
    stdout.push(String(c))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
    stderr.push(String(c))
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('validateArgs', () => {
  it('rejects an unknown flag with a suggestion', () => {
    expect(validateArgs('build', ['--outt', 'x'])).toBe('unknown option --outt for `atlas build`. Did you mean --out?')
  })

  it('rejects a value flag with no value, and a value on a boolean flag', () => {
    expect(validateArgs('build', ['--out'])).toBe('--out needs a value.')
    expect(validateArgs('build', ['--out', '--title', 'x'])).toBe('--out needs a value.')
    expect(validateArgs('scan', ['--check=yes'])).toBe('--check does not take a value.')
  })

  it('rejects a surplus argument and names --cwd for verify', () => {
    expect(validateArgs('verify', ['Button', 'app'])).toContain('--cwd <dir>')
  })

  it('accepts both value forms', () => {
    expect(validateArgs('build', ['app', '--out', 'site', '--base=/x/'])).toBeUndefined()
  })
})

describe('runCli', () => {
  it('fails on a typo instead of running the command', async () => {
    expect(await runCli(['scan', dir, '--bogus'])).toBe(1)
    expect(stderr.join('')).toContain('unknown option --bogus')
    expect(stdout.join('')).toBe('')
  })

  it('prints the version, and help for `<command> --help` instead of running it', async () => {
    expect(await runCli(['--version'])).toBe(0)
    expect(stdout.join('')).toMatch(/^\d+\.\d+\.\d+/)
    stdout = []
    expect(await runCli(['scan', '--help'])).toBe(0)
    expect(stdout.join('')).toContain('Usage: atlas <command>')
  })

  it('scan --json prints one parseable document', async () => {
    write('src/Counter.tsx', 'export function Counter(props: { count: number }) { return 1 }\n')
    await runCli(['scan', dir, '--no-mount', '--json'])
    const doc = JSON.parse(stdout.join(''))
    expect(doc.components).toBe(1)
    expect(typeof doc.ok).toBe('boolean')
  })

  it('a scoped verify --check compares against that component only', async () => {
    write('src/Counter.tsx', 'export function Counter(props: { count: number }) { return 1 }\n')
    write('src/Badge.tsx', 'export function Badge(props: { label: string }) { return 1 }\n')
    await runCli(['scan', dir, '--no-mount'])
    stdout = []
    stderr = []
    // (The exit code is 1 either way here: with --no-mount nothing is
    // verified, which verify rightly refuses to call a pass. What this locks
    // is that the ratchet itself stays inside the component.)
    await runCli(['verify', 'Counter', '--cwd', dir, '--check', '--no-mount'])
    const text = stdout.join('') + stderr.join('')
    expect(text).toContain('--check:')
    expect(text).not.toContain('no longer present')
    expect(text).not.toContain('REGRESSED')
  })
})

describe('assertSafeOutDir', () => {
  const ctx = () => ({ root: dir, scanRoot: join(dir, 'src'), isDefault: false })

  it('refuses the project itself, a parent of it, and the source directory', () => {
    expect(() => assertSafeOutDir(dir, ctx())).toThrow(/contains the project/)
    expect(() => assertSafeOutDir(dirname(dir), ctx())).toThrow(/contains the project/)
    expect(() => assertSafeOutDir(join(dir, 'src'), ctx())).toThrow(/overlaps the component source/)
    expect(() => assertSafeOutDir(join(dir, 'src', 'site'), ctx())).toThrow(/overlaps/)
  })

  it('refuses a non-empty directory atlas did not write', () => {
    write('docs/important.md', 'keep me')
    expect(() => assertSafeOutDir(join(dir, 'docs'), ctx())).toThrow(/not written by atlas build/)
  })

  it('accepts a new directory, an empty one, and a previous build', () => {
    expect(() => assertSafeOutDir(join(dir, 'fresh'), ctx())).not.toThrow()
    mkdirSync(join(dir, 'empty'))
    expect(() => assertSafeOutDir(join(dir, 'empty'), ctx())).not.toThrow()
    write(`site/${OUT_MARKER}`, '')
    write('site/index.html', '')
    expect(() => assertSafeOutDir(join(dir, 'site'), ctx())).not.toThrow()
    write('old/index.html', '<div id="atlas-root"></div>')
    expect(() => assertSafeOutDir(join(dir, 'old'), ctx()), 'a pre-marker atlas build').not.toThrow()
  })

  it('never lets `atlas build --out .` start', async () => {
    write('src/Counter.tsx', 'export function Counter(props: { count: number }) { return 1 }\n')
    expect(await runCli(['build', dir, '--out', dir])).toBe(1)
    expect(stderr.join('')).toContain('refusing to write')
  })
})

describe('the baked payload', () => {
  it('splits per component and strips the build machine path', () => {
    const root = '/home/me/project'
    const split = splitBakedRpc(
      {
        source: { 'Core/Button': { path: `${root}/src/Button.tsx`, code: 'x' }, '': ['probe'] },
        lens: { 'Core/Button': { file: `${root}/src/Button.tsx` } },
      },
      root,
    )
    expect(split.inline).toEqual({ source: { '': ['probe'] } })
    const file = split.index['Core/Button'] as string
    expect(file).toMatch(/^[0-9a-f]{16}\.json$/)
    expect(split.files.get(file)).toEqual({
      source: { path: 'src/Button.tsx', code: 'x' },
      lens: { file: 'src/Button.tsx' },
    })
    expect(JSON.stringify([...split.files.values()])).not.toContain(root)
  })

  it('relativizes nested and embedded occurrences', () => {
    expect(relativizePaths({ a: ['see /r/x.ts:3'] }, '/r')).toEqual({ a: ['see x.ts:3'] })
  })

  it('the client fetches the file once and answers every method from it', async () => {
    const host = globalThis as { __ATLAS_STATIC_RPC_URL__?: string }
    host.__ATLAS_STATIC_RPC_URL__ = '/_atlas/rpc/'
    const files: Record<string, unknown> = {
      '/_atlas/rpc/index.json': { Button: 'b.json' },
      '/_atlas/rpc/b.json': { source: 'SRC', lens: { __atlasRpcError: 'no compiler' } },
    }
    const fetchImpl = vi.fn(async (url: string) => ({ ok: true, json: async () => files[url] })) as never
    try {
      expect(await readBakedRpcFile('source', { component: 'Button' }, fetchImpl)).toEqual({ ok: true, result: 'SRC' })
      expect(await readBakedRpcFile('lens', { component: 'Button' }, fetchImpl)).toEqual({ ok: false, error: 'no compiler' })
      expect(await readBakedRpcFile('source', { component: 'Nope' }, fetchImpl)).toMatchObject({ ok: false })
      expect(await readBakedRpcFile('source', {}, fetchImpl)).toBeUndefined()
      // A failed fetch is not cached: the next ask retries.
      host.__ATLAS_STATIC_RPC_URL__ = '/flaky/'
      let fail = true
      const flaky = vi.fn(async (url: string) => {
        if (fail) throw new Error('offline')
        return { ok: true, json: async () => ({ '/flaky/index.json': { B: 'c.json' }, '/flaky/c.json': { source: 'OK' } })[url] }
      }) as never
      expect(await readBakedRpcFile('source', { component: 'B' }, flaky)).toMatchObject({ ok: false })
      fail = false
      expect(await readBakedRpcFile('source', { component: 'B' }, flaky)).toEqual({ ok: true, result: 'OK' })
    } finally {
      delete host.__ATLAS_STATIC_RPC_URL__
    }
  })
})
