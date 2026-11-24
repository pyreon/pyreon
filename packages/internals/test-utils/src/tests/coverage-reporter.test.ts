import { describeRunError } from '../../../../../scripts/coverage-reporter'

// The coverage gate's only artifact for a dead worker is this message. Vitest
// wraps the real reason in `cause`; dropping it left PR #4752's red Build with
// "[vitest-pool]: Worker forks emitted error." and nothing else.
describe('coverage reporter: run errors keep their cause', () => {
  it('appends the cause chain to the wrapper message', () => {
    const inner = Object.assign(new Error('Worker exited unexpectedly with code 134'), {
      name: 'Error',
    })
    const wrapper = new Error('[vitest-pool]: Worker forks emitted error.', { cause: inner })
    expect(describeRunError(wrapper)).toBe(
      '[vitest-pool]: Worker forks emitted error. — caused by Error: Worker exited unexpectedly with code 134',
    )
  })

  it('reads a serialized error (plain object) the same way', () => {
    const serialized = {
      name: 'Error',
      message: '[vitest-pool]: Worker forks emitted error.',
      cause: { name: 'RangeError', message: 'Array buffer allocation failed' },
    }
    expect(describeRunError(serialized)).toContain(
      'caused by RangeError: Array buffer allocation failed',
    )
  })

  it('stops on a self-referencing cause', () => {
    const e = new Error('loop') as Error & { cause?: unknown }
    e.cause = e
    expect(describeRunError(e).split(' — ')).toHaveLength(5)
  })

  it('falls back to the stack, then to a placeholder, without a message', () => {
    expect(describeRunError({ stack: 'at x' })).toBe('at x')
    expect(describeRunError({})).toBe('Unknown runtime error')
    expect(describeRunError('plain string')).toBe('plain string')
  })
})
