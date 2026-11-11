import { txt } from '../../kit'

/** "Search" — gives way to the icon alone in the compact bar. */
export const SearchTriggerText = txt
  .attrs({ tag: 'span' })
  .theme(() => ({ extendCss: '@media (max-width:859.98px){display:none;}' }))
