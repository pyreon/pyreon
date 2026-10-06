import { testNativePlugin } from '../testing'

const noisy = {
  name: 'noisy',
  apiVersion: 1 as const,
  prepareIR(_module: unknown, context: { warn(message: string): void }) {
    context.warn('careful')
  },
}
const SOURCE = 'export function A() { return <Text>hi</Text> }'

describe('testNativePlugin', () => {
  it.each(['swift', 'kotlin'] as const)('compiles a snippet for %s', (target) => {
    const { code, warnings } = testNativePlugin({ name: 'quiet', apiVersion: 1 }, SOURCE, { target })
    expect(code).toContain('hi')
    expect(warnings).toEqual([])
  })

  it('returns plugin warnings by default and throws under requireNoWarnings', () => {
    expect(testNativePlugin(noisy, SOURCE, { target: 'swift' }).warnings).toEqual([
      '[Pyreon] plugin "noisy": careful',
    ])
    expect(() => testNativePlugin(noisy, SOURCE, { target: 'swift', requireNoWarnings: true })).toThrow(
      /Plugin "noisy" produced 1 warning\(s\) for swift/,
    )
  })
})
