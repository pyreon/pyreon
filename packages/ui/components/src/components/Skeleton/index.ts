import { el } from '../../factory'

const Skeleton = el
  .config({ name: 'Skeleton' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    backgroundColor: t.color.system.base[200],
    overflow: 'hidden',
  }))
  .variants((t) => ({
    text: {
      borderRadius: t.borderRadius.small,
      height: '1em',
      width: '100%',
    },
    circle: { borderRadius: t.borderRadius.pill },
    rect: { borderRadius: t.borderRadius.base },
  }))

export default Skeleton
