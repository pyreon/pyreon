// The iOS script phase must exist in the GENERATED Xcode project, not merely
// in project.yml.
//
// XcodeGen reads `preBuildScripts` / `postBuildScripts` only on a TARGET. At
// the YAML root they are accepted without a diagnostic and produce ZERO
// `PBXShellScriptBuildPhase`s, so Xcode never ran the TSX -> Swift compile
// hook (#3841). A test that greps the YAML for the script name passes on the
// broken layout, which is exactly how it shipped; so this has two layers:
//
//   1. structural (always on, no toolchain): every `preBuildScripts` /
//      `postBuildScripts` key sits under `targets.<name>`, never top level;
//   2. real XcodeGen (when installed): generate the project and count the
//      script phases in the .pbxproj. Absent xcodegen SKIPS loudly, and fails
//      under PYREON_REQUIRE_NATIVE_VALIDATE=1 so a runner without it cannot
//      silently turn the gate into a no-op.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

const PHASE_KEYS = ['preBuildScripts', 'postBuildScripts'] as const

/**
 * Where each script-phase key sits: `{ key, indent, topLevelKey }`. Indentation
 * aware, not a grep: a target-scoped key is indented exactly one level under
 * `targets:` -> `<Target>:`, a root key has indent 0.
 */
export function scriptPhasePlacements(yaml: string): { key: string; indent: number; topLevelKey: string; line: number }[] {
  const out: { key: string; indent: number; topLevelKey: string; line: number }[] = []
  let top = ''
  yaml.split('\n').forEach((raw, i) => {
    if (/^\s*(#|$)/.test(raw)) return
    const indent = raw.length - raw.trimStart().length
    const m = /^(\s*)([A-Za-z][A-Za-z0-9_]*):/.exec(raw)
    if (!m) return
    if (indent === 0) top = m[2]!
    if ((PHASE_KEYS as readonly string[]).includes(m[2]!)) out.push({ key: m[2]!, indent, topLevelKey: top, line: i + 1 })
  })
  return out
}

/** Violations: any script-phase key that is not a direct child of a target. */
export function misplacedScriptPhases(yaml: string): string[] {
  return scriptPhasePlacements(yaml)
    .filter((p) => !(p.topLevelKey === 'targets' && p.indent === 4))
    .map((p) => `${p.key} at line ${p.line} (indent ${p.indent}, under "${p.topLevelKey}") — XcodeGen only honours it on targets.<name>`)
}

const scaffoldYaml = buildScaffold({ name: 'my-app' }).find((f) => f.path === 'ios/project.yml')!.content

describe('placement checker', () => {
  it('flags the root-level shape that shipped in 0.52', () => {
    const broken = 'name: X\npreBuildScripts:\n  - script: a\ntargets:\n  X:\n    type: application\n'
    expect(misplacedScriptPhases(broken)).toHaveLength(1)
  })
  it('accepts a target-scoped key and ignores comments mentioning it', () => {
    const ok = '# preBuildScripts: nope\nname: X\ntargets:\n  X:\n    preBuildScripts:\n      - script: a\n'
    expect(misplacedScriptPhases(ok)).toEqual([])
  })
})

describe('scaffold ios/project.yml — structure', () => {
  it('declares its pre-build script on the app target', () => {
    const placements = scriptPhasePlacements(scaffoldYaml)
    expect(placements.map((p) => p.key)).toContain('preBuildScripts')
    expect(misplacedScriptPhases(scaffoldYaml)).toEqual([])
  })

  it('build-ios.sh passes --app to wire (Xcode runs it with cwd = ios/, which has no package.json)', () => {
    const sh = buildScaffold({ name: 'my-app' }).find((f) => f.path === 'scripts/build-ios.sh')!.content
    expect(sh).toMatch(/pyreon-native wire\b[^\n]*--app="\$\{PROJECT_DIR\}"/)
  })
})

describe('example iOS projects — structure', () => {
  const examples = new URL('../../../../../examples/', import.meta.url)
  const ymls = readdirSync(examples)
    .filter((d) => /^native-.*-ios$/.test(d))
    .map((d) => ({ d, text: readFileSync(new URL(`${d}/project.yml`, examples), 'utf8') }))

  it('finds the example projects', () => {
    expect(ymls.length).toBeGreaterThanOrEqual(5)
  })
  for (const { d, text } of ymls) {
    it(`${d}: no root-level script phases`, () => {
      expect(misplacedScriptPhases(text)).toEqual([])
    })
  }
})

const xcodegen = spawnSync('xcodegen', ['--version'], { encoding: 'utf8' })
const hasXcodegen = xcodegen.status === 0

describe('scaffold ios/project.yml — real XcodeGen output', () => {
  it('xcodegen is available (required under PYREON_REQUIRE_NATIVE_VALIDATE=1)', () => {
    if (!hasXcodegen) {
      if (process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1') {
        throw new Error('xcodegen not found on PATH (PYREON_REQUIRE_NATIVE_VALIDATE=1) — install with `brew install xcodegen`')
      }
      console.warn('[scaffold-xcodegen] SKIPPED: xcodegen not installed — the .pbxproj script-phase assertion did not run')
    }
    expect(true).toBe(true)
  })

  it.skipIf(!hasXcodegen)('the generated .pbxproj has the script phase, on the app target', () => {
    const root = mkdtempSync(join(tmpdir(), 'scaffold-xcodegen-'))
    try {
      for (const f of buildScaffold({ name: 'my-app' })) {
        if (!f.path.startsWith('ios/')) continue
        const full = join(root, f.path)
        mkdirSync(join(full, '..'), { recursive: true })
        writeFileSync(full, f.content)
      }
      // XcodeGen validates local-package paths; empty dirs satisfy it (the
      // project is generated, never built, here).
      for (const p of ['native-runtime-swift', 'native-router-swift']) mkdirSync(join(root, 'ios/PyreonPackages', p), { recursive: true })
      const res = spawnSync('xcodegen', ['generate', '--quiet'], { cwd: join(root, 'ios'), encoding: 'utf8' })
      expect(res.status, res.stderr + res.stdout).toBe(0)
      const pbx = readFileSync(join(root, 'ios/MyApp.xcodeproj/project.pbxproj'), 'utf8')
      const phases = pbx.match(/isa = PBXShellScriptBuildPhase;/g) ?? []
      expect(phases).toHaveLength(1)
      expect(pbx).toContain('scripts/build-ios.sh')
      // Membership: the phase id must be listed in the app target's buildPhases.
      const phaseId = /([0-9A-F]{24}) \/\* \[Pyreon\][^*]*\*\/ = \{\s*isa = PBXShellScriptBuildPhase;/.exec(pbx)?.[1]
      expect(phaseId).toBeTruthy()
      const target = /\/\* MyApp \*\/ = \{\s*isa = PBXNativeTarget;[\s\S]*?buildPhases = \(([\s\S]*?)\);/.exec(pbx)?.[1] ?? ''
      expect(target).toContain(phaseId!)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

