/**
 * End-to-end regression lock for the upstream "doctor silently
 * mis-scans multi-root workspaces" report.
 *
 * Pre-fix behavior (verified against the shipped 0.49.0 doctor):
 *   - react-patterns / pyreon-patterns scanned 0 files from EVERY cwd
 *     in a foreign workspace (the walker required the Pyreon repo's
 *     own two-level `packages` + `src` shape),
 *   - audit-tests was pinned to `<root>/packages` (fixed count from
 *     any cwd; `apps/` + `modules/` tests structurally unreachable),
 *   - the aggregate still reported 100/100 Grade A — a false green.
 *
 * These specs run the REAL gates against a fixture reproducing the
 * report's layout (`apps/* + packages/* + modules/* + tools/*`) with a
 * seeded violation in EACH root, and assert every root is found, from
 * the repo root AND from a nested cwd. Bisect-verified: reverting the
 * gates to `collectFirstPartySourceFiles` / the bare
 * `auditTestEnvironment(cwd)` fails the per-root assertions with
 * scanned=0 / missing findings.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runDoctor } from '../doctor/orchestrator'
import { runAuditTestsGate } from '../doctor/gates/audit-tests'
import { runPyreonPatternsGate } from '../doctor/gates/pyreon-patterns'
import { runReactPatternsGate } from '../doctor/gates/react-patterns'

let fixture = ''

function writeFile(relPath: string, content: string): void {
  const full = path.join(fixture, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

beforeAll(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-foreign-ws-'))
  writeFile(
    'package.json',
    JSON.stringify({
      name: 'foreign-repo',
      private: true,
      workspaces: ['apps/*', 'packages/*', 'modules/*', 'tools/*'],
    }),
  )
  for (const d of ['apps/app', 'packages/lib', 'modules/chart', 'tools/gen']) {
    writeFile(
      `${d}/package.json`,
      JSON.stringify({ name: path.basename(d), private: true }),
    )
  }
  // Seeded violation per root: react-ism in apps/, pyreon-ism in
  // modules/, mock-vnode test in packages/, clean file in tools/.
  writeFile(
    'apps/app/src/App.tsx',
    `import { useState } from "react"\nexport function App() { const [c] = useState(0); return <div className="app">{c}</div> }\n`,
  )
  writeFile(
    'modules/chart/src/Chart.tsx',
    `import { For } from "@pyreon/core"\nexport function Chart({ rows }) { return <For each={rows} key={(r) => r.id}>{(r) => <div>{r.id}</div>}</For> }\n`,
  )
  writeFile(
    'packages/lib/src/util.test.ts',
    `const vnode = { type: 'div', props: {}, children: [] }\nit('x', () => { expect(vnode.type).toBe('div') })\n`,
  )
  writeFile('tools/gen/src/gen.ts', `export const gen = () => 'ok'\n`)
})

afterAll(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

describe('multi-root workspace (upstream report layout)', () => {
  it('react-patterns finds the apps/ violation (was: scanned 0 from every cwd)', async () => {
    const result = await runReactPatternsGate({ cwd: fixture })
    expect(result.meta.skipped).toBeFalsy()
    expect(result.meta.scanned).toBeGreaterThan(0)
    const paths = result.findings.map((f) => f.location?.relPath ?? '')
    expect(paths.some((p) => p.includes('apps/app/src/App.tsx'))).toBe(true)
  })

  it('pyreon-patterns finds the modules/ violation', async () => {
    const result = await runPyreonPatternsGate({ cwd: fixture })
    expect(result.meta.scanned).toBeGreaterThan(0)
    const paths = result.findings.map((f) => f.location?.relPath ?? '')
    expect(paths.some((p) => p.includes('modules/chart/src/Chart.tsx'))).toBe(true)
  })

  it('audit-tests reaches the packages/ test (was: pinned to <root>/packages of the WRONG root)', async () => {
    const result = await runAuditTestsGate({ cwd: fixture, minRisk: 'medium' })
    expect(result.meta.scanned).toBe(1)
    const paths = result.findings.map((f) => f.location?.relPath ?? '')
    expect(paths.some((p) => p.includes('packages/lib/src/util.test.ts'))).toBe(true)
  })

  it('identical results from a NESTED cwd (apps/app) — the report ran from three cwds and got three different wrong answers', async () => {
    const nested = path.join(fixture, 'apps/app')
    const [react, pyreon, tests] = await Promise.all([
      runReactPatternsGate({ cwd: nested }),
      runPyreonPatternsGate({ cwd: nested }),
      runAuditTestsGate({ cwd: nested, minRisk: 'medium' }),
    ])
    // Same scan counts as from the root — the workspace anchor is
    // discovered by walking up, so cwd no longer changes coverage.
    expect(react.meta.scanned).toBeGreaterThan(0)
    expect(
      react.findings.some((f) => (f.location?.relPath ?? '').includes('apps/app/src/App.tsx')),
    ).toBe(true)
    expect(
      pyreon.findings.some((f) =>
        (f.location?.relPath ?? '').includes('modules/chart/src/Chart.tsx'),
      ),
    ).toBe(true)
    expect(tests.meta.scanned).toBe(1)
  })

  it('the full report exposes the scan scope (workspace field + per-gate scanned)', async () => {
    const report = await runDoctor({
      cwd: fixture,
      only: ['react-patterns', 'pyreon-patterns', 'audit-tests'],
    })
    expect(report.workspace?.source).toBe('workspaces')
    expect(report.workspace?.packageCount).toBe(4)
    expect(report.workspace?.globs).toEqual(['apps/*', 'packages/*', 'modules/*', 'tools/*'])
    expect(report.measured).toBe(true)
    // The seeded violations keep the score honest (below a perfect A
    // clean-pass — pre-fix this exact fixture scored 100).
    expect(report.findings.length).toBeGreaterThanOrEqual(3)
  })

  it('--roots override narrows the scan to the given globs', async () => {
    const result = await runReactPatternsGate({
      cwd: fixture,
      workspace: undefined,
    })
    expect(result.meta.scanned).toBeGreaterThan(1)
    const report = await runDoctor({
      cwd: fixture,
      only: ['react-patterns'],
      roots: ['tools/*'],
    })
    const gate = report.gates.find((g) => g.gate === 'react-patterns')
    // tools/gen has one clean source file — scanned exactly it.
    expect(report.workspace?.source).toBe('flag')
    expect(gate?.meta.scanned).toBe(1)
    expect(gate?.findings).toEqual([])
  })
})
