import { el } from '../../factory'

const ButtonGroup = el
  .config({ name: 'ButtonGroup' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center' })
  .theme(() => ({
    display: 'inline-flex',
    alignItems: 'center',
  }))
  .variants((t) => ({
    attached: { gap: 0 },
    separated: { gap: t.spacing.xxSmall },
  }))

export default ButtonGroup
