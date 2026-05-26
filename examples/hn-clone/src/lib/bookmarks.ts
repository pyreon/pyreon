import { model } from '@pyreon/state-tree'
import { zodSchema } from '@pyreon/validation'
import { effect } from '@pyreon/reactivity'
import { z } from 'zod'

/**
 * Bookmarks model — exercises `@pyreon/state-tree` schema mode,
 * `@pyreon/validation` (zod adapter), and the chainable builder shape
 * that landed in PR #910.
 *
 * State is persisted to localStorage at module load time (see
 * `installBookmarksPersistence()` below). The persistence layer lives in
 * this module — NOT in any individual route — so that bookmarks added on
 * `/item/:id` survive a navigation to `/bookmarks` and a hard reload.
 * Originally the persistence effect was scoped to the /bookmarks route;
 * adding from /item never reached localStorage because nothing on item
 * page was watching the model, and the /bookmarks `onMount` rehydrate
 * then wrote the empty initial state back over the in-memory change.
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

const STORAGE_KEY = 'hn-bookmarks'

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
 * Singleton hook — same instance everywhere.
 */
export const useBookmarksModel = BookmarksModel.asHook(STORAGE_KEY)

// ─── App-wide persistence ───────────────────────────────────────────────────

let persistenceInstalled = false

/**
 * Wire the bookmarks model to localStorage at app startup. Idempotent.
 * Reads the initial value from localStorage (cross-tab events too), then
 * starts mirroring every model mutation back to localStorage. Must be
 * called ONCE from a top-level component (the layout) so persistence
 * survives navigation between routes.
 *
 * The earlier (broken) design scoped the persistence effect to the
 * /bookmarks route — bookmarks added on /item/:id never reached storage,
 * and /bookmarks's `onMount` rehydrate then stomped them.
 */
export function installBookmarksPersistence(): void {
  if (persistenceInstalled) return
  if (typeof window === 'undefined') return // SSR no-op
  persistenceInstalled = true

  const model = useBookmarksModel()

  // Hydrate from localStorage if the in-memory model is empty.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Bookmark[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        model.set({ items: parsed })
      }
    }
  } catch {
    // Corrupt localStorage entry — start fresh rather than crash the app.
  }

  // Mirror state-tree → localStorage on every change.
  effect(() => {
    const items = model.items() as Bookmark[]
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Quota exceeded or storage unavailable — silent.
    }
  })

  // Cross-tab sync: when another tab writes to the same key, propagate
  // back into the model. Guarded by the same hydrate path so the new
  // value flows through schema validation.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const parsed = JSON.parse(e.newValue) as Bookmark[]
      if (Array.isArray(parsed)) model.set({ items: parsed })
    } catch {
      // Other-tab corruption — ignore.
    }
  })
}
