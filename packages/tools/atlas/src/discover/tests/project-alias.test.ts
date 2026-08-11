import { mergeAlias, normalizeAlias, projectAlias } from '../project-alias'

describe('normalizeAlias', () => {
  it('accepts the OBJECT form', () => {
    expect(normalizeAlias({ '~': '/abs/src' }, '/root')).toEqual([
      { find: '~', replacement: '/abs/src' },
    ])
  })

  it('accepts the ARRAY form', () => {
    // Both shapes are legal Vite and both are common; downstream code should
    // never branch on which one a project happened to write.
    expect(normalizeAlias([{ find: '~', replacement: '/abs/src' }], '/root')).toEqual([
      { find: '~', replacement: '/abs/src' },
    ])
  })

  it('resolves a RELATIVE replacement against the project root', () => {
    // An alias is relative to the config that declared it, and Atlas's Vite
    // contexts may run with a different root.
    expect(normalizeAlias({ '~': './src' }, '/root')).toEqual([
      { find: '~', replacement: '/root/src' },
    ])
  })

  it('keeps a RegExp find intact', () => {
    const re = /^~\//
    expect(normalizeAlias([{ find: re, replacement: '/abs/src/' }], '/root')[0]?.find).toBe(re)
  })

  it('is empty for no alias', () => {
    expect(normalizeAlias(undefined, '/root')).toEqual([])
  })

  it('drops a malformed entry rather than emitting a broken alias', () => {
    const alias = [{ find: '~', replacement: 42 }] as unknown as { find: string; replacement: string }[]
    expect(normalizeAlias(alias, '/root')).toEqual([])
  })
})

describe('projectAlias', () => {
  it('extracts resolve.alias from the project config', async () => {
    const loader = async () => ({ config: { resolve: { alias: { '~': './src' } } } })
    expect(await projectAlias('/root', loader)).toEqual({
      alias: [{ find: '~', replacement: '/root/src' }],
    })
  })

  it('takes ONLY resolve.alias — never the project plugins', async () => {
    // The whole reason Atlas runs `configFile: false`: it already applies the
    // real @pyreon/vite-plugin, and a second copy means two compiler passes
    // over the same JSX. This is an extraction, not a config merge.
    const loader = async () => ({
      config: {
        resolve: { alias: { '~': '/abs' }, conditions: ['browser'] },
        plugins: [{ name: 'would-double-apply' }],
        server: { port: 9999 },
      },
    })
    const result = await projectAlias('/root', loader as never)
    expect(result.alias).toEqual([{ find: '~', replacement: '/abs' }])
    expect(Object.keys(result)).toEqual(['alias'])
  })

  it('asks the config for the mode Atlas actually runs', async () => {
    let seen: { command: string; mode: string } | undefined
    const loader = async (env: { command: 'serve' | 'build'; mode: string }) => {
      seen = env
      return { config: {} }
    }
    await projectAlias('/root', loader)
    expect(seen).toEqual({ command: 'serve', mode: 'development' })
  })

  it('WARNS rather than throwing when the config cannot be read', async () => {
    // A project's config may import plugins not installed for this command, or
    // read env the workbench does not set. `atlas dev` must not refuse to start
    // over a config it only wanted one field from.
    const loader = async () => {
      throw new Error('Cannot find module vite-plugin-something')
    }
    const result = await projectAlias('/root', loader)
    expect(result.alias).toEqual([])
    expect(result.warning).toContain('vite-plugin-something')
    expect(result.warning).toContain('atlas.config.ts')
  })

  it('is silently empty when there is no config at all', async () => {
    // No config is the normal case for most projects, not a problem to report.
    const result = await projectAlias('/root', async () => null)
    expect(result).toEqual({ alias: [] })
  })
})

describe('mergeAlias', () => {
  it('puts EXPLICIT aliases first, so they actually win', async () => {
    // Vite matches in order — a later entry cannot shadow an earlier one with
    // the same `find`, so "explicit wins" is only true if explicit is first.
    const merged = mergeAlias(
      [{ find: '~', replacement: '/discovered' }],
      [{ find: '~', replacement: '/explicit' }],
    )
    expect(merged[0]).toEqual({ find: '~', replacement: '/explicit' })
    expect(merged).toHaveLength(2)
  })

  it('keeps discovered aliases the config does not override', () => {
    const merged = mergeAlias(
      [{ find: '@app', replacement: '/a' }],
      [{ find: '~', replacement: '/b' }],
    )
    expect(merged.map((e) => e.find)).toEqual(['~', '@app'])
  })

  it('is empty when neither side has any', () => {
    expect(mergeAlias([], [])).toEqual([])
  })
})
