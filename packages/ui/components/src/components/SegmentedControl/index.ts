import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { segmentedControlTheme, segmentedControlItemTheme } from './theme'

const resolved = getComponentTheme(segmentedControlTheme)

const SegmentedControl = rocketstyle({ useBooleans: true })({ name: 'SegmentedControl', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)

export default SegmentedControl

const itemResolved = getComponentTheme(segmentedControlItemTheme)

export const SegmentedControlItem = rocketstyle({ useBooleans: true })({ name: 'SegmentedControlItem', component: Element })
  .attrs({ tag: 'button' } as any)
  .theme(itemResolved.base)
  .sizes(itemResolved.sizes)
