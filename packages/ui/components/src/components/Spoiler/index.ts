import { el } from '../../factory'

const Spoiler = el
  .config({ name: 'Spoiler' })
  .attrs({ tag: 'div' })
  .theme(() => ({
    overflow: 'hidden',
    position: 'relative',
  }))

export default Spoiler
