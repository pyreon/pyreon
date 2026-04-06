import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { segmentedControlTheme, segmentedControlItemTheme } from './theme'

const SegmentedControl = createComponent('SegmentedControl', Element, segmentedControlTheme, { tag: 'div' })
export default SegmentedControl

export const SegmentedControlItem = createComponent('SegmentedControlItem', Element, segmentedControlItemTheme, { tag: 'button' })
