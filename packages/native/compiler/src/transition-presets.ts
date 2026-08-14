/**
 * The `<Transition name>` vocabulary that has a real native translation.
 *
 * ONE list, consumed by both emitters, because the two mappings must agree on
 * what "supported" means — a name that lowers on Swift but not Kotlin is a
 * per-platform animation divergence, which is exactly what `name` exists to
 * prevent.
 *
 * Both spellings are accepted: `@pyreon/kinetic` names its presets in
 * camelCase (`slideUp`) while the CSS-class convention on the web is
 * kebab-case (`slide-up`), and an author reaches for whichever vocabulary
 * they already hold. `normalizePresetName` is the single normalization both
 * emitters and this check share, so a spelling can never be "known" to one
 * and unknown to the other.
 */
export const KNOWN_TRANSITION_PRESETS: ReadonlySet<string> = new Set([
  'fade',
  'scale',
  'scalein',
  'slideup',
  'slidedown',
  'slideleft',
  'slideright',
])

/** Lower-case and strip separators, so `slide-up` / `slideUp` / `slide_up` all agree. */
export function normalizePresetName(name: string | undefined): string {
  return name?.toLowerCase().replace(/[-_]/g, '') ?? ''
}

/**
 * The warning for a `name` with no native translation.
 *
 * Falling back to a fade is the right BEHAVIOUR — a custom CSS animation has
 * no native equivalent, and refusing to compile over a decorative transition
 * would be worse. But the fallback was SILENT, which is the problem: on the
 * web the author's `${name}-enter-*` CSS runs, on device it fades, and
 * nothing says the two diverged. A fade that ran is not obviously wrong, so
 * there is no symptom to investigate — the same property that let the
 * original "every transition is a fade" bug survive.
 *
 * Returns `undefined` when the name IS translatable (or absent), so the
 * caller can push unconditionally.
 */
export function unknownTransitionPresetWarning(name: string | undefined): string | undefined {
  if (name === undefined || name === '') return undefined
  const key = normalizePresetName(name)
  if (KNOWN_TRANSITION_PRESETS.has(key)) return undefined
  return (
    `<Transition name="${name}"> has no native (iOS/Android) equivalent, so the emit falls back to a FADE on both — ` +
    `while the web runs your \`${name}-enter-*\` / \`${name}-leave-*\` CSS. The animation still plays, so nothing looks ` +
    `broken; the two platforms simply animate differently. Natively-translatable names: fade, scale-in, slide-up, ` +
    `slide-down, slide-left, slide-right (camelCase spellings accepted). Keep the name if a fade is an acceptable ` +
    `native answer — this warns rather than refuses precisely because it usually is.`
  )
}
