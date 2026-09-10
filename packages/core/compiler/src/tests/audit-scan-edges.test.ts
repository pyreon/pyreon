/**
 * What the project audits SCAN, and how they report it.
 *
 * These are whole-project detectors — islands, SSG routes, native
 * multiplatform, the route/component scanner. All four share a failure mode
 * the repo has already been bitten by twice: a detector whose scan misses the
 * files it is about reports nothing, and nothing renders as a clean bill of
 * health. `pyreon doctor` turns that into a score, so an audit that walks the
 * wrong tree does not merely fail to help — it certifies the project.
 *
 * So the scan surface gets both directions per rule: the file that MUST be
 * found, and the file that must be skipped. The skips matter as much: an audit
 * that descends into `node_modules` reports findings the author cannot fix and
 * takes minutes doing it, which is how a gate gets switched off.
 *
 * The formatters are here for the same reason. A finding an operator cannot
 * read is a finding nobody acts on, and `--json` is the surface the doctor and
 * any CI wrapper consume — prose there breaks every parser downstream.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { auditIslands, formatIslandAudit } from '../island-audit'
import { auditSsg, formatSsgAudit } from '../ssg-audit'
import { auditNative, detectNativePatterns } from '../native-audit'

let root: string

const write = (rel: string, body: string): string => {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
  return abs
}

/** A monorepo-shaped fixture: the audits anchor on a `packages/` directory. */
const repo = (): void => {
  mkdirSync(join(root, 'packages'), { recursive: true })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-audit-edges-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the islands audit scans the right files and no others', () => {
  const island = (name: string, hydrate = 'load') =>
    `import { island } from '@pyreon/server/client'\n` +
    `export const W = island(() => import('./widget'), { name: '${name}', hydrate: '${hydrate}' })\n`

  it('finds a declaration under packages/', () => {
    // The control. Every "does not scan X" assertion below is worthless
    // against an audit that scans nothing at all.
    repo()
    write('packages/app/src/a.tsx', island('one'))
    const r = auditIslands(root)
    expect(r.summary.islandsDeclared, 'the declaration is seen').toBe(1)
    expect(r.summary.filesScanned).toBeGreaterThan(0)
  })

  it('finds a declaration under examples/ too', () => {
    // The audit walks both trees; examples are where island strategies are
    // demonstrated, so missing them halves the coverage.
    repo()
    write('examples/demo/src/a.tsx', island('one'))
    expect(auditIslands(root).summary.islandsDeclared).toBe(1)
  })

  it('SKIPS dotdirs', () => {
    // `.next`, `.cache`, `.git` hold generated copies of the same source. An
    // island found twice reports a duplicate-name finding against itself.
    repo()
    write('packages/app/.cache/a.tsx', island('cached'))
    expect(auditIslands(root).summary.islandsDeclared).toBe(0)
  })

  it('reports NO ROOT when there is no packages/ directory', () => {
    // Run outside the monorepo. Reporting an empty clean result there is the
    // false-green shape; the formatter has to say the scan found nothing to
    // anchor on.
    const r = auditIslands(root)
    expect(r.root).toBeNull()
    expect(formatIslandAudit(r)).toContain('No monorepo root')
  })

  it('reads a hydrate strategy given as a template literal', () => {
    // `hydrate: \`visible\`` is legal and appears in generated code. Reading it
    // as the default would silently reclassify the strategy — and the
    // never-with-registry rule keys on exactly that value.
    repo()
    write(
      'packages/app/src/a.tsx',
      "import { island } from '@pyreon/server/client'\n" +
        'export const W = island(() => import(`./widget`), { name: `tpl`, hydrate: `never` })\n',
    )
    write(
      'packages/app/src/entry.ts',
      "import { hydrateIslands } from '@pyreon/server/client'\nhydrateIslands({ tpl: () => import('./a') })\n",
    )
    expect(auditIslands(root).findings.map((f) => f.code)).toContain('never-with-registry-entry')
  })

  it('normalizes an `interaction:click` strategy to `interaction`', () => {
    // The strategy accepts a suffixed form. Treating `interaction:click` as a
    // distinct value would make every rule that compares against `interaction`
    // silently miss it.
    repo()
    write('packages/app/src/a.tsx', island('x', 'interaction:click'))
    expect(() => auditIslands(root)).not.toThrow()
    expect(auditIslands(root).summary.islandsDeclared).toBe(1)
  })

  it('reports a registry entry naming an island that does not exist', () => {
    // A rename that updated the declaration and not the registry. At runtime
    // the island silently never hydrates.
    repo()
    write('packages/app/src/a.tsx', island('real'))
    write(
      'packages/app/src/entry.ts',
      "import { hydrateIslands } from '@pyreon/server/client'\nhydrateIslands({ typo: () => import('./a') })\n",
    )
    expect(auditIslands(root).findings.map((f) => f.code)).toContain('registry-mismatch')
  })

  it('formats findings as readable text, with a header per code', () => {
    repo()
    write('packages/app/src/a.tsx', island('dup'))
    write('packages/app/src/b.tsx', island('dup'))
    const out = formatIslandAudit(auditIslands(root))
    expect(out).toContain('duplicate-name')
    expect(out, 'and explain the consequence').toContain('only the first hydrates')
  })

  it('formats a CLEAN result without claiming findings', () => {
    repo()
    write('packages/app/src/a.tsx', island('solo'))
    write(
      'packages/app/src/entry.ts',
      "import { hydrateIslands } from '@pyreon/server/client'\nhydrateIslands({ solo: () => import('./a') })\n",
    )
    const out = formatIslandAudit(auditIslands(root))
    expect(out).toContain('✓')
  })

  it('emits parseable JSON with --json', () => {
    // The doctor and any CI wrapper read this. Prose here breaks them.
    repo()
    write('packages/app/src/a.tsx', island('one'))
    const out = formatIslandAudit(auditIslands(root), { json: true })
    const parsed = JSON.parse(out) as { summary: { islandsDeclared: number } }
    expect(parsed.summary.islandsDeclared).toBe(1)
  })

  it('pluralises its header counts', () => {
    // A header reading "1 declarations" is the kind of detail that makes a
    // tool feel unmaintained, and it is one ternary.
    repo()
    write('packages/app/src/a.tsx', island('one'))
    const one = formatIslandAudit(auditIslands(root))
    expect(one).toMatch(/1 `island\(\)` declaration\b/)
    expect(one).not.toContain('1 `island()` declarations')
    write('packages/app/src/b.tsx', island('two'))
    expect(formatIslandAudit(auditIslands(root))).toContain('2 `island()` declarations')
  })
})

describe('the SSG audit finds route files, and only route files', () => {
  /**
   * A route file under an app whose vite config declares `mode: 'ssg'`.
   *
   * The config is not decoration: every rule in this audit is scoped to SSG
   * apps, because a dynamic route with no enumerator is perfectly correct in
   * an SPA/SSR/ISR app. Omitting it would make every spec below pass against
   * an audit that reports nothing at all.
   */
  const routes = (rel: string, body: string) => {
    write('packages/app/vite.config.ts', "export default { mode: 'ssg' }\n")
    return write(`packages/app/src/routes/${rel}`, body)
  }

  it('reports a dynamic route with no getStaticPaths', () => {
    // The control, and the finding this audit exists for: under `mode: 'ssg'`
    // a dynamic route with no enumerator is never prerendered, so production
    // serves a 404 for a page the author believes exists.
    repo()
    routes('[id].tsx', 'export default function P() { return null }\n')
    const r = auditSsg(root)
    expect(r.findings.map((f) => f.code)).toContain('dynamic-route-missing-get-static-paths')
  })

  it('stays QUIET when getStaticPaths is present', () => {
    repo()
    routes(
      '[id].tsx',
      'export const getStaticPaths = () => [{ id: "1" }]\nexport default function P() { return null }\n',
    )
    expect(auditSsg(root).findings.map((f) => f.code)).not.toContain(
      'dynamic-route-missing-get-static-paths',
    )
  })

  it('stays quiet for a route that opted OUT of prerendering', () => {
    // `renderMode = 'spa'` is exactly the remedy the finding recommends.
    // Firing on it is a gate telling the author to do what they just did.
    repo()
    routes(
      '[id].tsx',
      "export const renderMode = 'spa'\nexport default function P() { return null }\n",
    )
    expect(auditSsg(root).findings.map((f) => f.code)).not.toContain(
      'dynamic-route-missing-get-static-paths',
    )
  })

  it('stays quiet for an API route', () => {
    // An API route is runtime-only by definition; `getStaticPaths` does not
    // apply. This is the false positive that shipped once already.
    repo()
    routes('api/[...path].ts', 'export function GET() { return new Response("ok") }\n')
    expect(auditSsg(root).findings).toEqual([])
  })

  it('stays quiet for a bracket-named file with NO default export', () => {
    // A method-handler-only file is an API route by structure wherever it
    // sits — the second half of the same guard, so a rename cannot reopen it.
    repo()
    routes('[id].ts', 'export function GET() { return new Response("ok") }\n')
    expect(auditSsg(root).findings).toEqual([])
  })

  it('reports a NON-LITERAL revalidate export', () => {
    // The build-time extractor takes a numeric literal or `false`. Anything
    // else is silently dropped from the ISR manifest, so the route never
    // revalidates and nothing says why.
    repo()
    routes(
      'post.tsx',
      'const TTL = 60\nexport const revalidate = TTL\nexport default function P() { return null }\n',
    )
    expect(auditSsg(root).findings.map((f) => f.code)).toContain('non-literal-revalidate-export')
  })

  it('accepts a literal revalidate', () => {
    repo()
    routes('post.tsx', 'export const revalidate = 60\nexport default function P() { return null }\n')
    expect(auditSsg(root).findings.map((f) => f.code)).not.toContain(
      'non-literal-revalidate-export',
    )
  })

  it('accepts `revalidate = false`', () => {
    repo()
    routes(
      'post.tsx',
      'export const revalidate = false\nexport default function P() { return null }\n',
    )
    expect(auditSsg(root).findings.map((f) => f.code)).not.toContain(
      'non-literal-revalidate-export',
    )
  })

  it('formats findings readably, naming the export that is missing', () => {
    // The finding is only actionable if it says WHICH export to add; "this
    // route is not prerendered" sends the reader to the docs.
    repo()
    routes('[id].tsx', 'export default function P() { return null }\n')
    const out = formatSsgAudit(auditSsg(root))
    expect(out).toContain('getStaticPaths')
    expect(out, 'and report what it scanned').toMatch(/route file\(s\)/)
  })

  it('formats a clean result without inventing findings', () => {
    repo()
    routes('index.tsx', 'export default function P() { return null }\n')
    expect(formatSsgAudit(auditSsg(root))).toContain('✓')
  })

  it('falls back to the given directory when there is no packages/ above it', () => {
    // Unlike the islands audit, this one anchors on the directory it was
    // handed rather than refusing — a single-app repo has no `packages/` and
    // is still worth auditing. What it must NOT do is scan nothing and
    // report clean.
    write('src/routes/[id].tsx', 'export default function P() { return null }\n')
    write('vite.config.ts', "export default { mode: 'ssg' }\n")
    const r = auditSsg(root)
    expect(r.root, 'anchored on the given dir').toBe(root)
    expect(r.summary.routesScanned, 'and it actually scanned').toBeGreaterThan(0)
    expect(r.findings.map((f) => f.code)).toContain('dynamic-route-missing-get-static-paths')
  })

  it('stays quiet for a dynamic route in an app that is NOT ssg', () => {
    // The scoping rule: an SPA or SSR app never prerenders, so a dynamic
    // route with no enumerator is correct there. Firing anyway would make the
    // audit unusable for every app that is not SSG — which is most of them.
    repo()
    write('packages/app/vite.config.ts', "export default { mode: 'ssr' }\n")
    write('packages/app/src/routes/[id].tsx', 'export default function P() { return null }\n')
    expect(auditSsg(root).findings.map((f) => f.code)).not.toContain(
      'dynamic-route-missing-get-static-paths',
    )
  })
})

describe('the native audit reports what cannot cross to iOS/Android', () => {
  const shared = (body: string) => detectNativePatterns(`import '@pyreon/primitives'\n${body}`, 'shared.tsx')

  it('names a WEB-ONLY import in a shared-source file', () => {
    // The control. A shared file importing a web-only package compiles on the
    // web and produces a native app missing that feature, with the loss
    // reported nowhere unless this audit says so.
    const diags = shared("import { mount } from '@pyreon/runtime-dom'\nexport const x = mount\n")
    expect(diags.length).toBeGreaterThan(0)
    expect(diags[0]?.message).toContain('@pyreon/runtime-dom')
  })

  it('stays SILENT in a file that is not shared source', () => {
    // The audit is scoped by the `@pyreon/primitives` import — the marker that
    // says "this file is meant to cross". Reporting on every web file would
    // bury the findings that matter under the whole app.
    expect(
      detectNativePatterns("import { mount } from '@pyreon/runtime-dom'\n", 'web-only.tsx'),
    ).toEqual([])
  })

  it('reports an ENUM, which has no native counterpart', () => {
    // A TS enum lowers to a runtime object the native emitters cannot
    // represent. The message has to name the alternative, or the author is
    // told only that their code is wrong.
    const diags = shared('export enum Mode { A, B }\n')
    const enumDiag = diags.find((d) => /enum/i.test(d.message))
    expect(enumDiag, 'the enum is reported').toBeTruthy()
    // The remedy travels WITH the finding, in `suggested` — a diagnostic that
    // says only "this is unsupported" leaves the author to guess, and the
    // guess for an enum is usually a class, which is also unsupported.
    expect(enumDiag?.suggested).toContain('string-literal union')
  })

  it('reports a CLASS, and points at the shape that does cross', () => {
    const diags = shared('export class Store { x = 1 }\n')
    const classDiag = diags.find((d) => /class/i.test(d.message))
    expect(classDiag, 'the class is reported').toBeTruthy()
    expect(classDiag?.suggested).toContain('defineStore')
  })

  it('names an ANONYMOUS declaration rather than printing undefined', () => {
    const diags = shared('export default class { x = 1 }\n')
    expect(diags.some((d) => d.message.includes('<anonymous>'))).toBe(true)
  })

  it('orders diagnostics by position, so two runs read the same', () => {
    const diags = shared('export class B { x = 1 }\nexport enum A { X }\n')
    const keys = diags.map((d) => d.line * 1000 + d.column)
    expect(keys).toEqual([...keys].sort((a, b) => a - b))
  })

  it('reports NOTHING for a shared file that is genuinely portable', () => {
    // The quiet direction: an audit that fires on portable code gets ignored.
    expect(shared("import { signal } from '@pyreon/reactivity'\nexport const c = signal(0)\n")).toEqual(
      [],
    )
  })

  it('walks a whole TREE and counts the shared files it found', () => {
    // The project-level entry. A walk that finds nothing reports a clean
    // multiplatform story for an app that has never been checked.
    repo()
    write(
      'packages/app/src/shared.tsx',
      "import '@pyreon/primitives'\nimport { mount } from '@pyreon/runtime-dom'\nexport const x = mount\n",
    )
    write('packages/app/src/web.tsx', "import { mount } from '@pyreon/runtime-dom'\nexport const y = mount\n")
    const r = auditNative(root)
    expect(r.summary.multiplatformFiles, 'one shared file, not two').toBe(1)
    expect(r.findings.map((f) => f.code)).toContain('web-only-package-import')
  })

  it('skips node_modules, build output and test directories while walking', () => {
    // Findings in a dependency are not the author\'s to fix, and a walk into
    // `node_modules` takes minutes.
    repo()
    const bad = "import '@pyreon/primitives'\nimport { mount } from '@pyreon/runtime-dom'\nexport const x = mount\n"
    write('packages/app/node_modules/dep/src/a.tsx', bad)
    write('packages/app/lib/a.tsx', bad)
    write('packages/app/dist/a.tsx', bad)
    write('packages/app/src/__tests__/a.tsx', bad)
    write('packages/app/.cache/a.tsx', bad)
    expect(auditNative(root).summary.multiplatformFiles).toBe(0)
  })
})
