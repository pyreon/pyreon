import { tones, txt } from '../../factory'

const Paragraph = txt
  .config({ name: 'Paragraph' })
  .attrs({ tag: 'p' })
  .theme((t, m) => ({
    fontSize: t.fontSize.base,
    color: tones(t, m).textMuted,
    lineHeight: t.lineHeight.base,
    margin: 0,
  }))
  .sizes((t) => ({
    small: { fontSize: t.fontSize.small },
    medium: { fontSize: t.fontSize.base },
    large: { fontSize: t.fontSize.medium },
  }))

export default Paragraph
