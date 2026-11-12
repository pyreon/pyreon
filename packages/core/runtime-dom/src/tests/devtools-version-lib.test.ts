/**
 * #4445, on the SHIPPED build: mounting through `lib/index.js` installs a hook
 * whose `version` is the package version. The build inlines the named
 * `package.json` import as a string literal (shared with `registerSingleton`),
 * so no JSON module reaches a client bundle; this file also checks that.
 *
 * Reads `lib/`: after a source edit run `bun scripts/bootstrap.ts` first.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { h } from '@pyreon/core'
import { hasBuiltLib } from '@pyreon/test-utils/built-lib'
import pkg from '../../package.json' with { type: 'json' }

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib')
const built = hasBuiltLib(join(LIB, 'index.js'), 'the built devtools hook version')

describe.skipIf(!built)('devtools hook version — built lib', () => {
  it('mount() from lib installs a hook carrying the package version', async () => {
    // A computed specifier: a literal one would pull `lib/` into this package's
    // type-check program.
    const lib = (await import(
      /* @vite-ignore */ pathToFileURL(join(LIB, 'index.js')).href
    )) as typeof import('../index')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = lib.mount(h('p', null, 'x'), host)
    const hook = (window as unknown as { __PYREON_DEVTOOLS__: { version: string } })
      .__PYREON_DEVTOOLS__
    expect(hook.version).toBe(pkg.version)
    dispose()
    host.remove()
  })

  it('the output inlines the version and imports no package.json', () => {
    const files = [
      'index.js',
      ...readdirSync(join(LIB, '_chunks'))
        .filter((f) => f.endsWith('.js'))
        .map((f) => join('_chunks', f)),
    ]
    const all = files.map((f) => readFileSync(join(LIB, f), 'utf8')).join('\n')
    expect(all).toContain(`var version = ${JSON.stringify(pkg.version)}`)
    expect(all).not.toMatch(/["']0\.1\.0["']/)
    expect(all).not.toMatch(/from ["'][^"']*package\.json["']/)
  })
})
