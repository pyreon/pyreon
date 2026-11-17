// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Networking row (NET-4): the two failures a real network produces besides an
// HTTP error status, each asserted to end in the request's ERROR state.
//
// - A deadline: `/slow` (scripts/ws-echo-server.ts) answers after 5 s and the
//   call asks for 500 ms. Before this page, `timeout` had no native lowering at
//   all (named, then ignored), so the request waited for the platform default
//   and resolved with the late answer.
// - An unreachable host: `.invalid` is reserved and never resolves, so the
//   request fails in name resolution.
import { useFetch } from '@pyreon/hooks'
import { createHttp } from '@pyreon/http'
import { Button, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

interface LateReply {
  id: string
}

const fixtureApi = createHttp({ baseUrl: 'http://localhost:8790' })
const slow = fixtureApi.endpoint('GET /slow')
const nowhereApi = createHttp({ baseUrl: 'http://pyreon-device-test.invalid' })
const nowhere = nowhereApi.endpoint('GET /anything')

export function NetErrorsPage() {
  const navigate = useNavigate()
  const late = useFetch<LateReply>(slow({ timeout: 500 }))
  const lost = useFetch<LateReply>(nowhere())
  return (
    <Stack gap={2} padding={4} data-testid="net-errors-page">
      <Text>Network errors</Text>
      <Text data-testid="net-timeout">Timeout: {late.error() ? 'error' : late.data() ? 'answered' : 'pending'}</Text>
      <Text data-testid="net-unreachable">Unreachable: {lost.error() ? 'error' : lost.data() ? 'answered' : 'pending'}</Text>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}
