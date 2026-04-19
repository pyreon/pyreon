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
  })
})
