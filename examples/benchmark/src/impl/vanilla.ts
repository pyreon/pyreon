/**
 * Vanilla JS baseline — direct DOM manipulation, no framework.
 *
 * Uses targeted DOM updates for partial update, select, and swap —
 * the same approach a skilled developer would use without a framework.
 * Full rebuild is only used for create/replace/clear where it's necessary.
 */
import type { BenchSuite, Row } from "../runner";
import { bench, buildRows, tick } from "../runner";

export async function runVanilla(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: "Vanilla JS", container, results: [] };

  let rows: Row[] = [];
  let trElements: HTMLElement[] = [];
  let labelTds: HTMLElement[] = [];
  let selectedTr: HTMLElement | null = null;
  let tbody: HTMLElement | null = null;

  function renderAll(newRows: Row[]) {
    rows = newRows;
    container.innerHTML = "";
    const table = document.createElement("table");
    tbody = document.createElement("tbody");
    trElements = new Array(rows.length);
    labelTds = new Array(rows.length);
    selectedTr = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Row;
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      const td2 = document.createElement("td");
      td1.textContent = String(row.id);
      td2.textContent = row.label;
      tr.appendChild(td1);
      tr.appendChild(td2);
      tbody.appendChild(tr);
      trElements[i] = tr;
      labelTds[i] = td2;
    }

    table.appendChild(tbody);
    container.appendChild(table);
  }

  await bench("create 1,000 rows", suite, async () => {
    renderAll(buildRows(1_000));
  });

  await bench("replace all rows", suite, async () => {
    renderAll(buildRows(1_000));
  });

  // Store original labels for reset
  let originalLabels: string[] = rows.map((r) => r.label);
  await bench(
    "partial update (every 10th)",
    suite,
    async () => {
      for (let i = 0; i < rows.length; i += 10) {
        const row = rows[i] as Row;
        row.label = `${row.label} !!!`;
        (labelTds[i] as HTMLElement).textContent = row.label;
      }
    },
    // Reset labels before each run
    () => {
      for (let i = 0; i < rows.length; i += 10) {
        const orig = originalLabels[i];
        if (orig !== undefined) {
          (rows[i] as Row).label = orig;
          (labelTds[i] as HTMLElement).textContent = orig;
        }
      }
    },
  );

  // Re-create clean rows for remaining tests
  renderAll(buildRows(1_000));
  originalLabels = rows.map((r) => r.label);
  await tick();

  await bench("select row", suite, async () => {
    if (selectedTr) selectedTr.className = "";
    selectedTr = trElements[500] as HTMLElement;
    selectedTr.className = "selected";
  });

  await bench("swap rows", suite, async () => {
    if (rows.length < 999 || !tbody) return;
    // Swap data
    const tmp = rows[1] as Row;
    rows[1] = rows[998] as Row;
    rows[998] = tmp;
    // Swap element references
    const tmpTr = trElements[1] as HTMLElement;
    trElements[1] = trElements[998] as HTMLElement;
    trElements[998] = tmpTr;
    const tmpTd = labelTds[1] as HTMLElement;
    labelTds[1] = labelTds[998] as HTMLElement;
    labelTds[998] = tmpTd;
    // Move DOM nodes
    const ref2 = trElements[2] as HTMLElement;
    tbody.insertBefore(trElements[1] as HTMLElement, ref2);
    const ref999 = (trElements[999] as HTMLElement | undefined) ?? null;
    tbody.insertBefore(trElements[998] as HTMLElement, ref999);
  });

  await bench("clear rows", suite, async () => {
    renderAll([]);
  });

  // Re-create for the big test
  renderAll(buildRows(1_000));
  await tick();

  await bench("create 10,000 rows", suite, async () => {
    renderAll(buildRows(10_000));
  });

  // Cleanup
  renderAll([]);

  return suite;
}
