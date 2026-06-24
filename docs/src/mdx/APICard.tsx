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

// API reference card — badge + name + signature + description.
export function APICard(props: APICardProps) {
  // STRUCTURE NOTE — the badge is ALWAYS rendered (an `--empty` modifier
  // class hides it via CSS when there's no `type`), NOT `{type && <span>}`.
  // A conditional sibling BEFORE the static `<code class="api-name">` lowers
  // to a `_mountSlot` placeholder, and the compiler computes `.api-name`'s
  // ref (for the `{props.name}` text binding) by a sibling walk emitted AFTER
  // that slot. On a fresh client mount the empty badge slot removes its `<!>`
  // marker, the walk lands on the wrong node, and `__t.data = props.name`
  // runs against null → `TypeError: Cannot set properties of null (setting
  // 'data')`, which threw during setup once per card → /docs/router and every
  // generated API-reference page rendered ZERO cards. Keeping the badge a
  // static element means no slot precedes the ref'd `.api-name`. (Same compiler
  // slot-before-ref class as <CodeBlock>; see .claude/rules/anti-patterns.md.)
  return (
    <div class="api-card">
      <div class="api-card-header">
        <span
          class={props.type ? 'api-badge' : 'api-badge api-badge--empty'}
          style={`color: ${props.type ? (LABELS[props.type]?.color ?? 'inherit') : 'inherit'}`}
        >
          {props.type ? (LABELS[props.type]?.label ?? props.type) : ''}
        </span>
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
