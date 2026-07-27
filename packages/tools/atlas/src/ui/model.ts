/**
 * The workbench's reactive state, built once from a catalog. Split out of the
 * shell so each `views/*` file reads a single typed `model` instead of a dozen
 * threaded props. Everything here is signals + computeds + callbacks — no DOM.
 */
import type { VNodeChildAtom } from '@pyreon/core'
import { computed, type Computed, effect, type Effect, type Signal, signal } from '@pyreon/reactivity'
import type { A11yReport } from './a11y'
import { analyzeA11y } from './a11y'
import type { AddonTabId, BackgroundId, LocaleId, PseudoId, ViewportId } from './addons'
import { localeDir, pseudoProps } from './addons'
import type { CatalogGroup, WorkbenchCatalog, WorkbenchComponent } from './catalog'
import { buildSearch, defaultValues, groupComponents } from './catalog'
import type { BrandTheme, ThemeTokens } from './theme'
import { THEMES, tokens } from './theme'

export type View = 'canvas' | 'docs' | 'lab'
/**
 * The addon-panel tab. Sourced from `ADDON_TABS` so the state and the rendered
 * tab strip cannot drift — adding a tab there is enough.
 */
export type Addon = AddonTabId
export interface ActionEntry {
  id: number
  name: string
  detail: string
  t: string
}
export type { A11yCheck, A11yReport } from './a11y'

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
  // canvas addons (viewport / backgrounds / pseudo-state / outline)
  viewport: Signal<ViewportId>
  background: Signal<BackgroundId>
  pseudo: Signal<PseudoId | null>
  outline: Signal<boolean>
  /** Active locale — threaded to `render` as `ctx.locale`, and drives `dir=`. */
  locale: Signal<LocaleId>
  // computeds
  brand: Computed<BrandTheme>
  theme: Computed<ThemeTokens>
  sel: Computed<WorkbenchComponent | undefined>
  vals: Computed<Record<string, unknown>>
  visibleGroups: Computed<CatalogGroup[]>
  noResults: Computed<boolean>
  /** Live a11y verdict for the RENDERED preview (re-probed after each render). */
  a11y: Signal<A11yReport>
  /** `ref` for the preview surface — attach it so the a11y checks can inspect the real DOM. */
  previewRef: (el: HTMLElement | null) => void
  // actions
  setValue: (id: string, key: string, v: unknown) => void
  reset: () => void
  logAction: (name: string, detail: string) => void
  clearActions: () => void
  search: (q: string) => string[]
  preview: () => VNodeChildAtom | VNodeChildAtom[]
  /** `ref` for the search `<input>` — attach in the top bar so ⌘K can focus it. */
  searchRef: (el: HTMLInputElement | null) => void
  /** Focus the search input (⌘K) via the captured ref — no DOM query. */
  focusSearch: () => void
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
  const viewport = signal<ViewportId>('full')
  const background = signal<BackgroundId>('theme')
  const pseudo = signal<PseudoId | null>(null)
  const outline = signal(false)
  const locale = signal<LocaleId>('en')

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

  let searchEl: HTMLInputElement | null = null
  const searchRef = (el: HTMLInputElement | null) => {
    searchEl = el
  }
  const focusSearch = () => searchEl?.focus()

  // context threaded to each component's render(): log interactions + write control values back
  // `pseudo` is read INSIDE the accessor so the preview re-renders when the
  // forced state flips; a catalog spreads it onto its root (`{...ctx.pseudo}`)
  // to opt into pseudo-state forcing.
  const renderCtx = {
    logAction,
    setValue: (key: string, v: unknown) => setValue(selId(), key, v),
    get pseudo() {
      return pseudoProps(pseudo())
    },
    get locale() {
      return locale()
    },
  }
  const preview = (): VNodeChildAtom | VNodeChildAtom[] => sel()?.render(vals(), renderCtx) ?? null

  // The a11y verdict is probed from the RENDERED preview, not asserted.
  //
  // The previous implementation pushed "Semantic role" and "Keyboard operable"
  // as unconditional `ok` rows without inspecting anything — a component with
  // neither still reported them as passing. An a11y panel that fabricates a
  // pass is worse than one that shows nothing, so the checks now read the real
  // element (see ./a11y) and report `unknown` when it cannot be determined.
  const a11y = signal<A11yReport>(analyzeA11y(null))
  let previewEl: HTMLElement | null = null
  let observer: MutationObserver | null = null
  let stopDir: Effect | null = null

  /**
   * `ref` for the preview surface — attach it so the a11y checks can inspect the
   * real DOM. (`ref`, NOT `innerRef`: the latter silently no-ops through
   * rocketstyle and leaves the checks reading nothing.)
   *
   * Re-probing is driven by a MutationObserver rather than a reactive effect on
   * (selection, control values, pseudo state). That list was a guess at what
   * changes the output — it would miss anything else that re-renders, and it
   * needed a microtask hop to read AFTER the bindings patched the DOM. Observing
   * the subtree asks the DOM directly: every render is caught, in the right
   * order, with no dependency bookkeeping. It is created on ATTACH (a ref fires
   * at mount) so nothing is scheduled during SSR, and torn down on detach.
   */
  const previewRef = (el: HTMLElement | null) => {
    previewEl = el
    if (!el) {
      observer?.disconnect()
      observer = null
      stopDir?.dispose()
      stopDir = null
      return
    }
    a11y.set(analyzeA11y(el))
    // Writing direction is applied IMPERATIVELY to the captured element rather
    // than as a `dir={…}` prop: an accessor-valued generic attribute is not
    // forwarded through rocketstyle → Element (it silently lands as no attribute
    // at all, verified in a browser), and the compiler-wrapped value form would
    // go static in the prebuilt lib. Writing the attribute keeps BOTH the
    // semantics (assistive tech, `:dir()` selectors) and the CSS direction,
    // which a `direction:` dimension alone would not give.
    stopDir ??= effect(() => {
      const el2 = previewEl
      if (el2) el2.setAttribute('dir', localeDir(locale()))
    })
    if (typeof MutationObserver === 'undefined') return
    observer?.disconnect()
    observer = new MutationObserver(() => {
      if (previewEl) a11y.set(analyzeA11y(previewEl))
    })
    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true })
  }

  return {
    catalog, groups, total, title: opts.title ?? 'atlas', subtitle: opts.subtitle ?? '',
    brandId, dark, selId, query, zoomIdx, view, addon, actions,
    viewport, background, pseudo, outline, locale,
    brand, theme, sel, vals, visibleGroups, noResults, a11y,
    setValue, reset, logAction, clearActions, search, preview, searchRef, focusSearch, previewRef,
  }
}
