export type ExtendCss = (
  styles:
    | ((css: (strings: TemplateStringsArray, ...values: any[]) => string) => string)
    | string
    | null
    | undefined,
) => string

const simpleCss = (strings: TemplateStringsArray, ...values: any[]): string => {
  let result = ''
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i < values.length) result += String(values[i] ?? '')
  }
  return result
}

const extendCss: ExtendCss = (styles) => {
  if (!styles) return ''
  if (typeof styles === 'function') {
    return styles(simpleCss)
  }
  return styles
}

export default extendCss
