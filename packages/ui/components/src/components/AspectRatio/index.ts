import { el } from '../../factory'

const AspectRatio = el
  .config({ name: 'AspectRatio' })
  .attrs({ tag: 'div' })
  .theme(() => ({
    position: 'relative',
    overflow: 'hidden',
  }))

export default AspectRatio
