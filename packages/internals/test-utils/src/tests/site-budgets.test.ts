/**
 * The site route budgets (`scripts/site-budgets.ts`, `check-site-budgets`).
 *
 * What they replace. The JavaScript a pyreon.dev page loads was a KB constant
 * in two e2e specs, compared on every pull request. On 2026-11-17
 * `/why/components-run-once` measured 84,961 B on the default branch against
 * 83 KB (84,992 B): 31 bytes of room. Three open pull requests that touched
 * runtime-dom, the server and the compiler (not the site) each added a few
 * hundred bytes, measured 83.1 to 83.3 KB and failed a required e2e cell. The
 * bytes that used the room up were three site pull requests merged that day,
 * each green.
 *
 * So these pages are judged like every other size: a pull request on its own
 * growth against the commit it merges into, the ceiling on the default branch.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { selectSuites } from '../../../../../scripts/e2e-affected'
import { judgeSiteSizes, routeHtml, SHELL, shellBytes, SITE, siteIds } from '../../../../../scripts/site-budgets'
import { ceilingFor, growthAllowance, movesSiteSizes, ROUTE_NOISE_BYTES } from '../../../../../scripts/size-budget-policy'
import { ceilingFile, loadCeilings, sizeBudgetsDir, writeCeiling } from '../../../../../scripts/size-budget-store'

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..')
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-site-budgets.ts')

const PAGE = 'docs:/why/components-run-once'
/** The page on the default branch on 2026-11-17, and the number the spec held. */
const ON_MAIN = 84_961
const OLD_BUDGET = 83 * 1024

const failures = (r: { lines: string[] }): string[] => r.lines.filter((l) => l.startsWith('  ✗'))

describe('a pull request is judged on the bytes IT adds to a page', () => {
  it('the 2026-11-17 failure: a few hundred bytes from an unrelated change pass', () => {
    const ceilings = { [PAGE]: ceilingFor(ON_MAIN) }
    for (const added of [120, 230, 340]) {
      const r = judgeSiteSizes({ [PAGE]: ON_MAIN + added }, ceilings, 'pr', { sizes: { [PAGE]: ON_MAIN }, ceilings })
      expect(r.failed, `+${added} B`).toBe(0)
    }
    // The same three sizes against the constant the spec held: all over it.
    for (const added of [120, 230, 340]) expect(ON_MAIN + added).toBeGreaterThan(OLD_BUDGET)
  })

  it('growth over the allowance FAILS, however much room the ceiling has', () => {
    const ceilings = { [PAGE]: 200_000 }
    const added = growthAllowance(ON_MAIN) + 1
    const r = judgeSiteSizes({ [PAGE]: ON_MAIN + added }, ceilings, 'pr', { sizes: { [PAGE]: ON_MAIN }, ceilings })
    expect(r.failed).toBe(1)
    expect(failures(r)[0]).toContain(`this change adds +${added} B`)
    expect(failures(r)[0]).toContain(`--update=${PAGE}`)
  })

  it('the same growth PASSES when the change sets that page’s ceiling', () => {
    const size = ON_MAIN + growthAllowance(ON_MAIN) + 1
    const r = judgeSiteSizes({ [PAGE]: size }, { [PAGE]: ceilingFor(size) }, 'pr', {
      sizes: { [PAGE]: ON_MAIN },
      ceilings: { [PAGE]: 200_000 },
    })
    expect(r.failed).toBe(0)
    expect(r.lines.join('\n')).toContain('accepted by this change')
  })

  it('drift from OTHER merges does not fail a change that added nothing', () => {
    // The default branch is already over the ceiling; this change did not move the page.
    const ceilings = { [PAGE]: OLD_BUDGET }
    const over = OLD_BUDGET + 900
    const r = judgeSiteSizes({ [PAGE]: over + ROUTE_NOISE_BYTES }, ceilings, 'pr', { sizes: { [PAGE]: over }, ceilings })
    expect(r.failed).toBe(0)
    expect(r.lines.join('\n')).toContain('on the base already')
  })

  it('a change that ADDS to a page that ends over its ceiling fails', () => {
    const ceilings = { [PAGE]: OLD_BUDGET }
    const r = judgeSiteSizes({ [PAGE]: ON_MAIN + 340 }, ceilings, 'pr', { sizes: { [PAGE]: ON_MAIN }, ceilings })
    expect(r.failed).toBe(1)
  })

  it('nothing that can move a page changed (`sizes: null`): nothing grew', () => {
    const ceilings = { [PAGE]: ceilingFor(ON_MAIN) }
    expect(judgeSiteSizes({ [PAGE]: ON_MAIN }, ceilings, 'pr', { sizes: null, ceilings }).failed).toBe(0)
  })

  it('without a base there is no verdict: it throws', () => {
    expect(() => judgeSiteSizes({ [PAGE]: ON_MAIN }, { [PAGE]: 200_000 }, 'pr', undefined)).toThrow(/needs the base measurement/)
  })
})

describe('the default branch is judged against the ceiling', () => {
  it('a page over its ceiling is RED', () => {
    const r = judgeSiteSizes({ [PAGE]: OLD_BUDGET + ROUTE_NOISE_BYTES + 1 }, { [PAGE]: OLD_BUDGET }, 'main', undefined)
    expect(r.failed).toBe(1)
    expect(failures(r)[0]).toContain('is over its ceiling')
  })

  it('inside the measuring noise of its ceiling passes', () => {
    expect(judgeSiteSizes({ [PAGE]: OLD_BUDGET + ROUTE_NOISE_BYTES }, { [PAGE]: OLD_BUDGET }, 'main', undefined).failed).toBe(0)
  })

  it('a local run reports and leaves the verdict to CI', () => {
    expect(judgeSiteSizes({ [PAGE]: OLD_BUDGET + 5000 }, { [PAGE]: OLD_BUDGET }, 'local', undefined).failed).toBe(0)
  })
})

describe('a ceiling that guards nothing fails in every mode', () => {
  // The spec held a number for /blog/tags/signals, a page that was never
  // built: its test loaded the 404 page and passed.
  it.each(['pr', 'main', 'local'] as const)('%s: a ceiling whose page was not measured', (mode) => {
    const ceilings = { [PAGE]: 200_000, 'docs:/blog/tags/signals': 50_688 }
    const r = judgeSiteSizes({ [PAGE]: ON_MAIN }, ceilings, mode, { sizes: null, ceilings })
    expect(r.failed).toBe(1)
    expect(failures(r)[0]).toContain('docs:/blog/tags/signals: has a ceiling but was not measured')
  })

  it('a measured page with no ceiling fails too', () => {
    expect(judgeSiteSizes({ [PAGE]: ON_MAIN }, {}, 'main', undefined).failed).toBe(1)
  })
})

describe('what is measured', () => {
  let dir: string | null = null
  const tmp = (): string => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-site-budgets-')))
    return dir
  }
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('the ids of the site are the list of pages to measure', () => {
    expect(siteIds({ 'docs:/': 1, 'docs:(shell)': 2, 'other:/': 3 })).toEqual(['docs:/', 'docs:(shell)'])
  })

  it('maps a route to its prerendered HTML', () => {
    expect(routeHtml('/d', '/')).toBe(join('/d', 'index.html'))
    expect(routeHtml('/d', '/why/components-run-once')).toBe(join('/d', 'why', 'components-run-once', 'index.html'))
    expect(routeHtml('/d', '/404.html')).toBe(join('/d', '404.html'))
  })

  const site = (d: string, files: Record<string, string>): void => {
    mkdirSync(join(d, 'assets'), { recursive: true })
    for (const [name, text] of Object.entries(files)) writeFileSync(join(d, name), text)
  }

  it('the shell is the entry, the nav and the copy button with their static imports, each file once', () => {
    const d = tmp()
    const filler = (seed: string): string => `export const x="${seed.repeat(400)}"`
    site(d, {
      'index.html': '<script type="module" crossorigin src="/assets/index-a.js"></script>',
      'assets/index-a.js': `import"./runtime-b.js";${filler('entry')};import("./lazy-z.js")`,
      'assets/runtime-b.js': filler('runtime'),
      'assets/SiteNav-c.js': `import"./runtime-b.js";${filler('nav')}`,
      'assets/command-d.js': filler('copy'),
      'assets/lazy-z.js': filler('never-counted'),
    })
    const all = shellBytes(d) as number
    expect(all).toBeGreaterThan(0)
    // A dynamic import is deferred work: growing it does not move the shell.
    writeFileSync(join(d, 'assets/lazy-z.js'), filler('never-counted-and-much-larger-than-before'))
    expect(shellBytes(d)).toBe(all)
    // A statically imported file does.
    writeFileSync(join(d, 'assets/runtime-b.js'), `${filler('runtime')};export const y="${'q7'.repeat(900)}"`)
    expect(shellBytes(d)).toBeGreaterThan(all)
  })

  it('the shell of a build without its parts is not measured (and then fails as unmeasured)', () => {
    const d = tmp()
    site(d, { 'index.html': '<script type="module" src="/assets/index-a.js"></script>', 'assets/index-a.js': 'export{}' })
    expect(shellBytes(d)).toBeUndefined()
    expect(shellBytes(join(d, 'absent'))).toBeUndefined()
  })

  it('the checkout path is not part of the size', () => {
    const d = tmp()
    const build = (root: string): number => {
      const out = join(d, root.length.toString())
      site(out, {
        'index.html': '<script type="module" src="/assets/index-a.js"></script>',
        'assets/index-a.js': `export const routes=[${Array.from({ length: 12 }, (_, i) => JSON.stringify(`${root}/docs/src/routes/r${i}.tsx`)).join(',')}]`,
        'assets/SiteNav-c.js': 'export{}',
        'assets/command-d.js': 'export{}',
      })

      return shellBytes(out, root) as number
    }
    expect(build('/home/runner/work/pyreon/pyreon')).toBe(build('/home/runner/work/_temp/site-base-tree'))
  })

  it('which changed paths make the base worth building', () => {
    for (const p of ['packages/core/runtime-dom/src/mount.ts', 'docs/src/site/kit/demo.tsx', 'docs/src/content/docs/form.md', 'docs/vite.config.ts', 'bun.lock']) {
      expect(movesSiteSizes(p), p).toBe(true)
    }
    for (const p of ['scripts/size-budgets/sites/docs.json', 'e2e/site-home.spec.ts', '.github/workflows/ci.yml', 'examples/playground/src/main.tsx', 'README.md']) {
      expect(movesSiteSizes(p), p).toBe(false)
    }
  })
})

describe('the ceilings: one file for the site, values in the repository', () => {
  it('a site’s ceilings are their own file, apart from every package and example', () => {
    expect(ceilingFile('site', PAGE)).toBe(join('sites', 'docs.json'))
    expect(ceilingFile('routes', 'docs:/')).toBe(join('apps', 'docs.json'))
  })

  const real = loadCeilings(sizeBudgetsDir(REPO_ROOT)).site

  it('every committed id is a page of the docs site or its shell', () => {
    const ids = Object.keys(real)
    expect(ids.length).toBeGreaterThan(20)
    for (const id of ids) expect(id, id).toMatch(new RegExp(`^${SITE}:(/|\\(shell\\)$)`))
    expect(real[`${SITE}:${SHELL}`]).toBeGreaterThan(0)
    expect(real[PAGE]).toBeGreaterThan(0)
  })

  it('the specs hold no byte number of their own (the file is the one source)', () => {
    for (const spec of ['e2e/site-home.spec.ts', 'e2e/site-docs.spec.ts']) {
      const text = readFileSync(join(REPO_ROOT, spec), 'utf8')
      expect(text, spec).not.toMatch(/BUDGETS?_KB|gzipSync|KB of JavaScript/)
      expect(text, spec).toContain('scripts/size-budgets/sites/docs.json')
    }
  })

  it('a change to the ceilings selects the docs e2e suite, whose cell runs the gate, and no other', () => {
    expect(selectSuites(['scripts/size-budgets/sites/docs.json']).map((s) => s.name)).toEqual(['docs'])
  })
})

describe('CI wiring', () => {
  const ci = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')
  const e2e = /\n  e2e-suite:\n([\s\S]*?)(?=\n  [a-z0-9_-]+:\n|$)/.exec(ci)?.[1] ?? ''
  const step = /\n      - name: Check Site Route Budgets\n([\s\S]*?)(?=\n      - name: )/.exec(e2e)?.[1] ?? ''

  it('the gate is a step of the e2e job, in the cell that ran the docs suite', () => {
    expect(step).toContain("contains(format(' {0} ', matrix.members), ' docs ')")
    // The docs suite builds docs/dist; the gate measures that build.
    expect(step).toContain('--dist=docs/dist')
  })

  it('a pull request is judged on its growth against the diff base, anything else against the ceilings', () => {
    // CI_BASE is scripts/diff-base.ts's: the merge commit's first parent.
    expect(step).toMatch(/"\$EVENT_NAME" = "pull_request"[\s\S]*--mode=pr --base-ref="\$CI_BASE"[\s\S]*else[\s\S]*--mode=main/)
    expect(e2e).toContain('run: bun scripts/diff-base.ts --github-env')
    // The merge commit's parent exists only in a checkout deeper than one commit.
    expect(e2e).toMatch(/actions\/checkout@[^\n]*\n\s+with:\n\s+fetch-depth: 2/)
  })

  it('the sticky-issue workflow reads the step by the name the job gives it', () => {
    const status = readFileSync(join(REPO_ROOT, '.github/workflows/size-ceiling-status.yml'), 'utf8')
    expect(status).toContain("const siteName = 'Check Site Route Budgets'")
  })
})

describe('check-site-budgets (the command)', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  /** A budgets directory, recorded head sizes and (optionally) a base file. */
  function setup(opts: { size: number; ceiling: number; base?: { size: number | null; ceiling: number } }): string[] {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-site-gate-')))
    const budgets = join(dir, 'budgets')
    writeCeiling(budgets, 'site', PAGE, opts.ceiling)
    writeFileSync(join(dir, 'sizes.json'), JSON.stringify({ [PAGE]: opts.size }))
    const args = [`--budgets-dir=${budgets}`, `--sizes=${join(dir, 'sizes.json')}`]
    if (opts.base) {
      const sizes = opts.base.size === null ? null : { [PAGE]: opts.base.size }
      writeFileSync(join(dir, 'base.json'), JSON.stringify({ ref: 'abc', site: { sizes, ceilings: { [PAGE]: opts.base.ceiling } } }))
      args.push(`--base=${join(dir, 'base.json')}`)
    }

    return args
  }

  const run = (args: string[]): { status: number | null; out: string } => {
    const r = spawnSync('bun', [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 60_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    })

    return { status: r.status, out: `${r.stdout}\n${r.stderr}` }
  }

  it('pr: growth over the allowance exits 1 and names the page and both sizes', () => {
    const r = run([...setup({ size: 90_000, ceiling: 200_000, base: { size: ON_MAIN, ceiling: 200_000 } }), '--mode=pr'])
    expect(r.status).toBe(1)
    expect(r.out).toContain(`${PAGE}: this change adds +${90_000 - ON_MAIN} B (${ON_MAIN} → 90000 B)`)
  })

  it('pr: the same growth with the ceiling set by the change exits 0', () => {
    const r = run([...setup({ size: 90_000, ceiling: ceilingFor(90_000), base: { size: ON_MAIN, ceiling: 200_000 } }), '--mode=pr'])
    expect(r.status).toBe(0)
    expect(r.out).toContain('accepted by this change')
  })

  it('pr: a page over its ceiling that the change did not grow exits 0', () => {
    const r = run([...setup({ size: 90_000, ceiling: OLD_BUDGET, base: { size: 90_000, ceiling: OLD_BUDGET } }), '--mode=pr'])
    expect(r.status).toBe(0)
    expect(r.out).toContain('on the base already')
  })

  it('pr: no base and no --base-ref exits 1 (fails closed)', () => {
    const r = run([...setup({ size: ON_MAIN, ceiling: 200_000 }), '--mode=pr'])
    expect(r.status).toBe(1)
    expect(r.out).toContain('pr mode needs the base measurement')
  })

  it('main: a page over its ceiling exits 1; under it exits 0', () => {
    expect(run([...setup({ size: 90_000, ceiling: OLD_BUDGET }), '--mode=main']).status).toBe(1)
    expect(run([...setup({ size: ON_MAIN, ceiling: OLD_BUDGET }), '--mode=main']).status).toBe(0)
  })

  it('no ceilings at all is a failure, not a pass', () => {
    const args = setup({ size: ON_MAIN, ceiling: 1 })
    rmSync(join(dir as string, 'budgets'), { recursive: true })
    const r = run([...args, '--mode=main'])
    expect(r.status).toBe(1)
    expect(r.out).toContain('no ceilings for the docs site')
  })

  it('--update=<id> sets that page’s ceiling from the measurement and touches no other', () => {
    const args = setup({ size: 90_000, ceiling: OLD_BUDGET })
    const budgets = join(dir as string, 'budgets')
    writeCeiling(budgets, 'site', 'docs:/', 52_736)
    writeFileSync(join(dir as string, 'sizes.json'), JSON.stringify({ [PAGE]: 90_000, 'docs:/': 60_000 }))
    expect(run([...args, `--update=${PAGE}`]).status).toBe(0)
    expect(loadCeilings(budgets).site).toEqual({ [PAGE]: ceilingFor(90_000), 'docs:/': 52_736 })
    // Unscoped: raises the one that is over, never lowers.
    writeCeiling(budgets, 'site', PAGE, 500_000)
    expect(run([...args, '--update']).status).toBe(0)
    expect(loadCeilings(budgets).site).toEqual({ [PAGE]: 500_000, 'docs:/': ceilingFor(60_000) })
  })
})
