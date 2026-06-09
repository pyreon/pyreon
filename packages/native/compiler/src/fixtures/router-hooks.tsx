// Router-hook fixture — exercises useNavigate / useParams to lock
// the corresponding Kotlin stubs in `kotlin-stubs.ts`.
//
// Pre-fix: `validate-kotlin.test.ts` had no fixture using router hooks
// so the kotlin-stubs missed `useNavigate` / `useParams`. The Gap 5
// tasks showcase scaffold (#1449) was the first PMTC consumer to hit
// it — emitted code referenced `useNavigate()` but kotlinc reported
// `unresolved reference`.
//
// This fixture's emit references both hooks; its presence in the
// validate-kotlin loop proves the stubs resolve cleanly. The third
// stub `useLoaderData` is verified independently — adding it here
// would emit the Phase B6 informational warning that the @pyreon/
// native-cli build test asserts as zero.

import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
import { useNavigate, useParams } from '@pyreon/router'

export function UserDetail() {
  const navigate = useNavigate()
  const { id } = useParams()
  const draft = signal('')

  return (
    <Stack>
      <Text>User id: {id}</Text>
      <Text>Draft: {draft()}</Text>
      <Button onPress={() => navigate('/')}>Back</Button>
    </Stack>
  )
}
