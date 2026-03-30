import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { h, For } = await import("@pyreon/core");
const { signal } = await import("@pyreon/reactivity");
const { mount } = await import("@pyreon/runtime-dom");

let _id = 1;
const el = document.createElement("div");
document.body.appendChild(el);
const rowsSig = signal<{ id: number; label: ReturnType<typeof signal<string>> }[]>([]);
const toR = (row: { id: number; label: string }) => ({ id: row.id, label: signal(row.label) });
const makeRows = (n: number) =>
  Array.from({ length: n }, () => ({ id: _id++, label: `row${_id}` }));

mount(
  h(
    "table",
    null,
    h(
      "tbody",
      null,
      For({
        each: rowsSig,
        by: (r) => r.id,
        children: (row) =>
          h(
            "tr",
            null,
            h("td", null, String(row.id)),
            h("td", null, () => row.label()),
          ),
      }),
    ),
  ),
  el,
);

rowsSig.set(makeRows(1000).map(toR));
console.log(`Initial: ${el.querySelectorAll("tr").length} rows`);

// Patch mountFor to time internal operations
// Instead, let's time from the outside with many steps

// Step 1: time just rowsSig.set() with a new 1k array (replaceAll)
const rows1 = makeRows(1000).map(toR);
const t0 = performance.now();
rowsSig.set(rows1);
const t1 = performance.now();
console.log(`replaceAll: ${(t1 - t0).toFixed(1)}ms, rows=${el.querySelectorAll("tr").length}`);

// Step 2: time just rowsSig.set([]) (clear)
const t2 = performance.now();
rowsSig.set([]);
const t3 = performance.now();
console.log(`clear: ${(t3 - t2).toFixed(1)}ms, rows=${el.querySelectorAll("tr").length}`);

// Time effect disposal (1000 effects)
const { effect } = await import("@pyreon/reactivity");
const dummySig = signal(0);
const effects = [];
for (let i = 0; i < 1000; i++) {
  effects.push(
    effect(() => {
      void dummySig();
    }),
  );
}
const t4 = performance.now();
for (const e of effects) e.dispose();
const t5 = performance.now();
console.log(`1000 effect.dispose(): ${(t5 - t4).toFixed(2)}ms`);

// Check isConnected behavior in this context
const div = document.createElement("div");
document.body.appendChild(div);
const span = document.createElement("span");
div.appendChild(span);
const range2 = document.createRange();
range2.setStart(div, 0);
range2.setEnd(div, div.childNodes.length);
range2.deleteContents();
console.log(
  `After range delete: span.parentNode=${span.parentNode}, span.isConnected=${span.isConnected}`,
);
// Note: span was direct child of div, so span.parentNode = null after range
