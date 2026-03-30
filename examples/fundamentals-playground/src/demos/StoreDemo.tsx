import { signal } from "@pyreon/reactivity";
import { computed, defineStore, signal as storeSignal } from "@pyreon/store";

const useCounter = defineStore("playground-counter", () => {
  const count = storeSignal(0);
  const doubled = computed(() => count() * 2);
  const increment = () => count.update((n) => n + 1);
  const decrement = () => count.update((n) => n - 1);
  return { count, doubled, increment, decrement };
});

export function StoreDemo() {
  const { store, patch, subscribe, reset } = useCounter();
  const log = signal<string[]>([]);

  subscribe((mutation) => {
    const entry = `[${mutation.type}] ${mutation.events.map((e) => `${e.key}: ${JSON.stringify(e.oldValue)} → ${JSON.stringify(e.newValue)}`).join(", ")}`;
    log.update((lines) => [...lines.slice(-9), entry]);
  });

  return (
    <div>
      <h2>Store</h2>
      <p class="desc">
        Global state management with composition stores. Signals, computed, actions, patch,
        subscribe, reset.
      </p>

      <div class="section">
        <h3>Counter</h3>
        <div class="row" style="margin-bottom: 12px">
          <button onClick={() => store.decrement()}>-</button>
          <span style="font-size: 24px; min-width: 60px; text-align: center">
            {() => store.count()}
          </span>
          <button onClick={() => store.increment()}>+</button>
        </div>
        <p>
          Doubled: <strong>{() => store.doubled()}</strong>
        </p>
      </div>

      <div class="section">
        <h3>Patch</h3>
        <div class="row">
          <button onClick={() => patch({ count: 0 })}>Set to 0</button>
          <button onClick={() => patch({ count: 42 })}>Set to 42</button>
          <button onClick={() => patch({ count: 100 })}>Set to 100</button>
          <button onClick={() => reset()}>Reset</button>
        </div>
      </div>

      <div class="section">
        <h3>State Snapshot</h3>
        <pre style="font-size: 13px">{() => JSON.stringify(useCounter().state, null, 2)}</pre>
      </div>

      <div class="section">
        <h3>Mutation Log</h3>
        <div class="log">
          {() =>
            log().length === 0 ? "No mutations yet. Click a button above." : log().join("\n")
          }
        </div>
      </div>
    </div>
  );
}
