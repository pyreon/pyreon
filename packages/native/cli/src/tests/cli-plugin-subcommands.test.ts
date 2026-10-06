import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main, mainWithPlugins } from '../cli'

// `plugins` and `explain` are the two subcommands that need plugin loading, so
// they only exist on the async entry. Every spec drives the REAL entry point
// (argv in, exit code + console out) rather than the report builders, which
// have their own specs in discover-plugins.test.ts.

// `@pyreon/hooks` ships its own plugin; the compiler carries no copy, so an app's `useShare` lowers only through the discovered package.
const HOOKS_PLUGIN = `export default {
  name: '@pyreon/hooks',
  apiVersion: 1,
  modules: ['@pyreon/hooks'],
  services: {
    useShare: {
      legacyKind: 'share',
      swift: 'PyreonShare()',
      kotlin: ['val {id}Ctx = LocalContext.current', 'val {id} = remember { PyreonShare({id}Ctx) }'],
    },
  },
}`

const SHARE_APP = `import { useShare } from '@pyreon/hooks'
export function Example() {
  const share = useShare()
  return <Text>hello</Text>
}`

let root: string
let app: string
let logs: string[]
let errors: string[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-native-subcmd-'))
  app = join(root, 'app')
  mkdirSync(join(app, 'src'), { recursive: true })
  const hooksDir = join(app, 'node_modules', '@pyreon', 'hooks')
  mkdirSync(join(hooksDir, 'native'), { recursive: true })
  writeFileSync(
    join(hooksDir, 'package.json'),
    JSON.stringify({ name: '@pyreon/hooks', version: '1.0.0', pyreon: { native: { plugin: 'native/plugin.mjs', modules: ['@pyreon/hooks'] } } }),
  )
  writeFileSync(join(hooksDir, 'native', 'plugin.mjs'), HOOKS_PLUGIN)
  // `plugins --verify` checks every Swift/Kotlin type a service names against what the package ships.
  mkdirSync(join(hooksDir, 'native', 'swift'), { recursive: true })
  mkdirSync(join(hooksDir, 'native', 'kotlin'), { recursive: true })
  writeFileSync(join(hooksDir, 'native', 'swift', 'Share.swift'), 'final class PyreonShare {}')
  writeFileSync(join(hooksDir, 'native', 'kotlin', 'Share.kt'), 'class PyreonShare')
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: { '@pyreon/hooks': '1' } }))
  writeFileSync(join(app, 'src', 'Example.tsx'), SHARE_APP)
  logs = []
  errors = []
  vi.spyOn(console, 'log').mockImplementation((...a) => void logs.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a.join(' ')))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('pyreon-native plugins', () => {
  it('reports on an app with no plugin packages and exits 0', async () => {
    expect(await mainWithPlugins(['plugins', `--app=${app}`])).toBe(0)
    expect(logs.length + errors.length).toBeGreaterThan(0)
  })

  it('accepts --verify and --json without treating them as unknown flags', async () => {
    expect(await mainWithPlugins(['plugins', `--app=${app}`, '--verify'])).toBe(0)
    expect(await mainWithPlugins(['plugins', `--app=${app}`, '--json'])).toBe(0)
    expect(errors.join('\n')).not.toMatch(/unknown (flag|option)/i)
  })

  it('accepts --no-plugins', async () => {
    expect(await mainWithPlugins(['plugins', `--app=${app}`, '--no-plugins'])).toBe(0)
  })
})

describe('pyreon-native explain', () => {
  it('refuses to run without a file and says how to call it', async () => {
    expect(await mainWithPlugins(['explain', `--app=${app}`])).toBe(1)
    expect(errors.join('\n')).toContain('explain requires a file')
  })

  it('explains the service hooks a file lowers, naming the owner of each', async () => {
    const file = join(app, 'src', 'Example.tsx')
    expect(await mainWithPlugins(['explain', file, `--app=${app}`])).toBe(0)
    const out = logs.join('\n')
    expect(out).toContain('useShare()')
    // The service is the discovered `@pyreon/hooks` package's: it is named as the owner.
    expect(out).toContain('owner: @pyreon/hooks')
  })

  it('works with plugin discovery switched off', async () => {
    const file = join(app, 'src', 'Example.tsx')
    expect(await mainWithPlugins(['explain', file, `--app=${app}`, '--no-plugins'])).toBe(0)
    // Nothing ships inside the compiler: with discovery off no library's hooks lower.
    expect(logs.join('\n')).toContain('no service hooks, call recognizers or element lowerings found')
  })

  it('loads an explicitly passed plugin before explaining', async () => {
    const plugin = join(root, 'plugin.mjs')
    writeFileSync(plugin, `export default { name: 'explicit', apiVersion: 1 }`)
    const file = join(app, 'src', 'Example.tsx')
    expect(await mainWithPlugins(['explain', file, `--app=${app}`, `--plugin=${plugin}`])).toBe(0)
  })

  it('exits 2 with the load error when an explicit plugin is invalid', async () => {
    const plugin = join(root, 'bad.mjs')
    writeFileSync(plugin, `export default { name: 'bad', apiVersion: 99 }`)
    const file = join(app, 'src', 'Example.tsx')
    expect(await mainWithPlugins(['explain', file, `--app=${app}`, `--plugin=${plugin}`])).toBe(2)
    expect(errors.join('\n')).toContain('[pyreon-native]')
  })

  it('reports a file that does not exist as an error, not a crash', async () => {
    expect(await mainWithPlugins(['explain', join(app, 'src', 'Missing.tsx'), `--app=${app}`])).toBe(2)
  })
})

describe('the synchronous entry', () => {
  it.each(['plugins', 'explain'])('refuses `%s` and points at the async entry', (command) => {
    expect(main([command])).toBe(1)
    expect(errors.join('\n')).toContain('needs plugin loading')
  })
})
