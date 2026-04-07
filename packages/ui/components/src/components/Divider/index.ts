import { el } from '../../factory'

const Divider = el
  .config({ name: 'Divider' })
  .attrs({ tag: 'hr', block: true })
  .theme((t) => ({
    borderColor: t.color.system.base[200],
    borderStyle: t.borderStyle.base,
    borderWidth: 0,
    borderTopWidth: 1,
    height: 0,
  }))
  .sizes(() => ({
    small: { borderTopWidth: 1 },
    medium: { borderTopWidth: 2 },
    large: { borderTopWidth: 4 },
  }))
  .variants((t) => ({
    solid: { borderTopStyle: t.borderStyle.base },
    dashed: { borderTopStyle: t.borderStyle.dashed },
    dotted: { borderTopStyle: 'dotted' },
  }))

export default Divider
