// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

    import { getBezierPath, getSmoothStepPath, getStepPath, getStraightPath, getWaypointPath, getEdgePath, getHandlePosition, getNodeIntersection, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT, Position } from '@pyreon/flow'
    import { Text } from '@pyreon/primitives'
    export function App() {
      const straight = getStraightPath({ sourceX: 0, sourceY: 1, targetX: 20, targetY: 21 })
      const bezier = getBezierPath({ sourceX: 0, sourceY: 1, sourcePosition: Position.Right, targetX: 20, targetY: 21, targetPosition: Position.Left, curvature: 0.4 })
      const smooth = getSmoothStepPath({ sourceX: 0, sourceY: 1, targetX: 20, targetY: 21, borderRadius: 7, offset: 12 })
      const step = getStepPath({ sourceX: 0, sourceY: 1, targetX: 20, targetY: 21, offset: 8 })
      const waypoint = getWaypointPath({ sourceX: 0, sourceY: 1, targetX: 20, targetY: 21, waypoints: [{ x: 5, y: 6 }] })
      const dispatched = getEdgePath('step', 0, 1, Position.Right, 20, 21, Position.Left, { offset: 9 })
      const anchor = getHandlePosition(Position.Bottom, 0, 1, 20, 21)
      const intersection = getNodeIntersection({ x: 0, y: 0, width: 100, height: 40 }, { x: 200, y: 20 })
      const defaults = DEFAULT_NODE_WIDTH + DEFAULT_NODE_HEIGHT
      void straight; void bezier; void smooth; void step; void waypoint; void anchor; void intersection; void defaults
      return <Text>{dispatched.path}</Text>
    }
