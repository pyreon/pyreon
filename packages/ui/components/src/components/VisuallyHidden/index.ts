import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { visuallyHiddenTheme } from './theme'

const resolved = getComponentTheme(visuallyHiddenTheme)

const VisuallyHidden = rocketstyle({ useBooleans: true })({
  name: 'VisuallyHidden',
  component: Element,
})
  .attrs({ tag: 'span' } as any)
  .theme(resolved.base)

export default VisuallyHidden
