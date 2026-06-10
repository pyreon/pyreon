// Tier-2 fixture for @pyreon/permissions — the first kotlinc/swiftc
// validation of ANY usePermissions shape (the hook recognition shipped
// in Phase 4, but no fixture ever exercised the emitted call surface;
// the PyreonPermissions kotlin-stub was added together with this
// fixture).
//
// Verified scope:
//   - usePermissions(['posts.edit', 'admin.*']) → PyreonPermissions
//     (literal grant set; wildcard keys)
//   - Callable read `can('posts.edit')` (callAsFunction / operator
//     invoke on the runtime ports)
//   - `can.not('key')` — the web-parity inverse (added to BOTH runtime
//     ports with this fixture; only `cannot` existed before)
//   - `can.all('a', 'b')` / `can.any('a', 'b')` variadic checks
//   - `<Show when={() => can('key')}>` — the canonical web accessor
//     form unwraps to the condition body (pre-fix this emitted a bare
//     closure in `if` position — a type error on both targets)
//
// Deferred (documented follow-ups):
//   - can.set(...) / can.patch(...) reactive grant updates
//   - PermissionsProvider / context-driven grants

import { usePermissions } from '@pyreon/permissions'
import { Show } from '@pyreon/core'
import { Stack, Text, Button } from '@pyreon/primitives'

export function PermissionsPanel() {
  const can = usePermissions(['posts.edit', 'admin.*'])

  return (
    <Stack>
      <Show when={() => can('posts.edit')}>
        <Button onPress={() => {}}>Edit post</Button>
      </Show>
      <Text>{can.not('posts.delete') ? 'read-only' : 'writable'}</Text>
      <Text>{can.all('posts.edit', 'admin.users') ? 'super' : 'normal'}</Text>
      <Text>{can.any('posts.edit', 'billing.view') ? 'some' : 'none'}</Text>
    </Stack>
  )
}
