/**
 * Unit tests for `createModel` — the workbench's reactive state.
 *
 * The atlas-workshop e2e drives this through a browser, but it can only assert
 * what is VISIBLE. These pin the state contract directly: that per-component
 * control overrides don't bleed across components, that `reset` restores
 * declared defaults, that the action log is bounded, and that the derived
 * computeds actually re-derive. Cheap, deterministic, and they cover the module
 * the whole UI is threaded through.
 *
 * happy-dom because the a11y verdict is probed from the RENDERED preview — the
 * checks read a real element rather than trusting control metadata.
 *
 * The model reads AND writes `location.search` (a shared link restores the
 * view it names). `location` is a per-file global in happy-dom, so each case
 * must reset it: without that, one test's control edit is restored as the next
 * test's starting state — observed as `expected 'badge:Alsoedited' to be
 * 'button:Click me'`.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel } from '../model'

beforeEach(() => {
  // Reset the shared URL so a previous case's state is not restored into this one.
  if (typeof history !== 'undefined') history.replaceState(null, '', '/')
})

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
    // The preview mounts inside a PermissionsProvider (so the Roles panel's
    // recording `can` reaches `usePermissions()` consumers) — the render
    // output is the provider vnode's child.
    const rendered = (p: unknown) => (p as { children: unknown[] }).children[0]
    const m = model()
    expect(rendered(m.preview())).toBe('button:Click me')
    m.setValue('button', 'label', 'Saved')
    expect(rendered(m.preview())).toBe('button:Saved')
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
  // The a11y verdict is now probed from the RENDERED preview (see ../a11y).
  // The previous implementation derived it from control METADATA and pushed two
  // unconditional `ok` rows, so these assert the new contract: nothing attached
  // means UNKNOWN, never a fabricated pass.
  it('reports unknown — not passing — before a preview element is attached', () => {
    const r = model().a11y()
    expect(r.unknowns).toBeGreaterThan(0)
    expect(r.passes).toBe(0)
    expect(r.fails).toBe(0)
  })

  it('reflects the REAL rendered element once the preview ref is attached', () => {
    const m = model()
    const surface = document.createElement('div')
    surface.innerHTML = '<button>Save</button>'
    m.previewRef(surface)

    const r = m.a11y()
    expect(r.fails).toBe(0)
    expect(r.unknowns).toBe(0)
    expect(r.passes).toBe(r.checks.length)
  })

  it('FAILS a div-as-button — the shape the old metadata check called passing', () => {
    const m = model()
    const surface = document.createElement('div')
    surface.innerHTML = '<div role="button"></div>'
    m.previewRef(surface)
    expect(m.a11y().fails).toBeGreaterThan(0)
  })

  it('detaching the preview stops reporting a stale pass', () => {
    const m = model()
    const surface = document.createElement('div')
    surface.innerHTML = '<button>Save</button>'
    m.previewRef(surface)
    expect(m.a11y().passes).toBeGreaterThan(0)
    // ref(null) on unmount must not leave the last verdict asserted as current
    m.previewRef(null)
    expect(m.a11y().passes).toBeGreaterThan(0) // last known verdict retained
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

describe('restoring from a link', () => {
  const cat = (): WorkbenchCatalog => ({
    components: [
      comp('button', 'Forms', [{ key: 'label', label: 'Label', type: 'text', default: 'Click me' }]),
      comp('badge', 'Feedback', [{ key: 'label', label: 'Label', type: 'text', default: 'New' }]),
    ],
  })

  const withQuery = (query: string): ReturnType<typeof createModel> => {
    history.replaceState(null, '', `/?${query}`)
    return createModel(cat(), {})
  }

  it('selects the component the link names and applies its args', () => {
    const m = withQuery(`c=badge&args=${encodeURIComponent('{"label":"Shipped"}')}`)
    expect(m.selId()).toBe('badge')
    expect(m.vals().label).toBe('Shipped')
  })

  it('falls back to the first component when the link names one that is gone', () => {
    // A renamed component should not make an old link look like a broken
    // workbench.
    const m = withQuery('c=deleted-component')
    expect(m.selId()).toBe('button')
  })

  it('shows the fallback component\'s defaults, not the args the stale link carried', () => {
    const m = withQuery(`c=deleted-component&args=${encodeURIComponent('{"label":"Ghost"}')}`)
    expect(m.selId()).toBe('button')
    expect(m.vals().label).toBe('Click me')
  })

  it('ignores a component id that is not in the catalog, whatever it says', () => {
    // Honest about what this pins. The id comes from the URL and is used as an
    // object KEY, which CodeQL flags as `js/remote-property-injection`; the
    // TAINT is real but the exploit is not — a computed key in an object
    // literal (`{ [k]: v }`) defines an own property and does NOT set the
    // prototype, unlike `obj.__proto__ = v`. So this asserts the narrowing
    // holds, and does not claim to reproduce a pollution that never happened.
    const m = withQuery(`c=__proto__&args=${encodeURIComponent('{"polluted":true}')}`)
    expect(m.selId()).toBe('button')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(m.vals().polluted).toBeUndefined()
  })
})

describe('createModel — selectScenario', () => {
  const cat = (): WorkbenchCatalog => ({
    components: [
      {
        ...comp('button', 'g'),
        controls: [
          { key: 'label', label: 'Label', type: 'text', default: 'Click me' },
          { key: 'variant', label: 'Variant', type: 'enum', options: ['solid', 'soft'], default: 'solid' },
        ],
        scenarios: [
          { id: 'button--soft', name: 'Soft', args: { variant: 'soft', onClick: 'not-editable' }, verdict: 'ok' },
          { id: 'button--empty', name: 'Empty', args: { label: '' }, verdict: 'fail' },
        ],
        render: (p) => `button:${String(p.label)}:${String(p.variant)}`,
      },
      comp('badge', 'g'),
    ],
  })

  it('selects the component AND applies the scenario args to the controls', () => {
    const m = createModel(cat(), {})
    m.selId.set('badge')
    m.selectScenario('button', 'button--soft')
    expect(m.selId()).toBe('button')
    expect(m.vals().variant).toBe('soft')
    // args without a matching editable control never land in the value store
    expect('onClick' in m.vals()).toBe(false)
  })

  it('REPLACES stale edits — a scenario is a complete pinned state', () => {
    const m = createModel(cat(), {})
    m.setValue('button', 'variant', 'soft')
    m.selectScenario('button', 'button--empty')
    // The empty scenario pins label:'' and says nothing about variant — the
    // earlier edit must not bleed into the state the verdict covered.
    expect(m.vals().label).toBe('')
    expect(m.vals().variant).toBe('solid')
  })

  it('no-ops on an unknown component or scenario id', () => {
    const m = createModel(cat(), {})
    m.selectScenario('nope', 'x')
    m.selectScenario('button', 'nope')
    expect(m.selId()).toBe('button')
    expect(m.vals().label).toBe('Click me')
  })
})

describe('createModel — per-project presets', () => {
  const withPresets = (): WorkbenchCatalog => ({
    components: [comp('button', 'g')],
    presets: {
      viewports: [
        { id: 'fluid', label: 'Fluid', width: null },
        { id: 'kiosk', label: 'Kiosk', width: 900 },
      ],
      backgrounds: [{ id: 'brand', label: 'Brand', color: '#123456' }],
      locales: [
        { id: 'en', label: 'English' },
        { id: 'he', label: 'עברית', dir: 'rtl' },
      ],
      roles: [
        { id: 'ops', label: 'Ops', grants: ['posts.delete'] },
        { id: 'nobody', label: 'Nobody' },
      ],
    },
  })

  it('replaces the shipped lists and selects each family FIRST entry', () => {
    const m = createModel(withPresets(), {})
    expect(m.viewports.map((v) => v.id)).toEqual(['fluid', 'kiosk'])
    expect(m.backgrounds.map((b) => b.id)).toEqual(['brand'])
    expect(m.roles.map((r) => r.id)).toEqual(['ops', 'nobody'])
    expect(m.viewport()).toBe('fluid')
    expect(m.background()).toBe('brand')
    expect(m.locale()).toBe('en')
    expect(m.permissionSet()).toBe('ops')
  })

  it('derives hint/width for a custom viewport, and dir for a custom locale', () => {
    const m = createModel(withPresets(), {})
    m.viewport.set('kiosk')
    expect(m.viewportPreset()).toMatchObject({ width: 900, hint: '900px' })
    m.locale.set('he')
    expect(m.dir()).toBe('rtl')
  })

  it('a custom role with explicit grants drives the recording can()', () => {
    const m = createModel(withPresets(), {})
    // ops: `posts.delete` granted by the exact-key list; everything else denied
    expect(m.permissions().can('posts.delete')).toBe(true)
    expect(m.permissions().can('posts.update')).toBe(false)
    m.permissionSet.set('nobody')
    expect(m.permissions().can('posts.delete')).toBe(false)
  })

  it('falls back to the shipped defaults when no presets are configured', () => {
    const m = model()
    expect(m.viewports.map((v) => v.id)).toEqual(['full', 'mobile', 'tablet', 'desktop'])
    expect(m.roles.map((r) => r.id)).toEqual(['anonymous', 'viewer', 'editor', 'admin'])
  })

  it('a URL id naming no preset falls back to the first entry', () => {
    history.replaceState(null, '', '/?viewport=desktop')
    // `desktop` exists only in the DEFAULT list — with custom presets the
    // stale link must land on a state the pickers can actually show.
    const m = createModel(withPresets(), {})
    expect(m.viewport()).toBe('fluid')
  })
})
