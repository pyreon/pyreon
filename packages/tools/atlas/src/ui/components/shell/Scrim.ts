import { el } from '../../kit'

/**
 * The dim layer behind the compact-layout catalog drawer — tapping it closes
 * the drawer. Below the drawer (z 60 vs 61) and above the shell chrome.
 */
export const Scrim = el
  .attrs({ tag: 'div' })
  .theme((t) => ({
    position: 'fixed',
    top: '48px',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '60',
    background: t.scrim,
    extendCss: 'animation:atlas-fade .16s ease-out;',
  }))
