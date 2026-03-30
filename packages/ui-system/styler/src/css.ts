import { CSSResult, type Interpolation } from './resolve'

/**
 * Tagged template function for CSS. Captures the template strings and
 * interpolation values as a lazy CSSResult — resolution is deferred
 * until a styled component renders.
 *
 * Works as both a tagged template (`css\`...\``) and a regular function
 * call (`css(...args)`) since tagged templates are syntactic sugar for
 * function calls with (TemplateStringsArray, ...values).
 */
export const css = (strings: TemplateStringsArray, ...values: Interpolation[]): CSSResult =>
  new CSSResult(strings, values)
