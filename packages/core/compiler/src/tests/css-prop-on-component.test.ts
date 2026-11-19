import { describe, expect, it } from 'vitest'
import { detectPyreonPatterns, hasPyreonPatterns } from '../pyreon-intercept'

// `css-prop-on-component`: CSS passed to a component through `css`. A one-off
// look is a named `.multiple()` modifier on the component; `css` stays only as
// the escape hatch for a selector or an at-rule (the lint rule
// `pyreon/prefer-style-modifier` flags the same shape in a project).
const codes = (src: string) => detectPyreonPatterns(src, 'a.tsx').map((d) => d.code)

describe('css-prop-on-component', () => {
  it('fires on css on a component (string, tagged template, member tag)', () => {
    for (const src of [
      `export const A = () => <Card css="color: red;" />`,
      `export const A = () => <Card css={css\`color: red;\`}>x</Card>`,
      `export const A = () => <Ui.Card css={x} />`,
    ]) {
      expect(hasPyreonPatterns(src), src).toBe(true)
      expect(codes(src), src).toContain('css-prop-on-component')
    }
    const [d] = detectPyreonPatterns(`export const A = () => <Grid css={x} />`, 'a.tsx')
    expect(d!.message).toContain('Grid.multiple({ look:')
    expect(d!.suggested).toContain('multiple="look"')
    expect(d!.fixable).toBe(false)
  })

  it('does not fire on an HTML element or a modifier list', () => {
    expect(codes(`export const A = () => <div css={x} />`)).not.toContain('css-prop-on-component')
    expect(codes(`export const A = () => <Grid multiple={['threeUp', on && 'dense']} />`)).not.toContain('css-prop-on-component')
  })
})
