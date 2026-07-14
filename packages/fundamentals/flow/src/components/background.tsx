import type { VNodeChild } from '@pyreon/core'
import type { BackgroundProps } from '../types'

/**
 * Background pattern for the flow canvas.
 * Renders dots, lines, or cross patterns that move with the viewport.
 *
 * @example
 * ```tsx
 * <Flow instance={flow}>
 *   <Background variant="dots" gap={20} />
 * </Flow>
 * ```
 */
export function Background(props: BackgroundProps): VNodeChild {
  const { variant = 'dots', gap = 20, size = 1 } = props

  // Pattern color lives in `style` (CSS), NOT the `fill`/`stroke` presentation
  // attribute — same reason as the edge stroke (see flow-component.tsx): a
  // `var()` is INVALID in a presentation attr (dropped → the SVG default black),
  // and a presentation attr is also overridable by a stray global `svg { fill }`
  // rule. In `style` the `var()` resolves AND inline style wins. Default is the
  // themeable `--pyreon-flow-bg-pattern` (with the historical `#ddd` as
  // fallback) so a dark-themed consumer can dim it — the light-mode #ddd dots
  // are harsh on a dark canvas. An explicit `color` prop still wins.
  const patternColor = props.color ?? 'var(--pyreon-flow-bg-pattern, #ddd)'

  const patternId = `flow-bg-${variant}`

  if (variant === 'dots') {
    return (
      <svg
        role="img"
        aria-label="background pattern"
        class="pyreon-flow-background"
        style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
      >
        <defs>
          <pattern
            id={patternId}
            x="0"
            y="0"
            width={String(gap)}
            height={String(gap)}
            {...{ patternUnits: 'userSpaceOnUse' }}
          >
            <circle cx={String(size)} cy={String(size)} r={String(size)} style={`fill: ${patternColor}`} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    )
  }

  if (variant === 'lines') {
    return (
      <svg
        role="img"
        aria-label="background pattern"
        class="pyreon-flow-background"
        style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
      >
        <defs>
          <pattern
            id={patternId}
            x="0"
            y="0"
            width={String(gap)}
            height={String(gap)}
            {...{ patternUnits: 'userSpaceOnUse' }}
          >
            <line
              x1="0"
              y1={String(gap)}
              x2={String(gap)}
              y2={String(gap)}
              style={`stroke: ${patternColor}`}
              stroke-width={String(size)}
            />
            <line
              x1={String(gap)}
              y1="0"
              x2={String(gap)}
              y2={String(gap)}
              style={`stroke: ${patternColor}`}
              stroke-width={String(size)}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    )
  }

  // cross
  return (
    <svg
      role="img"
      aria-label="background pattern"
      class="pyreon-flow-background"
      style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width={String(gap)}
          height={String(gap)}
          {...{ patternUnits: 'userSpaceOnUse' }}
        >
          <line
            x1={String(gap / 2 - size * 2)}
            y1={String(gap / 2)}
            x2={String(gap / 2 + size * 2)}
            y2={String(gap / 2)}
            style={`stroke: ${patternColor}`}
            stroke-width={String(size)}
          />
          <line
            x1={String(gap / 2)}
            y1={String(gap / 2 - size * 2)}
            x2={String(gap / 2)}
            y2={String(gap / 2 + size * 2)}
            style={`stroke: ${patternColor}`}
            stroke-width={String(size)}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
