import { s } from '@pyreon/validate'
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'

const book = s.object({ title: s.string(), rating: s.number(), pages: s.number().int() })
const api = createHttp({ baseUrl: 'https://x.io' })
const getBook = api.endpoint('GET /books/:id', { response: book })
const createBook = api.endpoint('POST /books', { response: book })
type Book = { title: string; rating: number; pages: number }

// A response schema is evidence for the decode type's Int/Double fields; an endpoint's json body is the request default; the
// property form of a read is typed too; and an anonymous object literal makes the file's synthesized struct names depend on
// the fetch declarations' own shape.
export function Library() {
  const cfg = { retries: 3, label: 'x' }
  const one = useFetch<Book>(getBook({ params: { id: '1' } }))
  const made = useFetch<Book>(createBook({ json: { title: 'x' } }))
  const lower = useFetch<Book>('/api/lower', { method: 'post', body: 'x' })
  return (
    <Stack>
      <Text>{one.data()?.title ?? ''}</Text>
      <Text>{String(made.data?.rating)}</Text>
      <Text>{String(lower.error ? cfg.retries : cfg.label.length)}</Text>
    </Stack>
  )
}
