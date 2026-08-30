import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { edgeLabelKind, labelPoint, type EdgeLabelKind } from '../lib/diagramStyle'

export type SketchEdgeData = {
  label: string
  color: string
  kind: EdgeLabelKind
}

export function SketchEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<Edge<SketchEdgeData>>) {
  const [path, midX, midY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const kind = data?.kind ?? edgeLabelKind('', 'mixed')
  const { x, y } = labelPoint({ kind, sourceX, sourceY, targetX, targetY, midX, midY })
  const text = data?.label ?? ''

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {text ? (
        <EdgeLabelRenderer>
          <div
            className="sketch-edge-label nodrag nopan"
            data-testid="edge-label"
            data-edge={id}
            style={{
              transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
              color: data?.color,
            }}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
