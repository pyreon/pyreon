interface PackageBadgeProps {
  name: string
  href?: string
  status?: 'stable' | 'beta' | 'alpha' | 'deprecated'
}

const STATUS_COLORS: Record<string, string> = {
  stable: 'var(--c-green)',
  beta: 'var(--c-yellow)',
  alpha: 'var(--c-orange)',
  deprecated: 'var(--c-red)',
}

// Inline pill: status dot + package name + status label.
// When `href` is set, the wrapper becomes an anchor.
export function PackageBadge(props: PackageBadgeProps) {
  const status = props.status ?? 'stable'
  const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.stable!
  if (props.href) {
    return (
      <a class="package-badge" href={props.href}>
        <span class="package-badge-dot" style={`background-color: ${dotColor}`} />
        <span class="package-badge-name">{props.name}</span>
        <span class="package-badge-status">{status}</span>
      </a>
    )
  }
  return (
    <span class="package-badge">
      <span class="package-badge-dot" style={`background-color: ${dotColor}`} />
      <span class="package-badge-name">{props.name}</span>
      <span class="package-badge-status">{status}</span>
    </span>
  )
}
