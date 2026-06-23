import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/a11y',
  title: 'Accessibility Primitives',
  tagline:
    'Accessibility primitives — announce() screen-reader live regions, <VisuallyHidden>, createA11yId, zero setup',
  description:
    'Zero-setup accessibility building blocks for Pyreon. `announce(message)` speaks status updates and errors to screen readers via an `aria-live` region that is created lazily on first call — no provider, no component to mount, SSR-safe (no-op on the server). `<VisuallyHidden>` renders content that is invisible on screen but kept in the accessibility tree (unlike `display:none`). `createA11yId(prefix?)` produces stable, SSR-safe ids for ARIA relationship attributes (`aria-labelledby` / `aria-describedby` / `for`). The shared foundation other Pyreon packages build on for out-of-the-box accessibility.',
  category: 'browser',
  features: [
    'announce(message) — speak status/errors to screen readers via a lazily-created aria-live region; zero setup, no provider, SSR-safe no-op',
    'polite (default, queued) and assertive (interrupts) politeness; clearAfter to auto-empty stale text; identical repeats re-announced via clear-then-set',
    '<VisuallyHidden> — content invisible on screen but kept in the accessibility tree (unlike display:none)',
    'createA11yId(prefix?) — stable SSR-safe ids for aria-labelledby / aria-describedby / for relationships',
    '<RouteAnnouncer> / useRouteAnnouncer() (@pyreon/a11y/router) — announce client-side route changes to screen readers (the SPA navigation gap); one router afterEach hook → polite live region',
  ],
  longExample: `import { announce, VisuallyHidden, createA11yId } from '@pyreon/a11y'

// Speak a message to screen-reader users — no provider, no setup:
announce('Settings saved')
announce('Connection lost', { politeness: 'assertive' }) // interrupts
announce('Copied', { clearAfter: 1000 })

// Visually-hidden but screen-reader-accessible content:
function IconButton() {
  return (
    <button>
      <SearchIcon />
      <VisuallyHidden>Search</VisuallyHidden>
    </button>
  )
}

// Stable SSR-safe id to wire ARIA relationships:
function Field() {
  const hintId = createA11yId('hint')
  return (
    <>
      <input aria-describedby={hintId} />
      <span id={hintId}>Must be at least 8 characters</span>
    </>
  )
}`,
  api: [
    {
      name: 'announce',
      kind: 'function',
      signature: 'announce(message: string, options?: { politeness?: "polite" | "assertive"; clearAfter?: number }): void',
      summary:
        'Speak a message to screen readers via an aria-live region. Lazily creates a visually-hidden region on document.body on first call and reuses it — zero setup, no provider. Clears the region then writes on the next frame so two identical consecutive messages still re-announce. No-op on the server.',
      example: `announce('Item added to cart')\nannounce('Error: name is required', { politeness: 'assertive' })`,
      mistakes: [
        'Using `assertive` for routine status updates — it interrupts whatever the screen reader is saying. Reserve it for errors and time-critical alerts; default `polite` queues politely.',
        'Calling announce() during SSR expecting output — it is a no-op on the server. Announcements are client-side, user-triggered events; trigger them in handlers / effects, not render.',
        'Expecting visible UI — the live region is visually hidden by design. Render your own visible toast/status separately; announce() is the screen-reader channel.',
      ],
    },
    {
      name: 'VisuallyHidden',
      kind: 'component',
      signature: 'function VisuallyHidden(props: { as?: string; children?: VNodeChild; [key: string]: unknown }): VNodeChild',
      summary:
        'Render content invisible on screen but kept in the accessibility tree (unlike display:none / the hidden attribute). For labels and status text sighted users get from visual context but assistive-tech users need spelled out. Defaults to a <span>; pass `as` for a different tag. Caller styles merge over the clipping base.',
      example: `<button><SearchIcon /><VisuallyHidden>Search</VisuallyHidden></button>`,
      mistakes: [
        'Using `display:none` or the `hidden` attribute instead — those remove the content from the accessibility tree, so screen readers never see it. VisuallyHidden clips it but keeps it readable.',
        'Putting interactive controls inside it — a visually-hidden focusable element is a keyboard trap for sighted keyboard users (focus jumps to invisible content). Keep it to non-interactive text.',
      ],
    },
    {
      name: 'createA11yId',
      kind: 'function',
      signature: 'createA11yId(prefix?: string): string',
      summary:
        "Generate a stable, SSR-safe unique id for ARIA relationship attributes (aria-labelledby / aria-describedby / aria-controls / for). Wraps @pyreon/core's createUniqueId so server and client agree — no hydration mismatch. The optional prefix is cosmetic (DOM-inspection readability).",
      example: `const id = createA11yId('hint')\n<input aria-describedby={id} /><span id={id}>…</span>`,
      mistakes: [
        'Calling it at module scope and sharing one id across many instances — call it inside the component so each instance gets its own id, or two elements will collide.',
        'Hardcoding ids instead — duplicate ids across a page break aria-labelledby/describedby resolution. createA11yId guarantees uniqueness.',
      ],
    },
    {
      name: 'RouteAnnouncer',
      kind: 'component',
      signature:
        "import { RouteAnnouncer } from '@pyreon/a11y/router'\nfunction RouteAnnouncer(props?: { format?: (to, from) => string | null; politeness?: 'polite' | 'assertive'; clearAfter?: number; announceInitial?: boolean }): null",
      summary:
        "Announce client-side route changes to screen-reader users — the canonical SPA accessibility gap (single-page navigations change the URL + DOM but fire no page-load event, so assistive tech never says \"you are now on <page>\"). Renders nothing; registers ONE router afterEach hook that pushes the destination route's meta.title (or \"Navigated to <path>\") to a polite aria-live region via announce(). Drop one near the router root. Imported from the @pyreon/a11y/router subpath so the base @pyreon/a11y entry stays router-free.",
      example: `<RouterProvider router={router}>\n  <RouteAnnouncer />\n  <RouterView />\n</RouterProvider>`,
      mistakes: [
        'Importing it from `@pyreon/a11y` instead of `@pyreon/a11y/router` — the router integration lives in the subpath so the base entry never pulls @pyreon/router into bundles that only use announce()/VisuallyHidden.',
        'Mounting more than one — each registers its own afterEach hook, so the route gets announced N times. Mount exactly one, in a component that lives for the app\'s lifetime (the root layout).',
        'Expecting it to announce the initial page load — it does not by default (the screen reader already reads a freshly-loaded page; a redundant announcement is noise). Set `announceInitial` only when the announcer mounts after the first navigation already committed.',
        'Relying on it for `<head>`-driven dynamic titles — the default reads `route.meta.title`; if you set titles via @pyreon/head at runtime, pass a `format` callback that returns the live title.',
      ],
    },
    {
      name: 'useRouteAnnouncer',
      kind: 'function',
      signature:
        "import { useRouteAnnouncer } from '@pyreon/a11y/router'\nuseRouteAnnouncer(options?: RouteAnnouncerOptions): void",
      summary:
        'Hook form of <RouteAnnouncer>. Call once from a long-lived component to announce route changes. Registers a single router afterEach hook (auto-removed on unmount) and announces via the zero-setup announce() polite live region. SSR-safe — the hook only registers in onMount and announce() no-ops on the server.',
      example: `useRouteAnnouncer({ format: (to) => \`\${to.meta.title ?? to.path} page\` })`,
      mistakes: [
        'Calling it in a component that mounts/unmounts per navigation — the hook would re-register each time. Call it in the persistent root layout, not a per-route page.',
        'Using it without a <RouterProvider> in scope — it calls useRouter(), which throws if no router is installed.',
      ],
    },
  ],
})
