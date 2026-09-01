import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The isomorphic, frontend, portable and language rules that completed their
 * tiers.
 *
 * The negative cases carry most of the weight here. These run on `shared`
 * files, which is most of an app, and two of the four groups are `optIn`
 * precisely because a false positive in them is expensive — telling someone
 * their correct code is wrong is worse than missing a case.
 */

const PORTABLE_OPTS = { portablePaths: ['src/shared/'] }
const cfg = {
  rules: {
    'pyreon/no-env-branch-in-render': 'warn',
    'pyreon/require-stable-iteration-order': 'warn',
    'pyreon/no-layout-thrash': 'warn',
    'pyreon/require-abort-on-unmount': 'warn',
    'pyreon/require-img-loading-hint': 'info',
    'pyreon/no-blocking-third-party-script': 'warn',
    'pyreon/no-catch-without-rethrow-or-report': 'warn',
    'pyreon/no-web-only-import-in-portable': ['error', PORTABLE_OPTS],
    'pyreon/prefer-canonical-primitive': ['warn', PORTABLE_OPTS],
    'pyreon/require-native-compat-marker': ['warn', PORTABLE_OPTS],
    'pyreon/no-css-in-js-in-portable': ['error', PORTABLE_OPTS],
  },
} as never

const only = (src: string, id: string, file: string) =>
  lintFile(file, src, allRules, cfg).diagnostics.filter((d) => d.ruleId === id)

describe('pyreon/no-env-branch-in-render', () => {
  const ID = 'pyreon/no-env-branch-in-render'
  const F = 'src/W.tsx'

  it('fires on a ternary that picks the rendered text', () => {
    expect(only(`export const W = () => <p>{isServer ? 'a' : 'b'}</p>`, ID, F)).toHaveLength(1)
  })

  it('fires on the && spelling too', () => {
    expect(only(`export const W = () => <p>{isClient && <b>x</b>}</p>`, ID, F)).toHaveLength(1)
  })

  it('fires on an attribute, which is also rendered output', () => {
    expect(only(`export const W = () => <p class={isServer ? 'a' : 'b'} />`, ID, F)).toHaveLength(1)
  })

  it('covers typeof window, the other spelling of the same test', () => {
    expect(
      only(`export const W = () => <p>{typeof window === 'undefined' ? 'a' : 'b'}</p>`, ID, F),
    ).toHaveLength(1)
  })

  it('does NOT fire on a guard that changes behaviour rather than output', () => {
    // The shape the framework itself recommends. Flagging it would be telling
    // people not to write SSR-safe code.
    expect(
      only(`export const W = () => { if (isServer) return null\n  bind()\n  return <p>x</p> }`, ID, F),
    ).toEqual([])
  })

  it('does not fire on an ordinary conditional', () => {
    expect(only(`export const W = (p: any) => <p>{p.ok ? 'a' : 'b'}</p>`, ID, F)).toEqual([])
  })
})

describe('pyreon/require-stable-iteration-order', () => {
  const ID = 'pyreon/require-stable-iteration-order'
  const F = 'src/W.tsx'

  it('fires on Object.keys().map() in JSX', () => {
    expect(
      only(`export const W = (o: any) => <ul>{Object.keys(o).map((k) => <li>{k}</li>)}</ul>`, ID, F),
    ).toHaveLength(1)
  })

  it('stays silent once sorted — the fix', () => {
    expect(
      only(`export const W = (o: any) => <ul>{Object.keys(o).sort().map((k) => <li>{k}</li>)}</ul>`, ID, F),
    ).toEqual([])
  })

  it('does NOT fire outside JSX', () => {
    // Iterating keys to compute a total is order-independent. The rule is
    // about RENDERED order, not iteration in general.
    expect(
      only(`export const total = (o: any) => Object.keys(o).map((k) => o[k]).length`, ID, F),
    ).toEqual([])
  })

  it('does not fire on an ordinary array', () => {
    expect(only(`export const W = (xs: any[]) => <ul>{xs.map((x) => <li>{x}</li>)}</ul>`, ID, F)).toEqual([])
  })
})

describe('pyreon/no-layout-thrash', () => {
  const ID = 'pyreon/no-layout-thrash'
  const F = 'src/m.ts'

  it('fires on write-then-read inside a loop', () => {
    expect(
      only(
        `export function run(els: any[]) { for (const el of els) { el.style.width = '1px'\n  use(el.offsetWidth) } }`,
        ID,
        F,
      ),
    ).toHaveLength(1)
  })

  it('does NOT fire on a single read-after-write outside a loop', () => {
    // One reflow, and often unavoidable — measuring something you just moved
    // is a real thing to do.
    expect(
      only(`export function run(el: any) { el.style.width = '1px'\n  use(el.offsetWidth) }`, ID, F),
    ).toEqual([])
  })

  it('does not fire when the loop only reads', () => {
    expect(
      only(`export function run(els: any[]) { for (const el of els) { use(el.offsetWidth) } }`, ID, F),
    ).toEqual([])
  })

  it('does not fire when the loop only writes', () => {
    expect(
      only(`export function run(els: any[]) { for (const el of els) { el.style.width = '1px' } }`, ID, F),
    ).toEqual([])
  })
})

describe('pyreon/require-abort-on-unmount', () => {
  const ID = 'pyreon/require-abort-on-unmount'
  const F = 'src/W.tsx'

  it('fires on a bare fetch in onMount', () => {
    expect(only(`export const W = () => { onMount(() => { fetch('/a').then(use) }) }`, ID, F)).toHaveLength(1)
  })

  it('stays silent with an AbortController', () => {
    expect(
      only(
        `export const W = () => { onMount(() => { const ac = new AbortController()\n  fetch('/a', { signal: ac.signal }).then(use)\n  return () => ac.abort() }) }`,
        ID,
        F,
      ),
    ).toEqual([])
  })

  it('does not fire on a fetch outside onMount', () => {
    expect(only(`export const load = () => fetch('/a').then(use)`, ID, F)).toEqual([])
  })
})

describe('pyreon/require-img-loading-hint', () => {
  const ID = 'pyreon/require-img-loading-hint'
  const F = 'src/W.tsx'

  it('is info and opt-in — it cannot know what is above the fold', () => {
    const r = allRules.find((x) => x.meta.id === ID)
    expect(r?.meta.severity).toBe('info')
    expect(r?.meta.optIn).toBe(true)
  })

  it('fires on an img with no loading attribute', () => {
    expect(only(`export const W = () => <img src="/a.png" alt="a" />`, ID, F)).toHaveLength(1)
  })

  it('accepts eager as readily as lazy — the point is the decision', () => {
    expect(only(`export const W = () => <img src="/a.png" alt="a" loading="eager" />`, ID, F)).toEqual([])
    expect(only(`export const W = () => <img src="/a.png" alt="a" loading="lazy" />`, ID, F)).toEqual([])
  })

  it('stays silent on a spread it cannot see into', () => {
    expect(only(`export const W = (p: any) => <img {...p} />`, ID, F)).toEqual([])
  })
})

describe('pyreon/no-blocking-third-party-script', () => {
  const ID = 'pyreon/no-blocking-third-party-script'
  const F = 'src/W.tsx'

  it('fires on a bare external script', () => {
    expect(only(`export const W = () => <script src="https://cdn.dev/a.js" />`, ID, F)).toHaveLength(1)
  })

  it.each(['defer', 'async'])('accepts %s', (attr) => {
    expect(only(`export const W = () => <script src="https://cdn.dev/a.js" ${attr} />`, ID, F)).toEqual([])
  })

  it('does not fire on an inline script — nothing to wait for on the network', () => {
    expect(only(`export const W = () => <script>{'x'}</script>`, ID, F)).toEqual([])
  })

  it('does not fire on type=module, which is deferred by specification', () => {
    expect(
      only(`export const W = () => <script type="module" src="https://cdn.dev/a.js" />`, ID, F),
    ).toEqual([])
  })
})

describe('the portable tier completion', () => {
  const P = 'src/shared/x.ts'
  const PT = 'src/shared/V.tsx'

  it('no-web-only-import-in-portable fires, and points at the webview bridge where one exists', () => {
    const ID = 'pyreon/no-web-only-import-in-portable'
    expect(only(`import { mount } from '@pyreon/runtime-dom'`, ID, P)).toHaveLength(1)
    const charts = only(`import { Chart } from '@pyreon/charts'`, ID, P)
    expect(charts[0]?.message).toContain('@pyreon/charts/webview')
  })

  it('...and accepts the webview subpath itself', () => {
    expect(
      only(`import { Chart } from '@pyreon/charts/webview'`, 'pyreon/no-web-only-import-in-portable', P),
    ).toEqual([])
  })

  it('...and leaves a portable package alone', () => {
    expect(
      only(`import { signal } from '@pyreon/reactivity'`, 'pyreon/no-web-only-import-in-portable', P),
    ).toEqual([])
  })

  it('prefer-canonical-primitive names the primitive that replaces the tag', () => {
    const d = only(`export const V = () => <div>hi</div>`, 'pyreon/prefer-canonical-primitive', PT)
    expect(d).toHaveLength(1)
    expect(d[0]?.message).toContain('Stack')
  })

  it('...and leaves components alone, since only DOM tags are lowercase', () => {
    expect(
      only(`export const V = () => <Stack>hi</Stack>`, 'pyreon/prefer-canonical-primitive', PT),
    ).toEqual([])
  })

  it('...and leaves a DOM tag inside a `<Web>` branch alone — that IS the fix', () => {
    // The rule's own message says to put a genuine DOM node behind a `<Web>`
    // branch. Firing on the shape it recommends makes the advice unfollowable,
    // and the multiplatform scaffolder's own fixture is exactly this shape.
    expect(
      only(
        `export const V = () => <Web><div>hi</div></Web>`,
        'pyreon/prefer-canonical-primitive',
        PT,
      ),
    ).toEqual([])
  })

  it('...but a sibling OUTSIDE the branch still fires — the skip is scoped', () => {
    // Depth, not a latch: leaving the `<Web>` subtree must re-arm the rule, or
    // one escape hatch anywhere in a file silences the whole file.
    expect(
      only(
        `export const V = () => <Stack><Web><div /></Web><span>x</span></Stack>`,
        'pyreon/prefer-canonical-primitive',
        PT,
      ),
    ).toHaveLength(1)
  })

  it('require-native-compat-marker fires on an unmarked provider', () => {
    expect(
      only(
        `export function Shell(props: any) { provide(Ctx, props.value)\n  return props.children }`,
        'pyreon/require-native-compat-marker',
        PT,
      ),
    ).toHaveLength(1)
  })

  it('...and accepts a marker anywhere in the file', () => {
    expect(
      only(
        `function Shell(props: any) { provide(Ctx, props.value)\n  return props.children }\nexport default nativeCompat(Shell)`,
        'pyreon/require-native-compat-marker',
        PT,
      ),
    ).toEqual([])
  })

  it('no-css-in-js-in-portable catches both the call and the tagged-template forms', () => {
    const ID = 'pyreon/no-css-in-js-in-portable'
    expect(only(`export const B = styled('div')({ padding: 4 })`, ID, P)).toHaveLength(1)
    expect(only('export const c = css`color: red`', ID, P)).toHaveLength(1)
  })

  it('every portable rule fires on NOTHING without portablePaths', () => {
    // The property that makes the whole tier safe to ship enabled: which files
    // reach a native target cannot be inferred, so unconfigured means silent.
    const bare = {
      rules: {
        'pyreon/no-web-only-import-in-portable': 'error',
        'pyreon/prefer-canonical-primitive': 'warn',
        'pyreon/require-native-compat-marker': 'warn',
        'pyreon/no-css-in-js-in-portable': 'error',
      },
    } as never
    const out = lintFile(PT, `import { mount } from '@pyreon/runtime-dom'\nexport const V = () => <div>x</div>`, allRules, bare)
    expect(out.diagnostics.filter((d) => String(d.ruleId).includes('portable') || String(d.ruleId).includes('canonical'))).toEqual([])
  })
})

describe('pyreon/no-catch-without-rethrow-or-report', () => {
  const ID = 'pyreon/no-catch-without-rethrow-or-report'
  const F = 'src/a.ts'

  it('is opt-in, on measured volume rather than principle', () => {
    // 411 findings against this repo. A rule that cannot be driven to zero
    // does not belong in a preset that gates CI.
    expect(allRules.find((x) => x.meta.id === ID)?.meta.optIn).toBe(true)
  })

  it('fires on an empty catch', () => {
    expect(only(`export function f() { try { g() } catch (e) { } }`, ID, F)).toHaveLength(1)
  })

  it.each([
    ['rethrow', `try { g() } catch (e) { throw e }`],
    ['wrapped rethrow', `try { g() } catch (e) { throw new Error('x', { cause: e }) }`],
    ['logged', `try { g() } catch (e) { console.error(e) }`],
    ['handed to a callback', `try { g() } catch (e) { onError(e) }`],
    ['assigned', `try { g() } catch (e) { state.error = e }`],
    ['returned', `try { g() } catch (e) { return toMessage(e) }`],
  ])('accepts %s', (_n, body) => {
    expect(only(`export function f() { ${body} }`, ID, F)).toEqual([])
  })

  it('says something different for the empty case', () => {
    const empty = only(`export function f() { try { g() } catch (e) { } }`, ID, F)
    const swallow = only(`export function f() { try { g() } catch (e) { return null } }`, ID, F)
    expect(empty[0]?.message).toContain('empty')
    expect(swallow[0]?.message).not.toContain('empty')
  })
})
