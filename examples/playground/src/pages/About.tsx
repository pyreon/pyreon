import { Defer } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { DeferredFixture } from '../components/DeferredFixture'

// Inline <Defer> usage — the compiler should:
//   1. Rewrite to <Defer chunk={() => import('./DeferredFixture').then(...)} when={...}>
//   2. Remove the static import of DeferredFixture
//   3. Rolldown then emits DeferredFixture as a separate chunk
// verify-modes cell `playground × spa (defer-inline)` asserts the
// DeferredFixture's unique fingerprint string appears in a per-chunk
// file BUT NOT in the entry chunk.
const _open = signal(false)

export function About() {
  return (
    <div class="card">
      <h2>About Pyreon</h2>
      <p>
        Pyreon is a fine-grained reactive UI framework with no virtual DOM. Components run{' '}
        <em>once</em> — signal updates cause surgical DOM patches.
      </p>
      <ul>
        <li>⚡ Signals-based reactivity (like Solid.js)</li>
        <li>🔧 Compiler-first JSX transform</li>
        <li>🖥️ SSR / SSG via renderToString</li>
        <li>📦 Zero runtime VDOM overhead</li>
      </ul>
      <Defer when={_open}>
        <DeferredFixture label="DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987" />
      </Defer>
    </div>
  )
}
