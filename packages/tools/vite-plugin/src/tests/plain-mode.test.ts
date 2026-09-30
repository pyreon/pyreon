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
import pyreonPlugin, { plainMarkerLocalNames, type PyreonPluginOptions } from '../index'

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
    // Both reads are auto-called and the text-only run `{count} / {double}`
    // becomes ONE fused accessor (text fusion) — no per-read placeholders.
    expect(result!.code).toMatch(/_fuse\(count\(\), " \/ ", double\(\)\)/)
    expect(result!.code).not.toMatch(/_bindText\(/)
  })
})

describe('cross-module: ALIASED plain markers and non-.ts plain stores', () => {
  // The pre-pass recognises the markers by IMPORT SOURCE, so an aliased store
  // compiles — but the registry scan matched the literal names, so its
  // exports were never registered and a classic importer rendered the
  // signal's SOURCE. And the transform gate accepted only `.ts`/`.mts` while
  // the prescan walks `.js`: a `.js` plain store threw at runtime.
  it('plainMarkerLocalNames reads aliases (and keeps the canonical names)', () => {
    expect(plainMarkerLocalNames("import { state as s, derived as d } from '@pyreon/core/plain'")).toEqual({
      state: 'state|s',
      derived: 'derived|d',
    })
    expect(plainMarkerLocalNames("'use plain'")).toEqual({ state: 'state', derived: 'derived' })
  })

  it('registers `export let x = s(0)` from an aliased store so a classic {x} auto-calls', async () => {
    writeFile(
      'src/store.ts',
      "import { state as s, derived as d } from '@pyreon/core/plain'\nexport let count = s(0)\nexport const double = d(count * 2)\n",
    )
    const appSource = `import { h } from "@pyreon/core"
import { count, double } from "./store"
export function App() { return <div>{count}{double}</div> }`
    writeFile('src/App.tsx', appSource)
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const result = await runTransform(plugin, appSource, join(root, 'src/App.tsx'), {
      './store': join(root, 'src/store.ts'),
    })
    expect(result!.code).toMatch(/count\(\)/)
    expect(result!.code).toMatch(/double\(\)/)
  })

  it('transforms a marker-bearing .js store', async () => {
    const store = "import { state } from '@pyreon/core/plain'\nexport let count = state(0)\nexport const bump = () => { count = count + 1 }\n"
    const plugin = bootstrap()
    const result = await runTransform(plugin, store, join(root, 'src/store.js'))
    expect(result).toBeDefined()
    expect(result!.code).toContain('signal(0')
    expect(result!.code).not.toContain('state(0')
  })
})

describe('pyreon({ plain: true }) — project-wide Plain Mode', () => {
  const CARD = `export function Card({ title }) { return <h1>{title}</h1> }\n`

  it('compiles a marker-less APP component as plain (props destructuring is live)', async () => {
    const plugin = bootstrap({ plain: true })
    await runBuildStart(plugin)
    const id = writeFile('src/Card.tsx', CARD)
    const out = (await runTransform(plugin, CARD, id))!.code
    expect(out).toContain('Card(props)')
  })

  it('leaves the same component classic when the option is off', async () => {
    const plugin = bootstrap()
    await runBuildStart(plugin)
    const id = writeFile('src/Card.tsx', CARD)
    expect((await runTransform(plugin, CARD, id))!.code).toContain('Card({ title })')
  })

  it("respects a per-file 'use classic' opt-out", async () => {
    const plugin = bootstrap({ plain: true })
    await runBuildStart(plugin)
    const src = `'use classic'\n${CARD}`
    const id = writeFile('src/Legacy.tsx', src)
    expect((await runTransform(plugin, src, id))!.code).toContain('Card({ title })')
  })

  it('never forces third-party node_modules code', async () => {
    const plugin = bootstrap({ plain: true, include: [/\.tsx$/] })
    await runBuildStart(plugin)
    const id = writeFile('node_modules/some-lib/Card.tsx', CARD)
    const out = await runTransform(plugin, CARD, id)
    expect(out?.code ?? CARD).not.toContain('Card(props)')
  })
})

describe('dev source-location injection ignores JSX text', () => {
  it('`effect()` written as JSX TEXT is not rewritten into a call (serve mode)', async () => {
    const plugin = pyreonPlugin()
    ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'serve' })
    await runBuildStart(plugin)
    const src = `import { effect, signal } from '@pyreon/reactivity'
const n = signal(0)
effect(() => { void n() })
export const Doc = () => <Code>Use effect() for side effects and signal() for state.</Code>
`
    const id = writeFile('src/Doc.tsx', src)
    const out = (await runTransform(plugin, src, id))!.code
    // the real call gets its location (module-level signals go through HMR)…
    expect(out).toMatch(/effect\(\(\) => \{ void n\(\) \}, \{ __sourceLocation/)
    // …the prose inside JSX stays prose
    expect(out).toContain('Use effect() for side effects and signal() for state.')
  })
})

describe('HMR state preservation for plain modules', () => {
  it('a module-level `let x = state(…)` is HMR-preserved exactly like a classic signal (serve mode)', async () => {
    const plugin = pyreonPlugin()
    ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'serve' })
    await runBuildStart(plugin)
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
let count = state(0)
export const View = () => <button onClick={() => { count++ }}>{count}</button>
`
    const id = writeFile('src/HmrPlain.tsx', src)
    const out = (await runTransform(plugin, src, id))!.code
    // the pre-pass lowered the marker BEFORE HMR injection saw the module, so
    // the signal is registered under its name and survives a hot update
    expect(out).toMatch(/const count = __hmr_signal\([^,]+, "count", signal, 0\)/)
    expect(out).not.toContain('state(')
  })
})
