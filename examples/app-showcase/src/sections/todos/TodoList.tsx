import { useContext } from '@pyreon/core'
import { EmptyCard, EmptyHint, EmptyText, ListContainer } from './styled'
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

  return () => {
    const list = props.items()
    if (list.length === 0) {
      return (
        <EmptyCard>
          <EmptyText>No todos match the current filters.</EmptyText>
          <EmptyHint>
            Press <kbd>N</kbd> to add a new one or change the status filter above.
          </EmptyHint>
        </EmptyCard>
      )
    }
    return (
      <ListContainer>
        {list.map((todo) => (
          <TodoItem todo={todo} />
        ))}
      </ListContainer>
    )
  }
}
