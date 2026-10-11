import { useFieldArray } from '@pyreon/form'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const tags = useFieldArray(['first', 'second'])
  return <Stack>
    <Button onPress={() => { tags.move(0, 1); tags.swap(0, 1); tags.update(0, 'next') }}>Move</Button>
    <Text>{tags.length()}</Text>
  </Stack>
}
