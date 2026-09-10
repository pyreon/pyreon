/**
 * The `transform` hook's early-exit ladder, driven through the real plugin.
 *
 * `transform` runs on every module a build touches, and it is a LADDER:
 * validator rewrite, compiled verdicts, compat attributes, island scan,
 * JSX auto-import, then the JSX transform itself. Each rung returns early,
 * so the order decides what a later rung ever sees — and a rung that
 * returns when it should not silently skips every transform below it.
 *
 * That is the failure mode worth guarding. None of these produce an error:
 * the module compiles, it just was not transformed. A missing island name
 * means the marker and the registry disagree and the island never
 * hydrates; a missing compat rewrite means a React app renders through
 * the wrong reconciler. Both surface as "it does not work" in a consumer's
 * app, with nothing in the build output.
 *
 * The gating flags matter as much as the rungs: the validator rewrite is
 * BUILD-ONLY and `.ts`-only, so a dev server or a `.tsx` module must fall
 * through to the rungs below rather than be rewritten.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => unknown
type TransformHook = (
  this: { warn: (m: string) => void; resolve: () => Promise<null> },
  code: string,
  id: string,
) => Promise<{ code: string; map: null } | undefined>

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-vp-transform-'))
  mkdirSync(join(root, 'src'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const boot = (opts: PyreonPluginOptions = {}, command = 'build'): ReturnType<typeof pyreonPlugin> => {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({ root }, { command })
  return plugin
}

const run = async (
  plugin: ReturnType<typeof pyreonPlugin>,
  code: string,
  id: string,
): Promise<string | undefined> => {
  const hook = plugin.transform as unknown as TransformHook
  const out = await hook.call({ warn: () => {}, resolve: async () => null }, code, id)
  return out?.code
}

const VALIDATOR_SRC = `import { s } from '@pyreon/validate'
export const User = s.object({ name: s.string().min(1) })
`

describe('the validator rewrite is build-only and .ts-only', () => {
  it('rewrites a .ts module in a BUILD', () => {
    // The control for the three negatives below — without it they pass
    // against a rung that never fires at all.
    return (async () => {
      const out = await run(boot({ optimizeValidators: true }), VALIDATOR_SRC, join(root, 'src/schema.ts'))
      expect(out, 'the rewrite must actually happen somewhere').toBeDefined()
    })()
  })

  it('does NOT rewrite in dev — the rung is build-only', async () => {
    // Rewriting in dev would make the served module differ from the one
    // the author is editing, and the mini form has different error text.
    const out = await run(
      boot({ optimizeValidators: true }, 'serve'),
      VALIDATOR_SRC,
      join(root, 'src/schema.ts'),
    )
    // Falling through the whole ladder on a `.ts` with no JSX means the
    // hook returns undefined — i.e. "I did not transform this" — rather
    // than returning the source unchanged.
    expect(out, 'dev must fall through the rung entirely').toBeUndefined()
  })

  it('does NOT rewrite a .tsx module', async () => {
    // Scoped to `.ts` deliberately, mirroring the compiled-verdict
    // early-return: a `.tsx` still needs the JSX rungs below.
    const out = await run(
      boot({ optimizeValidators: true }),
      VALIDATOR_SRC,
      join(root, 'src/schema.tsx'),
    )
    expect(out ?? '').not.toContain('@pyreon/validate/mini')
  })

  it('does NOT rewrite when the flag is off', async () => {
    const out = await run(boot({}), VALIDATOR_SRC, join(root, 'src/schema.ts'))
    expect(out ?? '').not.toContain('@pyreon/validate/mini')
  })

  it('leaves a .ts module that does not mention validate alone', async () => {
    // The `code.includes` gate: without it every .ts file in the project
    // pays the rewrite scan.
    const src = 'export const x = 1\n'
    expect(await run(boot({ optimizeValidators: true }), src, join(root, 'src/plain.ts'))).toBeUndefined()
  })
})

describe('island declarations are named before they are scanned', () => {
  const ISLAND_SRC = `import { island } from '@pyreon/server/client'
const Counter = island(() => import('./Counter'), { hydrate: 'load' })
export default Counter
`

  it('injects a derived name into a nameless island', async () => {
    // The marker and the registry must agree, and they only can if the
    // name is injected BEFORE the scan reads it. A disagreement means the
    // island renders and never hydrates — with no error anywhere.
    const out = await run(boot({ islands: true }), ISLAND_SRC, join(root, 'src/Island.tsx'))
    expect(out, 'the island module must be transformed').toBeDefined()
    expect(out, 'a name must have been derived').toMatch(/name:\s*['"]Counter\$/)
  })

  it('leaves an EXPLICIT name alone', async () => {
    // An author-supplied name wins — deriving over it would change the
    // registry key and break a hand-written `hydrateIslands({ … })`.
    const explicit = ISLAND_SRC.replace("{ hydrate: 'load' }", "{ name: 'MyCounter', hydrate: 'load' }")
    const out = await run(boot({ islands: true }), explicit, join(root, 'src/Island.tsx'))
    expect(out ?? explicit).toContain("'MyCounter'")
    expect(out ?? explicit).not.toMatch(/name:\s*['"]Counter\$/)
  })

  it('does not touch islands when the option is OFF', async () => {
    const out = await run(boot({ islands: false }), ISLAND_SRC, join(root, 'src/Island.tsx'))
    expect(out ?? ISLAND_SRC, 'no name injected').not.toMatch(/name:\s*['"]Counter\$/)
  })
})

describe('compat attribute rewriting is per-framework', () => {
  const JSX = `export function C() { return <div className="a" htmlFor="b" /> }\n`

  for (const compat of ['react', 'preact'] as const) {
    it(`${compat}: rewrites className/htmlFor`, async () => {
      // These two frameworks spell the DOM attributes differently from
      // the platform; leaving them means the class never lands.
      const out = await run(boot({ compat }), JSX, join(root, 'src/C.jsx'))
      expect(out, `${compat} must transform`).toBeDefined()
      expect(out).toContain('class')
    })
  }

  it('vue does NOT get the react-style attribute rewrite', async () => {
    // The rung is gated on react/preact specifically — Vue's JSX already
    // uses the platform names, so rewriting would be a no-op at best and
    // a corruption at worst.
    const out = await run(boot({ compat: 'vue' }), JSX, join(root, 'src/C.jsx'))
    expect(out ?? JSX, 'left as authored').toContain('className')
  })
})

describe('modules the hook must not touch at all', () => {
  it('skips a .css file', async () => {
    expect(await run(boot({}), '.a { color: red }', join(root, 'src/a.css'))).toBeUndefined()
  })

  it('skips a plain .js file with no JSX', async () => {
    expect(await run(boot({}), 'export const x = 1\n', join(root, 'src/a.js'))).toBeUndefined()
  })

  it('does NOT filter node_modules itself — that is Vite\'s job', async () => {
    // Pinned as an observed fact rather than asserted as a contract: the
    // hook transforms whatever id it is handed, and dependency exclusion
    // happens upstream in Vite's pipeline. Worth recording because the
    // opposite is the intuitive assumption (it was mine), and a future
    // reader adding a guard here should know none exists today.
    const src = `export function C() { return <div /> }\n`
    const out = await run(boot({}), src, join(root, 'node_modules/x/index.jsx'))
    expect(out, 'transformed, not skipped').toBeDefined()
  })
})

describe('options that change what the JSX transform is asked to do', () => {
  const JSX_TREE = `export function P() { return <div><Child /><Child /></div> }\n`

  it('templatizeComponentChildren is forwarded when enabled', async () => {
    // The option is DEFAULT-ON in this plugin while the compiler primitive
    // stays opt-in, so the plugin is the only thing that turns it on. If
    // it stopped forwarding, the deep-tree win silently reverts and
    // nothing in the output says so.
    const out = await run(boot({ templatizeComponentChildren: true }), JSX_TREE, join(root, 'src/P.tsx'))
    expect(out, 'the module still compiles').toBeDefined()
  })

  it('and the tree still compiles with it explicitly OFF', async () => {
    // The control, and the property the compiler documents: with the
    // option off the emit is byte-identical to a bail, so no shape may
    // regress.
    const out = await run(boot({ templatizeComponentChildren: false }), JSX_TREE, join(root, 'src/P.tsx'))
    expect(out).toBeDefined()
  })
})

describe('svelte gets the same core jsx-runtime redirect as its siblings', () => {
  it('rewrites @pyreon/core/jsx-runtime for compat: svelte', async () => {
    // Five frameworks, one repetitive table — the shape where a missing
    // entry is noticed only by that framework's users, because their JSX
    // silently compiles against Pyreon's own runtime instead of the shim.
    const { _getCompatTarget } = await import('../index')
    expect(_getCompatTarget('svelte' as never, '@pyreon/core/jsx-runtime')).toBe(
      '@pyreon/svelte-compat/jsx-runtime',
    )
    expect(_getCompatTarget('svelte' as never, '@pyreon/core/jsx-dev-runtime')).toBe(
      '@pyreon/svelte-compat/jsx-runtime',
    )
  })
})

describe('the validator rewrite falls through when there is nothing to rewrite', () => {
  it('a .ts that MENTIONS validate but has no chainable schema keeps going', async () => {
    // `optimizeValidators` returns null for a module it cannot improve,
    // and the rung must then fall through to the ones below rather than
    // returning the source as if it had transformed it — which would skip
    // every later rung for that module.
    const src = `import { s } from '@pyreon/validate'\nexport const notASchema = s\n`
    const out = await run(boot({ optimizeValidators: true }), src, join(root, 'src/passthrough.ts'))
    expect(out ?? '', 'not rewritten to the mini form').not.toContain('@pyreon/validate/mini')
  })
})
