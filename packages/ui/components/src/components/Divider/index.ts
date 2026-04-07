import { txt } from '../../factory'

const Divider = txt
  .config({ name: 'Divider' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    borderColor: t.color.system.base[200],
    borderStyle: t.borderStyle.base,
    borderWidth: 0,
    borderWidthTop: 1,
    borderStyleTop: t.borderStyle.base,
    height: 0,
    width: '100%',
  }))
  .sizes(() => ({
    small: { borderWidthTop: 1 },
    medium: { borderWidthTop: 2 },
    large: { borderWidthTop: 4 },
  }))
  .variants((t) => ({
    solid: { borderStyleTop: t.borderStyle.base },
    dashed: { borderStyleTop: t.borderStyle.dashed },
    dotted: { borderStyleTop: 'dotted' },
  }))

export default Divider
