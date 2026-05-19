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

export interface PyreonDevtools {
  readonly version: string
  getComponentTree(): DevtoolsComponentEntry[]
  getAllComponents(): DevtoolsComponentEntry[]
  highlight(id: string): void
  onComponentMount(cb: (entry: DevtoolsComponentEntry) => void): () => void
  onComponentUnmount(cb: (id: string) => void): () => void
  enableOverlay(): void
  disableOverlay(): void
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

// --- Page -> Panel messages ---

export type HookMessage =
  | { type: 'all-result'; entries: SerializedEntry[] }
  | { type: 'component-mount'; entry: SerializedEntry }
  | { type: 'component-unmount'; id: string }
  | { type: 'pyreon-detected'; version: string }

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
