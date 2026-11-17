// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Maps row (MAP-2): `<MapView map={map}>` renders a `useMap()` state. On iOS
// that is a SwiftUI `Map` (MapKit, no key): the markers the state holds are
// pins on it, and the selection is two-way — tapping a pin selects it in the
// state (`Selected: …`), and selecting from code selects the pin. Android has
// no renderer yet (MAP-3) and lowers it to an empty box, with a warning.
import { onMount } from '@pyreon/core'
import { MapView, useMap } from '@pyreon/hooks'
import { Button, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

export function MapPage() {
  const navigate = useNavigate()
  const map = useMap()
  onMount(() => {
    map.setCamera({ latitude: 50.0875, longitude: 14.4213, zoom: 13 })
    map.addMarker({ id: 'old-town', latitude: 50.0875, longitude: 14.4213, title: 'Pyreon pin Old Town' })
    map.addMarker({ id: 'castle', latitude: 50.0911, longitude: 14.4016, title: 'Pyreon pin Castle' })
  })
  return (
    <Stack gap={2} padding={4} data-testid="map-page">
      <Text data-testid="map-selected">Selected: {map.selectedMarkerId ?? 'none'}</Text>
      <Text data-testid="map-count">Markers: {map.markers.length}</Text>
      <MapView map={map} height={320} data-testid="map-view" />
      <Button onPress={() => map.selectMarker('castle')} data-testid="map-select-castle">
        Select castle
      </Button>
      <Button onPress={() => map.selectMarker(null)} data-testid="map-clear">
        Clear selection
      </Button>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}
