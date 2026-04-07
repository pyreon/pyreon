import { isEmpty } from '@pyreon/ui-core'
import type createMediaQueries from './createMediaQueries'
import normalizeTheme from './normalizeTheme'
import optimizeTheme from './optimizeTheme'
import type sortBreakpoints from './sortBreakpoints'
import transformTheme from './transformTheme'

type Css = (strings: TemplateStringsArray, ...values: any[]) => any

type CustomTheme = Record<string, unknown>

type Theme = Partial<{
  rootSize: number
  breakpoints: Record<string, number>
  __PYREON__: Partial<{
    media: ReturnType<typeof createMediaQueries>
    sortedBreakpoints: ReturnType<typeof sortBreakpoints>
  }>
}> &
  CustomTheme

export type MakeItResponsiveStyles<T extends Partial<Record<string, any>> = any> = ({
  theme,
  css,
  rootSize,
  globalTheme,
}: {
  theme: T
  css: Css
  rootSize?: number | undefined
  globalTheme?: Record<string, any> | undefined
}) => ReturnType<typeof css> | string | any

export type MakeItResponsive = ({
  theme,
  key,
  css,
  styles,
  normalize,
}: {
  theme?: CustomTheme
  key?: string
  css: any
  styles: MakeItResponsiveStyles
  normalize?: boolean
}) => (props: { theme?: Theme; [prop: string]: any }) => any

const themeCache = new WeakMap<
  object,
  { breakpoints: unknown; optimized: Record<string, Record<string, unknown>> }
>()

const makeItResponsive: MakeItResponsive =
  ({ theme: customTheme, key = '', css, styles, normalize = true }) =>
  ({ theme = {}, ...props }) => {
    const internalTheme = customTheme || props[key]

    if (isEmpty(internalTheme)) return ''

    const { rootSize, breakpoints, __PYREON__, ...restTheme } = theme as Theme

    const renderStyles = (styleTheme: Record<string, unknown>): ReturnType<typeof styles> =>
      styles({ theme: styleTheme, css, rootSize, globalTheme: restTheme })

    if (isEmpty(breakpoints) || isEmpty(__PYREON__)) {
      return css`
        ${renderStyles(internalTheme)}
      `
    }

    // isEmpty guard above ensures __PYREON__ is defined here
    const { media, sortedBreakpoints } = __PYREON__ as NonNullable<typeof __PYREON__>

    let optimizedTheme: Record<string, Record<string, unknown>>

    const cached = themeCache.get(internalTheme)
    if (cached && cached.breakpoints === sortedBreakpoints) {
      optimizedTheme = cached.optimized
    } else {
      let helperTheme = internalTheme

      if (normalize) {
        helperTheme = normalizeTheme({
          theme: internalTheme,
          breakpoints: sortedBreakpoints,
        })
      }

      const transformedTheme = transformTheme({
        theme: helperTheme,
        breakpoints: sortedBreakpoints,
      })

      optimizedTheme = optimizeTheme({
        theme: transformedTheme,
        breakpoints: sortedBreakpoints,
      })

      themeCache.set(internalTheme, {
        breakpoints: sortedBreakpoints,
        optimized: optimizedTheme,
      })
    }

    return sortedBreakpoints.map((item: string) => {
      const breakpointTheme = optimizedTheme[item]

      if (!breakpointTheme || !media) return ''

      const result = renderStyles(breakpointTheme)

      return (media as Record<string, any>)[item]`
        ${result};
      `
    })
  }

export default makeItResponsive
