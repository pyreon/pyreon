import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Image = rocketstyle({ useBooleans: true })({ name: 'Image', component: Element })
  .attrs({ tag: 'img' } as any)
  .theme({
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: 0,
  })
  .variants({
    rounded: { borderRadius: 8 },
    circle: { borderRadius: 9999 },
  })

export default Image
