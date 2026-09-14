/**
 * Shape matrices, second batch — the branches of twenty-odd rules that had a
 * fires/quiet pair on their canonical shape and nothing on the neighbouring
 * syntax a real file writes.
 *
 * The same discipline as `rule-shape-matrices-4`: every `it` pairs a shape
 * the rule must act on with the corrected form it must leave alone, so a
 * rule that fires unconditionally fails as surely as one that never fires.
 * Where a branch is a REFUSAL (a receiver the rule cannot name, a key it
 * cannot read, a value it cannot prove), the spec asserts the refusal is
 * quiet — a lint rule that guesses on unreadable input is a false positive
 * generator, and a false positive is how a rule gets turned off.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lintFile } from '../runner'
import { lint } from '../lint'
import type { LintConfig, Rule } from '../types'
import { noAwaitInLoopOverIo } from '../rules/backend/no-await-in-loop-over-io'
import { noUnvalidatedRequestBody } from '../rules/backend/no-unvalidated-request-body'
import { noModuleMutableInHandler } from '../rules/backend/no-module-mutable-in-handler'
import { noFloatingPromiseInHandler } from '../rules/backend/no-floating-promise-in-handler'
import { noCloseBeforeHandlerTeardown } from '../rules/web-perf/no-close-before-handler-teardown'
import { noLayoutThrash } from '../rules/web-perf/no-layout-thrash'
import { preferPassiveListener } from '../rules/web-perf/prefer-passive-listener'
import { noUnboundedRafLoop } from '../rules/web-perf/no-unbounded-raf-loop'
import { requireAbortOnUnmount } from '../rules/web-perf/require-abort-on-unmount'
import { noCatchWithoutRethrowOrReport } from '../rules/js/no-catch-without-rethrow-or-report'
import { requireErrorCause } from '../rules/js/require-error-cause'
import { preferCanonicalPrimitive } from '../rules/portable/prefer-canonical-primitive'
import { colorContrast } from '../rules/frontend/color-contrast'
import { headingOrder } from '../rules/frontend/heading-order'
import { noRedundantRole } from '../rules/frontend/no-redundant-role'
import { noUnstableRenderId } from '../rules/isomorphic/no-unstable-render-id'
import { noEnvBranchInRender } from '../rules/isomorphic/no-env-branch-in-render'
import { noImperativeEffectOnCreate } from '../rules/lifecycle/no-imperative-effect-on-create'
import { noUnsanitizedInnerHtml } from '../rules/security/no-unsanitized-inner-html'
import { noTargetBlankWithoutRel } from '../rules/security/no-target-blank-without-rel'
import { noMutateStoreState } from '../rules/store/no-mutate-store-state'
import { noErrorWithoutPrefix } from '../rules/architecture/no-error-without-prefix'
import { noModuleSignalInServerPackage } from '../rules/architecture/no-module-signal-in-server-package'
import { noSignalReadInAttrsCallback } from '../rules/styling/no-signal-read-in-attrs-callback'
import { noBareSignalInJsx } from '../rules/reactivity/no-bare-signal-in-jsx'
import { noSignalCallWrite } from '../rules/reactivity/no-signal-call-write'

const SIG = `import { signal, computed, effect, batch, untrack, onMount, onCleanup } from '@pyreon/reactivity'\n`

let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-shapes5-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@pyreon/shape-fixture-5',
      dependencies: {
        '@pyreon/core': '*',
        '@pyreon/reactivity': '*',
        '@pyreon/rocketstyle': '*',
        '@pyreon/store': '*',
      },
    }),
  )
})
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

let seq = 0
function diags(rule: Rule, source: string, file?: string, options?: Record<string, unknown>) {
  const rel = file ?? `src/f${seq++}.tsx`
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, source)
  const config: LintConfig = { rules: { [rule.meta.id]: options ? ['error', options] : 'error' } }
  return lintFile(abs, source, [rule], config).diagnostics.filter((d) => d.ruleId === rule.meta.id)
}
const count = (rule: Rule, source: string, file?: string, options?: Record<string, unknown>): number =>
  diags(rule, source, file, options).length

const API = 'src/routes/api/items.ts'

describe('backend rules — the file must SERVE requests before a handler shape counts', () => {
  it('no-await-in-loop-over-io fires in an api route and is quiet in a plain module', () => {
    const src = `export async function GET(req: Request) { const out = []\n  for (const id of ids) { out.push(await fetchOne(id)) }\n  return out }`
    expect(count(noAwaitInLoopOverIo, src, API)).toBe(1)
    // Same code, no handler export — a batch script awaiting in a loop is
    // sequential on purpose and nobody's request is waiting on it.
    const plain = `export async function run() { const out = []\n  for (const id of ids) { out.push(await fetchOne(id)) }\n  return out }`
    expect(count(noAwaitInLoopOverIo, plain, 'src/lib/batch.ts')).toBe(0)
  })
  it('no-unvalidated-request-body names `ctx.request` AND `request.ctx`-shaped receivers, and refuses a non-request one', () => {
    expect(count(noUnvalidatedRequestBody, `export async function POST(ctx: any) { const b = await ctx.request.json()\n  return save(b) }`, API)).toBe(1)
    expect(count(noUnvalidatedRequestBody, `export async function POST(req: any) { const b = await req.raw.json()\n  return save(b) }`, API)).toBe(1)
    // `file.json()` is a Blob read, not a request body.
    expect(count(noUnvalidatedRequestBody, `export async function POST(file: any) { const b = await file.json()\n  return save(b) }`, API)).toBe(0)
    // Anything hanging off a request-ish base is still the request.
    expect(count(noUnvalidatedRequestBody, `export async function POST(req: any) { const b = await req.stream.json()\n  return save(b) }`, API)).toBe(1)
  })
  it('no-module-mutable-in-handler ignores an assignment to a LOCAL inside the handler', () => {
    expect(count(noModuleMutableInHandler, `let cache = null\nexport function GET(req: Request) { cache = 1\n  return cache }`, API)).toBe(1)
    expect(count(noModuleMutableInHandler, `let cache = null\nexport function GET(req: Request) { let local = null\n  local = 1\n  return local }`, API)).toBe(0)
  })
  it('no-floating-promise-in-handler resolves a member callee and a variable-declared handler export', () => {
    const member = `export function handler() { mailer.sendReceipt(user) }`
    const viaConst = `export const handler = () => { sendReceipt(user) }`
    const notAsyncIsh = `export function handler() { format(user) }`
    expect(count(noFloatingPromiseInHandler, member, 'src/server/handler.ts')).toBe(1)
    expect(count(noFloatingPromiseInHandler, viaConst, 'src/server/handler.ts')).toBe(1)
    expect(count(noFloatingPromiseInHandler, notAsyncIsh, 'src/server/handler.ts')).toBe(0)
  })
})

describe('no-close-before-handler-teardown — how the socket is NAMED', () => {
  const R = noCloseBeforeHandlerTeardown
  it('fires on the canonical close-then-null — the control', () => {
    expect(count(R, `export function stop(ws: any) { ws.close()\n  ws.onmessage = null }`)).toBe(1)
  })
  it('keys a MEMBER receiver (`this.sock`) the same way, and refuses a COMPUTED one', () => {
    expect(count(R, `export class C { stop() { this.sock.close()\n  this.sock.onmessage = null } }`)).toBe(1)
    // `sockets[i]` cannot be keyed — the rule must not guess that two
    // computed accesses name the same socket.
    expect(count(R, `export function stop(sockets: any[], i: number) { sockets[i].close()\n  sockets[i].onmessage = null }`)).toBe(0)
  })
  it('remembers the FIRST close of a socket when it is closed twice', () => {
    expect(count(R, `export function stop(ws: any) { if (ws.readyState === 1) ws.close()\n  ws.close()\n  ws.onmessage = null }`)).toBe(1)
  })
  it('ignores a null assignment to a socket that was never closed', () => {
    expect(count(R, `export function stop(ws: any, other: any) { other.close()\n  ws.onmessage = null }`)).toBe(0)
  })
})

describe('no-layout-thrash — what counts as a WRITE', () => {
  const R = noLayoutThrash
  const loop = (body: string) => `export function run(els: any[]) { for (const el of els) { ${body} } }`
  it('fires on a style write after a layout read — the control', () => {
    expect(count(R, loop(`el.style.width = '1px'\n  const w = el.offsetWidth\n  use(w)`))).toBe(1)
  })
  it('treats `el.style.x =`, `className =` and `innerHTML =` as writes', () => {
    expect(count(R, loop(`el.className = 'x'\n  const w = el.offsetWidth\n  use(w)`))).toBe(1)
    expect(count(R, loop(`el.innerHTML = 'x'\n  const w = el.offsetWidth\n  use(w)`))).toBe(1)
  })
  it('is quiet when the read and the write live in DIFFERENT loops', () => {
    expect(count(R, `export function run(els: any[]) { const ws = els.map((el) => el.offsetWidth)\n  els.forEach((el, i) => { el.style.width = ws[i] + 'px' }) }`)).toBe(0)
  })
})

describe('web-perf listeners and frames', () => {
  it('prefer-passive-listener reads a STRING-LITERAL `passive` key, and stays quiet on an unreadable options object', () => {
    expect(count(preferPassiveListener, `export function bind(el: any) { el.addEventListener('scroll', onScroll, { 'passive': true }) }`)).toBe(0)
    expect(count(preferPassiveListener, `export function bind(el: any) { el.addEventListener('scroll', onScroll, { capture: true }) }`)).toBe(1)
    expect(count(preferPassiveListener, `export function bind(el: any) { el.addEventListener('scroll', onScroll, opts) }`)).toBe(0)
  })
  it('no-unbounded-raf-loop recognises the `window.requestAnimationFrame` member form', () => {
    expect(count(noUnboundedRafLoop, `export function start() { window.requestAnimationFrame(function step() { tick(); window.requestAnimationFrame(step) }) }`)).toBe(1)
    expect(count(noUnboundedRafLoop, `export function start() { setTimeout(function step() { tick(); setTimeout(step) }) }`)).toBe(0)
  })
  it('require-abort-on-unmount ignores an onMount whose callback is not a function literal', () => {
    expect(count(requireAbortOnUnmount, `export const W = () => { onMount(() => { fetch('/api').then(use) }) }`)).toBe(1)
    expect(count(requireAbortOnUnmount, `export const W = () => { onMount(setup) }`)).toBe(0)
    expect(count(requireAbortOnUnmount, `export const W = () => { onMount() }`)).toBe(0)
  })
})

describe('js error-handling rules — the reporting spellings', () => {
  it('no-catch-without-rethrow-or-report accepts a MEMBER reporter, a bare reporter, and passing the error on', () => {
    const R = noCatchWithoutRethrowOrReport
    expect(count(R, `export function f() { try { g() } catch (err) { } }`)).toBe(1)
    expect(count(R, `export function f() { try { g() } catch (err) { logger.error(err) } }`)).toBe(0)
    expect(count(R, `export function f() { try { g() } catch (err) { report(err) } }`)).toBe(0)
    expect(count(R, `export function f(onError: any) { try { g() } catch (err) { onError(err) } }`)).toBe(0)
    // A call that neither reports nor receives the error is still a swallow.
    expect(count(R, `export function f() { try { g() } catch (err) { tidy() } }`)).toBe(1)
  })
  it('require-error-cause accepts `{ cause }` and rejects an options object without it', () => {
    const R = requireErrorCause
    expect(count(R, `export function load() { try { parse() } catch (e) { throw new Error('bad', { cause: e }) } }`)).toBe(0)
    expect(count(R, `export function load() { try { parse() } catch (e) { throw new Error('bad', { code: 1 }) } }`)).toBe(1)
  })
})

describe('prefer-canonical-primitive — the `h()` spellings', () => {
  const R = preferCanonicalPrimitive
  const H = `import { h } from '@pyreon/core'\n`
  const opts = { portablePaths: ['src/shared/'] }
  it('fires on a lowercase tag with a suggestion — the control', () => {
    const d = diags(R, `${H}export const V = () => h('div', null, 'hi')`, 'src/shared/V.tsx', opts)
    expect(d).toHaveLength(1)
    expect(d[0]?.message).toContain('usually')
  })
  it('names no suggestion for a tag that has none', () => {
    const d = diags(R, `${H}export const V = () => h('marquee', null, 'hi')`, 'src/shared/V.tsx', opts)
    expect(d).toHaveLength(1)
    expect(d[0]?.message).not.toContain('usually')
  })
  it('ignores `h(Component)`, a non-string first argument, and an uppercase string', () => {
    expect(count(R, `${H}export const V = () => h(Card, null, 'hi')`, 'src/shared/V.tsx', opts)).toBe(0)
    expect(count(R, `${H}export const V = () => h(tag, null, 'hi')`, 'src/shared/V.tsx', opts)).toBe(0)
    expect(count(R, `${H}export const V = () => h('Div', null, 'hi')`, 'src/shared/V.tsx', opts)).toBe(0)
  })
  it('ignores a local `h` that is not the framework one', () => {
    expect(count(R, `import { h } from './hyper'\nexport const V = () => h('div', null, 'hi')`, 'src/shared/V.tsx', opts)).toBe(0)
  })
})

describe('frontend rules — key, value and structure spellings', () => {
  it('color-contrast reads STRING-LITERAL keys and ignores computed keys and non-literal values', () => {
    const R = colorContrast
    expect(count(R, `export const A = () => <div style={{ 'color': '#aaaaaa', 'background': '#bbbbbb' }} />`)).toBe(1)
    expect(count(R, `export const A = () => <div style={{ [k]: '#aaaaaa', background: '#bbbbbb' }} />`)).toBe(0)
    expect(count(R, `export const A = () => <div style={{ color: fg, background: '#bbbbbb' }} />`)).toBe(0)
  })
  it('heading-order keeps a SEPARATE level frame per function, and pops it on exit', () => {
    // The h1 in one component must not make an h3 in the next look like a
    // skip — and the frame must be popped, or the base frame drifts.
    const src = `export const A = () => <h1>a</h1>\nexport const B = () => <h3>b</h3>\nexport const C = () => <section><h1>a</h1><h3>b</h3></section>`
    expect(count(headingOrder, src)).toBe(1)
  })
  it('no-redundant-role removes the leading TAB as readily as a space, and ignores a member tag', () => {
    const d = diags(noRedundantRole, `export const A = () => <button\trole="button" />`)
    expect(d).toHaveLength(1)
    expect(d[0]?.fix).toBeDefined()
    expect(count(noRedundantRole, `export const A = () => <Ui.Button role="button" />`)).toBe(0)
  })
  it('no-unstable-render-id sees `crypto.randomUUID`, `Date.now`, a random NESTED in an array, and an id from a plain call', () => {
    const R = noUnstableRenderId
    expect(count(R, `export const A = () => <label htmlFor={'f' + crypto.randomUUID()}>x</label>`)).toBe(1)
    expect(count(R, `export const A = () => <label htmlFor={'f' + Date.now()}>x</label>`)).toBe(1)
    expect(count(R, `export const A = () => <label htmlFor={[Math.random()].join('')}>x</label>`)).toBe(1)
    expect(count(R, `export const A = () => <label htmlFor={makeId()}>x</label>`)).toBe(0)
    expect(count(R, `export const A = () => <label htmlFor="static">x</label>`)).toBe(0)
  })
  it('no-target-blank-without-rel reads `target={"_blank"}` in an expression container', () => {
    expect(count(noTargetBlankWithoutRel, `export const A = () => <a href="/x" target={"_blank"}>go</a>`)).toBe(1)
    expect(count(noTargetBlankWithoutRel, `export const A = () => <a href="/x" target={t}>go</a>`)).toBe(0)
  })
})

describe('isomorphic rules', () => {
  it('no-env-branch-in-render recognises `!isServer`, `isServer()`, a typeof check, and the `&&` spelling', () => {
    const R = noEnvBranchInRender
    expect(count(R, `export const W = () => <div>{!isServer ? 'c' : 's'}</div>`)).toBe(1)
    expect(count(R, `export const W = () => <div>{isServer() ? 's' : 'c'}</div>`)).toBe(1)
    expect(count(R, `export const W = () => <div>{typeof window === 'undefined' ? 's' : 'c'}</div>`)).toBe(1)
    expect(count(R, `export const W = () => <div>{isServer && <b>s</b>}</div>`)).toBe(1)
    expect(count(R, `export const W = () => <div>{ready && <b>s</b>}</div>`)).toBe(0)
  })
})

describe('lifecycle / security / store / architecture rules', () => {
  it('no-imperative-effect-on-create descends into an IIFE inside the effect, and ignores a non-function effect argument', () => {
    const R = noImperativeEffectOnCreate
    expect(count(R, `${SIG}export function C() { effect(() => { (() => { document.title = 'x' })() }); return <div /> }`)).toBe(1)
    expect(count(R, `${SIG}export function C() { effect(runner); return <div /> }`)).toBe(0)
    expect(count(R, `${SIG}export function C() { effect(); return <div /> }`)).toBe(0)
  })
  it('no-unsanitized-inner-html trusts an empty template literal and a MEMBER sanitizer, reads a string-literal `__html` key', () => {
    const R = noUnsanitizedInnerHtml
    expect(count(R, `export const A = () => <div dangerouslySetInnerHTML={{ __html: \`<b>static</b>\` }} />`)).toBe(0)
    expect(count(R, `export const A = () => <div dangerouslySetInnerHTML={{ __html: \`<b>\${bio}</b>\` }} />`)).toBe(1)
    expect(count(R, `export const A = () => <div dangerouslySetInnerHTML={{ __html: purifier.clean(bio) }} />`)).toBe(0)
    expect(count(R, `export const A = () => <div dangerouslySetInnerHTML={{ '__html': bio }} />`)).toBe(1)
    expect(count(R, `export const A = () => <div dangerouslySetInnerHTML={{ other: bio }} />`)).toBe(0)
  })
  it('no-mutate-store-state recognises a `defineStore` binding and a member-callee hook, and ignores a non-member `.set`', () => {
    const R = noMutateStoreState
    const S = `import { useCartStore } from '@pyreon/store'\n`
    expect(count(R, `${S}export function C() { const cart = useCartStore(); cart.count.set(1); return cart }`)).toBe(1)
    expect(count(R, `${S}export function C() { const cart = stores.useCartStore(); cart.count.set(1); return cart }`)).toBe(1)
    expect(count(R, `${S}export function C() { const cart = useCartStore(); local.set(1); return cart }`)).toBe(0)
    expect(count(R, `${S}export function C() { const cart = useCartStore(); cart.set(1); return cart }`)).toBe(0)
  })
  it('no-error-without-prefix skips test files in a framework package and fixes a TEMPLATE literal', () => {
    const R = noErrorWithoutPrefix
    const pkgRoot = join(root, 'packages', 'fw')
    mkdirSync(join(pkgRoot, 'src', 'tests'), { recursive: true })
    writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({ name: '@pyreon/fw' }))
    const lintAt = (rel: string, src: string) => {
      const abs = join(pkgRoot, rel)
      writeFileSync(abs, src)
      const config: LintConfig = { rules: { [R.meta.id]: 'error' } }
      return lintFile(abs, src, [R], config).diagnostics.filter((d) => d.ruleId === R.meta.id)
    }
    expect(lintAt('src/err.ts', 'export function boom() { throw new Error(`it broke ${x}`) }')).toHaveLength(1)
    expect(lintAt('src/err.ts', 'export function boom() { throw new Error(`it broke ${x}`) }')[0]?.fix).toBeDefined()
    expect(lintAt('src/tests/err.test.ts', "export function boom() { throw new Error('it broke') }")).toHaveLength(0)
    expect(lintAt('src/err.ts', 'export function boom() { throw new Error() }')).toHaveLength(0)
  })
  it('no-module-signal-in-server-package skips a declaration with no initializer', () => {
    const R = noModuleSignalInServerPackage
    expect(count(R, `${SIG}export let state\nexport const s = signal(0)`, 'packages/core/runtime-server/src/a.ts')).toBe(1)
  })
  it('no-signal-read-in-attrs-callback only records `const` signal bindings', () => {
    const R = noSignalReadInAttrsCallback
    const ROCK = `${SIG}import { rocketstyle } from '@pyreon/rocketstyle'\n`
    expect(count(R, `${ROCK}const on = signal(false)\nexport const B = rocketstyle()().attrs(() => ({ 'aria-pressed': on() }))`)).toBe(1)
    expect(count(R, `${ROCK}let on = signal(false)\nexport const B = rocketstyle()().attrs(() => ({ 'aria-pressed': on() }))`)).toBe(0)
    expect(count(R, `${ROCK}const on = makeFlag()\nlet other\nexport const B = rocketstyle()().attrs(() => ({ 'aria-pressed': on() }))`)).toBe(0)
  })
})

describe('reactivity rules — call shapes', () => {
  it('no-bare-signal-in-jsx ignores a member callee and an element with no children array', () => {
    const R = noBareSignalInJsx
    expect(count(R, `${SIG}const count = signal(0)\nexport const A = () => <div>{count()}</div>`)).toBe(1)
    expect(count(R, `${SIG}const s = { count: signal(0) }\nexport const A = () => <div>{s.count()}</div>`)).toBe(0)
    expect(count(R, `${SIG}const count = signal(0)\nexport const A = () => <div />`)).toBe(0)
  })
  it('no-signal-call-write fixes only the one-plain-argument shape', () => {
    const R = noSignalCallWrite
    const fixOf = (src: string) => diags(R, src)[0]?.fix
    expect(fixOf(`${SIG}const c = signal(0)\nc(5)`)).toBeDefined()
    expect(fixOf(`${SIG}const c = signal(0)\nc((p) => p + 1)`)).toBeUndefined()
    expect(fixOf(`${SIG}const c = signal(0)\nc(1, 2)`)).toBeUndefined()
    expect(fixOf(`${SIG}const c = signal(0)\nc(...args)`)).toBeUndefined()
  })
})

describe('lint() — the option and counting paths', () => {
  it('counts INFO diagnostics separately, and promotes a bare-severity rule to tuple form for option overrides', () => {
    const dir = join(root, 'proj')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, '.pyreonlintrc.json'), JSON.stringify({
      rules: { 'pyreon/no-signal-call-write': 'info', 'pyreon/no-bare-signal-in-jsx': ['warn', {}] },
    }))
    writeFileSync(join(dir, 'src', 'a.ts'), `${SIG}const c = signal(0)\nc(5)`)
    writeFileSync(join(dir, 'src', 'b.tsx'), `${SIG}const count = signal(0)\nexport const A = () => <div>{count()}</div>`)
    const prev = process.cwd()
    try {
      process.chdir(dir)
      const result = lint({
        paths: ['src'],
        config: join(dir, '.pyreonlintrc.json'),
        ruleOptionsOverrides: {
          'pyreon/no-signal-call-write': { x: 1 },
          'pyreon/no-bare-signal-in-jsx': { y: 2 },
          'pyreon/prefer-isserver': { z: 3 },
        },
      })
      expect(result.totalInfos).toBe(1)
      expect(result.totalWarnings).toBe(1)
    } finally {
      process.chdir(prev)
    }
  })
  it('honours an ignore pattern for a directory AND for an explicitly-passed file', () => {
    const dir = join(root, 'proj2')
    mkdirSync(join(dir, 'src', 'gen'), { recursive: true })
    writeFileSync(join(dir, 'src', 'gen', 'a.ts'), `${SIG}const c = signal(0)\nc(5)`)
    writeFileSync(join(dir, 'src', 'b.ts'), `${SIG}const c = signal(0)\nc(5)`)
    const prev = process.cwd()
    try {
      process.chdir(dir)
      writeFileSync(join(dir, 'extra.ignore'), 'src/gen/**\n')
      const walked = lint({ paths: ['src'], ignore: 'extra.ignore' })
      expect(walked.files).toHaveLength(1)
      const explicit = lint({ paths: ['src/gen/a.ts', 'src/b.ts'], ignore: 'extra.ignore' })
      expect(explicit.files).toHaveLength(1)
    } finally {
      process.chdir(prev)
    }
  })
})
