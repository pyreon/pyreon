import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const VisuallyHidden = rocketstyle({ useBooleans: true })({
  name: 'VisuallyHidden',
  component: Element,
})
  .attrs({ tag: 'span' } as any)
  .theme({
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  })

export default VisuallyHidden
