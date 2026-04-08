import { useContext } from '@pyreon/core'
import { Badge } from '@pyreon/ui-components'
import { TodosCtx } from './context'
import type { Todo } from './store/types'

interface TodoItemProps {
  todo: Todo
}

const PRIORITY_COLOR: Record<NonNullable<Todo['priority']>, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
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
    <div
      onClick={onSelect}
      style={() => {
        const selected = isSelected()
        const done = props.todo.done
        return `display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: white; border: 1px solid ${selected ? '#a5b4fc' : '#e5e7eb'}; border-radius: 8px; cursor: pointer; box-shadow: ${selected ? '0 0 0 3px #eef2ff' : 'none'}; transition: border-color 0.12s, box-shadow 0.12s; opacity: ${done ? '0.6' : '1'};`
      }}
    >
      <input
        type="checkbox"
        checked={props.todo.done}
        onChange={onToggle}
        onClick={(e: Event) => e.stopPropagation()}
        style="width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;"
      />

      <div style="flex: 1; min-width: 0;">
        <div
          style={() =>
            `font-size: 14px; color: #111827; ${props.todo.done ? 'text-decoration: line-through; color: #9ca3af;' : ''}`
          }
        >
          {props.todo.title}
        </div>
        {props.todo.notes ? (
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            {props.todo.notes}
          </div>
        ) : null}
      </div>

      {props.todo.priority ? (
        <span
          style={`font-size: 11px; padding: 2px 8px; border-radius: 999px; background: ${PRIORITY_COLOR[props.todo.priority]}1a; color: ${PRIORITY_COLOR[props.todo.priority]}; font-weight: 500;`}
        >
          {props.todo.priority}
        </span>
      ) : null}

      {props.todo.tags.length > 0 ? (
        <div style="display: flex; gap: 4px;">
          {props.todo.tags.map((tag) => (
            <Badge size="small">{tag}</Badge>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRemove}
        title="Delete todo"
        style="background: transparent; border: none; color: #9ca3af; cursor: pointer; padding: 4px 8px; font-size: 16px; line-height: 1;"
      >
        ×
      </button>
    </div>
  )
}
