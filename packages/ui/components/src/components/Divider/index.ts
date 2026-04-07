import { txt } from '../../factory'

const Divider = txt
  .config({ name: 'Divider' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: t.borderStyle.base,
    borderTopColor: t.color.system.base[200],
    margin: 0,
    width: '100%',
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
