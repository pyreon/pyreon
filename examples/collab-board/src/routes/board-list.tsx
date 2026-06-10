import { For } from '@pyreon/core'
import { useQuery } from '@pyreon/query'
import { RouterLink } from '@pyreon/router'
import { fetchBoards } from '../api/boards'

// The board LIST is server-owned "envelope" data — request/response, the server
// is the source of truth — so @pyreon/query owns it. (The live board CONTENTS
// are collaborative → @pyreon/sync owns those. Different sources of truth,
// different packages: the canonical query-vs-sync split, in code.)
//
// Options-as-a-FUNCTION is the @pyreon/query idiom — `queryKey` can read signals
// and refetch reactively (here it's static, but the form is the best practice).
export function BoardListRoute() {
  const boards = useQuery(() => ({
    queryKey: ['boards'],
    queryFn: fetchBoards,
  }))

  return (
    <div class="board-list">
      <h1>Pyreon Collab Board</h1>
      <p>
        A real-time collaborative kanban. Each board is its own CRDT room — open one in two
        browser windows (or two devices, via the relay) to watch edits sync live, one
        fine-grained DOM update at a time.
      </p>
      {() => (boards.isPending() ? <p class="loading">Loading boards…</p> : null)}
      {() =>
        boards.error() ? <p style="color:var(--off)">Failed to load boards.</p> : null
      }
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
