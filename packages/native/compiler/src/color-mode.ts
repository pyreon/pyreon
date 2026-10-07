import type { ExprIR } from './types'

/** The literal mode a `<ColorModeProvider>` pins, or undefined (absent, `'system'`, or reactive). */
export function literalColorMode(e: ExprIR & { kind: 'jsx-element' }): 'light' | 'dark' | undefined {
  const attr = e.attrs.find((x) => x.kind === 'attr' && x.name === 'mode')
  const v = attr?.kind === 'attr' ? attr.value : undefined
  return v !== undefined && v.kind === 'literal' && (v.value === 'light' || v.value === 'dark') ? v.value : undefined
}
