/**
 * Tests for `runCli` — the reusable CLI entry extracted from `cli.ts`'s
 * `main()`. Both the `pyreon-lint` bin and `@pyreon/cli`'s `pyreon lint`
 * delegate to it, so its exit-code contract is the shared surface.
 *
 * Contract: returns 0 (ok) / 1 (errors), or null for long-running modes
 * (--watch / --lsp). The long-running paths are NOT exercised here — they
 * start real fs.watch / stdin servers; their `return null` branch is verified
 * by reading the code, not by spinning a server in a unit test.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { runCli } from '../cli'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})
function fixture(file: string, contents: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-runcli-'))
  dirs.push(root)
  writeFileSync(join(root, file), contents)
  return root
}

// Silence the command's stdout during tests (it prints reports/help).
function quiet<T>(fn: () => T): T {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    return fn()
  } finally {
    spy.mockRestore()
  }
}

describe('runCli — exit-code contract', () => {
  it('--help / --version / --list return 0 without exiting', () => {
    expect(quiet(() => runCli(['--help']))).toBe(0)
    expect(quiet(() => runCli(['--version']))).toBe(0)
    expect(quiet(() => runCli(['--list']))).toBe(0)
  })

  it('a clean file returns 0', () => {
    const root = fixture('clean.ts', 'export const answer = 42\n')
    expect(quiet(() => runCli([root, '--format', 'json']))).toBe(0)
  })

  it('a file with an error-level violation returns 1', () => {
    // Module-scope `window` access trips `no-window-in-ssr`; force it to error
    // so the result is deterministic regardless of preset defaults.
    const root = fixture('bad.ts', 'export const w = window.innerWidth\n')
    const code = quiet(() =>
      runCli([root, '--rule', 'pyreon/no-window-in-ssr=error', '--format', 'json']),
    )
    expect(code).toBe(1)
  })

  it('--quiet on a clean file still returns 0', () => {
    const root = fixture('clean2.ts', 'export const x = 1\n')
    expect(quiet(() => runCli([root, '--quiet']))).toBe(0)
  })
})
