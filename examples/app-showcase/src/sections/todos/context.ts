import { createContext } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import type { useTodos } from './store/todos'

type TodosStoreApi = ReturnType<typeof useTodos>

export interface TodosCtxValue {
  store: TodosStoreApi['store']
  patch: TodosStoreApi['patch']
  selectedId: Signal<string | undefined>
}

/**
 * Pass the todos store + currently selected row id down to TodoList /
 * TodoItem so they don't need to call `useTodos()` themselves and can
 * react to selection changes from anywhere in the section.
 */
export const TodosCtx = createContext<TodosCtxValue | null>(null)
