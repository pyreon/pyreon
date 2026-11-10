/**
 * The `/showcase` gallery. Each entry is an app in `examples/` that was run
 * and screenshotted from the running app; the screenshots live in
 * `public/showcase/`.
 *
 * `highlights` are the packages the card names. `examples.test.ts` checks
 * each one against the example's own `package.json`, so a card cannot keep
 * naming a package the example has stopped using.
 */

export type ShowcaseTheme = 'zero' | 'realtime' | 'native' | 'migrate'

export const THEMES: { id: ShowcaseTheme; label: string; blurb: string }[] = [
  { id: 'zero', label: 'Full-stack with Zero', blurb: 'File routes, server rendering, static generation, data loading.' },
  { id: 'realtime', label: 'Real-time and data', blurb: 'Live collaboration, sync, and large lists that stay fast.' },
  { id: 'native', label: 'Native', blurb: 'One source for the web, iOS and Android.' },
  { id: 'migrate', label: 'Migrating from another framework', blurb: 'Your React, Vue, Solid, Preact or Svelte code on Pyreon.' },
]

export interface Screenshot {
  src: string
  alt: string
  width: number
  height: number
}

export interface ShowcaseExample {
  /** Directory under `examples/`. */
  dir: string
  title: string
  theme: ShowcaseTheme
  /** Two sentences on what it demonstrates. */
  summary: string
  /** Packages named on the card (each is a dependency of `dir`). */
  highlights: string[]
  desktop: Screenshot
  mobile?: Screenshot
  /** Shell commands from the repo root, after cloning and `bun install`. */
  run: string[]
  /** Where to open it once it runs. */
  open: string
  /** Anything the visitor needs to know before running it. */
  note?: string
  /** Static build served from pyreon.dev, when there is one. */
  liveDemo?: string
  /** Extra source directories (the native example's shared app source). */
  alsoSource?: { label: string; dir: string }[]
}

const desktop = (name: string, alt: string): Screenshot => ({
  src: `/showcase/${name}-desktop.webp`,
  alt,
  width: 960,
  height: 600,
})
const mobile = (name: string, alt: string): Screenshot => ({
  src: `/showcase/${name}-mobile.webp`,
  alt,
  width: 360,
  height: 640,
})

export const SHOWCASE: ShowcaseExample[] = [
  {
    dir: 'app-showcase',
    title: 'App showcase',
    theme: 'zero',
    summary:
      'One Zero app with twelve file-routed sections: todos, a blog, chat, kanban, a forms wizard, invoice and resume builders that export PDF and DOCX, an i18n shop and a node-graph editor. Its dashboard puts queries, a sortable table, charts, a virtualized list, role-based permissions and toasts on one page.',
    highlights: ['zero', 'query', 'table', 'charts', 'flow', 'document', 'form', 'permissions', 'ui-components'],
    desktop: desktop('app-showcase', 'The app showcase dashboard: revenue, orders, customer and conversion tiles above an area chart, a bar chart and a combined bar and line chart.'),
    run: ['cd examples/app-showcase', 'bun run dev -- --port 5181'],
    open: 'http://localhost:5181/dashboard',
  },
  {
    dir: 'hn-clone',
    title: 'Hacker News clone',
    theme: 'zero',
    summary:
      'A statically generated Zero app reading the live Hacker News API: top, new, ask, show and jobs feeds, search, bookmarks, a sortable leaderboard and a stats page with charts. It switches between English, Czech and German, and works on a phone.',
    highlights: ['zero', 'query', 'i18n', 'head', 'charts', 'storage', 'toast'],
    desktop: desktop('hn-clone', 'The Hacker News clone front page: an orange header with feed links and a numbered list of stories with points, authors and comment counts.'),
    mobile: mobile('hn-clone', 'The Hacker News clone on a phone: the header wraps onto three lines above the story list.'),
    run: ['cd examples/hn-clone', 'bun run dev -- --port 5235'],
    open: 'http://localhost:5235',
    note: 'Needs an internet connection: the stories come from api.hnpwa.com.',
  },
  {
    dir: 'collab-board',
    title: 'Collaborative board',
    theme: 'realtime',
    summary:
      'A local-first kanban board on @pyreon/sync: open it in two tabs and every edit, presence dot and cursor syncs live, with IndexedDB keeping the board across reloads. Card notes are a shared code editor stored as a CRDT, and a 1,000-card backlog scrolls through a virtualized list.',
    highlights: ['sync', 'dnd', 'virtual', 'code', 'query', 'form', 'toast'],
    desktop: desktop('collab-board', 'The collaborative board: To do, Doing and Done columns with cards, a presence avatar, and a backlog list of 1,000 cards below.'),
    run: ['cd examples/collab-board', 'bun run dev -- --port 5189'],
    open: 'http://localhost:5189',
    note: 'For sync across devices, also run the relay: bun examples/collab-board/relay.ts',
    liveDemo: '/showcase/collab-board/',
  },
  {
    dir: 'native-tasks-web',
    title: 'Tasks, on the web and on device',
    theme: 'native',
    summary:
      'A tasks app written once in examples/native-tasks/src/TasksApp.tsx: sign-in, task lists and detail screens, a dashboard and a chart gallery with calendar, candlestick, Gantt and graph charts. The screenshots are its web build; the same source also compiles to SwiftUI for iOS and Jetpack Compose for Android.',
    highlights: ['primitives', 'charts', 'store', 'router', 'query', 'form', 'auth'],
    desktop: desktop('native-tasks', 'The tasks chart gallery in a desktop browser: a calendar heatmap, a candlestick chart and a Gantt chart.'),
    mobile: mobile('native-tasks', 'The tasks chart gallery at phone width: a calendar heatmap above a candlestick chart.'),
    run: ['cd examples/native-tasks-web', 'bun run dev -- --port 5204'],
    open: 'http://localhost:5204',
    note: 'Sign in with any name of three or more characters, then open “Chart gallery”. The iOS and Android projects are examples/native-tasks-ios and examples/native-tasks-android.',
    alsoSource: [
      { label: 'Shared app source', dir: 'native-tasks' },
      { label: 'iOS project', dir: 'native-tasks-ios' },
      { label: 'Android project', dir: 'native-tasks-android' },
    ],
  },
  {
    dir: 'react-compat',
    title: 'React, Vue, Solid, Preact and Svelte compat',
    theme: 'migrate',
    summary:
      'Five apps, one per framework, each written against that framework’s own API (React hooks, the Vue Composition API, Solid signals, Preact hooks and signals, Svelte stores) and running on Pyreon’s reactive engine through one compiler option. Each pairs an index of the APIs it covers with interactive demos and their source.',
    highlights: ['react-compat', 'core', 'reactivity', 'runtime-dom'],
    desktop: desktop('compat', 'The React compat example: an index of React APIs such as useState and useEffect, and interactive demo cards with a Show Code button.'),
    run: [
      'cd examples/react-compat   # or vue-compat, solid-compat, preact-compat, svelte-compat',
      'bun run dev -- --port 5177',
    ],
    open: 'http://localhost:5177',
    liveDemo: '/showcase/react-compat/',
    alsoSource: [
      { label: 'Vue', dir: 'vue-compat' },
      { label: 'Solid', dir: 'solid-compat' },
      { label: 'Preact', dir: 'preact-compat' },
      { label: 'Svelte', dir: 'svelte-compat' },
    ],
  },
]

export const REPO_URL = 'https://github.com/pyreon/pyreon'

/** GitHub URL of an example's source directory. */
export function sourceUrl(dir: string): string {
  return `${REPO_URL}/tree/main/examples/${dir}`
}
