// Router-hook fixture — exercises useNavigate / useParams / useLoaderData
// to lock the corresponding Kotlin stubs in `kotlin-stubs.ts`.
//
// Pre-fix: `validate-kotlin.test.ts` had no fixture using router hooks
// so the kotlin-stubs missed `useNavigate` / `useParams` /
// `useLoaderData`. The Gap 5 tasks showcase scaffold (#1449) was the
// first PMTC consumer to hit it — emitted code referenced
// `useNavigate()` but kotlinc reported `unresolved reference`.
//
// This fixture's emit references all three hooks; its presence in
// the validate-kotlin loop proves the stubs resolve cleanly.

import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
import { useNavigate, useParams, useLoaderData } from '@pyreon/router'

type User = { id: string; name: string }

export function UserDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const user = useLoaderData<User>()
  const draft = signal('')
  void user

  return (
    <Stack>
      <Text>User id: {id}</Text>
      <Text>Draft: {draft()}</Text>
      <Button onPress={() => navigate('/')}>Back</Button>
    </Stack>
  )
}
