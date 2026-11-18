/**
 * The manifest documents every runtime export of every entry, and nothing else. `@pyreon/time/core` is re-exported by
 * `@pyreon/time`, so those names are documented once. `@pyreon/time/fp` documents a curried function that shares a name with a
 * value-first one as `fp.<name>`; a name with no namesake (`by`, `pipe`, `diffFrom`, ...) is documented under its own name; the
 * names `fp` re-exports unchanged (`dayOfWeek`, `isPlainDate`, ...) are the same functions as the main entry's.
 */
import * as core from '../core'
import * as fp from '../fp'
import * as main from '../index'
import manifest from '../manifest'

const documented = new Set<string>(manifest.api.filter((a) => a.kind !== 'type').map((a) => a.name))
const mainNames = new Set<string>([...Object.keys(core), ...Object.keys(main)])
const fpNames = Object.keys(fp)

describe('the manifest documents exactly the runtime exports of the entries (types excluded)', () => {
  it('every runtime export of @pyreon/time and @pyreon/time/core is documented', () => {
    expect([...mainNames].filter((n) => !documented.has(n)).sort()).toEqual([])
  })

  it('every runtime export of @pyreon/time/fp is documented: as fp.<name>, under its own name, or as the main entry\'s same function', () => {
    const missing = fpNames.filter((n) => !documented.has(`fp.${n}`) && !documented.has(n))

    expect(missing.sort()).toEqual([])
    // a name that exists only in fp is documented under its own name, never hidden behind the prefix
    expect(fpNames.filter((n) => !mainNames.has(n) && !documented.has(n)).sort()).toEqual([])
  })

  it('nothing is documented that no entry exports', () => {
    const extra = [...documented].filter((n) => {
      const bare = n.startsWith('fp.') ? n.slice(3) : n

      return n.startsWith('fp.') ? !fpNames.includes(bare) : !mainNames.has(bare) && !fpNames.includes(bare)
    })

    expect(extra.sort()).toEqual([])
  })
})
