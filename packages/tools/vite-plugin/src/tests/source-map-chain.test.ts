/**
 * The transform hook returns ONE source map from Vite's input to its output
 * (#4418).
 *
 * The hook runs passes around the JSX compile: island names, the JSX
 * auto-import and the inline-`<Defer>` rewrite before it; the HMR signal
 * rewrite and signal debug names after it (dev); the compat attribute rename
 * and the validator rewrite instead of it. It used to return only the
 * compiler's map, and `null` for every other pass, so an auto-imported line
 * moved every frame one line down and a debug-name insertion moved the
 * columns after it. Every case here decodes the returned map and asserts a
 * token traces back to its exact source line AND column.
 *
 * Bisect: return `{ code, map: result.map ?? null }` (the old hook tail) →
 * the auto-import, dev and LPIH rows fail; drop `deferResult.map` from the
 * chain → the Defer row fails.
 */
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'
import { SourceMapChain } from '../source-map-chain'

type ConfigHook = (u: Record<string, unknown>, e: { command: string }) => unknown
type TransformHook = (
  this: { warn: (m: string) => void; info: (m: string) => void; resolve: () => Promise<null> },
  code: string,
  id: string,
  options?: { ssr?: boolean },
) => Promise<{ code: string; map: unknown } | undefined>

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function transform(
  code: string,
  file: string,
  { command = 'serve', ssr = false, options = {} }: {
    command?: 'serve' | 'build'
    ssr?: boolean
    options?: PyreonPluginOptions
  } = {},
): Promise<{ code: string; map: unknown }> {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-vp-sourcemap-'))
  roots.push(root)
  mkdirSync(join(root, 'src'), { recursive: true })
  const plugin = pyreonPlugin(options)
  ;(plugin.config as unknown as ConfigHook)({ root }, { command })
  const out = await (plugin.transform as unknown as TransformHook).call(
    { warn: () => {}, info: () => {}, resolve: async () => null },
    code,
    join(root, 'src', file),
    { ssr },
  )
  if (!out) throw new Error('the hook left the module alone')
  return out
}

/** 1-based line, 0-based column of the first `needle` in `text`. */
function locate(text: string, needle: string): { line: number; column: number } {
  const at = text.indexOf(needle)
  if (at < 0) throw new Error(`needle ${JSON.stringify(needle)} not in:\n${text}`)
  const before = text.slice(0, at).split('\n')
  return { line: before.length, column: before[before.length - 1]!.length }
}

function expectMapsBack(input: string, out: { code: string; map: unknown }, needle: string) {
  expect(out.map, 'the hook moved code, so it must return a map').toBeTruthy()
  const traced = originalPositionFor(new TraceMap(out.map as never), locate(out.code, needle))
  expect({ line: traced.line, column: traced.column }, needle).toEqual(locate(input, needle))
}

// `<Show>` is not imported: the auto-import adds a line on top BEFORE the
// compiler adds its own imports and hoists the static `<span>`. In dev, the
// module-scope signal is rewritten for HMR and the `computed` gets a debug
// name; the probes sit AFTER those edits on the same line.
const PANEL = `import { signal, computed } from '@pyreon/reactivity'

const count = signal(0); const after = probeA()

export function Panel(props: { on: boolean }) {
  const badge = <span class="badge">static</span>
  const width = window.innerWidth
  const d = computed(() => props.on); const tail = probeB()
  return (
    <Show when={() => props.on}>
      <div>{badge}{count()}{width}{d()}</div>
    </Show>
  )
}
function after2(x: boolean) { return x ? 1 : missingThing.value }
`

describe('transform hook — one map through every pass', () => {
  for (const ssr of [false, true]) {
    const graph = ssr ? 'SSR' : 'client'

    it(`${graph}, dev: lines below the auto-import and the compiler's imports`, async () => {
      const out = await transform(PANEL, 'panel.tsx', { ssr })
      expect(out.code).toContain("from '@pyreon/core'")
      expectMapsBack(PANEL, out, 'window.innerWidth')
      expectMapsBack(PANEL, out, 'missingThing.value')
    })

    it(`${graph}, dev: columns after the HMR rewrite and the debug-name insertion`, async () => {
      const out = await transform(PANEL, 'panel.tsx', { ssr })
      expect(out.code).toContain('__hmr_signal(')
      expect(out.code).toContain('name: "d"')
      expectMapsBack(PANEL, out, 'probeA()')
      expectMapsBack(PANEL, out, 'probeB()')
    })

    it(`${graph}, build: the same positions without the dev passes`, async () => {
      const out = await transform(PANEL, 'panel.tsx', { ssr, command: 'build' })
      expectMapsBack(PANEL, out, 'window.innerWidth')
      expectMapsBack(PANEL, out, 'probeB()')
    })
  }

  it('a debug name reports the SOURCE line of its call, not the compiled line', async () => {
    const out = await transform(PANEL, 'panel.tsx')
    const loc = /name: "d", __sourceLocation: \{ file: "[^"]+", line: (\d+), col: (\d+) \}/.exec(out.code)
    expect(loc).not.toBeNull()
    // `  const d = computed(…)` is line 8, column 3 of the source.
    expect([Number(loc![1]), Number(loc![2])]).toEqual([8, 3])
  })

  it('island names inserted into the call keep later columns mapped', async () => {
    const src = `import { island } from '@pyreon/server/client'
export const Counter = island(() => import('./Counter'), { hydrate: 'load' }); export const p = probeC()
export const View = () => <div>{p}</div>
`
    const out = await transform(src, 'islands.tsx', { options: { islands: true } })
    expect(out.code).toContain('name: "Counter$')
    expectMapsBack(src, out, 'probeC()')
  })

  it('an inline <Defer> rewrite that removes an import line maps the lines below it', async () => {
    const src = `import { Defer } from '@pyreon/core'
import { Modal } from './modal'

export const X = () => <div><Defer when={open}><Modal /></Defer></div>
const probe = missingThing.value
`
    const out = await transform(src, 'defer.tsx', { command: 'build' })
    expect(out.code).not.toContain("from './modal'")
    expectMapsBack(src, out, 'missingThing.value')
  })

  it('the compat className rename keeps later columns mapped', async () => {
    const src = `export const A = () => <div className="a" title={probeD()}>x</div>\n`
    const out = await transform(src, 'compat.tsx', { options: { compat: 'react' } })
    expect(out.code).toContain('class="a"')
    expectMapsBack(src, out, 'probeD()')
  })

  it('the validator rewrite maps the lines below its injected imports', async () => {
    const src = `import { s } from '@pyreon/validate'
const Login = s.object({ email: s.string().email() })
export const probe = () => missingThing.value
`
    const out = await transform(src, 'schema.ts', {
      command: 'build',
      options: { optimizeValidators: true },
    })
    expect(out.code).toContain('@pyreon/validate/mini')
    expectMapsBack(src, out, 'missingThing.value')
  })
})

describe('SourceMapChain', () => {
  it('composes steps and traces a position back through all of them', () => {
    const src = 'const a = 1\nconst b = probe()\n'
    const chain = new SourceMapChain(src, '/x.ts')
    chain.edit([{ start: 0, end: 0, text: 'import x from "x"\n' }])
    chain.edit([{ start: chain.code.indexOf('probe'), end: chain.code.indexOf('probe'), text: 'wrapped.' }])
    chain.append('\n// tail\n')
    expect(chain.code).toBe('import x from "x"\nconst a = 1\nconst b = wrapped.probe()\n\n// tail\n')
    const out = { code: chain.code, map: chain.map() }
    expectMapsBack(src, out, 'probe()')
    expect((chain.map() as { sourcesContent: string[] }).sourcesContent).toEqual([src])
    expect(chain.originalPosition(3, 19)).toEqual({ line: 2, col: 11 })
  })

  it('returns null rather than a map that lies when a step brings no map', () => {
    const chain = new SourceMapChain('a\nb\n', '/x.ts')
    chain.step('z\na\nb\n', null)
    expect(chain.map()).toBeNull()
    expect(chain.originalPosition(2, 1)).toBeNull()
  })

  it('an unchanged module needs no map', () => {
    const chain = new SourceMapChain('a\n', '/x.ts')
    chain.edit([])
    chain.append('b\n')
    expect(chain.map()).toBeNull()
  })
})

// ── Real Vite dev server ────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url))
const packagesDir = resolve(here, '../../../..')
const RUNTIME = {
  core: 'core/core',
  reactivity: 'core/reactivity',
  'runtime-dom': 'core/runtime-dom',
  'runtime-server': 'core/runtime-server',
} as const

/** A throwaway app whose `@pyreon/*` imports resolve to this workspace. */
function devApp(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-vp-sourcemap-app-'))
  roots.push(root)
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'node_modules', '@pyreon'), { recursive: true })
  for (const [name, dir] of Object.entries(RUNTIME)) {
    symlinkSync(join(packagesDir, dir), join(root, 'node_modules', '@pyreon', name), 'dir')
  }
  writeFileSync(join(root, 'package.json'), '{"name":"sourcemap-app","type":"module"}')
  for (const [file, text] of Object.entries(files)) writeFileSync(join(root, 'src', file), text)
  return root
}

describe('Vite dev server — a thrown error reports its source line', { timeout: 30_000 }, () => {
  const BOOM = `import { signal } from '@pyreon/reactivity'

const hits = signal(0)

export function Boom(props: { n: number }) {
  const label = <em class="x">static</em>
  hits.set(hits() + props.n)
  if (props.n > 0) throw new Error('boom on line 8')
  return <Show when={() => props.n}><p>{label}{hits()}</p></Show>
}
`

  it('SSR: ssrFixStacktrace points at line 8, inside the throw statement', async () => {
    const root = devApp({ 'boom.tsx': BOOM })
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false },
      plugins: [pyreonPlugin()],
    })
    try {
      const mod = (await server.ssrLoadModule('/src/boom.tsx')) as {
        Boom: (p: { n: number }) => unknown
      }
      let stack = ''
      try {
        mod.Boom({ n: 1 })
      } catch (err) {
        server.ssrFixStacktrace(err as Error)
        stack = (err as Error).stack ?? ''
      }
      const frame = /boom\.tsx:(\d+):(\d+)/.exec(stack)
      expect(frame, stack).not.toBeNull()
      expect(Number(frame![1])).toBe(8)
      // The engine picks a token of `throw new Error(…)`; any of them is on
      // the statement (columns 20–35), none is outside it.
      const col = Number(frame![2])
      expect(col).toBeGreaterThanOrEqual(20)
      expect(col).toBeLessThanOrEqual(35)
    } finally {
      await server.close()
    }
  })

  it('client: the composed map sends the issue example to line 3', async () => {
    const src = `export default function Viewport() {
  // Reads a browser global while the server renders the page.
  const width = window.innerWidth
  return <p>Viewport is {width}px wide</p>
}
`
    const root = devApp({ 'viewport.tsx': src })
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false },
      plugins: [pyreonPlugin()],
    })
    try {
      for (const ssr of [false, true]) {
        const r = await server.transformRequest('/src/viewport.tsx', { ssr })
        expectMapsBack(src, { code: r!.code, map: r!.map }, 'window.innerWidth')
      }
    } finally {
      await server.close()
    }
  })
})
