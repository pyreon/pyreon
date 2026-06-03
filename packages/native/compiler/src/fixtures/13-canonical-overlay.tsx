// Phase B5.3 fixture — canonical overlay + scroll + spacer shapes
// (Layer / Scroll / Spacer) NOT exercised by fixtures 01-12.
//
// 2026-06 native readiness audit: extends B5.2's input coverage to
// include the remaining layout primitives — Layer (z-stack), Scroll
// (overflow container), Spacer (flex spacer).
//
// Both targets should emit:
//   Swift: ZStack / ScrollView / Spacer()
//   Kotlin: Box / Column(Modifier.verticalScroll) / Spacer(Modifier.weight(1f))
//
// Validated by BOTH swiftc-parse + kotlinc.

export function CardOverlay() {
  return (
    <Layer>
      <Stack>
        <Text>Header</Text>
        <Spacer />
        <Text>Footer</Text>
      </Stack>
      <Scroll axis="vertical">
        <Stack>
          <Text>Scroll item 1</Text>
          <Text>Scroll item 2</Text>
        </Stack>
      </Scroll>
    </Layer>
  )
}
