import {
  Avatar,
  CardDescription,
  CardFooter,
  CardFooterRight,
  CardPriorityStripe,
  CardRoot,
  CardTitle,
  RemoveButton,
  TagChip,
  TagRow,
} from './styled'
import type { Card } from './data/types'

interface BoardCardProps {
  card: Card
  /** True while the user is dragging this card. */
  dragging: boolean
  /** Whether the user can interact with cards (driven by permissions). */
  canWrite: boolean
  /** Native HTML5 drag handlers from the parent column. */
  onDragStart: (e: DragEvent) => void
  onDragEnd: (e: DragEvent) => void
  onRemove: () => void
}

/**
 * A single kanban card.
 *
 * Drag-and-drop uses the native HTML5 drag-and-drop API rather than
 * pulling in a third-party DnD library. The parent column wires up
 * the dataTransfer payload (`text/x-kanban-card-id`) and provides
 * `onDragStart` / `onDragEnd` callbacks; the card just renders the
 * draggable shell and forwards events.
 */
export function BoardCard(props: BoardCardProps) {
  return (
    <CardRoot
      draggable={props.canWrite}
      $dragging={props.dragging}
      $disabled={!props.canWrite}
      onDragStart={(e: DragEvent) => props.onDragStart(e)}
      onDragEnd={(e: DragEvent) => props.onDragEnd(e)}
    >
      <CardPriorityStripe $priority={props.card.priority} />
      <CardTitle>{props.card.title}</CardTitle>
      {props.card.description ? (
        <CardDescription>{props.card.description}</CardDescription>
      ) : null}
      <CardFooter>
        <TagRow>
          {props.card.tags.map((tag) => (
            <TagChip>{tag}</TagChip>
          ))}
        </TagRow>
        <CardFooterRight>
          {props.card.assignee ? (
            <Avatar $color={props.card.assigneeColor ?? '#94a3b8'}>{props.card.assignee}</Avatar>
          ) : null}
          {props.canWrite ? (
            <RemoveButton type="button" title="Remove card" onClick={props.onRemove}>
              ×
            </RemoveButton>
          ) : null}
        </CardFooterRight>
      </CardFooter>
    </CardRoot>
  )
}
