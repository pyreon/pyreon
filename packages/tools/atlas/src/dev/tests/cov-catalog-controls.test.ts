/**
 * The catalog module's control mapping and scenario verdicts.
 *
 * Two shapes here decide what the workbench SHOWS rather than whether it
 * works, which is why neither fails loudly when it is wrong:
 *
 *   * **A control's type and its default.** Get the type wrong and a colour
 *     prop edits as free text; get the default wrong and the canvas renders a
 *     component in a state the author never chose. `required` rides along
 *     because "which props are required" is half the contract the docs table
 *     documents — and it is what `atlas check` validates against.
 *   * **A scenario's verdict.** Three states on purpose: `unverified` is NOT
 *     a pass, and rendering it as one would be exactly the false-green the
 *     verify model exists to prevent.
 */
import { describe, expect, it } from 'vitest'
import { generateCatalogModule, groupFor, toWorkbenchControl } from '../catalog-module'

/** A discovered-component record shaped like the scan's output. */
const comp = (over: Record<string, unknown> = {}) =>
  ({
    key: 'Button',
    name: 'Button',
    group: 'Inputs',
    controls: [],
    scenarios: [],
    source: '/p/src/Button.tsx',
    ...over,
  }) as never

const entry = (over: Record<string, unknown> = {}) =>
  ({ component: comp(over), file: '/p/src/Button.tsx' }) as never

describe('mapping a discovered prop to a control', () => {
  it('edits a number as a number, defaulting to 0', () => {
    expect(toWorkbenchControl({ name: 'count', kind: 'number' } as never)).toEqual({
      key: 'count',
      label: 'Count',
      type: 'number',
      default: 0,
    })
    // A declared default is kept — including `0`, which a `||` would have
    // thrown away for the same 0 it looks like.
    expect(toWorkbenchControl({ name: 'gap', kind: 'number', defaultValue: 4 } as never)).toMatchObject({
      type: 'number',
      default: 4,
    })
  })

  it('edits a colour as a colour, with a visible default', () => {
    // A blank default in a colour picker renders as black, which reads as a
    // deliberate choice the author did not make.
    expect(toWorkbenchControl({ name: 'tint', kind: 'color' } as never)).toEqual({
      key: 'tint',
      label: 'Tint',
      type: 'color',
      default: '#3b82f6',
    })
    expect(
      toWorkbenchControl({ name: 'tint', kind: 'color', defaultValue: '#ff0000' } as never),
    ).toMatchObject({ default: '#ff0000' })
  })

  it('carries `required` through every control type, and omits it otherwise', () => {
    const kinds = [
      { name: 'on', kind: 'boolean' },
      { name: 'size', kind: 'select', options: ['sm', 'lg'] },
      { name: 'count', kind: 'number' },
      { name: 'tint', kind: 'color' },
      { name: 'label', kind: 'text' },
    ] as const
    for (const kind of kinds) {
      expect(toWorkbenchControl({ ...kind, required: true } as never), kind.name).toMatchObject({
        required: true,
      })
      // The pair: absent, not `false` — the docs table renders presence.
      expect(toWorkbenchControl({ ...kind } as never), kind.name).not.toHaveProperty('required')
    }
  })
})

describe('the group a component is filed under', () => {
  it('uses the path as given when it is not under the scan root', () => {
    // A component discovered through an alias or a second project root does
    // not share the scan root's prefix; slicing blindly would eat its first
    // directories and file it under the wrong group.
    expect(groupFor('/elsewhere/lib/forms/Button.tsx', '/p/src')).toBe('Elsewhere/Lib/Forms')
  })
})

describe('the verdict a scenario is published with', () => {
  const generate = (verify: unknown): string =>
    generateCatalogModule([entry({ scenarios: [{ id: 's1', name: 'Default', args: {}, verify }] })], {
      root: '/p/src',
    })

  it('publishes ok, fail and unverified as three different things', () => {
    expect(generate({ ok: true, checked: 3 })).toContain('"verdict":"ok"')
    expect(generate({ ok: false, checked: 3 })).toContain('"verdict":"fail"')
    // Checked NOTHING is not a failure and is emphatically not a pass.
    expect(generate({ ok: false, checked: 0 })).toContain('"verdict":"unverified"')
    // No verify record at all — the same honest answer.
    expect(generate(undefined)).toContain('"verdict":"unverified"')
  })
})
