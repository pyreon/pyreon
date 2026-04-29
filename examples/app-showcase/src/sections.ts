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
    tagline: 'Drag-and-drop task board with snapshot-based undo/redo',
    features: ['state-tree', 'permissions', 'hotkeys', 'styler'],
    available: true,
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
    tagline: 'Live form editor + HTML preview, export to PDF / DOCX / HTML / Markdown',
    features: ['document', 'store', 'reactivity', 'toast', 'styler'],
    available: true,
    group: 'forms',
  },
  {
    path: '/resume',
    label: 'Resume Builder',
    tagline:
      'Same component tree drives the browser preview AND the PDF/DOCX export — no duplication',
    features: ['document-primitives', 'connector-document', 'document', 'store', 'toast'],
    available: true,
    group: 'forms',
  },

  // ─── Data ───────────────────────────────────────────────────────
  {
    path: '/shop',
    label: 'I18n Shop',
    tagline: 'E-commerce mock with three locales, currency conversion, and persisted cart',
    features: ['i18n', 'store', 'storage', 'url-state', 'reactivity'],
    available: true,
    group: 'data',
  },

  // ─── Visual ─────────────────────────────────────────────────────
  {
    path: '/flow',
    label: 'Flow Editor',
    tagline: 'Visual node editor with bidirectional JSON sidebar — drag the canvas or edit the JSON, both sync in real time',
    features: ['flow', 'code', 'store'],
    available: true,
    group: 'visual',
  },
  {
    path: '/dnd',
    label: 'Drag & Drop',
    tagline: 'Three drag-and-drop scenarios — sortable list, draggable card → drop zone, file drop with type filtering',
    features: ['dnd'],
    available: true,
    group: 'visual',
  },
]

export const groupLabels: Record<Section['group'], string> = {
  apps: 'Apps',
  forms: 'Forms',
  data: 'Data',
  visual: 'Visual',
}
