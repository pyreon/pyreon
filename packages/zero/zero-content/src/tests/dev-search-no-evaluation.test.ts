// @vitest-environment node
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import { expect, it } from 'vitest'
import content from '../plugin'

it('indexes markdown without evaluating page modules or their imported application code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pyreon-search-no-evaluation-'))
  const marker = '__pyreonSearchIndexPageEvaluated'
  const file = join(root, 'src/content/docs/search.mdx')
  Reflect.deleteProperty(globalThis, marker)
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    await symlink(resolve(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir')
    await mkdir(join(root, 'src/content/docs'), { recursive: true })
    await writeFile(
      join(root, 'content.config.mjs'),
      `export default { collections: { docs: { type: 'pages', path: 'src/content/docs', schema: {}, searchable: true } } }`,
    )
    await writeFile(
      file,
      `---
title: Searchable signals
---

export const evaluation = (globalThis.${marker} = true)

# Signals

Searchable signal content.
`,
    )
    server = await createServer({
      configFile: false,
      root,
      plugins: [content()],
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      resolve: { conditions: ['bun'] },
      ssr: { noExternal: ['@pyreon/core', '@pyreon/reactivity'], resolve: { conditions: ['bun'] } },
    })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === 'string') throw new Error('Expected an HTTP listener')
    const url = `http://127.0.0.1:${address.port}`
    const response = await fetch(`${url}/search-index.json`)
    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual({
      collections: [{ name: 'docs', url: '/search-index-docs.json' }],
    })
    const chunk = (await (await fetch(`${url}/search-index-docs.json`)).json()) as {
      docs: { title: string; body: string }[]
    }
    expect(chunk.docs).toHaveLength(1)
    expect(chunk.docs[0]?.title).toBe('Searchable signals')
    expect(chunk.docs[0]?.body).toContain('signal content')
    expect(Reflect.get(globalThis, marker)).toBeUndefined()
    // Control: the same real Vite runner does execute this page when asked.
    await server.ssrLoadModule(file)
    expect(Reflect.get(globalThis, marker)).toBe(true)
  } finally {
    await server?.close()
    Reflect.deleteProperty(globalThis, marker)
    await rm(root, { recursive: true, force: true })
  }
})
