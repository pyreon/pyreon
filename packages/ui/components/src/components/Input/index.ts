import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { inputTheme, textareaTheme } from './theme'

const iResolved = getComponentTheme(inputTheme)

const Input = rocketstyle({ useBooleans: true })({ name: 'Input', component: Element })
  .attrs({ tag: 'input', block: true } as any)
  .theme(iResolved.base)
  .states(iResolved.states)
  .sizes(iResolved.sizes)
  .variants(iResolved.variants)

export default Input

const tResolved = getComponentTheme(textareaTheme)

export const Textarea = rocketstyle({ useBooleans: true })({ name: 'Textarea', component: Element })
  .attrs({ tag: 'textarea', block: true } as any)
  .theme(tResolved.base)
  .states(tResolved.states)
  .sizes(tResolved.sizes)
  .variants(tResolved.variants)
