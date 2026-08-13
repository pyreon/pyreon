// Shared helper for the `<PermissionsProvider permissions={{ … }}>` emit on
// both targets — one place decides which keys are granted, so Swift and
// Kotlin cannot drift on the question the way `can()` itself did.
import type { AttrIR, ExprIR } from './types'

/**
 * The granted keys from a literal `permissions={{ 'a': true, 'b': false }}`
 * map, or `null` when the attribute is absent or not a literal object (the
 * caller falls back to a generic emit).
 *
 * Only `true` entries are granted. The native container is grant-only, so a
 * `false` VALUE has nowhere to live — exact when the map has no wildcards,
 * and reported by the caller when it does.
 */
export function permissionsProviderSeed(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
): { granted: string[]; deniedUnderWildcard: string[] } | null {
  const attr = e.attrs.find(
    (a): a is Extract<AttrIR, { kind: 'attr' }> =>
      a.kind === 'attr' && a.name === 'permissions',
  )
  if (!attr || attr.value.kind !== 'object') return null
  const granted: string[] = []
  const denied: string[] = []
  for (const field of attr.value.fields) {
    if (field.value.kind !== 'literal') return null
    if (field.value.value === true) granted.push(field.name)
    else if (field.value.value === false) denied.push(field.name)
    else return null
  }
  // A `false` only matters natively when a wildcard would otherwise grant it;
  // an ordinary unlisted key is denied either way.
  const hasWildcard = granted.some((g) => g === '*' || g.endsWith('.*') || g.endsWith('.**'))
  return { granted, deniedUnderWildcard: hasWildcard ? denied : [] }
}
