// Mock async "backend" for the board list. There is NO real server here — the
// point is the OWNERSHIP split: this server-owned metadata (which boards exist,
// their names) is fetched via @pyreon/query (request/response, server is the
// source of truth), while each board's live CONTENTS are @pyreon/sync (CRDT,
// the client is the source of truth). A real app would fetch this from an API
// and also get the room's auth token here, then hand off to sync.
export interface BoardSummary {
  id: string
  title: string
}

const BOARDS: BoardSummary[] = [
  { id: 'demo', title: 'Demo board' },
  { id: 'roadmap', title: 'Roadmap' },
  { id: 'standup', title: 'Team standup' },
]

export async function fetchBoards(): Promise<BoardSummary[]> {
  await new Promise((resolve) => setTimeout(resolve, 150)) // simulate latency
  return [...BOARDS]
}

/** "Create" a board (mock persist). Driven by a @pyreon/query mutation that then
 *  invalidates the `['boards']` query so the list refetches. */
export async function createBoard(input: { name: string }): Promise<BoardSummary> {
  await new Promise((resolve) => setTimeout(resolve, 150))
  const base =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'board'
  let id = base
  let n = 2
  while (BOARDS.some((b) => b.id === id)) id = `${base}-${n++}`
  const board: BoardSummary = { id, title: input.name }
  BOARDS.push(board)
  return board
}
