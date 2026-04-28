import { resolve } from 'node:path'

// ─── Project config ─────────────────────────────────────────────────────────

export type TemplateId = 'app' | 'blog' | 'dashboard'

export type RenderMode = 'ssr-stream' | 'ssr-string' | 'ssg' | 'spa'

export type AdapterId = 'vercel' | 'cloudflare' | 'netlify' | 'node' | 'bun' | 'static'

export type AiToolId = 'mcp' | 'claude' | 'cursor' | 'copilot' | 'agents'

export type IntegrationId = 'supabase' | 'email'

export interface ProjectConfig {
  name: string
  targetDir: string
  template: TemplateId
  renderMode: RenderMode
  /**
   * Deployment target. Drives both the vite-config adapter import and the
   * deploy artefacts the scaffolder writes (vercel.json, wrangler.toml, etc.).
   */
  adapter: AdapterId
  features: string[]
  packageStrategy: 'meta' | 'individual'
  /**
   * Backend integrations to scaffold. Each entry writes starter files
   * directly into the user's project (no Pyreon-side wrapper package);
   * the user owns the integration code and updates it independently of
   * Pyreon releases. The `dashboard` template preselects both.
   */
  integrations: IntegrationId[]
  /**
   * AI tooling integrations to scaffold. Each entry maps to a specific file:
   *   - mcp     → `.mcp.json`
   *   - claude  → `CLAUDE.md`
   *   - cursor  → `.cursor/rules/pyreon.md`
   *   - copilot → `.github/copilot-instructions.md`
   *   - agents  → `AGENTS.md`
   * Defaults to `["mcp", "claude"]`.
   */
  aiTools: AiToolId[]
  /** Framework compat mode — configures vite plugin for React/Vue/Solid/Preact migration */
  compat: 'none' | 'react' | 'vue' | 'solid' | 'preact'
  /** Include @pyreon/lint with recommended preset */
  lint: boolean
}

// ─── Feature definitions ────────────────────────────────────────────────────

export const FEATURES = {
  store: {
    label: 'State Management (@pyreon/store)',
    deps: ['@pyreon/store'],
  },
  query: {
    label: 'Data Fetching (@pyreon/query)',
    deps: ['@pyreon/query', '@tanstack/query-core'],
  },
  forms: {
    label: 'Forms + Validation (@pyreon/form, @pyreon/validation)',
    deps: ['@pyreon/form', '@pyreon/validation', 'zod'],
  },
  feature: {
    label: 'Feature CRUD (@pyreon/feature) — includes store, query, forms',
    deps: [
      '@pyreon/feature',
      '@pyreon/store',
      '@pyreon/query',
      '@pyreon/form',
      '@pyreon/validation',
      '@tanstack/query-core',
      'zod',
    ],
  },
  i18n: {
    label: 'Internationalization (@pyreon/i18n)',
    deps: ['@pyreon/i18n'],
  },
  table: {
    label: 'Tables (@pyreon/table)',
    deps: ['@pyreon/table', '@tanstack/table-core'],
  },
  virtual: {
    label: 'Virtual Lists (@pyreon/virtual)',
    deps: ['@pyreon/virtual', '@tanstack/virtual-core'],
  },
  styler: {
    label: 'CSS-in-JS (@pyreon/styler)',
    deps: ['@pyreon/styler', '@pyreon/ui-core'],
  },
  elements: {
    label: 'UI Elements (@pyreon/elements, @pyreon/coolgrid)',
    deps: ['@pyreon/elements', '@pyreon/coolgrid', '@pyreon/unistyle', '@pyreon/ui-core'],
  },
  animations: {
    label: 'Animations (@pyreon/kinetic + 120 presets)',
    deps: ['@pyreon/kinetic', '@pyreon/kinetic-presets'],
  },
  hooks: {
    label: 'Hooks (@pyreon/hooks — 25+ signal-based utilities)',
    deps: ['@pyreon/hooks'],
  },
  charts: {
    label: 'Charts (@pyreon/charts — reactive ECharts)',
    deps: ['@pyreon/charts'],
  },
  hotkeys: {
    label: 'Hotkeys (@pyreon/hotkeys — keyboard shortcuts)',
    deps: ['@pyreon/hotkeys'],
  },
  storage: {
    label: 'Storage (@pyreon/storage — localStorage, cookies, IndexedDB)',
    deps: ['@pyreon/storage'],
  },
  flow: {
    label: 'Flow Diagrams (@pyreon/flow — reactive node graphs)',
    deps: ['@pyreon/flow'],
  },
  code: {
    label: 'Code Editor (@pyreon/code — CodeMirror 6)',
    deps: ['@pyreon/code'],
  },
  toast: {
    label: 'Toast Notifications (@pyreon/toast)',
    deps: ['@pyreon/toast'],
  },
  permissions: {
    label: 'Permissions (@pyreon/permissions — RBAC, feature flags)',
    deps: ['@pyreon/permissions'],
  },
  'url-state': {
    label: 'URL State (@pyreon/url-state — URL-synced params)',
    deps: ['@pyreon/url-state'],
  },
  rx: {
    label: 'Reactive Transforms (@pyreon/rx — filter, map, sortBy, groupBy)',
    deps: ['@pyreon/rx'],
  },
} as const

export type FeatureKey = keyof typeof FEATURES

// ─── Template registry ──────────────────────────────────────────────────────

export interface TemplateMeta {
  id: TemplateId
  label: string
  hint: string
  /** Default rendering mode if the user does not override it. */
  defaultMode: RenderMode
  /** Default feature set preselected in the multiselect. */
  defaultFeatures: readonly FeatureKey[]
  /**
   * If true, the template forces its `defaultMode` and skips the rendering-
   * mode prompt. Used by templates whose architecture only makes sense in
   * one mode (blog → SSG, dashboard → SSR-stream).
   */
  forcesMode: boolean
  /** Adapters this template supports. Used to filter the deploy prompt. */
  adapters: readonly AdapterId[]
  /** Default adapter (must be a member of `adapters`). */
  defaultAdapter: AdapterId
  /** Integrations preselected in the multiselect for this template. */
  defaultIntegrations: readonly IntegrationId[]
}

export const TEMPLATES: Record<TemplateId, TemplateMeta> = {
  app: {
    id: 'app',
    label: 'App',
    hint: 'full-featured starter — counter, posts, layout, admin route group',
    defaultMode: 'ssr-stream',
    defaultFeatures: ['store', 'query', 'forms'],
    forcesMode: false,
    adapters: ['vercel', 'cloudflare', 'netlify', 'node', 'bun', 'static'],
    defaultAdapter: 'vercel',
    defaultIntegrations: [],
  },
  blog: {
    id: 'blog',
    label: 'Blog',
    hint: 'SSG markdown blog with RSS feed and SEO',
    defaultMode: 'ssg',
    defaultFeatures: [],
    forcesMode: true,
    // Static-first: blog doesn't need a runtime, so node/bun are excluded.
    adapters: ['static', 'vercel', 'cloudflare', 'netlify'],
    defaultAdapter: 'static',
    defaultIntegrations: [],
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    hint: 'SaaS-shape SSR app — auth-gated routes, full integration suite available',
    defaultMode: 'ssr-stream',
    defaultFeatures: ['store', 'query', 'forms', 'table'],
    forcesMode: true,
    // Server-required: 'static' excluded since auth/db need a runtime.
    adapters: ['vercel', 'cloudflare', 'netlify', 'node', 'bun'],
    defaultAdapter: 'vercel',
    defaultIntegrations: ['supabase', 'email'],
  },
}

// ─── Template directories ───────────────────────────────────────────────────

const TEMPLATES_ROOT = resolve(import.meta.dirname, '../templates')

export function templateDir(id: TemplateId): string {
  return resolve(TEMPLATES_ROOT, id)
}
