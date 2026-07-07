import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import { _resetProjectDepsCache } from '../utils/project-deps'

// `no-private-env-in-client` is an OPT-IN best-practice rule, gated on the
// project depending on @pyreon/zero — so tests lint files inside a tmp project
// declaring that dep, using the `best-practices` preset (opt-in rules on).

const RID = 'pyreon/no-private-env-in-client'
const cfg = () => getPreset('best-practices')

function mkProject(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-env-client-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'env-app', dependencies: deps }))
  return dir
}

function lintIn(dir: string, source: string, file = 'A.ts') {
  return lintFile(join(dir, 'src', file), source, allRules, cfg())
}
const hits = (r: ReturnType<typeof lintFile>) => r.diagnostics.filter((d) => d.ruleId === RID)

describe('pyreon/no-private-env-in-client (ssr, opt-in, warn)', () => {
  let dir: string
  beforeEach(() => {
    _resetProjectDepsCache()
    dir = mkProject({ '@pyreon/zero': '^0.1.0' })
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    _resetProjectDepsCache()
  })

  it('FIRES on `process.env.API_URL` in client code', () => {
    const r = lintIn(dir, 'export const u = process.env.API_URL')
    expect(hits(r)).toHaveLength(1)
    expect(hits(r)[0]!.message).toContain('ZERO_PUBLIC_API_URL')
    expect(hits(r)[0]!.severity).toBe('warn')
  })

  it('FIRES on `import.meta.env.VITE_API_URL` (steers to the ZERO_PUBLIC_ name)', () => {
    const r = lintIn(dir, 'export const u = import.meta.env.VITE_API_URL')
    expect(hits(r)).toHaveLength(1)
    expect(hits(r)[0]!.message).toContain('ZERO_PUBLIC_API_URL')
  })

  it('FIRES on destructuring `const { X } = process.env`', () => {
    const r = lintIn(dir, 'const { API_URL } = process.env\nexport { API_URL }')
    expect(hits(r)).toHaveLength(1)
    expect(hits(r)[0]!.message).toContain('ZERO_PUBLIC_')
  })

  it('FIRES on capturing `const e = import.meta.env`', () => {
    const r = lintIn(dir, 'export const e = import.meta.env')
    expect(hits(r)).toHaveLength(1)
    expect(hits(r)[0]!.message).toContain('ZERO_PUBLIC_')
  })

  it('does NOT double-report on `const u = process.env.API_URL` (direct access, one hit)', () => {
    // The `.API_URL` member access fires once; the bare-base VariableDeclarator
    // visit must NOT also fire (init is `.API_URL`, not the bare `process.env`).
    const r = lintIn(dir, 'export const u = process.env.API_URL')
    expect(hits(r)).toHaveLength(1)
  })

  it('does NOT fire on `process.env.NODE_ENV` (universal)', () => {
    const r = lintIn(dir, "export const dev = process.env.NODE_ENV !== 'production'")
    expect(hits(r)).toHaveLength(0)
  })

  it('does NOT fire on Vite built-ins `import.meta.env.DEV` / `.MODE`', () => {
    const r = lintIn(dir, 'export const d = import.meta.env.DEV\nexport const m = import.meta.env.MODE')
    expect(hits(r)).toHaveLength(0)
  })

  it('does NOT fire in a server-only file (*.server.ts, api/, server/, entry-server)', () => {
    expect(hits(lintIn(dir, 'export const k = process.env.SECRET', 'db.server.ts'))).toHaveLength(0)
    expect(hits(lintIn(dir, 'export const k = process.env.SECRET', join('api', 'x.ts')))).toHaveLength(0)
    expect(hits(lintIn(dir, 'export const k = process.env.SECRET', join('server', 'db.ts')))).toHaveLength(0)
    expect(hits(lintIn(dir, 'export const k = process.env.SECRET', 'entry-server.ts'))).toHaveLength(0)
  })

  it('does NOT fire when the project does not depend on @pyreon/zero', () => {
    _resetProjectDepsCache()
    const other = mkProject({ react: '^18.0.0' })
    try {
      const r = lintFile(join(other, 'src', 'A.ts'), 'export const u = process.env.API_URL', allRules, cfg())
      expect(hits(r)).toHaveLength(0)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })
})
