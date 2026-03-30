/**
 * Detail page with route params and loader data.
 *
 * PATTERNS:
 *   - useRoute() for type-safe params
 *   - useLoaderData() for fetched data
 *   - useRouter() for programmatic navigation
 *   - useHead() with dynamic title
 */

import { useHead } from '@pyreon/head'
import { useLoaderData, useRoute, useRouter } from '@pyreon/router'

interface Todo {
  id: number
  title: string
  completed: boolean
  description?: string
}

export const TodoDetail = () => {
  const route = useRoute<'/todo/:id'>()
  const todo = useLoaderData<Todo>()
  const router = useRouter()

  useHead(() => ({
    title: todo.title,
    meta: [{ name: 'description', content: `Todo #${route().params.id}` }],
  }))

  return (
    <div>
      <button type="button" onClick={() => router.back()}>
        ← Back
      </button>
      <h1>{todo.title}</h1>
      <p>Status: {todo.completed ? 'Done' : 'Active'}</p>
      <p>{todo.description ?? 'No description.'}</p>
    </div>
  )
}
