import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasBuiltLib } from '@pyreon/test-utils/built-lib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKSPACE = join(ROOT, '..', '..', '..')
const PROVIDERS = ['http', 'query', 'validate', 'validation']
const node = process.execPath.includes('bun') ? 'node' : process.execPath
// This measures published JS under Node, not Bun's source condition. Rebuild
// Lathe and the providers after source edits, including when bisecting this test.
const artifacts = [
  join(ROOT, 'lib', 'core.js'),
  join(WORKSPACE, 'packages', 'native', 'compiler', 'lib', 'index.js'),
  ...PROVIDERS.map((name) =>
    join(WORKSPACE, 'packages', 'fundamentals', name, 'lib', 'native-plugin.js'),
  ),
]
const built = artifacts
  .map((path) => hasBuiltLib(path, 'Lathe installed native providers'))
  .every(Boolean)

const SPEC = {
  openapi: '3.0.3',
  info: { title: 'Books', version: '1' },
  servers: [{ url: 'https://books.test/v1' }],
  paths: {
    '/books': {
      get: {
        operationId: 'listBooks',
        tags: ['books'],
        responses: {
          '200': {
            description: 'Books',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Book' } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Book: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
    },
  },
}

describe.skipIf(!built)('the installed Lathe native resolver', () => {
  it.each([false, true])('uses real consumer providers only when installed: %s', (installed) => {
    const consumer = mkdtempSync(join(tmpdir(), 'lathe-installed-native-'))
    try {
      const modules = join(consumer, 'node_modules')
      const lathe = join(modules, '@pyreon', 'lathe')
      mkdirSync(lathe, { recursive: true })
      cpSync(join(ROOT, 'lib'), join(lathe, 'lib'), { recursive: true })
      cpSync(join(ROOT, 'package.json'), join(lathe, 'package.json'))
      // Only explicit installed packages are visible from the copied Lathe
      // artifact. No workspace node_modules fallback can provide missing peers.
      const dependencies: Record<string, string> = {
        '@pyreon/config': join(WORKSPACE, 'packages', 'tools', 'config'),
        '@pyreon/reactivity': join(WORKSPACE, 'packages', 'core', 'reactivity'),
        '@pyreon/native-compiler': join(WORKSPACE, 'packages', 'native', 'compiler'),
        yaml: join(ROOT, 'node_modules', 'yaml'),
      }
      if (installed) {
        for (const name of PROVIDERS)
          dependencies[`@pyreon/${name}`] = join(WORKSPACE, 'packages', 'fundamentals', name)
      }
      for (const [name, path] of Object.entries(dependencies)) {
        const destination = join(modules, name)
        mkdirSync(dirname(destination), { recursive: true })
        symlinkSync(path, destination, 'dir')
      }
      const probe = join(consumer, 'probe.mjs')
      writeFileSync(
        probe,
        `import assert from 'node:assert/strict';
         import { generate, resolveConfig, resolveNativeCompiler } from '@pyreon/lathe/core';
         const result = generate(${JSON.stringify(JSON.stringify(SPEC))}, resolveConfig({ input: 'x', target: 'multiplatform' }));
         const module = result.files.find(f => f.path === 'books.native.tsx');
         assert(module);
         const { transform } = await resolveNativeCompiler();
         assert.equal(typeof transform, 'function');
         for (const target of ['swift', 'kotlin']) {
           const out = transform(module.contents, { target });
           if (${installed}) {
             assert.deepEqual(out.warnings, []);
             assert.match(out.code, /PyreonZodSchema_BookValue/);
             assert.match(out.code, /PyreonQuery</);
             assert(out.code.includes('https://books.test/v1/books'));
           } else assert.doesNotMatch(out.code, /PyreonQuery</);
         }`,
      )
      const result = spawnSync(node, [probe], {
        cwd: consumer,
        env: { ...process.env, NO_COLOR: '1' },
        encoding: 'utf8',
        timeout: 30_000,
      })
      expect(result.error).toBeUndefined()
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    } finally {
      rmSync(consumer, { recursive: true, force: true })
    }
  })
})
