import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const AspectRatio = rocketstyle({ useBooleans: true })({ name: 'AspectRatio', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    paddingBottom: '56.25%',
    '& > *': {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
    },
  })

export default AspectRatio
