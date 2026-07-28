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
  reactivity: [],
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
