// Phase B5 fixture — canonical-vocabulary layout shapes (Stack/Inline/
// Heading) NOT exercised by the original 01-10 fixture set.
//
// 2026-06 native readiness audit: scout-1 flagged that the existing
// validate-swift fixture loop didn't exercise the broader canonical-
// primitive surface — only Text/Button/Show/For. This fixture covers
// the layout primitives so a regression in their emit fails the
// per-target compile gate. Validated by BOTH swiftc-parse + kotlinc.

import { signal } from '@pyreon/reactivity'

export function Profile() {
  const _expanded = signal<boolean>(true)
  return (
    <Stack>
      <Heading>Welcome back</Heading>
      <Inline>
        <Text>Status:</Text>
        <Text>online</Text>
      </Inline>
      <Stack>
        <Text>Member since 2024</Text>
      </Stack>
    </Stack>
  )
}
