import type { FlowEdge, FlowNode, LayoutAlgorithm, LayoutOptions } from './types'

// ─── Algorithm-specific option applicability ─────────────────────────────────
//
// Not every option applies to every algorithm — `direction` means nothing to
// a force layout, for example. The truth table below was verified empirically
// by running each algorithm twice with two different values for the option and
// checking whether the resulting node positions differ.
//
// Used by `warnIgnoredOptions` (dev mode only) to surface "you set
// this and it did nothing" mistakes that would otherwise be silent.
const DIRECTION_ALGORITHMS = new Set<LayoutAlgorithm>(['layered', 'tree'])
const LAYER_SPACING_ALGORITHMS = new Set<LayoutAlgorithm>(['layered'])
const EDGE_ROUTING_ALGORITHMS = new Set<LayoutAlgorithm>(['layered'])

function warnIgnoredOptions(algorithm: LayoutAlgorithm, options: LayoutOptions): void {
  // Dev-mode gate via bare `process.env.NODE_ENV !== 'production'` — the
  // bundler-agnostic library convention. Used by React, Vue, Preact, Solid,
  // MobX, Redux, and every other major published JS library.
  //
  // **Why this pattern, not `import.meta.env.DEV`**: that flag is
  // Vite/Rolldown-only. In a Pyreon library shipped to a Next.js
  // (Webpack), esbuild, Rollup, Parcel, or Bun app, `import.meta.env.DEV`
  // is `undefined` and dev warnings never fire — even in development.
  // It's a fine choice for app code, but wrong for library code.
  //
  // **Why this pattern, not `typeof process !== 'undefined' && ...`** (the
  // first broken pattern): the `typeof process` guard isn't replaced by Vite,
  // evaluates to `false` in the browser, and the whole expression is dead
  // code in Vite browser bundles. Wrapped warnings never fire for users.
  //
  // **How bare `process.env.NODE_ENV` works across bundlers**:
  //
  // - **Vite / Rolldown**: replace `process.env.NODE_ENV` with literal
  //   `"production"` or `"development"` at build time. Tree-shakes the
  //   dead branch in prod.
  // - **Webpack (Next.js)**: same — DefinePlugin replaces it by default.
  // - **esbuild**: same — `--define` is automatic for libraries.
  // - **Rollup**: same via `@rollup/plugin-replace` (standard library setup).
  // - **Parcel**: same — built-in env replacement.
  // - **Bun**: same — built-in `define`. Direct Bun execution also resolves
  //   it natively from the runtime env.
  // - **Node SSR direct**: real env var read at runtime.
  // - **vitest**: Vite-based, replaces it automatically, warnings fire in tests.
  //
  // Reference for future dev-mode warnings — keep this comment in sync if the
  // pattern ever changes. Enforced by `@pyreon/lint`'s `pyreon/no-process-dev-gate`
  // rule which flags both `typeof process` compounds and `import.meta.env.DEV`.
  if (process.env.NODE_ENV === 'production') return

  if (options.direction !== undefined && !DIRECTION_ALGORITHMS.has(algorithm)) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] flow.layout: \`direction\` is silently ignored by the \`${algorithm}\` algorithm. ` +
        `It applies to \`layered\` and \`tree\` only — switch the algorithm or remove the option to silence this warning.`,
    )
  }
  if (options.layerSpacing !== undefined && !LAYER_SPACING_ALGORITHMS.has(algorithm)) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] flow.layout: \`layerSpacing\` is silently ignored by the \`${algorithm}\` algorithm. ` +
        `It applies to \`layered\` only — use \`nodeSpacing\` for general spacing or switch to \`layered\`.`,
    )
  }
  if (options.edgeRouting !== undefined && !EDGE_ROUTING_ALGORITHMS.has(algorithm)) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] flow.layout: \`edgeRouting\` is silently ignored by the \`${algorithm}\` algorithm. ` +
        `It applies to \`layered\` only — switch to \`layered\` or remove the option to silence this warning.`,
    )
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute a layout for the given nodes and edges using Pyreon's own engine.
 * Returns an array of { id, position } for each node.
 *
 * Runs Pyreon's own layout engine — no external layout dependency, and the
 * result is deterministic: the same graph always produces the same positions.
 *
 * **Algorithm-specific options**: not every option in `LayoutOptions`
 * applies to every algorithm. `direction` and `layerSpacing` are
 * meaningful only to the layered/tree pipelines and are silently
 * ignored by `force`, `stress`, `radial`, `box`, and `rectpacking`.
 * See the JSDoc on each `LayoutOptions` field for the exact
 * applicability rules.
 *
 * @example
 * ```ts
 * const positions = await computeLayout(nodes, edges, 'layered', {
 *   direction: 'RIGHT',
 *   nodeSpacing: 50,
 *   layerSpacing: 100,
 * })
 * // positions: [{ id: '1', position: { x: 0, y: 0 } }, ...]
 * ```
 */
export async function computeLayout<TData = Record<string, unknown>>(
  nodes: FlowNode<TData>[],
  edges: FlowEdge[],
  algorithm: LayoutAlgorithm = 'layered',
  options: LayoutOptions = {},
): Promise<Array<{ id: string; position: { x: number; y: number } }>> {
  warnIgnoredOptions(algorithm, options)
  // Loaded on demand, exactly as elkjs was: an app that renders a flow but
  // never calls `.layout()` should not pay for the algorithms. The difference
  // is the size of what gets fetched — a ~2 KB chunk instead of ~1.4 MB.
  //
  // The engine itself is PURE and SYNCHRONOUS; only the import is async. That
  // is also why the published `async` signature is worth keeping even though
  // the work no longer needs it.
  const { runLayout } = await import('./layout-engine')
  return runLayout(nodes, edges, algorithm, options)
}
