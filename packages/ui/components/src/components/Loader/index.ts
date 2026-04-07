import { txt } from '../../factory'

const Loader = txt
  .config({ name: 'Loader' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    display: 'inline-block',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderColorTop: 'transparent',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  }))
  .states((t) => ({
    primary: { color: t.color.system.primary.base },
    secondary: { color: t.color.system.base[500] },
  }))
  .sizes(() => ({
    small: { width: '16px', height: '16px', borderWidth: 2 },
    medium: { width: '24px', height: '24px', borderWidth: 2 },
    large: { width: '32px', height: '32px', borderWidth: 3 },
    xLarge: { width: '48px', height: '48px', borderWidth: 4 },
  }))

export default Loader
