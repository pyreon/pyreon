// The native-audit gate loads `@pyreon/native-compiler/audit` LAZILY because the
// audit moved out of `@pyreon/compiler` and the package is an OPTIONAL peer.
// What matters when it is absent: the gate SKIPS with an actionable message,
// never crashes, and is EXCLUDED from the score instead of awarded a 100.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { computeScore } from '../doctor/score'
import {
  loadNativeAudit,
  NATIVE_COMPILER_NOT_INSTALLED,
  runNativeAuditGate,
} from '../doctor/gates/native-audit'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const project = (src: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-native-gate-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'package.json'), '{"name":"app"}')
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src', 'App.tsx'), src)
  return dir
}

describe('native-audit gate — @pyreon/native-compiler not installed', () => {
  const absent = async () => undefined

  it('SKIPS loudly with an actionable install message instead of crashing', async () => {
    const dir = project(`import { Stack } from '@pyreon/primitives'\nexport const A = () => <Stack />\n`)
    const r = await runNativeAuditGate({ cwd: dir, loadAudit: absent })
    expect(r.meta.skipped).toBe(true)
    expect(r.meta.skipReason).toBe(NATIVE_COMPILER_NOT_INSTALLED)
    expect(r.meta.skipReason).toContain('install')
    expect(r.meta.skipReason).toContain('@pyreon/native-compiler')
    expect(r.findings).toEqual([])
  })

  it('is EXCLUDED from the score — a skipped native gate is not a 100', async () => {
    const dir = project(`export const x = 1\n`)
    const gate = await runNativeAuditGate({ cwd: dir, loadAudit: absent })
    const { categories } = computeScore(gate.findings, [gate])
    // Nothing was measured, so the category never enters the mean.
    expect(categories.filter((c) => c.included)).toEqual([])
  })

  it('does not swallow a REAL failure as "not installed"', async () => {
    // A throw while the audit module evaluates is a defect, not an absence.
    await expect(
      runNativeAuditGate({
        cwd: project('export const x = 1\n'),
        loadAudit: async () => {
          throw new Error('boom while evaluating')
        },
      }),
    ).rejects.toThrow('boom while evaluating')
  })
})

describe('native-audit gate — @pyreon/native-compiler installed', () => {
  it('the default loader resolves the real audit in this workspace and finds a hazard', async () => {
    expect(await loadNativeAudit()).toBeDefined()
    const dir = project(`import { Stack } from '@pyreon/primitives'\nclass C {}\nexport const A = () => <Stack />\n`)
    const r = await runNativeAuditGate({ cwd: dir })
    expect(r.meta.skipped).toBeUndefined()
    expect(r.findings.map((f) => f.code)).toContain('native-audit/native-unsupported-decl')
  })

  it('a project with no @pyreon/primitives importers still skips (not a multiplatform project)', async () => {
    const r = await runNativeAuditGate({ cwd: project(`export const x = 1\n`) })
    expect(r.meta.skipped).toBe(true)
    expect(r.meta.skipReason).toContain('not a multiplatform project')
  })
})
