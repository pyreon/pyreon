/**
 * The dependency-fabric doctor gate.
 *
 * Two behaviours carry the design and both are easy to get wrong quietly:
 *
 * SKIP-WHEN-ABSENT. `pyreon doctor` must never install anything. `pyreon loom`
 * reaches its tool with `npx --yes`, which FETCHES when the package is missing
 * — correct there, because the user typed `loom`. Doctor did not ask for it,
 * so this gate resolves the project's OWN install and skips when there is
 * none. A skipped gate's category is excluded from doctor's mean rather than
 * scored 100, so a project without loom is not awarded dependency health it
 * was never measured for.
 *
 * NO SIDE EFFECTS. An audit that writes files into the audited repo is a bug.
 * The scan runs with `--no-write`, so no `loom-report.json` appears.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  findingsFromReport,
  resolveLoomBin,
  runDependencyFabricGate,
} from '../doctor/gates/dependency-fabric'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

/** The real @pyreon/loom package directory in this workspace. */
const LOOM_PKG = resolve(__dirname, '../../../loom')
const LOOM_BUILT = existsSync(join(LOOM_PKG, 'bin', 'loom.js'))

/** A workspace with one member; `withLoom` links the real package in. */
function project(withLoom: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'doctor-fabric-'))
  roots.push(root)
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'proj', workspaces: ['packages/*'] }),
  )
  mkdirSync(join(root, 'packages/a/src'), { recursive: true })
  writeFileSync(
    join(root, 'packages/a/package.json'),
    JSON.stringify({ name: '@proj/a', version: '1.0.0', private: true }),
  )
  writeFileSync(
    join(root, 'packages/a/src/index.ts'),
    `import { x } from 'never-declared'\nexport const y = x`,
  )
  if (withLoom) {
    mkdirSync(join(root, 'node_modules/@pyreon'), { recursive: true })
    symlinkSync(LOOM_PKG, join(root, 'node_modules/@pyreon/loom'))
  }
  return root
}

describe('findingsFromReport', () => {
  it("preserves loom's severities rather than re-deciding them", () => {
    // `unused-dep` is INFO in loom because it is lexical evidence, not proof.
    // Promoting it here would turn "verify before removing" into an actionable
    // defect and get a dependency deleted that a bin loads at runtime.
    const findings = findingsFromReport({
      issues: [
        { code: 'phantom-dep', severity: 'error', pkg: '@x/a', dep: 'ghost', message: 'imports ghost' },
        { code: 'unused-dep', severity: 'info', pkg: '@x/a', dep: 'left-pad', message: 'declares left-pad' },
      ],
    })
    expect(findings.map((f) => f.severity)).toEqual(['error', 'info'])
    expect(findings.map((f) => f.code)).toEqual([
      'dependency-fabric/phantom-dep',
      'dependency-fabric/unused-dep',
    ])
    expect(findings.every((f) => f.category === 'architecture')).toBe(true)
  })

  it('an empty report yields no findings, not a fabricated pass', () => {
    expect(findingsFromReport({})).toEqual([])
  })
})

describe('resolveLoomBin', () => {
  it('finds the project\'s own install', () => {
    if (!LOOM_BUILT) return // built lib asserted below
    expect(resolveLoomBin(project(true))).toBeDefined()
  })

  it('is undefined when the project does not have loom — never a global or a fetch', () => {
    expect(resolveLoomBin(project(false))).toBeUndefined()
  })
})

describe('runDependencyFabricGate', () => {
  it('SKIPS when loom is absent, and says how to include it', async () => {
    const r = await runDependencyFabricGate({ cwd: project(false) })
    expect(r.meta?.skipped).toBe(true)
    expect(r.findings).toEqual([])
    // The reason has to be actionable AND state that nothing was measured —
    // a silent skip reads as "dependency health: fine".
    expect(r.meta?.skipReason).toMatch(/not installed/)
    expect(r.meta?.skipReason).toMatch(/pyreon add @pyreon\/loom/)
    expect(r.meta?.skipReason).toMatch(/Not scored rather than assumed healthy/)
  })

  it.skipIf(!LOOM_BUILT)('runs the scan when loom IS installed', async () => {
    const root = project(true)
    const r = await runDependencyFabricGate({ cwd: root })
    expect(r.meta?.skipped).toBeFalsy()
    expect(r.gate).toBe('dependency-fabric')
    expect(r.category).toBe('architecture')
    // The fixture's undeclared runtime import must surface.
    expect(r.findings.some((f) => f.code === 'dependency-fabric/phantom-dep')).toBe(true)
  })

  it.skipIf(!LOOM_BUILT)('leaves NO loom-report.json behind — an audit must not write', async () => {
    const root = project(true)
    await runDependencyFabricGate({ cwd: root })
    expect(existsSync(join(root, 'loom-report.json'))).toBe(false)
  })

  it('a scan that throws becomes ONE warning, never a crashed audit or a clean pass', async () => {
    // The shape that actually makes loom exit loudly is NO package.json —
    // "point loom at a workspace root". (A manifest merely lacking
    // `workspaces` scans cleanly to zero packages and exits 0; the first cut
    // of this spec assumed otherwise and passed for the wrong reason.)
    // `createRequire` anchors on a PATH, not an existing file, so the linked
    // loom still resolves here — which is exactly the case worth covering.
    if (!LOOM_BUILT) return
    const bare = mkdtempSync(join(tmpdir(), 'doctor-fabric-bare-'))
    roots.push(bare)
    mkdirSync(join(bare, 'node_modules/@pyreon'), { recursive: true })
    symlinkSync(LOOM_PKG, join(bare, 'node_modules/@pyreon/loom'))
    const r = await runDependencyFabricGate({ cwd: bare })
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]?.code).toBe('dependency-fabric/scan-failed')
    expect(r.findings[0]?.severity).toBe('warning')
  })

  it('a workspace with ZERO packages is reported as scanning zero, not as healthy', async () => {
    // The counterpart to the spec above, and the more dangerous shape: loom
    // succeeds, so the gate cannot tell from the exit code that it measured
    // nothing. `scanned: 0` is what lets a reader distinguish "clean fabric"
    // from "nothing was looked at" — the empty-scan class this repo gates on.
    if (!LOOM_BUILT) return
    const root = mkdtempSync(join(tmpdir(), 'doctor-fabric-empty-'))
    roots.push(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'no-workspaces' }))
    mkdirSync(join(root, 'node_modules/@pyreon'), { recursive: true })
    symlinkSync(LOOM_PKG, join(root, 'node_modules/@pyreon/loom'))
    const r = await runDependencyFabricGate({ cwd: root })
    expect(r.findings).toEqual([])
    expect(r.meta?.scanned).toBe(0)
  })

  it('@pyreon/loom is built in this environment — the skipIf specs are NOT free passes', () => {
    // A skipped suite must never masquerade as coverage. If this fires, run
    // `bun run --filter='@pyreon/loom' build`.
    expect(LOOM_BUILT).toBe(true)
  })
})

describe('the gate is registered', () => {
  // Spawns a REAL `bun doctor --help` subprocess. Budget derived, not
  // guessed: the child is a fresh bun boot + the CLI's static import graph —
  // which this fix cut from the full doctor gates graph (45.8s measured,
  // where it timed out vitest's 20s default under Coverage (Full) — the
  // failure that surfaced the heavy-eager-import) down to the slim
  // dispatcher. A loaded CI runner still pays contention on the child boot,
  // so the wall-clock backstop is 60s — comfortably above a healthy child,
  // and a re-regression to the 45s graph plus any load lands back over it
  // with the diagnostic naming the mechanism instead of a bare timeout.
  it('appears in doctor --help\'s gate list so it is discoverable', () => {
    const startedAt = Date.now()
    const out = execFileSync('bun', [resolve(__dirname, '../index.ts'), 'doctor', '--help'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    expect(
      out,
      `doctor --help took ${Date.now() - startedAt}ms — if this crept back toward ` +
        `the timeout, a heavy static import returned to the --help path ` +
        `(gate-names.ts must stay dependency-free)`,
    ).toContain('dependency-fabric')
  }, 60_000)
})
