import { s } from '@pyreon/validate'
import { createHttp } from '@pyreon/http'
import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
const book = s.object({ rating: s.number(), items: s.array(s.object({ price: s.number(), counts: s.array(s.number()) })), inner: s.object({ score: s.number() }) })
const api = createHttp({ baseUrl: 'https://x.io' })
const getBook = api.endpoint('GET /books/:id', { response: book })
type Row = { price: number; counts: number[] | undefined }
type Inner = { score: number }
type Book = { rating: number | undefined; items?: Row[]; inner: Inner | undefined }
export function B() {
  const one = useQuery<Book>(() => getBook.query({ params: { id: '1' } }))
  const two = useQuery<Book | undefined>(() => getBook.query({ params: { id: '2' } }))
  return (<Stack><Text>hi</Text></Stack>)
}
