import BatchDemo from './examples/BatchDemo'
import ContextDemo from './examples/ContextDemo'
import ErrorDemo from './examples/ErrorDemo'
import LazyDemo from './examples/LazyDemo'
import MemoDemo from './examples/MemoDemo'
import PortalDemo from './examples/PortalDemo'
import TransitionDemo from './examples/TransitionDemo'
import UseEffectDemo from './examples/UseEffectDemo'
import UseIdDemo from './examples/UseIdDemo'
import UseImperativeHandleDemo from './examples/UseImperativeHandleDemo'
import UseMemoDemo from './examples/UseMemoDemo'
import UseReducerDemo from './examples/UseReducerDemo'
import UseRefDemo from './examples/UseRefDemo'
import UseStateDemo from './examples/UseStateDemo'

export default function App() {
  return (
    <div id="app-root">
      <header>
        <h1>Pyreon — React Compat</h1>
        <p class="subtitle">
          Familiar React hooks running on Pyreon's reactive engine. No hooks rules, no stale
          closures, automatic dependency tracking.
        </p>
        <p class="api-count">
          <strong>19 APIs</strong> demonstrated across <strong>14 interactive examples</strong>
        </p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          <span class="tag">useState</span>
          <span class="tag">useReducer</span>
          <span class="tag">useEffect</span>
          <span class="tag">useMemo</span>
          <span class="tag">useCallback</span>
          <span class="tag">useRef</span>
          <span class="tag">useId</span>
          <span class="tag">useImperativeHandle</span>
          <span class="tag">useTransition</span>
          <span class="tag">useDeferredValue</span>
          <span class="tag">batch</span>
          <span class="tag">memo</span>
          <span class="tag">createContext</span>
          <span class="tag">useContext</span>
          <span class="tag">createPortal</span>
          <span class="tag">lazy</span>
          <span class="tag">Suspense</span>
          <span class="tag">ErrorBoundary</span>
          <span class="tag">createRoot</span>
        </div>
      </nav>

      <main>
        <UseStateDemo />
        <UseReducerDemo />
        <UseEffectDemo />
        <UseMemoDemo />
        <UseRefDemo />
        <UseIdDemo />
        <BatchDemo />
        <MemoDemo />
        <TransitionDemo />
        <ContextDemo />
        <UseImperativeHandleDemo />
        <ErrorDemo />
        <LazyDemo />
        <PortalDemo />
      </main>

      <footer>
        <p>
          Built with <strong>@pyreon/react-compat</strong> — 0 lines of React, 100% Pyreon engine
        </p>
      </footer>
    </div>
  )
}
