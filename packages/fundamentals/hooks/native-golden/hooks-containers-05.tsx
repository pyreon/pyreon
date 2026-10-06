import { useMap } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'

// The labelled calls on Swift (moveTo has a defaulted zoom, so both arities are legal), reads in call and member form, and the
// optional selected id.
export function Atlas() {
  const map = useMap()
  return (
    <Stack>
      <Button onPress={() => map.moveTo(37.3, -122.0)}>go</Button>
      <Button onPress={() => map.moveTo(37.3, -122.0, 12)}>zoom</Button>
      <Button onPress={() => map.removeMarker('a')}>drop</Button>
      <Button onPress={() => map.selectMarker('a')}>pick</Button>
      <Button onPress={() => map.moveTo(1)}>partial</Button>
      <Text>{String(map.camera())}</Text>
      <Text>{String(map.markers().length)}</Text>
      <Text>{map.selectedMarkerId() ?? 'none'}</Text>
      <Text>{map.selectedMarkerId}</Text>
      <Text>{String(map.markers)}</Text>
    </Stack>
  )
}
