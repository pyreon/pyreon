import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main, mainWithPlugins } from '../cli'

// `plugins` and `explain` are the two subcommands that need plugin loading, so
// they only exist on the async entry. Every spec drives the REAL entry point
// (argv in, exit code + console out) rather than the report builders, which
// have their own specs in discover-plugins.test.ts.

const SHARE_APP = `export function Example() {
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
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
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
    expect(out).toContain('owner: native-compiler')
  })

  it('works with plugin discovery switched off', async () => {
    const file = join(app, 'src', 'Example.tsx')
    expect(await mainWithPlugins(['explain', file, `--app=${app}`, '--no-plugins'])).toBe(0)
    expect(logs.join('\n')).toContain('useShare()')
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
