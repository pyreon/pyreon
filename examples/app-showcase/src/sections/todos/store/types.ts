/** A single todo item. */
export interface Todo {
  id: string
  title: string
  notes?: string
  done: boolean
  /** Project / list this todo belongs to (e.g. "inbox", "work", "personal"). */
  projectId: string
  /** Optional priority — undefined = none. */
  priority?: 'low' | 'medium' | 'high'
  /** Tags for filtering (e.g. "urgent", "shopping"). */
  tags: string[]
  /** ISO timestamp when the todo was created. */
  createdAt: string
  /** ISO timestamp when the todo was completed (set when `done` flips true). */
  completedAt?: string
  /** Optional ISO date for when the todo is due. */
  dueDate?: string
}

/** A project / list grouping todos. Inbox is the default. */
export interface Project {
  id: string
  name: string
  /** Hex color used in the sidebar swatch. */
  color: string
  /** Whether this is the immutable inbox project (cannot be deleted). */
  pinned?: boolean
}

/** Filter values that drive what's visible in the list. */
export type StatusFilter = 'all' | 'active' | 'completed'
export type SortField = 'created' | 'priority' | 'due'
