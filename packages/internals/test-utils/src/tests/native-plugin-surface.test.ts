// The decide jobs have Bun but no install. Exercise the actual Bun scanner and
// CLI in fresh fixtures, rather than mock an import graph into existence.
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const REPO = resolve(__dirname, '../../../../..')
const owned: string[] = []
afterEach(() => {
  for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true })
})

function put(root: string, path: string, source: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), source)
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'native-plugin-selector-'))
  owned.push(root)
  mkdirSync(join(root, 'scripts'))
  for (const script of ['native-plugin-surface.ts', 'native-surface-touched.ts'])
    copyFileSync(join(REPO, 'scripts', script), join(root, 'scripts', script))
  put(
    root,
    'packages/core/owner/package.json',
    JSON.stringify({
      name: '@pyreon/owner',
      pyreon: { native: { plugin: './lib/lowering.js' } },
      exports: {
        './lowering': {
          types: './lib/lowering.d.ts',
          bun: { import: './src/lowering.ts' },
          import: './lib/lowering.js',
        },
      },
    }),
  )
  put(root, 'packages/core/owner/src/lowering.ts', 'export { value } from "./nested/helper.js"')
  put(
    root,
    'packages/core/owner/src/nested/helper.ts',
    'export { value } from "@pyreon/helper/values/answer"',
  )
  put(
    root,
    'packages/tools/helper/package.json',
    JSON.stringify({
      name: '@pyreon/helper',
      exports: {
        './values/*': {
          bun: [{ types: './lib/*.d.ts' }, { import: './src/*.ts' }],
          import: './lib/*.js',
        },
      },
    }),
  )
  put(root, 'packages/tools/helper/src/answer.ts', 'export const value = 42')
  return root
}

function prove(root: string, body: string): void {
  const result = spawnSync(
    'bun',
    [
      '--eval',
      `
    import assert from 'node:assert/strict';
    import { existsSync, readFileSync } from 'node:fs';
    import { deriveNativePluginSurface } from './scripts/native-plugin-surface.ts';
    import { classifyNativeSurface, deriveAppSurfaces, selectApps } from './scripts/native-surface-touched.ts';
    const read = path => { try { return readFileSync(path, 'utf8') } catch { return null } };
    ${body}
  `,
    ],
    { cwd: root, encoding: 'utf8', timeout: 20_000 },
  )
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
}

function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
}

function git(root: string, ...args: string[]): void {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=Selector Test', '-c', 'user.email=selector@example.test', ...args],
    {
      cwd: root,
      env: cleanEnv(),
      encoding: 'utf8',
      timeout: 20_000,
    },
  )
  expect(result.status, result.stderr).toBe(0)
}

function commitBase(root: string): void {
  git(root, 'init', '-q', '-b', 'selector-base')
  git(root, 'add', 'packages', 'scripts')
  git(root, 'commit', '-qm', 'base fixture')
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
}

function select(root: string, file: string, env: NodeJS.ProcessEnv = {}): string[] {
  const output = join(root, 'github-output')
  rmSync(output, { force: true })
  const result = spawnSync('bun', ['scripts/native-surface-touched.ts', '--apps'], {
    cwd: root,
    input: file + '\n',
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...cleanEnv(), GITHUB_REF: '', ...env, GITHUB_OUTPUT: output },
  })
  expect(result.status, result.stderr).toBe(0)
  return readFileSync(output, 'utf8').trim().split('\n')
}

describe('native plugin dependency selection before installation', () => {
  it('follows nested conditions, arrays, wildcard exports, .js source imports and cross-package helpers', () => {
    const root = fixture()
    prove(
      root,
      `
      assert.equal(existsSync('node_modules'), false);
      const surface = deriveNativePluginSurface(process.cwd());
      assert.deepEqual(surface.owners, ['packages/core/owner/package.json']);
      for (const path of [
        'packages/core/owner/src/lowering.ts',
        'packages/core/owner/src/nested/helper.ts',
        'packages/tools/helper/src/answer.ts',
        'packages/tools/helper/package.json',
      ]) {
        assert.equal(classifyNativeSurface([path], read, undefined, surface.files).run, true, path);
        assert.deepEqual(selectApps([path], []).ios, 'all');
        assert.deepEqual(selectApps([path], []).android, 'all');
      }
      assert.equal(classifyNativeSurface(['packages/tools/helper/src/unrelated.ts'], read, undefined, surface.files).run, false);
    `,
    )
  })

  it.each([
    'export * from "./answer"',
    'export { value } from "./answer"',
    'export const value = import("./answer")',
    'export const value = import("./" + "answer")',
  ])('follows runtime dependency syntax: %s', (source) => {
    const root = fixture()
    put(root, 'packages/core/owner/src/lowering.ts', source)
    put(root, 'packages/core/owner/src/answer.ts', 'export const value = 42')
    prove(
      root,
      `assert(deriveNativePluginSurface(process.cwd()).files.has('packages/core/owner/src/answer.ts'))`,
    )
  })

  it.each([
    'export const value = import(name)',
    'export const value = import(/* runtime path */ name)',
    'export const value = import(`./${name}`)',
    'export const value = import("./" + name)',
    'export const value = require(name)',
    'export const value = require.resolve(name)',
    'export const value = require("./answer")',
    'export const value = require.resolve("./answer")',
  ])('fails closed for unresolvable runtime dependency syntax: %s', (source) => {
    const root = fixture()
    put(root, 'packages/core/owner/src/lowering.ts', source)
    prove(
      root,
      `assert.throws(() => deriveNativePluginSurface(process.cwd()), /native plugin dependency/)`,
    )
  })

  it('propagates a real source read error instead of omitting the helper', () => {
    const root = fixture()
    rmSync(join(root, 'packages/tools/helper/src/answer.ts'))
    symlinkSync('answer.ts', join(root, 'packages/tools/helper/src/answer.ts'))
    prove(root, `assert.throws(() => deriveNativePluginSurface(process.cwd()))`)
  })

  it('uses Bun resolution when both .ts and .tsx exist and for explicit .mjs imports', () => {
    const root = fixture()
    put(
      root,
      'packages/core/owner/src/lowering.ts',
      'export * from "./answer"; export * from "./other.mjs"',
    )
    put(root, 'packages/core/owner/src/answer.ts', 'export const wrong = true')
    put(root, 'packages/core/owner/src/answer.tsx', 'export const correct = true')
    put(root, 'packages/core/owner/src/other.mts', 'export const alsoCorrect = true')
    prove(
      root,
      `
      const surface = deriveNativePluginSurface(process.cwd());
      assert(surface.files.has('packages/core/owner/src/answer.tsx'));
      assert(surface.files.has('packages/core/owner/src/other.mts'));
    `,
    )
  })

  it('follows a relative helper outside any owning package', () => {
    const root = fixture()
    put(
      root,
      'packages/core/owner/src/lowering.ts',
      'export * from "../../../../scripts/shared.ts"',
    )
    put(root, 'scripts/shared.ts', 'export const value = 42')
    prove(
      root,
      `
      const surface = deriveNativePluginSurface(process.cwd());
      assert.equal(classifyNativeSurface(['scripts/shared.ts'], read, undefined, surface.files).run, true);
    `,
    )
  })

  it('does not resolve a blocked exact/conditional/pattern export through a fallback', () => {
    for (const exports of [
      { './values/answer': null, './values/*': { bun: './src/*.ts' } },
      { './values/a*': null, './values/*': { bun: './src/*.ts' } },
      { './values/*': { bun: null, default: './src/*.ts' } },
    ]) {
      const root = fixture()
      put(
        root,
        'packages/tools/helper/package.json',
        JSON.stringify({ name: '@pyreon/helper', exports }),
      )
      prove(
        root,
        `assert.throws(() => deriveNativePluginSurface(process.cwd()), /blocked native plugin export/)`,
      )
    }
  })

  it('fails closed for unresolved package-import aliases', () => {
    const root = fixture()
    put(root, 'packages/core/owner/src/lowering.ts', 'export * from "#local-helper"')
    prove(
      root,
      `assert.throws(() => deriveNativePluginSurface(process.cwd()), /unknown native workspace import/)`,
    )
  })

  it('remembers removed custom plugin ownership from the local comparison base', () => {
    const root = fixture()
    // A second owner preserves a nonempty current graph after the custom owner
    // is unregistered; an unrelated graph error must not stand in for this proof.
    put(
      root,
      'packages/core/other/package.json',
      JSON.stringify({
        name: '@pyreon/other',
        pyreon: { native: { plugin: './lib/native-plugin.js' } },
        exports: {
          './native-plugin': { bun: './src/native-plugin.ts', import: './lib/native-plugin.js' },
        },
      }),
    )
    put(root, 'packages/core/other/src/native-plugin.ts', 'export default {}')
    commitBase(root)
    put(root, 'packages/core/owner/package.json', '{"name":"@pyreon/owner"}')
    prove(
      root,
      `assert.deepEqual(deriveNativePluginSurface(process.cwd()).owners, ['packages/core/other/package.json'])`,
    )
    expect(select(root, 'packages/core/owner/package.json')).toEqual([
      'run=true',
      'ios-apps=all',
      'android-apps=all',
    ])
  })

  it('skips a proven web-only manifest and fails closed when the base is unavailable', () => {
    const root = fixture()
    put(root, 'packages/tools/web/package.json', '{"name":"@pyreon/web","version":"1.0.0"}')
    expect(select(root, 'packages/tools/web/package.json')).toEqual([
      'run=true',
      'ios-apps=all',
      'android-apps=all',
    ])
    commitBase(root)
    put(root, 'packages/tools/web/package.json', '{"name":"@pyreon/web","version":"1.0.1"}')
    expect(select(root, 'packages/tools/web/package.json')).toEqual([
      'run=false',
      'ios-apps=none',
      'android-apps=none',
    ])
    // A PR merge checkout missing its parents cannot establish prior ownership.
    expect(
      select(root, 'packages/tools/web/package.json', { GITHUB_REF: 'refs/pull/1/merge' }),
    ).toEqual(['run=true', 'ios-apps=all', 'android-apps=all'])
  })

  it('reads the actual merge parent instead of a moving main ref', () => {
    const root = fixture()
    put(root, 'packages/tools/web/package.json', '{"name":"@pyreon/web"}')
    commitBase(root)
    git(root, 'switch', '-qc', 'feature')
    put(root, 'packages/tools/web/package.json', '{"name":"@pyreon/web","version":"1.0.1"}')
    git(root, 'add', 'packages/tools/web/package.json')
    git(root, 'commit', '-qm', 'feature fixture')
    git(root, 'switch', '-qc', 'main', 'HEAD~1')
    git(root, 'merge', '--no-ff', '-qm', 'merge fixture', 'feature')
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main')
    expect(
      select(root, 'packages/tools/web/package.json', { GITHUB_REF: 'refs/pull/1/merge' }),
    ).toEqual(['run=false', 'ios-apps=none', 'android-apps=none'])
  })

  it.each([
    ['deleted helper', 'packages/tools/helper/src/answer.ts', null],
    ['invalid helper', 'packages/tools/helper/src/answer.ts', 'export const = ;'],
    ['invalid manifest', 'packages/tools/helper/package.json', '{'],
    [
      'unresolved workspace',
      'packages/core/owner/src/lowering.ts',
      'export * from "@pyreon/missing"',
    ],
    [
      'missing source export',
      'packages/core/owner/package.json',
      '{"name":"@pyreon/owner","pyreon":{"native":{"plugin":"./lib/plugin.js"}}}',
    ],
  ])('runs every device lane for %s', (_name, path, content) => {
    const root = fixture()
    if (content === null) rmSync(join(root, path))
    else put(root, path, content)
    const output = join(root, 'github-output')
    const result = spawnSync('bun', ['scripts/native-surface-touched.ts', '--apps'], {
      cwd: root,
      input: 'packages/core/runtime-dom/src/mount.ts\n',
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, GITHUB_OUTPUT: output },
    })
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(output, 'utf8').split('\n')).toEqual([
      'run=true',
      'ios-apps=all',
      'android-apps=all',
      '',
    ])
  })

  it('preserves every real owner and shared chart helper while skipping web-only source and JSX Rust', () => {
    prove(
      REPO,
      `
      const surface = deriveNativePluginSurface(process.cwd());
      assert.equal(surface.owners.length, 40);
      const apps = deriveAppSurfaces(process.cwd());
      for (const manifest of surface.owners) {
        const path = manifest.replace('package.json', 'src/native-plugin.ts');
        const selected = classifyNativeSurface([path], read, undefined, surface.files);
        assert.equal(selected.run, true, path);
        assert.equal(selectApps([path], apps).ios, 'all', path);
        assert.equal(selectApps([path], apps).android, 'all', path);
      }
      for (const path of [
        'packages/fundamentals/charts/src/engine/palette.ts',
        'packages/fundamentals/charts/src/engine/visual-strip.ts',
        'packages/fundamentals/charts/src/engine/heat-ramp.ts',
        'packages/fundamentals/form/src/native-plugin/emit.ts',
        'scripts/native-surface-touched.ts', 'scripts/native-plugin-surface.ts',
        'scripts/native-first-party-plugins.ts',
      ]) assert.equal(classifyNativeSurface([path], read, undefined, surface.files).run, true, path);
      for (const path of [
        'packages/core/runtime-dom/src/mount.ts',
        'packages/core/compiler/src/transform.ts',
        'packages/core/compiler/native/src/lib.rs',
        'packages/fundamentals/hooks/src/use-click-outside.ts',
        'docs/index.md',
      ]) assert.equal(classifyNativeSurface([path], read, undefined, surface.files).run, false, path);
    `,
    )
  })
})
