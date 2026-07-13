import type { VNodeChild } from '@pyreon/core'
import type { PanelProps } from '../types'

const positionStyles: Record<string, string> = {
  'top-left': 'top: 10px; left: 10px;',
  'top-right': 'top: 10px; right: 10px;',
  'bottom-left': 'bottom: 10px; left: 10px;',
  'bottom-right': 'bottom: 10px; right: 10px;',
}

/**
 * Positioned overlay panel for custom content inside the flow canvas.
 *
 * @example
 * ```tsx
 * <Flow instance={flow}>
 *   <Panel position="top-right">
 *     <SearchBar />
 *   </Panel>
 * </Flow>
 * ```
 */
export function Panel(props: PanelProps): VNodeChild {
  const { position = 'top-left', style = '', children } = props
  const posStyle = positionStyles[position] ?? positionStyles['top-left']
  const baseStyle = `position: absolute; ${posStyle} z-index: 5; ${style}`

  return (
    <div class={`pyreon-flow-panel ${props.class ?? ''}`} style={baseStyle}>
      {children}
    </div>
  )
}
