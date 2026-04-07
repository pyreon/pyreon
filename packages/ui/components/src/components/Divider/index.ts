import { el } from '../../factory'

const Divider = el
  .config({ name: 'Divider' })
  .attrs({ tag: 'hr' })
  .theme((t) => ({
    borderTopStyle: 'solid',
    borderTopColor: t.color.system.base[200],
  }))
  .sizes(() => ({
    small: { borderTopWidth: '1px' },
    medium: { borderTopWidth: '2px' },
    large: { borderTopWidth: '3px' },
  }))
  .variants(() => ({
    solid: { borderTopStyle: 'solid' },
    dashed: { borderTopStyle: 'dashed' },
    dotted: { borderTopStyle: 'dotted' },
  }))

export default Divider
