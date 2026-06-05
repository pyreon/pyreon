interface APICardProps {
  name: string
  type?: 'fn' | 'component' | 'hook' | 'type' | 'constant' | 'property' | 'context'
  signature?: string
  description?: string
}

const LABELS: Record<string, { label: string; color: string }> = {
  fn: { label: 'fn', color: 'var(--c-blue)' },
  component: { label: 'C', color: 'var(--c-green)' },
  hook: { label: 'H', color: 'var(--c-purple)' },
  type: { label: 'T', color: 'var(--c-yellow)' },
  constant: { label: 'K', color: 'var(--c-orange)' },
  property: { label: 'P', color: 'var(--c-indigo)' },
  context: { label: 'Cx', color: 'var(--c-red)' },
}

// Ported from docs/.vitepress/theme/components/APICard.vue.
// Same visual contract: badge + name + signature + description.
export function APICard(props: APICardProps) {
  return (
    <div class="api-card">
      <div class="api-card-header">
        {props.type ? (
          <span
            class="api-badge"
            style={`color: ${LABELS[props.type]?.color ?? 'inherit'}`}
          >
            {LABELS[props.type]?.label ?? props.type}
          </span>
        ) : null}
        <code class="api-name">{props.name}</code>
      </div>
      {props.signature ? (
        <div class="api-signature">
          <code>{props.signature}</code>
        </div>
      ) : null}
      {props.description ? (
        <div class="api-desc">{props.description}</div>
      ) : null}
    </div>
  )
}
