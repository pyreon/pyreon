import BatchDemo from './examples/BatchDemo'
import ChildrenDemo from './examples/ChildrenDemo'
import ContextDemo from './examples/ContextDemo'
import EffectDemo from './examples/EffectDemo'
import ErrorDemo from './examples/ErrorDemo'
import ForDemo from './examples/ForDemo'
import LazyDemo from './examples/LazyDemo'
import LifecycleDemo from './examples/LifecycleDemo'
import MemoDemo from './examples/MemoDemo'
import OnDemo from './examples/OnDemo'
import OwnerDemo from './examples/OwnerDemo'
import PropsDemo from './examples/PropsDemo'
import RenderEffectDemo from './examples/RenderEffectDemo'
import RootDemo from './examples/RootDemo'
import SelectorDemo from './examples/SelectorDemo'
import ShowDemo from './examples/ShowDemo'
import SignalDemo from './examples/SignalDemo'
import SwitchDemo from './examples/SwitchDemo'
import UntrackDemo from './examples/UntrackDemo'

export default function App() {
  return (
    <div id="app-root">
      <header>
        <h1>Pyreon — Solid Compat</h1>
        <p class="subtitle">
          Complete SolidJS-compatible API running on Pyreon's reactive engine. Every API below is a
          drop-in replacement — same signatures, same patterns.
        </p>
        <p class="api-count">
          <strong>24 APIs</strong> demonstrated across <strong>19 interactive examples</strong>
        </p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          <span class="tag">createSignal</span>
          <span class="tag">createEffect</span>
          <span class="tag">createMemo</span>
          <span class="tag">createRenderEffect</span>
          <span class="tag">createComputed</span>
          <span class="tag">batch</span>
          <span class="tag">untrack</span>
          <span class="tag">on</span>
          <span class="tag">createSelector</span>
          <span class="tag">createRoot</span>
          <span class="tag">getOwner</span>
          <span class="tag">runWithOwner</span>
          <span class="tag">onMount</span>
          <span class="tag">onCleanup</span>
          <span class="tag">mergeProps</span>
          <span class="tag">splitProps</span>
          <span class="tag">children</span>
          <span class="tag">lazy</span>
          <span class="tag">createContext</span>
          <span class="tag">useContext</span>
          <span class="tag">Show</span>
          <span class="tag">Switch / Match</span>
          <span class="tag">For</span>
          <span class="tag">Suspense</span>
          <span class="tag">ErrorBoundary</span>
        </div>
      </nav>

      <main>
        <SignalDemo />
        <EffectDemo />
        <MemoDemo />
        <BatchDemo />
        <UntrackDemo />
        <OnDemo />
        <RenderEffectDemo />
        <ShowDemo />
        <SwitchDemo />
        <ForDemo />
        <SelectorDemo />
        <PropsDemo />
        <LifecycleDemo />
        <ChildrenDemo />
        <ContextDemo />
        <ErrorDemo />
        <LazyDemo />
        <RootDemo />
        <OwnerDemo />
      </main>

      <footer>
        <p>
          Built with <strong>@pyreon/solid-compat</strong> — 0 lines of SolidJS, 100% Pyreon engine
        </p>
      </footer>
    </div>
  )
}
