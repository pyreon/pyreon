/**
 * Byte-for-byte lock on `loom scan --json`: stdout carries the report and
 * nothing else; under `--json` the narration (the `→ path` notice and the red
 * count) goes to stderr. Both channels are read by tools (`loom scan . --json
 * > report.json`, MCP `get_dependency_fabric`, doctor's dependency-fabric
 * gate), so any change must surface here as a snapshot diff.
 *
 * Written against the CLI as it stood BEFORE the terminal-theme migration;
 * that migration changes only the human output and must leave these alone.
 */
import { realpathSync, rmSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { runCli } from '../cli/index'
import { makeFixtureWorkspace } from './fixture'

let root: string
beforeAll(() => {
  root = makeFixtureWorkspace()
})
afterAll(() => rmSync(root, { recursive: true, force: true }))
afterEach(() => vi.restoreAllMocks())

async function capture(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    err.push(String(chunk))
    return true
  })
  const code = await runCli(argv)
  vi.restoreAllMocks()
  // The fixture lives in a fresh temp dir; take its path out of the bytes.
  const real = realpathSync(root)
  // `model.root.dir` is relative to the cwd, so its `../` depth depends on
  // where the checkout lives; it is normalised with the path.
  const scrub = (s: string) =>
    s
      .split(real)
      .join('<root>')
      .split(root)
      .join('<root>')
      .replace(/(?:\.\.\/)*\.\.(?=<root>)/g, '')
  return { code, stdout: scrub(out.join('')), stderr: scrub(err.join('')) }
}

describe('loom scan --json is locked', () => {
  it('--json --no-write: the report on stdout, the red count on stderr', async () => {
    const r = await capture(['scan', root, '--json', '--no-write'])
    expect(r.code).toBe(1)
    expect(r.stdout).toMatchSnapshot('stdout')
    expect(r.stderr).toMatchSnapshot('stderr')
  })

  it('--json (writing): the write notice goes to stderr', async () => {
    const r = await capture(['scan', root, '--json'])
    rmSync(`${root}/loom-report.json`, { force: true })
    expect(r.code).toBe(1)
    expect(r.stderr).toMatchSnapshot('stderr')
  })

  it('--json --strict --no-imports', async () => {
    const r = await capture(['scan', root, '--json', '--no-write', '--strict', '--no-imports'])
    expect(r.stdout).toMatchSnapshot('stdout')
    expect(r.stderr).toMatchSnapshot('stderr')
  })
})
