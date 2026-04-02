import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { buttonTheme, closeButtonTheme, iconButtonTheme } from './theme'

const bt = getComponentTheme(buttonTheme)

const Button = rocketstyle({ useBooleans: true })({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center', alignY: 'center' } as any)
  .theme(bt.base)
  .states(bt.states)
  .sizes(bt.sizes)
  .variants(bt.variants)

export default Button

const ibt = getComponentTheme(iconButtonTheme)

export const IconButton = rocketstyle({ useBooleans: true })({ name: 'IconButton', component: Element })
  .attrs({ tag: 'button', alignX: 'center', alignY: 'center' } as any)
  .theme(ibt.base)
  .sizes(ibt.sizes)

const cbt = getComponentTheme(closeButtonTheme)

export const CloseButton = rocketstyle({ useBooleans: true })({ name: 'CloseButton', component: Element })
  .attrs({ tag: 'button', 'aria-label': 'Close', alignX: 'center', alignY: 'center' } as any)
  .theme(cbt.base)
  .sizes(cbt.sizes)
