import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'

type Item = { id: number }
const BODY = 'x'
const verb = 'post'
const auth = 'token'

// Every request-init shape: literals are baked, anything else is named and dropped.
export function Requests() {
  const post = useFetch<Item>('/api/items', { method: 'post', body: '{"a":1}', headers: { 'Content-Type': 'application/json' } })
  const put = useFetch<Item>('/api/items/1', { method: 'PUT' })
  const hdr = useFetch<Item>('/api/h', { headers: { Authorization: 'Bearer x', 'X-Dynamic': auth, 'X-Num': 1 } })
  const dynMethod = useFetch<Item>('/api/m', { method: verb })
  const dynBody = useFetch<Item>('/api/b', { method: 'POST', body: BODY })
  const badHeaders = useFetch<Item>('/api/bh', { headers: auth })
  const unknown = useFetch<Item>('/api/u', { credentials: 'include', signal: undefined })
  const computed = useFetch<Item>('/api/c', { [verb]: 'x', method: 'DELETE' })
  const notObject = useFetch<Item>('/api/n', verb)
  const hdrComputed = useFetch<Item>('/api/hc', { headers: { [auth]: 'y', A: 'b' } })
  return <Stack><Text>{String(post.data()) + String(put.data()) + String(hdr.data()) + String(dynMethod.data()) + String(dynBody.data()) + String(badHeaders.data()) + String(unknown.data()) + String(computed.data()) + String(notObject.data()) + String(hdrComputed.data())}</Text></Stack>
}
