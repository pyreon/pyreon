import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  computePassKeys,
  computePlan,
  entryKey,
  parseCache,
  PASS_CACHE_MAX_AGE_MS,
  PASS_CACHE_MAX_ENTRIES,
  PASS_CACHE_VERSION,
  recordPasses,
  type WorkspaceInfo,
} from '../../../../../scripts/pre-push-plan'

/**
 * `scripts/pre-push-plan.ts` decides what the pre-push hook runs. The contract
 * these tests pin: the hook is DIRECT-ONLY (never the reverse-dependency
 * closure, which CI runs), a root-file change widens typecheck but never
 * tests, native-toolchain packages run only when they themselves changed, and
 * the pass cache skips a package only while every one of its inputs is
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
  it('runs a core change DIRECT-ONLY and reports the closure it dropped', () => {
    const plan = computePlan({
      changed: ['packages/core/reactivity/src/signal.ts'],
      workspaces: WS,
      root: ROOT,
    })
    expect(plan.direct).toEqual(['@pyreon/reactivity'])
    expect(plan.groups.typecheck).toEqual(['@pyreon/reactivity'])
    expect(plan.groups.test).toEqual(['@pyreon/reactivity'])
    // The old hook ran the closure, including the native-compiler suite.
    expect(plan.groups['native-vitest']).toEqual([])
    expect(plan.closureSize).toBe(4)
    expect(plan.rootChanged).toBe(false)
  })

  it('splits a changed native package into its own toolchain group', () => {
    const plan = computePlan({
      changed: [
        'packages/native/compiler/src/emit.ts',
        'packages/native/runtime-kotlin/src/Runtime.kt',
      ],
      workspaces: WS,
      root: ROOT,
    })
    expect(plan.groups.test).toEqual([])
    expect(plan.groups['native-vitest']).toEqual(['@pyreon/native-compiler'])
    expect(plan.groups['native-script']).toEqual(['@pyreon/native-runtime-kotlin'])
  })

  it('a root-file change typechecks the workspace but tests nothing extra', () => {
    const plan = computePlan({
      changed: ['bun.lock', 'packages/ui-system/styler/src/index.ts'],
      workspaces: WS,
      root: ROOT,
    })
    expect(plan.rootChanged).toBe(true)
    expect(plan.groups.test).toEqual(['@pyreon/styler'])
    expect(plan.groups.typecheck).toEqual([
      '@pyreon/core',
      '@pyreon/no-tests',
      '@pyreon/reactivity',
      '@pyreon/styler',
      '@pyreon/test-utils',
    ])
    // Native toolchains stay out unless they themselves changed.
    expect(plan.nativeSkipped).toEqual(['@pyreon/native-compiler', '@pyreon/native-runtime-kotlin'])
  })

  it('an unknowable diff behaves like a root change (typecheck everything, no tests)', () => {
    const plan = computePlan({ changed: null, workspaces: WS, root: ROOT })
    expect(plan.unknownDiff).toBe(true)
    expect(plan.rootChanged).toBe(true)
    expect(plan.groups.test).toEqual([])
    expect(plan.groups.typecheck.length).toBe(5)
  })

  it('maps a script change to its leaf test package and skips packages without the script', () => {
    const plan = computePlan({
      changed: ['scripts/affected.ts', 'packages/tools/no-tests/src/x.ts'],
      workspaces: WS,
      root: ROOT,
    })
    expect(plan.groups.test).toEqual(['@pyreon/test-utils'])
    expect(plan.groups.typecheck).toEqual(['@pyreon/no-tests', '@pyreon/test-utils'])
  })

  it('an empty diff runs nothing', () => {
    const plan = computePlan({ changed: [], workspaces: WS, root: ROOT })
    expect(Object.values(plan.groups).flat()).toEqual([])
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
