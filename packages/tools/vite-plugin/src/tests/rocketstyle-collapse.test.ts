import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
