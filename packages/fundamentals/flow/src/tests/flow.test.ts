import { effect } from "@pyreon/reactivity"
import { describe, expect, it, vi } from "vitest"
import {
  getBezierPath,
  getEdgePath,
  getHandlePosition,
  getSmoothStepPath,
  getStepPath,
  getStraightPath,
  getWaypointPath,
} from "../edges"
import { createFlow } from "../flow"
import { Position } from "../types"

// ─── Edge path math ──────────────────────────────────────────────────────────

describe("edge paths", () => {
  describe("getBezierPath", () => {
    it("generates a valid SVG path", () => {
      const result = getBezierPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 200,
        targetY: 100,
      })
      expect(result.path).toMatch(/^M/)
      expect(result.path).toContain("C")
      expect(result.labelX).toBe(100)
      expect(result.labelY).toBe(50)
    })

    it("respects source/target positions", () => {
      const right = getBezierPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 200,
        targetY: 0,
        targetPosition: Position.Left,
      })
      const bottom = getBezierPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Bottom,
        targetX: 0,
        targetY: 200,
        targetPosition: Position.Top,
      })
      // Different positions produce different paths
      expect(right.path).not.toBe(bottom.path)
    })

    it("handles custom curvature", () => {
      const low = getBezierPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 200,
        targetY: 100,
        curvature: 0.1,
      })
      const high = getBezierPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 200,
        targetY: 100,
        curvature: 0.5,
      })
      expect(low.path).not.toBe(high.path)
    })
  })

  describe("getStraightPath", () => {
    it("generates a straight line", () => {
      const result = getStraightPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 100,
        targetY: 100,
      })
      expect(result.path).toBe("M0,0 L100,100")
      expect(result.labelX).toBe(50)
      expect(result.labelY).toBe(50)
    })
  })

  describe("getSmoothStepPath", () => {
    it("generates a valid SVG path", () => {
      const result = getSmoothStepPath({
        sourceX: 0,
        sourceY: 0,
        sourcePosition: Position.Right,
        targetX: 200,
        targetY: 100,
        targetPosition: Position.Left,
      })
      expect(result.path).toMatch(/^M/)
      expect(result.labelX).toBe(100)
      expect(result.labelY).toBe(50)
    })

    it("handles all position combinations", () => {
      const combos = [
        { sourcePosition: Position.Right, targetPosition: Position.Top },
        { sourcePosition: Position.Bottom, targetPosition: Position.Left },
        { sourcePosition: Position.Right, targetPosition: Position.Left },
        { sourcePosition: Position.Bottom, targetPosition: Position.Top },
      ]
      for (const combo of combos) {
        const result = getSmoothStepPath({
          sourceX: 0,
          sourceY: 0,
          ...combo,
          targetX: 200,
          targetY: 100,
        })
        expect(result.path).toMatch(/^M/)
      }
    })
  })

  describe("getStepPath", () => {
    it("is smoothstep with borderRadius 0", () => {
      const step = getStepPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 200,
        targetY: 100,
      })
      expect(step.path).toMatch(/^M/)
    })
  })

  describe("getEdgePath", () => {
    it("routes to correct path generator", () => {
      const bezier = getEdgePath("bezier", 0, 0, Position.Right, 200, 100, Position.Left)
      const straight = getEdgePath("straight", 0, 0, Position.Right, 200, 100, Position.Left)
      const smooth = getEdgePath("smoothstep", 0, 0, Position.Right, 200, 100, Position.Left)
      const step = getEdgePath("step", 0, 0, Position.Right, 200, 100, Position.Left)

      expect(bezier.path).toContain("C") // bezier has control points
      expect(straight.path).toContain("L") // straight is a line
      expect(smooth.path).toMatch(/^M/) // smoothstep is valid
      expect(step.path).toMatch(/^M/) // step is valid
    })

    it("defaults to bezier for unknown type", () => {
      const result = getEdgePath("unknown", 0, 0, Position.Right, 200, 100, Position.Left)
      expect(result.path).toContain("C")
    })
  })

  describe("getHandlePosition", () => {
    it("returns correct positions", () => {
      const top = getHandlePosition(Position.Top, 0, 0, 100, 50)
      expect(top).toEqual({ x: 50, y: 0 })

      const right = getHandlePosition(Position.Right, 0, 0, 100, 50)
      expect(right).toEqual({ x: 100, y: 25 })

      const bottom = getHandlePosition(Position.Bottom, 0, 0, 100, 50)
      expect(bottom).toEqual({ x: 50, y: 50 })

      const left = getHandlePosition(Position.Left, 0, 0, 100, 50)
      expect(left).toEqual({ x: 0, y: 25 })
    })
  })
})

// ─── createFlow ──────────────────────────────────────────────────────────────

describe("createFlow", () => {
  describe("initialization", () => {
    it("creates with default empty state", () => {
      const flow = createFlow()
      expect(flow.nodes()).toEqual([])
      expect(flow.edges()).toEqual([])
      expect(flow.viewport()).toEqual({ x: 0, y: 0, zoom: 1 })
    })

    it("creates with initial nodes and edges", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: { label: "A" } },
          { id: "2", position: { x: 200, y: 0 }, data: { label: "B" } },
        ],
        edges: [{ source: "1", target: "2" }],
      })
      expect(flow.nodes()).toHaveLength(2)
      expect(flow.edges()).toHaveLength(1)
      expect(flow.edges()[0]!.id).toBeDefined()
    })

    it("auto-generates edge ids", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        edges: [{ source: "1", target: "2" }],
      })
      expect(flow.edges()[0]!.id).toBe("e-1-2")
    })
  })

  describe("node operations", () => {
    it("addNode adds a node", () => {
      const flow = createFlow()
      flow.addNode({
        id: "1",
        position: { x: 0, y: 0 },
        data: { label: "New" },
      })
      expect(flow.nodes()).toHaveLength(1)
      expect(flow.nodes()[0]!.id).toBe("1")
    })

    it("removeNode removes node and connected edges", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
          { id: "3", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { source: "1", target: "2" },
          { source: "2", target: "3" },
        ],
      })

      flow.removeNode("2")
      expect(flow.nodes()).toHaveLength(2)
      expect(flow.edges()).toHaveLength(0) // both edges connected to '2'
    })

    it("updateNode updates node properties", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: { label: "Old" } }],
      })
      flow.updateNode("1", { data: { label: "New" } })
      expect(flow.getNode("1")!.data.label).toBe("New")
    })

    it("updateNodePosition updates position", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })
      flow.updateNodePosition("1", { x: 100, y: 200 })
      expect(flow.getNode("1")!.position).toEqual({ x: 100, y: 200 })
    })

    it("updateNodePosition snaps to grid when enabled", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
        snapToGrid: true,
        snapGrid: 10,
      })
      flow.updateNodePosition("1", { x: 13, y: 27 })
      expect(flow.getNode("1")!.position).toEqual({ x: 10, y: 30 })
    })

    it("getNode returns undefined for missing id", () => {
      const flow = createFlow()
      expect(flow.getNode("missing")).toBeUndefined()
    })
  })

  describe("edge operations", () => {
    it("addEdge adds an edge", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      flow.addEdge({ source: "1", target: "2" })
      expect(flow.edges()).toHaveLength(1)
    })

    it("addEdge prevents duplicates", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        edges: [{ source: "1", target: "2" }],
      })
      flow.addEdge({ source: "1", target: "2" })
      expect(flow.edges()).toHaveLength(1) // not duplicated
    })

    it("removeEdge removes an edge", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        edges: [{ source: "1", target: "2" }],
      })
      flow.removeEdge("e-1-2")
      expect(flow.edges()).toHaveLength(0)
    })

    it("getEdge returns edge by id", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        edges: [{ id: "my-edge", source: "1", target: "2" }],
      })
      expect(flow.getEdge("my-edge")).toBeDefined()
      expect(flow.getEdge("missing")).toBeUndefined()
    })
  })

  describe("connection rules", () => {
    it("validates connections based on rules", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", type: "input", position: { x: 0, y: 0 }, data: {} },
          { id: "2", type: "process", position: { x: 100, y: 0 }, data: {} },
          { id: "3", type: "output", position: { x: 200, y: 0 }, data: {} },
        ],
        connectionRules: {
          input: { outputs: ["process"] },
          process: { outputs: ["process", "output"] },
          output: { outputs: [] },
        },
      })

      expect(flow.isValidConnection({ source: "1", target: "2" })).toBe(true) // input → process
      expect(flow.isValidConnection({ source: "2", target: "3" })).toBe(true) // process → output
      expect(flow.isValidConnection({ source: "1", target: "3" })).toBe(false) // input → output (blocked)
      expect(flow.isValidConnection({ source: "3", target: "1" })).toBe(false) // output → (no outputs)
    })

    it("allows all connections without rules", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      expect(flow.isValidConnection({ source: "1", target: "2" })).toBe(true)
    })
  })

  describe("selection", () => {
    it("selectNode selects a node", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })
      flow.selectNode("1")
      expect(flow.selectedNodes()).toEqual(["1"])
    })

    it("selectNode replaces selection by default", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      flow.selectNode("1")
      flow.selectNode("2")
      expect(flow.selectedNodes()).toEqual(["2"])
    })

    it("selectNode with additive adds to selection", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      flow.selectNode("1")
      flow.selectNode("2", true)
      expect(flow.selectedNodes()).toEqual(expect.arrayContaining(["1", "2"]))
    })

    it("clearSelection clears all", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })
      flow.selectNode("1")
      flow.clearSelection()
      expect(flow.selectedNodes()).toEqual([])
    })

    it("selectAll selects all nodes", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      flow.selectAll()
      expect(flow.selectedNodes()).toHaveLength(2)
    })

    it("deleteSelected removes selected nodes and edges", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
          { id: "3", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { source: "1", target: "2" },
          { source: "2", target: "3" },
        ],
      })
      flow.selectNode("2")
      flow.deleteSelected()
      expect(flow.nodes()).toHaveLength(2)
      expect(flow.edges()).toHaveLength(0)
      expect(flow.selectedNodes()).toEqual([])
    })
  })

  describe("viewport", () => {
    it("zoomIn increases zoom", () => {
      const flow = createFlow()
      const initial = flow.zoom()
      flow.zoomIn()
      expect(flow.zoom()).toBeGreaterThan(initial)
    })

    it("zoomOut decreases zoom", () => {
      const flow = createFlow()
      const initial = flow.zoom()
      flow.zoomOut()
      expect(flow.zoom()).toBeLessThan(initial)
    })

    it("zoomTo clamps to min/max", () => {
      const flow = createFlow({ minZoom: 0.5, maxZoom: 2 })
      flow.zoomTo(0.1)
      expect(flow.zoom()).toBe(0.5)
      flow.zoomTo(10)
      expect(flow.zoom()).toBe(2)
    })

    it("fitView adjusts viewport to show all nodes", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 500, y: 300 }, data: {} },
        ],
      })
      flow.fitView()
      expect(flow.viewport().zoom).toBeLessThanOrEqual(4)
      expect(flow.viewport().zoom).toBeGreaterThan(0)
    })

    it("fitView with specific nodes", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 1000, y: 1000 }, data: {} },
          { id: "3", position: { x: 50, y: 50 }, data: {} },
        ],
      })
      flow.fitView(["1", "3"])
      // Should zoom in more since only close nodes are targeted
      expect(flow.viewport().zoom).toBeGreaterThan(0)
    })
  })

  describe("viewport — panTo and isNodeVisible", () => {
    it("panTo updates viewport position", () => {
      const flow = createFlow()
      flow.panTo({ x: 100, y: 200 })
      const vp = flow.viewport()
      expect(vp.x).toBe(-100)
      expect(vp.y).toBe(-200)
    })

    it("isNodeVisible checks viewport bounds", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 5000, y: 5000 }, data: {} },
        ],
      })
      expect(flow.isNodeVisible("1")).toBe(true)
      expect(flow.isNodeVisible("2")).toBe(false)
      expect(flow.isNodeVisible("missing")).toBe(false)
    })

    it("fitView with no nodes does nothing", () => {
      const flow = createFlow()
      const before = flow.viewport()
      flow.fitView()
      expect(flow.viewport()).toEqual(before)
    })
  })

  describe("edge selection", () => {
    it("selectEdge selects an edge", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        edges: [{ id: "e1", source: "1", target: "2" }],
      })
      flow.selectEdge("e1")
      expect(flow.selectedEdges()).toEqual(["e1"])
    })

    it("selectEdge clears node selection by default", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        edges: [{ id: "e1", source: "1", target: "2" }],
      })
      flow.selectNode("1")
      flow.selectEdge("e1")
      expect(flow.selectedNodes()).toEqual([])
      expect(flow.selectedEdges()).toEqual(["e1"])
    })

    it("selectEdge additive mode", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
          { id: "3", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { id: "e1", source: "1", target: "2" },
          { id: "e2", source: "2", target: "3" },
        ],
      })
      flow.selectEdge("e1")
      flow.selectEdge("e2", true)
      expect(flow.selectedEdges()).toEqual(expect.arrayContaining(["e1", "e2"]))
    })

    it("deselectNode removes from selection", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      flow.selectNode("1")
      flow.selectNode("2", true)
      flow.deselectNode("1")
      expect(flow.selectedNodes()).toEqual(["2"])
    })

    it("deleteSelected with selected edges only", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        edges: [{ id: "e1", source: "1", target: "2" }],
      })
      flow.selectEdge("e1")
      flow.deleteSelected()
      expect(flow.edges()).toHaveLength(0)
      expect(flow.nodes()).toHaveLength(2) // nodes untouched
    })
  })

  describe("connection rules — edge cases", () => {
    it("returns false for missing source node", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
        connectionRules: { default: { outputs: ["default"] } },
      })
      expect(flow.isValidConnection({ source: "missing", target: "1" })).toBe(false)
    })

    it("returns false for missing target node", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
        connectionRules: { default: { outputs: ["default"] } },
      })
      expect(flow.isValidConnection({ source: "1", target: "missing" })).toBe(false)
    })

    it("allows connection when no rule for source type", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", type: "custom", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        connectionRules: { default: { outputs: [] } },
      })
      expect(flow.isValidConnection({ source: "1", target: "2" })).toBe(true) // no rule for 'custom'
    })
  })

  describe("graph queries", () => {
    it("getConnectedEdges returns edges for a node", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
          { id: "3", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { source: "1", target: "2" },
          { source: "2", target: "3" },
        ],
      })
      expect(flow.getConnectedEdges("2")).toHaveLength(2)
      expect(flow.getConnectedEdges("1")).toHaveLength(1)
    })

    it("getIncomers returns upstream nodes", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
          { id: "3", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { source: "1", target: "3" },
          { source: "2", target: "3" },
        ],
      })
      const incomers = flow.getIncomers("3")
      expect(incomers).toHaveLength(2)
      expect(incomers.map((n) => n.id)).toEqual(expect.arrayContaining(["1", "2"]))
    })

    it("getOutgoers returns downstream nodes", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
          { id: "3", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          { source: "1", target: "2" },
          { source: "1", target: "3" },
        ],
      })
      const outgoers = flow.getOutgoers("1")
      expect(outgoers).toHaveLength(2)
    })
  })

  describe("reactivity", () => {
    it("nodes signal is reactive in effects", () => {
      const flow = createFlow()
      const counts: number[] = []

      effect(() => {
        counts.push(flow.nodes().length)
      })

      flow.addNode({ id: "1", position: { x: 0, y: 0 }, data: {} })
      flow.addNode({ id: "2", position: { x: 100, y: 0 }, data: {} })

      expect(counts).toEqual([0, 1, 2])
    })

    it("zoom is a reactive computed", () => {
      const flow = createFlow()
      const zooms: number[] = []

      effect(() => {
        zooms.push(flow.zoom())
      })

      flow.zoomIn()
      flow.zoomOut()

      expect(zooms).toHaveLength(3)
    })

    it("selectedNodes is reactive", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      const selections: string[][] = []

      effect(() => {
        selections.push([...flow.selectedNodes()])
      })

      flow.selectNode("1")
      flow.selectNode("2", true)

      expect(selections).toHaveLength(3)
      expect(selections[2]).toEqual(expect.arrayContaining(["1", "2"]))
    })
  })

  describe("listeners", () => {
    it("onConnect fires when edge is added", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      const fn = vi.fn()
      flow.onConnect(fn)

      flow.addEdge({ source: "1", target: "2" })
      expect(fn).toHaveBeenCalledWith(expect.objectContaining({ source: "1", target: "2" }))
    })

    it("onNodesChange fires on position update", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })
      const fn = vi.fn()
      flow.onNodesChange(fn)

      flow.updateNodePosition("1", { x: 100, y: 200 })
      expect(fn).toHaveBeenCalledWith([{ type: "position", id: "1", position: { x: 100, y: 200 } }])
    })

    it("onNodesChange fires on remove", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })
      const fn = vi.fn()
      flow.onNodesChange(fn)

      flow.removeNode("1")
      expect(fn).toHaveBeenCalledWith([{ type: "remove", id: "1" }])
    })

    it("listeners can be unsubscribed", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
      })
      const fn = vi.fn()
      const unsub = flow.onConnect(fn)

      flow.addEdge({ source: "1", target: "2" })
      expect(fn).toHaveBeenCalledOnce()

      unsub()
      flow.removeEdge("e-1-2")
      flow.addEdge({ source: "1", target: "2" })
      expect(fn).toHaveBeenCalledOnce() // not called again
    })

    it("dispose clears all listeners", () => {
      const flow = createFlow()
      const fn1 = vi.fn()
      const fn2 = vi.fn()
      flow.onConnect(fn1)
      flow.onNodesChange(fn2)

      flow.dispose()

      flow.addNode({ id: "1", position: { x: 0, y: 0 }, data: {} })
      flow.addEdge({ source: "1", target: "1" })
      expect(fn1).not.toHaveBeenCalled()
      expect(fn2).not.toHaveBeenCalled()
    })
  })

  describe("batch", () => {
    it("batches multiple operations", () => {
      const flow = createFlow()
      const counts: number[] = []

      effect(() => {
        counts.push(flow.nodes().length)
      })

      flow.batch(() => {
        flow.addNode({ id: "1", position: { x: 0, y: 0 }, data: {} })
        flow.addNode({ id: "2", position: { x: 100, y: 0 }, data: {} })
        flow.addNode({ id: "3", position: { x: 200, y: 0 }, data: {} })
      })

      // Should batch into fewer updates (initial + batch result)
      expect(counts[counts.length - 1]).toBe(3)
    })
  })

  describe("real-world patterns", () => {
    it("pipeline workflow", () => {
      const flow = createFlow({
        nodes: [
          {
            id: "fetch",
            type: "input",
            position: { x: 0, y: 0 },
            data: { label: "Fetch Data" },
          },
          {
            id: "transform",
            type: "process",
            position: { x: 200, y: 0 },
            data: { label: "Transform" },
          },
          {
            id: "validate",
            type: "process",
            position: { x: 400, y: 0 },
            data: { label: "Validate" },
          },
          {
            id: "store",
            type: "output",
            position: { x: 600, y: 0 },
            data: { label: "Store" },
          },
        ],
        edges: [
          { source: "fetch", target: "transform" },
          { source: "transform", target: "validate" },
          { source: "validate", target: "store" },
        ],
      })

      expect(flow.nodes()).toHaveLength(4)
      expect(flow.edges()).toHaveLength(3)
      expect(flow.getOutgoers("fetch").map((n) => n.id)).toEqual(["transform"])
      expect(flow.getIncomers("store").map((n) => n.id)).toEqual(["validate"])
    })

    it("branching workflow", () => {
      const flow = createFlow({
        nodes: [
          { id: "start", position: { x: 0, y: 100 }, data: {} },
          { id: "branch-a", position: { x: 200, y: 0 }, data: {} },
          { id: "branch-b", position: { x: 200, y: 200 }, data: {} },
          { id: "merge", position: { x: 400, y: 100 }, data: {} },
        ],
        edges: [
          { source: "start", target: "branch-a" },
          { source: "start", target: "branch-b" },
          { source: "branch-a", target: "merge" },
          { source: "branch-b", target: "merge" },
        ],
      })

      expect(flow.getOutgoers("start")).toHaveLength(2)
      expect(flow.getIncomers("merge")).toHaveLength(2)
    })
  })

  // ─── Waypoints ─────────────────────────────────────────────────────────

  describe("edge waypoints", () => {
    it("getWaypointPath generates path through waypoints", () => {
      const result = getWaypointPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 300,
        targetY: 0,
        waypoints: [
          { x: 100, y: 50 },
          { x: 200, y: -50 },
        ],
      })
      expect(result.path).toBe("M0,0 L100,50 L200,-50 L300,0")
      // Label at middle waypoint (index 1 of 2)
      expect(result.labelX).toBe(200)
      expect(result.labelY).toBe(-50)
    })

    it("getWaypointPath with empty waypoints falls back to straight", () => {
      const result = getWaypointPath({
        sourceX: 0,
        sourceY: 0,
        targetX: 100,
        targetY: 100,
        waypoints: [],
      })
      expect(result.path).toBe("M0,0 L100,100")
    })

    it("addEdgeWaypoint adds a bend point", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [{ id: "e1", source: "1", target: "2" }],
      })

      flow.addEdgeWaypoint("e1", { x: 100, y: 50 })
      expect(flow.getEdge("e1")!.waypoints).toEqual([{ x: 100, y: 50 }])
    })

    it("addEdgeWaypoint at specific index", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          {
            id: "e1",
            source: "1",
            target: "2",
            waypoints: [
              { x: 50, y: 0 },
              { x: 150, y: 0 },
            ],
          },
        ],
      })

      flow.addEdgeWaypoint("e1", { x: 100, y: 50 }, 1)
      expect(flow.getEdge("e1")!.waypoints).toHaveLength(3)
      expect(flow.getEdge("e1")!.waypoints![1]).toEqual({ x: 100, y: 50 })
    })

    it("removeEdgeWaypoint removes a bend point", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          {
            id: "e1",
            source: "1",
            target: "2",
            waypoints: [{ x: 100, y: 50 }],
          },
        ],
      })

      flow.removeEdgeWaypoint("e1", 0)
      expect(flow.getEdge("e1")!.waypoints).toBeUndefined()
    })

    it("updateEdgeWaypoint moves a bend point", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 200, y: 0 }, data: {} },
        ],
        edges: [
          {
            id: "e1",
            source: "1",
            target: "2",
            waypoints: [{ x: 100, y: 50 }],
          },
        ],
      })

      flow.updateEdgeWaypoint("e1", 0, { x: 100, y: -50 })
      expect(flow.getEdge("e1")!.waypoints![0]).toEqual({ x: 100, y: -50 })
    })
  })

  // ─── Search / Filter ───────────────────────────────────────────────────

  describe("search and filter", () => {
    it("findNodes with predicate", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", type: "input", position: { x: 0, y: 0 }, data: {} },
          { id: "2", type: "process", position: { x: 100, y: 0 }, data: {} },
          { id: "3", type: "process", position: { x: 200, y: 0 }, data: {} },
          { id: "4", type: "output", position: { x: 300, y: 0 }, data: {} },
        ],
      })

      expect(flow.findNodes((n) => n.type === "process")).toHaveLength(2)
      expect(flow.findNodes((n) => n.type === "input")).toHaveLength(1)
      expect(flow.findNodes((n) => n.type === "missing")).toHaveLength(0)
    })

    it("searchNodes by label", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: { label: "Fetch Data" } },
          { id: "2", position: { x: 100, y: 0 }, data: { label: "Transform" } },
          {
            id: "3",
            position: { x: 200, y: 0 },
            data: { label: "Fetch Users" },
          },
        ],
      })

      expect(flow.searchNodes("fetch")).toHaveLength(2)
      expect(flow.searchNodes("transform")).toHaveLength(1)
      expect(flow.searchNodes("FETCH")).toHaveLength(2) // case-insensitive
      expect(flow.searchNodes("missing")).toHaveLength(0)
    })

    it("searchNodes falls back to node id", () => {
      const flow = createFlow({
        nodes: [{ id: "api-gateway", position: { x: 0, y: 0 }, data: {} }],
      })

      expect(flow.searchNodes("gateway")).toHaveLength(1)
    })
  })

  // ─── Export / Import ───────────────────────────────────────────────────

  describe("toJSON / fromJSON", () => {
    it("exports and imports flow state", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: { label: "A" } },
          { id: "2", position: { x: 200, y: 0 }, data: { label: "B" } },
        ],
        edges: [{ source: "1", target: "2" }],
      })

      flow.zoomTo(1.5)
      const json = flow.toJSON()

      expect(json.nodes).toHaveLength(2)
      expect(json.edges).toHaveLength(1)
      expect(json.viewport.zoom).toBe(1.5)

      // Create a new flow and import
      const flow2 = createFlow()
      flow2.fromJSON(json)

      expect(flow2.nodes()).toHaveLength(2)
      expect(flow2.edges()).toHaveLength(1)
      expect(flow2.zoom()).toBe(1.5)
    })

    it("fromJSON without viewport keeps current", () => {
      const flow = createFlow()
      flow.zoomTo(2)

      flow.fromJSON({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
        edges: [],
      })

      expect(flow.nodes()).toHaveLength(1)
      expect(flow.zoom()).toBe(2) // unchanged
    })
  })

  // ─── Collision detection ───────────────────────────────────────────────

  describe("collision detection", () => {
    it("getOverlappingNodes detects overlap", () => {
      const flow = createFlow({
        nodes: [
          {
            id: "1",
            position: { x: 0, y: 0 },
            width: 100,
            height: 50,
            data: {},
          },
          {
            id: "2",
            position: { x: 50, y: 25 },
            width: 100,
            height: 50,
            data: {},
          },
          {
            id: "3",
            position: { x: 500, y: 500 },
            width: 100,
            height: 50,
            data: {},
          },
        ],
      })

      expect(flow.getOverlappingNodes("1")).toHaveLength(1)
      expect(flow.getOverlappingNodes("1")[0]!.id).toBe("2")
      expect(flow.getOverlappingNodes("3")).toHaveLength(0)
    })
  })

  // ─── Proximity connect ─────────────────────────────────────────────────

  describe("proximity connect", () => {
    it("finds nearest unconnected node", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
          { id: "3", position: { x: 500, y: 500 }, data: {} },
        ],
      })

      const conn = flow.getProximityConnection("1", 200)
      expect(conn).not.toBeNull()
      expect(conn!.target).toBe("2")
    })

    it("returns null when no node is close", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 500, y: 500 }, data: {} },
        ],
      })

      expect(flow.getProximityConnection("1", 50)).toBeNull()
    })

    it("skips already connected nodes", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: {} },
          { id: "2", position: { x: 100, y: 0 }, data: {} },
        ],
        edges: [{ source: "1", target: "2" }],
      })

      expect(flow.getProximityConnection("1", 200)).toBeNull()
    })
  })

  // ─── Node extent ───────────────────────────────────────────────────────

  describe("node extent", () => {
    it("clamps node position to extent", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
        nodeExtent: [
          [0, 0],
          [500, 500],
        ],
      })

      flow.updateNodePosition("1", { x: -100, y: -100 })
      expect(flow.getNode("1")!.position.x).toBe(0)
      expect(flow.getNode("1")!.position.y).toBe(0)

      flow.updateNodePosition("1", { x: 600, y: 600 })
      expect(flow.getNode("1")!.position.x).toBeLessThanOrEqual(500)
      expect(flow.getNode("1")!.position.y).toBeLessThanOrEqual(500)
    })

    it("setNodeExtent changes boundaries dynamically", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })

      // No extent — no clamping
      flow.updateNodePosition("1", { x: -999, y: -999 })
      expect(flow.getNode("1")!.position.x).toBe(-999)

      // Set extent — large enough for default node size (150x40)
      flow.setNodeExtent([
        [0, 0],
        [500, 500],
      ])
      flow.updateNodePosition("1", { x: -999, y: -999 })
      expect(flow.getNode("1")!.position.x).toBe(0)
    })
  })

  // ─── Undo / Redo ───────────────────────────────────────────────────────

  describe("undo / redo", () => {
    it("undo restores previous state", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })

      flow.pushHistory()
      flow.addNode({ id: "2", position: { x: 100, y: 0 }, data: {} })
      expect(flow.nodes()).toHaveLength(2)

      flow.undo()
      expect(flow.nodes()).toHaveLength(1)
    })

    it("redo restores undone state", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })

      flow.pushHistory()
      flow.addNode({ id: "2", position: { x: 100, y: 0 }, data: {} })

      flow.undo()
      expect(flow.nodes()).toHaveLength(1)

      flow.redo()
      expect(flow.nodes()).toHaveLength(2)
    })
  })

  // ─── Copy / Paste ──────────────────────────────────────────────────────

  describe("copy / paste", () => {
    it("copies and pastes selected nodes", () => {
      const flow = createFlow({
        nodes: [
          { id: "1", position: { x: 0, y: 0 }, data: { label: "A" } },
          { id: "2", position: { x: 200, y: 0 }, data: { label: "B" } },
        ],
        edges: [{ source: "1", target: "2" }],
      })

      flow.selectNode("1")
      flow.selectNode("2", true)
      flow.copySelected()
      flow.paste()

      expect(flow.nodes()).toHaveLength(4)
      // Pasted nodes should have different IDs
      const ids = flow.nodes().map((n) => n.id)
      expect(new Set(ids).size).toBe(4)
    })

    it("paste without copy does nothing", () => {
      const flow = createFlow({
        nodes: [{ id: "1", position: { x: 0, y: 0 }, data: {} }],
      })

      flow.paste()
      expect(flow.nodes()).toHaveLength(1)
    })
  })
})
