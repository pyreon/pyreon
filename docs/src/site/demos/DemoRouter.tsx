import { For } from '@pyreon/core'
import type { NavigationGuard, NavigationResult, ResolvedRoute, RouteRecord } from '@pyreon/router'
import { resolveRoute, stringifyQuery } from '@pyreon/router'
import { signal } from '@pyreon/reactivity'
import { font, paper } from '../theme'
import { el, txt } from '../kit/bases'
import { DemoSurface, GlowCard } from '../kit/cards'
import { DemoGrid, PaperHint } from '../kit/demo'
import { ButtonRow, CardNote, createLog, DemoLog, PaperText, PaperToggle } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * Router demo (`router.json` → demo): links, a typed `:id` param, a loader
 * and a sign-in guard on Settings, plus a status line with what each
 * navigation resolved to and a Back button.
 *
 * The route table, `resolveRoute` (the router's own matcher, which produces
 * the typed params) and the `beforeEnter` / `loader` functions are the real
 * `@pyreon/router` shapes. The navigation itself is driven by a small
 * in-memory history in this file: `createRouter` always binds to
 * `window.history` (hash or history mode), and this page's URL already
 * belongs to the site's own router, so a second router instance would fight
 * it for the address bar. Tracked in #4372 (a
 * memory history mode); the on-screen note says so.
 */

const USERS: Record<string, string> = { '1': 'Ada Lovelace', '2': 'Grace Hopper' }

const LINKS = [
  { path: '/', label: 'Home' },
  { path: '/user/1', label: 'Ada' },
  { path: '/user/2', label: 'Grace' },
  { path: '/settings', label: 'Settings' },
] as const

const UrlBar = el
  .config({ name: 'RouterUrlBar' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 0 })
  .theme(() => ({
    minHeight: 36,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 8,
    border: `1px solid ${paper.line}`,
    backgroundColor: paper.field,
    fontFamily: font.mono,
    fontSize: 12.5,
    color: paper.fog,
    overflowWrap: 'anywhere',
    extendCss: `& b { color: ${paper.text}; font-weight: 500; }`,
  }))

const View = el
  .config({ name: 'RouterView' })
  .attrs({ block: true, gap: 6 })
  .theme(() => ({ minHeight: 120, paddingTop: 14, paddingBottom: 14, borderTop: `1px solid ${paper.line}`, borderBottom: `1px solid ${paper.line}` }))

const ViewTitle = txt
  .config({ name: 'RouterViewTitle' })
  .attrs({ tag: 'h3' })
  .theme(() => ({ margin: 0, fontSize: 20, fontWeight: 650, color: paper.text }))

const Meta = txt
  .config({ name: 'RouterMeta' })
  .attrs({ tag: 'p' })
  .theme(() => ({ margin: 0, fontFamily: font.mono, fontSize: 12, color: paper.fog }))

const Check = el
  .config({ name: 'RouterSignedIn' })
  .attrs({ tag: 'label', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({
    marginTop: 12,
    fontSize: 14,
    fontWeight: 500,
    color: paper.text,
    cursor: 'pointer',
    extendCss: `& input { width: 16px; height: 16px; accent-color: ${paper.accent}; } & input:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }`,
  }))

/** The path plus query, as the address bar shows it. */
const hrefOf = (r: ResolvedRoute): string => `${r.path}${stringifyQuery(r.query)}`

interface Entry {
  route: ResolvedRoute
  data: string | undefined
}

export default function DemoRouter() {
  const signedIn = signal(false)
  const loading = signal(false)
  const status = signal('')
  const log = createLog(30)

  // ── the app's routes: real RouteRecord / NavigationGuard / loader shapes ──
  const requireAuth: NavigationGuard = (to) => (signedIn.peek() ? true : `/login?returnTo=${encodeURIComponent(to.path)}`)
  const loadUser = async (ctx: { params: Record<string, string> }): Promise<string | undefined> => {
    // A fake network: the delay shows the loader running before the view.
    // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
    await new Promise((r) => setTimeout(r, 350))
    return USERS[ctx.params.id ?? '']
  }
  const Empty = () => null
  const routes: RouteRecord[] = [
    { path: '/', name: 'home', component: Empty },
    { path: '/user/:id', name: 'user', component: Empty, loader: loadUser },
    { path: '/settings', name: 'settings', component: Empty, beforeEnter: requireAuth },
    { path: '/login', name: 'login', component: Empty },
  ]

  // ── an in-memory history (see the file comment) ──
  const stack = signal<readonly Entry[]>([{ route: resolveRoute('/', routes), data: undefined }])
  const index = signal(0)
  const current = () => stack()[index()] as Entry

  let seq = 0
  async function navigate(path: string, how: 'push' | 'back', depth = 0): Promise<NavigationResult> {
    const id = ++seq
    const from = current().route
    const to = resolveRoute(path, routes)
    if (to.matched.length === 0) return 'cancelled'
    for (const record of to.matched) {
      const guard = record.beforeEnter
      const guards = guard === undefined ? [] : Array.isArray(guard) ? guard : [guard]
      for (const g of guards) {
        const verdict = await g(to, from)
        log.push(`  beforeEnter(${to.path}) → ${verdict === true ? 'true' : JSON.stringify(verdict)}`, 'dim')
        if (verdict === false) return 'cancelled'
        if (typeof verdict === 'string' && depth < 3) return navigate(verdict, how, depth + 1)
      }
    }
    let data: string | undefined
    const leaf = to.matched[to.matched.length - 1]
    if (leaf?.loader) {
      loading.set(true)
      data = (await leaf.loader({ params: to.params, query: to.query, signal: new AbortController().signal })) as string | undefined
      loading.set(false)
      log.push(`  loader(${JSON.stringify(to.params)}) → ${JSON.stringify(data)}`, 'dim')
      // A newer navigation started while this loader ran: it wins.
      if (id !== seq) return 'superseded'
    }
    const entry = { route: to, data }
    if (how === 'push') {
      stack.set([...stack.peek().slice(0, index.peek() + 1), entry])
      index.set(index.peek() + 1)
    } else {
      // Back lands on the target the guards allowed (a redirect replaces the entry).
      const next = [...stack.peek()]
      next[index.peek()] = entry
      stack.set(next)
    }
    return 'committed'
  }

  async function push(path: string) {
    log.push(`router.push('${path}')`)
    const result = await navigate(path, 'push')
    const landed = hrefOf(current().route)
    status.set(`push('${path}') → '${result}'${landed !== path ? `, now at ${landed}` : ''}`)
    log.push(`→ ${result}`, result === 'committed' ? 'ok' : 'err')
  }

  async function back() {
    if (index.peek() === 0) return
    index.set(index.peek() - 1)
    const target = hrefOf(current().route)
    log.push(`router.back() → ${target}`)
    const result = await navigate(target, 'back')
    status.set(`back() → '${result}', now at ${hrefOf(current().route)}`)
    log.push(`→ ${result}`, result === 'committed' ? 'ok' : 'err')
  }

  function setSignedIn(next: boolean) {
    signedIn.set(next)
    log.push(next ? 'signed in' : 'signed out', 'accent')
    const name = current().route.matched[current().route.matched.length - 1]?.name
    if (next && name === 'login') void push(current().route.query.returnTo ?? '/settings')
    // Signing out on a protected page sends you home, like an app would.
    if (!next && name === 'settings') void push('/')
  }

  const name = () => current().route.matched[current().route.matched.length - 1]?.name
  const isActive = (path: string) => (path === '/' ? current().route.path === '/' : (current().route.path ?? '').startsWith(path))

  return (
    <DemoGrid>
      <DemoSurface aria-label="Router demo app">
        <UrlBar aria-label="Address">
          app.example.com<b>{() => hrefOf(current().route)}</b>
        </UrlBar>
        <ButtonRow>
          <PaperToggle type="button" onClick={() => void back()} disabled={index() === 0} aria-label="Back">
            ← Back
          </PaperToggle>
          <For each={LINKS} by={(l) => l.path}>
            {(l) => (
              <PaperToggle type="button" aria-pressed={() => (isActive(l.path) ? 'true' : 'false')} onClick={() => void push(l.path)}>
                {l.label}
              </PaperToggle>
            )}
          </For>
        </ButtonRow>
        <View aria-live="polite" aria-busy={loading()}>
          {() => {
            const n = name()
            const r = current().route
            if (loading()) return <PaperText>loader running…</PaperText>
            if (n === 'user')
              return (
                <>
                  <Meta>{`useParams() → { id: "${r.params.id ?? ''}" } · loader ran`}</Meta>
                  <ViewTitle>{current().data ?? 'Unknown user'}</ViewTitle>
                </>
              )
            if (n === 'settings')
              return (
                <>
                  <ViewTitle>Settings</ViewTitle>
                  <PaperText>beforeEnter passed: you are signed in.</PaperText>
                </>
              )
            if (n === 'login')
              return (
                <>
                  <ViewTitle>Sign in</ViewTitle>
                  <PaperText>beforeEnter redirected here. returnTo keeps you on this site.</PaperText>
                </>
              )
            return (
              <>
                <ViewTitle>Home</ViewTitle>
                <PaperText>Pick a user or open settings.</PaperText>
              </>
            )
          }}
        </View>
        <Check>
          <input type="checkbox" checked={() => signedIn()} onChange={(e: Event) => setSignedIn((e.currentTarget as HTMLInputElement).checked)} />
          Signed in
        </Check>
        <PaperHint aria-live="polite">{() => status()}</PaperHint>
      </DemoSurface>
      <GlowCard padding="compact">
        <Eyebrow>navigation log</Eyebrow>
        <DemoLog label="Navigation log" entries={() => log.entries()} empty="Click a link." />
        <CardNote>
          The route table, the matcher (resolveRoute) and the guard and loader are @pyreon/router's. The history is kept in memory here, because this page's
          address bar belongs to the site's own router.
        </CardNote>
      </GlowCard>
    </DemoGrid>
  )
}
