// ─── TanStack Virtual core re-exports ────────────────────────────────────────
// Users can import utilities and types from @pyreon/virtual directly.

export type {
  Range,
  Rect,
  ScrollToOptions,
  VirtualItem,
  VirtualizerOptions,
} from '@tanstack/virtual-core'
export {
  defaultKeyExtractor,
  defaultRangeExtractor,
  elementScroll,
  measureElement,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  Virtualizer,
  windowScroll,
} from '@tanstack/virtual-core'

// ─── Pyreon adapter ─────────────────────────────────────────────────────────────

export type { UseVirtualizerOptions, UseVirtualizerResult } from './use-virtualizer'
export { useVirtualizer } from './use-virtualizer'
export type {
  UseWindowVirtualizerOptions,
  UseWindowVirtualizerResult,
} from './use-window-virtualizer'
export { useWindowVirtualizer } from './use-window-virtualizer'
