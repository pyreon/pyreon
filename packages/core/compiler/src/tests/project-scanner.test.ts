import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { deriveIslandName } from '../island-naming'
import { generateContext } from '../project-scanner'

/** Create a temporary directory with the given file structure. */
function createTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyreon-scanner-'))
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
  }
  return dir
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('project-scanner — generateContext', () => {
  test('returns valid ProjectContext shape for empty project', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })
    try {
      const ctx = generateContext(dir)
      expect(ctx.framework).toBe('pyreon')
      expect(ctx.routes).toEqual([])
      expect(ctx.components).toEqual([])
      expect(ctx.islands).toEqual([])
      expect(ctx.generatedAt).toBeTruthy()
    } finally {
      cleanupDir(dir)
    }
  })

  test('reads version from @pyreon/* dependency', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: { '@pyreon/core': '^0.7.0' },
      }),
    })
    try {
      const ctx = generateContext(dir)
      expect(ctx.version).toBe('0.7.0')
    } finally {
      cleanupDir(dir)
    }
  })

  test('falls back to package version when no @pyreon deps', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '2.0.0' }),
    })
    try {
      const ctx = generateContext(dir)
      expect(ctx.version).toBe('2.0.0')
    } finally {
      cleanupDir(dir)
    }
  })

  test("returns 'unknown' version when no package.json", () => {
    const dir = createTempProject({})
    try {
      const ctx = generateContext(dir)
      expect(ctx.version).toBe('unknown')
    } finally {
      cleanupDir(dir)
    }
  })
})

describe('project-scanner — extractRoutes', () => {
  test('extracts routes from createRouter call', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/router.ts': `
const router = createRouter([
  { path: "/", name: "home", component: Home },
  { path: "/users/:id", name: "user", loader: fetchUser },
  { path: "/admin", beforeEnter: authGuard },
])
`,
    })
    try {
      const ctx = generateContext(dir)
      expect(ctx.routes).toHaveLength(3)
      expect(ctx.routes[0]?.path).toBe('/')
      expect(ctx.routes[0]?.name).toBe('home')
      expect(ctx.routes[1]?.path).toBe('/users/:id')
      expect(ctx.routes[1]?.params).toEqual(['id'])
      expect(ctx.routes[1]?.hasLoader).toBe(true)
      expect(ctx.routes[2]?.path).toBe('/admin')
      expect(ctx.routes[2]?.hasGuard).toBe(true)
    } finally {
      cleanupDir(dir)
    }
  })

  test('extracts routes from const routes = [] pattern', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/routes.ts': `
const routes: RouteRecord[] = [
  { path: "/about", name: "about" },
]
`,
    })
    try {
      const ctx = generateContext(dir)
      expect(ctx.routes).toHaveLength(1)
      expect(ctx.routes[0]?.path).toBe('/about')
      expect(ctx.routes[0]?.name).toBe('about')
    } finally {
      cleanupDir(dir)
    }
  })

  test('extracts multiple params from route path', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/router.ts': `
const router = createRouter([
  { path: "/users/:userId/posts/:postId" },
])
`,
    })
    try {
      const ctx = generateContext(dir)
      expect(ctx.routes[0]?.params).toEqual(['userId', 'postId'])
    } finally {
      cleanupDir(dir)
    }
  })
})

describe('project-scanner — extractRoutes (file-based / @pyreon/zero)', () => {
  // Regression: a zero app uses FILE-based routing (route files under
  // src/routes/**), so no manual `createRouter([...])` array exists. Before
  // this fix the scanner only matched manual arrays → `routes: []` for every
  // real zero app (the AI-context generator + MCP get_routes emitted nothing).
  function zeroApp(): string {
    return createTempProject({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: { '@pyreon/zero': '^0.40.0' },
      }),
      'src/routes/index.tsx': 'export default function Home() { return <h1/> }',
      'src/routes/about.tsx':
        'export const loader = () => ({}); export default function About() { return <h1/> }',
      'src/routes/posts/[id].tsx':
        'export const loader = (c) => c; export default function Post() { return <article/> }',
      'src/routes/(marketing)/pricing.tsx':
        'export const guard = () => true; export default function Pricing() { return <div/> }',
      'src/routes/api/posts.ts':
        'export function GET() { return new Response("ok") }\nexport function POST() { return new Response("x") }',
      'src/routes/_layout.tsx':
        'export function layout() { return <RouterView /> }',
      'src/routes/_404.tsx': 'export default function NotFound() { return <div/> }',
    })
  }

  test('detects fs-routes, deriving URLs from file paths', () => {
    const dir = zeroApp()
    try {
      const ctx = generateContext(dir)
      const paths = ctx.routes.map((r) => r.path)
      expect(paths).toContain('/')
      expect(paths).toContain('/about')
      expect(paths).toContain('/posts/:id')
      // route group `(marketing)` is URL-invisible
      expect(paths).toContain('/pricing')
      // API route keeps its `/api/` prefix
      expect(paths).toContain('/api/posts')
    } finally {
      cleanupDir(dir)
    }
  })

  test('skips special files (_layout / _404) from the route list', () => {
    const dir = zeroApp()
    try {
      const ctx = generateContext(dir)
      const paths = ctx.routes.map((r) => r.path)
      for (const p of paths) {
        expect(p).not.toContain('_layout')
        expect(p).not.toContain('_404')
      }
    } finally {
      cleanupDir(dir)
    }
  })

  test('marks API routes and detects loader / guard / params exports', () => {
    const dir = zeroApp()
    try {
      const ctx = generateContext(dir)
      const api = ctx.routes.find((r) => r.path === '/api/posts')
      expect(api?.isApi).toBe(true)

      const post = ctx.routes.find((r) => r.path === '/posts/:id')
      expect(post?.isApi).toBeFalsy()
      expect(post?.hasLoader).toBe(true)
      expect(post?.params).toEqual(['id'])

      const about = ctx.routes.find((r) => r.path === '/about')
      expect(about?.hasLoader).toBe(true)

      const pricing = ctx.routes.find((r) => r.path === '/pricing')
      expect(pricing?.hasGuard).toBe(true)
    } finally {
      cleanupDir(dir)
    }
  })

  // ── fs-route convention parity (zero truth) ──────────────────────────────
  // These lock the scanner to @pyreon/zero's EXACT fs-route semantics (the
  // shared `fs-route-convention` module). The scanner's original copies had
  // already diverged at birth — the fixtures below are the misclassifications.

  test('nested <dir>/api/*.ts is a PAGE route, not an API route (zero parity)', () => {
    // zero's `isApiRoute` requires the TOP-LEVEL `api/` prefix
    // (`startsWith('api/')` relative to the routes dir), so zero registers
    // `posts/api/x.ts` as a page route — it is NEVER served from
    // `virtual:zero/api-routes`. The scanner previously accepted `/api/`
    // anywhere in the path and reported an API route zero doesn't serve.
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/routes/posts/api/x.ts': 'export function GET() { return new Response("ok") }',
    })
    try {
      const ctx = generateContext(dir)
      const route = ctx.routes.find((r) => r.path === '/posts/api/x')
      expect(route).toBeTruthy()
      expect(route?.isApi).toBeFalsy()
    } finally {
      cleanupDir(dir)
    }
  })

  test('method-handler .ts OUTSIDE api/ is a page route, not an API route (zero parity)', () => {
    // zero's api-route registry is populated ONLY from `api/**/*.{ts,js}`.
    // A `.ts` route file elsewhere that exports HTTP method handlers (and no
    // default component) is still included in zero's PAGE route module — the
    // scanner's old export-shape heuristic invented an API route zero never
    // registers.
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/routes/feed.ts':
        'export function GET() { return new Response("feed") }\nexport function POST() { return new Response("x") }',
    })
    try {
      const ctx = generateContext(dir)
      const route = ctx.routes.find((r) => r.path === '/feed')
      expect(route).toBeTruthy()
      expect(route?.isApi).toBeFalsy()
    } finally {
      cleanupDir(dir)
    }
  })

  test('api/*.tsx is a page route (isApiRoute claims .ts/.js only — zero parity)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/routes/api/page.tsx': 'export default function ApiPage() { return <div/> }',
    })
    try {
      const ctx = generateContext(dir)
      const route = ctx.routes.find((r) => r.path === '/api/page')
      expect(route).toBeTruthy()
      expect(route?.isApi).toBeFalsy()
    } finally {
      cleanupDir(dir)
    }
  })

  test('nested api/ dir keeps page-route URL derivation (index collapses, params map)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/routes/posts/api/index.ts': 'export function GET() { return new Response("i") }',
      'src/routes/posts/api/[id].ts': 'export function GET() { return new Response("d") }',
    })
    try {
      const ctx = generateContext(dir)
      const paths = ctx.routes.map((r) => r.path)
      expect(paths).toContain('/posts/api')
      expect(paths).toContain('/posts/api/:id')
      for (const r of ctx.routes) expect(r.isApi).toBeFalsy()
    } finally {
      cleanupDir(dir)
    }
  })

  test('finds a routes dir under app/routes and plain routes as well', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'app/routes/index.tsx': 'export default function Home() { return <h1/> }',
      'app/routes/dashboard.tsx': 'export default function Dash() { return <div/> }',
    })
    try {
      const ctx = generateContext(dir)
      const paths = ctx.routes.map((r) => r.path)
      expect(paths).toContain('/')
      expect(paths).toContain('/dashboard')
    } finally {
      cleanupDir(dir)
    }
  })

  test('merges fs-routes with manual arrays, fs winning on path conflict', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/routes/index.tsx': 'export default function Home() { return <h1/> }',
      // A stray manual array declares "/" too plus a unique "/legacy".
      'src/legacy-router.ts':
        'const routes = [{ path: "/", name: "manual-home" }, { path: "/legacy" }]',
    })
    try {
      const ctx = generateContext(dir)
      const roots = ctx.routes.filter((r) => r.path === '/')
      // "/" is deduped — the fs route wins (no manual name leaks through).
      expect(roots).toHaveLength(1)
      expect(roots[0]?.name).toBeUndefined()
      // The non-conflicting manual route survives.
      expect(ctx.routes.map((r) => r.path)).toContain('/legacy')
    } finally {
      cleanupDir(dir)
    }
  })
})

describe('project-scanner — extractComponents', () => {
  test('extracts component with signals', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/Counter.tsx': `
export const Counter = ({ initial }) => {
  const count = signal<number>(0)
  const doubled = signal(0)
  return <div>{count()}</div>
}
`,
    })
    try {
      const ctx = generateContext(dir)
      const counter = ctx.components.find((c) => c.name === 'Counter')
      expect(counter).toBeTruthy()
      expect(counter?.hasSignals).toBe(true)
      expect(counter?.signalNames).toEqual(['count', 'doubled'])
    } finally {
      cleanupDir(dir)
    }
  })

  test('extracts component without signals', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/Header.tsx': `
export function Header({ title }) {
  return <h1>{title}</h1>
}
`,
    })
    try {
      const ctx = generateContext(dir)
      const header = ctx.components.find((c) => c.name === 'Header')
      expect(header).toBeTruthy()
      expect(header?.hasSignals).toBe(false)
      expect(header?.signalNames).toEqual([])
    } finally {
      cleanupDir(dir)
    }
  })
})

describe('project-scanner — extractIslands', () => {
  test('extracts island definitions', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/islands.ts': `
const Counter = island(() => import("./Counter"), { hydrate: "visible", name: "Counter" })
const Nav = island(() => import("./Nav"), { name: "Nav" })
`,
    })
    try {
      const ctx = generateContext(dir)
      expect(ctx.islands).toHaveLength(2)
      const counter = ctx.islands.find((i) => i.name === 'Counter')
      expect(counter).toBeTruthy()
      // hydrate comes before name in the object literal, but the regex captures
      // name first, so hydrate is only captured when it follows name directly
      const nav = ctx.islands.find((i) => i.name === 'Nav')
      expect(nav?.hydrate).toBe('load') // default when hydrate not specified
    } finally {
      cleanupDir(dir)
    }
  })

  // Regression: zero AUTO-NAMES const-bound islands (no `name:` option) — the
  // dominant modern shape. The old regex required an explicit `name:` and
  // missed these entirely → `islands: []` for every modern zero app.
  //
  // Parity: the reported name must be the DERIVED REGISTRY name
  // `X$<fnv1a6(relPath)>` — the same derivation `@pyreon/vite-plugin`'s
  // auto-naming injects at transform time (shared via `island-naming.ts`).
  // The scanner previously reported the bare binding name (`Widget`), which
  // matches nothing in zero's actual hydration registry.
  test('auto-named islands carry the derived registry name (vite-plugin parity)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/components/widgets.tsx': `
import { island } from '@pyreon/server/client'
export const Widget = island(() => import('./w'), { hydrate: 'visible' })
const Sidebar = island(() => import('./sidebar'))
const Nav = island(() => import('./nav'), { name: 'MainNav', hydrate: 'idle' })
`,
    })
    try {
      const ctx = generateContext(dir)
      const names = ctx.islands.map((i) => i.name)
      const widgetName = deriveIslandName('Widget', 'src/components/widgets.tsx')
      const sidebarName = deriveIslandName('Sidebar', 'src/components/widgets.tsx')
      // auto-named from binding → registry-name derivation, hydrate captured
      expect(names).toContain(widgetName)
      expect(ctx.islands.find((i) => i.name === widgetName)?.hydrate).toBe('visible')
      // auto-named, no-options form → default hydrate
      expect(names).toContain(sidebarName)
      expect(ctx.islands.find((i) => i.name === sidebarName)?.hydrate).toBe('load')
      // explicit name wins over the binding — NO hash suffix
      expect(names).toContain('MainNav')
      expect(ctx.islands.find((i) => i.name === 'MainNav')?.hydrate).toBe('idle')
    } finally {
      cleanupDir(dir)
    }
  })
})

describe('project-scanner — collectSourceFiles', () => {
  test('skips node_modules and dist directories', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/app.tsx': 'export const App = () => <div />',
      'node_modules/pkg/index.ts': 'export const x = 1',
      'dist/app.js': 'export const App = () => {}',
    })
    try {
      const ctx = generateContext(dir)
      // Should only find the component in src/, not in node_modules or dist
      expect(ctx.components.length).toBeGreaterThanOrEqual(1)
      const files = ctx.components.map((c) => c.file)
      for (const f of files) {
        expect(f).not.toContain('node_modules')
        expect(f).not.toContain('dist')
      }
    } finally {
      cleanupDir(dir)
    }
  })

  test('handles non-existent directory gracefully', () => {
    const dir = path.join(os.tmpdir(), `pyreon-scanner-nonexistent-${Date.now()}`)
    // generateContext calls collectSourceFiles which catches readdir errors
    const ctx = generateContext(dir)
    expect(ctx.routes).toEqual([])
    expect(ctx.components).toEqual([])
    expect(ctx.islands).toEqual([])
    expect(ctx.version).toBe('unknown')
  })

  test('skips hidden directories (dot-prefixed)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
      'src/app.tsx': 'export const App = () => <div />',
      '.hidden/secret.tsx': 'export const Secret = () => <div />',
    })
    try {
      const ctx = generateContext(dir)
      const files = ctx.components.map((c) => c.file)
      for (const f of files) {
        expect(f).not.toContain('.hidden')
      }
    } finally {
      cleanupDir(dir)
    }
  })

  test('version falls back to "unknown" when package.json has no version', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test' }),
    })
    try {
      const ctx = generateContext(dir)
      // No @pyreon deps and no version field → 'unknown' (line 210 branch)
      expect(ctx.version).toBe('unknown')
    } finally {
      cleanupDir(dir)
    }
  })
})
