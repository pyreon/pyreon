/**
 * `atlas build`'s pure emitters: the page writer, the site shell, the entry.
 *
 * `static.ts` shipped at 0% — the whole `atlas build` command, whose output
 * is a directory someone DEPLOYS. Two of the things it does are
 * security-relevant and were guarded in code but asserted nowhere:
 *
 *   * **A component id becomes a directory name.** The ids come from
 *     `componentKey`, which slugifies, so in practice they are safe — but
 *     the guard exists because "in practice" is not a property, and the
 *     failure mode is writing an `index.html` outside the output directory.
 *     A build is often run against a checkout in CI with write access to
 *     more than `atlas-dist`.
 *   * **`--title` is user input rendered into the page.** It reaches
 *     `<title>` in the shell (an HTML context) and a string literal in the
 *     entry module (a JS context), and the two need different escaping.
 *     Getting either wrong puts attacker-controlled markup or code into a
 *     site the team then hosts.
 *
 * The rest is graceful-degradation behaviour whose whole point is that it
 * does NOT throw — which is exactly the shape that rots silently, because
 * a broken version and a working one both "succeed".
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emitComponentPages, staticEntry, staticHtml } from '../static'

let root: string
let out: string
let logs: string[]
const log = (m: string): void => void logs.push(m)

beforeEach(() => {
  // `out` is a subdirectory of a root this test OWNS, so `..` from inside it
  // resolves somewhere disposable. The first draft used the mkdtemp dir
  // itself, which made `../escaped` land in the SHARED system tmpdir — so a
  // bisect run that legitimately created it (guard removed) leaked into the
  // next run and failed a spec for the previous run's reasons. A test that
  // asserts on a directory it does not own is not isolated.
  root = mkdtempSync(join(tmpdir(), 'atlas-static-'))
  out = join(root, 'dist')
  mkdirSync(out, { recursive: true })
  logs = []
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const withShell = (html = '<html><body>shell</body></html>'): void =>
  writeFileSync(join(out, 'index.html'), html, 'utf8')

describe('emitComponentPages writes one page per component', () => {
  it('copies the built shell into <id>/index.html for each id', () => {
    // The control: every "refuses X" spec below would pass against a
    // function that writes nothing at all.
    withShell()
    const written = emitComponentPages(out, ['button', 'card'], '/', log)

    expect(written).toBe(2)
    expect(readFileSync(join(out, 'button', 'index.html'), 'utf8')).toContain('shell')
    expect(readFileSync(join(out, 'card', 'index.html'), 'utf8')).toContain('shell')
  })

  it('REFUSES an id that would escape the output directory', () => {
    // A directory name built from a value that carries a separator or a
    // parent reference writes outside `outDir`. The ids are slugified
    // upstream, so this is defence in depth — and defence in depth that
    // nothing tests is just a comment.
    withShell()
    const written = emitComponentPages(
      out,
      ['..', '../escaped', 'a/b', 'a\\b', '.', ''],
      '/',
      log,
    )

    expect(written, 'not one unsafe id may be written').toBe(0)
    expect(logs.filter((l) => l.includes('unsafe id'))).toHaveLength(6)

    // Nothing may have appeared beside the output directory either. `root`
    // is fresh per test and holds only `dist`, so anything ELSE in it was
    // written by an id that escaped.
    expect(readdirSync(root), 'nothing may be written outside outDir').toEqual(['dist'])
    expect(readdirSync(out), 'only the shell remains').toEqual(['index.html'])
  })

  it('writes the SAFE ids in a batch that also contains unsafe ones', () => {
    // A guard that bailed on the whole batch would silently drop every
    // legitimate page because one id was malformed.
    withShell()
    const written = emitComponentPages(out, ['good', '../bad', 'alsogood'], '/', log)
    expect(written).toBe(2)
    expect(readdirSync(out).sort()).toEqual(['alsogood', 'good', 'index.html'])
  })

  it('emits nothing for a RELATIVE base, and says why', () => {
    // Per-component pages live one directory deep, so their asset
    // references resolve against the wrong place under a relative base.
    // Emitting them anyway would produce pages that load a blank screen —
    // worse than not emitting them, because the URLs then exist.
    withShell()
    const written = emitComponentPages(out, ['button'], './', log)

    expect(written).toBe(0)
    expect(readdirSync(out), 'no directories created').toEqual(['index.html'])
    const msg = logs.join('\n')
    expect(msg, 'the reason must be stated').toContain('relative')
    expect(msg, 'and the remedy').toContain('absolute --base')
  })

  it('accepts a subdirectory base like /my-repo/', () => {
    // The GitHub Pages project-site case, and the reason the check is
    // `startsWith('/')` rather than `=== '/'`.
    withShell()
    expect(emitComponentPages(out, ['button'], '/my-repo/', log)).toBe(1)
  })

  it('degrades when the built index.html is missing', () => {
    // A genuinely broken state — the build just wrote it — so this reports
    // rather than papering over, and must not throw out of the build.
    let written = -1
    expect(() => {
      written = emitComponentPages(out, ['button'], '/', log)
    }).not.toThrow()
    expect(written).toBe(0)
    expect(logs.join('\n')).toContain('could not read the built index.html')
  })

  it('returns 0 for an empty component list without creating anything', () => {
    withShell()
    expect(emitComponentPages(out, [], '/', log)).toBe(0)
    expect(readdirSync(out)).toEqual(['index.html'])
  })

  it('overwrites a page from a previous build rather than failing', () => {
    // `mkdirSync(..., { recursive: true })` on an existing dir must not
    // throw, or a second build of the same output directory dies.
    withShell('<html>v1</html>')
    emitComponentPages(out, ['button'], '/', log)
    withShell('<html>v2</html>')
    expect(emitComponentPages(out, ['button'], '/', log)).toBe(1)
    expect(readFileSync(join(out, 'button', 'index.html'), 'utf8')).toContain('v2')
  })
})

describe('the site shell escapes its title', () => {
  const baked = { entries: [], warnings: [] } as unknown as Parameters<typeof staticHtml>[1]

  it('renders an ordinary title', () => {
    // The control.
    expect(staticHtml('Design System', baked)).toContain('<title>Design System</title>')
  })

  it('neutralises markup in a title', () => {
    // `--title` is user input rendered straight into an HTML context. A
    // title carrying a tag would put attacker-controlled markup into a
    // site the team hosts and shares.
    const html = staticHtml('</title><script>alert(1)</script>', baked)

    expect(html, 'no live script may be formed').not.toContain('<script>alert(1)</script>')
    expect(html, 'and the title element may not be closed early').not.toContain('</title><script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes all five characters that matter', () => {
    // Quotes matter because the same helper guards attribute contexts;
    // escaping only the angle brackets is the common half-fix.
    const html = staticHtml(`a & b < c > d " e ' f`, baked)
    const line = html.split('\n').find((l) => l.includes('<title>'))!
    expect(line).toContain('&amp;')
    expect(line).toContain('&lt;')
    expect(line).toContain('&gt;')
    expect(line).toContain('&quot;')
    expect(line).toContain('&#39;')
    expect(line, 'no raw angle bracket survives inside the title').toMatch(
      /<title>[^<>]*<\/title>/,
    )
  })

  it('escapes the ampersand FIRST, so an escape is not double-escaped', () => {
    // Replacing `<` before `&` turns a literal `&lt;` typed by the user
    // into `&amp;lt;` — and, worse, ordering the other way can re-escape
    // the ampersands the earlier replacements just introduced.
    const html = staticHtml('&lt;', baked)
    expect(html).toContain('<title>&amp;lt;</title>')
  })

  it('is a complete document with the mount root and the entry script', () => {
    const html = staticHtml('T', baked)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('id="atlas-root"')
    expect(html, 'a RELATIVE entry src, so a subdirectory base works').toContain(
      'src="./entry.js"',
    )
  })
})

describe('the generated entry is valid JS for any title', () => {
  it('embeds the title as a JS string literal, not raw', () => {
    // The entry is a module, so an unescaped quote or newline in the title
    // is a syntax error and the whole site fails to boot — from a value a
    // user typed on the command line.
    const code = staticEntry(`it's "quoted"\nand multiline`)
    expect(code).toContain(JSON.stringify(`it's "quoted"\nand multiline`))
    expect(code, 'no raw newline inside the literal').not.toMatch(/title: '[^']*\n/)
  })

  it('a title containing a script-close sequence cannot break out', () => {
    // The entry is emitted as a real .js file rather than inline, but the
    // literal must still survive JSON encoding intact.
    const code = staticEntry('</script>')
    expect(code).toContain(JSON.stringify('</script>'))
  })

  it('mounts the Workbench into the shell\'s root element', () => {
    const code = staticEntry('T')
    expect(code).toContain("getElementById('atlas-root')")
    expect(code).toContain('mount(')
    expect(code, 'guards a missing root rather than throwing on boot').toContain('if (root)')
  })
})
