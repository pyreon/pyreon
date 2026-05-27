import { model } from '@pyreon/state-tree'
import { zodSchema } from '@pyreon/validation'
import { effect } from '@pyreon/reactivity'
import { z } from 'zod'

/**
 * Kanban board model — exercises `@pyreon/state-tree` schema-mode +
 * `@pyreon/validation` (zod). Persisted to localStorage at module load.
 *
 * Cross-column DND: cards move BETWEEN columns. The state-tree update
 * has to atomically remove from source column AND insert into target —
 * the action `moveCard(cardId, toColumnId, beforeCardId?)` handles both
 * in one batch.
 */
export type Priority = 'low' | 'medium' | 'high'

export interface Card {
  id: string
  title: string
  priority: Priority
  createdAt: number
}

export interface Column {
  id: string
  title: string
  cards: Card[]
}

const CardSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']),
  createdAt: z.number(),
})

const ColumnSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  cards: z.array(CardSchema),
})

const BoardSchema = zodSchema(
  z.object({
    columns: z.array(ColumnSchema),
  }),
)

const STORAGE_KEY = 'pyreon-kanban-board'

const DEFAULT_BOARD: { columns: Column[] } = {
  columns: [
    {
      id: 'todo',
      title: 'To Do',
      cards: [
        {
          id: 'c-1',
          title: 'Review PR #960',
          priority: 'high',
          createdAt: Date.now(),
        },
        {
          id: 'c-2',
          title: 'Update changelog',
          priority: 'low',
          createdAt: Date.now(),
        },
      ],
    },
    {
      id: 'doing',
      title: 'In Progress',
      cards: [
        {
          id: 'c-3',
          title: 'Audit kanban board (you are here)',
          priority: 'medium',
          createdAt: Date.now(),
        },
      ],
    },
    {
      id: 'done',
      title: 'Done',
      cards: [
        {
          id: 'c-4',
          title: 'Ship hn-clone',
          priority: 'medium',
          createdAt: Date.now(),
        },
      ],
    },
  ],
}

export const BoardModel = model({
  schema: BoardSchema,
  initial: DEFAULT_BOARD,
})
  .views((self) => ({
    columnCount: () => (self.columns() as Column[]).length,
    totalCards: () =>
      (self.columns() as Column[]).reduce((sum, c) => sum + c.cards.length, 0),
    findCard: (cardId: string) => {
      for (const col of self.columns() as Column[]) {
        const card = col.cards.find((c) => c.id === cardId)
        if (card) return { card, columnId: col.id }
      }
      return null
    },
  }))
  .actions((self) => ({
    addCard(columnId: string, card: Omit<Card, 'id' | 'createdAt'>) {
      const newCard: Card = {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
        ...card,
      }
      self.update('columns', (cols) =>
        ((cols as Column[]) ?? []).map((c) =>
          c.id === columnId ? { ...c, cards: [...c.cards, newCard] } : c,
        ),
      )
      return newCard
    },
    removeCard(cardId: string) {
      self.update('columns', (cols) =>
        ((cols as Column[]) ?? []).map((c) => ({
          ...c,
          cards: c.cards.filter((card) => card.id !== cardId),
        })),
      )
    },
    updateCard(cardId: string, patch: Partial<Omit<Card, 'id' | 'createdAt'>>) {
      self.update('columns', (cols) =>
        ((cols as Column[]) ?? []).map((c) => ({
          ...c,
          cards: c.cards.map((card) =>
            card.id === cardId ? { ...card, ...patch } : card,
          ),
        })),
      )
    },
    /**
     * Cross-column move. Removes the card from its source column and
     * inserts at `toIndex` (or append) of `toColumnId`. Atomic — one
     * state-tree update, one schema validation, one storage flush.
     */
    moveCard(cardId: string, toColumnId: string, toIndex?: number) {
      self.update('columns', (cols) => {
        const columns = (cols as Column[]) ?? []
        // Find the card + its source
        let movingCard: Card | undefined
        for (const c of columns) {
          const found = c.cards.find((card) => card.id === cardId)
          if (found) {
            movingCard = found
            break
          }
        }
        if (!movingCard) return columns
        const card = movingCard
        return columns.map((c) => {
          if (c.id === toColumnId) {
            // Insert into target — remove first if same column (avoid dup)
            const cleaned = c.cards.filter((x) => x.id !== cardId)
            const insertAt =
              typeof toIndex === 'number' ? toIndex : cleaned.length
            const next = [...cleaned]
            next.splice(insertAt, 0, card)
            return { ...c, cards: next }
          }
          // Other columns: remove the card (handles cross-column move)
          if (c.cards.some((x) => x.id === cardId)) {
            return { ...c, cards: c.cards.filter((x) => x.id !== cardId) }
          }
          return c
        })
      })
    },
    reorderColumn(columnId: string, nextCardOrder: string[]) {
      self.update('columns', (cols) =>
        ((cols as Column[]) ?? []).map((c) => {
          if (c.id !== columnId) return c
          const byId = new Map(c.cards.map((card) => [card.id, card]))
          const reordered = nextCardOrder
            .map((id) => byId.get(id))
            .filter((card): card is Card => Boolean(card))
          return { ...c, cards: reordered }
        }),
      )
    },
    addColumn(title: string) {
      const newCol: Column = {
        id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        cards: [],
      }
      self.update('columns', (cols) => [...((cols as Column[]) ?? []), newCol])
      return newCol
    },
    removeColumn(columnId: string) {
      self.update('columns', (cols) =>
        ((cols as Column[]) ?? []).filter((c) => c.id !== columnId),
      )
    },
  }))

export const useBoardModel = BoardModel.asHook(STORAGE_KEY)

// ─── App-wide persistence (install once at layout module load) ──────────
let persistenceInstalled = false

export function installBoardPersistence(): void {
  if (persistenceInstalled) return
  if (typeof window === 'undefined') return
  persistenceInstalled = true

  const board = useBoardModel()

  // Hydrate
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.columns)) {
        board.set(parsed)
      }
    }
  } catch {
    /* corrupt — keep defaults */
  }

  // Mirror state-tree → storage
  effect(() => {
    const columns = board.columns()
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ columns }))
    } catch {
      /* quota / disabled */
    }
  })

  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const parsed = JSON.parse(e.newValue)
      if (parsed && Array.isArray(parsed.columns)) board.set(parsed)
    } catch {
      /* ignore */
    }
  })
}
