import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { NodeKind } from '../lib/types'

export type SketchNodeData = {
  kind: NodeKind
  title: string
  detail: string
}

const KIND_LABEL: Record<NodeKind, string> = {
  client: 'edge',
  cdn: 'cdn',
  lb: 'proxy',
  app: 'compute',
  cache: 'cache',
  queue: 'queue',
  primary: 'primary',
  replica: 'replica',
  object: 'blobs',
  pooler: 'pool',
  combo: 'box',
}

export function SketchNode({ data }: NodeProps<Node<SketchNodeData>>) {
  const accent = data.kind === 'app' || data.kind === 'combo'
  const db = data.kind === 'primary' || data.kind === 'replica'

  return (
    <div
      className={`relative h-[70px] w-[160px] border border-ink bg-node px-2 py-1.5 shadow-[2px_2px_0_rgba(20,32,16,0.18)] ${
        db ? 'bg-panel' : ''
      }`}
      data-testid={`node-${data.kind}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-ink !bg-sheet" />
      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-ballpoint">
        {KIND_LABEL[data.kind]}
      </p>
      <p className="font-display text-[15px] leading-tight font-bold tracking-tight text-ink">{data.title}</p>
      <p className="mt-0.5 font-mono text-[10px] leading-snug text-muted">{data.detail}</p>
      {accent ? (
        <span className="absolute top-1.5 right-1.5 h-2 w-5 bg-mark" aria-hidden="true" />
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-ink !bg-sheet" />
    </div>
  )
}
