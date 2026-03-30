import { values } from '../../units'
import { borderRadius, edge } from '../shorthands'
import processDescriptor from './processDescriptor'
import propertyMap from './propertyMap'
import type { InnerTheme, Theme } from './types'

export type { Theme as StylesTheme }

type Css = (strings: TemplateStringsArray, ...args: any[]) => string

export type Styles = ({
  theme,
  css,
  rootSize,
}: {
  theme: InnerTheme
  css: Css
  rootSize?: number
}) => string

const styles: Styles = ({ theme: t, css, rootSize }) => {
  const calc = (...params: any[]) => values(params, rootSize)
  const shorthand = edge(rootSize)
  const borderRadiusFn = borderRadius(rootSize)

  const fragments = propertyMap.map((d) =>
    processDescriptor(d, t, css, calc, shorthand, borderRadiusFn),
  )

  return fragments.filter(Boolean).join(' ')
}

export default styles
