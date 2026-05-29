/**
 * P0 — build-time rocketstyle-collapse resolver.
 *
 * For a collapsible call site (`<Button state="primary" size="md">Save</Button>`
 * — every dimension prop a string literal, children static text) this
 * resolves the FULL rocketstyle/styler pipeline ONCE by SSR-rendering the
 * REAL component, light AND dark, and returns: the resolved styler class
 * per mode, the styler rule text, and a class-stripped `_tpl` template.
 *
 * The render runs through a programmatic Vite SSR server bound to the
 * CONSUMER's own `vite.config` — so module resolution is identical to
 * the app's real build (workspace `bun` condition, app aliases,
 * app-local relative imports, whatever). Parity with the runtime-mounted
 * class is then guaranteed BY CONSTRUCTION: it is literally the same
 * `renderToString` + `@pyreon/styler` code path the client uses, and
 * styler's FNV-1a class hashing is identical in SSR and DOM (styler's
 * hydration contract). No reimplementation, no closure re-execution, no
 * drift (RFC decision 2).
 *
 * Every failure returns `null` (graceful bail → the call site keeps its
 * normal rocketstyle mount). Correct-but-slow is acceptable; wrong
 * output is not.
 */
import { withSilent } from '@pyreon/reactivity'
import type { StaticChild } from '@pyreon/compiler'
import type { InlineConfig, ViteDevServer } from 'vite'

// Inline FNV-1a (same algorithm as @pyreon/styler/hash) — avoids pulling
// the styler module graph into the vite-plugin's cheap entry path.
function fnv1a(str: string): string {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export interface CollapseImportSpec {
  /** Imported binding name, e.g. `PyreonUI` / `theme` / `useMode`. */
  name: string
  /** Module specifier, e.g. `@pyreon/ui-core` / `@pyreon/ui-theme`. */
  source: string
}

export interface CollapseConfig {
  /** Theme/mode provider component. Default: PyreonUI from @pyreon/ui-core. */
  provider: CollapseImportSpec
  /** Theme object. Default: theme from @pyreon/ui-theme. */
  theme: CollapseImportSpec
  /** Live mode accessor — emitted into the collapsed site for dual-emit. */
  mode: CollapseImportSpec
}

export const DEFAULT_COLLAPSE_CONFIG: CollapseConfig = {
  provider: { name: 'PyreonUI', source: '@pyreon/ui-core' },
  theme: { name: 'theme', source: '@pyreon/ui-theme' },
  mode: { name: 'useMode', source: '@pyreon/ui-core' },
}

export interface ResolveInput {
  /** The collapsible component's import. */
  component: CollapseImportSpec
  /** Literal dimension/HTML props, e.g. `{ state: 'primary', size: 'md' }`. */
  props: Record<string, string>
  /** Static text children (empty ⇒ no children). For element-child sites
   * this is the `serializeStaticChildren` key-string (cache discriminator
   * only — the actual children come from `childTree`). */
  childrenText: string
  /** Element-child sites only: the recursively-static child subtree.
   * When present, the resolver rebuilds it via `h()` and renders the real
   * child VNodes instead of `childrenText` as a string (PR 2). */
  childTree?: StaticChild[]
  config: CollapseConfig
}

export interface ResolvedCollapse {
  /** Element HTML with the root `class="..."` removed (the `_tpl` template). */
  templateHtml: string
  lightClass: string
  darkClass: string
  /** Pre-resolved styler rule text (full snapshot) for `injectRules`. */
  rules: string[]
  /** FNV over the rule set — `injectRules` idempotency + cross-site dedupe. */
  key: string
}

const FIRST_CLASS_RE = /^(\s*<[a-zA-Z][\w-]*)([^>]*?)\sclass="([^"]*)"([^>]*>)/

/** Strip the FIRST element's `class="..."`, returning [stripped, class]. */
export function stripRootClass(html: string): { stripped: string; cls: string } | null {
  const m = FIRST_CLASS_RE.exec(html)
  if (!m) return null
  const stripped = html.replace(FIRST_CLASS_RE, '$1$2$4')
  return { stripped, cls: m[3] ?? '' }
}

/**
 * Pure extraction half — given the two rendered HTML strings and the
 * styler rule snapshot, derive the ResolvedCollapse (or null on a shape
 * the slice doesn't collapse). Separated for direct unit-testing without
 * spinning Vite.
 */
export function deriveCollapse(
  lightHtml: string,
  darkHtml: string,
  rules: string[],
): ResolvedCollapse | null {
  const light = stripRootClass(lightHtml)
  const dark = stripRootClass(darkHtml)
  if (!light || !dark || !light.cls || !dark.cls) return null
  // The structural template must be identical between modes (only the
  // class differs). Divergent markup ⇒ not a simple single-root
  // collapsible — bail.
  if (light.stripped !== dark.stripped) return null
  return {
    templateHtml: light.stripped.trim(),
    lightClass: light.cls,
    darkClass: dark.cls,
    rules,
    key: fnv1a(rules.join('\u0000')),
  }
}

export interface CollapseResolver {
  resolve(input: ResolveInput): Promise<ResolvedCollapse | null>
  dispose(): Promise<void>
}

/**
 * Create a resolver backed by ONE programmatic Vite SSR server bound to
 * `projectRoot`'s vite config. Reused across every call site in a build;
 * `dispose()` at buildEnd. Module loads are cached by Vite's own SSR
 * module graph (provider/theme/component import once).
 */
export async function createCollapseResolver(projectRoot: string): Promise<CollapseResolver> {
  const { createServer } = (await import('vite')) as typeof import('vite')
  const inline: InlineConfig = {
    // No `configFile` override — Vite auto-loads the project's own
    // vite.config from `root`, so module resolution (workspace `bun`
    // condition, app aliases) matches the real build exactly.
    root: projectRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
  }
  // `createServer` evaluates the consumer's vite.config + plugin chain,
  // which may itself load `@pyreon/*` packages via the `node` condition
  // (different path than the outer process's `bun`-conditioned `src/`).
  // That's a legitimate dual-load — scope the opt-out across the entire
  // server lifecycle since every `load(spec)` below also touches the
  // dual graph.
  let server: ViteDevServer | null = await withSilent(() => createServer(inline))

  // Resolved-bundle cache — identical input must hit the same result
  // without a second double-render (deterministic by construction).
  const cache = new Map<string, ResolvedCollapse | null>()

  async function load(spec: string): Promise<Record<string, unknown>> {
    // The nested Vite SSR server loads its own copy of @pyreon/* packages for
    // the SSR snapshot. This is a legitimate dual-load — the outer process has
    // its own @pyreon/* graph; the nested server has its own. `withSilent`
    // from @pyreon/reactivity scopes the sentinel opt-out via a refcount
    // (race-safe under concurrency; the prior env-var dance leaked `silent`
    // permanently when N opt-out scopes overlapped — see withSilent JSDoc).
    return withSilent(() => server!.ssrLoadModule(spec) as Promise<Record<string, unknown>>)
  }

  /**
   * Rebuild real child VNodes from a static child subtree via `h()`.
   * `tag` is a lowercase DOM string (component children never reach
   * here — the detector bails on them), `props` are string literals,
   * and children are text strings or nested static elements. The
   * resulting VNodes render byte-faithfully to a real mount because the
   * tree was produced with the compiler's own JSX-text normalization.
   */
  function buildChildVNodes(
    tree: StaticChild[],
    h: (t: unknown, p: unknown, ...c: unknown[]) => unknown,
  ): unknown[] {
    return tree.map((c) =>
      typeof c === 'string' ? c : h(c.tag, c.props, ...buildChildVNodes(c.children, h)),
    )
  }

  return {
    async resolve(input) {
      const ck = JSON.stringify([
        input.component,
        input.props,
        input.childrenText,
        input.childTree ?? null,
        input.config.provider,
        input.config.theme,
      ])
      if (cache.has(ck)) return cache.get(ck) ?? null
      try {
        if (!server) return null
        const rs = await load('@pyreon/runtime-server')
        const core = await load('@pyreon/core')
        const styler = await load('@pyreon/styler')
        const prov = await load(input.config.provider.source)
        const thm = await load(input.config.theme.source)
        const comp = await load(input.component.source)
        const renderToString = rs.renderToString as (n: unknown) => Promise<string>
        const h = core.h as (t: unknown, p: unknown, ...c: unknown[]) => unknown
        const Provider = prov[input.config.provider.name]
        const themeVal = thm[input.config.theme.name]
        const Component = comp[input.component.name]
        const sheet = styler.sheet as { getStyleRules(): readonly string[] }
        if (typeof Component !== 'function' || Provider == null || themeVal == null) {
          cache.set(ck, null)
          return null
        }
        // Element-child sites carry a structured `childTree` — rebuild
        // the real child VNodes via `h()` so the SSR render bakes the
        // full subtree HTML (byte-faithful to a real mount because the
        // tree was normalized with the compiler's own `cleanJsxText`).
        // Full / dynamic sites use `childrenText` as a plain string.
        const childArgs: unknown[] = input.childTree
          ? buildChildVNodes(input.childTree, h)
          : input.childrenText
            ? [input.childrenText]
            : []
        const node = (mode: string) =>
          h(Provider, { theme: themeVal, mode }, h(Component, input.props, ...childArgs))
        const lightHtml = await renderToString(node('light'))
        const darkHtml = await renderToString(node('dark'))
        const rules = sheet.getStyleRules().slice()
        const result = deriveCollapse(lightHtml, darkHtml, rules)
        cache.set(ck, result)
        return result
      } catch {
        cache.set(ck, null)
        return null
      }
    },
    async dispose() {
      const s = server
      server = null
      cache.clear()
      if (s) await s.close()
    },
  }
}
