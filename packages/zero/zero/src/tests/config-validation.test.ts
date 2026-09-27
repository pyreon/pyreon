import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

  it('rejects a non-object config and malformed adapter / base values', () => {
    expect(() => validateZeroConfig(undefined)).not.toThrow()
    expect(() => validateZeroConfig(null)).toThrow(/expects a config object — got null/)
    expect(() => validateZeroConfig([])).toThrow(/expects a config object — got object/)
    expect(() => validateZeroConfig({ adapter: 42 })).toThrow(/`adapter` must be an adapter name or an Adapter object/)
    expect(() => validateZeroConfig({ adapter: { name: 'custom' } })).not.toThrow()
    expect(() => validateZeroConfig({ base: 1 })).toThrow(/`base` must be a string/)
  })

  it('didYouMean does not guess wildly', () => {
    expect(didYouMean('completelyUnrelated', ['mode', 'base'])).toBeUndefined()
  })
})

describe('missing @pyreon/vite-plugin', () => {
  const ROOT = join(__dirname, '.tmp-missing-pyreon')
  beforeAll(() => {
    mkdirSync(join(ROOT, 'src', 'routes'), { recursive: true })
    writeFileSync(join(ROOT, 'src', 'routes', 'index.tsx'), 'export default () => <div />\n')
  })
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

  it('a real Vite resolve without pyreon() fails with ONE clear error', async () => {
    const { resolveConfig } = await import('vite')
    await expect(
      resolveConfig({ configFile: false, root: ROOT, logLevel: 'silent', plugins: [zeroPlugin()] }, 'build'),
    ).rejects.toThrow(/\[Pyreon\] zero\(\) needs the Pyreon JSX plugin/)
  })

  it('a JSX-free routes tree (plain h() modules) is not refused', async () => {
    const { resolveConfig } = await import('vite')
    await expect(
      resolveConfig({ configFile: false, root: __dirname, logLevel: 'silent', plugins: [zeroPlugin()] }, 'build'),
    ).resolves.toBeTruthy()
  })

  it('passes when pyreon() is present', async () => {
    const { resolveConfig } = await import('vite')
    const pyreon = (await import('@pyreon/vite-plugin')).default
    await expect(
      resolveConfig(
        { configFile: false, root: ROOT, logLevel: 'silent', plugins: [pyreon(), zeroPlugin()] },
        'build',
      ),
    ).resolves.toBeTruthy()
  })
})
