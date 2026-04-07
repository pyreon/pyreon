import { el } from '../../factory'

const ColorSwatch = el
  .config({ name: 'ColorSwatch' })
  .attrs({ tag: 'div' })
  .theme((t: any) => ({
    width: '32px',
    height: '32px',
    borderRadius: t.borderRadius.pill,
    borderWidth: t.borderWidth.medium,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[200],
    display: 'inline-block',
  }))
  .sizes(() => ({
    small: { width: '24px', height: '24px' },
    medium: { width: '32px', height: '32px' },
    large: { width: '40px', height: '40px' },
  }))

export default ColorSwatch
