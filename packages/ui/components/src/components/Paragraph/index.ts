import { txt } from '../../factory'

const Paragraph = txt
  .config({ name: 'Paragraph' })
  .attrs({ tag: 'p' })
  .theme((t) => ({
    fontSize: t.fontSize.base,
    color: t.color.system.base[600],
    lineHeight: t.lineHeight.base,
    margin: 0,
  }))
  .sizes((t) => ({
    small: { fontSize: t.fontSize.small },
    medium: { fontSize: t.fontSize.base },
    large: { fontSize: t.fontSize.medium },
  }))

export default Paragraph
