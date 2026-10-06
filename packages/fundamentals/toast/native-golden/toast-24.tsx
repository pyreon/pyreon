
import { Stack, Text, Press } from '@pyreon/primitives'
import { toast, Toaster } from '@pyreon/toast'
export function App() {
  const name = "world"
  return (
    <Stack gap={2}>
      <Press data-testid="save" onPress={() => toast("Saved " + name)}><Text>Save</Text></Press>
      <Press data-testid="ok" onPress={() => toast.success("Done")}><Text>OK</Text></Press>
      <Press data-testid="bad" onPress={() => toast.error("Failed")}><Text>Bad</Text></Press>
      <Toaster />
    </Stack>
  )
}
