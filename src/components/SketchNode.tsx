import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { NodeKind } from '../lib/types'

export type SketchNodeData = {
  kind: NodeKind
  title: string
  detail: string
  ghost?: boolean
  stack?: boolean
  utilization?: number
  highlight?: boolean
  selected?: boolean
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
  const ghost = Boolean(data.ghost)
  const stack = data.stack && !ghost

  return (
    <div
      className={`relative h-[76px] w-[160px] border bg-node px-2 py-1.5 ${
        ghost
          ? 'border-dashed border-ink/40 bg-sheet/70 text-muted opacity-70'
          : 'border-ink shadow-[2px_2px_0_var(--shadow-ink)]'
      } ${db && !ghost ? 'bg-panel' : ''} ${
        data.highlight ? 'node-enter outline outline-2 outline-offset-1 outline-mark' : ''
      } ${data.selected ? 'ring-2 ring-ballpoint' : ''} ${stack ? 'node-stack' : ''}`}
      data-testid={ghost ? `node-ghost-${data.kind}` : `node-${data.kind}`}
    >
      {ghost ? null : (
        <>
          <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-ink !bg-sheet" />
          <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-ink !bg-sheet" />
          {data.kind === 'replica' ? (
            <Handle type="target" id="north" position={Position.Top} className="!h-2 !w-2 !border-ink !bg-sheet" />
          ) : null}
          {data.kind === 'primary' ? (
            <Handle type="source" id="south" position={Position.Bottom} className="!h-2 !w-2 !border-ink !bg-sheet" />
          ) : null}
        </>
      )}
      <p className="flex items-center gap-1 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-ballpoint">
        <KindGlyph kind={data.kind} />
        {KIND_LABEL[data.kind]}
      </p>
      {data.kind === 'combo' && !ghost ? (
        <div className="mt-0.5 grid grid-cols-2 divide-x divide-ink/30">
          <p className="pr-1.5 font-display text-[13px] leading-tight font-bold">App</p>
          <p className="pl-1.5 font-display text-[13px] leading-tight font-bold">Postgres</p>
        </div>
      ) : (
        <p className="font-display text-[15px] leading-tight font-bold tracking-tight text-ink">{data.title}</p>
      )}
      <p className="mt-0.5 line-clamp-2 whitespace-pre-line font-mono text-[10px] leading-snug text-muted">{data.detail}</p>
      {accent && !ghost ? (
        <span className="absolute top-1.5 right-1.5 h-2 w-5 bg-mark" aria-hidden="true" />
      ) : null}
      {data.utilization != null && !ghost ? (
        <span className="absolute right-1.5 bottom-1 left-1.5 h-[3px] bg-ink/15" aria-hidden="true">
          <span
            className={`block h-full ${data.utilization > 0.85 ? 'bg-mark' : 'bg-ballpoint'}`}
            style={{ width: `${Math.round(data.utilization * 100)}%` }}
          />
        </span>
      ) : null}
    </div>
  )
}

function KindGlyph({ kind }: { kind: NodeKind }) {
  const common = 'h-3 w-3 shrink-0 stroke-current'
  switch (kind) {
    case 'primary':
    case 'replica':
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <ellipse cx="6" cy="3" rx="4.2" ry="1.6" strokeWidth="1.2" />
          <path d="M1.8 3v6c0 .9 1.9 1.6 4.2 1.6s4.2-.7 4.2-1.6V3" strokeWidth="1.2" />
        </svg>
      )
    case 'cache':
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <path d="M7.5 1.2 3 6.8h3.1L4.5 10.8 9 5.2H5.9L7.5 1.2Z" strokeWidth="1.1" />
        </svg>
      )
    case 'queue':
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <path d="M2 3h8M2 6h8M2 9h5" strokeWidth="1.2" />
        </svg>
      )
    case 'object':
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <path d="M2 4.2 6 2.2 10 4.2v4.2L6 10.6 2 8.4V4.2Z" strokeWidth="1.1" />
          <path d="M2 4.2 6 6.2 10 4.2M6 6.2v4.4" strokeWidth="1.1" />
        </svg>
      )
    case 'cdn':
    case 'client':
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.2" strokeWidth="1.2" />
          <path d="M6 1.8v8.4M1.8 6h8.4M3 3.4c1.2.8 4.8.8 6 0M3 8.6c1.2-.8 4.8-.8 6 0" strokeWidth="1" />
        </svg>
      )
    case 'combo':
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <rect x="1.5" y="2.5" width="4" height="7" strokeWidth="1.1" />
          <rect x="6.5" y="2.5" width="4" height="7" strokeWidth="1.1" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <rect x="2" y="2.5" width="8" height="7" strokeWidth="1.2" />
        </svg>
      )
  }
}
