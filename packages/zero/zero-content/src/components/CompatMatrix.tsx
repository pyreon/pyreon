import { cx } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'

// ─── <CompatMatrix> — feature/platform compatibility table (PR-K) ─────────
//
// Renders a table mapping features (rows) to platforms (columns) with
// a status cell at each intersection: ✓ supported, ✗ unsupported,
// 🚧 partial, ⏳ planned. Strings are normalised so authors can pass
// `true` / `false` / `'partial'` / `'planned'` / any custom string.
//
// Used in adapter / runtime pages to surface what works where.
//
// Example:
//
//     <CompatMatrix
//       features={['SSR', 'SSG', 'ISR']}
//       platforms={['Node', 'Bun', 'Cloudflare', 'Vercel']}
//       cells={{
//         SSR: { Node: true, Bun: true, Cloudflare: 'partial', Vercel: true },
//         SSG: { Node: true, Bun: true, Cloudflare: true, Vercel: true },
//         ISR: { Node: true, Bun: true, Cloudflare: 'planned', Vercel: true },
//       }}
//     />

export type CompatCellValue =
  | boolean
  | 'partial'
  | 'planned'
  | string
  | null
  | undefined

export interface CompatMatrixProps {
  /** Feature labels (rows). */
  features: string[]
  /** Platform labels (columns). */
  platforms: string[]
  /** Status matrix keyed by `[feature][platform]`. Missing keys
   *  render as empty cells. */
  cells: Record<string, Record<string, CompatCellValue>>
  /** Optional caption rendered above the table. */
  caption?: string
  /** Optional class name applied to the outer wrapper. */
  class?: string
}

/** Render a single cell's display value + class hint. Pure — exported
 *  for testing. */
export function renderCompatCell(value: CompatCellValue): {
  display: string
  status: string
} {
  if (value === true) return { display: '✓', status: 'yes' }
  if (value === false) return { display: '✗', status: 'no' }
  if (value === 'partial') return { display: '🚧', status: 'partial' }
  if (value === 'planned') return { display: '⏳', status: 'planned' }
  if (value === null || value === undefined) return { display: '', status: 'unknown' }
  return { display: value, status: 'custom' }
}

export function CompatMatrix(props: CompatMatrixProps): VNodeChild {
  return (
    <div
      class={cx(['pyreon-compatmatrix', props.class])}
    >
      <table class="pyreon-compatmatrix__table">
        {props.caption && (
          <caption class="pyreon-compatmatrix__caption">{props.caption}</caption>
        )}
        <thead>
          <tr>
            <th scope="col"></th>
            {props.platforms.map((p) => <th scope="col">{p}</th>)}
          </tr>
        </thead>
        <tbody>
          {props.features.map((feature) => (
            <tr>
              <th scope="row">{feature}</th>
              {props.platforms.map((platform) => {
                const cell = renderCompatCell(
                  props.cells[feature]?.[platform],
                )
                return (
                  <td
                    class={`pyreon-compatmatrix__cell pyreon-compatmatrix__cell--${cell.status}`}
                    data-status={cell.status}
                    aria-label={cell.status}
                  >
                    {cell.display}
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
