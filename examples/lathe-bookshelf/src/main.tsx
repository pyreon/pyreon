/**
 * Bookshelf — every request in this app goes through generated code.
 *
 * Nothing here declares a URL, a method, a query key or a response type. All of
 * that comes from `openapi.yaml` via `lathe generate`, so the only way for the
 * client to drift from the API is for the spec to be wrong.
 */
import { For, Show } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { Author, Book } from './gen/schemas'
import { useListAuthors } from './gen/queries/authors'
import { useGetBook, useListBooks } from './gen/queries/books'

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})

function Books() {
  // Every field on a query result is a SIGNAL, so it is CALLED: `books.data()`,
  // not `books.data`. Reading the property without calling it yields the signal
  // function, which is truthy — so `books.data ?? []` silently skips the
  // fallback and `.length` reads the function's arity.
  const books = useListBooks()

  // A query with a PATH PARAMETER — the shape Lathe reports as web-only,
  // because PMTC bakes request URLs at compile time and a runtime id cannot be
  // baked. It works perfectly on the web; it just does not cross.
  const selected = signal<string | undefined>(undefined)
  const detail = useGetBook(
    () => ({ params: { bookId: selected() ?? '' } }),
    // Without `enabled` the detail query fires before anything is selected and
    // requests `/books/` with an empty id.
    () => ({ enabled: selected() !== undefined }),
  )

  return (
    <section data-testid="books">
      <h2>Books</h2>
      <Show when={() => !books.isPending()} fallback={<p data-testid="books-loading">Loading...</p>}>
        <ul data-testid="book-list">
          <For each={() => books.data() ?? []} by={(b: Book) => b.id}>
            {(book: Book) => (
              <li data-testid="book-item">
                <button
                  type="button"
                  data-testid={`book-${book.id}`}
                  onClick={() => selected.set(book.id)}
                >
                  {book.title}
                </button>
                <span data-testid="book-status">{book.status ?? ''}</span>
                <span data-testid="book-pages">{String(book.pages ?? 0)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show
        when={() => selected() !== undefined}
        fallback={<p data-testid="detail-empty">Pick a book.</p>}
      >
        {/*
          The natural shape, and a live check on the boundary fix that ships
          alongside this: `when` re-runs on every `selected` change while its
          verdict stays `true`. A boundary that rebuilt on an unchanged value
          would dispose this accessor's binding and re-insert the same memoized
          element without it, pinning the title to the first book picked.
        */}
        <p data-testid="detail-title">{() => detail.data()?.title ?? ''}</p>
      </Show>
    </section>
  )
}

function Authors() {
  const authors = useListAuthors(() => ({ query: { limit: 10 } }))
  return (
    <section data-testid="authors">
      <h2>Authors</h2>
      <ul data-testid="author-list">
        <For each={() => authors.data() ?? []} by={(a: Author) => a.id}>
          {(a: Author) => <li data-testid="author-item">{a.name}</li>}
        </For>
      </ul>
    </section>
  )
}

function App() {
  return (
    <QueryClientProvider client={client}>
      <main>
        <h1>Bookshelf</h1>
        <Books />
        <Authors />
      </main>
    </QueryClientProvider>
  )
}

mount(<App />, document.getElementById('app') as HTMLElement)
