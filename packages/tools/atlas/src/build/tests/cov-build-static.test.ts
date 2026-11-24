/**
 * `atlas build` — the whole command, run for real against a real project.
 *
 * `static.ts` was 29% covered: its pure emitters had a suite, `buildStatic`
 * itself had none. That is the function whose OUTPUT someone deploys, and the
 * things it decides are not observable from the pieces:
 *
 *   * **`--base` reaches every consumer.** Vite rewrites the shell's asset
 *     URLs with it and zero's router and per-component pages resolve against
 *     it, so a relative one is refused before any work rather than building a
 *     site whose component pages silently fail to load their own JavaScript.
 *   * **The catalog the site ships is the SCAN's catalog**, config and all.
 *     A `pages`/`projects` entry that never reaches the plugin produces a site
 *     whose sidebar disagrees with the dev server's for the same project —
 *     and it deploys cleanly.
 *   * **Zero components is a hard failure**, because an empty site is
 *     indistinguishable from a working one whose components all failed to
 *     discover.
 *
 * The fixture is a throwaway project with a symlinked `node_modules`, so the
 * generated entry's `@pyreon/*` imports resolve the way they do in an installed
 * project. Nothing here reads or writes the example it borrows from.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appDir } from '../../dev/zero-app'
import { buildStatic } from '../static'

/** An installed project whose `node_modules` the fixtures borrow, read-only. */
const INSTALLED = resolve(__dirname, '../../../../../../examples/atlas-workshop')

const HELLO = [
  'export function Hello(props: { name?: string }) {',
  '  return props.name ?? null',
  '}',
  '',
].join('\n')

let roots: string[] = []

/**
 * A throwaway project that can actually be bundled.
 *
 * `node_modules` is a real directory of symlinks rather than a symlink to one,
 * so the build's dependency cache never lands inside the borrowed project.
 */
function fixture(options: { config?: string; components?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'atlas-build-'))
  roots.push(root)
  mkdirSync(join(root, 'src', 'widgets'), { recursive: true })
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  for (const entry of readdirSync(join(INSTALLED, 'node_modules'))) {
    symlinkSync(join(INSTALLED, 'node_modules', entry), join(root, 'node_modules', entry))
  }
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, type: 'module' }),
    'utf8',
  )
  if (options.components !== false) writeFileSync(join(root, 'src', 'widgets', 'Hello.tsx'), HELLO, 'utf8')
  if (options.config !== undefined) writeFileSync(join(root, 'atlas.config.ts'), options.config, 'utf8')
  return root
}

const CONFIG = [
  "export const title = 'Fixture Design System'",
  // A wrapper is what makes the scan record a config PATH, which the built
  // site imports in the browser so the preview renders inside the project's
  // own providers.
  'export function wrapper(props: { children?: unknown }) { return props.children }',
  "export const pages = { Hello: { title: 'Hi There', group: 'Greetings' } }",
  "export const projects = [{ name: 'fx', dir: '.' }]",
  "export const presets = { viewports: [{ id: 'full', label: 'Full', width: null }] }",
  '',
].join('\n')


/** A project vite config with its OWN plugin and define — no imports, so it loads from a bare temp dir. */
const PROJECT_VITE_CONFIG = [
  'export default {',
  '  define: { __PROJECT_DEFINE__: JSON.stringify("defined-by-project") },',
  '  plugins: [{',
  "    name: 'project-mark',",
  '    transform(code, id) {',
  "      return id.includes('Marked') ? code.replace('__PROJECT_MARK__', 'transformed-by-project-plugin') : null",
  '    },',
  '  }],',
  '}',
  '',
].join('\n')

const MARKED = [
  'declare const __PROJECT_DEFINE__: string',
  'export function Marked(props: { label?: string }) {',
  "  return `${props.label ?? ''} __PROJECT_MARK__ ${__PROJECT_DEFINE__}`",
  '}',
  '',
].join('\n')

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
  roots = []
})

describe('the emitted site', () => {
  it('builds a deployable directory and a page per component', async () => {
    const root = fixture({ config: CONFIG })
    const logs: string[] = []
    const result = await buildStatic({ cwd: root, out: 'dist', onLog: (m) => logs.push(m) })

    expect(result.outDir).toBe(join(root, 'dist'))
    expect(result.components).toBe(1)
    // The config's title, since nothing overrode it — the same precedence
    // `atlas dev` follows, so a project cannot end up with two names.
    expect(result.title).toBe('Fixture Design System')

    const shell = readFileSync(join(root, 'dist', 'index.html'), 'utf8')
    expect(shell).toContain('<title>Fixture Design System</title>')
    // The default base is absolute, so assets are root-relative.
    expect(shell).toMatch(/src="\/assets\//)
    expect(readdirSync(join(root, 'dist'))).toContain('assets')

    // The per-component URL, and the id that names it: `projects` reached the
    // catalog, so the directory is the project-qualified slug.
    expect(result.routedPages).toBe(1)
    const page = join(root, 'dist', 'fx-hello', 'index.html')
    expect(readFileSync(page, 'utf8')).toBe(shell)

    // Nothing went wrong, so nothing was said. Without this the degradation
    // specs below would pass against a build that logs unconditionally.
    expect(logs).toEqual([])
  }, 300_000)

  it("applies the PROJECT's own vite plugins and define to the built site", async () => {
    // Atlas runs its app with `configFile: false`, so a project whose
    // components need its own plugin (Tailwind v4's `@tailwindcss/vite`, a
    // custom transform) shipped them untransformed.
    const root = fixture({ components: false })
    writeFileSync(join(root, 'vite.config.ts'), PROJECT_VITE_CONFIG, 'utf8')
    writeFileSync(join(root, 'src', 'widgets', 'Marked.tsx'), MARKED, 'utf8')
    await buildStatic({ cwd: root, out: 'dist' })
    const js = readdirSync(join(root, 'dist', 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(root, 'dist', 'assets', f), 'utf8'))
      .join('\n')
    expect(js).toContain('transformed-by-project-plugin')
    expect(js).toContain('defined-by-project')
    expect(js).not.toContain('__PROJECT_MARK__')
  }, 300_000)

  it('builds with the workbench app directory READ-ONLY — nothing is written into the install', async () => {
    // zero wrote its temporary SSG entry into the Vite root, which is the app
    // inside the Atlas install: a read-only install (Yarn PnP, a Nix store)
    // failed, and a writable one got a file in node_modules. It now goes to
    // the project's cache dir.
    const root = fixture()
    const app = appDir()
    const before = readdirSync(app).sort()
    chmodSync(app, 0o555)
    try {
      const result = await buildStatic({ cwd: root, out: 'dist' })
      expect(result.routedPages).toBe(1)
    } finally {
      chmodSync(app, 0o755)
    }
    expect(readdirSync(app).sort()).toEqual(before)
  }, 300_000)

  it("copies the PROJECT's public/ into the site", async () => {
    // The Vite root is the workbench app, so the default publicDir pointed
    // into the Atlas install and the project's static files never shipped.
    const root = fixture()
    mkdirSync(join(root, 'public'), { recursive: true })
    writeFileSync(join(root, 'public', 'brand.txt'), 'from the project public dir\n', 'utf8')
    await buildStatic({ cwd: root, out: 'dist' })
    expect(readFileSync(join(root, 'dist', 'brand.txt'), 'utf8')).toBe('from the project public dir\n')
  }, 300_000)

  it("applies the project's resolve.alias, as atlas dev does", async () => {
    // A component importing through an alias the CONFIG declares. Without the
    // alias in the build's resolve, the bundler cannot resolve `~/…` and the
    // build fails on a project `atlas dev` serves fine.
    const root = fixture({ components: false, config: "export const alias = { '~': './src' }\n" })
    mkdirSync(join(root, 'src', 'shared'), { recursive: true })
    writeFileSync(join(root, 'src', 'shared', 'greet.ts'), "export const greet = (n?: string) => `hi ${n ?? ''}`\n", 'utf8')
    writeFileSync(
      join(root, 'src', 'widgets', 'Hello.tsx'),
      "import { greet } from '~/shared/greet'\nexport function Hello(props: { name?: string }) {\n  return greet(props.name)\n}\n",
      'utf8',
    )
    const result = await buildStatic({ cwd: root, out: 'dist' })
    expect(result.components).toBe(1)
    expect(result.routedPages).toBe(1)
  }, 300_000)

  it('builds for production and restores a caller who had NODE_ENV unset', async () => {
    // `vite build` only sets production when NODE_ENV is unset, so the build
    // forces it — and must hand the caller's environment back unchanged,
    // including the was-unset case, or it leaks `production` into whatever
    // runs next in the same process.
    const root = fixture()
    const prev = process.env.NODE_ENV
    delete process.env.NODE_ENV
    try {
      await buildStatic({ cwd: root, out: 'dist' })
      expect('NODE_ENV' in process.env).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = prev
    }
  }, 300_000)

  it('rewrites assets for a subdirectory base and lets --title win over the config', async () => {
    const root = fixture({ config: CONFIG })
    const result = await buildStatic({ cwd: root, out: 'dist', base: '/repo/', title: 'From The Flag' })

    expect(result.title).toBe('From The Flag')
    const shell = readFileSync(join(root, 'dist', 'index.html'), 'utf8')
    expect(shell).toContain('<title>From The Flag</title>')
    expect(shell).toMatch(/src="\/repo\/assets\//)
    // An absolute base still fans the directories out.
    expect(result.routedPages).toBe(1)
  }, 300_000)

  it('refuses a relative base before any work, and says what to pass', async () => {
    // A relative base resolves `./assets/…` against each page's own
    // directory, and the workbench router cannot route under it. Refused up
    // front: nothing is scanned and no output directory is created.
    const root = fixture()
    await expect(buildStatic({ cwd: root, out: 'dist', base: './' })).rejects.toThrow(
      /--base \.\/ is relative\. Pass an absolute path/,
    )
    expect(readdirSync(root)).not.toContain('dist')
  }, 300_000)
})

describe('what the defaults are', () => {
  it('builds `./src` of the working directory into `./atlas-dist`', async () => {
    // The zero-flag call is the CLI's own shape (`atlas build` with nothing
    // after it), and it is the only way these defaults are reached.
    const root = fixture()
    const before = process.cwd()
    try {
      process.chdir(root)
      // Read back from `cwd()` rather than the mkdtemp path: on macOS the
      // temp directory is a symlink, so the two spell the same directory
      // differently and only one of them is what `resolve('.')` produces.
      const here = process.cwd()
      const result = await buildStatic({})
      expect(result.outDir).toBe(join(here, 'atlas-dist'))
      // The workbench app's client shell: zero's mount point plus the
      // marker that lets the next build empty the directory.
      expect(readFileSync(join(root, 'atlas-dist', 'index.html'), 'utf8')).toContain('<div id="app">')
      expect(readdirSync(join(root, 'atlas-dist'))).toContain('.atlas-build-output')
      expect(result.components).toBe(1)
    } finally {
      process.chdir(before)
    }
  }, 300_000)
})

describe('when something is wrong with the project', () => {
  it('reports a config that could not be used, and builds the rest anyway', async () => {
    const root = fixture({ config: 'export const title = 123\n' })
    const logs: string[] = []
    const result = await buildStatic({ cwd: root, out: 'dist', onLog: (m) => logs.push(m) })

    expect(logs.join('\n')).toContain('atlas build:')
    expect(logs.join('\n')).toContain('title')
    // The config was optional; the site is not.
    expect(result.components).toBe(1)
    // …and with no config title to take, the default stands.
    expect(result.title).toBe('Atlas')
    expect(readFileSync(join(root, 'dist', 'index.html'), 'utf8')).toContain('<title>Atlas</title>')
  }, 300_000)

  it('REFUSES to emit a site with no components', async () => {
    // An empty site deploys just as cleanly as a full one, which is why this
    // is a throw and not a warning. Called with no `onLog`, because a command
    // that fails must not need a listener to do it.
    const root = fixture({ components: false })
    await expect(buildStatic({ cwd: root, out: 'dist', dir: 'src' })).rejects.toThrow(
      /no components found under/,
    )
    // And it names the directory it looked in, which is the thing `--dir` fixes.
    await expect(buildStatic({ cwd: root, out: 'dist' })).rejects.toThrow(join(root, 'src'))
    expect(readdirSync(root)).not.toContain('dist')
  }, 300_000)
})
