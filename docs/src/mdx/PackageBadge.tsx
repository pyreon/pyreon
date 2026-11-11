interface PackageBadgeProps {
  name: string
  href?: string
  /**
   * The package's status as the page states it. Older pages say `stable` /
   * `beta`; Pyreon is pre-1.0, so those print as "pre-1.0" (00-brief/facts.md:
   * never "stable" or "production-ready"). `alpha` and `experimental` print as
   * "experimental".
   */
  status?: 'stable' | 'beta' | 'alpha' | 'experimental' | 'deprecated'
}

/** Label the badge prints for a status (the facts.md vocabulary). Exported for tests. */
export function packageStatusLabel(status: PackageBadgeProps['status']): 'pre-1.0' | 'experimental' | 'deprecated' {
  if (status === 'alpha' || status === 'experimental') return 'experimental'
  if (status === 'deprecated') return 'deprecated'
  return 'pre-1.0'
}

/** Inline pill: status dot + package name + status label. With `href`, the pill is a link. */
export function PackageBadge(props: PackageBadgeProps) {
  const label = packageStatusLabel(props.status)
  const cls = `package-badge package-badge--${label.replace(/[^a-z0-9]+/g, '-')}`
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
