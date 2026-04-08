import { applySnapshot, getSnapshot, model } from '@pyreon/state-tree'
import { signal } from '@pyreon/reactivity'
import { SEED_CARDS } from './data/seed'
import type { Card, ColumnId } from './data/types'

/**
 * Kanban board state-tree model.
 *
 * The board holds a flat array of cards keyed by id; each card carries
 * its own `columnId`, so move-between-columns is a single field write
 * and reorder-within-column is a re-shuffle of the array.
 *
 * Why state-tree (vs a plain composition store):
 *   • `getSnapshot(board)` returns a JSON-safe `{ cards: Card[] }` that
 *     the undo manager pushes onto its stack before every mutation.
 *   • `applySnapshot(board, snap)` restores any prior snapshot in a
 *     single batched write — no manual diffing.
 *
 * The undo/redo manager wraps every action so users can press
 * Cmd/Ctrl+Z to rewind, Cmd/Ctrl+Shift+Z to replay.
 */
export const BoardModel = model({
  state: {
    cards: SEED_CARDS as Card[],
  },
  views: () => ({}),
  actions: (self) => ({
    /** Replace the entire card list (used by undo/redo + reset). */
    setCards(cards: Card[]) {
      self.cards.set(cards)
    },
    /**
     * Move a card to a different column AND insert it before `beforeCardId`.
     * Pass `null` to append to the end of the target column.
     *
     * The board renders by filtering the flat array per column, so the
     * within-column display order is the relative order in `self.cards`.
     */
    moveCard(cardId: string, targetColumnId: ColumnId, beforeCardId: string | null) {
      // The `self` parameter is typed as `any` by the state-tree model
      // factory, so we cast each `peek()` result to the concrete type
      // here. One cast per action keeps the inner code type-safe.
      const cards = (self.cards.peek() as Card[])
      const moving = cards.find((c) => c.id === cardId)
      if (!moving) return
      const without = cards.filter((c) => c.id !== cardId)
      const updated: Card = { ...moving, columnId: targetColumnId }

      if (beforeCardId === null) {
        self.cards.set([...without, updated])
        return
      }

      const result: Card[] = []
      for (const c of without) {
        if (c.id === beforeCardId) result.push(updated)
        result.push(c)
      }
      self.cards.set(result)
    },
    /** Add a fresh card to the top of the To-do column. */
    addCard(title: string) {
      const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const newCard: Card = {
        id,
        columnId: 'todo',
        title,
        tags: ['new'],
        priority: 'medium',
      }
      self.cards.set([newCard, ...(self.cards.peek() as Card[])])
    },
    /** Remove a card from the board entirely. */
    removeCard(id: string) {
      self.cards.set((self.cards.peek() as Card[]).filter((c) => c.id !== id))
    },
    /** Restore the seed deck (used by the toolbar reset button). */
    reset() {
      self.cards.set(SEED_CARDS)
    },
  }),
})

/** Singleton hook so every kanban component shares one board instance. */
export const useBoard = BoardModel.asHook('kanban-board')

// ─── Undo / redo manager ────────────────────────────────────────────

interface BoardSnapshot {
  cards: Card[]
}

const MAX_HISTORY = 50

/**
 * Snapshot-based undo manager. Wraps a model instance so callers can:
 *
 *   1. `record()` — push the current snapshot onto the undo stack BEFORE
 *      a mutation. The redo stack clears (the user just did something
 *      new, so any redo'd future is no longer reachable).
 *   2. `undo()` — pop the most recent snapshot from undo, push the
 *      current state onto redo, and apply the popped snapshot.
 *   3. `redo()` — pop from redo, push current onto undo, apply.
 *
 * Reactive `canUndo()` / `canRedo()` accessors drive the toolbar
 * button enabled state.
 */
export function createUndoManager(board: ReturnType<typeof useBoard>) {
  const undoStack = signal<BoardSnapshot[]>([])
  const redoStack = signal<BoardSnapshot[]>([])

  function snapshot(): BoardSnapshot {
    return getSnapshot<{ cards: Card[] }>(board) as BoardSnapshot
  }

  function record(): void {
    const next = [...undoStack.peek(), snapshot()]
    if (next.length > MAX_HISTORY) next.shift()
    undoStack.set(next)
    // A new mutation invalidates the redo branch.
    if (redoStack.peek().length > 0) redoStack.set([])
  }

  function undo(): void {
    const stack = undoStack.peek()
    if (stack.length === 0) return
    const previous = stack[stack.length - 1] as BoardSnapshot
    redoStack.set([...redoStack.peek(), snapshot()])
    undoStack.set(stack.slice(0, -1))
    applySnapshot(board, previous as unknown as Record<string, unknown>)
  }

  function redo(): void {
    const stack = redoStack.peek()
    if (stack.length === 0) return
    const next = stack[stack.length - 1] as BoardSnapshot
    undoStack.set([...undoStack.peek(), snapshot()])
    redoStack.set(stack.slice(0, -1))
    applySnapshot(board, next as unknown as Record<string, unknown>)
  }

  function clear(): void {
    undoStack.set([])
    redoStack.set([])
  }

  return {
    record,
    undo,
    redo,
    clear,
    canUndo: () => undoStack().length > 0,
    canRedo: () => redoStack().length > 0,
    undoDepth: () => undoStack().length,
  }
}

/** Singleton undo manager bound to the singleton board. */
let _undo: ReturnType<typeof createUndoManager> | undefined
export function useUndoManager() {
  if (!_undo) _undo = createUndoManager(useBoard())
  return _undo
}
