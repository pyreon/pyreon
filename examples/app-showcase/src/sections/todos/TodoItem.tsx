import { useContext } from '@pyreon/core'
import { Badge } from '@pyreon/ui-components'
import { TodosCtx } from './context'
import {
  DeleteButton,
  PriorityChip,
  TagsRow,
  TodoBody,
  TodoCheckbox,
  TodoItemRoot,
  TodoNotes,
  TodoTitle,
} from './styled'
import type { Todo } from './store/types'

interface TodoItemProps {
  todo: Todo
}

export function TodoItem(props: TodoItemProps) {
  const ctx = useContext(TodosCtx)
  if (!ctx) throw new Error('TodoItem must be used inside TodosCtx provider')
  const { store, selectedId } = ctx

  const isSelected = () => selectedId() === props.todo.id

  function onToggle(e: Event) {
    e.stopPropagation()
    store.toggle(props.todo.id)
  }

  function onSelect() {
    selectedId.set(props.todo.id)
  }

  function onRemove(e: Event) {
    e.stopPropagation()
    store.remove(props.todo.id)
    if (selectedId() === props.todo.id) selectedId.set(undefined)
  }

  return (
    <TodoItemRoot onClick={onSelect} $selected={isSelected()} $done={props.todo.done}>
      <TodoCheckbox
        type="checkbox"
        checked={props.todo.done}
        onChange={onToggle}
        onClick={(e: Event) => e.stopPropagation()}
      />

      <TodoBody>
        <TodoTitle $done={props.todo.done}>{props.todo.title}</TodoTitle>
        {props.todo.notes ? <TodoNotes>{props.todo.notes}</TodoNotes> : null}
      </TodoBody>

      {props.todo.priority ? (
        <PriorityChip $priority={props.todo.priority}>{props.todo.priority}</PriorityChip>
      ) : null}

      {props.todo.tags.length > 0 ? (
        <TagsRow>
          {props.todo.tags.map((tag) => (
            <Badge size="small">{tag}</Badge>
          ))}
        </TagsRow>
      ) : null}

      <DeleteButton type="button" onClick={onRemove} title="Delete todo">
        ×
      </DeleteButton>
    </TodoItemRoot>
  )
}
