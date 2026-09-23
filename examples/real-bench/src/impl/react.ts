import { memo, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { Filter, Todo, TodoApp } from '../types'

/**
 * Idiomatic React 19: `useState<Todo[]>` + memoised rows. A toggle/clear/add
 * produces a NEW array → the list component re-renders and React reconciles via
 * its VDOM diff (memo skips rows whose props are referentially unchanged). This
 * is the real shape a React user ships — NOT signals.
 *
 * Timed actions run inside `flushSync` (`runCommitted`) — React's tightest real
 * commit, the same boundary `examples/benchmark` uses. `commit()` (rAF →
 * setTimeout) is kept ONLY for untimed setup; it used to sit inside the timed
 * window, charging React up to a frame of idle per sample. Elements are written
 * as the automatic JSX runtime's `jsx()`/`jsxs()` output (what a React app's
 * own toolchain emits), not `createElement`.
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
  return jsxs('li', {
    className: todo.done ? 'completed' : '',
    'data-id': todo.id,
    children: [
      jsx('input', { type: 'checkbox', checked: todo.done, readOnly: true }),
      jsx('span', { children: todo.text }),
    ],
  })
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

  return jsx('ul', { className: 'todos', children: visible.map((t) => jsx(Row, { todo: t }, t.id)) })
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
          jsx(App, {
            onReady: (s: Setters) => {
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
    runCommitted(fn) {
      flushSync(fn)
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
