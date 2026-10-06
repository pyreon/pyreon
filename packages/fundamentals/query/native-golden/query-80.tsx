
import { createHttp } from '@pyreon/http'
import { standardSchema } from '@pyreon/http/schema'
import { useQuery } from '@pyreon/query'
import { s } from '@pyreon/validate'
const api = createHttp({ baseUrl: 'http://localhost:5199/v1', schema: standardSchema })
export const book_schema = s.object({
  id: s.string(),
  pages: s.number().int().min(1).optional(),
  rating: s.number().min(0).max(5).optional(),
  price: s.number(),
  scores: s.array(s.number()),
  counts: s.array(s.number().int()),
  shelf: s.object({ label: s.string(), weight: s.number() }).optional(),
})
export type Shelf = { label: string; weight: number }
export type Book = {
  id: string
  pages?: number | undefined
  rating?: number | undefined
  price: number
  scores: number[]
  counts: number[]
  shelf?: Shelf | undefined
}
export const getBook = api.endpoint('GET /books/:bookId', { response: s.array(book_schema) })
export function BookData(props: { bookId: string; children: (data: Book[] | undefined) => unknown }) {
  const q = useQuery<Book[]>(() => getBook.query({ params: { bookId: props.bookId } }))
  return () => props.children(q.data())
}
