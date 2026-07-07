/**
 * /public-env-probe — exercises `@pyreon/zero`'s public env inlining end-to-end.
 *
 * `e2e/public-env.spec.ts` (real Chromium) asserts:
 *   - the ZERO_PUBLIC_TEST_VAR value renders (SSR + hydrate),
 *   - a CLIENT-ONLY `onMount` read of `publicEnv()` also sees it (proves the
 *     value is inlined into the CLIENT bundle — the browser-{} bug's fix),
 *   - the non-public ZERO_PRIVATE_MESSAGE value is ABSENT from the page (the
 *     ZERO_PUBLIC_ security boundary holds in a real build).
 */
import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { publicEnv } from '@pyreon/zero/env'

export default function PublicEnvProbe() {
  const pub = publicEnv()
  const clientRead = signal('(client not mounted)')
  onMount(() => {
    // onMount runs ONLY on the client — proves the CLIENT bundle has the value.
    clientRead.set(publicEnv().TEST_VAR ?? '(missing on client)')
  })
  return (
    <main data-testid="public-env-probe">
      <h1>Public Env Probe</h1>
      <p data-testid="pe-ssr">{pub.TEST_VAR ?? '(missing)'}</p>
      <p data-testid="pe-client">{() => clientRead()}</p>
    </main>
  )
}
