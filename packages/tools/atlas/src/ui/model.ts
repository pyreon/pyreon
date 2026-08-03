/**
 * The workbench's reactive state, built once from a catalog. Split out of the
 * shell so each `views/*` file reads a single typed `model` instead of a dozen
 * threaded props. Everything here is signals + computeds + callbacks — no DOM.
 */
import { h, type VNodeChildAtom } from '@pyreon/core'
import { PermissionsProvider } from '@pyreon/permissions'
import { computed, effect, isClient, signal, type Computed, type Effect, type Signal } from '@pyreon/reactivity'
import type { A11yReport } from './a11y'
import { analyzeA11y } from './a11y'
import type { AddonTabId, BackgroundPreset, LocalePreset, PseudoId, ViewportPreset } from './addons'
import { BACKGROUNDS, LOCALES, VIEWPORTS, pseudoProps } from './addons'
import { pseudoLocalizeValues } from './pseudo-locale'
import {
  DEFAULT_PERMISSION_SETS,
  type PermissionSet,
  recordingPermissions,
  type RecordingPermissions,
} from './permission-sets'
import { makeQueryResult, type FakeQueryResult, type QueryStateId } from './query-states'
import { parseUrlState, serializeUrlState, urlStateChanged, type UrlState } from './url-state'
import type { CatalogGroup, WorkbenchCatalog, WorkbenchComponent } from './catalog'
import { buildSearch, buildSearchIndex, defaultValues, groupComponents } from './catalog'
import { buildHierarchy, filterHierarchy, type HierarchyNode } from './hierarchy'
import type { BrandTheme, ThemeTokens } from './theme'
import { THEMES, tokens } from './theme'

export type View = 'canvas' | 'docs' | 'lab'
/**
 * The addon-panel tab.
 *
 * `AddonTabId` names the built-ins so they still autocomplete, and the open
 * `(string & {})` arm admits a panel registered by a plugin — the id is not
 * knowable at compile time, and a closed union would have made the registry
 * unusable from outside this package. Same shape as the router's `RouteHref`.
 */
export type Addon = AddonTabId | (string & {})
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
  /** The ⌘K search dialog (docs-site style modal; the top-bar input became a trigger). */
  searchOpen: Signal<boolean>
  // Resizable shell panels — widths in px (drag handles clamp them), open flags
  // for the collapse toggles.
  sidebarW: Signal<number>
  panelW: Signal<number>
  sidebarOpen: Signal<boolean>
  panelOpen: Signal<boolean>
  zoomIdx: Signal<number>
  view: Signal<View>
  addon: Signal<Addon>
  actions: Signal<ActionEntry[]>
  // canvas addons (viewport / backgrounds / pseudo-state / outline).
  // Ids are plain strings: the lists they index are per-project presets
  // (`catalog.presets`), falling back to the shipped defaults.
  viewport: Signal<string>
  background: Signal<string>
  pseudo: Signal<PseudoId | null>
  outline: Signal<boolean>
  /** Measure addon — hovering the preview shows the hovered box's dimensions. */
  measure: Signal<boolean>
  /** The live preview surface element (null before mount) — the a11y probe target's parent. */
  previewElement: () => HTMLElement | null
  /** Active locale — threaded to `render` as `ctx.locale`, and drives `dir=`. */
  locale: Signal<string>
  // the resolved preset lists the pickers render from
  viewports: readonly ViewportPreset[]
  backgrounds: readonly BackgroundPreset[]
  locales: readonly LocalePreset[]
  roles: readonly PermissionSet[]
  /** The active viewport preset (falls back to the first). */
  viewportPreset: Computed<ViewportPreset>
  /** The active background preset (falls back to the first). */
  backgroundPreset: Computed<BackgroundPreset>
  /** Writing direction of the active locale. */
  dir: Computed<'ltr' | 'rtl'>
  /** i18n stress: render every string accented + 40% longer to expose truncation. */
  pseudoLocale: Signal<boolean>
  /** Role the preview renders under — threaded to `render` as `ctx.can`. */
  permissionSet: Signal<string>
  /** The recording `can` for the active role, re-created whenever it changes. */
  permissions: Computed<RecordingPermissions>
  /** Which of the four query states the preview renders under. */
  queryState: Signal<QueryStateId>
  /** The fabricated query result for that state — threaded as `ctx.query`. */
  queryResult: Computed<FakeQueryResult>
  // computeds
  brand: Computed<BrandTheme>
  theme: Computed<ThemeTokens>
  sel: Computed<WorkbenchComponent | undefined>
  vals: Computed<Record<string, unknown>>
  visibleGroups: Computed<CatalogGroup[]>
  /**
   * The nested sidebar tree — group paths are `/`-separated
   * (`Components/Forms`), filtered by the live search with empty branches
   * dropped. `visibleGroups` remains for flat consumers.
   */
  tree: Computed<HierarchyNode[]>
  /** Collapsed group PATHS (default: everything expanded). */
  collapsed: Signal<ReadonlySet<string>>
  toggleGroup: (path: string) => void
  noResults: Computed<boolean>
  /** Live a11y verdict for the RENDERED preview (re-probed after each render). */
  a11y: Signal<A11yReport>
  /** `ref` for the preview surface — attach it so the a11y checks can inspect the real DOM. */
  previewRef: (el: HTMLElement | null) => void
  // actions
  setValue: (id: string, key: string, v: unknown) => void
  /**
   * Select a component AND apply one of its derived scenarios — the canvas
   * then renders exactly the state the pipeline verified. Unknown ids no-op.
   */
  selectScenario: (compId: string, scenarioId: string) => void
  /**
   * Run a hand-catalog scenario's `play` against the LIVE preview: select the
   * scenario, wait a frame for the canvas to settle, then execute — each step
   * (and any failure) lands in the Actions panel, so the run is visible.
   */
  runPlay: (compId: string, scenarioId: string) => Promise<void>
  reset: () => void
  logAction: (name: string, detail: string) => void
  clearActions: () => void
  search: (q: string) => string[]
  /** Fulltext hits with the matched-field reason — the ⌘K dialog's surface. */
  searchHits: (q: string) => import('./catalog').CatalogSearchHit[]
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
  const searchHits = buildSearchIndex(catalog)
  const total = catalog.components.length

  // Per-project presets — every omitted family keeps the shipped defaults.
  // Resolved ONCE (the lists are static data; only the SELECTION is a signal).
  const presets = catalog.presets ?? {}
  const viewports: readonly ViewportPreset[] =
    presets.viewports?.map((v) => ({ hint: v.width === null ? 'fluid' : `${v.width}px`, ...v })) ??
    VIEWPORTS
  const backgrounds: readonly BackgroundPreset[] = presets.backgrounds ?? BACKGROUNDS
  const locales: readonly LocalePreset[] = presets.locales?.map((l) => ({ dir: 'ltr', ...l })) ?? LOCALES
  const roles: readonly PermissionSet[] =
    presets.roles?.map((r) => ({ hint: '', verbs: [], defaultGrant: false, ...r })) ??
    DEFAULT_PERMISSION_SETS

  // Restore from the URL first, so a shared link lands on the view it names.
  //
  // `isClient` from `@pyreon/reactivity` rather than a hand-rolled
  // `typeof location` check: the framework owns one answer to "is there a DOM"
  // (`typeof document === 'undefined'`, which is the reliable test — `window`
  // is polyfilled in some Node setups), and re-deriving it per package is how
  // packages ended up disagreeing about it. It is also the form
  // `pyreon/no-window-in-ssr` recognises.
  const initial: UrlState = isClient ? parseUrlState(location.search) : {}

  const brandId = signal(initial.brand ?? 'ember')
  const dark = signal(initial.dark ?? true)
  // The link's component id, RESOLVED against the catalog — never used raw.
  //
  // A link naming a component that no longer exists falls back to the first one
  // rather than rendering an empty canvas: a renamed component should not make
  // an old link look like a broken workbench. Resolving ONCE (rather than
  // per-use) also keeps the id and the args it carries from disagreeing —
  // previously the args were stored under the link's raw id while the canvas
  // fell back to a different component, so a stale link silently parked its
  // edits on a key nothing would ever read.
  //
  // It matters for a second reason: this value comes from the URL, and it is
  // used as an object KEY below. Narrowing it to an id the catalog already
  // contains means no attacker-chosen string ever names a property.
  const linkedComponent = catalog.components.find((c) => c.id === initial.c)
  const selId = signal(linkedComponent?.id ?? catalog.components[0]?.id ?? '')
  const query = signal('')
  const zoomIdx = signal(2) // 100%
  const view = signal<View>('canvas')
  const addon = signal<Addon>(initial.p ?? 'controls')
  // Args from the link belong to the component the link named.
  const values = signal<Record<string, Record<string, unknown>>>(
    linkedComponent && initial.args ? { [linkedComponent.id]: initial.args } : {},
  )
  const actions = signal<ActionEntry[]>([])
  // A URL id that names no preset falls back to the first — a stale link must
  // not select a state the pickers cannot show.
  const viewport = signal<string>(
    viewports.find((v) => v.id === initial.viewport)?.id ?? viewports[0]?.id ?? 'full',
  )
  const background = signal<string>(
    backgrounds.find((b) => b.id === initial.background)?.id ?? backgrounds[0]?.id ?? 'theme',
  )
  const pseudo = signal<PseudoId | null>(null)
  const outline = signal(false)
  const measure = signal(false)
  const locale = signal<string>(
    locales.find((l) => l.id === initial.locale)?.id ?? locales[0]?.id ?? 'en',
  )
  // i18n STRESS, distinct from the locale switcher next to it: the switcher
  // changes writing direction, this changes every string's LENGTH. Off by
  // default — it is a deliberate check, not a viewing mode.
  const pseudoLocale = signal(false)
  const permissionSet = signal(roles[0]?.id ?? 'anonymous')
  const queryState = signal<QueryStateId>('success')

  // Re-created per role AND per selected component: the consulted-key list is
  // an observation of ONE component under ONE role, so carrying it across
  // either would report keys the current pairing never asked about.
  const permissions = computed(() => {
    void selId()
    const role = roles.find((r) => r.id === permissionSet()) ?? roles[0]!
    return recordingPermissions(role)
  })

  // A scenario supplies its own sample payload through the `queryData` control
  // when it has one; otherwise the component still gets a well-formed result to
  // branch on, which is the part being exercised.
  const queryResult = computed<FakeQueryResult>(() =>
    makeQueryResult(queryState(), (vals() as { queryData?: unknown }).queryData ?? null),
  )

  const viewportPreset = computed(() => viewports.find((v) => v.id === viewport()) ?? viewports[0]!)
  const backgroundPreset = computed(
    () => backgrounds.find((b) => b.id === background()) ?? backgrounds[0]!,
  )
  const dir = computed<'ltr' | 'rtl'>(
    () => locales.find((l) => l.id === locale())?.dir ?? 'ltr',
  )

  const brand = computed(() => THEMES.find((b) => b.id === brandId()) ?? THEMES[0]!)
  const theme = computed(() => tokens(brand(), dark()))
  const sel = computed<WorkbenchComponent | undefined>(() => catalog.components.find((c) => c.id === selId()) ?? catalog.components[0])
  const vals = computed(() => {
    const c = sel()
    if (!c) return {}
    const ov = values()[selId()]
    const merged = ov ? { ...defaultValues(c), ...ov } : defaultValues(c)
    // Applied at the LAST step, to the values the component actually renders —
    // not to the stored control values. Transforming those would make the
    // Controls panel show accented text as if the user had typed it, and the
    // expansion would compound on every re-read.
    return pseudoLocale() ? pseudoLocalizeValues(merged) : merged
  })
  const visibleGroups = computed(() => {
    const ids = new Set(search(query()))
    return groups.map((g) => ({ ...g, items: g.items.filter((i) => ids.has(i.id)) })).filter((g) => g.items.length > 0)
  })
  const fullTree = buildHierarchy(catalog.components)
  const tree = computed(() => filterHierarchy(fullTree, new Set(search(query()))))
  // Collapsed rather than expanded state, so the default needs no
  // initialisation pass: an unknown path is expanded.
  const collapsed = signal<ReadonlySet<string>>(new Set())
  const toggleGroup = (path: string) => {
    const next = new Set(collapsed())
    if (next.has(path)) next.delete(path)
    else next.add(path)
    collapsed.set(next)
  }
  const noResults = computed(() => visibleGroups().length === 0)

  const setValue = (id: string, key: string, v: unknown) => {
    const cur = values()[id]
    values.set({ ...values(), [id]: cur ? { ...cur, [key]: v } : { [key]: v } })
  }
  const reset = () => values.set({ ...values(), [selId()]: {} })

  const runPlay = async (compId: string, scenarioId: string) => {
    const comp = catalog.components.find((c) => c.id === compId)
    const scenario = comp?.scenarios?.find((s) => s.id === scenarioId)
    if (!comp || !scenario?.play) return
    selectScenario(compId, scenarioId)
    // One frame so the canvas has re-rendered with the scenario's args before
    // the script starts querying it.
    await new Promise((r) =>
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(r) : setTimeout(r, 0),
    )
    const root = previewEl
    if (!root) return
    try {
      await scenario.play({
        root,
        step: async (name, run) => {
          logAction(`▶ ${scenario.name}`, name)
          await run()
        },
      })
    } catch (err) {
      logAction(`▶ ${scenario.name}`, `FAILED: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const selectScenario = (compId: string, scenarioId: string) => {
    const comp = catalog.components.find((c) => c.id === compId)
    const scenario = comp?.scenarios?.find((s) => s.id === scenarioId)
    if (!comp || !scenario) return
    selId.set(compId)
    // REPLACE the component's stored values with the scenario's args (not a
    // merge — a scenario is a complete pinned state, and stale edits bleeding
    // through would render something the verdict never covered). Only args
    // with a matching editable control land; the rest (e.g. a generated
    // handler) are the render's business.
    const editable = new Set(comp.controls.map((c) => c.key))
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(scenario.args)) {
      if (editable.has(key)) next[key] = value
    }
    values.set({ ...values(), [compId]: next })
  }

  let actionSeq = 0
  const logAction = (name: string, detail: string) => {
    actionSeq += 1
    actions.set([{ id: actionSeq, name, detail, t: new Date().toLocaleTimeString([], { hour12: false }) }, ...actions()].slice(0, 24))
  }
  const clearActions = () => actions.set([])

  const searchOpen = signal(false)
  const sidebarW = signal(272)
  const panelW = signal(352)
  const sidebarOpen = signal(true)
  const panelOpen = signal(true)

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
    // A getter, so each render reads the CURRENT role rather than the one that
    // happened to be active when the context object was built.
    get can() {
      return permissions().can
    },
    // A getter, so a component reading it re-renders when the state changes.
    get query() {
      return queryResult()
    },
  }
  // The preview always renders inside a `PermissionsProvider` carrying the
  // ACTIVE role's recording instance. `ctx.can` covers a render that takes the
  // helper explicitly; the provider covers the idiomatic path — a component
  // (hand-written OR derived) calling `usePermissions()` — so the Roles panel
  // records consulted keys for scanned projects too, not just hand catalogs.
  // Read inside the accessor: a role flip re-renders the preview under the new
  // recording instance.
  const preview = (): VNodeChildAtom | VNodeChildAtom[] => {
    const entry = sel()
    if (!entry) return null
    return h(
      PermissionsProvider,
      { value: permissions().can },
      entry.render(vals(), renderCtx) as VNodeChildAtom,
    )
  }

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
      if (el2) el2.setAttribute('dir', dir())
    })
    if (typeof MutationObserver === 'undefined') return
    observer?.disconnect()
    observer = new MutationObserver(() => {
      if (previewEl) a11y.set(analyzeA11y(previewEl))
    })
    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true })
  }

  // Keep the URL in step with the view, so a reload restores it and a link
  // shares it.
  //
  // `replaceState`, never `pushState`: every keystroke in a text control moves
  // this state, and pushing would make the back button walk backwards through
  // typing rather than leaving the workbench. The serialised comparison means
  // an unchanged view writes nothing at all.
  //
  // Guarded on `location`/`history` because the workbench also renders under
  // SSR and in happy-dom, neither of which necessarily has both.
  if (typeof location !== 'undefined' && typeof history !== 'undefined') {
    // Both globals are aliased HERE, inside the guard, rather than read from
    // inside the effect. The effect callback is a nested scope, so a reader —
    // human or `pyreon/no-window-in-ssr` — cannot see the guard from in there;
    // hoisting the read makes the guarded-ness local to where it is used.
    const loc = location
    const hist = history
    let lastWritten: UrlState = initial
    effect(() => {
      const next: UrlState = {
        c: selId(),
        p: String(addon()),
        args: values()[selId()] ?? {},
        viewport: viewport(),
        background: background(),
        locale: locale(),
        brand: brandId(),
        dark: dark(),
      }
      if (!urlStateChanged(lastWritten, next)) return
      lastWritten = next
      // `nextQuery`, because both obvious names are taken in this scope:
      // `query` is the search-box signal and `search` is the search function.
      // Shadowing either would read as the URL state being related to search.
      const nextQuery = serializeUrlState(next)
      hist.replaceState(hist.state, '', nextQuery ? `?${nextQuery}` : loc.pathname)
    })
  }

  return {
    catalog, groups, total, title: opts.title ?? 'atlas', subtitle: opts.subtitle ?? '',
    brandId, dark, selId, query, zoomIdx, view, addon, actions,
    viewport, background, pseudo, outline, measure, locale, pseudoLocale, permissionSet, permissions, queryState, queryResult,
    previewElement: () => previewEl,
    viewports, backgrounds, locales, roles, viewportPreset, backgroundPreset, dir,
    brand, theme, sel, vals, visibleGroups, tree, collapsed, toggleGroup, noResults, a11y,
    setValue, selectScenario, runPlay, reset, logAction, clearActions, search, searchHits, preview, searchRef, focusSearch, previewRef,
    searchOpen, sidebarW, panelW, sidebarOpen, panelOpen,
  }
}
