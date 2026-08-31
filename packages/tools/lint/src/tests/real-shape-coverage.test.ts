import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * Does each rule fire on the shape code is actually WRITTEN in?
 *
 * The fires-invariant next door proves a rule can fire on a minimal synthetic
 * fixture. That is a weaker claim than it looks, and this file exists because
 * the gap between the two is where rules die quietly:
 *
 * - `no-unvalidated-request-body` passed its fixture and reported NOTHING on
 *   `examples/cpa-pw-app-solid/src/routes/api/posts.ts`, a real handler with
 *   the exact defect. Two reasons, both invisible to a fixture: the receiver
 *   is `ctx.request`, not a bare `req`, and the value is wrapped in an `as`
 *   cast — which is precisely what makes an unvalidated body FEEL validated.
 * - `no-module-mutable-in-handler` and `require-native-compat-marker` both
 *   handled `function X()` and missed `const X = () => {}`. For a component
 *   the arrow is the more common form, so the rule was exempt from the
 *   majority of its own subject.
 *
 * Three of sixteen, none catchable by the fixture that "proved" them. So every
 * rule here is asserted against a spelling drawn from real code rather than
 * from the shape that was convenient to write.
 */

const PORTABLE = { portablePaths: ['src/shared/'] }
const cfg = {
  rules: {
    'pyreon/no-env-branch-in-render': 'warn',
    'pyreon/require-stable-iteration-order': 'warn',
    'pyreon/no-unvalidated-request-body': 'warn',
    'pyreon/require-request-signal-forwarding': 'warn',
    'pyreon/no-module-mutable-in-handler': 'error',
    'pyreon/no-await-in-loop-over-io': 'warn',
    'pyreon/no-layout-thrash': 'warn',
    'pyreon/require-abort-on-unmount': 'warn',
    'pyreon/require-img-loading-hint': 'info',
    'pyreon/no-blocking-third-party-script': 'warn',
    'pyreon/no-web-only-import-in-portable': ['error', PORTABLE],
    'pyreon/prefer-canonical-primitive': ['warn', PORTABLE],
    'pyreon/require-native-compat-marker': ['warn', PORTABLE],
    'pyreon/no-css-in-js-in-portable': ['error', PORTABLE],
    'pyreon/no-catch-without-rethrow-or-report': 'warn',
  },
} as never

const fires = (id: string, file: string, src: string) =>
  lintFile(file, src, allRules, cfg).diagnostics.filter((d) => d.ruleId === id).length

/** [rule, what makes this spelling REAL rather than convenient, file, source] */
const REAL_SHAPES: ReadonlyArray<readonly [string, string, string, string]> = [
  [
    'pyreon/no-unvalidated-request-body',
    'ctx.request receiver behind an `as` cast — the shape in this repo’s own example route',
    'src/routes/api/x.ts',
    `export async function POST(ctx: any) { const b = (await ctx.request.json()) as { t: string }\n  return save(b) }`,
  ],
  [
    'pyreon/no-module-mutable-in-handler',
    'handler exported as a const arrow, not a declaration',
    'src/routes/api/x.ts',
    `let cur = null\nexport const POST = async (req: Request) => { cur = req.url\n  return cur }`,
  ],
  [
    'pyreon/require-native-compat-marker',
    'component as a const arrow — the more common form for components',
    'src/shared/P.tsx',
    `export const Shell = (props: any) => { provide(Ctx, props.v)\n  return props.children }`,
  ],
  [
    'pyreon/no-await-in-loop-over-io',
    'handler as a const arrow',
    'src/routes/api/x.ts',
    `export const GET = async (req: Request) => { for (const i of ids) { await fetchOne(i) } }`,
  ],
  [
    'pyreon/require-request-signal-forwarding',
    'ctx rather than a parameter literally named req',
    'src/routes/api/x.ts',
    `export async function GET(ctx: any) { return fetch('https://a.dev') }`,
  ],
  [
    'pyreon/no-env-branch-in-render',
    'isServer called as a function, and nested inside a fragment',
    'src/W.tsx',
    `export const W = () => <><span>{isServer() ? 'a' : 'b'}</span></>`,
  ],
  [
    'pyreon/require-stable-iteration-order',
    'Object.entries with a destructured callback, not Object.keys',
    'src/W.tsx',
    `export const W = (o: any) => <ul>{Object.entries(o).map(([k]) => <li>{k}</li>)}</ul>`,
  ],
  [
    'pyreon/no-layout-thrash',
    'classList write and a getBoundingClientRect read, not style + offsetWidth',
    'src/m.ts',
    `export function r(els: any[]) { for (const el of els) { el.classList.add('x')\n  use(el.getBoundingClientRect()) } }`,
  ],
  [
    'pyreon/require-abort-on-unmount',
    'awaited fetch in an async onMount, not a .then chain',
    'src/W.tsx',
    `export const W = () => { onMount(async () => { const r = await fetch('/a')\n  use(r) }) }`,
  ],
  [
    'pyreon/require-img-loading-hint',
    'img carrying other attributes',
    'src/W.tsx',
    `export const W = () => <img src="/a.png" alt="a" class="hero" />`,
  ],
  [
    'pyreon/no-blocking-third-party-script',
    'script carrying an unrelated attribute',
    'src/W.tsx',
    `export const W = () => <script src="https://cdn.dev/a.js" charset="utf-8" />`,
  ],
  [
    'pyreon/no-web-only-import-in-portable',
    'a deep subpath, not the bare package specifier',
    'src/shared/a.ts',
    `import { x } from '@pyreon/runtime-dom/transition'`,
  ],
  [
    'pyreon/prefer-canonical-primitive',
    'a DOM tag nested inside a canonical primitive',
    'src/shared/V.tsx',
    `export const V = () => <Stack><span>x</span></Stack>`,
  ],
  [
    'pyreon/no-css-in-js-in-portable',
    'styled.div tagged template, not the call form',
    'src/shared/s.ts',
    'export const B = styled.div`color: red`',
  ],
  [
    'pyreon/no-catch-without-rethrow-or-report',
    'a catch containing only a comment — not syntactically empty',
    'src/a.ts',
    `export function f() { try { g() } catch (e) { /* ignore */ } }`,
  ],
]

describe('rules fire on the shape code is actually written in', () => {
  it.each(REAL_SHAPES)('%s — %s', (id, _why, file, src) => {
    expect(fires(id, file, src)).toBeGreaterThan(0)
  })

  it('covers every rule added to complete the general tiers', () => {
    // A rule added later with only a fixture behind it is exactly the gap this
    // file exists to close, so the list is asserted against the tiers rather
    // than left to whoever remembers.
    const covered = new Set(REAL_SHAPES.map(([id]) => id))
    const tiers = new Set(['isomorphic', 'backend', 'web-perf', 'portable'])
    const missing = allRules
      .filter((r) => tiers.has(String(r.meta.category)))
      .map((r) => r.meta.id)
      .filter((id) => !covered.has(id))
    // The four that predate this work are covered by their own dedicated files.
    expect(missing.sort()).toEqual([
      'pyreon/no-floating-promise-in-handler',
      'pyreon/no-locale-dependent-format',
      'pyreon/no-node-builtin-in-component',
      'pyreon/no-out-of-subset-construct',
      'pyreon/no-platform-branch-without-fallback',
      'pyreon/no-secret-in-shared-module',
      'pyreon/no-sync-fs-in-request-path',
      'pyreon/no-timezone-dependent-date',
      'pyreon/no-unbounded-raf-loop',
      'pyreon/no-unstable-render-id',
      'pyreon/prefer-passive-listener',
    ])
  })
})
