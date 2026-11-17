/**
 * site-budgets — measures and judges the JavaScript a pyreon.dev page requests
 * on load. The fourth size family, beside package bundles, minimal imports and
 * zero routes, and judged by the same policy (`size-budget-policy.ts`): a pull
 * request on the bytes IT adds, the default branch against the ceilings in
 * `scripts/size-budgets/sites/docs.json`.
 *
 * What is measured, per route in that file:
 *
 *   - a route (`/why/components-run-once`): the page is loaded in Chromium at
 *     1440×900 without scrolling, and every script it requests is summed,
 *     gzip -9 (the entry, island hydration, the islands in view or loaded on
 *     idle, and their idle prefetches). The measuring spec is
 *     `e2e/site-sizes.measure.ts`;
 *   - `(shell)`: what a marketing page loads before any demo island, read from
 *     the build with no browser: the client entry, the nav island and the copy
 *     button, each with its static import closure.
 *
 * These numbers used to be constants in two e2e specs, compared on every pull
 * request. A page sat 31 B under its number on the default branch, so three
 * unrelated pull requests that each added a few hundred bytes to a runtime
 * package failed a check for the site.
 *
 * No Bun API, so tests can import it. The command is `check-site-budgets`.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { listDirIfExists, readTextIfExists } from './fs-read'
import { closureGzip } from './js-closure'
import { prepareBaseTree, run } from './size-base-tree'
import {
  type BaseFamily,
  formatVerdicts,
  judgeFamily,
  movesSiteSizes,
  ROUTE_NOISE_BYTES,
  type SiteBaseFile,
  type SizeMode,
} from './size-budget-policy'
import { loadCeilings, sizeBudgetsDir } from './size-budget-store'

const REPO_ROOT = resolve(import.meta.dirname, '..')

/** The one site that is measured; the owner of `sites/docs.json`. */
export const SITE = 'docs'

/** The entry that is read from the build instead of a page load. */
export const SHELL = '(shell)'

/**
 * The date the site is built for, the same one the docs e2e suite serves
 * (`e2e-configs/docs.config.ts`): every scheduled post is published, so the
 * blog routes that are measured exist.
 */
const CONTENT_NOW = '2099-01-01'

/** `docs:/blog` → `/blog`. */
const routeOf = (id: string): string => id.slice(SITE.length + 1)

/** The ids of this site that have a ceiling: they are the list of what to measure. */
export function siteIds(ceilings: Readonly<Record<string, number>>): string[] {
  return Object.keys(ceilings).filter((id) => id.startsWith(`${SITE}:`))
}

/** The prerendered HTML of a route: `/` → `index.html`, `/404.html` as it is, `/a/b` → `a/b/index.html`. */
export function routeHtml(dist: string, route: string): string {
  if (route.endsWith('.html')) {
    return join(dist, ...route.split('/').filter(Boolean))
  }

  return join(dist, ...route.split('/').filter(Boolean), 'index.html')
}

/**
 * Gzipped bytes of the marketing shell in a built site, or `undefined` when
 * the build does not have its three parts (it is then not measured, which
 * fails a head that has a ceiling for it and makes it new on a base).
 */
export function shellBytes(dist: string, checkoutRoot?: string): number | undefined {
  const html = readTextIfExists(join(dist, 'index.html'))
  const entry = html === undefined ? undefined : /<script[^>]*type="module"[^>]*src="\/(assets\/[^"]+\.js)"/.exec(html)?.[1]
  const assets = listDirIfExists(join(dist, 'assets')).map((e) => e.name)
  const chunk = (prefix: string): string | undefined => assets.find((f) => f.startsWith(`${prefix}-`) && f.endsWith('.js'))
  const nav = chunk('SiteNav')
  const copy = chunk('command')
  if (entry === undefined || nav === undefined || copy === undefined) {
    return undefined
  }

  return closureGzip([join(dist, entry), join(dist, 'assets', nav), join(dist, 'assets', copy)], checkoutRoot).bytes
}

/** Where `buildSite` writes the site of the checkout at `root`. */
export const siteDist = (root: string): string => join(root, 'docs', 'dist')

/** Builds the docs site of the checkout at `root` into `<root>/docs/dist`. */
export function buildSite(root: string): void {
  run('bun', ['run', '--filter=@pyreon/docs', 'build'], root, { PYREON_CONTENT_NOW: CONTENT_NOW })
}

interface Measured {
  route: string
  bytes: number
}

/** Loads every route of `routes` from the build at `dist` in Chromium and returns the bytes each requested. */
function measureInBrowser(dist: string, routes: readonly string[], checkoutRoot: string): Measured[] {
  const out = mkdtempSync(join(tmpdir(), 'pyreon-site-sizes-'))
  try {
    // This checkout's measuring spec, pointed at the build to measure: the
    // base of a pull request is measured by the same code as its head.
    const test = spawnSync('bunx', ['playwright', 'test', '--config=e2e-configs/site-sizes.config.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        PYREON_SITE_DIST: dist,
        PYREON_SITE_ROOT: checkoutRoot,
        PYREON_SITE_ROUTES: JSON.stringify(routes),
        PYREON_SITE_SIZES_OUT: out,
      },
    })
    if (test.status !== 0) {
      throw new Error(
        `[Pyreon] site budgets: measuring ${dist} failed (exit ${test.status}). Fix the page that did not load first.\n${test.stdout.slice(-6000)}\n${test.stderr.slice(-2000)}`,
      )
    }

    return listDirIfExists(out)
      .filter((e) => e.name.endsWith('.json'))
      .map((e) => JSON.parse(readTextIfExists(join(out, e.name)) ?? '{}') as Measured)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

/**
 * Measures `ids` in the built site at `dist`, keyed by id. `checkoutRoot` is
 * the checkout it was built in, whose path is removed from the code first.
 *
 * An id whose page (or, for the shell, whose chunks) the build does not have
 * is left out, not failed: on a base it is a route the pull request adds, and
 * on a head `judgeSiteSizes` fails every ceiling that was not measured.
 */
export function measureSite(dist: string, ids: readonly string[], checkoutRoot: string): Record<string, number> {
  if (readTextIfExists(join(dist, 'index.html')) === undefined) {
    throw new Error(`[Pyreon] site budgets: no built site at ${dist}. \`bun run check-site-budgets\` builds one unless --dist names it.`)
  }
  const sizes: Record<string, number> = {}
  const routes = ids.map(routeOf).filter((r) => r !== SHELL && readTextIfExists(routeHtml(dist, r)) !== undefined)
  if (routes.length > 0) {
    for (const m of measureInBrowser(dist, routes, checkoutRoot)) {
      sizes[`${SITE}:${m.route}`] = m.bytes
    }
  }
  if (ids.includes(`${SITE}:${SHELL}`)) {
    const shell = shellBytes(dist, checkoutRoot)
    if (shell !== undefined) {
      sizes[`${SITE}:${SHELL}`] = shell
    }
  }

  return sizes
}

/**
 * Measures the commit a pull request merges into (`ref`), in a worktree at
 * `dir`, with this checkout's scripts.
 *
 * When no changed path can move what a page loads (`movesSiteSizes`), the base
 * builds to the same bytes as the head: nothing is built and the result says
 * so (`sizes: null`). Otherwise the worktree gets the head's `lib/` trees and
 * dependencies, an incremental bootstrap, and one build of the site.
 */
export function measureSiteBase(ref: string, ids: readonly string[], dir?: string): SiteBaseFile {
  const sha = run('git', ['rev-parse', '--verify', `${ref}^{commit}`], REPO_ROOT).trim()
  const changed = run('git', ['diff', '--name-only', sha, 'HEAD'], REPO_ROOT).split('\n').filter(Boolean)
  const tree = resolve(dir ?? join(mkdtempSync(join(tmpdir(), 'pyreon-site-base-')), 'tree'))
  run('git', ['worktree', 'add', '--detach', '--force', tree, sha], REPO_ROOT)
  try {
    // An absent directory reads as no ceilings: a base from before this family.
    const base: SiteBaseFile = { ref: sha, site: { sizes: null, ceilings: loadCeilings(sizeBudgetsDir(tree)).site } }
    if (changed.some(movesSiteSizes)) {
      prepareBaseTree(tree, !changed.includes('bun.lock'))
      buildSite(tree)
      base.site.sizes = measureSite(siteDist(tree), ids, tree)
    }
    const count = base.site.sizes === null ? 'same as head (no input changed)' : `${Object.keys(base.site.sizes).length} measured`
    console.log(`[site-budgets] base ${sha.slice(0, 9)}: ${count}`)

    return base
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: REPO_ROOT })
    rmSync(tree, { recursive: true, force: true })
  }
}

/**
 * Judges measured sizes. `ceilings` must be this site's ceilings: one whose
 * route was not measured fails, so a page that stops being built, or a
 * measurement that silently loads nothing, cannot leave a ceiling guarding
 * nothing.
 */
export function judgeSiteSizes(
  sizes: Readonly<Record<string, number>>,
  ceilings: Readonly<Record<string, number>>,
  mode: SizeMode,
  base: BaseFamily | undefined,
): { lines: string[]; failed: number } {
  const verdicts = judgeFamily(
    mode,
    Object.entries(sizes).map(([id, size]) => ({ id, size, ceiling: ceilings[id] })),
    base,
    ROUTE_NOISE_BYTES,
  )
  const { lines, failed } = formatVerdicts('site JS on load', mode, verdicts)
  const unmeasured = Object.keys(ceilings).filter((id) => !(id in sizes))
  for (const id of unmeasured) {
    lines.unshift(`  ✗ ${id}: has a ceiling but was not measured. The page is not in the build, or it was removed (then remove the ceiling).`)
  }

  return { lines, failed: failed + unmeasured.length }
}
