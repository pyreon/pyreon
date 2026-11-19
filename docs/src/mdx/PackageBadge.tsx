import { PACKAGE_STABILITY } from './package-stability.generated'

interface PackageBadgeProps {
  name: string
  href?: string
}

export type PackageBadgeLabel = 'stable' | 'experimental' | 'unpublished'

/**
 * Label the badge prints for a package. The tier comes from the package's own
 * `package.json` (`"pyreon": { "stability" }`), through the generated
 * `package-stability.generated.ts`; pages never hand-write it, and
 * `scripts/check-stability-tier.ts` fails a `status=` prop. A name with no
 * published package (devtools) prints "unpublished". Exported for tests.
 */
export function packageStatusLabel(name: string): PackageBadgeLabel {
  return PACKAGE_STABILITY[name] ?? 'unpublished'
}

/** Inline pill: status dot + package name + tier label. With `href`, the pill is a link. */
export function PackageBadge(props: PackageBadgeProps) {
  const label = packageStatusLabel(props.name)
  const cls = `package-badge package-badge--${label}`
  const inner = (
    <>
      <span class="package-badge-dot" aria-hidden="true" />
      <span class="package-badge-name">{props.name}</span>
      <span class="package-badge-status">{label}</span>
    </>
  )
  return props.href ? (
    <a class={cls} href={props.href}>
      {inner}
    </a>
  ) : (
    <span class={cls}>{inner}</span>
  )
}
