import { When } from '../docs-ui/when'
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

// 4-column prop reference table — name, type, default, description.
export function PropTable(props: PropTableProps) {
  const items = props.props ?? []
  if (items.length === 0) return null
  return (
    <div class="prop-table">
      <When on={props.title}>
        <div class="prop-table-title">{props.title}</div>
      </When>
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
                <When on={p.required}>
                  <span class="required">*</span>
                </When>
              </td>
              <td>
                <code class="type">{p.type}</code>
              </td>
              <td>
                <When on={p.default}>
                  <code>{p.default}</code>
                </When>
                <When on={!p.default}>
                  <span class="dash">—</span>
                </When>
              </td>
              <td>{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
