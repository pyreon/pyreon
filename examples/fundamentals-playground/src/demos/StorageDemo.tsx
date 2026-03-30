import { signal } from "@pyreon/reactivity";
import { useCookie, useMemoryStorage, useSessionStorage, useStorage } from "@pyreon/storage";

export function StorageDemo() {
  // localStorage — persists across tabs and sessions
  const theme = useStorage("playground-theme", "light");
  const fontSize = useStorage("playground-font-size", 16);
  const sidebarOpen = useStorage("playground-sidebar", true);

  // sessionStorage — tab-scoped
  const wizardStep = useSessionStorage("playground-wizard-step", 1);

  // Cookie — configurable expiry
  const locale = useCookie("playground-locale", "en", {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  // Memory storage — ephemeral, SSR-safe
  const tempNote = useMemoryStorage("playground-temp", "");

  // Signal deduplication demo
  const themeAgain = useStorage("playground-theme", "light");
  const isSameInstance = theme === themeAgain;

  // Log of changes
  const log = signal<string[]>([]);
  const addLog = (msg: string) => log.update((l) => [...l.slice(-9), msg]);

  return (
    <div>
      <h2>Storage</h2>
      <p class="desc">
        Reactive client-side storage — every stored value is a signal. localStorage, sessionStorage,
        cookies, memory. Cross-tab sync, signal deduplication.
      </p>

      <div class="section">
        <h3>localStorage — Theme & Font Size</h3>
        <div class="row" style="margin-bottom: 8px">
          <button
            type="button"
            onClick={() => {
              const next = theme() === "light" ? "dark" : "light";
              theme.set(next);
              addLog(`Theme → ${next}`);
            }}
          >
            Toggle Theme
          </button>
          <span>
            Current: <strong>{() => theme()}</strong>
          </span>
        </div>
        <div class="row" style="margin-bottom: 8px">
          <button
            type="button"
            onClick={() => {
              fontSize.update((s) => s - 2);
              addLog(`Font size → ${fontSize()}`);
            }}
          >
            A-
          </button>
          <span>
            Font size: <strong>{() => fontSize()}px</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              fontSize.update((s) => s + 2);
              addLog(`Font size → ${fontSize()}`);
            }}
          >
            A+
          </button>
        </div>
        <div class="row">
          <button
            type="button"
            onClick={() => {
              sidebarOpen.update((v) => !v);
              addLog(`Sidebar → ${sidebarOpen() ? "open" : "closed"}`);
            }}
          >
            Toggle Sidebar
          </button>
          <span>
            Sidebar: <strong>{() => (sidebarOpen() ? "Open" : "Closed")}</strong>
          </span>
        </div>
      </div>

      <div class="section">
        <h3>sessionStorage — Wizard Step</h3>
        <p style="margin-bottom: 8px">
          Step <strong>{() => wizardStep()}</strong> of 4 (tab-scoped, lost on close)
        </p>
        <div class="row">
          <button
            type="button"
            disabled={wizardStep() <= 1}
            onClick={() => {
              wizardStep.update((s) => Math.max(1, s - 1));
              addLog(`Wizard step → ${wizardStep()}`);
            }}
          >
            Back
          </button>
          <button
            type="button"
            disabled={wizardStep() >= 4}
            onClick={() => {
              wizardStep.update((s) => Math.min(4, s + 1));
              addLog(`Wizard step → ${wizardStep()}`);
            }}
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => {
              wizardStep.set(1);
              addLog("Wizard reset");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Cookie — Locale</h3>
        <div class="row">
          {["en", "de", "fr", "ja"].map((lang) => (
            <button
              type="button"
              key={lang}
              class={locale() === lang ? "active" : ""}
              onClick={() => {
                locale.set(lang);
                addLog(`Locale cookie → ${lang}`);
              }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
        <p>
          Current: <strong>{() => locale()}</strong> (persists as cookie with 1-year expiry)
        </p>
      </div>

      <div class="section">
        <h3>Memory Storage — Ephemeral Note</h3>
        <input
          type="text"
          placeholder="Type a temporary note..."
          value={tempNote()}
          onInput={(e: Event) => tempNote.set((e.target as HTMLInputElement).value)}
          style="width: 100%; padding: 8px; margin-bottom: 8px"
        />
        <p>
          Value: <strong>{() => tempNote() || "(empty)"}</strong> — lost on page refresh (memory
          only)
        </p>
      </div>

      <div class="section">
        <h3>Signal Deduplication</h3>
        <p>
          Same key returns same signal: <strong>{isSameInstance ? "true" : "false"}</strong>
        </p>
        <p style="font-size: 13px; opacity: 0.7">
          Calling <code>useStorage('playground-theme', 'light')</code> twice returns the exact same
          signal instance — no drift between components.
        </p>
      </div>

      <div class="section">
        <h3>.remove() — Clear Individual Keys</h3>
        <div class="row">
          <button
            type="button"
            onClick={() => {
              theme.remove();
              addLog("Removed theme");
            }}
          >
            Remove Theme
          </button>
          <button
            type="button"
            onClick={() => {
              fontSize.remove();
              addLog("Removed font size");
            }}
          >
            Remove Font Size
          </button>
          <button
            type="button"
            onClick={() => {
              locale.remove();
              addLog("Removed locale cookie");
            }}
          >
            Remove Locale
          </button>
        </div>
      </div>

      <div class="section">
        <h3>Change Log</h3>
        <div class="log">
          {() =>
            log().length === 0
              ? "Interact with the controls above to see changes."
              : log().join("\n")
          }
        </div>
      </div>
    </div>
  );
}
