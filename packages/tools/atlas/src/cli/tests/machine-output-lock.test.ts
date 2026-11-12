/**
 * Byte-for-byte locks on `atlas scan --json` and `atlas verify --json`.
 *
 * Under `--json` stdout carries ONE document and nothing else (narration goes
 * to stderr); agents and CI parse it. The human summary is free to change its
 * look, these are not — a change here must surface as a snapshot diff.
 *
 * Written against the CLI as it stood BEFORE the terminal-theme migration;
 * that migration changes only the human output and must leave these alone.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../run'

let dir: string

const write = (rel: string, body: string): void => {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

/** Every scenario passes. */
const passing = (): void => write('src/Counter.tsx', 'export function Counter(props: { count: number }) { return 1 }\n')
/** The generated empty-string scenario fails a11y. */
const failing = (): void => write('src/Button.tsx', 'export function Button(props: { label: string }) { return 1 }\n')

async function capture(...argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => {
    out.push(String(c))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
    err.push(String(c))
    return true
  })
  const code = await runCli(argv)
  vi.restoreAllMocks()
  const real = realpathSync(dir)
  const scrub = (s: string) => s.split(real).join('<dir>').split(dir).join('<dir>')
  return { code, stdout: scrub(out.join('')), stderr: scrub(err.join('')) }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-lock-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('atlas scan --json is locked', () => {
  it('a passing project', async () => {
    passing()
    const r = await capture('scan', dir, '--json')
    expect(r.code).toBe(0)
    expect(r.stdout).toMatchSnapshot()
  })

  it('a failing project', async () => {
    failing()
    const r = await capture('scan', dir, '--json', '--no-write')
    expect(r.code).toBe(1)
    expect(r.stdout).toMatchSnapshot()
  })

  it('--no-mount', async () => {
    passing()
    failing()
    const r = await capture('scan', dir, '--json', '--no-mount', '--no-write')
    expect(r.stdout).toMatchSnapshot()
  })
})

describe('atlas verify --json is locked', () => {
  it('a passing component', async () => {
    passing()
    const r = await capture('verify', 'Counter', '--cwd', dir, '--json')
    expect(r.code).toBe(0)
    expect(r.stdout).toMatchSnapshot()
  })

  it('a failing component', async () => {
    failing()
    const r = await capture('verify', 'Button', '--cwd', dir, '--json')
    expect(r.code).toBe(1)
    expect(r.stdout).toMatchSnapshot()
  })

  it('every component, --no-mount', async () => {
    passing()
    failing()
    const r = await capture('verify', '--cwd', dir, '--json', '--no-mount')
    expect(r.stdout).toMatchSnapshot()
  })

  it('an unknown component', async () => {
    passing()
    const r = await capture('verify', 'Nope', '--cwd', dir, '--json')
    expect(r.code).toBe(1)
    expect(r.stdout).toMatchSnapshot()
  })
})
