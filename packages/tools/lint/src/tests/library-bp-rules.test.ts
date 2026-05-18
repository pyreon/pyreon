/**
 * Tests for the 3 opt-in, dependency-gated library best-practice rules:
 *   - pyreon/query-options-as-function          (dep-gated @pyreon/query)
 *   - pyreon/rx-prefer-pipe                      (dep-gated @pyreon/rx)
 *   - pyreon/no-signal-in-form-initial-values    (dep-gated @pyreon/form)
 *
 * Structure mirrors `frontend-rules.test.ts`: each rule gets paired
 * FIRES / DOES-NOT-FIRE specs plus a "does NOT fire when the dep is
 * absent from package.json" spec to prove the auto-detection gate.
 *
 * The rules are `optIn: true` and NOT yet wired into `rules/index.ts`
 * (central integration). We therefore pass the rule objects explicitly
 * as the `rules[]` arg AND layer explicit enabling severity entries on
 * top so the suite is robust regardless of central registration.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noSignalInFormInitialValues } from '../rules/form/no-signal-in-form-initial-values'
import { queryOptionsAsFunction } from '../rules/query/query-options-as-function'
import { rxPreferPipe } from '../rules/rx/rx-prefer-pipe'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const BP_RULES = [queryOptionsAsFunction, rxPreferPipe, noSignalInFormInitialValues]

const CONFIG: LintConfig = {
  rules: {
    'pyreon/query-options-as-function': 'error',
    'pyreon/rx-prefer-pipe': 'info',
    'pyreon/no-signal-in-form-initial-values': 'warn',
  },
}

function lint(source: string, filePath: string) {
  return lintFile(filePath, source, BP_RULES, CONFIG)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

/** Make a tmp project dir with a package.json declaring `deps`. */
function mkProject(prefix: string, deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: `${prefix}app`, dependencies: deps }),
  )
  return dir
}

// ─── 1) pyreon/query-options-as-function ───────────────────────────────────

describe('pyreon/query-options-as-function (query, dep-gated)', () => {
  let queryDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    queryDir = mkProject('pyreon-q-', { '@pyreon/query': '^0.1.0' })
    plainDir = mkProject('pyreon-qp-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(queryDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  it('FIRES on useQuery({ ... }) object literal', () => {
    const result = lint(
      `import { useQuery } from '@pyreon/query'
       function C() { const q = useQuery({ queryKey: ['x'], queryFn: f }); return q }`,
      join(queryDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).toContain('pyreon/query-options-as-function')
  })

  it('FIRES on useInfiniteQuery({ ... }) and useSuspenseQuery({ ... })', () => {
    const result = lint(
      `import { useInfiniteQuery, useSuspenseQuery } from '@pyreon/query'
       function C() {
         useInfiniteQuery({ queryKey: ['a'] })
         useSuspenseQuery({ queryKey: ['b'] })
       }`,
      join(queryDir, 'src', 'B.tsx'),
    )
    const hits = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/query-options-as-function',
    )
    expect(hits.length).toBe(2)
  })

  it('does NOT fire on the correct function form useQuery(() => ({ ... }))', () => {
    const result = lint(
      `import { useQuery } from '@pyreon/query'
       function C() { return useQuery(() => ({ queryKey: ['x'], queryFn: f })) }`,
      join(queryDir, 'src', 'C.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/query-options-as-function')
  })

  it('does NOT fire on useMutation({ ... }) — mutation options ARE an object', () => {
    const result = lint(
      `import { useMutation } from '@pyreon/query'
       function C() { return useMutation({ mutationFn: f }) }`,
      join(queryDir, 'src', 'M.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/query-options-as-function')
  })

  it('does NOT fire on identifier first-arg (out of scope, can not prove)', () => {
    const result = lint(
      `import { useQuery } from '@pyreon/query'
       function C() { return useQuery(buildOpts) }`,
      join(queryDir, 'src', 'I.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/query-options-as-function')
  })

  it('does NOT fire when @pyreon/query is NOT a project dep (auto-detect off)', () => {
    const result = lint(
      `import { useQuery } from '@pyreon/query'
       function C() { return useQuery({ queryKey: ['x'] }) }`,
      join(plainDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).not.toContain('pyreon/query-options-as-function')
  })
})

// ─── 2) pyreon/rx-prefer-pipe ──────────────────────────────────────────────

describe('pyreon/rx-prefer-pipe (rx, dep-gated)', () => {
  let rxDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    rxDir = mkProject('pyreon-rx-', { '@pyreon/rx': '^0.1.0' })
    plainDir = mkProject('pyreon-rxp-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(rxDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  it('FIRES on map(filter(src, f), g) nested transforms', () => {
    const result = lint(
      `import { map, filter } from '@pyreon/rx'
       const out = map(filter(src, (u) => u.active), (u) => u.name)`,
      join(rxDir, 'src', 'A.ts'),
    )
    expect(diagIds(result)).toContain('pyreon/rx-prefer-pipe')
  })

  it('FIRES on sortBy(map(...), ...) nested transforms', () => {
    const result = lint(
      `import { sortBy, map } from '@pyreon/rx'
       const out = sortBy(map(src, (x) => x.v), 'v')`,
      join(rxDir, 'src', 'B.ts'),
    )
    expect(diagIds(result)).toContain('pyreon/rx-prefer-pipe')
  })

  it('does NOT fire on the correct pipe(src, filter(...), map(...)) form', () => {
    const result = lint(
      `import { pipe, filter, map } from '@pyreon/rx'
       const out = pipe(src, (a) => a.filter(Boolean), (a) => a.map(String))`,
      join(rxDir, 'src', 'P.ts'),
    )
    expect(diagIds(result)).not.toContain('pyreon/rx-prefer-pipe')
  })

  it('does NOT fire on a single rx transform (no nesting)', () => {
    const result = lint(
      `import { filter } from '@pyreon/rx'
       const out = filter(src, (u) => u.active)`,
      join(rxDir, 'src', 'S.ts'),
    )
    expect(diagIds(result)).not.toContain('pyreon/rx-prefer-pipe')
  })

  it('does NOT fire when @pyreon/rx is not imported in the file', () => {
    const result = lint(
      `const out = map(filter(src, f), g)`,
      join(rxDir, 'src', 'NoImport.ts'),
    )
    expect(diagIds(result)).not.toContain('pyreon/rx-prefer-pipe')
  })

  it('does NOT fire when @pyreon/rx is NOT a project dep (auto-detect off)', () => {
    const result = lint(
      `import { map, filter } from '@pyreon/rx'
       const out = map(filter(src, f), g)`,
      join(plainDir, 'src', 'A.ts'),
    )
    expect(diagIds(result)).not.toContain('pyreon/rx-prefer-pipe')
  })
})

// ─── 3) pyreon/no-signal-in-form-initial-values ────────────────────────────

describe('pyreon/no-signal-in-form-initial-values (form, dep-gated)', () => {
  let formDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()
    formDir = mkProject('pyreon-f-', { '@pyreon/form': '^0.1.0' })
    plainDir = mkProject('pyreon-fp-', { '@pyreon/core': '^0.1.0' })
  })
  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(formDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  it('FIRES on useForm({ initialValues: { name: someSignal() } })', () => {
    const result = lint(
      `import { useForm } from '@pyreon/form'
       function C() { return useForm({ initialValues: { name: nameSignal() }, onSubmit: s }) }`,
      join(formDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).toContain('pyreon/no-signal-in-form-initial-values')
  })

  it('FIRES once per signal-read field in initialValues', () => {
    const result = lint(
      `import { useForm } from '@pyreon/form'
       function C() { return useForm({ initialValues: { a: aSig(), b: bSig() } }) }`,
      join(formDir, 'src', 'B.tsx'),
    )
    const hits = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/no-signal-in-form-initial-values',
    )
    expect(hits.length).toBe(2)
  })

  it('does NOT fire on plain literal initial values (correct form)', () => {
    const result = lint(
      `import { useForm } from '@pyreon/form'
       function C() { return useForm({ initialValues: { email: '', remember: false } }) }`,
      join(formDir, 'src', 'C.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/no-signal-in-form-initial-values',
    )
  })

  it('does NOT fire on argument-bearing call value (helper, not a signal read)', () => {
    const result = lint(
      `import { useForm } from '@pyreon/form'
       function C() { return useForm({ initialValues: { x: makeDefault(7) } }) }`,
      join(formDir, 'src', 'H.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/no-signal-in-form-initial-values',
    )
  })

  it('does NOT fire on member-call value obj.method() (not bare-identifier signal shape)', () => {
    const result = lint(
      `import { useForm } from '@pyreon/form'
       function C() { return useForm({ initialValues: { x: store.read() } }) }`,
      join(formDir, 'src', 'Mc.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/no-signal-in-form-initial-values',
    )
  })

  it('does NOT fire when @pyreon/form is NOT a project dep (auto-detect off)', () => {
    const result = lint(
      `import { useForm } from '@pyreon/form'
       function C() { return useForm({ initialValues: { name: nameSignal() } }) }`,
      join(plainDir, 'src', 'A.tsx'),
    )
    expect(diagIds(result)).not.toContain(
      'pyreon/no-signal-in-form-initial-values',
    )
  })
})
