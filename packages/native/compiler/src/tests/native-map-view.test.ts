// MAP-2: `<MapView map={map}>` renders a `useMap()` state — SwiftUI `Map` on
// iOS (`PyreonMapView`), a NAMED empty box on Android (MAP-3). And the map
// calls an example has to make to fill it: `setCamera({ … })` / `addMarker({ … })`
// / `setMarkers([{ … }])` used to lower their object literals to an anonymous
// synthesized struct, never the runtime's `PyreonMapCamera` / `PyreonMapMarker`,
// so they compiled on neither target with no warning; and Kotlin's `moveTo`
// passed a whole-number zoom as a `Long` to a `Double` parameter.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SRC = `import { onMount } from '@pyreon/core'
import { MapView, useMap } from '@pyreon/hooks'
import { Button, Stack, Text } from '@pyreon/primitives'
export function M() {
  const map = useMap()
  onMount(() => {
    map.setCamera({ latitude: 50.0875, longitude: 14.4213, zoom: 13 })
    map.addMarker({ id: 'a', latitude: 50.0875, longitude: 14.4213, title: 'A' })
    map.setMarkers([{ id: 'b', latitude: 50, longitude: 14 }])
  })
  return (
    <Stack>
      <MapView map={map} height={300} data-testid="map-view" />
      <Text>Selected: {map.selectedMarkerId ?? 'none'}</Text>
      <Button onPress={() => map.moveTo(48.8584, 2.2945, 14)}>Paris</Button>
    </Stack>
  )
}`

describe('<MapView> and the map calls that fill it', () => {
  it('Swift: PyreonMapView bound to the state, and nominal camera / marker values', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('PyreonMapView(state: map).frame(height: 300).accessibilityIdentifier("map-view")')
    expect(out.code).toContain('map.setCamera(PyreonMapCamera(latitude: 50.0875, longitude: 14.4213, zoom: 13.0))')
    expect(out.code).toContain('map.addMarker(PyreonMapMarker(id: "a", latitude: 50.0875, longitude: 14.4213, title: "A"))')
    expect(out.code).toContain('map.setMarkers([PyreonMapMarker(id: "b", latitude: 50.0, longitude: 14.0)])')
    expect(out.code).not.toMatch(/__Obj\d/)
  })

  it('Kotlin: a named empty box (MAP-3), nominal values and Double zooms', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.warnings.join('\n')).toContain('<MapView> has no Android renderer yet (MAP-3')
    expect(out.code).toContain('Box(modifier = Modifier.testTag("map-view").fillMaxWidth().height(300.dp)) {}')
    expect(out.code).toContain('map.setCamera(PyreonMapCamera(latitude = 50.0875, longitude = 14.4213, zoom = 13.0))')
    expect(out.code).toContain('map.setMarkers(listOf(PyreonMapMarker(id = "b", latitude = 50.0, longitude = 14.0)))')
    expect(out.code).toContain('map.moveTo(48.8584, 2.2945, 14.0)')
    expect(out.code).not.toMatch(/__Obj\d/)
  })

  it('a field the runtime type lacks is named, not synthesized', () => {
    const bad = SRC.replace("title: 'A'", "title: 'A', color: 'red'")
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(bad, { target }).warnings.join('\n')).toContain('PyreonMapMarker has no field `color`')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })
})
