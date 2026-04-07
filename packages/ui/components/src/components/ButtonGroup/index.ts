import { el } from '../../factory'

const ButtonGroup = el
  .config({ name: 'ButtonGroup' })
  .attrs({ tag: 'div' })
  .theme(() => ({
    display: 'inline-flex',
    alignItems: 'center',
  }))
  .variants((t: any) => ({
    attached: { gap: 0 },
    separated: { gap: t.spacing.xxSmall },
  }))

export default ButtonGroup
