import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * `no-window-in-ssr` and code that only runs in response to a browser event.
 *
 * Server rendering calls a component body and the synchronous helpers it
 * calls; it never dispatches an event, calls a `ref`, or fires a library's
 * `on*` callback. The rule used to treat every function body as render-time
 * code, so `onSuccess: () => { window.location.href = '/posts' }` in a
 * scaffolded create-zero page was an ERROR and `bun run lint` failed on a
 * fresh project. These lock the class both ways: event-only code is quiet,
 * and code that really runs during SSR is still reported.
 */
const run = (src: string) =>
  lintFile('/p/src/page.tsx', src, allRules, { rules: { 'pyreon/no-window-in-ssr': 'error' } })
    .diagnostics.length

describe('no-window-in-ssr — event-only code is not an SSR hazard', () => {
  it('a library `on*` option callback (the create-zero posts/new.tsx shape)', () => {
    const src = `declare const posts: any
export default function NewPostPage() {
  const form = posts.useForm({
    onSuccess: () => {
      window.location.href = "/posts"
    },
  })
  return <form>{form}</form>
}`
    expect(run(src)).toBe(0)
  })

  it('an inline JSX event handler and a ref callback', () => {
    expect(run(`export const C = () => <button onClick={() => window.scrollTo(0, 0)}>x</button>`)).toBe(0)
    expect(run(`export const C = () => <div ref={(el) => document.body.append(el)} />`)).toBe(0)
  })

  it('a local handler referenced only from event slots', () => {
    const src = `export function C() {
  const go = () => { window.location.href = '/x' }
  function back() { history.back() }
  return <><button onClick={go}>go</button><button onDblClick={back}>back</button></>
}`
    expect(run(src)).toBe(0)
  })

  it('a helper called only from a handler, through a chain', () => {
    const src = `function hardReload() { location.reload() }
function onFail() { hardReload() }
export const C = () => <form onSubmit={onFail} />`
    expect(run(src)).toBe(0)
  })
})

describe('no-window-in-ssr — code that runs during SSR is still reported', () => {
  it('module scope and the component body', () => {
    expect(run(`export const w = window.innerWidth`)).toBe(1)
    expect(run(`export function C() { const w = window.innerWidth; return <i>{w}</i> }`)).toBe(1)
  })

  it('a helper called from the body, even when it is ALSO used as a handler', () => {
    expect(run(`function w() { return window.innerWidth }\nexport function C() { const x = w(); return <i>{x}</i> }`)).toBe(1)
    expect(run(`function w() { return window.innerWidth }\nexport function C() { w(); return <i onClick={w} /> }`)).toBe(1)
  })

  it('timers and promise callbacks scheduled from the body run on the server too', () => {
    expect(run(`export function C() { setTimeout(() => window.scrollTo(0, 0), 10); return <i /> }`)).toBe(1)
    expect(run(`export function C() { fetch('/x').then(() => location.reload()); return <i /> }`)).toBe(1)
    expect(run(`export function C() { new Promise(() => window.alert(1)); return <i /> }`)).toBe(1)
  })

  it('an accessor rendered as a child is called during render', () => {
    expect(run(`export function C() { const w = () => window.innerWidth; return <i>{w}</i> }`)).toBe(1)
  })

  it('a non-event prop (`render`, `children`, `value`) is not an event slot', () => {
    expect(run(`declare const List: any\nexport const C = () => <List render={() => window.innerWidth} />`)).toBe(1)
  })

  it('an exported function may be called elsewhere during SSR', () => {
    expect(run(`export function go() { location.reload() }\nexport const C = () => <i onClick={go} />`)).toBe(1)
  })

  it('a name bound twice cannot be resolved by name, so it stays reported', () => {
    const src = `function a() { const go = () => location.reload(); go() }
export function C() { const go = () => location.reload(); return <i onClick={go} /> }`
    expect(run(src)).toBe(2)
  })
})
