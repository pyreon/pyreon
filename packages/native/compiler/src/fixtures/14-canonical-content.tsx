// Phase B5.4 fixture — canonical content + interaction shapes
// (Image / Icon / Press) NOT exercised by fixtures 01-13.
//
// 2026-06 native readiness audit: extends B5.3's overlay coverage to
// include 3 more canonical primitives. (Link was deliberately omitted
// because `PyreonLink` isn't in kotlin-stubs.ts yet — that's a small
// B5.5 follow-up.)
//
// Both targets should emit idiomatic native widgets:
//   Swift:  AsyncImage / Image(systemName:) / Button { }.buttonStyle(.plain)
//   Kotlin: AsyncImage / Icon(imageVector = pyreonIcon(...)) /
//           Box(Modifier.clickable)
//
// Validated by BOTH swiftc-parse + kotlinc.

import { signal } from '@pyreon/reactivity'

export function GalleryRow() {
  const pressed = signal<number>(0)
  return (
    <Stack>
      <Image src="https://example.test/photo.jpg" alt="A photo" />
      <Image src="brand-mark.png" alt="Brand" width={24} height={24} fit="contain" />
      <Icon name="star" />
      <Press onPress={() => pressed.set(pressed() + 1)}>
        <Text>Press me</Text>
      </Press>
    </Stack>
  )
}
