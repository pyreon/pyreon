/**
 * The render context threaded to every component's `render(values, ctx)`.
 *
 * Four of its members are GETTERS on purpose: the context object is built once
 * at model setup, so a plain value would pin each render to whatever was active
 * then — the role picker, the locale switcher and the data-state picker would
 * all flip the control and change nothing on screen. `model.test.ts` pins
 * `ctx.pseudo`; this file pins the other three, and each case asserts the
 * render sees the value AFTER the flip, which is the property the getter buys.
 *
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog, WorkbenchComponent } from '../catalog'
import { createModel } from '../model'

interface Ctx {
  locale: string
  can: (key: string) => boolean
  query: { status: () => string }
  setValue: (key: string, v: unknown) => void
  logAction: (name: string, detail: string) => void
}

const reading = (read: (ctx: Ctx) => string): WorkbenchComponent => ({
  id: 'probe',
  name: 'probe',
  group: 'G',
  controls: [{ key: 'label', label: 'Label', type: 'text', default: 'initial' }],
  render: (_values, ctx) => read(ctx as unknown as Ctx),
})

const catalog = (read: (ctx: Ctx) => string): WorkbenchCatalog => ({
  components: [reading(read)],
  presets: {
    locales: [
      { id: 'en', label: 'English' },
      { id: 'he', label: 'עברית', dir: 'rtl' },
    ],
  },
})

beforeEach(() => {
  history.replaceState(null, '', '/')
})

const rendered = (m: ReturnType<typeof createModel>): string => {
  const out = m.preview()
  // The preview is wrapped in a PermissionsProvider; the component's own output
  // is its single child.
  const children = (out as { children?: unknown[] }).children
  return String(children?.[0])
}

describe('ctx.locale', () => {
  it('reports the CURRENT locale on every render, not the one active at setup', () => {
    const m = createModel(catalog((ctx) => `locale=${ctx.locale}`), {})
    expect(rendered(m)).toBe('locale=en')
    m.locale.set('he')
    expect(rendered(m)).toBe('locale=he')
  })
})

describe('ctx.can', () => {
  it('reports the CURRENT role verdict, so the role picker changes the output', () => {
    const m = createModel(catalog((ctx) => `delete=${ctx.can('posts.delete')}`), {})
    // anonymous — the first shipped role — grants nothing.
    expect(rendered(m)).toBe('delete=false')
    m.permissionSet.set('admin')
    expect(rendered(m)).toBe('delete=true')
  })

  it('records the consulted key against the ACTIVE role, not a stale instance', () => {
    const m = createModel(catalog((ctx) => `delete=${ctx.can('posts.delete')}`), {})
    rendered(m)
    expect(m.permissions().consulted()).toContain('posts.delete')
    // A role flip re-creates the recorder: the observation belongs to ONE
    // component under ONE role, so it must not carry across.
    m.permissionSet.set('admin')
    expect(m.permissions().consulted()).toEqual([])
  })
})

describe('ctx.query', () => {
  it('reports the CURRENT fabricated state, so the data picker changes the output', () => {
    const m = createModel(catalog((ctx) => `status=${ctx.query.status()}`), {})
    expect(rendered(m)).toBe('status=success')
    m.queryState.set('error')
    expect(rendered(m)).toBe('status=error')
    m.queryState.set('loading')
    expect(rendered(m)).toBe('status=pending')
  })
})

describe('ctx.setValue and ctx.logAction', () => {
  it('write back to the SELECTED component control values', () => {
    let captured: Ctx | undefined
    const m = createModel(
      catalog((ctx) => {
        captured = ctx
        return 'x'
      }),
      {},
    )
    rendered(m)
    captured!.setValue('label', 'from the component')
    expect(m.vals().label).toBe('from the component')
  })

  it('log an interaction into the Actions panel', () => {
    let captured: Ctx | undefined
    const m = createModel(
      catalog((ctx) => {
        captured = ctx
        return 'x'
      }),
      {},
    )
    rendered(m)
    captured!.logAction('click', 'the button')
    expect(m.actions().map((a) => [a.name, a.detail])).toEqual([['click', 'the button']])
  })
})
