import { signal } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import { For } from '@pyreon/core'

const FAKE_COMMENTS = [
  { id: 1, author: 'alice', body: 'First!' },
  { id: 2, author: 'bob', body: 'Nice post.' },
  { id: 3, author: 'carol', body: 'Looking forward to more.' },
]

export default function VisibleComments() {
  const comments = signal<typeof FAKE_COMMENTS>([])
  onMount(() => {
    // Simulate a network request when the island hydrates (fires only when the
    // island scrolls into view).
    const id = setTimeout(() => comments.set(FAKE_COMMENTS), 50)
    return () => clearTimeout(id)
  })
  return (
    <div data-testid="visible-comments" style="padding: 12px; border: 1px solid #ccc; border-radius: 4px;">
      <strong>Comments (loaded on visible):</strong>
      <ul data-testid="visible-comments-list">
        <For each={() => comments()} by={(c) => c.id}>
          {(c) => (
            <li>
              <em>{c.author}</em>: {c.body}
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
