import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { lintFile } from '../runner'
import { allRules } from '../rules'
import { _resetProjectDepsCache } from '../utils/project-deps'

// `prefer-isserver` is a RECOMMENDED-level warn rule, gated on the project
// depending on @pyreon/reactivity. So tests lint files inside a tmp project
// whose package.json declares the dep — using the real `recommended` preset +
// `allRules` so these also prove the rule is wired into recommended at `warn`.

const RID = 'pyreon/prefer-isserver'
const cfg = () => getPreset('recommended')

function mkProject(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-isserver-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'isserver-app', dependencies: deps }),
  )
  return dir
}

function lintIn(dir: string, source: string, file = 'A.ts') {
  return lintFile(join(dir, 'src', file), source, allRules, cfg())
}
const ids = (r: ReturnType<typeof lintFile>) => r.diagnostics.map((d) => d.ruleId)

describe('pyreon/prefer-isserver (ssr, recommended, warn)', () => {
  let dir: string
  beforeEach(() => {
    _resetProjectDepsCache()
    dir = mkProject({ '@pyreon/reactivity': '^0.1.0' })
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    _resetProjectDepsCache()
  })

  it('FIRES on `typeof window !== "undefined"` (→ isClient) and is reported at warn', () => {
    const r = lintIn(dir, `const isBrowser = typeof window !== 'undefined'\nexport { isBrowser }`)
    const diag = r.diagnostics.find((d) => d.ruleId === RID)
    expect(diag).toBeTruthy()
    expect(diag?.severity).toBe('warn') // recommended-level, advisory
    expect(diag?.message).toContain('isClient')
  })

  it('FIRES on `typeof document === "undefined"` (→ isServer)', () => {
    const r = lintIn(dir, `function f() { return typeof document === 'undefined' ? 1 : 2 }\nexport { f }`)
    const diag = r.diagnostics.find((d) => d.ruleId === RID)
    expect(diag).toBeTruthy()
    expect(diag?.message).toContain('isServer')
  })

  it('FIRES on the yoda form `"undefined" !== typeof window`', () => {
    const r = lintIn(dir, `const b = 'undefined' !== typeof window\nexport { b }`)
    expect(ids(r)).toContain(RID)
  })

  it('does NOT fire on `typeof window.foo !== "undefined"` (genuine feature detection)', () => {
    const r = lintIn(
      dir,
      `export function g() { return typeof (window as any).requestIdleCallback !== 'undefined' }`,
    )
    expect(ids(r)).not.toContain(RID)
  })

  it('does NOT fire in a project that does NOT depend on @pyreon/reactivity (dep-gate)', () => {
    const plain = mkProject({ lodash: '^4.0.0' })
    try {
      const r = lintFile(
        join(plain, 'src', 'A.ts'),
        `const isBrowser = typeof window !== 'undefined'\nexport { isBrowser }`,
        allRules,
        cfg(),
      )
      expect(ids(r)).not.toContain(RID)
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })

  it('does NOT fire in the module that DEFINES the primitive (self-import is impossible)', () => {
    const r = lintIn(
      dir,
      `export const isServer = typeof document === 'undefined'\nexport const isClient = !isServer`,
      'environment.ts',
    )
    expect(ids(r)).not.toContain(RID)
  })

  it('does NOT fire in test files', () => {
    const r = lintIn(
      dir,
      `const isBrowser = typeof window !== 'undefined'\nexport { isBrowser }`,
      'A.test.ts',
    )
    expect(ids(r)).not.toContain(RID)
  })
})
