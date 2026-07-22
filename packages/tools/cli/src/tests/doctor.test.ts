import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { type DoctorOptions, doctor } from '../doctor'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-doctor-'))
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

function defaults(cwd: string): DoctorOptions {
  return { fix: false, json: false, ci: false, cwd }
}

/**
 * Declare a Pyreon-shaped workspace in the fixture: root package.json
 * with two-level `packages` workspace globs + the examples exclusion the
 * real repo carries in `pyreon.doctor.excludeRoots`. Post-workspace-roots-fix
 * the doctor's scan scope comes from THIS config (not a hardcoded
 * `packages/<cat>/<pkg>/src` shape), so fixtures must declare it like a
 * real repo does.
 */
function writeWorkspaceRoot(cwd: string): void {
  writeFile(
    cwd,
    'package.json',
    JSON.stringify({
      name: 'fixture-repo',
      private: true,
      workspaces: ['packages/*/*'],
      pyreon: { doctor: { excludeRoots: ['examples/*'] } },
    }),
  )
}

function writePkg(cwd: string, relDir: string): void {
  writeFile(
    cwd,
    `${relDir}/package.json`,
    JSON.stringify({ name: relDir.split('/').pop(), private: true }),
  )
}

describe('doctor() end-to-end', () => {
  // Use `--only react-patterns` for the empty-dir tests — most other
  // gates walk up the dir tree looking for `packages/` (audit-tests)
  // or read the real repo root for known files (doc-claims). Pinning
  // to `react-patterns` isolates the test to the actual tmp dir.

  it('runs against an empty dir and prints a clean banner', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitCode = await doctor({
      ...defaults(cwd),
      only: ['react-patterns'],
    })
    const out = log.mock.calls.map((c) => c[0]).join('\n')
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    expect(out).toContain('pyreon doctor')
    expect(out).toContain('Score:')
    expect(exitCode).toBe(0)
  })

  it('--json emits a DoctorReport object', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await doctor({
      ...defaults(cwd),
      json: true,
      only: ['react-patterns'],
    })
    const out = log.mock.calls.map((c) => c[0]).join('')
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    const parsed = JSON.parse(out)
    expect(parsed.score).toBeTypeOf('number')
    expect(parsed.grade).toMatch(/^[A-F]$/)
    expect(Array.isArray(parsed.findings)).toBe(true)
    expect(Array.isArray(parsed.gates)).toBe(true)
  })

  it('--ci returns 0 when no error findings (something WAS measured)', async () => {
    const cwd = makeTmpDir()
    writeWorkspaceRoot(cwd)
    writePkg(cwd, 'packages/core/app')
    writeFile(
      cwd,
      'packages/core/app/src/clean.ts',
      `export const add = (a: number, b: number) => a + b\n`,
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitCode = await doctor({
      ...defaults(cwd),
      ci: true,
      only: ['react-patterns'],
    })
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })
    expect(exitCode).toBe(0)
  })

  it('--ci returns non-zero when NOTHING was measured (empty-scan false green)', async () => {
    // The upstream-reported bug: a repo layout the gates could not see
    // scored 100/100 Grade A and --ci exited 0 — enforcement that
    // measured nothing must FAIL, not pass (bisect-load-bearing).
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitCode = await doctor({
      ...defaults(cwd),
      ci: true,
      only: ['react-patterns'],
    })
    const errOut = err.mock.calls.map((c) => c[0]).join('\n')
    log.mockRestore()
    err.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })
    expect(exitCode).toBeGreaterThan(0)
    expect(errOut).toContain('measured nothing')
  })

  it('flags React patterns when detected', async () => {
    const cwd = makeTmpDir()
    // The scan scope comes from the fixture's OWN workspaces config —
    // `packages/*/*` members only; examples/ is not a workspace member
    // AND is excluded via `pyreon.doctor.excludeRoots` (both layers
    // mirror the real repo). A fixture outside the declared roots is
    // intentionally NOT audited.
    writeWorkspaceRoot(cwd)
    writePkg(cwd, 'packages/core/app')
    writePkg(cwd, 'packages/tools/react-compat')
    writeFile(
      cwd,
      'packages/core/app/src/App.tsx',
      `import { useState } from "react"\nexport function X() { const [c, setC] = useState(0); return <div className="x">{c}</div> }\n`,
    )
    // A SECOND React-ism fixture under examples/ + a *-compat package
    // must be IGNORED (objectivity guarantee — bisect-load-bearing).
    writeFile(
      cwd,
      'examples/demo/src/Demo.tsx',
      `import { useState } from "react"\nexport function D() { const [c] = useState(0); return <div className="d">{c}</div> }\n`,
    )
    writeFile(
      cwd,
      'packages/tools/react-compat/src/index.ts',
      `export function useState<T>(v: T) { return [v, () => {}] as const }\n`,
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await doctor({ ...defaults(cwd), json: true, only: ['react-patterns'] })
    const out = log.mock.calls.map((c) => c[0]).join('')
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    const parsed = JSON.parse(out)
    expect(parsed.findings.length).toBeGreaterThan(0)
    const codes = parsed.findings.map((f: { code: string }) => f.code)
    expect(codes.some((c: string) => c.startsWith('react-patterns/'))).toBe(true)
    // Objectivity: every finding is from the in-scope package fixture —
    // NONE from examples/ or the *-compat package (bisect-load-bearing).
    const paths = parsed.findings.map(
      (f: { location?: { relPath?: string } }) => f.location?.relPath ?? '',
    )
    expect(paths.every((p: string) => p.includes('packages/core/app/'))).toBe(
      true,
    )
    expect(paths.some((p: string) => p.includes('examples/'))).toBe(false)
    expect(paths.some((p: string) => p.includes('react-compat'))).toBe(false)
  })

  it('legacy --audit-tests maps to --only audit-tests', async () => {
    const cwd = makeTmpDir()
    writeWorkspaceRoot(cwd)
    writePkg(cwd, 'packages/core/app')
    writeFile(
      cwd,
      'packages/core/app/src/tests/x.test.ts',
      `it('x', () => { expect(1).toBe(1) })\n`,
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await doctor({
      ...defaults(cwd),
      json: true,
      auditTests: true,
    })
    const out = log.mock.calls.map((c) => c[0]).join('')
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    const parsed = JSON.parse(out)
    const ranGates = parsed.gates
      .filter((g: { meta: { skipped?: boolean } }) => !g.meta.skipped)
      .map((g: { gate: string }) => g.gate)
    expect(ranGates).toEqual(['audit-tests'])
  })

  it('respects --format=gha for GitHub Actions output', async () => {
    const cwd = makeTmpDir()
    writeWorkspaceRoot(cwd)
    writePkg(cwd, 'packages/core/app')
    writeFile(
      cwd,
      'packages/core/app/src/clean.ts',
      `export const ok = true\n`,
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await doctor({
      ...defaults(cwd),
      format: 'gha',
      only: ['react-patterns'],
    })
    const out = log.mock.calls.map((c) => c[0]).join('\n')
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    expect(out).toContain('::notice::pyreon doctor score:')
  })

  it('gha output warns (not notices a score) when nothing was measured', async () => {
    const cwd = makeTmpDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await doctor({
      ...defaults(cwd),
      format: 'gha',
      only: ['react-patterns'],
    })
    const out = log.mock.calls.map((c) => c[0]).join('\n')
    log.mockRestore()
    fs.rmSync(cwd, { recursive: true, force: true })

    expect(out).toContain('::warning::pyreon doctor measured nothing')
    expect(out).not.toContain('::notice::pyreon doctor score:')
  })
})
