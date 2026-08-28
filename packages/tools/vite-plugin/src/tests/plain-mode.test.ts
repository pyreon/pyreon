/**
 * Plain Mode × vite-plugin integration.
 *
 * Three contracts, each of which failing would be SILENT for users:
 *
 *  1. a `.ts` module carrying plain markers goes through the transform (the
 *     store-module shape has no JSX extension, so without the gate the
 *     `state()` marker reaches the runtime and throws);
 *  2. a plain module's `export let x = state(0)` lands in the signal-export
 *     registry, so a CLASSIC importer auto-calls `{x}` cross-module;
 *  3. a PLAIN importer of a classic `export const x = signal(0)` reads it
 *     bare (`x`) and the pre-pass rewrites the read via knownSignals.
 *
 * Mirrors the harness in `cross-module-signals.test.ts`.
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

let root: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-plain-mode-'))
})
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})
beforeEach(() => {
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
  ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'build' })
  return plugin
}

async function runBuildStart(plugin: ReturnType<typeof pyreonPlugin>) {
  await (plugin.buildStart as BuildStartHook).call({})
}

async function runTransform(
  plugin: ReturnType<typeof pyreonPlugin>,
  code: string,
  id: string,
  resolveMap: Record<string, string> = {},
) {
  const hook = plugin.transform as TransformHook
  return hook.call(
    {
      warn: () => {},
      resolve: async (specifier: string) => {
        const resolved = resolveMap[specifier]
        return resolved ? { id: resolved } : null
      },
    },
    code,
    id,
  )
}

const PLAIN_STORE = `'use plain'
import { state, derived } from '@pyreon/core/plain'
export let count = state(0)
export const double = derived(count * 2)
export const bump = () => { count = count + 1 }
`

describe('plain .ts modules go through the transform', () => {
  it('rewrites a marker-bearing .ts store (no JSX extension)', async () => {
    const plugin = bootstrap()
    const result = await runTransform(plugin, PLAIN_STORE, join(root, 'src/store.ts'))
    expect(result).toBeDefined()
    expect(result!.code).toContain('export const count = signal(0)')
    expect(result!.code).toContain('count.set(count() + 1)')
    expect(result!.code).toContain(`from '@pyreon/reactivity'`)
    expect(result!.code).not.toContain('@pyreon/core/plain')
  })

  it('leaves an ordinary .ts module byte-untouched (no transform result)', async () => {
    const plugin = bootstrap()
    const result = await runTransform(
      plugin,
      `export const state = { machine: true }\nexport const x = state\n`,
      join(root, 'src/util.ts'),
    )
    expect(result).toBeUndefined()
  })
})

describe('cross-module: plain exports feed classic importers', () => {
  it('registers `export let x = state(0)` so a classic {x} auto-calls', async () => {
    writeFile('src/store.ts', PLAIN_STORE)
    const appSource = `import { h } from "@pyreon/core"
import { count } from "./store"
export function App() { return <div>{count}</div> }`
    writeFile('src/App.tsx', appSource)

    const plugin = bootstrap()
    await runBuildStart(plugin)
    const result = await runTransform(plugin, appSource, join(root, 'src/App.tsx'), {
      './store': join(root, 'src/store.ts'),
    })
    expect(result).toBeDefined()
    expect(result!.code).toMatch(/count\(\)/)
  })

  it('registers `export let cfg = state.raw({…})` and DEEP `export let u = state({…})` exports', async () => {
    writeFile(
      'src/store.ts',
      `'use plain'
import { state } from '@pyreon/core/plain'
export let cfg = state.raw({ mode: 'dark' })
export let user = state({ name: 'Ada' })
`,
    )
    const appSource = `import { h } from "@pyreon/core"
import { cfg, user } from "./store"
export function App() { return <div>{cfg.mode}{user.name}</div> }`
    writeFile('src/App.tsx', appSource)

    const plugin = bootstrap()
    await runBuildStart(plugin)
    const result = await runTransform(plugin, appSource, join(root, 'src/App.tsx'), {
      './store': join(root, 'src/store.ts'),
    })
    expect(result).toBeDefined()
    // both roots must be auto-called — cfg() (shallow signal) and user()
    // (outer signal of the deep store)
    expect(result!.code).toMatch(/cfg\(\)\.mode/)
    expect(result!.code).toMatch(/user\(\)\.name/)
  })

  it('does NOT register state()-looking exports from a NON-plain module', async () => {
    // A classic module with its own `state` helper must not poison the
    // registry — the importer's bare `{total}` must stay uncalled.
    writeFile(
      'src/classic.ts',
      `import { state } from "./my-state-lib"
export const total = state(100)`,
    )
    const appSource = `import { h } from "@pyreon/core"
import { total } from "./classic"
export function App() { return <div>{total}</div> }`
    writeFile('src/App.tsx', appSource)

    const plugin = bootstrap()
    await runBuildStart(plugin)
    const result = await runTransform(plugin, appSource, join(root, 'src/App.tsx'), {
      './classic': join(root, 'src/classic.ts'),
    })
    // `total` must NOT be auto-called (it is not a signal).
    const code = result?.code ?? appSource
    expect(code).not.toMatch(/total\(\)/)
  })
})

describe('cross-module: classic exports feed plain importers', () => {
  it('a plain component reads an imported classic signal bare', async () => {
    writeFile(
      'src/store.ts',
      `import { signal } from "@pyreon/core"
export const theme = signal("light")`,
    )
    const appSource = `'use plain'
import { theme } from "./store"
export function App() { return <div class={theme}>x</div> }`
    writeFile('src/App.tsx', appSource)

    const plugin = bootstrap()
    await runBuildStart(plugin)
    const result = await runTransform(plugin, appSource, join(root, 'src/App.tsx'), {
      './store': join(root, 'src/store.ts'),
    })
    expect(result).toBeDefined()
    // The read compiles into the DIRECT-tier class binding — the compiler
    // recognises `theme()` as a signal call and passes the signal itself.
    expect(result!.code).toMatch(/_bindDirect\(theme,/)
  })

  it('a plain importer of a PLAIN store reads bare too (plain → plain)', async () => {
    writeFile('src/store.ts', PLAIN_STORE)
    const appSource = `'use plain'
import { count, double, bump } from "./store"
export function App() {
  return <button onClick={bump}>{count} / {double}</button>
}`
    writeFile('src/App.tsx', appSource)

    const plugin = bootstrap()
    await runBuildStart(plugin)
    const result = await runTransform(plugin, appSource, join(root, 'src/App.tsx'), {
      './store': join(root, 'src/store.ts'),
    })
    expect(result).toBeDefined()
    // Both reads land in the direct text-binding tier (raw signal handed to
    // `_bindText`) — the optimal emit, no accessor allocation per read.
    expect(result!.code).toMatch(/_bindText\(count,/)
    expect(result!.code).toMatch(/_bindText\(double,/)
  })
})
