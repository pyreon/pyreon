interface SinceProps {
  version: string
}

// Ported from docs/.vitepress/theme/components/Since.vue. Inline
// "0.27+"-style version badge for documenting which release added a
// feature.
export function Since(props: SinceProps) {
  return <span class="since-badge">{`${props.version}+`}</span>
}
