/**
 * Version ordering, and what the tool says when it has nothing to show.
 *
 * `compareVersions` decides which release notes an assistant is handed.
 * A wrong answer is invisible: it returns entries, they look like
 * release notes, and the assistant reports the wrong version's changes —
 * or, with `since`, silently omits the very release the caller asked
 * about. Two shapes cause it and neither throws: a version with fewer
 * segments than its neighbour (`1.0` vs `1.0.0`) hits the `?? 0` pad,
 * and a pre-release must sort BELOW its own release or `0.50.0-rc.1`
 * outranks `0.50.0` and the assistant reads a release candidate's notes
 * as shipped behaviour.
 *
 * The empty-result messages are the other half. "No changes" is a real
 * answer an assistant will act on — it concludes the package has been
 * dormant and stops looking. Both empty branches therefore have to say
 * WHY they are empty and what to do instead: a `since` floor above every
 * entry is a different situation from a package whose whole history is
 * ceremonial version bumps, and collapsing them into one message sends
 * the reader after the wrong thing.
 */
import { describe, expect, it } from 'vitest'
import { compareVersions, filterSince, formatChangelog } from '../changelog'
import type { ChangelogEntry, PackageChangelog } from '../changelog'

const entry = (version: string, change = 'real change'): ChangelogEntry => ({
  version,
  changes: change ? [change] : [],
  dependencyUpdates: [],
  empty: change === '',
})

const pkg = (entries: ChangelogEntry[], packageName = '@pyreon/x'): PackageChangelog =>
  ({ packageName, entries }) as PackageChangelog

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0)

describe('version ordering decides which notes the assistant reads', () => {
  it('orders by each segment in turn', () => {
    // The control.
    expect(sign(compareVersions('1.0.0', '0.9.9'))).toBe(1)
    expect(sign(compareVersions('0.9.9', '1.0.0'))).toBe(-1)
    expect(sign(compareVersions('1.2.0', '1.10.0')), 'numeric, not lexical').toBe(-1)
    expect(sign(compareVersions('1.0.0', '1.0.0'))).toBe(0)
  })

  it('pads a SHORT version with zeroes rather than treating it as missing', () => {
    // `0.50` vs `0.50.1` — a version string a hand-edited changelog
    // heading produces. Without the pad the comparison reads one side as
    // undefined and the ordering is arbitrary.
    expect(sign(compareVersions('1.0', '1.0.0'))).toBe(0)
    expect(sign(compareVersions('1.0', '1.0.1'))).toBe(-1)
    expect(sign(compareVersions('1.0.1', '1.0'))).toBe(1)
    expect(sign(compareVersions('2', '1.9.9'))).toBe(1)
  })

  it('sorts a PRE-RELEASE below its own release', () => {
    // Otherwise `0.50.0-rc.1` outranks `0.50.0` and an assistant reads a
    // release candidate's notes as shipped behaviour.
    expect(sign(compareVersions('0.50.0', '0.50.0-rc.1'))).toBe(1)
    expect(sign(compareVersions('0.50.0-rc.1', '0.50.0'))).toBe(-1)
    expect(sign(compareVersions('0.50.0-alpha.1', '0.50.0-beta.1'))).toBe(-1)
    expect(sign(compareVersions('0.50.0-rc.1', '0.50.0-rc.1'))).toBe(0)
  })

  it('still orders by CORE before considering the pre-release tag', () => {
    // `1.0.0-alpha` is newer than `0.9.9-zzz`; comparing tags first
    // would invert it.
    expect(sign(compareVersions('1.0.0-alpha', '0.9.9-zzz'))).toBe(1)
  })

  it('treats an unparseable segment as 0 rather than NaN', () => {
    // NaN comparisons are all false, so a single bad heading would make
    // the sort silently non-deterministic.
    expect(sign(compareVersions('1.x.0', '1.0.0'))).toBe(0)
    expect(sign(compareVersions('1.x.1', '1.0.0'))).toBe(1)
    expect(Number.isNaN(compareVersions('abc', 'def'))).toBe(false)
  })

  it('filterSince is STRICTLY newer — the floor itself is excluded', () => {
    // Including the floor makes "what changed since I upgraded" report
    // the release the caller already has.
    const kept = filterSince(
      [entry('1.1.0'), entry('1.0.1'), entry('1.0.0'), entry('0.9.0')],
      '1.0.0',
    )
    expect(kept.map((e) => e.version)).toEqual(['1.1.0', '1.0.1'])
  })

  it('filterSince keeps a release above its own pre-release floor', () => {
    expect(filterSince([entry('0.50.0')], '0.50.0-rc.1').map((e) => e.version))
      .toEqual(['0.50.0'])
  })
})

describe('an empty result explains itself instead of reading as "nothing changed"', () => {
  it('shows entries when there are some', () => {
    // The control for both empty branches below.
    const out = formatChangelog(pkg([entry('1.1.0'), entry('1.0.0')]))
    expect(out).toContain('1.1.0')
    expect(out).not.toContain('no changes')
  })

  it('a SINCE floor above everything names the latest and offers the fix', () => {
    // An assistant told only "no changes since v9" concludes the package
    // is dormant. It has to learn that v1.1.0 is the real latest.
    const out = formatChangelog(pkg([entry('1.1.0'), entry('1.0.0')]), { since: '9.0.0' })
    expect(out).toContain('no changes since v9.0.0')
    expect(out).toContain('2 substantive version entries')
    expect(out).toContain('v1.1.0')
    expect(out).toContain('Drop the `since` filter')
  })

  it('gets the singular right for one entry', () => {
    // "1 substantive version entries" is the tell that nobody read the
    // output.
    const out = formatChangelog(pkg([entry('1.0.0')]), { since: '9.0.0' })
    expect(out).toContain('1 substantive version entry')
    expect(out).not.toContain('entry entries')
  })

  it('reports "(none)" rather than undefined when EVERY entry is ceremonial', () => {
    // `nonEmpty[0]?.version` is undefined here; `v undefined` in the
    // message is the shape this guards.
    const out = formatChangelog(pkg([entry('1.0.0', ''), entry('0.9.0', '')]), { since: '9.0.0' })
    expect(out).toContain('(none)')
    expect(out).not.toContain('undefined')
  })

  it('a CEREMONIAL-only history says so and points at the escape hatch', () => {
    // Distinct from the since case: nothing was filtered out, the
    // package genuinely only ever received dependency bumps. The next
    // step is different, so the message must be.
    const out = formatChangelog(pkg([entry('1.0.2', ''), entry('1.0.1', ''), entry('1.0.0', '')]))
    expect(out).toContain('no substantive changes')
    expect(out).toContain('3 version entries')
    expect(out).toContain('1.0.2, 1.0.1, 1.0.0')
    expect(out).toContain('includeDependencyUpdates: true')
    expect(out, 'this is not a since-filter problem').not.toContain('Drop the `since` filter')
  })

  it('elides past three ceremonial versions AUDIBLY', () => {
    // A truncated list reads as the complete history.
    const many = Array.from({ length: 8 }, (_, i) => entry(`1.0.${8 - i}`, ''))
    const out = formatChangelog(pkg(many))
    expect(out).toContain('8 version entries')
    expect(out).toContain(', …')
  })

  it('does not claim an elision at exactly three', () => {
    const out = formatChangelog(pkg([entry('1.0.2', ''), entry('1.0.1', ''), entry('1.0.0', '')]))
    expect(out).not.toContain(', …')
  })

  it('gets the singular right for one ceremonial entry', () => {
    expect(formatChangelog(pkg([entry('1.0.0', '')]))).toContain('1 version entry')
  })
})

describe('the normal path reports how much it is showing', () => {
  it('states shown-of-total so a truncated view is never mistaken for all of it', () => {
    const many = Array.from({ length: 10 }, (_, i) => entry(`1.0.${10 - i}`))
    const out = formatChangelog(pkg(many), { limit: 3 })
    expect(out).toContain('(3/10 shown)')
  })

  it('names the floor in the heading when since is given', () => {
    const out = formatChangelog(pkg([entry('1.1.0'), entry('1.0.0')]), { since: '1.0.0' })
    expect(out).toContain('since v1.0.0')
    expect(out).toContain('(1/1 shown)')
  })

  it('drops ceremonial entries from the count', () => {
    // Counting them makes "5 shown" mean five headings, four of which
    // are blank.
    const out = formatChangelog(pkg([entry('1.1.0'), entry('1.0.5', ''), entry('1.0.0')]))
    expect(out).toContain('(2/2 shown)')
  })
})
