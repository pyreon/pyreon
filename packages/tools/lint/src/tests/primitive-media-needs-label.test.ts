/**
 * Tests for the opt-in, dependency-gated `@pyreon/primitives` rule:
 *   - pyreon/primitive-media-needs-label   (dep-gated @pyreon/primitives)
 *
 * Structure mirrors `no-storage-write-as-call.test.ts`: paired FIRES /
 * DOES-NOT-FIRE specs, a "does NOT fire when the dep is absent from
 * package.json" spec to prove the auto-detection gate, an opt-in-default
 * spec, and an exemptPaths spec.
 *
 * The rule is `optIn: true`. We pass the rule object explicitly as the
 * `rules[]` arg AND layer an explicit enabling severity entry so the
 * suite is robust regardless of central preset wiring.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { primitiveMediaNeedsLabel } from '../rules/frontend/primitive-media-needs-label'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const RULES = [primitiveMediaNeedsLabel]
const RULE_ID = 'pyreon/primitive-media-needs-label'

const CONFIG: LintConfig = { rules: { [RULE_ID]: 'error' } }
const EXEMPT_CONFIG: LintConfig = {
  rules: { [RULE_ID]: ['error', { exemptPaths: ['generated/'] }] },
}

function lint(source: string, filePath: string, config: LintConfig = CONFIG) {
  return lintFile(filePath, source, RULES, config)
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

describe('pyreon/primitive-media-needs-label (frontend, dep-gated)', () => {
  let primDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    primDir = mkProject('pyreon-pm-', { '@pyreon/primitives': '^0.1.0' })
    plainDir = mkProject('pyreon-pmp-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(primDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  // ---- FIRES ----
  it('FIRES on <Image> with no accessible name', () => {
    const r = lint(`export default () => <Image src="hero.png" />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).toContain(RULE_ID)
  })

  it('FIRES on <Icon> with no accessible name', () => {
    const r = lint(`export default () => <Icon name="star" />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).toContain(RULE_ID)
  })

  // ---- DOES NOT FIRE: each satisfying attribute ----
  it('does NOT fire when accessibilityLabel is present (canonical multiplatform prop)', () => {
    const r = lint(`export default () => <Image src="h.png" accessibilityLabel="Hero" />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  it('does NOT fire when alt is present (web-optimized Image overlap, no false positive)', () => {
    const r = lint(`export default () => <Image src="h.png" alt="Hero" />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  it('does NOT fire when aria-label is present', () => {
    const r = lint(`export default () => <Icon name="x" aria-label="Close" />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  it('does NOT fire when aria-labelledby is present', () => {
    const r = lint(`export default () => <Image src="h.png" aria-labelledby="cap" />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  it('does NOT fire when accessibilityHidden marks it decorative', () => {
    const r = lint(`export default () => <Icon name="dot" accessibilityHidden />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  it('does NOT fire when aria-hidden marks it decorative', () => {
    const r = lint(`export default () => <Image src="dot.png" aria-hidden />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  it('accepts an explicit empty accessibilityLabel="" (presence-only, like require-img-alt)', () => {
    const r = lint(`export default () => <Image src="h.png" accessibilityLabel="" />`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  // ---- DOES NOT FIRE: non-media primitives (text-named) ----
  it('does NOT fire on <Button> (name comes from text children)', () => {
    const r = lint(`export default () => <Button>Save</Button>`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  it('does NOT fire on <Press> (name comes from text children)', () => {
    const r = lint(`export default () => <Press>Tap</Press>`, join(primDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  // ---- DEP GATE ----
  it('does NOT fire when @pyreon/primitives is NOT a project dependency', () => {
    const r = lint(`export default () => <Image src="hero.png" />`, join(plainDir, 'src/App.tsx'))
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  // ---- OPT-IN DEFAULT ----
  it('is OFF by default (opt-in) — not flagged without an enabling config', () => {
    const r = lintFile(join(primDir, 'src/App.tsx'), `export default () => <Image src="hero.png" />`, RULES, {
      rules: {},
    })
    expect(diagIds(r)).not.toContain(RULE_ID)
  })

  // ---- exemptPaths ----
  it('respects exemptPaths', () => {
    const r = lint(
      `export default () => <Image src="hero.png" />`,
      join(primDir, 'generated/App.tsx'),
      EXEMPT_CONFIG,
    )
    expect(diagIds(r)).not.toContain(RULE_ID)
  })
})
