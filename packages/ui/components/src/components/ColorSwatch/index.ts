import { el } from '../../factory'

const ColorSwatch = el
  .config({ name: 'ColorSwatch' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    width: '32px',
    height: '32px',
    borderRadius: t.borderRadius.pill,
    borderWidth: t.borderWidth.medium,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[200],
    display: 'inline-block',
    transition: t.transition.fast,
    hover: {
      borderColor: t.color.system.base[400],
    },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
    },
  }))
  .sizes(() => ({
    small: { width: '24px', height: '24px' },
    medium: { width: '32px', height: '32px' },
    large: { width: '40px', height: '40px' },
  }))

export default ColorSwatch
