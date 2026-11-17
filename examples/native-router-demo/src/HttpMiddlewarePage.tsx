// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Networking row (NET-3): `createHttp` client middleware on a device. The
// client's `use` array lowers to the native PyreonHttpMiddleware onion:
// `bearer` adds the Authorization header on every request, and `retry` re-sends
// a request the server answered with 503. The fixture (`/flaky` in
// scripts/ws-echo-server.ts) answers 503 once after a reset, then 200 with the
// number of requests it saw and the Authorization header it received — so the
// page shows `Attempts: 2` only if the retry ran, and the token only if bearer
// put it on the wire.
import { useFetch } from '@pyreon/hooks'
import { createHttp } from '@pyreon/http'
import { bearer, retry } from '@pyreon/http/middleware'
import { Button, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

type Int = number

interface FlakyReply {
  attempts: Int
  authorization: string
}

const flakyApi = createHttp({
  baseUrl: 'http://localhost:8790',
  use: [bearer(() => 'tok-mw'), retry({ limit: 2, statuses: [503] })],
})
const flaky = flakyApi.endpoint('GET /flaky')

export function HttpMiddlewarePage() {
  const navigate = useNavigate()
  const reply = useFetch<FlakyReply>(flaky())
  return (
    <Stack gap={2} padding={4} data-testid="http-mw-page">
      <Text>Http middleware</Text>
      <Text data-testid="http-mw-attempts">Attempts: {reply.data()?.attempts ?? 0}</Text>
      <Text data-testid="http-mw-auth">Auth: {reply.data()?.authorization ?? 'none'}</Text>
      <Text data-testid="http-mw-error">Error: {reply.error() ? 'yes' : 'no'}</Text>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}
