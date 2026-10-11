import { PyreonUI } from '@pyreon/ui-core'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function Modes() {
  const mode = signal('dark')
  return (
    <>
      <PyreonUI mode="system">
        <Text>system</Text>
      </PyreonUI>
      <PyreonUI mode={mode()}>
        <Text>reactive</Text>
      </PyreonUI>
      <Text>sibling</Text>
    </>
  )
}
