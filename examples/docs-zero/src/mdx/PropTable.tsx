interface Prop {
  name: string
  type: string
  default?: string
  required?: boolean
  description: string
}

interface PropTableProps {
  title?: string
  props: Prop[]
}

// Ported from docs/.vitepress/theme/components/PropTable.vue.
// Renders a 4-column table — name, type, default, description.
export function PropTable(props: PropTableProps) {
  const items = props.props ?? []
  if (items.length === 0) return null
  return (
    <div class="prop-table">
      {props.title ? <div class="prop-table-title">{props.title}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Prop</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr>
              <td>
                <code>{p.name}</code>
                {p.required ? <span class="required">*</span> : null}
              </td>
              <td>
                <code class="type">{p.type}</code>
              </td>
              <td>
                {p.default ? <code>{p.default}</code> : <span class="dash">—</span>}
              </td>
              <td>{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
