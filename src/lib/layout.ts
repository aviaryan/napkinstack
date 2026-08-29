import type { ArchNode } from './types'

export const NODE_W = 160
export const NODE_H = 70
const COL_GAP = 32
const ROW_GAP = 22

const COLUMN_GROUPS: string[][] = [
  ['client'],
  ['cdn'],
  ['lb', 'combo'],
  ['app', 'app-1', 'app-2', 'app-3'],
  ['cache', 'queue', 'object'],
  ['pooler', 'primary', 'replica'],
]

export function positionNodes(nodes: ArchNode[]): Map<string, { x: number; y: number }> {
  const present = new Set(nodes.map((n) => n.id))
  const columns = COLUMN_GROUPS.map((ids) => ids.filter((id) => present.has(id))).filter((col) => col.length > 0)

  const positions = new Map<string, { x: number; y: number }>()
  columns.forEach((col, colIndex) => {
    col.forEach((id, rowIndex) => {
      positions.set(id, {
        x: colIndex * (NODE_W + COL_GAP),
        y: rowIndex * (NODE_H + ROW_GAP),
      })
    })
  })
  return positions
}
