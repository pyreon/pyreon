import { cx } from '@pyreon/core'
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
  // Components run ONCE: destructuring `position`/`style` captured them at setup,
  // so `<Panel position={corner()} />` stayed wherever it first rendered. The
  // style attribute is an accessor now, which the compiler binds reactively.
  const baseStyle = (): string => {
    const posStyle =
      positionStyles[props.position ?? 'top-left'] ?? positionStyles['top-left']
    return `position: absolute; ${posStyle} z-index: 5; ${props.style ?? ''}`
  }

  return (
    <div class={cx(['pyreon-flow-panel', props.class])} style={baseStyle}>
      {props.children}
    </div>
  )
}
