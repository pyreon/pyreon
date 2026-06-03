// Phase B5.5 fixture — closes 15/15 canonical-primitive coverage.
//
// 2026-06 native readiness audit: B5.4 (#1252) deliberately deferred
// Link because PyreonLink wasn't in kotlin-stubs.ts. B5.5 adds the
// stub + this fixture, completing canonical-primitive coverage of
// the validate-swift / validate-kotlin loops.
//
// Both targets emit:
//   Swift:  PyreonLink("/x") { Text("Label") }
//   Kotlin: PyreonLink("/x") { navigate ->
//             Box(modifier = Modifier.clickable { navigate() }) { Text("Label") }
//           }
//
// Validated by BOTH swiftc-parse + kotlinc.

export function NavLinks() {
  return (
    <Stack>
      <Link to="/home">Home</Link>
      <Link to="/users/42">Profile</Link>
    </Stack>
  )
}
