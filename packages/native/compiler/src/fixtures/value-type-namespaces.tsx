/* eslint-disable */
// The lathe bookshelf data module, written the way a HAND author writes a
// schema: the value and its type share a name (`const Book = s.object(…)`
// beside `type Book = {…}`). TypeScript keeps the two in separate namespaces;
// Swift and Kotlin do not — see value-type-namespaces.ts.
import { createHttp } from '@pyreon/http'
import { standardSchema } from '@pyreon/http/schema'
import { useQuery } from '@pyreon/query'
import { s } from '@pyreon/validate'
import { Text } from '@pyreon/primitives'

/**
 * Bookshelf — `books`, self-contained for the native compiler.
 * Everything PMTC must recognise lives at THIS file's top level: the
 * client, the schemas and the endpoint declarations. Splitting any of it
 * into a shared module would compile fine and silently stop lowering,
 * because PMTC resolves nothing across file boundaries.
 */
const api = createHttp({ baseUrl: 'http://localhost:5199/v1', schema: standardSchema })

export const Book = s.object({
  id: s.string().uuid(),
  title: s.string().min(1),
  status: s.string(),
  pages: s.number().int().min(1).optional(),
  subtitle: s.string().nullable().optional(),
  tags: s.array(s.string()).optional(),
})
export type Book = {
  id: string
  title: string
  status: string
  pages?: number | undefined
  subtitle?: string | null | undefined
  tags?: string[] | undefined
}

export const NewBook = s.object({
  title: s.string().min(1),
  pages: s.number().int().min(1).optional(),
})
export type NewBook = {
  title: string
  pages?: number | undefined
}

/**
 * Add a book.
 * `POST /books`
 */
export const createBook = api.endpoint('POST /books', { response: Book })

/**
 * One book by id.
 * `GET /books/:bookId`
 */
export const getBook = api.endpoint('GET /books/:bookId', { response: Book })

/**
 * Every book in the catalogue.
 * `GET /books`
 */
export const listBooks = api.endpoint('GET /books', { response: s.array(Book) })

/**
 * Fetches `GET /books/:bookId` and renders it through `children`.
 * Takes `bookId` as a prop and re-fetches when it changes.
 * The `useQuery` call sits directly in the component body, in the same
 * file as its client and endpoint — the one arrangement PMTC lowers to
 * PyreonQuery. Moving it into a hook silently breaks the native build.
 */
export function GetBookData(props: { bookId: string; children: (data: Book | undefined) => unknown }) {
  const q = useQuery<Book>(() => getBook.query({ params: { bookId: props.bookId } }))
  return props.children(q.data())
}

/**
 * Fetches `GET /books` and renders it through `children`.
 * The `useQuery` call sits directly in the component body, in the same
 * file as its client and endpoint — the one arrangement PMTC lowers to
 * PyreonQuery. Moving it into a hook silently breaks the native build.
 */
export function ListBooksData(props: { children: (data: Book[] | undefined) => unknown }) {
  const q = useQuery<Book[]>(() => listBooks.query())
  return props.children(q.data())
}

// The enum twin of the idiom: a default VALUE named after its TYPE.
export type Shelf = 'reading' | 'done'
export const Shelf = 'reading'
interface Limits { max: number }
const Limits = 10

export function ShelfBadge(props: { count: number }) {
  const shelf: Shelf = Shelf
  return <Text>{`${shelf}: ${props.count}/${Limits}`}</Text>
}
