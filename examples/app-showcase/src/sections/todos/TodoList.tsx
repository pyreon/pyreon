import { useContext } from '@pyreon/core'
import { Card, Paragraph } from '@pyreon/ui-components'
import { TodoItem } from './TodoItem'
import { TodosCtx } from './context'
import type { Todo } from './store/types'

interface TodoListProps {
  /** Reactive accessor — re-evaluated whenever filters or todos change. */
  items: () => Todo[]
}

export function TodoList(props: TodoListProps) {
  const ctx = useContext(TodosCtx)
  if (!ctx) throw new Error('TodoList must be used inside TodosCtx provider')

  return (() => {
    const list = props.items()
    if (list.length === 0) {
      return (
        <Card style="padding: 32px; text-align: center;">
          <Paragraph style="color: #9ca3af; margin-bottom: 4px;">No todos match the current filters.</Paragraph>
          <Paragraph style="color: #9ca3af; font-size: 12px;">
            Press <kbd>N</kbd> to add a new one or change the status filter above.
          </Paragraph>
        </Card>
      )
    }
    return (
      <div style="display: flex; flex-direction: column; gap: 6px;">
        {list.map((todo) => (
          <TodoItem todo={todo} />
        ))}
      </div>
    )
  })
}
