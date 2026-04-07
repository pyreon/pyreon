import { el } from '../../factory'

const Image = el
  .config({ name: 'Image' })
  .attrs({ tag: 'img' })
  .theme((t: any) => ({
    borderRadius: t.borderRadius.base,
    maxWidth: '100%',
    display: 'block',
  }))
  .variants((t: any) => ({
    rounded: { borderRadius: t.borderRadius.base },
    circle: { borderRadius: t.borderRadius.pill },
  }))

export default Image
