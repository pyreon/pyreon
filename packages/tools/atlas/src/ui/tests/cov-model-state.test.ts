/**
 * The model's remaining reactive surface — the fallbacks, the derived values
 * the pickers render from, and the callbacks the UI wires to buttons.
 *
 * `model.test.ts` covers the ordinary path. What is left is the state a stale
 * link or an unusual project configuration produces: an EMPTY preset list, a
 * signal pointing at an id nothing matches, a group toggled twice, a play
 * script that throws. Each is paired here with the ordinary value it must be
 * distinguished from — a fallback that also fires in the normal case is not a
 * fallback, it is the behaviour.
 *
 * happy-dom, because the preview ref, the MutationObserver re-probe and the
 * URL writer all want a real DOM.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent, WorkbenchScenario } from '../catalog'
import { createModel } from '../model'

const comp = (
  id: string,
  group = 'G',
  over: Partial<WorkbenchComponent> = {},
): WorkbenchComponent => ({
  id,
  name: id,
  group,
  controls: [{ key: 'label', label: 'Label', type: 'text', default: id }],
  render: (props) => `${id}:${String(props.label ?? '')}`,
  ...over,
})

const CATALOG: WorkbenchCatalog = {
  components: [comp('button', 'Inputs'), comp('badge', 'Data Display')],
}

beforeEach(() => {
  history.replaceState(null, '', '/')
})

describe('an EMPTY preset list — a project that configures the key to nothing', () => {
  const empty: WorkbenchCatalog = {
    components: [comp('button')],
    presets: { viewports: [], backgrounds: [], locales: [], roles: [] },
  }

  it('falls back to a hard-coded id rather than leaving the signal undefined', () => {
    const m = createModel(empty, {})
    expect(m.viewport()).toBe('full')
    expect(m.background()).toBe('theme')
    expect(m.locale()).toBe('en')
    expect(m.permissionSet()).toBe('anonymous')
  })

  it('and the non-empty case still takes the list FIRST entry, not the hard-coded one', () => {
    const m = createModel(
      {
        components: [comp('button')],
        presets: { viewports: [{ id: 'kiosk', label: 'Kiosk', width: 900 }] },
      },
      {},
    )
    expect(m.viewport()).toBe('kiosk')
  })

  it('reports `ltr` for a locale no list can resolve — never undefined on an element', () => {
    expect(createModel(empty, {}).dir()).toBe('ltr')
  })
})

describe('a signal pointing at an id that resolves to nothing', () => {
  it('viewportPreset falls back to the FIRST preset, not to undefined', () => {
    const m = createModel(CATALOG, {})
    m.viewport.set('does-not-exist')
    expect(m.viewportPreset()).toBe(m.viewports[0])
  })

  it('backgroundPreset falls back the same way', () => {
    const m = createModel(CATALOG, {})
    m.background.set('does-not-exist')
    expect(m.backgroundPreset()).toBe(m.backgrounds[0])
  })

  it('dir falls back to `ltr` for an unknown locale', () => {
    const m = createModel(CATALOG, {})
    m.locale.set('does-not-exist')
    expect(m.dir()).toBe('ltr')
  })

  it('permissions falls back to the FIRST role for an unknown role id', () => {
    const m = createModel(CATALOG, {})
    m.permissionSet.set('does-not-exist')
    // anonymous — the first shipped role — grants nothing.
    expect(m.permissions().can('posts.read')).toBe(false)
  })

  it('and each of these tracks a REAL id when given one', () => {
    const m = createModel(CATALOG, {})
    m.viewport.set('tablet')
    m.background.set('checker')
    m.permissionSet.set('admin')
    expect(m.viewportPreset().id).toBe('tablet')
    expect(m.backgroundPreset().id).toBe('checker')
    expect(m.permissions().can('posts.delete')).toBe(true)
  })
})

describe('queryResult — the fabricated result threaded to the preview', () => {
  it('carries the scenario `queryData` control when there is one', () => {
    const catalog: WorkbenchCatalog = {
      components: [
        comp('table', 'G', {
          controls: [{ key: 'queryData', label: 'Data', type: 'text', default: 'rows' }],
        }),
      ],
    }
    const m = createModel(catalog, {})
    expect(m.queryResult().data()).toBe('rows')
  })

  it('still produces a well-formed result to branch on when there is none', () => {
    const m = createModel(CATALOG, {})
    expect(m.queryResult().data()).toBeNull()
    expect(m.queryResult().isSuccess()).toBe(true)
  })

  it('re-derives when the state picker moves', () => {
    const m = createModel(CATALOG, {})
    m.queryState.set('error')
    expect(m.queryResult().isError()).toBe(true)
    expect(m.queryResult().data()).toBeUndefined()
  })
})

describe('pseudo-locale', () => {
  it('is OFF by default — a deliberate check, not a viewing mode', () => {
    expect(createModel(CATALOG, {}).vals()).toEqual({ label: 'button' })
  })

  it('expands and accents the values the component RENDERS when it is on', () => {
    const m = createModel(CATALOG, {})
    m.pseudoLocale.set(true)
    const label = String(m.vals().label)
    expect(label).not.toBe('button')
    expect(label.length).toBeGreaterThan('button'.length)
  })

  it('leaves the STORED control value alone — the Controls panel is not rewritten', () => {
    const m = createModel(CATALOG, {})
    m.setValue('button', 'label', 'Save')
    m.pseudoLocale.set(true)
    const accented = String(m.vals().label)
    m.pseudoLocale.set(false)
    expect(m.vals().label).toBe('Save')
    expect(accented).not.toBe('Save')
  })
})

describe('toggleGroup', () => {
  it('collapses a group, then EXPANDS it again — the same call both ways', () => {
    const m = createModel(CATALOG, {})
    expect(m.collapsed().has('Inputs')).toBe(false)
    m.toggleGroup('Inputs')
    expect(m.collapsed().has('Inputs')).toBe(true)
    m.toggleGroup('Inputs')
    expect(m.collapsed().has('Inputs')).toBe(false)
  })

  it('does not disturb a sibling group', () => {
    const m = createModel(CATALOG, {})
    m.toggleGroup('Inputs')
    m.toggleGroup('Data Display')
    m.toggleGroup('Inputs')
    expect([...m.collapsed()]).toEqual(['Data Display'])
  })

  it('writes a NEW set each time, so a reader holding the old one is not mutated', () => {
    const m = createModel(CATALOG, {})
    const before = m.collapsed()
    m.toggleGroup('Inputs')
    expect(m.collapsed()).not.toBe(before)
    expect(before.has('Inputs')).toBe(false)
  })
})

describe('setValue — a SECOND edit to the same component', () => {
  it('merges onto the first rather than replacing it', () => {
    const catalog: WorkbenchCatalog = {
      components: [
        comp('button', 'G', {
          controls: [
            { key: 'label', label: 'Label', type: 'text', default: 'Click me' },
            { key: 'state', label: 'State', type: 'enum', options: ['a', 'b'], default: 'a' },
          ],
        }),
      ],
    }
    const m = createModel(catalog, {})
    m.setValue('button', 'label', 'Saved')
    m.setValue('button', 'state', 'b')
    expect(m.vals()).toEqual({ label: 'Saved', state: 'b' })
  })

  it('re-editing the same key overwrites only that key', () => {
    const m = createModel(CATALOG, {})
    m.setValue('button', 'label', 'One')
    m.setValue('button', 'label', 'Two')
    expect(m.vals()).toEqual({ label: 'Two' })
  })
})

describe('runPlay', () => {
  const withPlay = (play: NonNullable<WorkbenchScenario['play']>): WorkbenchCatalog => ({
    components: [
      comp('button', 'G', {
        scenarios: [
          { id: 'sc', name: 'Scenario', args: { label: 'From scenario' }, verdict: 'ok', play },
        ],
      }),
    ],
  })

  const attach = (m: ReturnType<typeof createModel>): HTMLElement => {
    const el = document.createElement('div')
    el.innerHTML = '<button>Go</button>'
    document.body.append(el)
    m.previewRef(el)
    return el
  }

  it('runs the script against the live preview and logs each step', async () => {
    const seen: string[] = []
    const m = createModel(
      withPlay(async ({ root, step }) => {
        await step('click', async () => {
          seen.push(root.querySelector('button')!.textContent ?? '')
        })
      }),
      {},
    )
    attach(m)
    await m.runPlay('button', 'sc')

    expect(seen).toEqual(['Go'])
    expect(m.actions().map((a) => [a.name, a.detail])).toEqual([['▶ Scenario', 'click']])
  })

  it('applies the scenario args BEFORE the script runs', async () => {
    const m = createModel(
      withPlay(async () => {
        /* nothing */
      }),
      {},
    )
    attach(m)
    await m.runPlay('button', 'sc')
    expect(m.vals()).toEqual({ label: 'From scenario' })
  })

  it('logs a THROWN failure rather than swallowing it or rejecting', async () => {
    const m = createModel(
      withPlay(async () => {
        throw new Error('button not found')
      }),
      {},
    )
    attach(m)
    await expect(m.runPlay('button', 'sc')).resolves.toBeUndefined()
    expect(m.actions()[0]!.detail).toBe('FAILED: button not found')
  })

  it('logs a non-Error rejection as its string, not as "undefined"', async () => {
    const m = createModel(
      withPlay(async () => {
        throw 'timed out'
      }),
      {},
    )
    attach(m)
    await m.runPlay('button', 'sc')
    expect(m.actions()[0]!.detail).toBe('FAILED: timed out')
  })

  it('does nothing at all for an unknown component or scenario id', async () => {
    const m = createModel(
      withPlay(async () => {
        /* nothing */
      }),
      {},
    )
    attach(m)
    await m.runPlay('nope', 'sc')
    await m.runPlay('button', 'nope')
    expect(m.actions()).toEqual([])
    expect(m.vals()).toEqual({ label: 'button' })
  })

  it('does nothing for a scenario with NO script — the guard is about `play`', async () => {
    const m = createModel(
      {
        components: [
          comp('button', 'G', {
            scenarios: [{ id: 'plain', name: 'Plain', args: { label: 'x' }, verdict: 'ok' }],
          }),
        ],
      },
      {},
    )
    attach(m)
    await m.runPlay('button', 'plain')
    expect(m.actions()).toEqual([])
    // And the args were NOT applied either — runPlay bails before selecting.
    expect(m.vals()).toEqual({ label: 'button' })
  })

  it('bails when no preview element is attached, rather than querying nothing', async () => {
    let ran = false
    const m = createModel(
      withPlay(async () => {
        ran = true
      }),
      {},
    )
    await m.runPlay('button', 'sc')
    expect(ran).toBe(false)
    // The scenario's args still landed — selection precedes the frame wait.
    expect(m.vals()).toEqual({ label: 'From scenario' })
  })
})

describe('previewRef — re-probing on a real mutation', () => {
  it('re-reads the a11y verdict when the rendered DOM changes underneath it', async () => {
    const m = createModel(CATALOG, {})
    const el = document.createElement('div')
    el.innerHTML = '<button>Go</button>'
    document.body.append(el)
    m.previewRef(el)
    expect(m.a11y().fails).toBe(0)

    // The observer is what catches a re-render the model was never told about.
    el.firstElementChild!.replaceWith(document.createElement('img'))
    await new Promise((r) => setTimeout(r, 0))

    expect(m.a11y().fails).toBeGreaterThan(0)
  })

  it('applies the writing direction to the captured element, reactively', () => {
    const m = createModel(
      {
        components: [comp('button')],
        presets: {
          locales: [
            { id: 'en', label: 'English' },
            { id: 'he', label: 'עברית', dir: 'rtl' },
          ],
        },
      },
      {},
    )
    const el = document.createElement('div')
    el.innerHTML = '<button>Go</button>'
    document.body.append(el)
    m.previewRef(el)
    expect(el.getAttribute('dir')).toBe('ltr')

    m.locale.set('he')
    expect(el.getAttribute('dir')).toBe('rtl')
  })

  it('exposes the captured element, and drops it on detach', () => {
    const m = createModel(CATALOG, {})
    const el = document.createElement('div')
    el.innerHTML = '<button>Go</button>'
    m.previewRef(el)
    expect(m.previewElement()).toBe(el)
    m.previewRef(null)
    expect(m.previewElement()).toBeNull()
  })
})
