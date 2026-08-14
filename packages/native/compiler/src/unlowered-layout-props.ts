/**
 * Canonical layout props that have NO native lowering yet.
 *
 * These are documented props on `@pyreon/primitives` that both emitters
 * ignored entirely — no emit, no diagnostic. `<Stack justify="between">`
 * produced a bare `VStack` / `Column`, and `<Inline wrap>` a plain
 * `HStack` / `Row`. The layout simply came out different on device than in a
 * browser, and nothing said so.
 *
 * They are declared here rather than implemented because neither has a
 * faithful lowering on BOTH targets today:
 *
 * - `justify` — Compose maps all six values directly
 *   (`Arrangement.SpaceBetween` and friends), but SwiftUI's stacks have no
 *   equivalent: `between` / `around` / `evenly` need `Spacer()` interleaved
 *   between children, which is a structural transform, and `start` / `center`
 *   / `end` need the stack made greedy with `.frame(max…: .infinity)`, which
 *   changes its sizing beyond what the prop asks for. Shipping the Compose
 *   half alone would put the two platforms out of agreement — the exact
 *   failure `<Transition name>` already taught us to avoid.
 * - `wrap` — Compose has `FlowRow`; SwiftUI has no wrapping stack at all and
 *   needs a custom `Layout`.
 *
 * A warning is the honest interim: the author learns the prop is inert on
 * device instead of discovering it from a screenshot.
 */
export type UnloweredLayoutProp = 'justify' | 'wrap'

const ADVICE: Record<UnloweredLayoutProp, string> = {
  justify:
    'Compose has `Arrangement.SpaceBetween` and friends, but SwiftUI stacks have no equivalent — ' +
    '`between`/`around`/`evenly` need `Spacer()` interleaved between children, and `start`/`center`/`end` ' +
    'need the stack made greedy, which changes its sizing beyond what the prop asks for. Until both ' +
    'targets can agree, use `<Spacer />` between children (it lowers on both), or an explicit ' +
    '`<NativeIOS>` / `<NativeAndroid>` branch',
  wrap: 'Compose has `FlowRow`; SwiftUI has no wrapping stack and needs a custom `Layout`. Until both ' +
    'targets can agree, wrap the row yourself (a `<For>` over pre-chunked rows lowers on both), or use ' +
    'an explicit `<NativeIOS>` / `<NativeAndroid>` branch',
}

/**
 * The warning for a canonical layout prop that reaches the native emit and
 * does nothing. Returns `undefined` when the prop is absent, so the caller
 * can push unconditionally.
 */
export function unloweredLayoutPropWarning(
  tag: string,
  prop: UnloweredLayoutProp,
  present: boolean,
): string | undefined {
  if (!present) return undefined
  return (
    `<${tag} ${prop}> has NO native (iOS/Android) lowering — the prop is IGNORED on both, so the layout ` +
    `differs from the web build of the same source with no other symptom. ${ADVICE[prop]}.`
  )
}
