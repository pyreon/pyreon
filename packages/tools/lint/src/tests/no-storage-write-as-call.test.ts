/**
 * Tests for the opt-in, dependency-gated `@pyreon/storage` rule:
 *   - pyreon/no-storage-write-as-call             (dep-gated @pyreon/storage)
 *
 * Structure mirrors `library-bp-rules.test.ts`: paired FIRES /
 * DOES-NOT-FIRE specs, an autofix spec, plus a "does NOT fire when the
 * dep is absent from package.json" spec to prove the auto-detection
 * gate.
 *
 * The rule is `optIn: true` and NOT yet wired into `rules/index.ts`
 * (central integration handled separately). We therefore pass the rule
 * object explicitly as the `rules[]` arg AND layer an explicit enabling
 * severity entry on top so the suite is robust regardless of central
 * registration.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noStorageWriteAsCall } from '../rules/storage/no-storage-write-as-call'
import { applyFixes, lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const BP_RULES = [noStorageWriteAsCall]

const CONFIG: LintConfig = {
  rules: {
    'pyreon/no-storage-write-as-call': 'error',
  },
}

const EXEMPT_CONFIG: LintConfig = {
  rules: {
    'pyreon/no-storage-write-as-call': [
      'error',
      { exemptPaths: ['generated/'] },
    ],
  },
}

function lint(source: string, filePath: string, config: LintConfig = CONFIG) {
  return lintFile(filePath, source, BP_RULES, config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

/** Make a tmp project dir with a package.json declaring `deps`. */
function mkProject(prefix: string, deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'generated'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: `${prefix}app`, dependencies: deps }),
  )
  return dir
}

describe('pyreon/no-storage-write-as-call (storage, dep-gated)', () => {
  let storageDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    storageDir = mkProject('pyreon-st-', { '@pyreon/storage': '^0.1.0' })
    plainDir = mkProject('pyreon-stp-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(storageDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  it('FIRES on calling a useStorage signal with an argument', () => {
    const result = lint(
      `import { useStorage } from '@pyreon/storage'
       function C() { const pref = useStorage('k', 0); pref(5); return pref }`,
      join(storageDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).toContain('pyreon/no-storage-write-as-call')
  })

  it('FIRES on calling a useCookie signal with an argument', () => {
    const result = lint(
      `import { useCookie } from '@pyreon/storage'
       function C() { const c = useCookie('x', 'y'); c('z'); return c }`,
      join(storageDir, 'src', 'B.tsx'),
    )
    expect(diagIds(result)).toContain('pyreon/no-storage-write-as-call')
  })

  it('does NOT fire on a zero-arg read pref()', () => {
    const result = lint(
      `import { useStorage } from '@pyreon/storage'
       function C() { const pref = useStorage('k', 0); return pref() }`,
      join(storageDir, 'src', 'R.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/no-storage-write-as-call')
  })

  it('does NOT fire on pref.set(5) (correct write surface)', () => {
    const result = lint(
      `import { useStorage } from '@pyreon/storage'
       function C() { const pref = useStorage('k', 0); pref.set(5) }`,
      join(storageDir, 'src', 'S.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/no-storage-write-as-call')
  })

  it('does NOT fire on pref.update(n => n + 1) (correct write surface)', () => {
    const result = lint(
      `import { useStorage } from '@pyreon/storage'
       function C() { const pref = useStorage('k', 0); pref.update(n => n + 1) }`,
      join(storageDir, 'src', 'U.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/no-storage-write-as-call')
  })

  it('does NOT fire on a plain signal binding (not a storage factory)', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       function C() { const x = signal(0); x(5); return x }`,
      join(storageDir, 'src', 'Sig.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/no-storage-write-as-call')
  })

  it('does NOT fire on an exempt path', () => {
    const result = lint(
      `import { useStorage } from '@pyreon/storage'
       function C() { const pref = useStorage('k', 0); pref(5); return pref }`,
      join(storageDir, 'generated', 'A.tsx'),
      EXEMPT_CONFIG,
    )
    expect(diagIds(result)).not.toContain('pyreon/no-storage-write-as-call')
  })

  it('does NOT fire when @pyreon/storage is NOT a project dep (auto-detect off)', () => {
    const result = lint(
      `import { useStorage } from '@pyreon/storage'
       function C() { const pref = useStorage('k', 0); pref(5); return pref }`,
      join(plainDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/no-storage-write-as-call')
  })

  it('autofixes name(arg) → name.set(arg)', () => {
    const source =
      `import { useStorage } from '@pyreon/storage'
       function C() { const pref = useStorage('k', 0); pref(42); return pref }`
    const result = lint(source, join(storageDir, 'src', 'Fix.tsx'))
    expect(diagIds(result)).toContain('pyreon/no-storage-write-as-call')
    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toContain('pref.set(42)')
  })
})
