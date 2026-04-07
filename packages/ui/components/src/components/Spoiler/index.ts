import { el } from '../../factory'

const Spoiler = el
  .config({ name: 'Spoiler' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    overflow: 'hidden',
    position: 'relative',
    transition: t.transition.base,
  }))

export default Spoiler
