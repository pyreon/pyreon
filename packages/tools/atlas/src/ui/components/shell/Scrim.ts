import { el } from '../../kit'

/**
 * The dim layer behind the compact-layout drawer and bottom sheet — tapping it
 * closes whichever is open. Below the overlay it belongs to (z 60 vs 61) and
 * above the shell chrome.
 */
export const Scrim = el
  .attrs({ tag: 'div' })
  .theme(() => ({
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '60',
    extendCss: 'background:rgba(8,10,16,.5);animation:atlas-fade .16s ease-out;',
  }))
