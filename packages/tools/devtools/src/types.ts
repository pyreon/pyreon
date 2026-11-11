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
  /** Source location of the creation call, when the runtime captured one. */
  loc?: SourceLocation
}

export interface ReactiveEdge {
  from: number
  to: number
}

export interface ReactiveGraph {
  nodes: ReactiveNode[]
  edges: ReactiveEdge[]
}

// Structural mirror of @pyreon/reactivity's `SourceLocation` / `CauseLink` /
// `UpdateCause` (the "why did this update?" surface).
export interface SourceLocation {
  file: string
  line: number
  col: number
}

export interface CauseLink {
  id: number
  kind: ReactiveNodeKind
  name: string
  loc?: SourceLocation
  ts: number
}

export interface UpdateCause {
  target: CauseLink
  chain: CauseLink[]
  rootReached: boolean
}

export interface ReactiveFire {
  id: number
  ts: number
  /** Synchronous-cascade sequence stamp (see @pyreon/reactivity's ReactiveFire). */
  cascade: number
}

/** The part of runtime-dom's `BoundReactiveNode` the hook reads (it never keeps the text node). */
export interface BoundReactiveNodeLike {
  id: number
  name: string
  kind: ReactiveNodeKind
}

// Structural subset of @pyreon/runtime-dom's `PyreonReactiveDevtools` that the
// page-hook uses. `src/tests/framework-integration.test.ts` asserts the
// framework's interface is assignable to it, so a rename or removal there
// fails `tsc`. `nodesForElement` is optional because frameworks before the
// DOM→signal picker do not ship it; the inspector then shows no reads.
export interface ReactiveDevtools {
  activate(): void
  deactivate(): void
  getGraph(): ReactiveGraph
  getFires(): ReactiveFire[]
  getUpdateCause(nodeId: number): UpdateCause | null
  formatUpdateCause(cause: UpdateCause): string
  nodesForElement?(el: Element): BoundReactiveNodeLike[]
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
  | { type: 'hello' }
  | { type: 'get-all' }
  | { type: 'highlight'; id: string }
  | { type: 'toggle-overlay'; enabled: boolean }
  | { type: 'reactive-activate' }
  | { type: 'reactive-deactivate' }
  /** `graph: false` skips the graph walk (the profiler polls fires only). */
  | { type: 'reactive-poll'; graph?: boolean }
  | { type: 'reactive-eval'; expr: string }
  | { type: 'inspect'; id: string }
  | { type: 'console-subscribe' }
  | { type: 'console-clear' }

// --- Page -> Panel messages ---

export type HookMessage =
  | { type: 'all-result'; entries: SerializedEntry[] }
  /**
   * Mounts and unmounts coalesced over ~100 ms, so a page that mounts
   * 10,000 components sends a handful of messages, not 10,000.
   * `mounted` is capped (it only drives the "just mounted" pulse);
   * `mountedTotal` is the real count.
   */
  | { type: 'components-changed'; mounted: string[]; mountedTotal: number; unmounted: string[] }
  | { type: 'pyreon-detected'; version: string; host: string; reactive: boolean }
  | {
      type: 'reactive-snapshot'
      /** `null` when the poll asked for fires only. */
      graph: ReactiveGraph | null
      fires: ReactiveFire[]
      /** The page's `performance.now()` at snapshot time (fire `ts` share its clock). */
      now: number
    }
  | { type: 'reactive-eval-result'; ok: boolean; result: string }
  | { type: 'component-detail'; detail: ComponentDetail }
  | { type: 'console-entries'; entries: ConsoleEntry[]; reset: boolean }

/** A reactive node displayed as text inside a component's DOM. */
export interface ComponentRead {
  id: number
  name: string
  kind: ReactiveNodeKind
  loc?: SourceLocation
  value: string
  fires: number
  lastFire: number | null
}

/** What the inspector shows for one component. Plain data, no page objects. */
export interface ComponentDetail {
  id: string
  /** The component's first DOM element still exists. */
  hasElement: boolean
  /** Signals/computeds whose values are text inside the component's DOM. */
  reads: ComponentRead[]
  /** Cause of the most recent update among `reads`, or null when none fired. */
  cause: UpdateCause | null
  /** The page's `performance.now()` when the detail was read. */
  now: number
}

export type ConsoleLevel = 'warn' | 'error'

/** A `[Pyreon]` console warning or error captured in the page. */
export interface ConsoleEntry {
  seq: number
  /** `Date.now()` in the page. */
  time: number
  level: ConsoleLevel
  text: string
}

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
