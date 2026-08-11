/**
 * Tests for the dependency-gated `@pyreon/rocketstyle` rule:
 *   - pyreon/no-signal-read-in-attrs-callback   (dep-gated @pyreon/rocketstyle)
 *
 * Structure mirrors `no-storage-write-as-call.test.ts`: paired FIRES /
 * DOES-NOT-FIRE specs plus a "does NOT fire when the dep is absent from
 * package.json" spec to prove the auto-detection gate.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noSignalReadInAttrsCallback } from '../rules/styling/no-signal-read-in-attrs-callback'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const RULES = [noSignalReadInAttrsCallback]
const RULE_ID = 'pyreon/no-signal-read-in-attrs-callback'

const CONFIG: LintConfig = {
  rules: { [RULE_ID]: 'warn' },
}

const EXEMPT_CONFIG: LintConfig = {
  rules: {
    [RULE_ID]: ['warn', { exemptPaths: ['generated/'] }],
  },
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

describe('pyreon/no-signal-read-in-attrs-callback (styling, dep-gated)', () => {
  let rsDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    rsDir = mkProject('pyreon-rs-', { '@pyreon/rocketstyle': '^0.1.0' })
    plainDir = mkProject('pyreon-rsp-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(rsDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  // ── FIRES ─────────────────────────────────────────────────────────────

  it('FIRES on a zero-arg signal read inside a .attrs() callback', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const open = signal(false)
       const Panel = base.attrs((props) => ({
         'aria-expanded': open() ? 'true' : 'false',
       }))`,
      join(rsDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  it('FIRES on a zero-arg computed read inside a .attrs() callback', () => {
    const result = lint(
      `import { computed, signal } from '@pyreon/reactivity'
       const open = signal(false)
       const label = computed(() => (open() ? 'Close' : 'Open'))
       const Btn = base.attrs(() => ({ 'aria-label': label() }))`,
      join(rsDir, 'src', 'B.tsx'),
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  it('FIRES inside a chained rocketstyle definition (.config().attrs().theme())', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const collapsed = signal(false)
       const Sidebar = rocketstyle()({ name: 'Sidebar', component: El })
         .config({ component: 'nav' })
         .attrs((props, theme) => ({ hidden: collapsed() }))
         .theme((t) => ({ padding: t.spacing.small }))`,
      join(rsDir, 'src', 'C.tsx'),
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  it('FIRES on a function-expression callback (not just arrows)', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const open = signal(false)
       const Panel = base.attrs(function (props) {
         return { 'data-open': open() }
       })`,
      join(rsDir, 'src', 'D.tsx'),
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  // ── DOES NOT FIRE ─────────────────────────────────────────────────────

  it('does NOT fire on props reads / props member calls (the documented legit use)', () => {
    const result = lint(
      `const Alert = base.attrs((props) => ({
         role: props.state === 'error' ? 'alert' : 'status',
         'aria-expanded': props.active() ? 'true' : 'false',
       }))`,
      join(rsDir, 'src', 'P.tsx'),
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on theme reads', () => {
    const result = lint(
      `const Card = base.attrs((props, theme) => ({
         'data-gap': theme.spacing.small,
       }))`,
      join(rsDir, 'src', 'T.tsx'),
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on calls WITH arguments', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const fmt = signal((x) => x)
       const Badge = base.attrs(() => ({ 'data-x': fmt('label') }))`,
      join(rsDir, 'src', 'W.tsx'),
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on identifiers not tracked to a signal binding', () => {
    const result = lint(
      `const helper = () => 'x'
       const Badge = base.attrs(() => ({ 'data-x': helper() }))`,
      join(rsDir, 'src', 'H.tsx'),
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on the .attrs({...}) object form (no callback)', () => {
    const result = lint(
      `const Loader = base.attrs({ role: 'status', 'aria-label': 'Loading' })`,
      join(rsDir, 'src', 'O.tsx'),
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire inside a nested handler defined within the attrs callback', () => {
    // A handler re-runs per invocation and reads a FRESH value — only
    // the once-at-setup immediate scope is dead.
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const open = signal(false)
       const Toggle = base.attrs(() => ({
         onClick: () => open.set(!open()),
       }))`,
      join(rsDir, 'src', 'N.tsx'),
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on a signal read OUTSIDE any attrs callback', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const open = signal(false)
       function C() { return open() }`,
      join(rsDir, 'src', 'X.tsx'),
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on an exempt path', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const open = signal(false)
       const Panel = base.attrs(() => ({ 'data-open': open() }))`,
      join(rsDir, 'generated', 'A.tsx'),
      EXEMPT_CONFIG,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire when @pyreon/rocketstyle is NOT a project dep (auto-detect off)', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const open = signal(false)
       const Panel = base.attrs(() => ({ 'data-open': open() }))`,
      join(plainDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })
})
