import { signal } from "@pyreon/reactivity"
import { describe, expect, it, vi } from "vitest"

describe("useDraggable", () => {
  it("exports useDraggable", async () => {
    const { useDraggable } = await import("../index")
    expect(useDraggable).toBeDefined()
    expect(typeof useDraggable).toBe("function")
  })

  it("returns isDragging signal", async () => {
    const { useDraggable } = await import("../use-draggable")
    const el = document.createElement("div")
    const result = useDraggable({
      element: () => el,
      data: { id: "1" },
    })
    expect(result.isDragging).toBeDefined()
    expect(typeof result.isDragging).toBe("function")
    expect(result.isDragging()).toBe(false)
  })
})

describe("useDroppable", () => {
  it("exports useDroppable", async () => {
    const { useDroppable } = await import("../index")
    expect(useDroppable).toBeDefined()
    expect(typeof useDroppable).toBe("function")
  })

  it("returns isOver signal", async () => {
    const { useDroppable } = await import("../use-droppable")
    const el = document.createElement("div")
    const result = useDroppable({
      element: () => el,
      onDrop: () => {},
    })
    expect(result.isOver).toBeDefined()
    expect(typeof result.isOver).toBe("function")
    expect(result.isOver()).toBe(false)
  })
})

describe("useSortable", () => {
  it("exports useSortable", async () => {
    const { useSortable } = await import("../index")
    expect(useSortable).toBeDefined()
    expect(typeof useSortable).toBe("function")
  })

  it("returns sortable API", async () => {
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

    expect(result.containerRef).toBeDefined()
    expect(typeof result.containerRef).toBe("function")
    expect(result.itemRef).toBeDefined()
    expect(typeof result.itemRef).toBe("function")
    expect(result.activeId()).toBeNull()
    expect(result.overId()).toBeNull()
  })

  it("itemRef returns a ref callback per key", async () => {
    const { useSortable } = await import("../use-sortable")
    const items = signal([{ id: "1" }])

    const { itemRef } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: () => {},
    })

    const refFn = itemRef("1")
    expect(typeof refFn).toBe("function")
  })
})

describe("useFileDrop", () => {
  it("exports useFileDrop", async () => {
    const { useFileDrop } = await import("../index")
    expect(useFileDrop).toBeDefined()
    expect(typeof useFileDrop).toBe("function")
  })

  it("returns isOver and isDraggingFiles signals", async () => {
    const { useFileDrop } = await import("../use-file-drop")
    const el = document.createElement("div")
    const result = useFileDrop({
      element: () => el,
      onDrop: () => {},
    })
    expect(result.isOver()).toBe(false)
    expect(result.isDraggingFiles()).toBe(false)
  })
})

describe("useDragMonitor", () => {
  it("exports useDragMonitor", async () => {
    const { useDragMonitor } = await import("../index")
    expect(useDragMonitor).toBeDefined()
    expect(typeof useDragMonitor).toBe("function")
  })

  it("returns isDragging and dragData signals", async () => {
    const { useDragMonitor } = await import("../use-drag-monitor")
    const result = useDragMonitor()
    expect(result.isDragging()).toBe(false)
    expect(result.dragData()).toBeNull()
  })
})

describe("type exports", () => {
  it("exports all types", async () => {
    const mod = await import("../index")
    expect(mod.useDraggable).toBeDefined()
    expect(mod.useDroppable).toBeDefined()
    expect(mod.useSortable).toBeDefined()
    expect(mod.useFileDrop).toBeDefined()
    expect(mod.useDragMonitor).toBeDefined()
  })
})
