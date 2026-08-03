/** Invisible click-away layer under the profile menu. */
import { el } from '../../kit'

export const MenuBackdrop = el
  .attrs({ tag: 'div' })
  .theme(() => ({ position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', zIndex: '60' }))
