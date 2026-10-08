import { PyreonUI, PyreonUIProvider } from '@pyreon/ui-core'
import { Text } from '@pyreon/primitives'
export function Providers() {
  return (
    <PyreonUI mode="dark">
      <Text>outer</Text>
      <PyreonUIProvider mode="light">
        <Text>inner</Text>
      </PyreonUIProvider>
    </PyreonUI>
  )
}
