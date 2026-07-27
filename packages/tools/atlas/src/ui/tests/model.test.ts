/**
 * Unit tests for `createModel` — the workbench's reactive state.
 *
 * The atlas-workshop e2e drives this through a browser, but it can only assert
 * what is VISIBLE. These pin the state contract directly: that per-component
 * control overrides don't bleed across components, that `reset` restores
 * declared defaults, that the action log is bounded, and that the derived
 * computeds actually re-derive. Cheap, deterministic, and they cover the module
 * the whole UI is threaded through.
 */
import { describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel } from '../model'

const comp = (
  id: string,
  group: string,
  controls: WorkbenchComponent['controls'] = [],
): WorkbenchComponent => ({
  id,
  name: id,
  group,
  controls,
  render: (props) => `${id}:${String(props.label ?? '')}`,
})

const CATALOG: WorkbenchCatalog = {
  components: [
    comp('button', 'Inputs', [
      { key: 'label', label: 'Label', type: 'text', default: 'Click me' },
      { key: 'state', label: 'State', type: 'enum', options: ['primary', 'error'], default: 'primary' },
    ]),
    comp('badge', 'Data Display', [{ key: 'label', label: 'Label', type: 'text', default: 'New' }]),
  ],
}

const model = () => createModel(CATALOG, { title: 't', subtitle: 's' })

describe('createModel — initial state', () => {
  it('selects the first component and derives groups/total', () => {
    const m = model()
    expect(m.selId()).toBe('button')
    expect(m.sel()?.id).toBe('button')
    expect(m.total).toBe(2)
    expect(m.groups.map((g) => g.group)).toEqual(['Inputs', 'Data Display'])
  })

  it('applies title/subtitle defaults when omitted', () => {
    const m = createModel(CATALOG, {})
    expect(m.title).toBe('atlas')
    expect(m.subtitle).toBe('')
  })

  it('does not crash on an EMPTY catalog (selId falls back to "")', () => {
    const m = createModel({ components: [] }, {})
    expect(m.selId()).toBe('')
    expect(m.sel()).toBeUndefined()
    expect(m.vals()).toEqual({})
    expect(m.preview()).toBeNull()
  })
})

describe('createModel — control values', () => {
  it('starts from declared defaults', () => {
    expect(model().vals()).toEqual({ label: 'Click me', state: 'primary' })
  })

  it('setValue overrides one key and LEAVES the other defaults intact', () => {
    const m = model()
    m.setValue('button', 'label', 'Saved')
    expect(m.vals()).toEqual({ label: 'Saved', state: 'primary' })
  })

  it('keeps overrides PER COMPONENT — switching selection does not leak', () => {
    const m = model()
    m.setValue('button', 'label', 'Saved')
    m.selId.set('badge')
    // badge must show ITS default, not button's override
    expect(m.vals()).toEqual({ label: 'New' })
    m.selId.set('button')
    expect(m.vals()).toEqual({ label: 'Saved', state: 'primary' })
  })

  it('reset restores the selected component defaults only', () => {
    const m = model()
    m.setValue('button', 'label', 'Saved')
    m.setValue('badge', 'label', 'Alsoedited')
    m.reset() // selection is `button`
    expect(m.vals()).toEqual({ label: 'Click me', state: 'primary' })
    m.selId.set('badge')
    expect(m.vals()).toEqual({ label: 'Alsoedited' })
  })

  it('preview re-renders from the CURRENT values', () => {
    const m = model()
    expect(m.preview()).toBe('button:Click me')
    m.setValue('button', 'label', 'Saved')
    expect(m.preview()).toBe('button:Saved')
  })
})

describe('createModel — theme', () => {
  it('re-derives tokens when brand or mode flips', () => {
    const m = model()
    const darkBg = m.theme().bg
    m.dark.set(false)
    expect(m.theme().bg).not.toBe(darkBg)

    const emberAccent = m.theme().accent
    m.brandId.set('forest')
    expect(m.brand().id).toBe('forest')
    expect(m.theme().accent).not.toBe(emberAccent)
  })

  it('falls back to the first brand for an unknown id', () => {
    const m = model()
    m.brandId.set('does-not-exist')
    expect(m.brand().id).toBe('ember')
  })
})

describe('createModel — search + visible groups', () => {
  it('shows every group when the query is blank', () => {
    const m = model()
    expect(m.visibleGroups().map((g) => g.group)).toEqual(['Inputs', 'Data Display'])
    expect(m.noResults()).toBe(false)
  })

  it('filters groups down and drops emptied ones', () => {
    const m = model()
    m.query.set('badge')
    expect(m.visibleGroups().map((g) => g.group)).toEqual(['Data Display'])
    expect(m.noResults()).toBe(false)
  })

  it('flags noResults for a query matching nothing', () => {
    const m = model()
    m.query.set('zzzz-nope')
    expect(m.visibleGroups()).toEqual([])
    expect(m.noResults()).toBe(true)
  })
})

describe('createModel — action log', () => {
  it('prepends entries with increasing ids', () => {
    const m = model()
    m.logAction('click', 'first')
    m.logAction('click', 'second')
    expect(m.actions().map((a) => a.detail)).toEqual(['second', 'first'])
    expect(m.actions()[0]!.id).toBeGreaterThan(m.actions()[1]!.id)
  })

  it('is BOUNDED at 24 entries (an unbounded log would grow forever)', () => {
    const m = model()
    for (let i = 0; i < 40; i += 1) m.logAction('e', `#${i}`)
    expect(m.actions()).toHaveLength(24)
    expect(m.actions()[0]!.detail).toBe('#39') // newest kept
    expect(m.actions().at(-1)!.detail).toBe('#16') // oldest trimmed
  })

  it('clearActions empties the log', () => {
    const m = model()
    m.logAction('e', 'x')
    m.clearActions()
    expect(m.actions()).toEqual([])
  })
})

describe('createModel — a11y report', () => {
  it('passes when a name control is filled', () => {
    const r = model().a11y()
    expect(r.fails).toBe(0)
    expect(r.checks[0]!.status).toBe('ok')
    expect(r.passes).toBe(r.checks.length - r.fails - r.warns)
  })

  it('FAILS when the accessible-name control is emptied', () => {
    const m = model()
    m.setValue('button', 'label', '')
    const r = m.a11y()
    expect(r.fails).toBe(1)
    expect(r.checks[0]!.title).toMatch(/Missing accessible name/)
  })

  it('warns when an error state is styled but not programmatic', () => {
    const m = model()
    m.setValue('button', 'state', 'error')
    expect(m.a11y().warns).toBe(1)
  })

  it('treats a component with no name control as self-labelled', () => {
    const m = createModel({ components: [comp('plain', 'g')] }, {})
    expect(m.a11y().fails).toBe(0)
  })
})

describe('createModel — search focus ref', () => {
  it('focusSearch is a no-op until a ref is attached, then focuses it', () => {
    const m = model()
    expect(() => m.focusSearch()).not.toThrow()

    let focused = 0
    m.searchRef({ focus: () => { focused += 1 } } as unknown as HTMLInputElement)
    m.focusSearch()
    expect(focused).toBe(1)

    m.searchRef(null) // detached on unmount
    expect(() => m.focusSearch()).not.toThrow()
    expect(focused).toBe(1)
  })
})

describe('createModel — canvas addons', () => {
  it('defaults to the non-intrusive state (fluid, theme bg, no pseudo, no outline)', () => {
    const m = model()
    expect(m.viewport()).toBe('full')
    expect(m.background()).toBe('theme')
    expect(m.pseudo()).toBeNull()
    expect(m.outline()).toBe(false)
  })

  it('threads the forced pseudo state into the render ctx', () => {
    const m = model()
    let seen: Record<string, boolean> | undefined
    const cat: WorkbenchCatalog = {
      components: [
        {
          ...comp('probe', 'g'),
          render: (_p, ctx) => {
            seen = ctx.pseudo
            return 'x'
          },
        },
      ],
    }
    const mm = createModel(cat, {})
    mm.preview()
    expect(seen).toEqual({})

    mm.pseudo.set('hover')
    mm.preview()
    expect(seen).toEqual({ hover: true })

    mm.pseudo.set(null)
    mm.preview()
    expect(seen).toEqual({})
    expect(m.pseudo()).toBeNull() // independent instances
  })

  it('exposes ctx.pseudo as a live getter (not a value captured at setup)', () => {
    // If it were captured, flipping the addon would leave the preview showing
    // the state it had when the model was built.
    let ctxRef: { pseudo: Record<string, boolean> } | undefined
    const cat: WorkbenchCatalog = {
      components: [
        { ...comp('probe', 'g'), render: (_p, ctx) => { ctxRef = ctx; return 'x' } },
      ],
    }
    const mm = createModel(cat, {})
    mm.preview()
    expect(ctxRef!.pseudo).toEqual({})
    mm.pseudo.set('focus')
    // same ctx object, re-read → reflects the new state
    expect(ctxRef!.pseudo).toEqual({ focus: true })
  })
})
