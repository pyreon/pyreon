// Gap 3 PR-3.3 fixture — real `<ErrorBoundary fallback={X}>` emit
// on native targets (SwiftUI + Compose).
//
// v1 contract (structural boundary primitive):
//   - Children render by default
//   - Wrapper holds @State / remember error flag
//   - Layer-4 NativeIOS escape hatches (or future runtime hooks)
//     can flip the flag to swap to fallback
//
// NOT a faithful port of web's auto-catch semantic — SwiftUI/Compose
// have no try/catch around View construction — but provides the
// FALLBACK INFRASTRUCTURE in compiled output so user source compiles
// + apps can extend.

import { Stack, Text, ErrorBoundary } from '@pyreon/primitives'

export function ErrorBoundaryShowcase() {
  return (
    <ErrorBoundary fallback={<Text>Something went wrong</Text>}>
      <Stack>
        <Text>Healthy content path</Text>
      </Stack>
    </ErrorBoundary>
  )
}
