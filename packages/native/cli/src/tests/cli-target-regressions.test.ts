import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../cli'
let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-native-targets-'))
  writeFileSync(join(root, 'App.tsx'), 'export function App() { return <Text>ready</Text> }')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})
describe('check target validation', () => {
  it.each(['rust', '', 'alll'])(
    'rejects the unknown target %s rather than checking both platforms',
    (target) => {
      expect(main(['check', `--target=${target}`, `--source=${root}`])).toBe(1)
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown check target'))
    },
  )
  it.each(['ios', 'android', 'swift', 'kotlin', 'all'])(
    'keeps the supported target %s available',
    (target) => {
      expect(main(['check', `--target=${target}`, `--source=${root}`])).toBe(0)
    },
  )
})
