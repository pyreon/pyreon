import { PermissionsProvider } from '@pyreon/permissions'
import { signal } from '@pyreon/reactivity'
import { useHotkey } from '@pyreon/hotkeys'
import { BoardCard } from '../../sections/kanban/BoardCard'
import { COLUMNS } from '../../sections/kanban/data/seed'
import type { Card, ColumnId } from '../../sections/kanban/data/types'
import { kanbanPermissions, setKanbanRole, type Role } from '../../sections/kanban/permissions'
import { useBoard, useUndoManager } from '../../sections/kanban/boardModel'
import {
  BoardGrid,
  CardSlot,
  ColumnCount,
  ColumnHeader,
  ColumnName,
  ColumnRoot,
  ColumnSwatch,
  ColumnTitleRow,
  EmptyColumnCard,
  EmptyText,
  Header,
  HeaderText,
  HintFooter,
  HintItem,
  KanbanLead,
  KanbanPage,
  KanbanTitle,
  NewCardForm,
  NewCardInput,
  PrimaryButton,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from '../../sections/kanban/styled'

const DRAG_MIME = 'text/x-kanban-card-id'

/** Local UI state — kept module-level so it survives navigation. */
const draggingId = signal<string | null>(null)
const dropTargetCol = signal<ColumnId | null>(null)
const dropBeforeCard = signal<string | null>(null)
const activeRole = signal<Role>('admin')
const newCardDraft = signal('')

/**
 * Kanban section — drag-and-drop task board with snapshot-based undo.
 *
 * Demonstrates four fundamentals:
 *   • @pyreon/state-tree — board model + getSnapshot/applySnapshot
 *                            powers a 50-deep undo/redo stack
 *   • @pyreon/store      — (via state-tree's asHook singleton)
 *   • @pyreon/permissions — admin/viewer toggle disables drag,
 *                            new-card composer, undo/redo, and the
 *                            remove buttons
 *   • @pyreon/hotkeys    — Cmd/Ctrl+Z to undo, Cmd/Ctrl+Shift+Z to redo,
 *                            N to focus new-card input, R to reset
 *
 * Drag-and-drop uses the native HTML5 DnD API rather than a third-
 * party library — the data layer is a flat array, every move is one
 * action call, and the undo manager wraps each action site so users
 * can rewind any drag.
 */
export default function KanbanRoute() {
  const board = useBoard()
  const undoManager = useUndoManager()
  const can = kanbanPermissions

  // ── Drag handlers ───────────────────────────────────────────────────
  function onDragStart(cardId: string, e: DragEvent) {
    if (!can('cards.write')) return
    draggingId.set(cardId)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(DRAG_MIME, cardId)
    }
  }

  function onDragEnd() {
    draggingId.set(null)
    dropTargetCol.set(null)
    dropBeforeCard.set(null)
  }

  function onColumnDragOver(columnId: ColumnId, e: DragEvent) {
    if (!can('cards.write')) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    // If we just entered a different column, reset the per-card target
    // to "append to end" — `onCardDragOver` will overwrite it if the
    // cursor lands on a specific card next.
    if (dropTargetCol.peek() !== columnId) {
      dropBeforeCard.set(null)
    }
    dropTargetCol.set(columnId)
  }

  function onCardDragOver(beforeCardId: string, e: DragEvent) {
    if (!can('cards.write')) return
    e.preventDefault()
    // Don't stopPropagation — we want the column-level dragover to
    // ALSO fire so `dropTargetCol` updates to the column that owns
    // this card. Otherwise dragging directly from column A onto a
    // card in column B leaves the highlight stuck on column A.
    dropBeforeCard.set(beforeCardId)
  }

  function onColumnDrop(columnId: ColumnId, e: DragEvent) {
    if (!can('cards.write')) return
    e.preventDefault()
    const cardId = e.dataTransfer?.getData(DRAG_MIME) ?? draggingId.peek()
    if (!cardId) return
    undoManager.record()
    board.moveCard(cardId, columnId, dropBeforeCard.peek())
    onDragEnd()
  }

  function addCardFromDraft(e?: Event) {
    e?.preventDefault()
    const title = newCardDraft.peek().trim()
    if (!title || !can('cards.write')) return
    undoManager.record()
    board.addCard(title)
    newCardDraft.set('')
  }

  function removeCard(id: string) {
    if (!can('cards.write')) return
    undoManager.record()
    board.removeCard(id)
  }

  function resetBoard() {
    if (!can('cards.write')) return
    undoManager.record()
    board.reset()
  }

  // ── Hotkeys ─────────────────────────────────────────────────────────
  // Cmd+Z / Ctrl+Z is the universal undo shortcut. `mod` resolves to
  // the platform-correct key automatically.
  let newCardInputEl: HTMLInputElement | null = null
  const setNewCardRef = (el: HTMLElement | null) => {
    newCardInputEl = el as HTMLInputElement | null
  }

  useHotkey('mod+z', () => undoManager.undo(), { description: 'Undo' })
  useHotkey('mod+shift+z', () => undoManager.redo(), { description: 'Redo' })
  useHotkey('mod+y', () => undoManager.redo(), { description: 'Redo (alt)' })
  useHotkey('n', () => newCardInputEl?.focus(), { description: 'Focus new-card input' })
  useHotkey('r', () => resetBoard(), { description: 'Reset board' })

  function selectRole(role: Role) {
    activeRole.set(role)
    setKanbanRole(role)
  }

  return (
    <PermissionsProvider instance={kanbanPermissions}>
      <KanbanPage>
        <Header>
          <HeaderText>
            <KanbanTitle>Kanban board</KanbanTitle>
            <KanbanLead>
              Drag cards between columns. Cmd/Ctrl+Z to undo, Shift+Z to redo. Toggle Viewer
              role to see how the @pyreon/permissions singleton disables every action.
            </KanbanLead>
          </HeaderText>
          <Toolbar>
            <ToolbarGroup>
              <ToolbarButton
                type="button"
                onClick={() => undoManager.undo()}
                disabled={!undoManager.canUndo() || !can('cards.write')}
              >
                ← Undo
              </ToolbarButton>
              <ToolbarButton
                type="button"
                onClick={() => undoManager.redo()}
                disabled={!undoManager.canRedo() || !can('cards.write')}
              >
                Redo →
              </ToolbarButton>
            </ToolbarGroup>
            <ToolbarGroup>
              <ToolbarButton
                type="button"
                $active={activeRole() === 'admin'}
                onClick={() => selectRole('admin')}
              >
                Admin
              </ToolbarButton>
              <ToolbarButton
                type="button"
                $active={activeRole() === 'viewer'}
                onClick={() => selectRole('viewer')}
              >
                Viewer
              </ToolbarButton>
            </ToolbarGroup>
            <PrimaryButton type="button" onClick={resetBoard} disabled={!can('cards.write')}>
              Reset
            </PrimaryButton>
          </Toolbar>
        </Header>

        <BoardGrid>
          {COLUMNS.map((column) => {
            const columnCards = (): Card[] =>
              board.cards().filter((c) => c.columnId === column.id)
            return (
              <ColumnRoot
                $dropTarget={dropTargetCol() === column.id}
                onDragOver={(e: DragEvent) => onColumnDragOver(column.id, e)}
                onDrop={(e: DragEvent) => onColumnDrop(column.id, e)}
              >
                <ColumnHeader>
                  <ColumnTitleRow>
                    <ColumnSwatch $color={column.color} />
                    <ColumnName>{column.title}</ColumnName>
                  </ColumnTitleRow>
                  <ColumnCount>{() => columnCards().length}</ColumnCount>
                </ColumnHeader>

                {column.id === 'todo' ? (
                  <NewCardForm onSubmit={addCardFromDraft}>
                    <NewCardInput
                      innerRef={setNewCardRef}
                      type="text"
                      placeholder="New card title…"
                      value={newCardDraft()}
                      disabled={!can('cards.write')}
                      onInput={(e: Event) =>
                        newCardDraft.set((e.target as HTMLInputElement).value)
                      }
                    />
                  </NewCardForm>
                ) : null}

                <CardSlot $dropping={dropTargetCol() === column.id}>
                  {() => {
                    const cards = columnCards()
                    if (cards.length === 0) {
                      return (
                        <EmptyColumnCard>
                          <EmptyText>Drop cards here</EmptyText>
                        </EmptyColumnCard>
                      )
                    }
                    return cards.map((card) => (
                      <div onDragOver={(e: DragEvent) => onCardDragOver(card.id, e)}>
                        <BoardCard
                          card={card}
                          dragging={draggingId() === card.id}
                          canWrite={can('cards.write')}
                          onDragStart={(e) => onDragStart(card.id, e)}
                          onDragEnd={onDragEnd}
                          onRemove={() => removeCard(card.id)}
                        />
                      </div>
                    ))
                  }}
                </CardSlot>
              </ColumnRoot>
            )
          })}
        </BoardGrid>

        <HintFooter>
          <HintItem>⌘/Ctrl + Z — undo</HintItem>
          <HintItem>⌘/Ctrl + Shift + Z — redo</HintItem>
          <HintItem>N — focus new-card input</HintItem>
          <HintItem>R — reset board</HintItem>
          <HintItem>{() => `${undoManager.undoDepth()} edit${undoManager.undoDepth() === 1 ? '' : 's'} captured`}</HintItem>
        </HintFooter>
      </KanbanPage>
    </PermissionsProvider>
  )
}

export const meta = {
  title: 'Kanban — Pyreon App Showcase',
}
