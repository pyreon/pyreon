import { Defer } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { DeferredFixture } from '../components/DeferredFixture'
import * as NS from '../components/NamespaceFixture'

// Two inline <Defer> usages — exercise the compiler's full inline-form
// surface end-to-end through a real Vite build:
//   1. <DeferredFixture label="..." /> — v2 prop-preservation shape.
//      verify-modes asserts the fixture lands in its own chunk AND the
//      prop literal lands in the route chunk's render-prop body.
//   2. <NS.NamespaceFixture /> — v3 namespace-import shape. The compiler
//      rewrites <NS.NamespaceFixture /> to the explicit chunk-prop form
//      and removes the `import * as NS` static import. verify-modes
//      asserts the namespace fixture lands in its own chunk.
const _open = signal(false)
const _open2 = signal(false)

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
      <Defer when={_open2}>
        <NS.NamespaceFixture />
      </Defer>
    </div>
  )
}
