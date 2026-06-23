import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { RouterView, useRouter } from '@pyreon/router'
import { Link } from '@pyreon/zero/link'
import { I18nProvider, useI18n } from '@pyreon/i18n'
import { Toaster, toast } from '@pyreon/toast'
import { useOnline, useToggle, useEventListener } from '@pyreon/hooks'
import { useHotkey } from '@pyreon/hotkeys'
import { createPermissions, PermissionsProvider } from '@pyreon/permissions'
import { i18n, type Locale } from '../lib/i18n'
import { installBookmarksPersistence } from '../lib/bookmarks'

// Wire bookmarks → localStorage at module load. Must run before any
// route mounts so bookmarks added from /item/:id reach storage even if
// the user never opens /bookmarks during the session.
installBookmarksPersistence()

/**
 * Mock permissions — pretend the visitor is logged-in as a regular user.
 * Toggle `admin: true` to expose the admin-only actions (flag button on
 * /item/[id]). In a real app, this would hydrate from a session/JWT.
 */
const can = createPermissions({
  'posts.read': true,
  'posts.write': true,
  admin: false,
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // HN content updates slowly; 30s stale is plenty.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Globally registered keyboard shortcuts via `@pyreon/hotkeys`. Runs once
 * at app mount inside the layout component. Pressing `?` shows the
 * shortcuts page; `g t` / `g n` / etc. jump between feeds.
 */
function HotkeysRegistry() {
  const router = useRouter()

  // Sequential "g" prefix combos — vim/Gmail style.
  // We track a 1-second "g pressed" window via a module-level signal.
  const { t } = useI18n()

  useHotkey('g t', () => {
    router.push('/')
    toast.info(t('nav.top'))
  })
  useHotkey('g n', () => {
    router.push('/new')
    toast.info(t('nav.new'))
  })
  useHotkey('g a', () => {
    router.push('/ask')
    toast.info(t('nav.ask'))
  })
  useHotkey('g s', () => {
    router.push('/show')
    toast.info(t('nav.show'))
  })
  useHotkey('g j', () => {
    router.push('/jobs')
    toast.info(t('nav.jobs'))
  })
  useHotkey('g b', () => {
    router.push('/bookmarks')
    toast.info(t('nav.bookmarks'))
  })
  useHotkey('g /', () => {
    router.push('/search')
    toast.info(t('nav.search'))
  })
  useHotkey('?', () => router.push('/shortcuts'))

  return null
}

/**
 * The visible offline banner. Uses `useOnline` from `@pyreon/hooks` to
 * track navigator.onLine state. The banner is fixed at the top of the
 * viewport when offline, hidden otherwise.
 */
function OfflineBanner() {
  const online = useOnline()
  const { t } = useI18n()
  return () => (online() ? null : <div class="offline-banner">{t('offline.banner')}</div>)
}

/**
 * Locale selector — three-button cluster in the header. Reading `i18n.locale()`
 * makes the buttons reactive; clicking calls `i18n.setLocale(...)`.
 */
function LocaleSwitcher() {
  const locales: Locale[] = ['en', 'cs', 'de']
  return (
    <div class="locale-switcher">
      {locales.map((l) => (
        <button
          type="button"
          class={() => `locale-btn ${i18n.locale() === l ? 'active' : ''}`}
          onClick={() => {
            // `i18n.locale` is a Signal — write via `.set`, not a method.
            i18n.locale.set(l)
            toast.success(`Locale: ${l.toUpperCase()}`)
          }}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/**
 * Skip-to-content for accessibility. Triggered by a global keyboard
 * listener via `useEventListener` (hook from `@pyreon/hooks`).
 */
function SkipToContent() {
  useEventListener('keydown', (e) => {
    // `/` jumps to main content unless an input has focus.
    if (e.key === '/' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
      e.preventDefault()
      document.querySelector<HTMLElement>('#main')?.focus()
    }
  })

  return (
    <a
      href="#main"
      class="skip-to-content"
      onClick={(e) => {
        e.preventDefault()
        document.querySelector<HTMLElement>('#main')?.focus()
      }}
    >
      Skip to content
    </a>
  )
}

export function layout() {
  // useToggle returns `{ value, toggle, setTrue, setFalse }`.
  const sidebar = useToggle(false)

  return (
    <I18nProvider instance={i18n}>
     <PermissionsProvider value={can}>
      <QueryClientProvider client={queryClient}>
        <SkipToContent />
        <OfflineBanner />
        <HotkeysRegistry />

        <Nav sidebarOpen={sidebar.value} toggleSidebar={sidebar.toggle} />

        <main id="main" tabIndex={-1} class="hn-main">
          <RouterView />
        </main>

        <footer class="hn-footer">
          <span>
            Built with{' '}
            <a href="https://github.com/pyreon/pyreon" target="_blank" rel="noreferrer">
              Pyreon Zero
            </a>{' '}
            · Data from the{' '}
            <a href="https://github.com/HackerNews/API" target="_blank" rel="noreferrer">
              Hacker News API
            </a>
          </span>
        </footer>

        <Toaster position="bottom-right" />
      </QueryClientProvider>
     </PermissionsProvider>
    </I18nProvider>
  )
}

interface NavProps {
  sidebarOpen: () => boolean
  toggleSidebar: () => void
}

function Nav(_props: NavProps) {
  const { t } = useI18n()
  return (
    <header class="hn-header">
      <div class="hn-header-inner">
        <Link href="/" class="hn-logo" prefetch="viewport">
          <span class="hn-y">Y</span>
          <span>Hacker News (Pyreon)</span>
        </Link>
        <nav class="hn-nav">
          <Link href="/" prefetch="hover" exactActiveClass="nav-active">
            {() => t('nav.top')}
          </Link>
          <Link href="/new" prefetch="hover" exactActiveClass="nav-active">
            {() => t('nav.new')}
          </Link>
          <Link href="/ask" prefetch="hover" exactActiveClass="nav-active">
            {() => t('nav.ask')}
          </Link>
          <Link href="/show" prefetch="hover" exactActiveClass="nav-active">
            {() => t('nav.show')}
          </Link>
          <Link href="/jobs" prefetch="hover" exactActiveClass="nav-active">
            {() => t('nav.jobs')}
          </Link>
          <Link href="/search" prefetch="hover" activeClass="nav-active">
            {() => t('nav.search')}
          </Link>
          <Link href="/bookmarks" prefetch="hover" activeClass="nav-active">
            {() => t('nav.bookmarks')}
          </Link>
          <Link href="/submit" prefetch="hover" activeClass="nav-active">
            {() => t('nav.submit')}
          </Link>
          <Link href="/stats" prefetch="hover" activeClass="nav-active">
            {() => t('nav.stats')}
          </Link>
          <Link href="/leaderboard" prefetch="hover" activeClass="nav-active">
            {() => t('nav.leaderboard')}
          </Link>
          <Link href="/prefs" prefetch="hover" activeClass="nav-active">
            {() => t('nav.prefs')}
          </Link>
          <Link href="/todos" prefetch="hover" activeClass="nav-active">
            {() => t('nav.todos')}
          </Link>
          <Link href="/shortcuts" prefetch="hover" activeClass="nav-active">
            {() => t('nav.shortcuts')}
          </Link>
        </nav>
        <LocaleSwitcher />
      </div>
    </header>
  )
}
