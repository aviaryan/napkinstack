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
  type NodeProps,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EDGE_COLOR, isDashed, strokeWidthFor } from '../lib/diagramStyle'
import { formatUsd } from '../lib/format'
import { NODE_H, NODE_W, positionNodes, tierBands } from '../lib/layout'
import type { ArchNode, ArchitectureResult } from '../lib/types'
import { SketchNode } from './SketchNode'

const nodeTypes = { sketch: SketchNode, tier: TierBandNode }

interface DiagramProps {
  result: ArchitectureResult
}

export function Diagram({ result }: DiagramProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const prevLiveIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const live = new Set(result.nodes.filter((n) => !n.ghost).map((n) => n.id))
    const prev = prevLiveIds.current
    const added: string[] = []
    if (prev.size > 0) {
      for (const id of live) {
        if (!prev.has(id)) added.push(id)
      }
    }
    prevLiveIds.current = live
    if (added.length === 0) return
    const notes = added
      .map((id) => result.nodes.find((n) => n.id === id)?.appearNote)
      .filter((note): note is string => Boolean(note))
    setFlashIds(new Set(added))
    setToast(notes[0] ?? `+ ${added.join(', ')}`)
    const fade = window.setTimeout(() => {
      setFlashIds(new Set())
      setToast(null)
    }, 1400)
    return () => window.clearTimeout(fade)
  }, [result])

  const builtNodes = useMemo(
    () => toFlowNodes(result, flashIds, selectedId),
    [flashIds, result, selectedId],
  )
  const builtEdges = useMemo(() => toFlowEdges(result), [result])
  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges)

  useEffect(() => {
    setNodes(builtNodes)
    setEdges(builtEdges)
  }, [builtNodes, builtEdges, setNodes, setEdges])

  const selected = result.nodes.find((n) => n.id === selectedId)

  return (
    <div
      className="relative h-[280px] min-h-[280px] border-b border-ink/15 bg-sheet lg:h-[min(52vh,560px)] lg:min-h-[420px]"
      data-testid="diagram"
    >
      <Legend />
      {toast ? (
        <p className="absolute top-2 left-1/2 z-20 -translate-x-1/2 border border-ink bg-mark px-2 py-1 font-mono text-[10px] text-mark-ink">
          {toast}
        </p>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22, minZoom: 0.2, maxZoom: 1.15 }}
        minZoom={0.18}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        className="arch-flow"
        onInit={(instance) => {
          void instance.fitView({ padding: 0.22 })
        }}
        onNodeClick={(_, node) => {
          if (node.type === 'tier') return
          setSelectedId(node.id)
        }}
        onPaneClick={() => setSelectedId(null)}
      >
        <Background gap={24} size={1} color="rgba(20,32,16,0.16)" />
        <FlowControls showInteractive={false} />
        <FitOnChange
          signature={`${result.band}-${result.nodes.map((n) => n.id).join(',')}-${result.metrics.appN}`}
        />
      </ReactFlow>
      {selected ? <NodeCard node={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
  )
}

function toFlowNodes(
  result: ArchitectureResult,
  flashIds: Set<string>,
  selectedId: string | null,
): Node[] {
  const positions = positionNodes(result.nodes)
  const bands = tierBands(result.nodes, positions)
  const sketch: Node[] = result.nodes.map((node) => ({
    id: node.id,
    type: 'sketch',
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      kind: node.kind,
      title: node.label,
      detail: node.detail,
      ghost: node.ghost,
      stack: node.stack,
      utilization: node.utilization,
      highlight: flashIds.has(node.id),
      selected: selectedId === node.id,
    },
    draggable: !node.ghost,
    width: NODE_W,
    height: NODE_H,
    style: { overflow: 'visible' },
    zIndex: node.ghost ? 0 : 2,
  }))

  const tiers: Node[] = bands.map((band) => ({
    id: band.id,
    type: 'tier',
    position: { x: band.x, y: band.y },
    data: { label: band.label },
    selectable: false,
    draggable: false,
    focusable: false,
    width: band.width,
    height: band.height,
    style: { width: band.width, height: band.height, pointerEvents: 'none' },
    zIndex: -1,
  }))

  return [...tiers, ...sketch]
}

function toFlowEdges(result: ArchitectureResult): Edge[] {
  return result.edges.map((edge) => {
    const color = EDGE_COLOR[edge.role]
    const width = strokeWidthFor(edge.qps)
    const dashed = isDashed(edge.role)
    const branch = edge.role === 'async' || edge.role === 'read' || edge.role === 'replication'
    const replication = edge.role === 'replication'
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: replication ? 'south' : undefined,
      targetHandle: replication ? 'north' : undefined,
      label: edge.label,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: color,
        strokeWidth: width,
        strokeDasharray: dashed ? '5 4' : undefined,
      },
      labelStyle: { fill: color, fontFamily: 'Red Hat Mono, monospace', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: '#e4ebd4', fillOpacity: 1 },
      labelBgPadding: [4, 2] as [number, number],
      labelPosition: branch ? 0.38 : 0.5,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    }
  })
}

function Legend() {
  return (
    <ul className="pointer-events-none absolute top-2 left-3 z-10 space-y-0.5 border border-ink/20 bg-sheet/90 px-2 py-1.5 font-mono text-[9px] tracking-wide text-ink uppercase">
      <li className="flex items-center gap-2">
        <span className="inline-block h-[2px] w-5 bg-ballpoint" />
        reads
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-[2px] w-5 bg-[#b8860b]" />
        writes
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block w-5 border-t border-dashed border-[#5c4a16]" />
        async
      </li>
    </ul>
  )
}

function NodeCard({ node, onClose }: { node: ArchNode; onClose: () => void }) {
  return (
    <div className="absolute bottom-2 left-12 z-20 max-w-xs border border-ink bg-sheet px-3 py-2 shadow-[3px_3px_0_rgba(20,32,16,0.2)]">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-sm font-bold">{node.label}</p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] tracking-wider uppercase text-muted hover:text-ink"
        >
          Close
        </button>
      </div>
      {node.ghost ? <p className="mt-1 font-mono text-[10px] text-muted">Not in this sketch yet</p> : null}
      {node.why ? <p className="mt-1 text-xs leading-relaxed text-ink">{node.why}</p> : null}
      {node.monthly != null ? (
        <p className="mt-1 font-mono text-[11px] text-ballpoint">{formatUsd(node.monthly)}/mo</p>
      ) : null}
    </div>
  )
}

function TierBandNode({ data }: NodeProps<Node<{ label: string }>>) {
  return (
    <div className="flex h-full w-full flex-col border border-ink/10 bg-ink/[0.03]">
      <p className="px-1.5 pt-0.5 font-mono text-[9px] tracking-[0.18em] text-muted uppercase">{data.label}</p>
    </div>
  )
}

function FitOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    let timer = 0
    const run = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void fitView({ padding: 0.22, duration: 120, minZoom: 0.18, maxZoom: 1.15 })
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
