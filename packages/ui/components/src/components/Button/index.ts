import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { buttonTheme, closeButtonTheme, iconButtonTheme } from './theme'

const Button = createComponent('Button', Element, buttonTheme, { tag: 'button', alignX: 'center', alignY: 'center' })
export default Button

export const IconButton = createComponent('IconButton', Element, iconButtonTheme, { tag: 'button', alignX: 'center', alignY: 'center' })
export const CloseButton = createComponent('CloseButton', Element, closeButtonTheme, { tag: 'button', 'aria-label': 'Close', alignX: 'center', alignY: 'center' })
