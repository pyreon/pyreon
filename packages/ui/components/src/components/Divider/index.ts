import { el } from '../../factory'

const Divider = el
  .config({ name: 'Divider', component: 'hr' })
  .theme((t) => ({
    borderColor: t.color.system.base[200],
    borderStyle: 'none',
    borderWidthTop: 1,
    borderStyleTop: t.borderStyle.base,
    borderColorTop: t.color.system.base[200],
    height: 0,
    width: '100%',
    margin: 0,
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
