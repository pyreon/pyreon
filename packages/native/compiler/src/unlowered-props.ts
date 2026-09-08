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

/**
 * A prop whose value is BAKED into a native initializer argument (or a
 * compile-time modifier) at emit time, given a non-static value.
 *
 * Distinct from `structuralPropDynamicWarning` above: those props pick between
 * two different native CONSTRUCTS, so no single expression can carry both
 * branches. These ones would be perfectly expressible as a runtime value — the
 * emitter simply reads them through the static-literal reader and has nowhere
 * to put a dynamic one. Either way the author wrote a value and got the
 * default, which is why both warn.
 *
 * The shipped instance: `<Video controls={show()}>`, `<Audio muted={sig()}>`,
 * `<Text truncate={sig()}>` and their siblings all emitted BYTE-IDENTICALLY to
 * omitting the prop. `controls={false}` (static) was correct, so the shape that
 * failed was exactly the one a signal-driven UI is written in — and it failed
 * with zero warnings on both targets.
 */
export function bakedPropDynamicWarning(
  tag: string,
  prop: string,
  isStatic: boolean,
  present: boolean,
): string | undefined {
  if (!present || isStatic) return undefined
  return (
    `<${tag} ${prop}> was given a non-static value, which does NOT lower on iOS or Android — the ` +
    `prop is dropped and the default applies. It is baked into the native emit at compile time, so ` +
    `it cannot follow a signal. Use a static value, or branch the element itself ` +
    `(\`{on() ? <${tag} … ${prop} /> : <${tag} … />}\`), which lowers on both targets.`
  )
}

/**
 * `a || b` / `a && b` where an operand is provably NOT a Bool.
 *
 * JS `||` and `&&` are VALUE-producing over truthiness — `name() || 'anon'`
 * evaluates to a string. Swift and Kotlin `||`/`&&` are Bool-only operators, so
 * the verbatim emit is `cannot convert value of type 'String' to expected
 * argument type 'Bool'` (swiftc) / `condition type mismatch` (kotlinc). It was
 * emitted verbatim with no warning, which makes the commonest JS defaulting
 * idiom a silent mis-emit.
 *
 * NOT auto-desugared, deliberately. `a || b` → `a == <falsy> ? b : a` needs (i)
 * a per-type notion of falsy (`''`, `0`, `NaN`, `null`), and (ii) a guarantee
 * that `a` is safely re-evaluable — it is often a call. The repo already made
 * this call for the `||=` sibling, whose corpus entry records that "a naive
 * parse-time desugar … is UNSOUND". A warning that names the operand type and
 * the two working spellings is the honest lowering until a type-aware one
 * exists.
 *
 * Gated on a PROVABLY non-Bool operand: an operand the inferer cannot resolve
 * stays silent, because a genuinely-boolean expression whose type is merely
 * invisible here is the common correct case.
 */
export function nonBooleanLogicalWarning(
  op: '&&' | '||',
  side: 'left' | 'right',
  typeName: string,
): string {
  return (
    `\`${op}\` with a non-boolean ${side} operand (\`${typeName}\`) does NOT lower to iOS or Android — ` +
    `Swift and Kotlin \`${op}\` are Bool-only operators, while JS \`${op}\` produces a VALUE from ` +
    `truthiness. The emit is passed through verbatim and will not compile. Use \`??\` for a ` +
    `null/undefined default, or make the test explicit (\`name() !== '' ? name() : 'anon'\`).`
  )
}

/**
 * JS `Array.prototype` / `String.prototype` methods PMTC has NO lowering for.
 *
 * An unmapped member call used to fall out of the emitters' arm-less
 * `switch (prop)` straight into the GENERIC member emit, which re-emits the
 * callee verbatim: `xs.toSorted()` became Swift `xs.toSorted()` (`value of type
 * '[Int]' has no member 'toSorted'`) and Kotlin `xs.toSorted()` (`unresolved
 * reference`). No warning on either target, in EITHER expression or statement
 * position — the original report said statement position warned; it does not,
 * because both positions share one expression emitter.
 *
 * This is the "deliberately not mapped is only a decision if something CATCHES
 * the shape" class, at switch scale: a method nobody wrote a `case` for is
 * indistinguishable from one someone declined on purpose, and both ship broken.
 *
 * Why a NAMED SET rather than a blanket warning at the fallthrough: several
 * methods reach the fallthrough and are CORRECT there, because the native
 * stdlib happens to spell them the same way — measured on both real toolchains,
 * `map` / `filter` / `forEach` / `reduce` / `flatMap` / `indexOf` /
 * `lastIndexOf` / `substring` / `trim` / `split` / `startsWith` / `padEnd` /
 * `padStart` / `repeat` all compile as emitted. A blanket warning would fire on
 * every one of them. `unmapped-methods.test.ts` keeps the set honest in the
 * other direction: it fails if any name here gains a `case` in either emitter.
 *
 * `codePointAt` is the sharp one and is in the set even though Kotlin compiles
 * it (`java.lang.String.codePointAt` exists): JS returns `number | undefined`
 * and is out-of-bounds-safe, Java returns `int` and THROWS. A silent semantic
 * divergence is worse than a silent compile failure, not better.
 */
export const UNMAPPED_ARRAY_METHODS: readonly string[] = [
  'copyWithin',
  'entries',
  'findLastIndex',
  'keys',
  'pop',
  'reduceRight',
  'shift',
  'splice',
  'toReversed',
  'toSorted',
  'toSpliced',
  'unshift',
  'values',
  'with',
]

export const UNMAPPED_STRING_METHODS: readonly string[] = [
  'codePointAt',
  'localeCompare',
  'normalize',
  'substr',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
]

/** Per-method remedy, so the warning says what to write instead. */
const UNMAPPED_METHOD_REMEDY: Readonly<Record<string, string>> = {
  copyWithin: 'build the result with `.map()` or a `<For>`-friendly derivation',
  entries: 'use `.map((v, i) => …)`, whose index form DOES lower',
  findLastIndex: 'reverse the search, or use `.findIndex()` on a reversed copy',
  keys: 'use `.map((v, i) => i)`',
  pop: 'read `xs[xs.length - 1]` and set the shortened array explicitly',
  reduceRight: 'use `.reduce()` over a reversed copy — note the callback arg ORDER differs on Kotlin',
  shift: 'read `xs[0]` and set the shortened array explicitly',
  splice: 'use `.filter()` / `.slice()` to build the new array',
  toReversed: 'use `.reverse()`, which lowers on both targets',
  toSorted: 'use `.sort((a, b) => …)` with an explicit comparator — JS `sort()` with no comparator compares as STRINGS, which no native sort does',
  toSpliced: 'use `.filter()` / `.slice()` to build the new array',
  unshift: 'build the new array explicitly (`[x, ...xs]`)',
  values: 'iterate the array directly',
  with: 'use `.map((v, i) => (i === n ? next : v))`',
  codePointAt: 'use `.charCodeAt()` — and note JS is out-of-bounds-SAFE where the native forms throw',
  localeCompare: 'compare with `<` / `>` — neither native form is locale-aware anyway',
  normalize: 'normalize before the value reaches shared source',
  substr: 'use `.slice(start, end)` (`substr` is deprecated in JS too)',
  toLocaleLowerCase: 'use `.toLowerCase()` — the locale-aware form has no cross-target equivalent',
  toLocaleUpperCase: 'use `.toUpperCase()` — the locale-aware form has no cross-target equivalent',
}

/** `undefined` when the call is not an unmapped array/string method. */
export function unmappedMethodWarning(
  method: string,
  receiver: 'array' | 'string',
): string | undefined {
  const set = receiver === 'array' ? UNMAPPED_ARRAY_METHODS : UNMAPPED_STRING_METHODS
  if (!set.includes(method)) return undefined
  const remedy = UNMAPPED_METHOD_REMEDY[method] ?? 'spell the operation with a lowered method'
  return (
    `\`.${method}()\` on ${receiver === 'array' ? 'an array' : 'a string'} has no lowering in PMTC — it is emitted VERBATIM and does ` +
    `not compile on iOS or Android. Instead, ${remedy}.`
  )
}

/**
 * `.sort()` with no comparator, or with one PMTC cannot lower.
 *
 * `sort` HAS a case in both emitters, gated on a 2-param arrow comparator —
 * every other shape `break`s out of the switch and lands on the verbatim
 * re-emit, so the commonest spelling of all (`xs.sort()`) was a silent
 * mis-emit that the unmapped-METHOD set cannot catch: `sort` is mapped.
 *
 * The no-comparator form also has a semantic trap worth naming in the message:
 * JS `sort()` with no comparator converts elements to STRINGS and compares
 * those, so `[10, 9, 1].sort()` is `[1, 10, 9]`. No native sort does that, so
 * even a "faithful" mapping to `sorted()` would answer differently from the
 * web — which is why this warns rather than lowering.
 */
export function unloweredSortWarning(reason: 'no-comparator' | 'shape'): string {
  const head =
    reason === 'no-comparator'
      ? '`.sort()` with no comparator does not lower to iOS or Android'
      : '`.sort(…)` with this comparator shape does not lower to iOS or Android'
  return (
    `${head} — the emit falls through verbatim and will not compile. Pass a 2-parameter ` +
    `expression comparator (\`.sort((a, b) => a - b)\`). Note JS \`sort()\` with no comparator ` +
    `compares elements as STRINGS (\`[10, 9, 1]\` sorts to \`[1, 10, 9]\`), which no native sort ` +
    `does — so the comparator is required for the two platforms to agree with the web anyway.`
  )
}
