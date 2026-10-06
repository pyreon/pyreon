import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { createHttp } from '@pyreon/http'
import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
const book = zodSchema(z.object({ rating: z.number(), pages: z.number().int(), title: z.string() }))
const api = createHttp({ baseUrl: 'https://x.io' })
const getBook = api.endpoint('GET /books/:id', { response: book })
type Book = { rating: number; pages: number; title: string }
export function B() {
  const one = useQuery<Book>(() => getBook.query({ params: { id: '1' } }))
  return (<Stack><Text>hi</Text></Stack>)
}
