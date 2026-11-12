import { h } from '@pyreon/core'

interface APICardProps {
  name: string
  type?: 'fn' | 'component' | 'hook' | 'type' | 'constant' | 'property' | 'context'
  signature?: string
  description?: string
}

/** Badge letter per kind; its colour comes from `api-badge--<kind>` in docs-v3.css (theme tokens, both themes AA). */
const LABELS: Record<string, string> = {
  fn: 'fn',
  component: 'C',
  hook: 'H',
  type: 'T',
  constant: 'K',
  property: 'P',
  context: 'Cx',
}

// Built with h(), not JSX: a conditional child inside a compiled template is
// re-created on hydration instead of adopted (#4385); the h() path adopts it.
export function APICard(props: APICardProps) {
  const label = props.type ? (LABELS[props.type] ?? props.type) : undefined
  return h(
    'div',
    { class: 'api-card' },
    h(
      'div',
      { class: 'api-card-header' },
      h('span', { class: label ? `api-badge api-badge--${props.type}` : 'api-badge api-badge--empty' }, label ?? ''),
      h('code', { class: 'api-name' }, props.name),
    ),
    props.signature ? h('div', { class: 'api-signature' }, h('code', null, props.signature)) : null,
    props.description ? h('div', { class: 'api-desc' }, props.description) : null,
  )
}
