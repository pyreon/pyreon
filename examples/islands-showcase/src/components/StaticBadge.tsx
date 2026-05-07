export interface StaticBadgeProps {
  label?: string
}

/**
 * Renders server-side; never hydrated.
 * Wrapping in island() with `hydrate: 'never'` ships ZERO client JS for this
 * island — useful for SSR-only content where the SSR rendering is the entire
 * value (no interactivity, no signals).
 */
export default function StaticBadge(props: StaticBadgeProps) {
  return (
    <span
      data-testid="static-badge"
      style="display: inline-block; padding: 4px 8px; background: #eef; border-radius: 4px; font-family: monospace;"
    >
      {props.label ?? 'static'}
    </span>
  )
}
