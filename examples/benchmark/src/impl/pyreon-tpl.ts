/**
 * Pyreon benchmark — fully compiled variant.
 *
 * Represents what the Pyreon compiler would emit for the standard
 * js-framework-benchmark row template, using every available optimisation:
 *
 * - `_tpl()` — cloneNode(true) instead of N × createElement + setAttribute
 * - `_bindText` — direct signal→TextNode subscription (no effect overhead)
 * - `_bind` — single renderEffect for className (createSelector dependency)
 * - Event delegation — `el.__ev_click = handler` instead of addEventListener
 * - Zero VNode / props-object / children-array allocations per row
 * - Static attributes baked into the HTML string
 */
import { For, h } from "@pyreon/core";
import { _bind, createSelector, signal } from "@pyreon/reactivity";
import { _bindText, _tpl, mount } from "@pyreon/runtime-dom";
import type { BenchSuite } from "../runner";
import { bench, buildRowsWith, tick } from "../runner";

export async function runPyreonTpl(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: "Pyreon (compiled)", container, results: [] };

  type ReactiveRow = { id: number; label: ReturnType<typeof signal<string>> };
  const rows = signal<ReactiveRow[]>([]);
  const selectedId = signal<number | null>(null);

  // O(1) selection — only the deselected and newly selected rows re-run
  const isSelected = createSelector(selectedId);

  const unmount = mount(
    h(
      "table",
      null,
      h(
        "tbody",
        null,
        For({
          each: rows,
          by: (row) => row.id,
          children: (row: ReactiveRow) =>
            // Fully compiled row — _tpl + _bindText + _bind (same 2-column DOM as other frameworks)
            _tpl("<tr><td></td><td></td></tr>", (__root) => {
              const __e0 = __root.children[0] as HTMLElement;
              const __e1 = __root.children[1] as HTMLElement;

              // Static text — id never changes
              __e0.textContent = String(row.id);

              // _bindText: direct signal→TextNode subscription (no effect)
              const __t0 = document.createTextNode("");
              __e1.appendChild(__t0);
              const __d0 = _bindText(row.label as unknown as Parameters<typeof _bindText>[0], __t0);

              // _bind: single renderEffect for className (selector dependency)
              const __d1 = _bind(() => {
                __root.className = isSelected(row.id) ? "selected" : "";
              });

              return () => {
                __d0();
                __d1();
              };
            }),
        }),
      ),
    ),
    container,
  );

  const mkRows = (n: number) =>
    buildRowsWith<ReactiveRow>(n, (id, label) => ({ id, label: signal(label) }));

  await bench("create 1,000 rows", suite, async () => {
    rows.set(mkRows(1_000));
    await tick();
  });

  await bench("replace all rows", suite, async () => {
    rows.set(mkRows(1_000));
    await tick();
  });

  // Capture original labels for reset between partial update runs
  let originalLabels: string[] = rows().map((r) => r.label());
  await bench(
    "partial update (every 10th)",
    suite,
    async () => {
      const current = rows();
      for (let i = 0; i < current.length; i += 10) {
        current[i]?.label.update((l) => `${l} !!!`);
      }
      await tick();
    },
    // Reset labels before each run to avoid accumulation
    () => {
      const current = rows();
      for (let i = 0; i < current.length; i += 10) {
        const orig = originalLabels[i];
        if (orig !== undefined) {
          current[i]?.label.set(orig);
        }
      }
    },
  );

  // Re-create clean rows for remaining tests
  rows.set(mkRows(1_000));
  originalLabels = rows().map((r) => r.label());
  await tick();

  await bench("select row", suite, async () => {
    const r = rows();
    selectedId.set(r[Math.floor(r.length / 2)]?.id ?? null);
    await tick();
  });

  await bench("swap rows", suite, async () => {
    const current = [...rows()];
    if (current.length >= 999) {
      const a = current[1];
      const b = current[998];
      if (a && b) {
        current[1] = b;
        current[998] = a;
        rows.set(current);
      }
    }
    await tick();
  });

  await bench("clear rows", suite, async () => {
    rows.set([]);
    await tick();
  });

  rows.set(mkRows(1_000));
  await tick();

  await bench("create 10,000 rows", suite, async () => {
    rows.set(mkRows(10_000));
    await tick();
  });

  rows.set([]);
  unmount();

  return suite;
}
