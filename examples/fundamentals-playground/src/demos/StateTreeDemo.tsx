import { computed, signal } from "@pyreon/reactivity"
import type { Patch } from "@pyreon/state-tree"
import { applySnapshot, getSnapshot, model, onPatch } from "@pyreon/state-tree"

const TodoList = model({
  state: {
    title: "My Todos",
    nextId: 1,
  },
  views: (self) => ({
    displayTitle: computed(() => `${self.title()} (#${self.nextId() - 1} items added)`),
  }),
  actions: (self) => ({
    setTitle: (title: string) => self.title.set(title),
    bumpId: () => self.nextId.update((n) => n + 1),
  }),
})

export function StateTreeDemo() {
  const list = TodoList.create({ title: "Shopping List" })
  const patches = signal<Patch[]>([])
  const savedSnapshot = signal<string>("")

  onPatch(list, (patch) => {
    patches.update((p) => [...p.slice(-9), patch])
  })

  return (
    <div>
      <h2>State Tree</h2>
      <p class="desc">Structured reactive models with snapshots, patches, and middleware.</p>

      <div class="section">
        <h3>Model</h3>
        <div class="field">
          <label>Title</label>
          <input
            value={list.title()}
            onInput={(e: Event) => list.setTitle((e.target as HTMLInputElement).value)}
          />
        </div>
        <p>
          Display: <strong>{() => list.displayTitle()}</strong>
        </p>
        <p>Next ID: {() => list.nextId()}</p>
        <div class="row" style="margin-top: 8px">
          <button onClick={() => list.bumpId()}>Bump ID</button>
          <button onClick={() => list.setTitle("Shopping List")}>Reset Title</button>
        </div>
      </div>

      <div class="section">
        <h3>Snapshots</h3>
        <div class="row" style="margin-bottom: 8px">
          <button
            class="primary"
            onClick={() => savedSnapshot.set(JSON.stringify(getSnapshot(list)))}
          >
            Save Snapshot
          </button>
          <button
            onClick={() => {
              const snap = savedSnapshot()
              if (snap) applySnapshot(list, JSON.parse(snap))
            }}
            disabled={!savedSnapshot()}
          >
            Restore Snapshot
          </button>
        </div>
        <p style="font-size: 13px; color: #666">
          Current: <code>{() => JSON.stringify(getSnapshot(list))}</code>
        </p>
        {() =>
          savedSnapshot() ? (
            <p style="font-size: 13px; color: #2e7d32; margin-top: 4px">
              Saved: <code>{savedSnapshot()}</code>
            </p>
          ) : null
        }
      </div>

      <div class="section">
        <h3>Patch Log</h3>
        <div class="log">
          {() =>
            patches().length === 0
              ? "No patches yet."
              : patches()
                  .map((p) => JSON.stringify(p))
                  .join("\n")
          }
        </div>
      </div>
    </div>
  )
}
