// Gap 3 PR-3.2 fixture — real `<Suspense fallback={X}>` emit on
// native targets (SwiftUI + Compose).
//
// v1 contract (mount-time splash semantic):
//   - Fallback renders on first mount
//   - `.task` / `LaunchedEffect` flips state on first frame
//   - Content swaps in after the flip
//
// This is the standard "splash screen on startup" pattern + the
// closest faithful native translation of web Suspense (which has
// no equivalent on either platform — see audit Gap 3 PR-3.2).

import { Stack, Text, Suspense } from '@pyreon/primitives'

export function SuspenseShowcase() {
  return (
    <Suspense fallback={<Text>Loading…</Text>}>
      <Stack>
        <Text>Content rendered after first frame</Text>
      </Stack>
    </Suspense>
  )
}
