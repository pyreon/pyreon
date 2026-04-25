/**
 * Cross-module signal resolution tests for @pyreon/vite-plugin.
 *
 * These tests exercise the buildStart pre-scan + import-resolution path
 * that the existing test file doesn't reach. Approach:
 *   1. Materialize synthetic Pyreon source files in a tmp dir
 *   2. Drive plugin.config() with that root
 *   3. Drive plugin.buildStart() to populate the signal registry
 *   4. Drive plugin.transform() on a consumer file with imports
 *      whose `resolve()` mock returns the synthetic file path
 *   5. Assert the compiled output recognises the cross-module signal
 *      via the auto-call rewrite (`{count}` → `{() => count()}`)
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => Record<string, unknown>

type BuildStartHook = (this: unknown) => Promise<void>

type TransformCtx = {
  warn: (msg: string) => void
  resolve: (
    id: string,
    importer?: string,
    options?: { skipSelf: boolean },
  ) => Promise<{ id: string } | null>
}
type TransformHook = (
  this: TransformCtx,
  code: string,
  id: string,
) => Promise<{ code: string; map: null } | undefined>

// One tmp dir per file, populated by individual tests
let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-cross-module-'))
})
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})
beforeEach(() => {
  // Re-create the root each test so the registry sees fresh fixtures
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
})

function writeFile(rel: string, contents: string): string {
  const full = join(root, rel)
  const dir = full.slice(0, full.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(full, contents)
  return full
}

function bootstrap(opts?: PyreonPluginOptions) {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as ConfigHook)({ root }, { command: 'build' })
  return plugin
}

async function runBuildStart(plugin: ReturnType<typeof pyreonPlugin>) {
  const buildStart = plugin.buildStart as BuildStartHook
  await buildStart.call({})
}

async function runTransform(
  plugin: ReturnType<typeof pyreonPlugin>,
  code: string,
  id: string,
  resolveMap: Record<string, string> = {},
) {
  const hook = plugin.transform as TransformHook
  const warnings: string[] = []
  return hook.call(
    {
      warn: (msg: string) => warnings.push(msg),
      resolve: async (specifier: string) => {
        const resolved = resolveMap[specifier]
        return resolved ? { id: resolved } : null
      },
    },
    code,
    id,
  )
}

describe('vite-plugin — buildStart signal pre-scan', () => {
  it('walks the project root and registers `export const x = signal()` patterns', async () => {
    writeFile(
      'src/store.ts',
      `import { signal } from "@pyreon/core"
export const count = signal(0)
export const theme = signal("light")`,
    )
    writeFile(
      'src/App.tsx',
      `import { h } from "@pyreon/core"
import { count } from "./store"
export function App() { return <div>{count}</div> }`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    // Drive transform on App.tsx; mock the resolver to return the
    // store.ts absolute path. The plugin should recognise `count` as
    // a known signal and emit auto-call wiring.
    const result = await runTransform(
      plugin,
      `import { h } from "@pyreon/core"
import { count } from "./store"
export function App() { return <div>{count}</div> }`,
      join(root, 'src/App.tsx'),
      { './store': join(root, 'src/store.ts') },
    )
    expect(result).toBeDefined()
    // Auto-call rewrite — `count` reference becomes `count()` because
    // it's tracked as a signal export from ./store
    expect(result!.code).toMatch(/count\(\)/)
  })

  it('registers `const x = signal(); export { x }` separate-export pattern', async () => {
    writeFile(
      'src/state.ts',
      `import { signal } from "@pyreon/core"
const internal = signal(42)
const renamed = signal(0)
export { internal, renamed as exported }`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    // Consumer: imports the renamed (via 'as') name
    const result = await runTransform(
      plugin,
      `import { h } from "@pyreon/core"
import { exported } from "./state"
export const Comp = () => <div>{exported}</div>`,
      join(root, 'src/use.tsx'),
      { './state': join(root, 'src/state.ts') },
    )
    expect(result).toBeDefined()
    // The 'exported' name should be recognised — it's the as-aliased
    // export of a signal-bound local. Auto-call rewrite turns the
    // bare reference into a tracked call.
    expect(result!.code).toMatch(/exported\(\)/)
  })

  it('registers `export default signal()` as the magic default key', async () => {
    writeFile(
      'src/single.ts',
      `import { signal } from "@pyreon/core"
export default signal(0)`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    // Default-import the signal
    const result = await runTransform(
      plugin,
      `import { h } from "@pyreon/core"
import counter from "./single"
export const Comp = () => <div>{counter}</div>`,
      join(root, 'src/use.tsx'),
      { './single': join(root, 'src/single.ts') },
    )
    expect(result).toBeDefined()
    // Default-import path resolves through the magic 'default' registry key.
    expect(result!.code).toMatch(/counter\(\)/)
  })

  it('skips node_modules / dist / lib / build / dot directories during walk', async () => {
    // Files under excluded dirs should NOT register
    writeFile(
      'node_modules/foo/index.ts',
      `import { signal } from "@pyreon/core"
export const ignored = signal(0)`,
    )
    writeFile(
      'dist/bundle.js',
      `import { signal } from "@pyreon/core"
export const alsoIgnored = signal(0)`,
    )
    writeFile(
      '.git/config.ts',
      `import { signal } from "@pyreon/core"
export const dotIgnored = signal(0)`,
    )
    // A real source file — should register
    writeFile(
      'src/visible.ts',
      `import { signal } from "@pyreon/core"
export const visible = signal(0)`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    // Compile a consumer that imports `ignored` from a real file.
    // If the walker had visited node_modules, `ignored` would be
    // recognised. We assert it's NOT — so the import is treated as a
    // plain identifier, no auto-call.
    const result = await runTransform(
      plugin,
      `import { ignored } from "./from-mods"
export const X = () => ignored`,
      join(root, 'src/use.tsx'),
      { './from-mods': join(root, 'node_modules/foo/index.ts') },
    )
    expect(result).toBeDefined()
    // ignored should NOT have been registered, so no auto-call
    expect(result!.code).not.toMatch(/ignored\(\)/)
  })

  it('handles multiple signal exports per file', async () => {
    writeFile(
      'src/many.ts',
      `import { signal, computed } from "@pyreon/core"
export const a = signal(1)
export const b = signal(2)
export const c = computed(() => a() + b())`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    // All three should be tracked
    for (const name of ['a', 'b', 'c']) {
      const result = await runTransform(
        plugin,
        `import { ${name} } from "./many"
export const Use = () => <div>{${name}}</div>`,
        join(root, 'src/use.tsx'),
        { './many': join(root, 'src/many.ts') },
      )
      expect(result).toBeDefined()
      // Each signal name should be auto-called when used as a bare
      // identifier in an h() child position.
      expect(result!.code).toMatch(new RegExp(`${name}\\(\\)`))
    }
  })

  it('does not register non-signal const exports', async () => {
    writeFile(
      'src/plain.ts',
      `export const PI = 3.14
export const formatDate = (d) => d.toISOString()`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    const result = await runTransform(
      plugin,
      `import { PI } from "./plain"
export const Use = () => PI`,
      join(root, 'src/use.tsx'),
      { './plain': join(root, 'src/plain.ts') },
    )
    expect(result).toBeDefined()
    // Plain const — not a signal, no auto-call
    expect(result!.code).not.toMatch(/PI\(\)/)
  })

  it('skips re-exports (export { x } from "./other")', async () => {
    // The signal scanner explicitly skips re-export forms.
    writeFile(
      'src/source.ts',
      `import { signal } from "@pyreon/core"
export const real = signal(0)`,
    )
    writeFile(
      'src/barrel.ts',
      `export { real } from "./source"`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    // Importing through the barrel — barrel.ts has no LOCAL `signal()`
    // declaration, so the re-export is NOT registered as a signal in
    // barrel.ts's own entry. (Direct ./source import would still work.)
    const result = await runTransform(
      plugin,
      `import { real } from "./barrel"
export const Use = () => real`,
      join(root, 'src/use.tsx'),
      { './barrel': join(root, 'src/barrel.ts') },
    )
    expect(result).toBeDefined()
    // Documented limitation in scanSignalExports header — not auto-called
    expect(result!.code).not.toMatch(/real\(\)/)
  })
})

describe('vite-plugin — resolveImportedSignals', () => {
  it('resolves named imports through the cache (second call is a hit)', async () => {
    writeFile(
      'src/store.ts',
      `import { signal } from "@pyreon/core"
export const cached = signal(0)`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    let resolveCalls = 0
    const hook = plugin.transform as TransformHook
    const ctx: TransformCtx = {
      warn: () => {},
      resolve: async (specifier: string) => {
        resolveCalls++
        if (specifier === './store') return { id: join(root, 'src/store.ts') }
        return null
      },
    }

    // Two transforms with the same import — the per-plugin
    // resolveCache should make the second resolve a no-op.
    const code = `import { cached } from "./store"
export const Use = () => cached`
    await hook.call(ctx, code, join(root, 'src/use1.tsx'))
    const callsAfterFirst = resolveCalls
    await hook.call(ctx, code, join(root, 'src/use1.tsx'))
    // Second invocation reuses the cache for the same (moduleId, source) pair
    expect(resolveCalls).toBe(callsAfterFirst)
  })

  it('skips type-only imports', async () => {
    writeFile(
      'src/types.ts',
      `import { signal } from "@pyreon/core"
export const myType = signal(0)`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    // `import type { X }` should NOT be processed by resolveImportedSignals
    const result = await runTransform(
      plugin,
      `import type { myType } from "./types"
export const Use = () => null`,
      join(root, 'src/use.tsx'),
      { './types': join(root, 'src/types.ts') },
    )
    expect(result).toBeDefined()
    // The type import is irrelevant at runtime; nothing should auto-call
    expect(result!.code).not.toMatch(/myType\(\)/)
  })

  it('handles imports from a module that has no signal exports', async () => {
    writeFile(
      'src/utils.ts',
      `export const formatDate = (d) => String(d)
export const ID = "x"`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    const result = await runTransform(
      plugin,
      `import { formatDate } from "./utils"
export const x = formatDate`,
      join(root, 'src/use.tsx'),
      { './utils': join(root, 'src/utils.ts') },
    )
    expect(result).toBeDefined()
    // No registry hit — formatDate is plain
    expect(result!.code).not.toMatch(/formatDate\(\)/)
  })

  it('skips when resolve() returns null (unresolvable import)', async () => {
    const plugin = bootstrap()
    await runBuildStart(plugin)

    // resolve mock returns null for everything — no registry lookup possible
    const result = await runTransform(
      plugin,
      `import { mystery } from "./nowhere"
export const Use = () => mystery`,
      join(root, 'src/use.tsx'),
      {},
    )
    expect(result).toBeDefined()
    expect(result!.code).not.toMatch(/mystery\(\)/)
  })

  it('handles default imports against the magic "default" registry key', async () => {
    writeFile(
      'src/default.ts',
      `import { signal } from "@pyreon/core"
export default signal(0)`,
    )

    const plugin = bootstrap()
    await runBuildStart(plugin)

    const result = await runTransform(
      plugin,
      `import { h } from "@pyreon/core"
import myCount from "./default"
export const Use = () => <div>{myCount}</div>`,
      join(root, 'src/use.tsx'),
      { './default': join(root, 'src/default.ts') },
    )
    expect(result).toBeDefined()
    // The local name `myCount` should be auto-called even though the
    // export is `default` — that's the cross-module default-import path
    expect(result!.code).toMatch(/myCount\(\)/)
  })
})
