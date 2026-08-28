/**
 * Canonical primitive props that have NO native lowering yet.
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
export type UnloweredProp = 'justify' | 'wrap' | 'external'

const ADVICE: Record<UnloweredProp, string> = {
  justify:
    'Compose has `Arrangement.SpaceBetween` and friends, but SwiftUI stacks have no equivalent — ' +
    '`between`/`around`/`evenly` need `Spacer()` interleaved between children, and `start`/`center`/`end` ' +
    'need the stack made greedy, which changes its sizing beyond what the prop asks for. Until both ' +
    'targets can agree, use `<Spacer />` between children (it lowers on both), or an explicit ' +
    '`<NativeIOS>` / `<NativeAndroid>` branch',
  external:
    'the link still routes INTERNALLY, so a tap tries to match the URL as an in-app route instead of ' +
    'handing it to the browser. Both PyreonLink runtimes call `router.push(to)` unconditionally. Until the ' +
    'runtimes take an external flag, open the URL yourself with `useLinking().openUrl(url)`, which lowers on ' +
    'both targets',
  wrap: 'Compose has `FlowRow`; SwiftUI has no wrapping stack and needs a custom `Layout`. Until both ' +
    'targets can agree, wrap the row yourself (a `<For>` over pre-chunked rows lowers on both), or use ' +
    'an explicit `<NativeIOS>` / `<NativeAndroid>` branch',
}

/**
 * The warning for a canonical layout prop that reaches the native emit and
 * does nothing. Returns `undefined` when the prop is absent, so the caller
 * can push unconditionally.
 */
export function unloweredPropWarning(
  tag: string,
  prop: UnloweredProp,
  present: boolean,
): string | undefined {
  if (!present) return undefined
  return (
    `<${tag} ${prop}> has NO native (iOS/Android) lowering — the prop is IGNORED on both, so the layout ` +
    `differs from the web build of the same source with no other symptom. ${ADVICE[prop]}.`
  )
}

/**
 * `align="stretch"` is APPROXIMATED as `start` on both native targets.
 *
 * Distinct from the props above, which emit nothing at all: this one emits, and
 * emits the WRONG thing. The align maps send `stretch` to `.leading` / `.top`
 * and `Alignment.Start` / `Alignment.Top` — a documented approximation ("Compose
 * has no direct stretch for column children") that lived only in a comment on
 * the map. On the web arm `align-items: stretch` genuinely stretches children
 * to fill the cross axis, so the same source produces children that fill in a
 * browser and hug their content on device.
 *
 * Silently wrong is worse than inert, so it warns too. Found by sweeping every
 * member of every union-typed prop and comparing its emit against a BOGUS
 * value: `stretch` was indistinguishable from an unrecognised token, which is
 * what an approximation looks like from the outside.
 */
export function stretchAlignWarning(tag: string, alignValue: unknown): string | undefined {
  if (alignValue !== 'stretch') return undefined
  return (
    `<${tag} align="stretch"> is APPROXIMATED as "start" on iOS and Android — neither SwiftUI's ` +
    `stack alignment nor Compose's has a cross-axis stretch for children, so they hug their content ` +
    `instead of filling, while the web build of the same source stretches them. To fill on all three, ` +
    `size the child explicitly (a \`width\`/\`height\` prop, or \`<Stack block>\`-style layout on the ` +
    `web side), or branch with \`<NativeIOS>\` / \`<NativeAndroid>\`.`
  )
}

/**
 * `fit` and `kind` given a NON-static value.
 *
 * Both drive a STRUCTURAL choice, not just a value: `fit="none"` selects the
 * plain `AsyncImage` init rather than the content-closure form, and
 * `kind="password"` selects `SecureField` over `TextField`. A two-literal
 * ternary — which the styling machinery supports for every value-only prop —
 * therefore cannot be lowered as one expression when either branch is the
 * structural one.
 *
 * They were silently DROPPED, which is the wrong answer regardless: the author
 * wrote a dynamic value and got the default with no signal. Warned instead,
 * symmetrically on both targets, until the value-only subset is lowered
 * (tracked follow-up — it needs the structural branches split out first, and
 * doing the easy half on one target only would put the two platforms out of
 * agreement, which is the failure `<Transition name>` already taught).
 */
export function structuralPropDynamicWarning(
  tag: string,
  prop: 'fit' | 'kind',
  isStatic: boolean,
  present: boolean,
): string | undefined {
  if (!present || isStatic) return undefined
  const structural =
    prop === 'fit'
      ? '`fit="none"` selects a different AsyncImage initializer'
      : '`kind="password"` selects SecureField instead of TextField'
  return (
    `<${tag} ${prop}> was given a non-static value, which does NOT lower on iOS or Android — the ` +
    `prop is dropped and the default applies. Unlike the value-only styling props, ${prop} drives a ` +
    `structural choice (${structural}), so a ternary cannot be lowered as a single expression. Use a ` +
    `static value, or branch the element itself (\`{dense() ? <Image … fit="contain" /> : <Image … />}\`), ` +
    `which lowers on both targets.`
  )
}
