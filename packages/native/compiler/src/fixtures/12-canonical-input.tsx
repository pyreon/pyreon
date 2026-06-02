// Phase B5.2 fixture — canonical-vocabulary input shapes
// (Field/Toggle/Modal) NOT exercised by fixtures 01-11.
//
// 2026-06 native readiness audit: extends B5's `11-canonical-layout`
// to cover the input + overlay primitives. Both targets should emit
// idiomatic native form widgets (SwiftUI TextField/Toggle/Sheet;
// Compose TextField/Switch/Dialog).
//
// Validated by BOTH swiftc-parse + kotlinc; regression in any of the
// 3 emit paths surfaces here before reaching a real example app.

import { signal } from '@pyreon/reactivity'

export function ContactForm() {
  const draft = signal<string>('')
  const subscribed = signal<boolean>(false)
  const helpOpen = signal<boolean>(false)
  return (
    <Stack>
      <Field
        value={draft}
        onChangeText={(t) => draft.set(t)}
        placeholder="Your message"
      />
      <Toggle value={subscribed} onChange={(v) => subscribed.set(v)} />
      <Modal open={helpOpen} onClose={() => helpOpen.set(false)}>
        <Text>Help content</Text>
      </Modal>
    </Stack>
  )
}
