import type { McpApiReferenceEntry } from '@pyreon/manifest'
import { type ApiEntry, API_REFERENCE } from '../api-reference'

// Compile-time assertion that `McpApiReferenceEntry` (declared in
// `@pyreon/manifest`) stays structurally identical to the local
// `ApiEntry` that `API_REFERENCE` is typed against. A drift in
// either direction — e.g. MCP adds `deprecated?: string`, or the
// manifest renderer starts emitting a new field — fails typecheck
// here BEFORE the generated `api-reference.ts` is produced.
//
// Why symmetric assertions: a one-sided `extends` only catches drift
// in one direction. `Equal<A, B>` is precise — fails if either side
// adds a field the other lacks.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
type Assert<T extends true> = T
// If the types drift (MCP or manifest adds / removes / renames a
// field), `Equal<...>` resolves to `false`, `Assert<false>` fails
// the constraint `T extends true`, and `tsc --noEmit` errors on
// this line. The `void` usage keeps the alias load-bearing at
// runtime so tree-shaking / unused-symbol lints don't strip it.
type _McpShapeInSync = Assert<Equal<McpApiReferenceEntry, ApiEntry>>
const _assertion: _McpShapeInSync = true
void _assertion

describe('api-reference', () => {
  it('has entries', () => {
    expect(Object.keys(API_REFERENCE).length).toBeGreaterThan(0)
  })

  it('entries have required fields', () => {
    for (const [key, entry] of Object.entries(API_REFERENCE)) {
      expect(entry.signature, `${key} missing signature`).toBeTruthy()
      expect(entry.example, `${key} missing example`).toBeTruthy()
    }
  })

  // Coverage for the T2.5.1 flip: @pyreon/flow's region now
  // regenerates from its manifest. These tests guard the observable
  // surface that MCP consumers see via the `get_api` tool — if a
  // future manifest refactor drops a key or accidentally renames
  // one, the failure surfaces HERE in addition to the
  // gen-docs --check drift check.
  describe('@pyreon/flow — manifest-driven region', () => {
    const EXPECTED_FLOW_KEYS = [
      'flow/createFlow',
      'flow/useFlow',
      'flow/Flow',
      'flow/Background',
      'flow/Controls',
      'flow/MiniMap',
      'flow/Handle',
      'flow/Panel',
    ]

    it.each(EXPECTED_FLOW_KEYS)('exposes %s with the full MCP shape', (key) => {
      const entry = API_REFERENCE[key]
      expect(entry, `${key} missing from API_REFERENCE`).toBeDefined()
      // Signature + example are required by the manifest renderer
      // (guaranteed non-empty by the manifest type). Notes come
      // from `summary` (always present in the manifest); mistakes
      // are optional per-entry.
      expect(entry!.signature).toBeTruthy()
      expect(entry!.example).toBeTruthy()
      expect(entry!.notes).toBeTruthy()
    })

    it('createFlow carries the enriched foot-gun catalog including the `direction: row` mistake', () => {
      // Regression guard for a hand-written mistake the first pass
      // of T2.5.1 accidentally dropped. Ensures future manifest
      // edits don't silently lose it again.
      const createFlow = API_REFERENCE['flow/createFlow']
      expect(createFlow?.mistakes).toContain("Using `direction: 'row'`")
    })

    it('createFlow notes carry the load-bearing architectural claims', () => {
      // Spot-checks that MCP consumers see the signal-native /
      // elkjs / no-D3 framing — the stuff that makes flow's API
      // understandable without opening source. A regression here
      // means the manifest summary lost density.
      const createFlow = API_REFERENCE['flow/createFlow']
      expect(createFlow?.notes).toContain('elkjs')
      expect(createFlow?.notes).toContain('no D3')
      expect(createFlow?.notes).toContain('signal-native')
    })

    it('Flow (container component) documents the mount-once invariant', () => {
      // Flow is new in the T2.5.1 flip — previously the hand-
      // written surface only covered `createFlow` + `useFlow`.
      // Assert the component + its load-bearing contract are both
      // reachable via MCP.
      const flow = API_REFERENCE['flow/Flow']
      expect(flow?.notes).toContain('mounts EXACTLY ONCE')
    })

    it('Handle (connection component) documents the distinct-id rule for multiple handles', () => {
      // Another T2.5.1-new entry. The multiple-handle id contract
      // is subtle; surface it for MCP consumers.
      const handle = API_REFERENCE['flow/Handle']
      expect(handle?.notes).toContain('multiple source or target handles')
      expect(handle?.mistakes).toContain('distinct `id`')
    })
  })

  describe('@pyreon/query — manifest-driven region', () => {
    const EXPECTED_QUERY_KEYS = [
      'query/QueryClientProvider',
      'query/useQuery',
      'query/useMutation',
      'query/useInfiniteQuery',
      'query/useQueries',
      'query/useSubscription',
      'query/useSSE',
      'query/useSuspenseQuery',
      'query/useSuspenseInfiniteQuery',
      'query/QuerySuspense',
      'query/useIsFetching',
      'query/useIsMutating',
      'query/QueryErrorResetBoundary',
      'query/useQueryErrorResetBoundary',
      'query/useQueryClient',
      'query/TanStack core re-exports',
    ]

    it.each(EXPECTED_QUERY_KEYS)('exposes %s with the full MCP shape', (key) => {
      const entry = API_REFERENCE[key]
      expect(entry, `${key} missing from API_REFERENCE`).toBeDefined()
      expect(entry!.signature).toBeTruthy()
      expect(entry!.example).toBeTruthy()
      expect(entry!.notes).toBeTruthy()
    })

    it('useQuery carries the enriched options-as-function explanation + 5 mistakes', () => {
      const entry = API_REFERENCE['query/useQuery']
      expect(entry?.notes).toContain('FUNCTION')
      expect(entry?.notes).toContain('fine-grained reactive signals')
      expect(entry?.mistakes?.split('\n').length).toBe(5)
    })

    it('useMutation explains the plain-object rationale + 3 mistakes', () => {
      const entry = API_REFERENCE['query/useMutation']
      expect(entry?.notes).toContain('plain OBJECT')
      expect(entry?.notes).toContain('imperative')
      expect(entry?.mistakes?.split('\n').length).toBe(3)
    })

    it('useSubscription documents auto-reconnect + 3 WebSocket foot-guns', () => {
      const entry = API_REFERENCE['query/useSubscription']
      expect(entry?.notes).toContain('auto-reconnect')
      expect(entry?.notes).toContain('QueryClient')
      expect(entry?.mistakes?.split('\n').length).toBe(3)
    })

    it('QuerySuspense warns about eager children', () => {
      const entry = API_REFERENCE['query/QuerySuspense']
      expect(entry?.mistakes).toContain('function')
    })

    it('useSSE documents the Last-Event-ID resumption', () => {
      const entry = API_REFERENCE['query/useSSE']
      expect(entry?.notes).toContain('Last-Event-ID')
    })

    it('TanStack core re-exports mentions QueryClient + dehydrate/hydrate for SSR consumers', () => {
      const entry = API_REFERENCE['query/TanStack core re-exports']
      expect(entry?.notes).toContain('QueryClient')
      expect(entry?.notes).toContain('dehydrate')
      expect(entry?.notes).toContain('hydrate')
      expect(entry?.notes).toContain('QueryKey')
    })

    it('useSuspenseInfiniteQuery carries boundary-requirement mistakes', () => {
      const entry = API_REFERENCE['query/useSuspenseInfiniteQuery']
      expect(entry?.mistakes?.split('\n').length).toBe(2)
      expect(entry?.mistakes).toContain('QuerySuspense')
    })

    it('useQueries warns about static arrays losing reactive tracking', () => {
      const entry = API_REFERENCE['query/useQueries']
      expect(entry?.mistakes?.split('\n').length).toBe(2)
      expect(entry?.mistakes).toContain('static array')
    })
  })

  describe('@pyreon/form — manifest-driven region', () => {
    const EXPECTED_FORM_KEYS = [
      'form/useForm',
      'form/useField',
      'form/useFieldArray',
      'form/useWatch',
      'form/useFormState',
      'form/FormProvider',
      'form/useFormContext',
    ]

    it.each(EXPECTED_FORM_KEYS)('exposes %s with the full MCP shape', (key) => {
      const entry = API_REFERENCE[key]
      expect(entry, `${key} missing from API_REFERENCE`).toBeDefined()
      expect(entry!.signature).toBeTruthy()
      expect(entry!.example).toBeTruthy()
      expect(entry!.notes).toBeTruthy()
    })

    it('useForm carries 5 mistakes covering validateOn + schema ordering', () => {
      const entry = API_REFERENCE['form/useForm']
      expect(entry?.mistakes?.split('\n').length).toBe(5)
      expect(entry?.notes).toContain('validateOn')
    })

    it('useFormContext warns about module-scope calls + generic omission', () => {
      const entry = API_REFERENCE['form/useFormContext']
      expect(entry?.mistakes?.split('\n').length).toBe(2)
      expect(entry?.mistakes).toContain('module scope')
    })

    it('useFieldArray documents the stable-key contract', () => {
      const entry = API_REFERENCE['form/useFieldArray']
      expect(entry?.mistakes?.split('\n').length).toBe(2)
      expect(entry?.mistakes).toContain('index-based keys')
      expect(entry?.notes).toContain('stable keys')
    })
  })

  describe('@pyreon/hooks — manifest-driven region', () => {
    const EXPECTED_HOOKS_KEYS = [
      'hooks/useControllableState',
      'hooks/useEventListener',
      'hooks/useClickOutside',
      'hooks/useElementSize',
      'hooks/useFocusTrap',
      'hooks/useBreakpoint',
      'hooks/useDebouncedValue',
      'hooks/useClipboard',
      'hooks/useDialog',
      'hooks/useTimeAgo',
      'hooks/useInfiniteScroll',
      'hooks/useMergedRef',
      'hooks/useUpdateEffect',
      'hooks/useIsomorphicLayoutEffect',
    ]

    it.each(EXPECTED_HOOKS_KEYS)('exposes %s with the full MCP shape', (key) => {
      const entry = API_REFERENCE[key]
      expect(entry, `${key} missing from API_REFERENCE`).toBeDefined()
      expect(entry!.signature).toBeTruthy()
      expect(entry!.example).toBeTruthy()
      expect(entry!.notes).toBeTruthy()
    })

    it('useEventListener documents the cleanup contract + 2 mistakes', () => {
      const entry = API_REFERENCE['hooks/useEventListener']
      expect(entry?.mistakes?.split('\n').length).toBe(2)
      expect(entry?.mistakes).toContain('addEventListener')
      expect(entry?.notes).toContain('automatic cleanup')
    })

    it('useControllableState documents the canonical pattern + 2 mistakes', () => {
      const entry = API_REFERENCE['hooks/useControllableState']
      expect(entry?.mistakes?.split('\n').length).toBe(2)
      expect(entry?.notes).toContain('controlled/uncontrolled')
    })

    it('useFocusTrap documents the active-signal requirement', () => {
      const entry = API_REFERENCE['hooks/useFocusTrap']
      expect(entry?.mistakes?.split('\n').length).toBe(2)
      expect(entry?.mistakes).toContain('active')
    })

    it('useInfiniteScroll documents the sentinel placement + enabled guard', () => {
      const entry = API_REFERENCE['hooks/useInfiniteScroll']
      expect(entry?.mistakes?.split('\n').length).toBe(2)
      expect(entry?.mistakes).toContain('overflow')
    })
  })

  describe('@pyreon/reactivity — manifest-driven region', () => {
    const EXPECTED_REACTIVITY_KEYS = [
      'reactivity/signal',
      'reactivity/computed',
      'reactivity/effect',
      'reactivity/batch',
      'reactivity/onCleanup',
      'reactivity/watch',
      'reactivity/createStore',
      'reactivity/untrack',
    ]

    it.each(EXPECTED_REACTIVITY_KEYS)('exposes %s with the full MCP shape', (key) => {
      const entry = API_REFERENCE[key]
      expect(entry, `${key} missing from API_REFERENCE`).toBeDefined()
      expect(entry!.signature).toBeTruthy()
      expect(entry!.example).toBeTruthy()
      expect(entry!.notes).toBeTruthy()
    })

    it('signal carries 6 mistakes covering the callable-function contract', () => {
      const entry = API_REFERENCE['reactivity/signal']
      expect(entry?.mistakes?.split('\n').length).toBe(6)
      expect(entry?.notes).toContain('CALLABLE FUNCTION')
    })

    it('signal notes explain the .set() / .update() / .peek() API', () => {
      const entry = API_REFERENCE['reactivity/signal']
      expect(entry?.notes).toContain('.set(')
      expect(entry?.notes).toContain('.update(')
      expect(entry?.notes).toContain('.peek()')
    })

    it('effect documents the auto-tracking contract + 4 mistakes', () => {
      const entry = API_REFERENCE['reactivity/effect']
      expect(entry?.mistakes?.split('\n').length).toBe(4)
      expect(entry?.notes).toContain('auto-tracks')
    })

    it('batch documents the pointer-swap implementation', () => {
      const entry = API_REFERENCE['reactivity/batch']
      expect(entry?.notes).toContain('pointer swap')
    })
  })

  describe('@pyreon/core — manifest-driven region', () => {
    const EXPECTED_CORE_KEYS = [
      'core/h',
      'core/Fragment',
      'core/onMount',
      'core/onUnmount',
      'core/onUpdate',
      'core/onErrorCaptured',
      'core/createContext',
      'core/createReactiveContext',
      'core/provide',
      'core/useContext',
      'core/Show',
      'core/Switch',
      'core/Match',
      'core/For',
      'core/Suspense',
      'core/ErrorBoundary',
      'core/lazy',
      'core/Dynamic',
      'core/cx',
      'core/splitProps',
      'core/mergeProps',
      'core/createUniqueId',
      'core/Portal',
      'core/mapArray',
      'core/createRef',
      'core/untrack',
      'core/ExtractProps',
      'core/HigherOrderComponent',
    ]

    it.each(EXPECTED_CORE_KEYS)('exposes %s with the full MCP shape', (key) => {
      const entry = API_REFERENCE[key]
      expect(entry, `${key} missing from API_REFERENCE`).toBeDefined()
      expect(entry!.signature).toBeTruthy()
      expect(entry!.example).toBeTruthy()
      expect(entry!.notes).toBeTruthy()
    })

    it('h() documents the VNode creation contract + JSX compilation', () => {
      const entry = API_REFERENCE['core/h']
      expect(entry?.notes).toContain('JSX')
      expect(entry?.notes).toContain('VNode')
      expect(entry?.mistakes?.split('\n').length).toBe(4)
    })

    it('For documents the by-not-key contract', () => {
      const entry = API_REFERENCE['core/For']
      expect(entry?.notes).toContain('by')
      expect(entry?.mistakes).toContain('key')
    })

    it('splitProps documents the reactivity-preserving contract', () => {
      const entry = API_REFERENCE['core/splitProps']
      expect(entry?.notes).toContain('reactivity')
      expect(entry?.mistakes?.split('\n').length).toBe(3)
    })

    it('onMount documents cleanup return value', () => {
      const entry = API_REFERENCE['core/onMount']
      expect(entry?.notes).toContain('cleanup')
      expect(entry?.mistakes?.split('\n').length).toBe(4)
    })
  })

  describe('@pyreon/runtime-dom — manifest-driven region', () => {
    const EXPECTED_RUNTIME_DOM_KEYS = [
      'runtime-dom/mount',
      'runtime-dom/render',
      'runtime-dom/hydrateRoot',
      'runtime-dom/Transition',
      'runtime-dom/TransitionGroup',
      'runtime-dom/KeepAlive',
      'runtime-dom/_tpl',
      'runtime-dom/_bindText',
      'runtime-dom/sanitizeHtml',
    ]

    it.each(EXPECTED_RUNTIME_DOM_KEYS)('exposes %s with the full MCP shape', (key) => {
      const entry = API_REFERENCE[key]
      expect(entry, `${key} missing from API_REFERENCE`).toBeDefined()
      expect(entry!.signature).toBeTruthy()
      expect(entry!.example).toBeTruthy()
      expect(entry!.notes).toBeTruthy()
    })

    it('mount documents the container + unmount contract + 4 mistakes', () => {
      const entry = API_REFERENCE['runtime-dom/mount']
      expect(entry?.notes).toContain('container')
      expect(entry?.notes).toContain('unmount')
      expect(entry?.mistakes?.split('\n').length).toBe(4)
    })

    it('Transition documents the 5s safety timeout', () => {
      const entry = API_REFERENCE['runtime-dom/Transition']
      expect(entry?.notes).toContain('5')
      expect(entry?.mistakes?.split('\n').length).toBe(3)
    })
  })

  describe('@pyreon/router — manifest-driven region', () => {
    const EXPECTED_ROUTER_KEYS = [
      'router/createRouter',
      'router/RouterProvider',
      'router/RouterView',
      'router/RouterLink',
      'router/useRouter',
      'router/useRoute',
      'router/useIsActive',
      'router/useTypedSearchParams',
      'router/useTransition',
      'router/useMiddlewareData',
      'router/useLoaderData',
      'router/useSearchParams',
      'router/useBlocker',
      'router/onBeforeRouteLeave',
      'router/onBeforeRouteUpdate',
    ]

    it.each(EXPECTED_ROUTER_KEYS)('exposes %s with the full MCP shape', (key) => {
      const entry = API_REFERENCE[key]
      expect(entry, `${key} missing from API_REFERENCE`).toBeDefined()
      expect(entry!.signature).toBeTruthy()
      expect(entry!.example).toBeTruthy()
      expect(entry!.notes).toBeTruthy()
    })

    it('createRouter carries 4 mistakes covering hash mode + catch-all', () => {
      const entry = API_REFERENCE['router/createRouter']
      expect(entry?.notes).toContain('routes')
      expect(entry?.notes).toContain('Router')
      expect(entry?.mistakes?.split('\n').length).toBe(4)
    })

    it('useRouter documents the View Transition await semantics', () => {
      const entry = API_REFERENCE['router/useRouter']
      expect(entry?.notes).toContain('updateCallbackDone')
      expect(entry?.mistakes?.split('\n').length).toBe(3)
    })

    it('useIsActive documents segment-aware prefix matching', () => {
      const entry = API_REFERENCE['router/useIsActive']
      expect(entry?.notes).toContain('Segment')
    })

    it('useBlocker documents the beforeunload integration', () => {
      const entry = API_REFERENCE['router/useBlocker']
      expect(entry?.notes).toContain('beforeunload')
    })
  })

  describe('@pyreon/store — manifest-driven region', () => {
    it.each(['store/defineStore', 'store/addStorePlugin', 'store/setStoreRegistryProvider', 'store/resetStore', 'store/resetAllStores'])('exposes %s', (key) => {
      const e = API_REFERENCE[key]; expect(e).toBeDefined(); expect(e!.signature).toBeTruthy()
    })
    it('defineStore documents composition stores', () => {
      expect(API_REFERENCE['store/defineStore']?.notes).toContain('composition')
    })
  })

  describe('@pyreon/state-tree — manifest-driven region', () => {
    it.each(['state-tree/model', 'state-tree/getSnapshot', 'state-tree/applySnapshot', 'state-tree/onPatch', 'state-tree/applyPatch', 'state-tree/addMiddleware'])('exposes %s', (key) => {
      const e = API_REFERENCE[key]; expect(e).toBeDefined(); expect(e!.signature).toBeTruthy()
    })
    it('model documents structured reactive state', () => {
      expect(API_REFERENCE['state-tree/model']?.notes).toContain('model')
    })
  })

  describe('@pyreon/permissions — manifest-driven region', () => {
    it.each(['permissions/createPermissions', 'permissions/PermissionsProvider', 'permissions/usePermissions'])('exposes %s', (key) => {
      const e = API_REFERENCE[key]; expect(e).toBeDefined(); expect(e!.signature).toBeTruthy()
    })
    it('createPermissions documents reactive callable', () => {
      expect(API_REFERENCE['permissions/createPermissions']?.notes).toContain('callable')
    })
  })

  describe('@pyreon/machine — manifest-driven region', () => {
    it.each(['machine/createMachine'])('exposes %s', (key) => {
      const e = API_REFERENCE[key]; expect(e).toBeDefined(); expect(e!.signature).toBeTruthy()
    })
    it('createMachine documents type-safe transitions', () => {
      expect(API_REFERENCE['machine/createMachine']?.notes).toContain('transition')
    })
  })

  describe('@pyreon/i18n — manifest-driven region', () => {
    it.each(['i18n/createI18n', 'i18n/I18nProvider', 'i18n/useI18n', 'i18n/Trans', 'i18n/interpolate'])('exposes %s', (key) => {
      const e = API_REFERENCE[key]; expect(e).toBeDefined(); expect(e!.signature).toBeTruthy()
    })
    it('createI18n documents two entry points', () => {
      expect(API_REFERENCE['i18n/createI18n']?.notes).toContain('locale')
    })
  })

  describe('@pyreon/storage — manifest-driven region', () => {
    it.each(['storage/useStorage', 'storage/useCookie', 'storage/useIndexedDB', 'storage/createStorage'])('exposes %s', (key) => {
      const e = API_REFERENCE[key]; expect(e).toBeDefined(); expect(e!.signature).toBeTruthy()
    })
    it('useStorage documents cross-tab sync', () => {
      expect(API_REFERENCE['storage/useStorage']?.notes).toContain('syncs across browser tabs')
    })
  })

  describe('@pyreon/toast — manifest-driven region', () => {
    it.each(['toast/toast', 'toast/Toaster'])('exposes %s', (key) => {
      const e = API_REFERENCE[key]; expect(e).toBeDefined(); expect(e!.signature).toBeTruthy()
    })
    it('toast documents imperative API', () => {
      expect(API_REFERENCE['toast/toast']?.notes).toContain('toast')
    })
  })

  describe('@pyreon/rx — manifest-driven region', () => {
    it.each(['rx/rx', 'rx/pipe', 'rx/filter'])('exposes %s', (key) => {
      const e = API_REFERENCE[key]; expect(e).toBeDefined(); expect(e!.signature).toBeTruthy()
    })
    it('rx namespace documents Signal overloading', () => {
      expect(API_REFERENCE['rx/rx']?.notes).toContain('Signal')
    })
  })
})
