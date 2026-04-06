import rocketstyle from '@pyreon/rocketstyle'
import { type ComponentThemeDef, getComponentTheme } from '@pyreon/ui-theme'

/**
 * Pre-configured rocketstyle factory for all UI components.
 * useBooleans: true — dimension props work as booleans (e.g. <Button primary />)
 */
export const rs = rocketstyle({ useBooleans: true })

/**
 * Create a rocketstyle component from a theme definition.
 * Resolves the theme and chains .theme(), .states(), .sizes(), .variants() automatically.
 *
 * @example
 * ```ts
 * const Button = createComponent('Button', Element, buttonTheme, { tag: 'button', alignX: 'center' })
 * ```
 */
export function createComponent(
  name: string,
  component: any,
  themeDef: ComponentThemeDef<Record<string, any>>,
  attrs?: Record<string, any>,
) {
  const resolved = getComponentTheme(themeDef)

  let chain = rs({ name, component })
  if (attrs) chain = chain.attrs(attrs)
  chain = chain.theme(resolved.base)
  if (resolved.states) chain = chain.states(resolved.states)
  if (resolved.sizes) chain = chain.sizes(resolved.sizes)
  if (resolved.variants) chain = chain.variants(resolved.variants)

  return chain
}
