import ContextDemo from "./examples/ContextDemo"
import HFragmentDemo from "./examples/HFragmentDemo"
import RenderDemo from "./examples/RenderDemo"
import SignalsDemo from "./examples/SignalsDemo"
import UseEffectDemo from "./examples/UseEffectDemo"
import UseIdDemo from "./examples/UseIdDemo"
import UseMemoDemo from "./examples/UseMemoDemo"
import UseReducerDemo from "./examples/UseReducerDemo"
import UseRefDemo from "./examples/UseRefDemo"
import UseStateDemo from "./examples/UseStateDemo"
import UtilsDemo from "./examples/UtilsDemo"

// ─── All APIs ────────────────────────────────────────────────────────────────

const ALL_APIS = [
  "h",
  "createElement",
  "Fragment",
  "render",
  "createContext",
  "useContext",
  "createRef",
  "cloneElement",
  "toChildArray",
  "isValidElement",
  "options",
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useCallback",
  "useRef",
  "useReducer",
  "useId",
  "useErrorBoundary",
  "signal",
  "computed",
  "effect",
  "batch",
]

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <header>
        <h1>Pyreon — Preact Compat</h1>
        <p class="subtitle">
          Preact API (core + hooks + signals) running on Pyreon's fine-grained reactive engine
        </p>
        <p class="api-count">{ALL_APIS.length} APIs demonstrated across 3 entry points</p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          {ALL_APIS.map((api) => (
            <span class="tag">{api}</span>
          ))}
        </div>
      </nav>

      <UseStateDemo />
      <UseEffectDemo />
      <UseMemoDemo />
      <UseReducerDemo />
      <UseRefDemo />
      <UseIdDemo />
      <ContextDemo />
      <HFragmentDemo />
      <UtilsDemo />
      <RenderDemo />
      <SignalsDemo />

      <footer>
        Built with @pyreon/preact-compat — all {ALL_APIS.length} APIs from 3 entry points
      </footer>
    </>
  )
}
