import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { pinInputTheme, pinInputCellTheme } from './theme'

const resolved = getComponentTheme(pinInputTheme)

const PinInput = rocketstyle({ useBooleans: true })({ name: 'PinInput', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default PinInput

const cellResolved = getComponentTheme(pinInputCellTheme)

export const PinInputCell = rocketstyle({ useBooleans: true })({ name: 'PinInputCell', component: Element })
  .attrs({ tag: 'input' } as any)
  .theme(cellResolved.base)
  .sizes(cellResolved.sizes)
