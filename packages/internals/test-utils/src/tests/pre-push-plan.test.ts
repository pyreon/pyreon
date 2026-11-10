import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  classifyRootPath,
  computePassKeys,
  computePlan,
  entryKey,
  parseCache,
  PASS_CACHE_MAX_AGE_MS,
  PASS_CACHE_MAX_ENTRIES,
  PASS_CACHE_VERSION,
  PATH_RULES,
  recordPasses,
  stripComments,
  type WorkspaceInfo,
} from '../../../../../scripts/pre-push-plan'

/**
 * `scripts/pre-push-plan.ts` decides what the pre-push hook runs. The contract
 * these tests pin: every changed path maps to the checks it can affect
 * (`PATH_RULES`); tests are never widened to the reverse-dependency closure
 * (CI runs it), only typecheck is; a scripts/** file runs only the tests that
 * read it; native-toolchain packages run only when they themselves changed;
 * and the pass cache skips a package only while every one of its inputs is
 * byte-identical.
 */

const ROOT = '/fake/root'
const ws = (
  name: string,
  dir: string,
  deps: string[] = [],
  scripts: Record<string, string> = { test: 'vitest run', typecheck: 'tsc --noEmit' },
): WorkspaceInfo => ({ name, dir: `${ROOT}/${dir}`, deps, scripts })

const WS: WorkspaceInfo[] = [
  ws('@pyreon/reactivity', 'packages/core/reactivity'),
  ws('@pyreon/core', 'packages/core/core', ['@pyreon/reactivity']),
  ws('@pyreon/styler', 'packages/ui-system/styler', ['@pyreon/core']),
  ws('@pyreon/native-compiler', 'packages/native/compiler', ['@pyreon/core']),
  ws('@pyreon/native-runtime-kotlin', 'packages/native/runtime-kotlin', [], {
    test: 'bun scripts/verify-all.ts',
    typecheck: 'bun scripts/verify-all.ts --mode=typecheck',
  }),
  ws('@pyreon/test-utils', 'packages/internals/test-utils'),
  ws('@pyreon/no-tests', 'packages/tools/no-tests', [], { typecheck: 'tsc --noEmit' }),
]

describe('computePlan', () => {
  const TEST_UTILS_TESTS = new Map([
    ['packages/internals/test-utils/src/tests/affected.test.ts', "import { x } from '../../../../../scripts/affected'"],
    [
      'packages/internals/test-utils/src/tests/budgets.test.ts',
      "const BUDGETS = JSON.parse(readFileSync(join(ROOT, 'scripts', 'bundle-budgets.json'), 'utf8'))",
    ],
    ['packages/internals/test-utils/src/tests/ci-yml.test.ts', "const ci = read('.github/workflows/ci.yml')"],
    ['packages/internals/test-utils/src/tests/unrelated.test.ts', "import { y } from '../../../../../scripts/other'"],
  ])
  const SCRIPTS = new Map([
    ['scripts/affected.ts', "import { gitChangedFilesZ } from './changed-files'\n// see bundle-budgets.json for budgets"],
    ['scripts/changed-files.ts', 'export function gitChangedFilesZ() {}'],
    ['scripts/other.ts', 'export const y = 1'],
    ['scripts/lonely.ts', 'export const z = 1'],
  ])
  const plan = (changed: string[] | null) =>
    computePlan({ changed, workspaces: WS, root: ROOT, testFiles: TEST_UTILS_TESTS, scriptFiles: SCRIPTS })

  it('a package change checks that package only — the closure is CI\'s', () => {
    const p = plan(['packages/core/reactivity/src/signal.ts'])
    expect(p.rules).toEqual([{ path: 'packages/core/reactivity/src/signal.ts', rule: 'package' }])
    expect(p.groups.typecheck).toEqual(['@pyreon/reactivity'])
    expect(p.groups.test).toEqual(['@pyreon/reactivity'])
    expect(p.groups['native-vitest']).toEqual([])
    expect(p.closureSize).toBe(4)
  })

  it('splits a changed native package into its own toolchain group', () => {
    const p = plan(['packages/native/compiler/src/emit.ts', 'packages/native/runtime-kotlin/src/Runtime.kt'])
    expect(p.groups.test).toEqual([])
    expect(p.groups['native-vitest']).toEqual(['@pyreon/native-compiler'])
    expect(p.groups['native-script']).toEqual(['@pyreon/native-runtime-kotlin'])
  })

  it('the budgets file runs only the tests that read it — no typecheck, no workspace wall', () => {
    const p = plan(['scripts/bundle-budgets.json'])
    expect(p.rules).toEqual([{ path: 'scripts/bundle-budgets.json', rule: 'script' }])
    expect(p.groups.test).toEqual(['@pyreon/test-utils'])
    expect(p.targetedTests).toEqual(['packages/internals/test-utils/src/tests/budgets.test.ts'])
    expect(p.groups.typecheck).toEqual([])
  })

  it('a script reaches the tests of every script that imports it, transitively; a comment is not a read', () => {
    const p = plan(['scripts/changed-files.ts'])
    expect(p.targetedTests).toEqual(['packages/internals/test-utils/src/tests/affected.test.ts'])
    // Script code is typechecked through @pyreon/test-utils, which imports it.
    expect(p.groups.typecheck).toEqual(['@pyreon/test-utils'])
  })

  it('a script no test reads runs no tests', () => {
    const p = plan(['scripts/lonely.ts'])
    expect(p.targetedTests).toBeNull()
    expect(p.groups.test).toEqual([])
  })

  it('a root tsconfig runs no workspace wall (validate-fast checks the presets; CI typechecks)', () => {
    const p = plan(['tsconfig.base.json'])
    expect(p.rules[0]!.rule).toBe('root-tsconfig')
    expect(Object.values(p.groups).flat()).toEqual([])
  })

  it('the lockfile adds only the frozen-lockfile dry run to the changed packages', () => {
    const p = plan(['bun.lock', 'packages/ui-system/styler/src/index.ts'])
    expect(p.installCheck).toBe(true)
    expect(p.groups.test).toEqual(['@pyreon/styler'])
    expect(p.groups.typecheck).toEqual(['@pyreon/styler'])
  })

  it('a workflow runs the tests that read it — no local-only linter', () => {
    const p = plan(['.github/workflows/ci.yml'])
    expect(p).not.toHaveProperty('actionlint')
    expect(p.targetedTests).toEqual(['packages/internals/test-utils/src/tests/ci-yml.test.ts'])
    expect(p.groups.typecheck).toEqual([])
  })

  it('a root vitest setup file runs the whole test-utils suite as a setup smoke test', () => {
    const p = plan(['vitest.setup.ts'])
    expect(p.groups.test).toEqual(['@pyreon/test-utils'])
    expect(p.targetedTests).toBeNull()
  })

  it('an unknown root file falls back to the whole test-utils suite, never the workspace', () => {
    const p = plan(['.oxlintrc.json'])
    expect(p.rules[0]!.rule).toBe('unknown-root')
    expect(p.groups.test).toEqual(['@pyreon/test-utils'])
    expect(p.groups.typecheck).toEqual(['@pyreon/test-utils'])
    expect(p.targetedTests).toBeNull()
  })

  it('an unknowable diff behaves like an unknown root file', () => {
    const p = plan(null)
    expect(p.unknownDiff).toBe(true)
    expect(p.groups.test).toEqual(['@pyreon/test-utils'])
    expect(p.groups.typecheck).toEqual(['@pyreon/test-utils'])
  })

  it('prose outside a workspace adds nothing beyond validate-fast', () => {
    const p = plan(['AGENTS.md', '.agents/rules/workflow.md', '.changeset/x.md'])
    expect(Object.values(p.groups).flat()).toEqual([])
    expect(p.rules.map((r) => r.rule)).toEqual(['prose', 'prose', 'prose'])
  })

  it('an empty diff runs nothing', () => {
    const p = plan([])
    expect(Object.values(p.groups).flat()).toEqual([])
  })

  it('every documented rule is reachable from a real path', () => {
    const examples: Record<string, string> = {
      'root-tsconfig': 'tsconfig.json',
      install: 'bun.lock',
      'root-vitest': 'vitest.setup.ts',
      workflow: '.github/workflows/release.yml',
      'shared-action': '.github/actions/setup/action.yml',
      script: 'scripts/bundle-budgets.json',
      'repo-file': 'e2e/app.spec.ts',
      prose: 'README.md',
      'unknown-root': 'bunfig.toml',
    }
    for (const rule of PATH_RULES.map((r) => r.id).filter((id) => id !== 'package')) {
      expect(classifyRootPath(examples[rule]!)).toBe(rule)
    }
  })
})

describe('stripComments', () => {
  it('drops line and block comments but keeps URLs in strings', () => {
    expect(stripComments("a() // x.json\n/* y.json */ b('https://e.com/z.json')")).toBe("a() \n b('https://e.com/z.json')")
  })
})

describe('computePassKeys', () => {
  let root: string
  const write = (rel: string, body: string) => {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  const realWs = (): WorkspaceInfo[] =>
    WS.map((w) => ({ ...w, dir: w.dir.replace(ROOT, root) }))
  const FILES = [
    'bun.lock',
    'tsconfig.json',
    'packages/core/reactivity/src/signal.ts',
    'packages/core/core/src/h.ts',
    'packages/core/core/src/tests/h.test.ts',
    'packages/ui-system/styler/src/index.ts',
    'packages/internals/test-utils/src/tests/x.test.ts',
    'scripts/affected.ts',
    'README.md',
  ]
  const keys = (files = FILES) =>
    computePassKeys({
      root,
      files,
      workspaces: realWs(),
      packages: ['@pyreon/reactivity', '@pyreon/core', '@pyreon/styler', '@pyreon/test-utils'],
      runtime: 'test-runtime',
    })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-pass-keys-'))
    for (const f of FILES) write(f, `// ${f}\n`)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('is stable for identical bytes', () => {
    expect(keys()).toEqual(keys())
  })

  it("re-keys the package and its dependents when a dependency's source changes", () => {
    const before = keys()
    write('packages/core/reactivity/src/signal.ts', '// changed\n')
    const after = keys()
    expect(after.get('@pyreon/reactivity')).not.toBe(before.get('@pyreon/reactivity'))
    expect(after.get('@pyreon/core')).not.toBe(before.get('@pyreon/core'))
    expect(after.get('@pyreon/styler')).not.toBe(before.get('@pyreon/styler'))
    expect(after.get('@pyreon/test-utils')).toBe(before.get('@pyreon/test-utils'))
  })

  it("re-keys only the package itself when one of its own tests changes", () => {
    const before = keys()
    write('packages/core/core/src/tests/h.test.ts', '// now failing\n')
    const after = keys()
    expect(after.get('@pyreon/core')).not.toBe(before.get('@pyreon/core'))
    expect(after.get('@pyreon/reactivity')).toBe(before.get('@pyreon/reactivity'))
  })

  it('re-keys everything on a lockfile change, nothing on an unrelated doc change', () => {
    const before = keys()
    write('README.md', '# changed\n')
    expect(keys()).toEqual(before)
    write('bun.lock', '{ "changed": true }\n')
    const after = keys()
    for (const [name, key] of before) expect(after.get(name)).not.toBe(key)
  })

  it('re-keys @pyreon/test-utils when a script it tests changes', () => {
    const before = keys()
    write('scripts/affected.ts', '// changed\n')
    const after = keys()
    expect(after.get('@pyreon/test-utils')).not.toBe(before.get('@pyreon/test-utils'))
    expect(after.get('@pyreon/core')).toBe(before.get('@pyreon/core'))
  })

  it('re-keys when a new file appears in the package', () => {
    const before = keys()
    write('packages/core/core/src/new.ts', 'export {}\n')
    const after = keys([...FILES, 'packages/core/core/src/new.ts'])
    expect(after.get('@pyreon/core')).not.toBe(before.get('@pyreon/core'))
  })
})

describe('pass cache store', () => {
  it('keeps typecheck and test passes apart', () => {
    expect(entryKey('typecheck', '@pyreon/x', 'k')).not.toBe(entryKey('test', '@pyreon/x', 'k'))
    expect(entryKey('native-vitest', '@pyreon/x', 'k')).toBe(entryKey('test', '@pyreon/x', 'k'))
  })

  it('treats a missing, corrupt or old-version store as empty', () => {
    expect(parseCache(null).entries).toEqual({})
    expect(parseCache('{not json').entries).toEqual({})
    expect(parseCache(JSON.stringify({ version: PASS_CACHE_VERSION + 1, entries: { a: 1 } })).entries).toEqual({})
    expect(parseCache(JSON.stringify({ version: PASS_CACHE_VERSION, entries: { a: 1, b: 'x' } })).entries).toEqual({ a: 1 })
  })

  it('records passes and evicts by age, then by count (newest kept)', () => {
    const now = 10 * PASS_CACHE_MAX_AGE_MS
    const old = { version: PASS_CACHE_VERSION, entries: { stale: now - PASS_CACHE_MAX_AGE_MS - 1, fresh: now - 1 } }
    const next = recordPasses(old, ['new'], now)
    expect(Object.keys(next.entries).sort()).toEqual(['fresh', 'new'])

    const many = Array.from({ length: PASS_CACHE_MAX_ENTRIES + 10 }, (_, i) => `k${i}`)
    const seeded = { version: PASS_CACHE_VERSION, entries: Object.fromEntries(many.map((k, i) => [k, now - many.length + i])) }
    const full = recordPasses(seeded, [], now)
    expect(Object.keys(full.entries)).toHaveLength(PASS_CACHE_MAX_ENTRIES)
    expect(full.entries.k0).toBeUndefined()
    expect(full.entries[`k${many.length - 1}`]).toBeDefined()
  })
})
