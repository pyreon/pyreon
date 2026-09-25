/**
 * The workbench's reactive state, built once from a catalog. Split out of the
 * shell so each `views/*` file reads a single typed `model` instead of a dozen
 * threaded props. Everything here is signals + computeds + callbacks — no DOM.
 */
import { h, type VNodeChildAtom } from '@pyreon/core'
import { PermissionsProvider } from '@pyreon/permissions'
import { batch, computed, effect, isClient, signal, type Computed, type Effect, type Signal } from '@pyreon/reactivity'
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
import {
  componentFromPath,
  componentUrl,
  editedArgs,
  parseUrlState,
  pathBase,
  serializeUrlState,
  urlStateChanged,
  type UrlDefaults,
  type UrlState,
} from './url-state'
import type { CatalogGroup, WorkbenchCatalog, WorkbenchComponent } from './catalog'
import { buildSearchIndex, defaultValues, groupComponents } from './catalog'
import {
  ancestorPaths,
  browseOrder,
  buildHierarchy,
  filterHierarchy,
  mergeOwners,
  ownerPaths,
  type HierarchyNode,
} from './hierarchy'
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
  /** The ⌘K dialog's transient query — cleared when the dialog closes. */
  query: Signal<string>
  /**
   * The sidebar's persistent filter. Distinct from `query` on purpose: the
   * dialog's query is cleared on every exit, so a tree filtered by it was a
   * tree that could never stay filtered — 108 rows, always.
   */
  filter: Signal<string>
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
  /**
   * Component ids in the order the sidebar SHOWS them (filtered tree, parts
   * after their parent, collapsed groups skipped) — what ↑↓ walks.
   */
  browseIds: Computed<string[]>
  /**
   * Collapsed group PATHS as the user left them. Plain folders start
   * expanded; a folder OWNED by a component (its part list) starts collapsed.
   */
  collapsed: Signal<ReadonlySet<string>>
  /**
   * Is this folder collapsed ON SCREEN? While the sidebar filter is active
   * every folder is open — a match hidden inside a collapsed part list read as
   * "the filter found nothing".
   */
  isCollapsed: (path: string) => boolean
  toggleGroup: (path: string) => void
  noResults: Computed<boolean>
  /** Components the sidebar filter currently matches (== `total` when unfiltered). */
  matchCount: Computed<number>
  /**
   * The scenario the canvas is showing EXACTLY — set when one is applied,
   * cleared by any edit, and `Default` when the component has no edits at all.
   * `null` means "edited away from every scenario".
   */
  activeScenario: Computed<string | null>
  /**
   * Bumped after every preview render settles (the same observer that
   * re-probes a11y). Anything that needs to know what the LAST render did —
   * which permission keys it consulted — reads it to re-evaluate.
   */
  renderTick: Signal<number>
  /** Narrow viewport (≤900px): the sidebar is a drawer and the panels a sheet. */
  compact: Signal<boolean>
  /** Compact-mode sidebar drawer. Not persisted — a drawer is transient. */
  drawerOpen: Signal<boolean>
  /** Compact-mode addon bottom sheet. Not persisted. */
  sheetOpen: Signal<boolean>
  /** Live a11y verdict for the RENDERED preview (re-probed after each render). */
  a11y: Signal<A11yReport>
  /** True when the last render left the preview surface with no DOM at all. */
  previewEmpty: Signal<boolean>
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
  // ONE index. The ranked dialog search and the id-only sidebar filter read
  // the same structure; building it twice cost two full passes over every
  // control key, enum option and scenario name at boot, for two structures
  // that could disagree.
  const searchHits = buildSearchIndex(catalog)
  const order = new Map(catalog.components.map((c, i) => [c.id, i]))
  const search = (q: string): string[] =>
    searchHits(q)
      .map((hit) => hit.id)
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
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
  // Chrome preferences survive a reload without a link — brand, appearance,
  // panel widths, what is open. A link still wins for what it names.
  const prefs = readPrefs()
  // On a narrow screen both side panels start CLOSED: sidebar (272px) and
  // addon panel (352px) are fixed-width flex siblings of the canvas, and
  // below ~900px they left it no room at all — the canvas disappeared and the
  // page read as broken. A stored preference still wins.
  const narrow =
    isClient && typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches

  // Path URLs — `/atlas/button/` rather than `/atlas/?c=button`.
  //
  // Opt-in via a global the HOST sets, not something inferred, because writing
  // a path is only safe where a page actually exists at it. `atlas build`
  // emits a directory per component and sets this; `atlas dev` sets it too
  // (its middleware already serves the shell for any extensionless GET). A
  // workbench EMBEDDED in someone else's app sets nothing and keeps the
  // query-string behaviour — writing `/button/` there would 404 on reload,
  // because that app's router has never heard of the route.
  const hasRoutes = isClient && (globalThis as { __ATLAS_ROUTES__?: boolean }).__ATLAS_ROUTES__ === true
  const catalogIds = catalog.components.map((c) => c.id)
  const pathId = hasRoutes ? componentFromPath(location.pathname, catalogIds) : undefined
  // The path WINS over `?c=`. Both are only ever present together on a link
  // written before this existed, and the path is the more specific statement.
  if (pathId !== undefined) initial.c = pathId
  const routeBase = hasRoutes ? pathBase(location.pathname, pathId) : ''

  const brandId = signal(initial.brand ?? prefs.brand ?? 'ember')
  const dark = signal(initial.dark ?? prefs.dark ?? true)
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
  // The unfiltered tree, owners folded in. Built BEFORE the selection because
  // the default selection is read off it.
  const fullTree = mergeOwners(buildHierarchy(catalog.components))
  // No link → the FIRST ROW THE SIDEBAR SHOWS, not `catalog.components[0]`.
  // The two orders differ (a derived catalog lists nested folders first), and
  // opening on a component three screens down the tree, with nothing
  // highlighted where the eye starts, read as "nothing is selected".
  const firstShown = browseOrder(fullTree, new Set())[0]
  const selId = signal(linkedComponent?.id ?? firstShown ?? catalog.components[0]?.id ?? '')

  // The state a component OPENS on: its `Default` scenario's args, over the
  // control defaults.
  //
  // A scenario's args are the WHOLE pinned state, not only the editable
  // controls — a `Tree`'s `data`, a `Combobox`'s `options`, a `Dialog`'s
  // `open`. Rendering from control defaults alone mounted every data-driven
  // component with nothing to show, while the sidebar listed a verified
  // scenario one click away. Every read of a component's values starts here,
  // so a fresh selection, a reset, and a link that edits one key all keep the
  // rest of the scenario. Only a scenario NAMED `Default` counts: a derived
  // catalog always has one, and a hand-written catalog's first scenario is an
  // extra state, not the opening one — its controls' defaults are.
  const initialArgs = (c: WorkbenchComponent | undefined): Record<string, unknown> => {
    const scenario = c?.scenarios?.find((s) => s.name === 'Default')
    return scenario ? { ...scenario.args } : {}
  }
  const query = signal('')
  const filter = signal('')
  const zoomIdx = signal(2) // 100%
  const view = signal<View>(
    initial.view === 'docs' || initial.view === 'lab' ? initial.view : 'canvas',
  )
  const addon = signal<Addon>(initial.p ?? 'controls')
  // Args from the link belong to the component the link named.
  const values = signal<Record<string, Record<string, unknown>>>(
    linkedComponent && initial.args
      ? { [linkedComponent.id]: { ...initialArgs(linkedComponent), ...initial.args } }
      : {},
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
  const pseudo = signal<PseudoId | null>(
    (['hover', 'focus', 'active', 'disabled'] as const).find((p) => p === initial.pseudo) ?? null,
  )
  const outline = signal(false)
  const measure = signal(false)
  const locale = signal<string>(
    locales.find((l) => l.id === initial.locale)?.id ?? locales[0]?.id ?? 'en',
  )
  // i18n STRESS, distinct from the locale switcher next to it: the switcher
  // changes writing direction, this changes every string's LENGTH. Off by
  // default — it is a deliberate check, not a viewing mode.
  const pseudoLocale = signal(false)
  const permissionSet = signal(roles.find((r) => r.id === initial.role)?.id ?? roles[0]?.id ?? 'anonymous')
  const queryState = signal<QueryStateId>(
    (['success', 'loading', 'error', 'refetching'] as const).find((q) => q === initial.query) ??
      'success',
  )

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
    const ov = values()[selId()] ?? initialArgs(c)
    const merged = { ...defaultValues(c), ...ov }
    // Applied at the LAST step, to the values the component actually renders —
    // not to the stored control values. Transforming those would make the
    // Controls panel show accented text as if the user had typed it, and the
    // expansion would compound on every re-read.
    return pseudoLocale() ? pseudoLocalizeValues(merged) : merged
  })
  // The sidebar filters by `filter`, never by the dialog's `query`.
  const visibleIds = computed(() => new Set(search(filter())))
  const visibleGroups = computed(() => {
    const ids = visibleIds()
    return groups.map((g) => ({ ...g, items: g.items.filter((i) => ids.has(i.id)) })).filter((g) => g.items.length > 0)
  })
  const rawTree = buildHierarchy(catalog.components)
  // Filter the RAW tree, then fold owners in — so an owner the filter hides
  // leaves a plain folder behind rather than a row for a non-match.
  const tree = computed(() => {
    const ids = visibleIds()
    return ids.size === total ? fullTree : mergeOwners(filterHierarchy(rawTree, ids))
  })
  // Collapsed rather than expanded state, so an unknown path is expanded.
  // Part lists (owned folders) start collapsed: the tree opens as the list of
  // COMPONENTS, and a part is one caret away — ~40 fewer rows to scan (and to
  // mount) on a design-system-sized catalog.
  const collapsed = signal<ReadonlySet<string>>(new Set(ownerPaths(fullTree)))
  const filtering = computed(() => filter().trim() !== '')
  const NONE: ReadonlySet<string> = new Set()
  const shownCollapsed = computed(() => (filtering() ? NONE : collapsed()))
  const isCollapsed = (path: string) => shownCollapsed().has(path)
  const toggleGroup = (path: string) => {
    const next = new Set(collapsed())
    if (next.has(path)) next.delete(path)
    else next.add(path)
    collapsed.set(next)
  }
  // Reveal: whenever the selection changes (a link, ⌘K, ↑↓, a docs scenario
  // link), open every folder above its row. Only on a CHANGE — collapsing the
  // folder that holds the selection is a deliberate act and must stick.
  const reveal = (id: string) => {
    const need = ancestorPaths(fullTree, id).filter((p) => collapsed.peek().has(p))
    if (need.length === 0) return
    const next = new Set(collapsed.peek())
    for (const p of need) next.delete(p)
    collapsed.set(next)
  }
  reveal(selId.peek())
  selId.subscribe(() => reveal(selId.peek()))
  const noResults = computed(() => tree().length === 0)
  const matchCount = computed(() => visibleIds().size)
  const browseIds = computed(() => browseOrder(tree(), shownCollapsed()))

  // The scenario last APPLIED, per component. Any edit clears it — the canvas
  // no longer shows the pinned state that scenario's verdict covered.
  const applied = signal<Record<string, string>>({})
  const clearApplied = (id: string) => {
    if (!(id in applied.peek())) return
    const next = { ...applied.peek() }
    delete next[id]
    applied.set(next)
  }
  const setValue = (id: string, key: string, v: unknown) => {
    const cur = values()[id] ?? initialArgs(catalog.components.find((c) => c.id === id))
    values.set({ ...values(), [id]: { ...cur, [key]: v } })
    clearApplied(id)
  }
  // Forget the edits; the component falls back to its opening scenario.
  const reset = () => {
    const next = { ...values() }
    delete next[selId()]
    values.set(next)
    clearApplied(selId())
  }
  const activeScenario = computed<string | null>(() => {
    const id = selId()
    const pinned = applied()[id]
    if (pinned) return pinned
    // No edits at all → the component is showing its opening state, which IS
    // the `Default` scenario when it has one.
    if (values()[id] !== undefined) return null
    return sel()?.scenarios?.find((s) => s.name === 'Default')?.id ?? null
  })

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
    // One notification for the three writes — the canvas, the controls and
    // the sidebar's scenario marker all settle together.
    batch(() => {
      selId.set(compId)
      // REPLACE the component's stored values with the scenario's args (not a
      // merge — a scenario is a complete pinned state, and stale edits bleeding
      // through would render something the verdict never covered). ALL of the
      // args, not only the ones with an editable control: a `Tree` scenario is
      // its `data`, and filtering to controls was how selecting it rendered an
      // empty tree.
      values.set({ ...values(), [compId]: { ...scenario.args } })
      applied.set({ ...applied.peek(), [compId]: scenarioId })
    })
  }

  let actionSeq = 0
  const logAction = (name: string, detail: string) => {
    actionSeq += 1
    actions.set([{ id: actionSeq, name, detail, t: new Date().toLocaleTimeString([], { hour12: false }) }, ...actions()].slice(0, 24))
  }
  const clearActions = () => actions.set([])

  const searchOpen = signal(false)
  const sidebarW = signal(prefs.sidebarW ?? 272)
  const panelW = signal(prefs.panelW ?? 352)
  const sidebarOpen = signal(prefs.sidebarOpen ?? !narrow)
  const panelOpen = signal(prefs.panelOpen ?? !narrow)
  // Compact layout is its own state, not the desktop flags reinterpreted: a
  // desktop preference of "sidebar open" must not open a drawer over the
  // canvas the moment the same workbench is viewed on a phone.
  const compact = signal(narrow)
  const drawerOpen = signal(false)
  const sheetOpen = signal(false)
  const renderTick = signal(0)
  effect(() => {
    writePrefs({
      brand: brandId(),
      dark: dark(),
      sidebarW: sidebarW(),
      panelW: panelW(),
      sidebarOpen: sidebarOpen(),
      panelOpen: panelOpen(),
    })
  })

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
  // Written only when a CHECK changed: the observer below fires per mutation,
  // and a fresh report object on every one re-rendered the panel rows under
  // the cursor — the highlight the panel paints on hover is itself a mutation
  // of the observed subtree.
  const setA11y = (next: A11yReport) => {
    if (JSON.stringify(next.checks) !== JSON.stringify(a11y.peek().checks)) a11y.set(next)
  }
  // Did the last render leave the surface EMPTY — no element, no text? The
  // canvas says so out loud; a blank stage next to a healthy sidebar read as
  // "the workbench is broken" when it was the component rendering nothing.
  const previewEmpty = signal(false)
  // A component that PORTALS (a dialog, a drawer) leaves the surface empty
  // while its DOM sits on `document.body` — the runtime brackets portaled
  // content in `<!--portal-->…<!--/portal-->` markers, and one on the body is
  // what says the render went somewhere rather than nowhere.
  const portaled = () =>
    isClient &&
    [...document.body.childNodes].some((n) => n.nodeType === 8 && (n as Comment).data === 'portal')
  const isEmpty = (el: HTMLElement) =>
    el.childElementCount === 0 && (el.textContent ?? '').trim().length === 0 && !portaled()
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
    setA11y(analyzeA11y(el))
    previewEmpty.set(isEmpty(el))
    // Writing direction is applied IMPERATIVELY to the captured element rather
    // than as a `dir={…}` prop: an accessor-valued generic attribute is not
    // forwarded through rocketstyle → Element (it silently lands as no attribute
    // at all, verified in a browser), and the compiler-wrapped value form would
    // go static in the prebuilt lib. Writing the attribute keeps BOTH the
    // semantics (assistive tech, `:dir()` selectors) and the CSS direction,
    // which a `direction:` dimension alone would not give.
    stopDir ??= effect(() => {
      // Read the signal BEFORE the element guard: an effect whose only
      // reactive read sits behind a non-reactive guard subscribes to
      // nothing when the guard short-circuits on the first run and then
      // never re-runs (pyreon/no-guard-only-signal-reads-in-effect).
      // Here the effect is created only after `previewEl` is captured,
      // so the guard was truthy in practice — hoisting removes the
      // fragility without changing behavior.
      const d = dir()
      const el2 = previewEl
      if (el2) el2.setAttribute('dir', d)
    })
    if (typeof MutationObserver === 'undefined') return
    observer?.disconnect()
    // Coalesced into one frame: a component animating through attribute
    // writes (a progress bar, a toast timer) would otherwise re-analyse the
    // whole subtree on every tick.
    let scheduled = false
    observer = new MutationObserver(() => {
      if (scheduled) return
      scheduled = true
      const run = () => {
        scheduled = false
        const target = previewEl
        if (!target) return
        batch(() => {
          setA11y(analyzeA11y(target))
          previewEmpty.set(isEmpty(target))
          renderTick.set(renderTick.peek() + 1)
        })
      }
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
      else run()
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
    // What the workbench opens on with NO parameters — the first preset of
    // each per-project family — so a link states only what differs from it.
    const urlDefaults: UrlDefaults = {
      viewport: viewports[0]?.id ?? 'full',
      background: backgrounds[0]?.id ?? 'theme',
      locale: locales[0]?.id ?? 'en',
      role: roles[0]?.id ?? 'anonymous',
    }
    effect(() => {
      // Only the EDITS travel in the link — the keys that differ from the
      // opening scenario. The scenario itself is reconstructable from the
      // catalog, and a `Tree`'s whole `data` in every URL is not a link
      // anyone pastes.
      const next: UrlState = {
        c: selId(),
        p: String(addon()),
        args: editedArgs(values()[selId()], initialArgs(sel())),
        viewport: viewport(),
        background: background(),
        locale: locale(),
        brand: brandId(),
        dark: dark(),
        view: view(),
        ...(pseudo() ? { pseudo: pseudo() as string } : {}),
        query: queryState(),
        role: permissionSet(),
      }
      if (!urlStateChanged(lastWritten, next, urlDefaults)) return
      lastWritten = next
      // `nextQuery`, because both obvious names are taken in this scope:
      // `query` is the search-box signal and `search` is the search function.
      // Shadowing either would read as the URL state being related to search.
      //
      // With path routes the component moves OUT of the query — carrying it in
      // both would let them disagree, and a URL that says `/button/?c=modal`
      // has no defensible reading.
      // `delete` on a copy rather than spreading `c: undefined` — under
      // `exactOptionalPropertyTypes` an explicit `undefined` is not the same as
      // an absent optional property, and the spread does not typecheck.
      let forQuery: UrlState = next
      if (hasRoutes) {
        forQuery = { ...next }
        delete forQuery.c
      }
      const nextQuery = serializeUrlState(forQuery, urlDefaults)
      if (hasRoutes) {
        // An ABSOLUTE path, not the bare `?query` below. That form resolves
        // against the current directory, so once the URL is `/atlas/button/`
        // it would keep the stale segment and only swap the query — the exact
        // disagreement this branch exists to prevent.
        hist.replaceState(hist.state, '', componentUrl(routeBase, next.c ?? '', nextQuery))
        return
      }
      hist.replaceState(hist.state, '', nextQuery ? `?${nextQuery}` : loc.pathname)
    })
  }

  return {
    catalog, groups, total, title: opts.title ?? 'atlas', subtitle: opts.subtitle ?? '',
    brandId, dark, selId, query, filter, zoomIdx, view, addon, actions,
    viewport, background, pseudo, outline, measure, locale, pseudoLocale, permissionSet, permissions, queryState, queryResult,
    previewElement: () => previewEl,
    viewports, backgrounds, locales, roles, viewportPreset, backgroundPreset, dir,
    brand, theme, sel, vals, visibleGroups, tree, browseIds, collapsed, isCollapsed, toggleGroup, noResults, matchCount, activeScenario, renderTick, a11y, previewEmpty,
    setValue, selectScenario, runPlay, reset, logAction, clearActions, search, searchHits, preview, searchRef, focusSearch, previewRef,
    searchOpen, sidebarW, panelW, sidebarOpen, panelOpen, compact, drawerOpen, sheetOpen,
  }
}

// ── Persisted chrome preferences ──────────────────────────────────────────
//
// `localStorage` is a per-viewer convenience, never a source of truth: a read
// can throw (a private window, blocked site data) and comes back empty on
// another device, so every read and write is guarded and the model renders
// identically without it.
const PREFS_KEY = 'atlas:prefs'

interface Prefs {
  brand?: string
  dark?: boolean
  sidebarW?: number
  panelW?: number
  sidebarOpen?: boolean
  panelOpen?: boolean
}

function readPrefs(): Prefs {
  if (!isClient) return {}
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const p = parsed as Record<string, unknown>
    const out: Prefs = {}
    if (typeof p.brand === 'string') out.brand = p.brand
    if (typeof p.dark === 'boolean') out.dark = p.dark
    if (typeof p.sidebarW === 'number' && Number.isFinite(p.sidebarW)) out.sidebarW = p.sidebarW
    if (typeof p.panelW === 'number' && Number.isFinite(p.panelW)) out.panelW = p.panelW
    if (typeof p.sidebarOpen === 'boolean') out.sidebarOpen = p.sidebarOpen
    if (typeof p.panelOpen === 'boolean') out.panelOpen = p.panelOpen
    return out
  } catch {
    return {}
  }
}

function writePrefs(prefs: Prefs): void {
  if (!isClient) return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage unavailable — the preference simply does not survive a reload.
  }
}
