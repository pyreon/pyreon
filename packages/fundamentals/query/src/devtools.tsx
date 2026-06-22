import type { VNode } from '@pyreon/core'
import { nativeCompat, onMount } from '@pyreon/core'
import type { QueryClient } from '@tanstack/query-core'
import { onlineManager } from '@tanstack/query-core'
import type {
  DevtoolsButtonPosition,
  DevtoolsErrorType,
  DevtoolsPosition,
} from '@tanstack/query-devtools'
import { TanstackQueryDevtools } from '@tanstack/query-devtools'
import { useQueryClient } from './query-client'

export interface QueryDevtoolsProps {
  /** Explicit QueryClient. Defaults to the nearest `<QueryClientProvider>`'s client. */
  client?: QueryClient
  /** Open the panel on first render. Default `false`. */
  initialIsOpen?: boolean
  /** Corner the floating toggle button sits in. */
  buttonPosition?: DevtoolsButtonPosition
  /** Side the panel slides out from. */
  position?: DevtoolsPosition
  /** Custom error types the panel can simulate per query. */
  errorTypes?: DevtoolsErrorType[]
  /** Mount the devtools UI into a shadow root instead of the host element. */
  shadowDOMTarget?: ShadowRoot
}

/**
 * In-app TanStack Query devtools panel — the SAME panel React / Solid / Vue
 * users see. It's a thin shim over `@tanstack/query-devtools`'s
 * framework-agnostic `TanstackQueryDevtools` engine: on mount it instantiates
 * the engine with the nearest `QueryClient` and mounts it into a host element;
 * on unmount it tears the engine down. Reactive props (`position`,
 * `errorTypes`, …) re-apply via the engine's setters.
 *
 * Import from the dev-only subpath so it tree-shakes out of production:
 * `import { QueryDevtools } from '@pyreon/query/devtools'`. Render it once,
 * anywhere under your `<QueryClientProvider>` (typically at the app root).
 *
 * Config props are read once at mount (the dominant usage — devtools position
 * / open-state are set once). Reactive re-positioning is intentionally out of
 * scope for v1.
 *
 * @example
 * import { QueryDevtools } from '@pyreon/query/devtools'
 *
 * <QueryClientProvider client={client}>
 *   <App />
 *   {import.meta.env.DEV ? <QueryDevtools initialIsOpen={false} /> : null}
 * </QueryClientProvider>
 */
export function QueryDevtools(props: QueryDevtoolsProps): VNode {
  // `??` short-circuits — useQueryClient() (which throws when no provider is
  // mounted) is only called when no explicit client prop is passed.
  const client = props.client ?? useQueryClient()
  let host: HTMLElement | null = null
  let devtools: TanstackQueryDevtools | null = null

  onMount(() => {
    if (!host) return
    // Conditional spread (not explicit `undefined`) keeps exactOptionalPropertyTypes happy.
    devtools = new TanstackQueryDevtools({
      client,
      queryFlavor: 'Pyreon Query',
      version: '5',
      onlineManager,
      initialIsOpen: props.initialIsOpen ?? false,
      ...(props.buttonPosition ? { buttonPosition: props.buttonPosition } : {}),
      ...(props.position ? { position: props.position } : {}),
      ...(props.errorTypes ? { errorTypes: props.errorTypes } : {}),
      ...(props.shadowDOMTarget ? { shadowDOMTarget: props.shadowDOMTarget } : {}),
    })
    devtools.mount(host)
    return () => {
      devtools?.unmount()
      devtools = null
    }
  })

  return (
    <div ref={(el: HTMLElement | null) => { host = el }} data-pyreon-query-devtools />
  )
}

// Mark native — compat-mode jsx() runtimes skip wrapCompatComponent so the
// useQueryClient() (useContext) lookup + onMount lifecycle run in Pyreon's
// setup frame. Same rationale as QueryClientProvider.
nativeCompat(QueryDevtools)
