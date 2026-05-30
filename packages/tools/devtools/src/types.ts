// --- Serialized component entry (no DOM references) ---

export interface SerializedEntry {
  id: string
  name: string
  parentId: string | null
  childIds: string[]
}

// --- Live framework hook contract ---
// Structural mirror of @pyreon/runtime-dom's exported `PyreonDevtools` /
// `DevtoolsComponentEntry`. The page-hook runs in the inspected page's
// world and must NOT import framework code, so the shape is declared
// here — and pinned to the real framework surface by a compile-time
// assignability check in `src/tests/framework-integration.test.ts`.

export interface DevtoolsComponentEntry {
  id: string
  name: string
  /** First DOM element produced by this component, if any */
  el: Element | null
  parentId: string | null
  childIds: string[]
}

// --- Reactive graph contract (mirrors @pyreon/reactivity's
// reactive-devtools module, surfaced on the hook by @pyreon/runtime-dom).
// The `reactive` namespace is OPTIONAL: frameworks built before the
// Foundation PR don't expose it, so the Signals/Graph/Effects/Profiler/
// Console tabs degrade to an explicit "needs @pyreon/runtime-dom ≥ x"
// notice instead of breaking. Pinned to the real surface by the
// compile-time check in src/tests/framework-integration.test.ts.

export type ReactiveNodeKind = 'signal' | 'derived' | 'effect'

export interface ReactiveNode {
  id: number
  kind: ReactiveNodeKind
  name: string
  /** Bounded string preview of the current value (signals/derived). */
  value: string
  /** Live downstream subscriber count. */
  subscribers: number
  /** Total fires/recomputes since activation. */
  fires: number
  /** `performance.now()` of the most recent fire, or null. */
  lastFire: number | null
}

export interface ReactiveEdge {
  from: number
  to: number
}

export interface ReactiveGraph {
  nodes: ReactiveNode[]
  edges: ReactiveEdge[]
}

export interface ReactiveFire {
  id: number
  ts: number
}

// Exact structural mirror of @pyreon/runtime-dom's `PyreonReactiveDevtools`.
// Keep these in lockstep — the page-hook consumes this shape and a
// framework version skew would break the bridge.
export interface ReactiveDevtools {
  activate(): void
  deactivate(): void
  getGraph(): ReactiveGraph
  getFires(): ReactiveFire[]
}

export interface PyreonDevtools {
  readonly version: string
  getComponentTree(): DevtoolsComponentEntry[]
  getAllComponents(): DevtoolsComponentEntry[]
  highlight(id: string): void
  onComponentMount(cb: (entry: DevtoolsComponentEntry) => void): () => void
  onComponentUnmount(cb: (id: string) => void): () => void
  enableOverlay(): void
  disableOverlay(): void
  /** Present only when the framework ships the Foundation PR. */
  reactive?: ReactiveDevtools
}

declare global {
  interface Window {
    __PYREON_DEVTOOLS__?: PyreonDevtools
  }
}

// --- Panel -> Page messages ---

export type PanelMessage =
  | { type: 'get-all' }
  | { type: 'highlight'; id: string }
  | { type: 'toggle-overlay'; enabled: boolean }
  | { type: 'reactive-activate' }
  | { type: 'reactive-deactivate' }
  | { type: 'reactive-poll' }
  | { type: 'reactive-eval'; expr: string }

// --- Page -> Panel messages ---

export type HookMessage =
  | { type: 'all-result'; entries: SerializedEntry[] }
  | { type: 'component-mount'; entry: SerializedEntry }
  | { type: 'component-unmount'; id: string }
  | { type: 'pyreon-detected'; version: string }
  | { type: 'reactive-available'; available: boolean }
  | { type: 'reactive-snapshot'; graph: ReactiveGraph; fires: ReactiveFire[] }
  | { type: 'reactive-eval-result'; ok: boolean; result: string }

// --- Wire message wrappers (include source for filtering) ---

export interface PageWireMessage {
  source: 'pyreon-devtools-page'
  payload: HookMessage
}

export interface ContentWireMessage {
  source: 'pyreon-devtools-content'
  payload: PanelMessage
}

// --- Background message wrappers ---

export interface BackgroundForward {
  source: 'pyreon-devtools-background'
  tabId: number
  payload: HookMessage
}

export interface BackgroundToContent {
  source: 'pyreon-devtools-background-forward'
  payload: PanelMessage
}

export interface PanelToBackground {
  source: 'pyreon-devtools-panel'
  payload: PanelMessage
}

// --- Source string constants ---

export const SOURCE = {
  page: 'pyreon-devtools-page',
  content: 'pyreon-devtools-content',
  background: 'pyreon-devtools-background',
  backgroundForward: 'pyreon-devtools-background-forward',
  panel: 'pyreon-devtools-panel',
} as const
