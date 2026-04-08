/**
 * Section registry — drives the sidebar nav and the homepage feature grid.
 *
 * Each section is a self-contained area of the app demonstrating a specific
 * set of Pyreon features. New sections are added by:
 *   1. Creating `src/routes/<section>/...` route files
 *   2. Appending an entry here with `available: true`
 */

export interface Section {
  /** URL path for the section root (e.g. "/todos"). */
  path: string
  /** Display name in the sidebar and homepage card. */
  label: string
  /** Short tagline for the homepage card. */
  tagline: string
  /** Pyreon packages this section showcases. */
  features: string[]
  /** Whether the section is built. Disabled sections render a "coming soon" badge. */
  available: boolean
  /** Sidebar group this section belongs to. */
  group: 'apps' | 'forms' | 'data' | 'visual'
}

export const sections: Section[] = [
  // ─── Apps ───────────────────────────────────────────────────────
  {
    path: '/todos',
    label: 'Todos',
    tagline: 'CRUD list with persistence, filters, and keyboard shortcuts',
    features: ['store', 'storage', 'form', 'url-state', 'hotkeys', 'rx', 'styler'],
    available: true,
    group: 'apps',
  },
  {
    path: '/blog',
    label: 'Blog',
    tagline: 'Tag-filtered post list with dynamic routes, loaders, and per-post head meta',
    features: ['zero ssg', 'head', 'router loaders', 'file routing', 'url-state'],
    available: true,
    group: 'apps',
  },
  {
    path: '/dashboard',
    label: 'Dashboard',
    tagline: 'Admin with charts, table, virtualized list, role-based actions',
    features: [
      'query',
      'table',
      'charts',
      'virtual',
      'permissions',
      'toast',
      'coolgrid',
      'url-state',
      'rx',
    ],
    available: true,
    group: 'apps',
  },
  {
    path: '/chat',
    label: 'Chat',
    tagline: 'Mock real-time messaging with virtualized history and connection state machine',
    features: ['store', 'virtual', 'machine', 'toast', 'styler'],
    available: true,
    group: 'apps',
  },
  {
    path: '/kanban',
    label: 'Kanban',
    tagline: 'Drag-and-drop task board with undo/redo',
    features: ['state-tree', 'store', 'permissions', 'hotkeys'],
    available: false,
    group: 'apps',
  },

  // ─── Forms ──────────────────────────────────────────────────────
  {
    path: '/forms-wizard',
    label: 'Forms Wizard',
    tagline: 'Multi-step onboarding form with per-step Zod validation',
    features: ['form', 'validation (zod)', 'state-tree', 'machine'],
    available: true,
    group: 'forms',
  },
  {
    path: '/invoice',
    label: 'Invoice Builder',
    tagline: 'Generate PDF/DOCX invoices from a form',
    features: ['document', 'document-primitives', 'connector-document', 'form'],
    available: false,
    group: 'forms',
  },

  // ─── Data ───────────────────────────────────────────────────────
  {
    path: '/shop',
    label: 'I18n Shop',
    tagline: 'E-commerce with multi-locale and currencies',
    features: ['i18n', 'zero locale routing', 'store', 'url-state'],
    available: false,
    group: 'data',
  },

  // ─── Visual ─────────────────────────────────────────────────────
  {
    path: '/flow',
    label: 'Flow Editor',
    tagline: 'Visual node editor with JSON sidebar',
    features: ['flow', 'code', 'store'],
    available: false,
    group: 'visual',
  },
]

export const groupLabels: Record<Section['group'], string> = {
  apps: 'Apps',
  forms: 'Forms',
  data: 'Data',
  visual: 'Visual',
}
