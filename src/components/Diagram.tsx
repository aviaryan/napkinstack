import {
  Background,
  Controls as FlowControls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import { useEffect, useMemo } from 'react'
import { NODE_H, NODE_W, positionNodes } from '../lib/layout'
import type { ArchitectureResult } from '../lib/types'
import { SketchNode, type SketchNodeData } from './SketchNode'

const nodeTypes = { sketch: SketchNode }

interface DiagramProps {
  result: ArchitectureResult
}

export function Diagram({ result }: DiagramProps) {
  const builtNodes = useMemo(() => toFlowNodes(result), [result])
  const builtEdges = useMemo(() => toFlowEdges(result), [result])
  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges)

  useEffect(() => {
    setNodes(builtNodes)
    setEdges(builtEdges)
  }, [builtNodes, builtEdges, setNodes, setEdges])

  return (
    <div
      className="relative h-[280px] min-h-[280px] border-b border-ink/15 bg-sheet lg:h-[min(52vh,560px)] lg:min-h-[420px]"
      data-testid="diagram"
    >
      <p className="absolute top-2 right-3 z-10 font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
        request path →
      </p>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.2, maxZoom: 1.15 }}
        minZoom={0.18}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        className="arch-flow"
        onInit={(instance) => {
          void instance.fitView({ padding: 0.2 })
        }}
      >
        <Background gap={24} size={1} color="rgba(20,32,16,0.16)" />
        <FlowControls showInteractive={false} />
        <FitOnChange signature={`${result.band}-${result.nodes.map((n) => n.id).join(',')}-${result.metrics.appN}`} />
      </ReactFlow>
    </div>
  )
}

function toFlowNodes(result: ArchitectureResult): Node<SketchNodeData>[] {
  const positions = positionNodes(result.nodes)
  return result.nodes.map((node) => ({
    id: node.id,
    type: 'sketch',
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: { kind: node.kind, title: node.label, detail: node.detail },
    draggable: true,
    width: NODE_W,
    height: NODE_H,
  }))
}

function toFlowEdges(result: ArchitectureResult): Edge[] {
  return result.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#1e4d9c', strokeWidth: 1.35 },
    labelStyle: { fill: '#1e4d9c', fontFamily: 'Red Hat Mono, monospace', fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: '#e4ebd4' },
    labelBgPadding: [4, 2] as [number, number],
    markerEnd: { type: MarkerType.ArrowClosed, color: '#1e4d9c', width: 16, height: 16 },
  }))
}

function FitOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    let timer = 0
    const run = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void fitView({ padding: 0.2, duration: 120, minZoom: 0.18, maxZoom: 1.15 })
      }, 60)
    }
    run()
    const pane = document.querySelector('.react-flow')
    const ro = pane ? new ResizeObserver(() => run()) : null
    if (pane) ro?.observe(pane)
    window.addEventListener('resize', run)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', run)
      ro?.disconnect()
    }
  }, [fitView, signature])
  return null
}
