import { model } from '@pyreon/state-tree'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

/**
 * Bookmarks model — exercises `@pyreon/state-tree` schema mode,
 * `@pyreon/validation` (zod adapter), and the chainable builder shape
 * that landed in PR #910.
 *
 * State is persisted to localStorage by `useBookmarks()` below; this model
 * is the single source of truth for the in-memory bookmark list during a
 * session.
 */
const BookmarkSchema = zodSchema(
  z.object({
    items: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        url: z.string(),
        domain: z.string().optional(),
        addedAt: z.number(),
      }),
    ),
  }),
)

export type Bookmark = {
  id: number
  title: string
  url: string
  domain?: string
  addedAt: number
}

export const BookmarksModel = model({
  schema: BookmarkSchema,
  initial: { items: [] as Bookmark[] },
})
  .views((self) => ({
    count: () => (self.items() as Bookmark[]).length,
    has: (id: number) =>
      (self.items() as Bookmark[]).some((b) => b.id === id),
  }))
  .actions((self) => ({
    add(bookmark: Bookmark) {
      // Use schema-mode `update()` to transform the items array. Schema
      // validates the merged result; throws on shape mismatch.
      self.update('items', (items) => {
        const list = (items as Bookmark[]) ?? []
        if (list.some((b) => b.id === bookmark.id)) return list
        return [...list, bookmark]
      })
    },
    remove(id: number) {
      self.update('items', (items) =>
        ((items as Bookmark[]) ?? []).filter((b) => b.id !== id),
      )
    },
    reorder(nextOrder: number[]) {
      // Reorder by an array of IDs (drag-and-drop emits the new order).
      self.update('items', (items) => {
        const map = new Map<number, Bookmark>(
          ((items as Bookmark[]) ?? []).map((b) => [b.id, b]),
        )
        return nextOrder.map((id) => map.get(id)).filter(Boolean) as Bookmark[]
      })
    },
    clear() {
      self.set({ items: [] })
    },
  }))

/**
 * Singleton hook — same instance everywhere. Pairs with `useStorage`
 * in `useBookmarks()` below for localStorage persistence.
 */
export const useBookmarksModel = BookmarksModel.asHook('hn-bookmarks')
