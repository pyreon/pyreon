/**
 * Types for the kanban section.
 *
 * The board is intentionally minimal — three fixed columns plus a
 * flat array of cards. Each card carries the column it lives in,
 * which makes drag-and-drop reorder a single field write.
 */

export type ColumnId = 'todo' | 'in-progress' | 'done'

export interface Column {
  id: ColumnId
  title: string
  /** Display color for the column header swatch. */
  color: string
}

export interface Card {
  id: string
  columnId: ColumnId
  title: string
  /** Short body text shown below the title. */
  description?: string
  /** Tags rendered as small chips on the card. */
  tags: string[]
  /** Priority — drives the left-edge color stripe on the card. */
  priority: 'low' | 'medium' | 'high'
  /** Optional assignee initials for the avatar swatch. */
  assignee?: string
  /** Hex color for the assignee avatar. */
  assigneeColor?: string
}
