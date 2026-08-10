/**
 * The derived catalog module.
 *
 * This is Atlas's thesis made executable — the catalog is DERIVED from source
 * rather than authored as stories — so the failure modes worth testing are the
 * ones that would silently drop or corrupt an entry.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence } from '../../core'
import {
  generateCatalogModule,
  groupFor,
  isEditableControl,
  slugify,
  toWorkbenchControl,
  uniqueIds,
} from '../catalog-module'

const ci = (over: Partial<ComponentIntelligence> = {}): ComponentIntelligence => ({
  name: 'Button',
  controls: [],
  axes: [],
  scenarios: [],
  tags: [],
  ...over,
})

describe('ids', () => {
  it('slugifies a PascalCase name for the URL and the DOM', () => {
    expect(slugify('DangerZone')).toBe('danger-zone')
    expect(slugify('Button')).toBe('button')
  })

  it('never yields an empty id', () => {
    expect(slugify('***')).toBe('component')
  })

  it('SUFFIXES a collision rather than dropping one entry', () => {
    // Two components legitimately share a name across directories. Last-one-wins
    // would silently hide one — the exact failure this tool exists to prevent.
    expect(uniqueIds(['Button', 'Button', 'Badge'])).toEqual(['button', 'button-2', 'badge'])
  })
})

describe('grouping', () => {
  it('files a component under its directory', () => {
    expect(groupFor('/p/src/forms/Button.tsx', '/p/src')).toBe('Forms')
  })

  it('falls back to a single group at the scan root', () => {
    expect(groupFor('/p/src/Button.tsx', '/p/src')).toBe('Components')
  })
})

describe('controls', () => {
  it('maps a union to an enum carrying its real options', () => {
    const control = toWorkbenchControl({
      name: 'variant',
      kind: 'select',
      options: ['solid', 'soft'],
      reactive: false,
      required: false,
    })
    expect(control).toMatchObject({ type: 'enum', options: ['solid', 'soft'], default: 'solid' })
  })

  it('derives a readable label from a camelCase prop', () => {
    const control = toWorkbenchControl({
      name: 'isDisabled',
      kind: 'boolean',
      reactive: false,
      required: false,
    })
    expect(control.label).toBe('Is Disabled')
    expect(control.type).toBe('bool')
  })

  it('does NOT offer a reactive prop as an editable control', () => {
    // This test previously asserted the opposite, and that was wrong. A
    // `reactive` prop is a function the component CALLS; emitting it as a text
    // control hands the component `''`, and the runtime warns
    // `Event handler "onClick" received a non-function value (string)` on every
    // render. Observed for real against the derived catalog.
    //
    // The prop is not lost — it stays in the component's `ComponentIntelligence`,
    // so the catalog JSON and the agent guide still report the full signature.
    expect(
      isEditableControl({ name: 'onClick', kind: 'reactive', reactive: true, required: false }),
    ).toBe(false)
    expect(
      isEditableControl({ name: 'label', kind: 'text', reactive: false, required: false }),
    ).toBe(true)
  })

  it('leaves reactive props out of the emitted entry', () => {
    const code = generateCatalogModule(
      [
        {
          component: ci({
            controls: [
              { name: 'label', kind: 'text', reactive: false, required: true },
              { name: 'onClick', kind: 'reactive', reactive: true, required: false },
            ],
          }),
          file: '/p/src/Button.tsx',
        },
      ],
      { root: '/p/src' },
    )
    expect(code).toContain('"key":"label"')
    expect(code).not.toContain('"key":"onClick"')
  })
})

describe('the emitted module', () => {
  it('produces a VALID empty module for a project with no components', () => {
    // A wrong `--dir` or a fresh repo is a real state. It must boot and say so,
    // not fail at import time.
    const code = generateCatalogModule([], { root: '/p/src' })
    expect(code).toContain('components: []')
    expect(code).not.toContain('undefined')
  })

  it('imports each component from its own file', () => {
    const code = generateCatalogModule(
      [{ component: ci({ name: 'Button' }), file: '/p/src/Button.tsx' }],
      { root: '/p/src' },
    )
    expect(code).toContain('import * as __mod0 from "/p/src/Button.tsx"')
    expect(code).toContain('id: "button"')
    expect(code).toContain('name: "Button"')
  })

  it('escapes a path so a quote or backslash cannot break the module', () => {
    const code = generateCatalogModule([{ component: ci(), file: 'C:\\p\\src\\Button.tsx' }], {
      root: 'C:\\p\\src',
    })
    expect(code).toContain(String.raw`"C:\\p\\src\\Button.tsx"`)
  })

  it('GUARDS each render, so one broken export cannot blank the workbench', () => {
    // An empty canvas reads as "this component renders nothing", which is a
    // different and far more confusing bug than "this component failed to load".
    const code = generateCatalogModule(
      [{ component: ci({ name: 'Button' }), file: '/p/src/Button.tsx' }],
      { root: '/p/src' },
    )
    expect(code).toContain("typeof Comp !== 'function'")
    expect(code).toContain('data-atlas-error')
  })

  it('falls back to the default export when the named one is absent', () => {
    const code = generateCatalogModule(
      [{ component: ci({ name: 'Button' }), file: '/p/src/Button.tsx' }],
      { root: '/p/src' },
    )
    expect(code).toContain('__mod0["Button"] ?? __mod0.default')
  })

  it('carries controls through to the entry', () => {
    const code = generateCatalogModule(
      [
        {
          component: ci({
            controls: [{ name: 'label', kind: 'text', reactive: false, required: true }],
          }),
          file: '/p/src/Button.tsx',
        },
      ],
      { root: '/p/src' },
    )
    expect(code).toContain('"key":"label"')
  })
})

describe('the project wrapper (atlas.config.ts)', () => {
  const entry = () => ({ component: ci({}), file: '/p/src/Button.tsx' })

  it('imports the config in the BROWSER and wraps every render', () => {
    const code = generateCatalogModule([entry()], {
      root: '/p/src',
      configPath: '/p/atlas.config.tsx',
    })
    expect(code).toContain('import * as __config from "/p/atlas.config.tsx"')
    // Named export wins over default.wrapper — the same resolution
    // `loadAtlasConfig` applies on the Node side.
    expect(code).toContain('typeof __config.wrapper === "function"')
    // The default's fields now resolve through `__section`, which also handles
    // `pyreon.config.ts` nesting them under `atlas`. Same invariant — a named
    // export wins over the default's — expressed once for both file shapes.
    expect(code).toContain('__config.atlas ?? __default.atlas ?? __default')
    expect(code).toContain('typeof __section.wrapper === "function"')
    // Wrapping is COMPOSED now rather than a single function, so that every
    // extension contributes instead of the last one winning.
    expect(code).toContain('__wrapAll(__el)')
    expect(code).toContain('__layers.reduceRight')
    // The recording permissions provider goes INNERMOST: a project wrapper
    // commonly carries its own static PermissionsProvider, and nearest-wins
    // context would let it shadow the workbench's RECORDING instance — the
    // Roles panel would silently audit nothing.
    expect(code).toContain("import { PermissionsProvider as __Perms } from '@pyreon/permissions'")
    expect(code).toContain('h(__Perms, { value: ctx.can }, h(Comp, merged))')
  })

  it('emits NO config import when no wrapper exists', () => {
    // A wrapper-less config must not be dragged into the browser bundle — it
    // buys nothing and can carry node-only code.
    const code = generateCatalogModule([entry()], { root: '/p/src' })
    expect(code).not.toContain('__config')
    expect(code).not.toContain('__wrapper')
    expect(code).toContain('return h(Comp, merged)')
  })
})

describe('the render ctx (derived catalogs are NOT ctx-blind)', () => {
  it('injects a logging handler for every discovered reactive prop', () => {
    const code = generateCatalogModule(
      [
        {
          component: ci({
            controls: [
              { name: 'label', kind: 'text', reactive: false, required: true },
              { name: 'onClick', kind: 'reactive', reactive: true, required: false },
              { name: 'onHover', kind: 'reactive', reactive: true, required: false },
            ],
          }),
          file: '/p/src/Button.tsx',
        },
      ],
      { root: '/p/src' },
    )
    expect(code).toContain('render: (props, ctx) =>')
    expect(code).toContain('["onClick","onHover"]')
    expect(code).toContain('ctx.logAction(name,')
    // An authored function value still runs AFTER the log — observation must
    // never swallow behaviour.
    expect(code).toContain("if (typeof user === 'function') user(...args)")
  })

  it('spreads ctx.pseudo gated on IS_ROCKETSTYLE (runtime truth, never guessed)', () => {
    const code = generateCatalogModule([{ component: ci({}), file: '/p/src/X.tsx' }], {
      root: '/p/src',
    })
    expect(code).toContain('if (Comp.IS_ROCKETSTYLE) Object.assign(merged, ctx.pseudo)')
  })

  it('emits no injection loop when nothing is reactive', () => {
    const code = generateCatalogModule([{ component: ci({}), file: '/p/src/X.tsx' }], {
      root: '/p/src',
    })
    expect(code).not.toContain('logAction')
  })
})

describe('importsAtlas (the workbench-host filter)', () => {
  it('matches real import forms, including subpaths', async () => {
    const { importsAtlas } = await import('../server')
    expect(importsAtlas(`import { el } from '@pyreon/atlas/ui'`)).toBe(true)
    expect(importsAtlas(`import '@pyreon/atlas'`)).toBe(true)
    expect(importsAtlas(`export { x } from "@pyreon/atlas/core"`)).toBe(true)
    expect(importsAtlas(`const m = await import('@pyreon/atlas/ui')`)).toBe(true)
    expect(importsAtlas(`const m = require('@pyreon/atlas')`)).toBe(true)
  })

  it('does NOT match prose — a comment mentioning the package is not a dependency', () => {
    // The first cut was `.includes('@pyreon/atlas')`: a fixture whose comment
    // said "this file must not import @pyreon/atlas" silently vanished from
    // the sidebar. Bisect this by reverting importsAtlas to the substring.
    return import('../server').then(({ importsAtlas }) => {
      expect(importsAtlas(`// no @pyreon/atlas import on purpose`)).toBe(false)
      expect(importsAtlas(`/* mentions @pyreon/atlas/ui in prose */ export const X = 1`)).toBe(false)
      expect(importsAtlas(`import { rocketstyle } from '@pyreon/rocketstyle'`)).toBe(false)
    })
  })
})

describe('derived scenarios reach the workbench catalog', () => {
  it('emits each scenario with its three-state verdict', () => {
    const verdict = (ok: boolean, checked: number) => ({
      ok,
      checked,
      a11y: { status: 'skip' as const },
      interaction: { status: 'skip' as const },
      reactivityCoverage: { status: 'skip' as const },
      leak: { status: 'skip' as const },
      snapshot: { status: 'skip' as const },
      ssrParity: { status: 'skip' as const },
    })
    const code = generateCatalogModule(
      [
        {
          component: ci({
            scenarios: [
              { id: 'b--ok', component: 'Button', name: 'Solid', args: { variant: 'solid' }, source: 'auto-variant', verify: verdict(true, 1) },
              { id: 'b--bad', component: 'Button', name: 'Empty', args: { label: '' }, source: 'auto-variant', verify: verdict(false, 1) },
              { id: 'b--unchecked', component: 'Button', name: 'Long', args: {}, source: 'auto-variant' },
            ],
          }),
          file: '/p/src/Button.tsx',
        },
      ],
      { root: '/p/src' },
    )
    expect(code).toContain('"id":"b--ok","name":"Solid","args":{"variant":"solid"},"verdict":"ok"')
    expect(code).toContain('"id":"b--bad","name":"Empty","args":{"label":""},"verdict":"fail"')
    // A verdict-less scenario is UNVERIFIED — not a pass. Rendering it as one
    // would be the false-green the three-state verify model exists to prevent.
    expect(code).toContain('"id":"b--unchecked","name":"Long","args":{},"verdict":"unverified"')
  })

  it('emits no scenarios key when the pipeline produced none', () => {
    const code = generateCatalogModule([{ component: ci({}), file: '/p/src/X.tsx' }], {
      root: '/p/src',
    })
    expect(code).not.toContain('scenarios:')
  })
})

describe('presets reach the generated catalog', () => {
  it('serializes atlas.config.ts presets verbatim onto the catalog object', () => {
    const code = generateCatalogModule([{ component: ci({}), file: '/p/src/X.tsx' }], {
      root: '/p/src',
      presets: { viewports: [{ id: 'kiosk', label: 'Kiosk', width: 900 }] },
    })
    expect(code).toContain('presets: {"viewports":[{"id":"kiosk","label":"Kiosk","width":900}]}')
  })

  it('emits no presets key when the config has none', () => {
    const code = generateCatalogModule([{ component: ci({}), file: '/p/src/X.tsx' }], { root: '/p/src' })
    expect(code).not.toContain('presets:')
  })
})
