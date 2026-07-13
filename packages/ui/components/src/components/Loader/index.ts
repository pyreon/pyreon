import { txt } from '../../factory'

const Loader = txt
  .config({ name: 'Loader' })
  // A bare spinner has no text, so assistive tech announces nothing. `role="status"`
  // makes it a POLITE live region and `aria-label` gives it an accessible name
  // (Bootstrap/Chakra/MUI spinner convention). Both are DEFAULTS — pass your own
  // `aria-label` (e.g. a localized string) or `role` to override.
  .attrs({ tag: 'span', role: 'status', 'aria-label': 'Loading' })
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
