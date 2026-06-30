/**
 * Directive-island plugin wiring (`pyreon({ directiveIslands: true })`).
 *
 * Exercises the end-to-end plugin path for `<Comp hydrate="…">`:
 *   1. buildStart prescan → the lowered island appears in
 *      `virtual:pyreon/islands-registry` (for hydrateIslandsAuto / static apps)
 *   2. transform → the source is rewritten to a self-hydrating `island()`
 *      wrapper (for zero apps) and the `hydrate=` attribute is gone
 *   3. off by default — no rewrite, no registry entry
 *
 * Mirrors the islands-registry.test.ts harness.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'

let root: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-directive-islands-'))
})
afterAll(() => rmSync(root, { recursive: true, force: true }))
beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
})

function writeFile(rel: string, contents: string): string {
  const full = join(root, rel)
  mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true })
  writeFileSync(full, contents)
  return full
}

function bootstrap(opts?: PyreonPluginOptions) {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as (c: unknown, e: unknown) => unknown)({ root }, { command: 'build' })
  return plugin
}
async function runBuildStart(plugin: ReturnType<typeof pyreonPlugin>) {
  await (plugin.buildStart as (this: unknown) => Promise<void>).call({})
}
function runLoad(plugin: ReturnType<typeof pyreonPlugin>, id: string): string {
  const r = (plugin.load as (id: string) => string | undefined)(id)
  if (typeof r !== 'string') throw new Error(`load('${id}') returned ${typeof r}`)
  return r
}
async function runTransform(
  plugin: ReturnType<typeof pyreonPlugin>,
  code: string,
  id: string,
): Promise<{ code: string; warnings: string[] }> {
  const warnings: string[] = []
  const ctx = { warn: (m: string) => warnings.push(m) }
  const result = await (
    plugin.transform as (this: unknown, c: string, i: string, o: unknown) => unknown
  ).call(ctx, code, id, {})
  const out = typeof result === 'string' ? result : ((result as { code?: string })?.code ?? code)
  return { code: out, warnings }
}

const REGISTRY_ID = '\0pyreon/islands-registry'

describe('vite-plugin — directive islands (hydrate="…")', () => {
  it('prescan registers the lowered island in the virtual registry', async () => {
    writeFile('src/components/Counter.tsx', `export default function Counter() { return null }`)
    writeFile(
      'src/Page.tsx',
      `import Counter from './components/Counter'
export const Page = () => <Counter hydrate="visible" />`,
    )
    const plugin = bootstrap({ directiveIslands: true })
    await runBuildStart(plugin)
    const source = runLoad(plugin, REGISTRY_ID)
    // file-derived, unique-by-construction name
    expect(source).toContain('Page_Counter_visible')
    // loader path resolved relative to the directive site
    expect(source).toContain('/components/Counter')
  })

  it('transform rewrites <Comp hydrate="…"> to a self-hydrating island() wrapper', async () => {
    const id = join(root, 'src/Page.tsx')
    const { code } = await runTransform(
      bootstrap({ directiveIslands: true }),
      `import Counter from './components/Counter'
export const Page = () => <Counter hydrate="visible" start={1} />`,
      id,
    )
    expect(code).toContain('import { island as __pyIsland } from "@pyreon/server/client"')
    expect(code).toContain('__pyIsland(')
    expect(code).toContain('import("./components/Counter")')
    expect(code).toContain('hydrate: "visible"')
    // the directive attribute is gone (lowered, not passed as a prop)
    expect(code).not.toContain('hydrate="visible"')
  })

  it('two strategies on one component → two registry entries', async () => {
    writeFile('src/c.tsx', `export default () => null`)
    writeFile(
      'src/Multi.tsx',
      `import Counter from './c'
export const P = () => (<div><Counter hydrate="visible" /><Counter hydrate="idle" /></div>)`,
    )
    const plugin = bootstrap({ directiveIslands: true })
    await runBuildStart(plugin)
    const source = runLoad(plugin, REGISTRY_ID)
    expect(source).toContain('Multi_Counter_visible')
    expect(source).toContain('Multi_Counter_idle')
  })

  it('OFF by default — no rewrite, no registry entry when directiveIslands is unset', async () => {
    writeFile('src/c.tsx', `export default () => null`)
    writeFile('src/Off.tsx', `import C from './c'\nexport const P = () => <C hydrate="visible" />`)
    const plugin = bootstrap() // directiveIslands not set
    await runBuildStart(plugin)
    const source = runLoad(plugin, REGISTRY_ID)
    expect(source).not.toContain('Off_C_visible')

    const { code } = await runTransform(
      bootstrap(),
      `import C from './c'\nexport const P = () => <C hydrate="visible" />`,
      join(root, 'src/Off.tsx'),
    )
    expect(code).not.toContain('__pyIsland')
  })

  it('never-strategy directive island is omitted from the registry (zero-JS contract)', async () => {
    writeFile('src/c.tsx', `export default () => null`)
    writeFile('src/Never.tsx', `import C from './c'\nexport const P = () => <C hydrate="never" />`)
    const plugin = bootstrap({ directiveIslands: true })
    await runBuildStart(plugin)
    const source = runLoad(plugin, REGISTRY_ID)
    // never-strategy islands are intentionally not registered (no client loader)
    expect(source).not.toContain('Never_C_never')
  })
})
