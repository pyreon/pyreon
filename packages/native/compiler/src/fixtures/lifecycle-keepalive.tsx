// Gap 3 PR-3.4 fixture — real `<KeepAlive when={X}>` emit on
// native targets (SwiftUI + Compose).
//
// v1 contract (visibility-preservation semantic):
//   - Children render when `when` is true
//   - When `when` flips false: children stay in the View tree,
//     hidden via opacity / alpha
//   - Children's @State / remember state survives toggles
//
// Closest faithful native translation of web KeepAlive's "preserve
// component state across mount/unmount" contract — native View
// trees don't have the same mount/unmount semantics as web DOM,
// so visibility-preservation is the closest analogue.

import { signal } from '@pyreon/reactivity'
import { Stack, Text, KeepAlive } from '@pyreon/primitives'

const isActive = signal(true)

export function KeepAliveShowcase() {
  return (
    <KeepAlive when={isActive()}>
      <Stack>
        <Text>Preserved across visibility toggles</Text>
      </Stack>
    </KeepAlive>
  )
}
