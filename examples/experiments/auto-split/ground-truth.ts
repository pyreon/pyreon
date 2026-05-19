/**
 * FROZEN ground truth for the auto-split experiment.
 *
 * Every module under examples/app-showcase/src that statically imports a
 * HEAVY_PACKAGES member, hand-labelled by reading the ACTUAL usage:
 *   'split' = heavy API is reachable ONLY through an interaction →
 *             safe to auto-defer (a correct analyzer must find it).
 *   'keep'  = heavy API is on the render/setup path → auto-deferring it
 *             would break first paint / create a waterfall (a correct
 *             analyzer must NOT flag it).
 *
 * Frozen at baseline 259b46e76 BEFORE the v2 analyzer existed.
 */
export const GROUND_TRUTH: Record<string, { label: 'split' | 'keep'; why: string }> = {
  'examples/app-showcase/src/sections/resume/ExportButtons.tsx': {
    label: 'split',
    why: '`download` (@pyreon/document) is called only inside async `exportAs()`, which is referenced only in `onClick={() => exportAs(ext)}` — pure interaction-only.',
  },
  'examples/app-showcase/src/sections/invoice/ExportButtons.tsx': {
    label: 'split',
    why: 'Identical pattern: `download` in `exportAs()`, invoked only from `onClick`.',
  },
  'examples/app-showcase/src/sections/invoice/LivePreview.tsx': {
    label: 'keep',
    why: '`render(tree, "html")` is called in the component body to show a LIVE preview — render-path.',
  },
  'examples/app-showcase/src/sections/invoice/template.ts': {
    label: 'keep',
    why: 'Builds the doc tree via @pyreon/document builders; imported by LivePreview (render-path), so not exclusively deferred.',
  },
  'examples/app-showcase/src/sections/dashboard/CategoryChart.tsx': {
    label: 'keep',
    why: '`<Chart/>` (@pyreon/charts) rendered directly in JSX — render-path.',
  },
  'examples/app-showcase/src/sections/dashboard/RevenueChart.tsx': {
    label: 'keep',
    why: '`<Chart/>` rendered directly in JSX — render-path.',
  },
  'examples/app-showcase/src/sections/flow/JsonSidebar.tsx': {
    label: 'keep',
    why: '`<CodeEditor/>` (@pyreon/code) rendered in JSX — render-path.',
  },
  'examples/app-showcase/src/sections/flow/WorkflowNode.tsx': {
    label: 'keep',
    why: '`<Handle/>` + `Position` (@pyreon/flow) used in JSX — render-path.',
  },
  'examples/app-showcase/src/sections/flow/store.ts': {
    label: 'keep',
    why: '`createFlow(...)` (@pyreon/flow) called at store init — setup/render-path.',
  },
  'examples/app-showcase/src/routes/flow/index.tsx': {
    label: 'keep',
    why: '`<Flow/>`, `<Background/>`, `<Controls/>` (@pyreon/flow) in JSX — render-path.',
  },
}
