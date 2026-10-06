import { s } from '@pyreon/validate'
import { createHttp } from '@pyreon/http'
import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
const book = s.object({ title: s.string(), rating: s.number(), pages: s.number().int(), item: s.object({ price: s.number(), qty: s.number().int(), tags: s.array(s.number()), counts: s.array(s.number().int()) }), items: s.array(s.object({ price: s.number(), nested: s.array(s.object({ w: s.number() })) })), inner: s.object({ score: s.number() }) })
const api = createHttp({ baseUrl: 'https://x.io' })
const getBook = api.endpoint('GET /books/:id', { response: book })
const listBooks = api.endpoint('GET /books', { response: s.array(book) })
type Item = { price: number; qty: number; tags: number[]; counts: number[] }
type Row = { price: number; nested: Wide[] }
type Wide = { w: number }
type Inner = { score: number }
type Book = { title: string; rating: number; pages: number; item: Item; items: Row[]; inner: Inner | undefined }
export function B() {
  const one = useQuery<Book>(() => getBook.query({ params: { id: '1' } }))
  const many = useQuery<Book[]>(() => listBooks.query())
  return (<Stack><Text>hi</Text></Stack>)
}
