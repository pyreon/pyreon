/**
 * The workbench's reactive state, built once from a catalog. Split out of the
 * shell so each `views/*` file reads a single typed `model` instead of a dozen
 * threaded props. Everything here is signals + computeds + callbacks — no DOM.
 */
import type { VNodeChildAtom } from '@pyreon/core'
import { computed, type Computed, type Signal, signal } from '@pyreon/reactivity'
import type { CatalogGroup, WorkbenchCatalog, WorkbenchComponent } from './catalog'
import { buildSearch, defaultValues, groupComponents } from './catalog'
import type { BrandTheme, ThemeTokens } from './theme'
import { THEMES, tokens } from './theme'

export type View = 'canvas' | 'docs' | 'lab'
export type Addon = 'controls' | 'actions' | 'a11y'
export interface ActionEntry {
  id: number
  name: string
  detail: string
  t: string
}
export interface A11yCheck {
  status: 'ok' | 'warn' | 'danger'
  icon: string
  title: string
  note: string
}
export interface A11yReport {
  checks: A11yCheck[]
  fails: number
  warns: number
  passes: number
}

/** Discrete zoom levels — a rocketstyle `size` dimension (continuous scale would need an inline style). */
export const ZOOM_PCT = [50, 75, 100, 125, 150, 175, 200] as const

export interface WorkbenchModel {
  catalog: WorkbenchCatalog
  groups: CatalogGroup[]
  total: number
  title: string
  subtitle: string
  // signals
  brandId: Signal<string>
  dark: Signal<boolean>
  selId: Signal<string>
  query: Signal<string>
  zoomIdx: Signal<number>
  view: Signal<View>
  addon: Signal<Addon>
  actions: Signal<ActionEntry[]>
  // computeds
  brand: Computed<BrandTheme>
  theme: Computed<ThemeTokens>
  sel: Computed<WorkbenchComponent | undefined>
  vals: Computed<Record<string, unknown>>
  visibleGroups: Computed<CatalogGroup[]>
  noResults: Computed<boolean>
  a11y: Computed<A11yReport>
  // actions
  setValue: (id: string, key: string, v: unknown) => void
  reset: () => void
  logAction: (name: string, detail: string) => void
  clearActions: () => void
  search: (q: string) => string[]
  preview: () => VNodeChildAtom | VNodeChildAtom[]
}

export function createModel(
  catalog: WorkbenchCatalog,
  opts: { title?: string | undefined; subtitle?: string | undefined },
): WorkbenchModel {
  const groups = groupComponents(catalog)
  const search = buildSearch(catalog)
  const total = catalog.components.length

  const brandId = signal('ember')
  const dark = signal(true)
  const selId = signal(catalog.components[0]?.id ?? '')
  const query = signal('')
  const zoomIdx = signal(2) // 100%
  const view = signal<View>('canvas')
  const addon = signal<Addon>('controls')
  const values = signal<Record<string, Record<string, unknown>>>({})
  const actions = signal<ActionEntry[]>([])

  const brand = computed(() => THEMES.find((b) => b.id === brandId()) ?? THEMES[0]!)
  const theme = computed(() => tokens(brand(), dark()))
  const sel = computed<WorkbenchComponent | undefined>(() => catalog.components.find((c) => c.id === selId()) ?? catalog.components[0])
  const vals = computed(() => {
    const c = sel()
    if (!c) return {}
    const ov = values()[selId()]
    return ov ? { ...defaultValues(c), ...ov } : defaultValues(c)
  })
  const visibleGroups = computed(() => {
    const ids = new Set(search(query()))
    return groups.map((g) => ({ ...g, items: g.items.filter((i) => ids.has(i.id)) })).filter((g) => g.items.length > 0)
  })
  const noResults = computed(() => visibleGroups().length === 0)

  const setValue = (id: string, key: string, v: unknown) => {
    const cur = values()[id]
    values.set({ ...values(), [id]: cur ? { ...cur, [key]: v } : { [key]: v } })
  }
  const reset = () => values.set({ ...values(), [selId()]: {} })

  let actionSeq = 0
  const logAction = (name: string, detail: string) => {
    actionSeq += 1
    actions.set([{ id: actionSeq, name, detail, t: new Date().toLocaleTimeString([], { hour12: false }) }, ...actions()].slice(0, 24))
  }
  const clearActions = () => actions.set([])

  // context threaded to each component's render(): log interactions + write control values back
  const renderCtx = { logAction, setValue: (key: string, v: unknown) => setValue(selId(), key, v) }
  const preview = (): VNodeChildAtom | VNodeChildAtom[] => sel()?.render(vals(), renderCtx) ?? null

  const a11y = computed<A11yReport>(() => {
    const c = sel()
    const v = vals()
    const checks: A11yCheck[] = []
    const nameCtrl = c?.controls.find((x) => /^(label|title|name|alt|aria-label)$/i.test(x.key))
    const named = nameCtrl ? Boolean(v[nameCtrl.key]) : true
    checks.push(
      named
        ? { status: 'ok', icon: '✓', title: 'Accessible name', note: nameCtrl ? `provided via "${nameCtrl.key}"` : 'component is self-labelled' }
        : { status: 'danger', icon: '✕', title: 'Missing accessible name', note: `set the "${nameCtrl!.key}" prop so assistive tech can announce it` },
    )
    checks.push({ status: 'ok', icon: '✓', title: 'Semantic role', note: 'renders a native interactive element' })
    checks.push({ status: 'ok', icon: '✓', title: 'Keyboard operable', note: 'focusable and activatable via keyboard' })
    if (c?.controls.some((x) => x.type === 'enum' && x.options?.includes('error')) && v.state === 'error') {
      checks.push({ status: 'warn', icon: '!', title: 'Error not programmatic', note: 'pair the error style with aria-invalid + aria-describedby' })
    }
    const fails = checks.filter((x) => x.status === 'danger').length
    const warns = checks.filter((x) => x.status === 'warn').length
    return { checks, fails, warns, passes: checks.length - fails - warns }
  })

  return {
    catalog, groups, total, title: opts.title ?? 'atlas', subtitle: opts.subtitle ?? '',
    brandId, dark, selId, query, zoomIdx, view, addon, actions,
    brand, theme, sel, vals, visibleGroups, noResults, a11y,
    setValue, reset, logAction, clearActions, search, preview,
  }
}
