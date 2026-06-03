import { createElement as r, memo, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Filter, Todo, TodoApp } from '../types'

/**
 * Idiomatic React 19: `useState<Todo[]>` + memoised rows. A toggle/clear/add
 * produces a NEW array → the list component re-renders and React reconciles via
 * its VDOM diff (memo skips rows whose props are referentially unchanged). This
 * is the real shape a React user ships — NOT signals. `commit()` waits for the
 * DefaultLane commit (MessageChannel fires before rAF; rAF→setTimeout(0) is the
 * conservative "React has painted" barrier the synthetic benchmark uses too).
 */
interface Setters {
  seed: (todos: Todo[]) => void
  addOne: (text: string) => void
  toggleAll: (done: boolean) => void
  clearCompleted: () => void
  setFilter: (f: Filter) => void
}

function afterCommit(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}

const Row = memo(function Row({ todo }: { todo: Todo }) {
  return r(
    'li',
    { className: todo.done ? 'completed' : '', 'data-id': todo.id },
    r('input', { type: 'checkbox', checked: todo.done, readOnly: true }),
    r('span', null, todo.text),
  )
})

function App({ onReady }: { onReady: (s: Setters) => void }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const nextId = useState(() => ({ v: 1 }))[0]

  useEffect(() => {
    onReady({
      seed: (next) => {
        nextId.v = next.reduce((m, t) => Math.max(m, t.id), 0) + 1
        setTodos(next)
      },
      addOne: (text) => setTodos((prev) => [...prev, { id: nextId.v++, text, done: false }]),
      toggleAll: (done) => setTodos((prev) => prev.map((t) => ({ ...t, done }))),
      clearCompleted: () => setTodos((prev) => prev.filter((t) => !t.done)),
      setFilter,
    })
    // onReady identity is stable per mount; run once.
  }, [])

  const visible =
    filter === 'active'
      ? todos.filter((t) => !t.done)
      : filter === 'completed'
        ? todos.filter((t) => t.done)
        : todos

  return r(
    'ul',
    { className: 'todos' },
    visible.map((t) => r(Row, { key: t.id, todo: t })),
  )
}

export function createReactApp(): TodoApp {
  let root: Root | null = null
  let setters: Setters | null = null

  return {
    name: 'React 19',
    mount(container) {
      root = createRoot(container)
      // React's onReady fires from useEffect (post-commit) — resolve mount only
      // once setters exist, so the harness's untimed seed() can't no-op.
      return new Promise<void>((resolve) => {
        root!.render(
          r(App, {
            onReady: (s) => {
              setters = s
              resolve()
            },
          }),
        )
      })
    },
    seed(todos: Todo[]) {
      setters?.seed(todos)
    },
    addOne(text) {
      setters?.addOne(text)
    },
    toggleAll(done) {
      setters?.toggleAll(done)
    },
    clearCompleted() {
      setters?.clearCompleted()
    },
    setFilter(f) {
      setters?.setFilter(f)
    },
    commit() {
      return afterCommit()
    },
    unmount() {
      root?.unmount()
      root = null
      setters = null
    },
  }
}
