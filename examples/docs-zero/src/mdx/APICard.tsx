interface APICardProps {
  name: string
  type: string
  signature: string
  description: string
}

// Renders an API reference card with the signature highlighted. The
// VitePress version had collapsible body + a copy-button; that's a
// follow-up. This stub is enough to make the markdown compile and
// render cleanly.
export function APICard(props: APICardProps) {
  return (
    <div class="docs-api-card">
      <header class="docs-api-card__head">
        <code class="docs-api-card__name">{props.name}</code>
        <span class="docs-api-card__type">{props.type}</span>
      </header>
      <pre class="docs-api-card__sig">
        <code>{props.signature}</code>
      </pre>
      <p class="docs-api-card__desc">{props.description}</p>
    </div>
  )
}
