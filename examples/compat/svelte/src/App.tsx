import BeforeAfterUpdateDemo from './examples/BeforeAfterUpdateDemo'
import ContextDemo from './examples/ContextDemo'
import DerivedArrayDemo from './examples/DerivedArrayDemo'
import DerivedAsyncDemo from './examples/DerivedAsyncDemo'
import DerivedDemo from './examples/DerivedDemo'
import EventDispatcherDemo from './examples/EventDispatcherDemo'
import ForDemo from './examples/ForDemo'
import GetDemo from './examples/GetDemo'
import OnDestroyDemo from './examples/OnDestroyDemo'
import OnMountDemo from './examples/OnMountDemo'
import ReadableDemo from './examples/ReadableDemo'
import ReadonlyDemo from './examples/ReadonlyDemo'
import ShowDemo from './examples/ShowDemo'
import StoreDemo from './examples/StoreDemo'
import SwitchDemo from './examples/SwitchDemo'
import TickDemo from './examples/TickDemo'

export default function App() {
  return (
    <div id="app-root">
      <header>
        <h1>Pyreon — Svelte Compat</h1>
        <p class="subtitle">
          Svelte's importable runtime API (svelte/store + lifecycle + context) running on
          Pyreon's reactive engine. Swap the import path — same signatures, same patterns.
        </p>
        <p class="api-count">
          <strong>18 APIs</strong> demonstrated across <strong>16 interactive examples</strong>
        </p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          <span class="tag">writable</span>
          <span class="tag">readable</span>
          <span class="tag">readonly</span>
          <span class="tag">derived</span>
          <span class="tag">get</span>
          <span class="tag">onMount</span>
          <span class="tag">onDestroy</span>
          <span class="tag">beforeUpdate</span>
          <span class="tag">afterUpdate</span>
          <span class="tag">tick</span>
          <span class="tag">setContext</span>
          <span class="tag">getContext</span>
          <span class="tag">hasContext</span>
          <span class="tag">createEventDispatcher</span>
          <span class="tag">mount</span>
          <span class="tag">Show</span>
          <span class="tag">For</span>
          <span class="tag">Switch / Match</span>
        </div>
      </nav>

      <main>
        <StoreDemo />
        <DerivedDemo />
        <DerivedArrayDemo />
        <DerivedAsyncDemo />
        <ReadableDemo />
        <ReadonlyDemo />
        <GetDemo />
        <OnMountDemo />
        <OnDestroyDemo />
        <BeforeAfterUpdateDemo />
        <TickDemo />
        <ContextDemo />
        <EventDispatcherDemo />
        <ShowDemo />
        <ForDemo />
        <SwitchDemo />
      </main>

      <footer>
        <p>
          Built with <strong>@pyreon/svelte-compat</strong> — 0 lines of Svelte, 100% Pyreon
          engine
        </p>
      </footer>
    </div>
  )
}
