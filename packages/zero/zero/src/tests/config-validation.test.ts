import { describe, expect, it } from 'vitest'
import { didYouMean, validateZeroConfig } from '../config-validation'
import { zeroPlugin } from '../vite-plugin'

describe('zero() config validation', () => {
  it('accepts a valid config', () => {
    expect(() =>
      validateZeroConfig({ mode: 'ssg', adapter: 'vercel', base: '/docs/', ssr: { mode: 'stream' }, port: 3000 }),
    ).not.toThrow()
  })

  it('names an unknown key with a did-you-mean', () => {
    expect(() => validateZeroConfig({ adaptor: 'node' })).toThrow(/unknown option `adaptor`\. Did you mean "adapter"\?/)
    expect(() => validateZeroConfig({ ssgg: {} })).toThrow(/Did you mean "ssg"/)
  })

  it('fails on a bad enum value, with a suggestion', () => {
    expect(() => validateZeroConfig({ mode: 'ssgg' })).toThrow(/`mode` must be one of .* got "ssgg"\. Did you mean "ssg"/)
    expect(() => validateZeroConfig({ adapter: 'vercell' })).toThrow(/Did you mean "vercel"/)
    expect(() => validateZeroConfig({ ssr: { mode: 'streaming' } })).toThrow(/`ssr.mode`/)
    expect(() => validateZeroConfig({ port: '3000' })).toThrow(/`port`/)
  })

  it('reports every problem in one error', () => {
    try {
      validateZeroConfig({ mdoe: 'ssr', adapter: 'x' })
      throw new Error('unreachable')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('`mdoe`')
      expect(msg).toContain('`adapter`')
    }
  })

  it('is enforced at the shipped entry (zeroPlugin)', () => {
    expect(() => zeroPlugin({ moed: 'ssr' } as never)).toThrow(/\[Pyreon\] Invalid zero\(\) config/)
  })

  it('didYouMean does not guess wildly', () => {
    expect(didYouMean('completelyUnrelated', ['mode', 'base'])).toBeUndefined()
  })
})
