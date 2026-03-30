import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Profile: different ways to bulk-remove 1000 tr>td+td from connected DOM

function buildTbody(n: number): HTMLTableSectionElement {
  const tbody = document.createElement("tbody");
  document.body.appendChild(tbody);
  for (let i = 0; i < n; i++) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.textContent = String(i);
    tr.appendChild(td1);
    const td2 = document.createElement("td");
    td2.textContent = `label${i}`;
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
  return tbody;
}

// Method 1: range.deleteContents (current approach)
{
  const tbody = buildTbody(1000);
  const t0 = performance.now();
  const range = document.createRange();
  range.setStart(tbody, 0);
  range.setEnd(tbody, tbody.childNodes.length);
  range.deleteContents();
  const t1 = performance.now();
  console.log(`range.deleteContents():        ${(t1 - t0).toFixed(1)}ms`);
  document.body.removeChild(tbody);
}

// Method 2: while loop removeChild
{
  const tbody = buildTbody(1000);
  const t0 = performance.now();
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  const t1 = performance.now();
  console.log(`while removeChild:             ${(t1 - t0).toFixed(1)}ms`);
  document.body.removeChild(tbody);
}

// Method 3: innerHTML = ""
{
  const tbody = buildTbody(1000);
  const t0 = performance.now();
  tbody.innerHTML = "";
  const t1 = performance.now();
  console.log(`innerHTML = "":                ${(t1 - t0).toFixed(1)}ms`);
  document.body.removeChild(tbody);
}

// Method 4: replaceChildren()
{
  const tbody = buildTbody(1000);
  const t0 = performance.now();
  tbody.replaceChildren();
  const t1 = performance.now();
  console.log(`replaceChildren():             ${(t1 - t0).toFixed(1)}ms`);
  document.body.removeChild(tbody);
}

// Method 5: detach parent first, then clear
{
  const tbody = buildTbody(1000);
  const t0 = performance.now();
  document.body.removeChild(tbody); // detach
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  const t1 = performance.now();
  console.log(`detach+removeChild:            ${(t1 - t0).toFixed(1)}ms`);
  // (don't reattach)
}

// Method 6: move top-level children to DocumentFragment (one by one)
{
  const tbody = buildTbody(1000);
  const t0 = performance.now();
  const frag = document.createDocumentFragment();
  let cur: Node | null = tbody.firstChild;
  while (cur) {
    const next = cur.nextSibling;
    frag.appendChild(cur);
    cur = next;
  }
  const t1 = performance.now();
  console.log(`move to fragment:              ${(t1 - t0).toFixed(1)}ms`);
  document.body.removeChild(tbody);
}

// Method 7: range between markers (actual mountFor pattern)
{
  const tbody = buildTbody(0);
  const startMarker = document.createComment("");
  const tailMarker = document.createComment("");
  tbody.appendChild(startMarker);
  for (let i = 0; i < 1000; i++) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.textContent = String(i);
    tr.appendChild(td1);
    const td2 = document.createElement("td");
    td2.textContent = `label${i}`;
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
  tbody.appendChild(tailMarker);

  const t0 = performance.now();
  const range = document.createRange();
  range.setStartAfter(startMarker);
  range.setEndBefore(tailMarker);
  range.deleteContents();
  const t1 = performance.now();
  console.log(`range between markers:         ${(t1 - t0).toFixed(1)}ms`);
  document.body.removeChild(tbody);
}

// Method 8: move children between markers to fragment
{
  const tbody = buildTbody(0);
  const startMarker = document.createComment("");
  const tailMarker = document.createComment("");
  tbody.appendChild(startMarker);
  for (let i = 0; i < 1000; i++) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.textContent = String(i);
    tr.appendChild(td1);
    const td2 = document.createElement("td");
    td2.textContent = `label${i}`;
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
  tbody.appendChild(tailMarker);

  const t0 = performance.now();
  const frag = document.createDocumentFragment();
  let cur: Node | null = startMarker.nextSibling;
  while (cur && cur !== tailMarker) {
    const next = cur.nextSibling;
    frag.appendChild(cur);
    cur = next;
  }
  const t1 = performance.now();
  console.log(`move between markers to frag:  ${(t1 - t0).toFixed(1)}ms`);
  document.body.removeChild(tbody);
}
