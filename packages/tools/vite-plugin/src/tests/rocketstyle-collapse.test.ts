import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pyreon from '../index'
import {
  type CollapseResolver,
  createCollapseResolver,
  DEFAULT_COLLAPSE_CONFIG,
  deriveCollapse,
} from '../rocketstyle-collapse'

// Layer 3: the build-time resolver SSR-renders the REAL
// @pyreon/ui-components Button (light + dark) through a programmatic
// Vite SSR bound to examples/ui-showcase's own config, and derives
// resolved classes + styler rule text + a class-stripped template.
// Byte-for-byte parity vs the actual runtime-mounted class is asserted
// at the e2e layer (Phase 4); here we prove the resolver mechanism end
// to end against the real component (no mocks).

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'examples', 'ui-showcase', 'package.json'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('repo root with examples/ui-showcase not found')
}
const UI_SHOWCASE = join(repoRoot(), 'examples', 'ui-showcase')

describe('deriveCollapse (pure extraction)', () => {
  it('strips the root class, keeps inner markup, derives both classes', () => {
    const light = '<button class="A B" data-x="1"><span class="inner">Save</span></button>'
    const dark = '<button class="C D" data-x="1"><span class="inner">Save</span></button>'
    const r = deriveCollapse(light, dark, ['.A{}', '.C{}'])
    expect(r).not.toBeNull()
    expect(r?.templateHtml).toBe(
      '<button data-x="1"><span class="inner">Save</span></button>',
    )
    expect(r?.lightClass).toBe('A B')
    expect(r?.darkClass).toBe('C D')
    expect(r?.key).toMatch(/^[0-9a-z]+$/)
  })

  it('bails (null) when light/dark markup diverges structurally', () => {
    expect(
      deriveCollapse('<button class="A">x</button>', '<button class="B"><i>x</i></button>', []),
    ).toBeNull()
  })

  it('bails (null) when the root has no class', () => {
    expect(deriveCollapse('<button>x</button>', '<button>x</button>', [])).toBeNull()
  })

  it('light===dark class is valid (mode-invariant component) — NOT a bail', () => {
    const r = deriveCollapse(
      '<button class="same">x</button>',
      '<button class="same">x</button>',
      ['.same{}'],
    )
    expect(r).not.toBeNull()
    expect(r?.lightClass).toBe('same')
    expect(r?.darkClass).toBe('same')
  })
})

describe('createCollapseResolver — real @pyreon/ui-components Button via Vite SSR', () => {
  let resolver: CollapseResolver
  beforeAll(async () => {
    resolver = await createCollapseResolver(UI_SHOWCASE)
  }, 60_000)
  afterAll(async () => {
    await resolver?.dispose()
  })

  it('resolves a single-root <button> template + non-empty classes + rules', async () => {
    const r = await resolver.resolve({
      component: { name: 'Button', source: '@pyreon/ui-components' },
      props: { state: 'primary', size: 'medium' },
      childrenText: 'Save',
      config: DEFAULT_COLLAPSE_CONFIG,
    })
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.templateHtml.startsWith('<button')).toBe(true)
    expect(r.templateHtml).toContain('Save')
    // root class stripped (applied reactively); inner span class stays baked
    expect(/^<button[^>]*\sclass=/.test(r.templateHtml)).toBe(false)
    expect(r.lightClass.length).toBeGreaterThan(0)
    expect(r.darkClass.length).toBeGreaterThan(0)
    expect(r.rules.length).toBeGreaterThan(0)
    const joined = r.rules.join('')
    // The resolved root classes exist in the captured rule text.
    for (const cls of r.lightClass.split(/\s+/)) expect(joined).toContain(cls)
    for (const cls of r.darkClass.split(/\s+/)) expect(joined).toContain(cls)
  }, 60_000)

  it('is deterministic — same input ⇒ identical result (cached, no drift)', async () => {
    const input = {
      component: { name: 'Button', source: '@pyreon/ui-components' },
      props: { state: 'secondary', size: 'small' },
      childrenText: 'Go',
      config: DEFAULT_COLLAPSE_CONFIG,
    }
    const a = await resolver.resolve(input)
    const b = await resolver.resolve(input)
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
  }, 60_000)

  it('returns null (graceful bail) for a non-existent component export', async () => {
    const r = await resolver.resolve({
      component: { name: 'NotARealExport', source: '@pyreon/ui-components' },
      props: { state: 'primary' },
      childrenText: 'x',
      config: DEFAULT_COLLAPSE_CONFIG,
    })
    expect(r).toBeNull()
  }, 60_000)
})

describe('end-to-end pipeline — real Button through resolver → scanner → compiler', () => {
  let resolver: CollapseResolver
  beforeAll(async () => {
    resolver = await createCollapseResolver(UI_SHOWCASE)
  }, 60_000)
  afterAll(async () => {
    await resolver?.dispose()
  })

  it('the emitted _rsCollapse embeds the REAL SSR-resolved class + template byte-for-byte', async () => {
    const { transformJSX, scanCollapsibleSites, rocketstyleCollapseKey } = await import(
      '@pyreon/compiler'
    )
    const src = `
import { Button } from '@pyreon/ui-components'
export const Save = () => <Button state="primary" size="medium">Save</Button>`

    // 1. plugin scan finds the site (same key the compiler will look up)
    const sites = scanCollapsibleSites(src, 'Save.tsx', new Set(['@pyreon/ui-components']))
    expect(sites).toHaveLength(1)
    const site = sites[0]!
    expect(site.key).toBe(
      rocketstyleCollapseKey(site.componentName, site.props, site.childrenText),
    )

    // 2. resolver SSR-renders the REAL component (light + dark)
    const resolved = await resolver.resolve({
      component: { name: site.importedName, source: site.source },
      props: site.props,
      childrenText: site.childrenText,
      config: DEFAULT_COLLAPSE_CONFIG,
    })
    expect(resolved).not.toBeNull()
    if (!resolved) return

    // 3. compiler emits the collapse from the resolver's real data
    const { code } = transformJSX(src, 'Save.tsx', {
      collapseRocketstyle: {
        candidates: new Set([site.componentName]),
        sites: new Map([
          [
            site.key,
            {
              templateHtml: resolved.templateHtml,
              lightClass: resolved.lightClass,
              darkClass: resolved.darkClass,
              rules: resolved.rules,
              ruleKey: resolved.key,
            },
          ],
        ]),
        mode: { name: 'useMode', source: '@pyreon/ui-core' },
      },
    })

    // The collapsed call carries the REAL resolved class strings + the
    // real class-stripped template — byte-for-byte, no reimplementation.
    expect(code).toContain(`${JSON.stringify(resolved.templateHtml)}`)
    expect(code).toContain(`${JSON.stringify(resolved.lightClass)}`)
    expect(code).toContain(`${JSON.stringify(resolved.darkClass)}`)
    expect(code).toContain('__rsCollapse(')
    expect(code).toContain('() => __pyrMode() === "dark"')
    // once-per-module idempotent rule injection with the resolver's rules
    expect(code).toContain('__rsSheet.injectRules(')
    expect(code).toContain(JSON.stringify(resolved.rules))
    // the 5-layer <Button> wrapper mount is gone from the client graph
    expect(code).not.toContain('<Button')
  }, 60_000)
})

// Layer 5: drive the collapse path through the REAL `pyreon()` plugin
// hooks (config → transform → closeBundle), exercising the lazy resolver
// init + the transform-hook collapse branch + dispose end-to-end. This is
// the only test that runs `createCollapseResolver` *through the plugin*
// rather than directly — closes the index.ts collapse-wiring coverage gap.
describe('pyreon({ collapse }) plugin — transform hook drives the collapse', () => {
  type Ctx = {
    warn: (msg: string) => void
    resolve: (id: string, importer?: string, opts?: { skipSelf: boolean }) => Promise<null>
  }
  const ctx: Ctx = { warn: () => {}, resolve: async () => null }
  const ID = join(UI_SHOWCASE, 'src', 'CollapseProbe.tsx')
  const SRC = `
import { Button } from '@pyreon/ui-components'
export const Save = () => <Button state="primary" size="medium">Save</Button>`

  type Plugin = ReturnType<typeof pyreon>
  function configure(plugin: Plugin): void {
    ;(plugin.config as unknown as (u: Record<string, unknown>, e: { command: string }) => void)(
      { root: UI_SHOWCASE },
      { command: 'build' },
    )
  }
  async function transform(
    plugin: Plugin,
    code: string,
    id: string,
    ssr: boolean,
  ): Promise<{ code: string } | undefined> {
    const hook = plugin.transform as (
      this: Ctx,
      c: string,
      i: string,
      o?: { ssr?: boolean },
    ) => Promise<{ code: string } | undefined>
    return hook.call(ctx, code, id, { ssr })
  }

  it('collapse:true → transform emits __rsCollapse for a literal-prop Button (client graph)', async () => {
    const plugin = pyreon({ collapse: true })
    configure(plugin)
    const out = await transform(plugin, SRC, ID, false)
    expect(out?.code).toContain('__rsCollapse(')
    expect(out?.code).toContain('__rsSheet.injectRules(')
    expect(out?.code).not.toContain('<Button')
    // SSR graph keeps the real mount (no collapse) — the !isSsr guard
    const ssrOut = await transform(plugin, SRC, ID, true)
    expect(ssrOut?.code).not.toContain('__rsCollapse(')
    // dispose the one programmatic Vite SSR server the resolver holds
    await (plugin.closeBundle as unknown as () => Promise<void>)()
  }, 90_000)

  it('collapse component filter excluding the component → no collapse (cheap, no resolver boot)', async () => {
    const plugin = pyreon({ collapse: { components: ['NotARealComponent'] } })
    configure(plugin)
    const out = await transform(plugin, SRC, ID, false)
    expect(out?.code).not.toContain('__rsCollapse(')
    // closeBundle is a no-op when the resolver was never created
    await (plugin.closeBundle as unknown as () => Promise<void>)()
  }, 30_000)

  it('collapse:true but no collapsible site in the file → resolver not booted', async () => {
    const plugin = pyreon({ collapse: true })
    configure(plugin)
    const plain = `export const X = () => <div class="x">hi</div>`
    const out = await transform(plugin, plain, ID, false)
    expect(out?.code).not.toContain('__rsCollapse(')
    await (plugin.closeBundle as unknown as () => Promise<void>)()
  }, 30_000)
})

// Layer 5: drive the WHOLE collapse path through the real `pyreon()`
// plugin — `config` (projectRoot) → `transform` (scan → lazy
// `ensureCollapseResolver` → real Vite-SSR resolve → thread
// `collapseRocketstyle` into the compiler) → `closeBundle` (dispose the
// one programmatic SSR server). This is the only test that exercises
// the plugin's transform-hook collapse wiring + lifecycle end to end.
describe('pyreon({ collapse }) — plugin transform/closeBundle wiring', () => {
  const COLLAPSIBLE = `
import { Button } from '@pyreon/ui-components'
export const Save = () => <Button state="primary" size="medium">Save</Button>`
  const PLAIN = `export const Hi = () => <div class="x">hi</div>`
  const ID = join(UI_SHOWCASE, 'src', 'Save.tsx')

  // Minimal Rollup/Vite transform-hook context. `resolve` returns null
  // (no cross-module signal resolution needed for these specs); `warn`
  // collects compiler/plugin warnings without failing the run.
  function ctx() {
    return { warn: () => {}, resolve: async () => null }
  }
  function callConfig(p: ReturnType<typeof pyreon>, root: string) {
    ;(p.config as unknown as (u: unknown, e: unknown) => unknown)(
      { root },
      { command: 'build' },
    )
  }
  function callTransform(
    p: ReturnType<typeof pyreon>,
    code: string,
    id: string,
    ssr: boolean,
  ) {
    return (
      p.transform as unknown as (
        this: unknown,
        c: string,
        i: string,
        o: { ssr: boolean },
      ) => Promise<{ code: string } | undefined>
    ).call(ctx(), code, id, { ssr })
  }

  it('collapse:true — transform emits __rsCollapse for a literal-prop site (client graph), bails on the SSR graph, and closeBundle disposes the resolver', async () => {
    const plugin = pyreon({ collapse: true })
    callConfig(plugin, UI_SHOWCASE)

    // CLIENT graph (ssr:false) → real resolver spins up, site collapses.
    const client = await callTransform(plugin, COLLAPSIBLE, ID, false)
    expect(client?.code).toContain('__rsCollapse(')
    expect(client?.code).toContain('__rsSheet.injectRules(')
    expect(client?.code).not.toContain('<Button')

    // SSR graph (ssr:true) → never collapse (renderToString needs the
    // real VNode tree; the resolver itself SSR-renders).
    const ssr = await callTransform(plugin, COLLAPSIBLE, ID, true)
    expect(ssr?.code ?? '').not.toContain('__rsCollapse(')

    // A file with no collapsible site → scan is empty, resolver path
    // is skipped entirely (no second SSR boot).
    const plain = await callTransform(plugin, PLAIN, ID, false)
    expect(plain?.code ?? '').not.toContain('__rsCollapse(')

    // Lifecycle: closeBundle tears down the one programmatic SSR server.
    await (plugin.closeBundle as unknown as () => Promise<void>).call({})
    // Idempotent — second close is a no-op (resolver already null).
    await (plugin.closeBundle as unknown as () => Promise<void>).call({})
  }, 90_000)

  it('collapse.components filter — a non-matching component name bails before the resolver ever boots', async () => {
    // No SSR server is created: the scanned site is filtered out by the
    // component allow-list before `ensureCollapseResolver()` is reached.
    const plugin = pyreon({ collapse: { components: ['NotARealComponent'] } })
    callConfig(plugin, UI_SHOWCASE)
    const out = await callTransform(plugin, COLLAPSIBLE, ID, false)
    expect(out?.code ?? '').not.toContain('__rsCollapse(')
    // closeBundle with no resolver created → the `if (collapseResolver)`
    // guard is false (cheap path, no dispose).
    await (plugin.closeBundle as unknown as () => Promise<void>).call({})
  }, 30_000)

  it('collapse off (default) — transform never touches the collapse path', async () => {
    const plugin = pyreon()
    callConfig(plugin, UI_SHOWCASE)
    const out = await callTransform(plugin, COLLAPSIBLE, ID, false)
    expect(out?.code ?? '').not.toContain('__rsCollapse(')
    await (plugin.closeBundle as unknown as () => Promise<void>).call({})
  }, 30_000)
})
