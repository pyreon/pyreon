import { For } from "@pyreon/core";
import BatchDemo from "./examples/BatchDemo";
import ComputedDemo from "./examples/ComputedDemo";
import CreateAppDemo from "./examples/CreateAppDemo";
import DefineComponentDemo from "./examples/DefineComponentDemo";
import HFragmentDemo from "./examples/HFragmentDemo";
import LifecycleDemo from "./examples/LifecycleDemo";
import NextTickDemo from "./examples/NextTickDemo";
import ProvideInjectDemo from "./examples/ProvideInjectDemo";
import ReactiveDemo from "./examples/ReactiveDemo";
import RefDemo from "./examples/RefDemo";
import ToRefDemo from "./examples/ToRefDemo";
import WatchDemo from "./examples/WatchDemo";
import WatchEffectDemo from "./examples/WatchEffectDemo";

// ─── All APIs ────────────────────────────────────────────────────────────────

const ALL_APIS = [
  "ref",
  "shallowRef",
  "triggerRef",
  "isRef",
  "unref",
  "computed",
  "reactive",
  "shallowReactive",
  "readonly",
  "toRaw",
  "toRef",
  "toRefs",
  "watch",
  "watchEffect",
  "onMounted",
  "onUnmounted",
  "onUpdated",
  "onBeforeMount",
  "onBeforeUnmount",
  "nextTick",
  "provide",
  "inject",
  "defineComponent",
  "h",
  "Fragment",
  "createApp",
  "batch",
];

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <header>
        <h1>Pyreon — Vue Compat</h1>
        <p class="subtitle">
          Vue 3 Composition API running on Pyreon's fine-grained reactive engine
        </p>
        <p class="api-count">{ALL_APIS.length} APIs demonstrated</p>
      </header>

      <nav>
        <h3>API Index</h3>
        <div class="api-index">
          <For each={() => ALL_APIS} by={(api) => api}>
            {(api) => <span class="tag">{api}</span>}
          </For>
        </div>
      </nav>

      <RefDemo />
      <ComputedDemo />
      <ReactiveDemo />
      <ToRefDemo />
      <WatchDemo />
      <WatchEffectDemo />
      <LifecycleDemo />
      <NextTickDemo />
      <ProvideInjectDemo />
      <DefineComponentDemo />
      <HFragmentDemo />
      <BatchDemo />
      <CreateAppDemo />

      <footer>
        Built with @pyreon/vue-compat — all {ALL_APIS.length} APIs from a single import
      </footer>
    </>
  );
}
