/**
 * `@pyreon/native-compiler/audit` must stay LIGHT.
 *
 * `pyreon doctor --check-native` and the MCP `validate` tool load it lazily on
 * the strength of one promise: it needs only `oxc-parser` and the web-only
 * package map, not the Swift/Kotlin emitters (hundreds of KB, and the reason a
 * separate entry exists at all). That promise is a property of the entry's
 * import graph, so it is asserted there -- not on a size that would drift.
 *
 * Method: bundle each entry with esbuild (`packages: 'external'`) and read the
 * metafile. The MAIN entry is the positive control: if it stopped pulling the
 * emitters in, "the audit entry has none" would be vacuous.
 *
 * Bisect-verify: add `import './emit-swift'` to `src/native-audit.ts` -> the
 * audit-entry spec fails naming `emit-swift`.
 */
import { build } from 'esbuild'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

async function inputsOf(entry: string): Promise<string[]> {
  const r = await build({
    entryPoints: [join(SRC, entry)],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'silent',
  })
  return Object.keys(r.metafile.inputs).map((p) => relative(SRC, join(SRC, '..', p)))
}

describe('@pyreon/native-compiler/audit entry graph', () => {
  it('is exactly the audit, its entry and the shared web-only map', async () => {
    const inputs = (await inputsOf('audit.ts')).sort()
    expect(inputs).toEqual(['audit.ts', 'native-audit.ts', 'web-only-packages.ts'])
  })

  it('the main entry DOES pull the emitters (positive control)', async () => {
    const inputs = await inputsOf('index.ts')
    expect(inputs.some((f) => f.includes('emit-swift'))).toBe(true)
    expect(inputs.some((f) => f.includes('emit-kotlin'))).toBe(true)
  })

  it('the parser and the audit read the SAME map module, not two copies', async () => {
    expect(await inputsOf('index.ts')).toContain('web-only-packages.ts')
    expect(await inputsOf('audit.ts')).toContain('web-only-packages.ts')
  })
})
