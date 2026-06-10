import { For } from '@pyreon/core'
import { useField, useForm } from '@pyreon/form'
import { useMutation, useQuery } from '@pyreon/query'
import { RouterLink } from '@pyreon/router'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { createBoard, fetchBoards } from '../api/boards'

// Server-owned "envelope" data → @pyreon/query (request/response). The live board
// CONTENTS are @pyreon/sync (CRDT). Different sources of truth, different
// packages — the canonical query-vs-sync split, in code. Options-as-a-FUNCTION
// is the idiom (queryKey can read signals + refetch reactively).
const boardSchema = z.object({
  name: z.string().min(1, 'Name is required').max(40, 'Keep it under 40 characters'),
})

export function BoardListRoute() {
  const boards = useQuery(() => ({
    queryKey: ['boards'],
    queryFn: fetchBoards,
  }))

  // Mutation → "create" a board, then invalidate the list query so it refetches.
  const create = useMutation({
    mutationFn: createBoard,
    invalidates: [['boards']],
  })

  // @pyreon/form + @pyreon/validation (Zod schema) — validated create form.
  const form = useForm({
    initialValues: { name: '' },
    schema: zodSchema(boardSchema),
    validateOn: 'blur',
    onSubmit: async (values) => {
      await create.mutateAsync(values)
      form.reset()
    },
  })
  const name = useField(form, 'name')

  return (
    <div class="board-list">
      <h1>Pyreon Collab Board</h1>
      <p>
        A real-time collaborative kanban. Each board is its own CRDT room — open one in two
        browser windows (or two devices, via the relay) to watch edits sync live, one
        fine-grained DOM update at a time.
      </p>

      <form class="create-form" onSubmit={(e: Event) => form.handleSubmit(e)}>
        <input placeholder="New board name…" data-testid="new-board-name" {...name.register()} />
        <button class="btn primary" type="submit" disabled={form.isSubmitting()} data-testid="create-board">
          {() => (form.isSubmitting() ? 'Creating…' : 'Create board')}
        </button>
      </form>
      {() => (name.showError() ? <div class="error" data-testid="name-error">{name.error()}</div> : null)}

      {() => (boards.isPending() ? <p class="loading">Loading boards…</p> : null)}
      {() => (boards.error() ? <p style="color:var(--off)">Failed to load boards.</p> : null)}
      <ul data-testid="board-list">
        <For each={() => boards.data() ?? []} by={(b) => b.id}>
          {(board) => (
            <li>
              <RouterLink to={`/board/${board.id}`}>{board.title}</RouterLink>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
