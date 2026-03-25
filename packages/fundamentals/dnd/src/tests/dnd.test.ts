import { signal } from "@pyreon/reactivity"
import { describe, expect, it } from "vitest"

// ─── useDraggable ───────────────────────────────────────────────────────────

describe("useDraggable", () => {
  it("exports useDraggable", async () => {
    const { useDraggable } = await import("../index")
    expect(typeof useDraggable).toBe("function")
  })

  it("returns isDragging signal initialized to false", async () => {
    const { useDraggable } = await import("../use-draggable")
    const el = document.createElement("div")
    const { isDragging } = useDraggable({ element: () => el, data: { id: "1" } })
    expect(isDragging()).toBe(false)
  })

  it("accepts function data for dynamic values", async () => {
    const { useDraggable } = await import("../use-draggable")
    const el = document.createElement("div")
    const counter = signal(0)
    const { isDragging } = useDraggable({
      element: () => el,
      data: () => ({ count: counter() }),
    })
    expect(isDragging()).toBe(false)
  })

  it("accepts disabled as boolean", async () => {
    const { useDraggable } = await import("../use-draggable")
    const el = document.createElement("div")
    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: "1" },
      disabled: true,
    })
    expect(isDragging()).toBe(false)
  })

  it("accepts disabled as reactive getter", async () => {
    const { useDraggable } = await import("../use-draggable")
    const el = document.createElement("div")
    const disabled = signal(false)
    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: "1" },
      disabled,
    })
    expect(isDragging()).toBe(false)
  })

  it("handles null element gracefully", async () => {
    const { useDraggable } = await import("../use-draggable")
    const { isDragging } = useDraggable({
      element: () => null,
      data: { id: "1" },
    })
    expect(isDragging()).toBe(false)
  })
})

// ─── useDroppable ───────────────────────────────────────────────────────────

describe("useDroppable", () => {
  it("exports useDroppable", async () => {
    const { useDroppable } = await import("../index")
    expect(typeof useDroppable).toBe("function")
  })

  it("returns isOver signal initialized to false", async () => {
    const { useDroppable } = await import("../use-droppable")
    const el = document.createElement("div")
    const { isOver } = useDroppable({ element: () => el, onDrop: () => {} })
    expect(isOver()).toBe(false)
  })

  it("accepts canDrop filter", async () => {
    const { useDroppable } = await import("../use-droppable")
    const el = document.createElement("div")
    const { isOver } = useDroppable({
      element: () => el,
      canDrop: (data) => data.type === "card",
      onDrop: () => {},
    })
    expect(isOver()).toBe(false)
  })

  it("handles null element gracefully", async () => {
    const { useDroppable } = await import("../use-droppable")
    const { isOver } = useDroppable({ element: () => null, onDrop: () => {} })
    expect(isOver()).toBe(false)
  })
})

// ─── useSortable ────────────────────────────────────────────────────────────

describe("useSortable", () => {
  it("exports useSortable", async () => {
    const { useSortable } = await import("../index")
    expect(typeof useSortable).toBe("function")
  })

  it("returns full sortable API with overEdge", async () => {
    const { useSortable } = await import("../use-sortable")
    const items = signal([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "3", name: "C" },
    ])

    const result = useSortable({
      items,
      by: (item) => item.id,
      onReorder: (newItems) => items.set(newItems),
    })

    expect(typeof result.containerRef).toBe("function")
    expect(typeof result.itemRef).toBe("function")
    expect(result.activeId()).toBeNull()
    expect(result.overId()).toBeNull()
    expect(result.overEdge()).toBeNull()
  })

  it("itemRef returns a ref callback per key", async () => {
    const { useSortable } = await import("../use-sortable")
    const items = signal([{ id: "1" }, { id: "2" }])

    const { itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    })

    const ref1 = itemRef("1")
    const ref2 = itemRef("2")
    expect(typeof ref1).toBe("function")
    expect(typeof ref2).toBe("function")
    expect(ref1).not.toBe(ref2)
  })

  it("itemRef sets accessibility attributes on elements", async () => {
    const { useSortable } = await import("../use-sortable")
    const items = signal([{ id: "1" }])

    const { itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    })

    const el = document.createElement("div")
    itemRef("1")(el)

    expect(el.getAttribute("role")).toBe("listitem")
    expect(el.getAttribute("aria-roledescription")).toBe("sortable item")
    expect(el.getAttribute("tabindex")).toBe("0")
    expect(el.dataset.pyreonSortKey).toBe("1")
  })

  it("does not override existing tabindex", async () => {
    const { useSortable } = await import("../use-sortable")
    const items = signal([{ id: "1" }])

    const { itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    })

    const el = document.createElement("div")
    el.setAttribute("tabindex", "-1")
    itemRef("1")(el)

    expect(el.getAttribute("tabindex")).toBe("-1")
  })

  it("supports horizontal axis", async () => {
    const { useSortable } = await import("../use-sortable")
    const items = signal([{ id: "1" }, { id: "2" }])

    const result = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
      axis: "horizontal",
    })

    expect(result.activeId()).toBeNull()
  })
})

// ─── useFileDrop ────────────────────────────────────────────────────────────

describe("useFileDrop", () => {
  it("exports useFileDrop", async () => {
    const { useFileDrop } = await import("../index")
    expect(typeof useFileDrop).toBe("function")
  })

  it("returns isOver and isDraggingFiles signals", async () => {
    const { useFileDrop } = await import("../use-file-drop")
    const el = document.createElement("div")
    const { isOver, isDraggingFiles } = useFileDrop({
      element: () => el,
      onDrop: () => {},
    })
    expect(isOver()).toBe(false)
    expect(isDraggingFiles()).toBe(false)
  })

  it("accepts accept filter and maxFiles", async () => {
    const { useFileDrop } = await import("../use-file-drop")
    const el = document.createElement("div")
    const { isOver } = useFileDrop({
      element: () => el,
      accept: ["image/*", ".pdf"],
      maxFiles: 5,
      onDrop: () => {},
    })
    expect(isOver()).toBe(false)
  })

  it("accepts disabled option", async () => {
    const { useFileDrop } = await import("../use-file-drop")
    const el = document.createElement("div")
    const disabled = signal(true)
    const { isOver } = useFileDrop({
      element: () => el,
      disabled,
      onDrop: () => {},
    })
    expect(isOver()).toBe(false)
  })
})

// ─── useDragMonitor ─────────────────────────────────────────────────────────

describe("useDragMonitor", () => {
  it("exports useDragMonitor", async () => {
    const { useDragMonitor } = await import("../index")
    expect(typeof useDragMonitor).toBe("function")
  })

  it("returns isDragging and dragData signals", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor")
    const { isDragging, dragData } = useDragMonitor()
    expect(isDragging()).toBe(false)
    expect(dragData()).toBeNull()
  })

  it("accepts canMonitor filter", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor")
    const { isDragging } = useDragMonitor({
      canMonitor: (data) => data.type === "card",
    })
    expect(isDragging()).toBe(false)
  })

  it("accepts onDragStart and onDrop callbacks", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor")
    const { isDragging } = useDragMonitor({
      onDragStart: () => {},
      onDrop: () => {},
    })
    expect(isDragging()).toBe(false)
  })
})

// ─── Module exports ─────────────────────────────────────────────────────────

describe("module exports", () => {
  it("exports all 5 hooks", async () => {
    const mod = await import("../index")
    expect(mod.useDraggable).toBeDefined()
    expect(mod.useDroppable).toBeDefined()
    expect(mod.useSortable).toBeDefined()
    expect(mod.useFileDrop).toBeDefined()
    expect(mod.useDragMonitor).toBeDefined()
  })
})
