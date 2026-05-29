import type {
  BackgroundForward,
  BackgroundToContent,
  ContentWireMessage,
  HookMessage,
  PageWireMessage,
  PanelMessage,
  PanelToBackground,
} from './types'
import { SOURCE } from './types'

// --- Type guards ---

export function isPageWireMessage(data: unknown): data is PageWireMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'source' in data &&
    (data as PageWireMessage).source === SOURCE.page &&
    'payload' in data
  )
}

export function isContentWireMessage(data: unknown): data is ContentWireMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'source' in data &&
    (data as ContentWireMessage).source === SOURCE.content &&
    'payload' in data
  )
}

export function isBackgroundForward(data: unknown): data is BackgroundForward {
  return (
    typeof data === 'object' &&
    data !== null &&
    'source' in data &&
    (data as BackgroundForward).source === SOURCE.background &&
    'payload' in data
  )
}

export function isBackgroundToContent(data: unknown): data is BackgroundToContent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'source' in data &&
    (data as BackgroundToContent).source === SOURCE.backgroundForward &&
    'payload' in data
  )
}

export function isPanelToBackground(data: unknown): data is PanelToBackground {
  return (
    typeof data === 'object' &&
    data !== null &&
    'source' in data &&
    (data as PanelToBackground).source === SOURCE.panel &&
    'payload' in data
  )
}

// --- Factories ---

export function createPageWire(payload: HookMessage): PageWireMessage {
  return { source: SOURCE.page, payload }
}

export function createContentWire(payload: PanelMessage): ContentWireMessage {
  return { source: SOURCE.content, payload }
}

export function createBackgroundForward(tabId: number, payload: HookMessage): BackgroundForward {
  return { source: SOURCE.background, tabId, payload }
}

export function createBackgroundToContent(payload: PanelMessage): BackgroundToContent {
  return { source: SOURCE.backgroundForward, payload }
}

export function createPanelToBackground(payload: PanelMessage): PanelToBackground {
  return { source: SOURCE.panel, payload }
}
