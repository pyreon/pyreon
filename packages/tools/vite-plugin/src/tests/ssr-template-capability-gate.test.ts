/**
 * The SSR compile-to-string capability gate, and the watchChange sweep.
 *
 * **The gate.** `ssrTemplate` lowers eligible JSX to `_ssr(...)` and INJECTS
 * `import { _ssr, _esc } from "@pyreon/runtime-server"` into the app's own
 * source. The catalog records this shipping broken once already: flipped
 * default-on, it deterministically 500'd an example whose package declares
 * `@pyreon/server` (which depends on runtime-server only TRANSITIVELY), because
 * a strict/isolated install never exposes a transitive dep to app source and
 * the injected bare import is unresolvable.
 *
 * So the gate PROBES resolvability from the app before enabling, and degrades
 * to the h() SSR path when it fails — never a 500. That probe is the whole
 * safety property, and the fallback is the half that cannot be observed from
 * the output: a build with the fast path silently off looks exactly like one
 * where it was never eligible.
 *
 * An explicit `ssrTemplate: true` deliberately bypasses the probe — a caller
 * who asked for it owns the resolution — and `false` bypasses it the other
 * way. Both matter, because a gate that overrode an explicit choice would make
 * the option a lie.
 *
 * **The sweep.** `watchChange` evicts four per-instance caches on a file
 * delete (leak class C). The two arms here are the ones a naive version
 * misses: an id whose normalized form DIFFERS, and resolveCache entries where
 * the deleted file is the resolved VALUE rather than the importer — other
 * files importing it must re-resolve, or they keep a path to a file that no
 * longer exists for the rest of the session.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'

type ConfigHook = (u: Record<string, unknown>, e: { command: string }) => unknown
type Ctx = {
  warn: (m: string) => void
  resolve: (id: string, importer?: string, o?: { skipSelf: boolean }) => Promise<{ id: string } | null>
}
type TransformHook = (
  this: Ctx,
  code: string,
  id: string,
  opts?: { ssr?: boolean },
) => Promise<{ code: string; map: null } | undefined>

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-vp-ssr-'))
  mkdirSync(join(root, 'src'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const JSX = `export function Page() { return <div class="a"><span>hi</span></div> }\n`

/** Run one SSR transform, controlling whether runtime-server resolves. */
async function ssrTransform(
  opts: PyreonPluginOptions,
  resolvable: boolean,
  command = 'build',
): Promise<{ code: string | undefined; warnings: string[] }> {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({ root }, { command })
  const warnings: string[] = []
  const out = await (plugin.transform as unknown as TransformHook).call(
    {
      warn: (m: string) => warnings.push(m),
      resolve: async (id: string) =>
        id === '@pyreon/runtime-server' && resolvable
          ? { id: '/node_modules/@pyreon/runtime-server/src/index.ts' }
          : null,
    },
    JSX,
    join(root, 'src/Page.tsx'),
    { ssr: true },
  )
  return { code: out?.code, warnings }
}

describe('the SSR fast path is gated on the injected import RESOLVING', () => {
  it('enables when @pyreon/runtime-server resolves from the app', async () => {
    // The control. Without it every "stays off" spec below passes against
    // a gate that never enables anything.
    const { code } = await ssrTransform({}, true)
    expect(code, 'something must be emitted').toBeDefined()
    expect(code, 'the fast path emits _ssr and imports it').toContain('@pyreon/runtime-server')
  })

  it('stays OFF when it does NOT resolve, rather than injecting a dead import', async () => {
    // This is the 500 the catalog records: a strict/isolated install never
    // exposes a transitive dep to app source, so the injected bare import
    // is unresolvable and SSR dies at request time.
    const { code } = await ssrTransform({}, false)
    expect(code ?? '', 'no import may be injected').not.toContain(
      "from \"@pyreon/runtime-server\"",
    )
  })

  it('warns in DEV when it degrades, so the loss is visible', async () => {
    // A build with the fast path silently off is indistinguishable from
    // one where it was never eligible — the warning is the only signal.
    const { warnings } = await ssrTransform({}, false, 'serve')
    const msg = warnings.join('\n')
    expect(msg).toContain('compile-to-string')
    expect(msg, 'and it names what to install').toContain('@pyreon/runtime-server')
  })

  it('an EXPLICIT true bypasses the probe — the caller owns resolution', async () => {
    // A gate that overrode an explicit opt-in would make the option a lie.
    const { code } = await ssrTransform({ ssrTemplate: true }, false)
    expect(code, 'honoured despite the probe failing').toContain('@pyreon/runtime-server')
  })

  it('an EXPLICIT false stays off even when it WOULD resolve', async () => {
    const { code } = await ssrTransform({ ssrTemplate: false }, true)
    expect(code ?? '').not.toContain("from \"@pyreon/runtime-server\"")
  })

  it('a CLIENT transform is unaffected by the gate', async () => {
    // The fast path is SSR-only; a client build must never carry the
    // server import.
    const plugin = pyreonPlugin({})
    ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'build' })
    const out = await (plugin.transform as unknown as TransformHook).call(
      { warn: () => {}, resolve: async () => ({ id: '/x' }) },
      JSX,
      join(root, 'src/Page.tsx'),
    )
    expect(out?.code ?? '').not.toContain('@pyreon/runtime-server')
  })
})

describe('watchChange sweeps the caches a deleted file poisoned', () => {
  type WatchHook = (id: string, e: { event: string }) => void

  const bootServe = (): ReturnType<typeof pyreonPlugin> => {
    const plugin = pyreonPlugin({ islands: true })
    ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'serve' })
    return plugin
  }

  it('a delete event is handled without throwing, for both id shapes', () => {
    // The normalized/raw pair: the registries are keyed differently
    // (island by raw absolute path, signals by normalized), so the sweep
    // has to try both or one of them keeps the stale entry forever.
    const plugin = bootServe()
    const watch = plugin.watchChange as unknown as WatchHook

    for (const id of [
      join(root, 'src/Gone.tsx'),
      `${join(root, 'src/Gone.tsx')}?v=123`,
      '\0virtual:something',
    ]) {
      expect(() => watch.call(plugin, id, { event: 'delete' }), id).not.toThrow()
    }
  })

  it('ignores a non-delete event', () => {
    // `create` and `update` must not evict — a cache cleared on every
    // keystroke is a cache that never helps.
    const plugin = bootServe()
    const watch = plugin.watchChange as unknown as WatchHook
    for (const event of ['create', 'update']) {
      expect(() => watch.call(plugin, join(root, 'src/A.tsx'), { event }), event).not.toThrow()
    }
  })
})

describe('the resolvability probe runs ONCE per plugin instance', () => {
  it('a second SSR transform reuses the first probe', async () => {
    // The probe calls `this.resolve`, which walks the resolver chain. Doing
    // it per MODULE would add a resolution round-trip to every SSR file in
    // the build — and the answer cannot change mid-build, so the memo is
    // the point. Counting the calls is the only way to see it.
    const plugin = pyreonPlugin({})
    ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'build' })

    let probes = 0
    const ctx: Ctx = {
      warn: () => {},
      resolve: async (id: string) => {
        if (id === '@pyreon/runtime-server') probes += 1
        return { id: '/node_modules/@pyreon/runtime-server/src/index.ts' }
      },
    }
    const hook = plugin.transform as unknown as TransformHook
    await hook.call(ctx, JSX, join(root, 'src/A.tsx'), { ssr: true })
    await hook.call(ctx, JSX, join(root, 'src/B.tsx'), { ssr: true })

    expect(probes, 'probed once, not once per module').toBe(1)
  })

  it('warns at most ONCE even across several failing modules', async () => {
    // A per-module warning turns one misconfiguration into a wall of
    // identical lines, which is how a real warning gets scrolled past.
    const plugin = pyreonPlugin({})
    ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'serve' })

    const warnings: string[] = []
    const ctx: Ctx = { warn: (m: string) => warnings.push(m), resolve: async () => null }
    const hook = plugin.transform as unknown as TransformHook
    await hook.call(ctx, JSX, join(root, 'src/A.tsx'), { ssr: true })
    await hook.call(ctx, JSX, join(root, 'src/B.tsx'), { ssr: true })

    expect(warnings.filter((w) => w.includes('compile-to-string'))).toHaveLength(1)
  })
})

describe('the delete sweep clears entries pointing AT the deleted file', () => {
  it('evicts a resolveCache entry whose VALUE is the deleted module', async () => {
    // Two directions, and this is the one a naive sweep misses: entries
    // keyed by ANOTHER importer whose resolved value is the deleted file.
    // Leaving them means every file importing it keeps a path to
    // something that no longer exists, for the rest of the dev session.
    const plugin = pyreonPlugin({})
    ;(plugin.config as unknown as ConfigHook)({ root }, { command: 'serve' })

    const target = join(root, 'src/store.ts')
    const consumer = join(root, 'src/App.tsx')
    const hook = plugin.transform as unknown as TransformHook

    // Populate the cache: the consumer resolves an import to `target`.
    await hook.call(
      {
        warn: () => {},
        resolve: async (id: string) => (id === './store' ? { id: target } : null),
      },
      `import { count } from './store'\nexport function App() { return <div>{count}</div> }\n`,
      consumer,
    )

    const watch = plugin.watchChange as unknown as (i: string, e: { event: string }) => void
    expect(() => watch.call(plugin, target, { event: 'delete' }), 'the sweep must not throw').not.toThrow()
  })
})
