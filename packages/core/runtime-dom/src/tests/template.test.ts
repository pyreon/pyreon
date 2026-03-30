import { computed, signal } from "@pyreon/reactivity";
import { _bindDirect, _bindText } from "../template";

// ─── _bindText ──────────────────────────────────────────────────────────────

describe("_bindText", () => {
  test("fast path: signal source sets text and updates reactively", () => {
    const s = signal("hello");
    const node = document.createTextNode("");

    const dispose = _bindText(s, node);
    expect(node.data).toBe("hello");

    s.set("world");
    expect(node.data).toBe("world");

    dispose();
  });

  test("fast path: computed source sets text and updates reactively", () => {
    const s = signal(2);
    const doubled = computed(() => s() * 2);
    const node = document.createTextNode("");

    const dispose = _bindText(doubled, node);
    expect(node.data).toBe("4");

    s.set(5);
    expect(node.data).toBe("10");

    dispose();
  });

  test("fallback: plain function source uses renderEffect", () => {
    const s = signal("initial");
    // Plain function — no .direct property
    const getter = () => s();
    const node = document.createTextNode("");

    const dispose = _bindText(getter as unknown as Parameters<typeof _bindText>[0], node);
    expect(node.data).toBe("initial");

    s.set("updated");
    expect(node.data).toBe("updated");

    dispose();
  });

  test("disposal stops updates for signal source", () => {
    const s = signal("a");
    const node = document.createTextNode("");

    const dispose = _bindText(s, node);
    expect(node.data).toBe("a");

    dispose();

    s.set("b");
    expect(node.data).toBe("a");
  });

  test("disposal stops updates for computed source", () => {
    const s = signal(1);
    const c = computed(() => s() + 10);
    const node = document.createTextNode("");

    const dispose = _bindText(c, node);
    expect(node.data).toBe("11");

    dispose();

    s.set(2);
    expect(node.data).toBe("11");
  });

  test("disposal stops updates for plain function source", () => {
    const s = signal("x");
    const getter = () => s();
    const node = document.createTextNode("");

    const dispose = _bindText(getter as unknown as Parameters<typeof _bindText>[0], node);
    expect(node.data).toBe("x");

    dispose();

    s.set("y");
    expect(node.data).toBe("x");
  });

  test("null value renders as empty string", () => {
    const s = signal<string | null>("text");
    const node = document.createTextNode("");

    const dispose = _bindText(s, node);
    expect(node.data).toBe("text");

    s.set(null);
    expect(node.data).toBe("");

    dispose();
  });

  test("false value renders as empty string", () => {
    const s = signal<string | false>("text");
    const node = document.createTextNode("");

    const dispose = _bindText(s, node);
    s.set(false);
    expect(node.data).toBe("");

    dispose();
  });

  test("undefined value renders as empty string", () => {
    const s = signal<string | undefined>("text");
    const node = document.createTextNode("");

    const dispose = _bindText(s, node);
    s.set(undefined);
    expect(node.data).toBe("");

    dispose();
  });
});

// ─── _bindDirect ────────────────────────────────────────────────────────────

describe("_bindDirect", () => {
  test("fast path: signal source calls updater immediately and on change", () => {
    const s = signal("red");
    const el = document.createElement("div");

    const dispose = _bindDirect(s, (v) => {
      el.className = String(v);
    });

    expect(el.className).toBe("red");

    s.set("blue");
    expect(el.className).toBe("blue");

    dispose();
  });

  test("fallback: plain function source uses renderEffect", () => {
    const s = signal(10);
    const getter = () => s();
    const el = document.createElement("div");

    const dispose = _bindDirect(getter as unknown as Parameters<typeof _bindDirect>[0], (v) => {
      el.style.width = `${v}px`;
    });

    expect(el.style.width).toBe("10px");

    s.set(20);
    expect(el.style.width).toBe("20px");

    dispose();
  });

  test("disposal stops updates for signal source", () => {
    const s = signal("a");
    const el = document.createElement("div");

    const dispose = _bindDirect(s, (v) => {
      el.setAttribute("data-val", String(v));
    });

    expect(el.getAttribute("data-val")).toBe("a");

    dispose();

    s.set("b");
    expect(el.getAttribute("data-val")).toBe("a");
  });

  test("disposal stops updates for plain function source", () => {
    const s = signal(1);
    const getter = () => s();
    const el = document.createElement("div");

    const dispose = _bindDirect(getter as unknown as Parameters<typeof _bindDirect>[0], (v) => {
      el.setAttribute("data-num", String(v));
    });

    expect(el.getAttribute("data-num")).toBe("1");

    dispose();

    s.set(2);
    expect(el.getAttribute("data-num")).toBe("1");
  });
});
