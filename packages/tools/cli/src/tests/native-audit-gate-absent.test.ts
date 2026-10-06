// The REAL lazy loader's not-installed path. `native-audit-gate.test.ts` injects
// a loader, which proves the gate's reaction to an absent audit but not that
// `loadNativeAudit` itself recognises a missing peer -- break that detection
// and the injected tests stay green while a real consumer without the peer
// crashes. Here the specifier genuinely fails to resolve, and a different
// module-not-found (a transitive dependency) must NOT read as "not installed".

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  loadNativeAudit,
  NATIVE_COMPILER_NOT_INSTALLED,
  runNativeAuditGate,
} from '../doctor/gates/native-audit'

const ABSENT = '@pyreon/native-compiler-absent/audit'

describe('native-audit gate — the real loader with the peer absent', () => {
  it('loadNativeAudit() resolves to undefined, it does not throw', async () => {
    expect(await loadNativeAudit(ABSENT)).toBeUndefined()
  })

  it('the gate SKIPS with the install hint through the REAL loader', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-native-gate-absent-'))
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"app"}')
      const r = await runNativeAuditGate({ cwd: dir, loadAudit: () => loadNativeAudit(ABSENT) })
      expect(r.meta.skipped).toBe(true)
      expect(r.meta.skipReason).toBe(NATIVE_COMPILER_NOT_INSTALLED)
      expect(r.findings).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a module-not-found for a DIFFERENT package is a defect, not "not installed"', async () => {
    // The audit module itself resolves but a dependency INSIDE it does not (an
    // `oxc-parser` that failed to install). That must surface, not read as an
    // absent peer -- the very confusion a code-only check would produce.
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-native-gate-broken-'))
    try {
      const broken = join(dir, 'audit.mjs')
      writeFileSync(broken, "import 'pyreon-test-definitely-missing-dep'\n")
      await expect(loadNativeAudit(pathToFileURL(broken).href)).rejects.toThrow(
        /pyreon-test-definitely-missing-dep/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
