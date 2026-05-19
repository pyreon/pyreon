// --- Serialized component entry (no DOM references) ---

export interface SerializedEntry {
  id: string
  name: string
  parentId: string | null
  childIds: string[]
}

// --- Panel -> Page messages ---

export type PanelMessage =
  | { type: 'get-all' }
  | { type: 'highlight'; id: string }

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
