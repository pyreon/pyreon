// Local <Checkbox> shim — transitional until canonical <Toggle> ships
// per-target emit.
//
// Background: canonical Toggle/Switch is semantically split across
// platforms (Compose's `Switch` vs SwiftUI's `Toggle` vs HTML's
// `<input type="checkbox">`), so it needs its own per-target emit fn
// in @pyreon/compiler-native — separate scope from Phase D. Until
// that lands, native TodoMVC uses the legacy SwiftUI-flavored
// `<Checkbox>` JSX tag (resolved by the native compiler to platform-
// native via its legacy emit), and this web sibling provides the
// matching DOM rendering via a thin shim.
//
// When canonical <Toggle> ships, all three siblings migrate together
// and this shim deletes.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'

export type CheckboxProps = {
  checked: boolean
  onChange?: () => void
}

export function Checkbox(props: CheckboxProps): VNode {
  return h('input', {
    type: 'checkbox',
    checked: props.checked,
    onChange: props.onChange,
  })
}
