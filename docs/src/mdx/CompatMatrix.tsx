interface Layer {
  name: string
  support: ('full' | 'partial' | 'none')[]
}

interface CompatMatrixProps {
  features: string[]
  layers: Layer[]
}

const ICONS: Record<string, string> = {
  full: '✓',
  partial: '~',
  none: '—',
}

// Feature-x-layer compatibility table with checkmarks / tilde /
// em-dash per cell.
export function CompatMatrix(props: CompatMatrixProps) {
  return (
    <div class="compat-matrix">
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            {props.layers.map((l) => (
              <th>{l.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.features.map((feature, i) => (
            <tr>
              <td>{feature}</td>
              {props.layers.map((layer) => {
                const state = layer.support[i] ?? 'none'
                return (
                  <td class="support-cell">
                    <span class={`support-${state}`}>{ICONS[state]}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
