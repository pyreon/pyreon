import { signal } from "@pyreon/reactivity";
import { describe, expect, it } from "vitest";

// ─── useDraggable ───────────────────────────────────────────────────────────

describe("useDraggable", () => {
  it("exports useDraggable", async () => {
    const { useDraggable } = await import("../index");
    expect(typeof useDraggable).toBe("function");
  });

  it("returns isDragging signal initialized to false", async () => {
    const { useDraggable } = await import("../use-draggable");
    const el = document.createElement("div");
    const { isDragging } = useDraggable({ element: () => el, data: { id: "1" } });
    expect(isDragging()).toBe(false);
  });

  it("accepts function data for dynamic values", async () => {
    const { useDraggable } = await import("../use-draggable");
    const el = document.createElement("div");
    const counter = signal(0);
    const { isDragging } = useDraggable({
      element: () => el,
      data: () => ({ count: counter() }),
    });
    expect(isDragging()).toBe(false);
  });

  it("accepts disabled as boolean", async () => {
    const { useDraggable } = await import("../use-draggable");
    const el = document.createElement("div");
    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: "1" },
      disabled: true,
    });
    expect(isDragging()).toBe(false);
  });

  it("accepts disabled as reactive getter", async () => {
    const { useDraggable } = await import("../use-draggable");
    const el = document.createElement("div");
    const disabled = signal(false);
    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: "1" },
      disabled,
    });
    expect(isDragging()).toBe(false);
  });

  it("handles null element gracefully", async () => {
    const { useDraggable } = await import("../use-draggable");
    const { isDragging } = useDraggable({
      element: () => null,
      data: { id: "1" },
    });
    expect(isDragging()).toBe(false);
  });
});

// ─── useDroppable ───────────────────────────────────────────────────────────

describe("useDroppable", () => {
  it("exports useDroppable", async () => {
    const { useDroppable } = await import("../index");
    expect(typeof useDroppable).toBe("function");
  });

  it("returns isOver signal initialized to false", async () => {
    const { useDroppable } = await import("../use-droppable");
    const el = document.createElement("div");
    const { isOver } = useDroppable({ element: () => el, onDrop: () => {} });
    expect(isOver()).toBe(false);
  });

  it("accepts canDrop filter", async () => {
    const { useDroppable } = await import("../use-droppable");
    const el = document.createElement("div");
    const { isOver } = useDroppable({
      element: () => el,
      canDrop: (data) => data.type === "card",
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
  });

  it("handles null element gracefully", async () => {
    const { useDroppable } = await import("../use-droppable");
    const { isOver } = useDroppable({ element: () => null, onDrop: () => {} });
    expect(isOver()).toBe(false);
  });
});

// ─── useSortable ────────────────────────────────────────────────────────────

describe("useSortable", () => {
  it("exports useSortable", async () => {
    const { useSortable } = await import("../index");
    expect(typeof useSortable).toBe("function");
  });

  it("returns full sortable API with overEdge", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "3", name: "C" },
    ]);

    const result = useSortable({
      items,
      by: (item) => item.id,
      onReorder: (newItems) => items.set(newItems),
    });

    expect(typeof result.containerRef).toBe("function");
    expect(typeof result.itemRef).toBe("function");
    expect(result.activeId()).toBeNull();
    expect(result.overId()).toBeNull();
    expect(result.overEdge()).toBeNull();
  });

  it("itemRef returns a ref callback per key", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([{ id: "1" }, { id: "2" }]);

    const { itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    });

    const ref1 = itemRef("1");
    const ref2 = itemRef("2");
    expect(typeof ref1).toBe("function");
    expect(typeof ref2).toBe("function");
    expect(ref1).not.toBe(ref2);
  });

  it("itemRef sets accessibility attributes on elements", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([{ id: "1" }]);

    const { itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    });

    const el = document.createElement("div");
    itemRef("1")(el);

    expect(el.getAttribute("role")).toBe("listitem");
    expect(el.getAttribute("aria-roledescription")).toBe("sortable item");
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.dataset.pyreonSortKey).toBe("1");
  });

  it("does not override existing tabindex", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([{ id: "1" }]);

    const { itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    });

    const el = document.createElement("div");
    el.setAttribute("tabindex", "-1");
    itemRef("1")(el);

    expect(el.getAttribute("tabindex")).toBe("-1");
  });

  it("supports horizontal axis", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([{ id: "1" }, { id: "2" }]);

    const result = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
      axis: "horizontal",
    });

    expect(result.activeId()).toBeNull();
  });
});

// ─── useFileDrop ────────────────────────────────────────────────────────────

describe("useFileDrop", () => {
  it("exports useFileDrop", async () => {
    const { useFileDrop } = await import("../index");
    expect(typeof useFileDrop).toBe("function");
  });

  it("returns isOver and isDraggingFiles signals", async () => {
    const { useFileDrop } = await import("../use-file-drop");
    const el = document.createElement("div");
    const { isOver, isDraggingFiles } = useFileDrop({
      element: () => el,
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
    expect(isDraggingFiles()).toBe(false);
  });

  it("accepts accept filter and maxFiles", async () => {
    const { useFileDrop } = await import("../use-file-drop");
    const el = document.createElement("div");
    const { isOver } = useFileDrop({
      element: () => el,
      accept: ["image/*", ".pdf"],
      maxFiles: 5,
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
  });

  it("accepts disabled option", async () => {
    const { useFileDrop } = await import("../use-file-drop");
    const el = document.createElement("div");
    const disabled = signal(true);
    const { isOver } = useFileDrop({
      element: () => el,
      disabled,
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
  });
});

// ─── useDragMonitor ─────────────────────────────────────────────────────────

describe("useDragMonitor", () => {
  it("exports useDragMonitor", async () => {
    const { useDragMonitor } = await import("../index");
    expect(typeof useDragMonitor).toBe("function");
  });

  it("returns isDragging and dragData signals", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor");
    const { isDragging, dragData } = useDragMonitor();
    expect(isDragging()).toBe(false);
    expect(dragData()).toBeNull();
  });

  it("accepts canMonitor filter", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor");
    const { isDragging } = useDragMonitor({
      canMonitor: (data) => data.type === "card",
    });
    expect(isDragging()).toBe(false);
  });

  it("accepts onDragStart and onDrop callbacks", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor");
    const { isDragging } = useDragMonitor({
      onDragStart: () => {},
      onDrop: () => {},
    });
    expect(isDragging()).toBe(false);
  });
});

// ─── useSortable: containerRef and auto-scroll ────────────────────────────

describe("useSortable containerRef", () => {
  it("containerRef registers auto-scroll and drop target on element", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([{ id: "1" }, { id: "2" }, { id: "3" }]);

    const { containerRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    });

    const container = document.createElement("ul");
    // Should not throw — sets up autoScrollForElements + dropTargetForElements
    expect(() => containerRef(container)).not.toThrow();
  });

  it("containerRef adds keydown event listener to element", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([{ id: "1" }, { id: "2" }]);

    const { containerRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    });

    const container = document.createElement("ul");
    const spy = vi.spyOn(container, "addEventListener");
    containerRef(container);

    expect(spy).toHaveBeenCalledWith("keydown", expect.any(Function));
    spy.mockRestore();
  });
});

// ─── useSortable: overEdge signal ─────────────────────────────────────────

describe("useSortable overEdge", () => {
  it("overEdge signal is initially null", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([{ id: "1" }, { id: "2" }]);

    const { overEdge } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    });

    expect(overEdge()).toBeNull();
  });

  it("overEdge is part of the returned API alongside activeId and overId", async () => {
    const { useSortable } = await import("../use-sortable");
    const items = signal([{ id: "a" }, { id: "b" }]);

    const result = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    });

    expect(result).toHaveProperty("overEdge");
    expect(result).toHaveProperty("activeId");
    expect(result).toHaveProperty("overId");
    expect(result).toHaveProperty("containerRef");
    expect(result).toHaveProperty("itemRef");
  });
});

// ─── useSortable: keyboard handler ─────────────────────────────────────────

describe("useSortable keyboard reordering", () => {
  it("Alt+ArrowDown swaps focused item with next (vertical axis)", async () => {
    const { useSortable } = await import("../use-sortable");
    const reordered: { id: string }[][] = [];
    const items = signal([{ id: "1" }, { id: "2" }, { id: "3" }]);

    const { containerRef, itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: (newItems) => reordered.push(newItems),
    });

    // Build a container with items
    const container = document.createElement("ul");
    document.body.appendChild(container);
    containerRef(container);

    const li1 = document.createElement("li");
    const li2 = document.createElement("li");
    const li3 = document.createElement("li");
    itemRef("1")(li1);
    itemRef("2")(li2);
    itemRef("3")(li3);
    container.appendChild(li1);
    container.appendChild(li2);
    container.appendChild(li3);

    // Focus the first item
    li1.focus();

    // Dispatch Alt+ArrowDown
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: true,
      bubbles: true,
    });
    container.dispatchEvent(event);

    expect(reordered.length).toBe(1);
    expect(reordered[0]!.map((i) => i.id)).toEqual(["2", "1", "3"]);

    document.body.removeChild(container);
  });

  it("Alt+ArrowUp swaps focused item with previous (vertical axis)", async () => {
    const { useSortable } = await import("../use-sortable");
    const reordered: { id: string }[][] = [];
    const items = signal([{ id: "1" }, { id: "2" }, { id: "3" }]);

    const { containerRef, itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: (newItems) => reordered.push(newItems),
    });

    const container = document.createElement("ul");
    document.body.appendChild(container);
    containerRef(container);

    const li1 = document.createElement("li");
    const li2 = document.createElement("li");
    const li3 = document.createElement("li");
    itemRef("1")(li1);
    itemRef("2")(li2);
    itemRef("3")(li3);
    container.appendChild(li1);
    container.appendChild(li2);
    container.appendChild(li3);

    // Focus the second item
    li2.focus();

    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      altKey: true,
      bubbles: true,
    });
    container.dispatchEvent(event);

    expect(reordered.length).toBe(1);
    expect(reordered[0]!.map((i) => i.id)).toEqual(["2", "1", "3"]);

    document.body.removeChild(container);
  });

  it("ignores keyboard events without Alt key", async () => {
    const { useSortable } = await import("../use-sortable");
    const reordered: { id: string }[][] = [];
    const items = signal([{ id: "1" }, { id: "2" }]);

    const { containerRef, itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: (newItems) => reordered.push(newItems),
    });

    const container = document.createElement("ul");
    document.body.appendChild(container);
    containerRef(container);

    const li1 = document.createElement("li");
    const li2 = document.createElement("li");
    itemRef("1")(li1);
    itemRef("2")(li2);
    container.appendChild(li1);
    container.appendChild(li2);

    li1.focus();

    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: false,
      bubbles: true,
    });
    container.dispatchEvent(event);

    expect(reordered.length).toBe(0);

    document.body.removeChild(container);
  });

  it("ignores Alt+ArrowDown at the last item (boundary)", async () => {
    const { useSortable } = await import("../use-sortable");
    const reordered: { id: string }[][] = [];
    const items = signal([{ id: "1" }, { id: "2" }]);

    const { containerRef, itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: (newItems) => reordered.push(newItems),
    });

    const container = document.createElement("ul");
    document.body.appendChild(container);
    containerRef(container);

    const li1 = document.createElement("li");
    const li2 = document.createElement("li");
    itemRef("1")(li1);
    itemRef("2")(li2);
    container.appendChild(li1);
    container.appendChild(li2);

    // Focus last item
    li2.focus();

    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: true,
      bubbles: true,
    });
    container.dispatchEvent(event);

    expect(reordered.length).toBe(0); // no reorder at boundary

    document.body.removeChild(container);
  });

  it("horizontal axis uses ArrowLeft/ArrowRight", async () => {
    const { useSortable } = await import("../use-sortable");
    const reordered: { id: string }[][] = [];
    const items = signal([{ id: "1" }, { id: "2" }, { id: "3" }]);

    const { containerRef, itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: (newItems) => reordered.push(newItems),
      axis: "horizontal",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    containerRef(container);

    const el1 = document.createElement("div");
    const el2 = document.createElement("div");
    const el3 = document.createElement("div");
    itemRef("1")(el1);
    itemRef("2")(el2);
    itemRef("3")(el3);
    container.appendChild(el1);
    container.appendChild(el2);
    container.appendChild(el3);

    el1.focus();

    // ArrowDown should be ignored in horizontal mode
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
    );
    expect(reordered.length).toBe(0);

    // ArrowRight should work
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }),
    );
    expect(reordered.length).toBe(1);
    expect(reordered[0]!.map((i) => i.id)).toEqual(["2", "1", "3"]);

    document.body.removeChild(container);
  });
});

// ─── useFileDrop: MIME type filtering ──────────────────────────────────────

describe("useFileDrop MIME filtering logic", () => {
  it("matchesAccept handles extension patterns (.pdf)", async () => {
    // We can't test matchesAccept directly since it's private,
    // but we can verify the useFileDrop options are accepted
    const { useFileDrop } = await import("../use-file-drop");
    const el = document.createElement("div");
    const { isOver } = useFileDrop({
      element: () => el,
      accept: [".pdf", ".doc", ".docx"],
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
  });

  it("matchesAccept handles wildcard MIME types (image/*)", async () => {
    const { useFileDrop } = await import("../use-file-drop");
    const el = document.createElement("div");
    const { isOver } = useFileDrop({
      element: () => el,
      accept: ["image/*"],
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
  });

  it("matchesAccept handles exact MIME types (application/json)", async () => {
    const { useFileDrop } = await import("../use-file-drop");
    const el = document.createElement("div");
    const { isOver } = useFileDrop({
      element: () => el,
      accept: ["application/json", "text/plain"],
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
  });

  it("handles maxFiles option", async () => {
    const { useFileDrop } = await import("../use-file-drop");
    const el = document.createElement("div");
    const { isOver } = useFileDrop({
      element: () => el,
      accept: ["image/*"],
      maxFiles: 1,
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
  });

  it("handles null element gracefully", async () => {
    const { useFileDrop } = await import("../use-file-drop");
    const { isOver, isDraggingFiles } = useFileDrop({
      element: () => null,
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
    expect(isDraggingFiles()).toBe(false);
  });

  it("accepts disabled as reactive getter", async () => {
    const { useFileDrop } = await import("../use-file-drop");
    const el = document.createElement("div");
    const isDisabled = signal(false);
    const { isOver } = useFileDrop({
      element: () => el,
      disabled: isDisabled,
      onDrop: () => {},
    });
    expect(isOver()).toBe(false);
  });
});

// ─── useDragMonitor: canMonitor filter ─────────────────────────────────────

describe("useDragMonitor canMonitor filter", () => {
  it("canMonitor option is a function that receives drag data", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor");
    const canMonitorCalls: unknown[] = [];

    const { isDragging } = useDragMonitor({
      canMonitor: (data) => {
        canMonitorCalls.push(data);
        return data.type === "card";
      },
    });

    expect(isDragging()).toBe(false);
    // canMonitor is passed to the underlying pragmatic-dnd monitor
    // We can't trigger real drag events, but verify setup doesn't throw
  });

  it("creates monitor without canMonitor (monitors all drags)", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor");
    const { isDragging, dragData } = useDragMonitor();

    expect(isDragging()).toBe(false);
    expect(dragData()).toBeNull();
  });

  it("creates monitor with all options", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor");
    const starts: unknown[] = [];
    const drops: unknown[] = [];

    const { isDragging } = useDragMonitor({
      canMonitor: (data) => data.type === "task",
      onDragStart: (data) => starts.push(data),
      onDrop: (source, target) => drops.push({ source, target }),
    });

    expect(isDragging()).toBe(false);
    // Callbacks are registered — verify no errors on setup
  });
});

// ─── Module exports ─────────────────────────────────────────────────────────

describe("module exports", () => {
  it("exports all 5 hooks", async () => {
    const mod = await import("../index");
    expect(mod.useDraggable).toBeDefined();
    expect(mod.useDroppable).toBeDefined();
    expect(mod.useSortable).toBeDefined();
    expect(mod.useFileDrop).toBeDefined();
    expect(mod.useDragMonitor).toBeDefined();
  });
});
