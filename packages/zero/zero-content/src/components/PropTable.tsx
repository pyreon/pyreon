import type { VNodeChild } from '@pyreon/core'

// ─── <PropTable> — props reference table (PR-K audit H2) ──────────────────
//
// Renders a Markdown-style props table from a typed schema. Used in
// API documentation pages to lock the component-props surface inline.
//
// Static — no runtime introspection. Authors supply the rows
// directly so the table renders identically regardless of the
// runtime environment.
//
// Example:
//
//     <PropTable
//       rows={[
//         { name: 'children', type: 'VNodeChild', required: true,
//           description: 'The content rendered inside the button.' },
//         { name: 'onClick', type: '(e: MouseEvent) => void',
//           description: 'Click handler.' },
//         { name: 'disabled', type: 'boolean', default: 'false',
//           description: 'When true, the button is non-interactive.' },
//       ]}
//     />

export interface PropRow {
  /** Prop name. */
  name: string
  /** TypeScript type as a string. */
  type: string
  /** Default value. Omit when there's no default. */
  default?: string
  /** Whether the prop is required. Default `false`. */
  required?: boolean
  /** One-line description. */
  description?: string
}

export interface PropTableProps {
  /** Rows in display order. */
  rows: PropRow[]
  /** Optional class name applied to the outer wrapper. */
  class?: string
  /** Optional column header overrides. */
  labels?: {
    name?: string
    type?: string
    default?: string
    description?: string
  }
}

export function PropTable(props: PropTableProps): VNodeChild {
  const labels = props.labels ?? {}
  const nameLabel = labels.name ?? 'Prop'
  const typeLabel = labels.type ?? 'Type'
  const defaultLabel = labels.default ?? 'Default'
  const descriptionLabel = labels.description ?? 'Description'

  return (
    <div
      class={`pyreon-proptable${props.class ? ' ' + props.class : ''}`}
    >
      <table class="pyreon-proptable__table">
        <thead>
          <tr>
            <th scope="col">{nameLabel}</th>
            <th scope="col">{typeLabel}</th>
            <th scope="col">{defaultLabel}</th>
            <th scope="col">{descriptionLabel}</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr>
              <td>
                <code class="pyreon-proptable__name">{row.name}</code>
                {row.required && (
                  <span
                    class="pyreon-proptable__required"
                    aria-label="required"
                  >
                    *
                  </span>
                )}
              </td>
              <td>
                <code class="pyreon-proptable__type">{row.type}</code>
              </td>
              <td>
                {row.default !== undefined
                  ? <code class="pyreon-proptable__default">{row.default}</code>
                  : <span aria-hidden="true">—</span>}
              </td>
              <td>{row.description ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
