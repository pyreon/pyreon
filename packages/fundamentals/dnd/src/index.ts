import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/dnd
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton('@pyreon/dnd', '0.24.6', import.meta.url)

export type {
  DragData,
  DropEdge,
  DropLocation,
  UseDraggableOptions,
  UseDraggableResult,
  UseDroppableOptions,
  UseDroppableResult,
  UseSortableOptions,
  UseSortableResult,
} from './types'

export type { UseDragMonitorOptions, UseDragMonitorResult } from './use-drag-monitor'
export { useDragMonitor } from './use-drag-monitor'

export { useDraggable } from './use-draggable'
export { useDroppable } from './use-droppable'
export type { UseFileDropOptions, UseFileDropResult } from './use-file-drop'
export { useFileDrop } from './use-file-drop'
export { useSortable } from './use-sortable'
