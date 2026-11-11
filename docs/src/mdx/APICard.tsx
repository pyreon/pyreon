import { h } from '@pyreon/core'

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
// Built with h(), not JSX: a conditional child inside a compiled template is
// re-created on hydration instead of adopted (#4385); the h() path adopts it.
export function APICard(props: APICardProps) {
  const label = props.type ? (LABELS[props.type] ?? { label: props.type, color: 'inherit' }) : undefined
  return h(
    'div',
    { class: 'api-card' },
    h(
      'div',
      { class: 'api-card-header' },
      h('span', { class: label ? 'api-badge' : 'api-badge api-badge--empty', style: `color: ${label?.color ?? 'inherit'}` }, label?.label ?? ''),
      h('code', { class: 'api-name' }, props.name),
    ),
    props.signature ? h('div', { class: 'api-signature' }, h('code', null, props.signature)) : null,
    props.description ? h('div', { class: 'api-desc' }, props.description) : null,
  )
}
