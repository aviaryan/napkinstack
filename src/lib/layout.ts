import type { ArchNode } from './types'

export const NODE_W = 160
export const NODE_H = 76
export const COL_GAP = 80
const ROW_GAP = 22
const BRANCH_EXTRA = 18
const TIER_PAD_X = 12
const TIER_PAD_TOP = 26

const COLUMN_GROUPS: string[][] = [
  ['client'],
  ['cdn'],
  ['lb', 'combo'],
  ['app'],
  ['cache', 'queue', 'object'],
  ['pooler', 'primary', 'replica', 'ghost-cache', 'ghost-queue', 'ghost-cdn'],
]

const TIER_OF: Record<string, string> = {
  client: 'EDGE',
  cdn: 'EDGE',
  lb: 'TRAFFIC',
  combo: 'COMPUTE',
  app: 'COMPUTE',
  cache: 'DATA',
  queue: 'DATA',
  object: 'DATA',
  pooler: 'DATA',
  primary: 'DATA',
  replica: 'DATA',
  'ghost-cache': 'DATA',
  'ghost-queue': 'DATA',
  'ghost-cdn': 'DATA',
}

export interface TierBand {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

export function positionNodes(nodes: ArchNode[]): Map<string, { x: number; y: number }> {
  const present = new Set(nodes.map((n) => n.id))
  const columns = COLUMN_GROUPS.map((ids) => ids.filter((id) => present.has(id))).filter((col) => col.length > 0)

  const positions = new Map<string, { x: number; y: number }>()
  columns.forEach((col, colIndex) => {
    let y = TIER_PAD_TOP
    col.forEach((id) => {
      positions.set(id, {
        x: colIndex * (NODE_W + COL_GAP),
        y,
      })
      const extra = id === 'queue' || id === 'object' ? BRANCH_EXTRA : 0
      y += NODE_H + ROW_GAP + extra
    })
  })
  return positions
}

export function tierBands(nodes: ArchNode[], positions: Map<string, { x: number; y: number }>): TierBand[] {
  const live = nodes.filter((n) => positions.has(n.id))
  if (live.length === 0) return []

  type Acc = { label: string; minX: number; maxX: number; minY: number; maxY: number }
  const groups: Acc[] = []

  const ordered = [...live].sort((a, b) => (positions.get(a.id)?.x ?? 0) - (positions.get(b.id)?.x ?? 0))
  for (const node of ordered) {
    const pos = positions.get(node.id)
    if (!pos) continue
    const label = TIER_OF[node.id] ?? TIER_OF[node.kind] ?? 'DATA'
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.minX = Math.min(last.minX, pos.x)
      last.maxX = Math.max(last.maxX, pos.x)
      last.minY = Math.min(last.minY, pos.y)
      last.maxY = Math.max(last.maxY, pos.y)
    } else {
      groups.push({ label, minX: pos.x, maxX: pos.x, minY: pos.y, maxY: pos.y })
    }
  }

  return groups.map((g, i) => ({
    id: `tier-${g.label}-${i}`,
    label: g.label,
    x: g.minX - TIER_PAD_X,
    y: -4,
    width: g.maxX + NODE_W - g.minX + TIER_PAD_X * 2,
    height: g.maxY + NODE_H + 18,
  }))
}
