/**
 * The CLI contract, programmatically (the policy-function-over-subprocess
 * rule): text summary, JSON mode, report write, and the red-exit semantics
 * that make `loom scan` a CI gate.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { runCli } from '../cli/index'
import { makeFixtureWorkspace } from './fixture'

let root: string
let out: string[]
let err: string[]

beforeAll(() => {
  root = makeFixtureWorkspace()
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

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
afterEach(() => vi.restoreAllMocks())

describe('loom scan', () => {
  it('reports the fabric + red-exits on error findings, writing the report', async () => {
    capture()
    const code = await runCli(['scan', root])
    expect(code).toBe(1)
    const text = out.join('')
    expect(text).toContain('5 workspace package(s)')
    expect(text).toContain('1 cycle(s)')
    expect(text).toContain('ERROR')
    expect(err.join('')).toMatch(/\d+ error\(s\)/)
    expect(existsSync(join(root, 'loom-report.json'))).toBe(true)
    const report = JSON.parse(readFileSync(join(root, 'loom-report.json'), 'utf8'))
    expect(report.stats.cycles).toBe(1)
  })

  it('--json prints the full report to stdout', async () => {
    capture()
    await runCli(['scan', root, '--json', '--no-write'])
    const parsed = JSON.parse(out.join('').split('  →')[0]!)
    expect(parsed.model.packages).toHaveLength(5)
  })

  it('--no-write leaves no artifact', async () => {
    rmSync(join(root, 'loom-report.json'), { force: true })
    capture()
    await runCli(['scan', root, '--no-write'])
    expect(existsSync(join(root, 'loom-report.json'))).toBe(false)
  })

  it('--no-imports skips the lexical detectors', async () => {
    capture()
    await runCli(['scan', root, '--json', '--no-write', '--no-imports'])
    const parsed = JSON.parse(out.join(''))
    const codes = new Set(parsed.issues.map((i: { code: string }) => i.code))
    expect(codes.has('phantom-dep')).toBe(false)
    expect(codes.has('version-drift')).toBe(true)
  })

  it('a non-workspace dir is a loud error, not a clean pass', async () => {
    capture()
    const code = await runCli(['scan', '/nonexistent-loom-dir'])
    expect(code).toBe(1)
    expect(err.join('')).toContain('no package.json')
  })
})

describe('cli surface', () => {
  it('--help prints usage and exits 0', async () => {
    capture()
    expect(await runCli(['--help'])).toBe(0)
    expect(out.join('')).toContain('loom <command>')
  })

  it('unknown commands are a red exit naming the command', async () => {
    capture()
    expect(await runCli(['frobnicate'])).toBe(1)
    expect(err.join('')).toContain('frobnicate')
  })
})
