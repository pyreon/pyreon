import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlinFiles, validateSwiftFilesWithStubs } from './first-party-plugins'

vi.setConfig({ testTimeout: 180_000 })
const fixtures = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../fundamentals/form/native-golden',
)
const sources = readdirSync(fixtures)
  .filter((file) => file.startsWith('form-plugin-') && file.endsWith('.tsx'))
  .sort()
  .map((file, index) => ({
    file,
    // Compile all fixtures together without duplicate component declarations.
    source: readFileSync(resolve(fixtures, file), 'utf8').replace(
      'export function App()',
      `export function FormPluginCase${index}()`,
    ),
  }))

describe.skipIf(!isSwiftcAvailable())('package-owned form corpus on swiftc', () => {
  it(
    'typechecks every parent-recorded form fixture with swiftc',
    () => {
      expect(sources).toHaveLength(7)
      const code = sources.map(
        ({ source, file }) => transform(source, { target: 'swift', filename: file }).code,
      )
      const result = validateSwiftFilesWithStubs(code)
      expect(result.error ?? '').toBe('')
      expect(result.ok).toBe(true)
    },
  )

})

describe.skipIf(!isKotlincAvailable())('package-owned form corpus on kotlinc', () => {
  it(
    'compiles every parent-recorded form fixture with kotlinc',
    () => {
      expect(sources).toHaveLength(7)
      const code = sources.map(
        ({ source, file }) => transform(source, { target: 'kotlin', filename: file }).code,
      )
      const result = validateKotlinFiles(code)
      expect(result.error ?? '').toBe('')
      expect(result.ok).toBe(true)
    },
  )
})
