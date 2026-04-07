import { el } from '../../factory'

const Loader = el
  .config({ name: 'Loader' })
  .attrs({ tag: 'span', direction: 'inline', alignX: 'center', alignY: 'center' })
  .theme(() => ({}))
  .states((t) => ({
    primary: { color: t.color.system.primary.base },
    secondary: { color: t.color.system.base[500] },
  }))
  .sizes(() => ({
    small: { width: '16px', height: '16px' },
    medium: { width: '24px', height: '24px' },
    large: { width: '32px', height: '32px' },
    xLarge: { width: '48px', height: '48px' },
  }))
  .variants(() => ({
    spinner: {},
    dots: {},
    bars: {},
  }))

export default Loader
