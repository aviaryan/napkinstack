import { COL_GAP, NODE_H } from './layout'
import type { Theme } from './theme'
import type { EdgeRole } from './types'

const PAPER: Record<EdgeRole, string> = {
  read: '#1d4ed8',
  write: '#b8860b',
  mixed: '#1c1a12',
  async: '#5c4a16',
  static: '#6b5e3a',
  replication: '#6b5e3a',
}

const BLUEPRINT: Record<EdgeRole, string> = {
  read: '#7fb4ff',
  write: '#f5c518',
  mixed: '#d6e4f5',
  async: '#c4a35a',
  static: '#5a7fa0',
  replication: '#5a7fa0',
}

export const EDGE_COLOR = PAPER

export function edgeColors(theme: Theme): Record<EdgeRole, string> {
  return theme === 'blueprint' ? BLUEPRINT : PAPER
}

export function sheetFill(theme: Theme): string {
  return theme === 'blueprint' ? '#122238' : '#f4efdd'
}

export function strokeWidthFor(qps: number | undefined): number {
  if (qps == null || qps <= 0) return 1.15
  const t = Math.log10(Math.max(qps, 1)) / Math.log10(50_000)
  return 1.15 + Math.min(1, Math.max(0, t)) * 3.6
}

export function isDashed(role: EdgeRole): boolean {
  return role === 'async' || role === 'replication'
}

export const LABEL_OFFSET_Y = -14
export const BRANCH_INSET_PX = COL_GAP / 2 + 8
export const LABEL_CHAR_PX = 6.2
export const LABEL_BG_PAD_X = 8
export const LABEL_CHAR_BUDGET = 12

const BRANCH_TARGETS = new Set(['queue', 'object', 'replica', 'pooler', 'primary'])

export type EdgeLabelKind = 'path' | 'branch' | 'replication'

export function edgeLabelKind(targetId: string, role: EdgeRole): EdgeLabelKind {
  if (role === 'replication') return 'replication'
  if (BRANCH_TARGETS.has(targetId)) return 'branch'
  return 'path'
}

/** Point for the HTML label. `mid` is getSmoothStepPath's path-center. */
export function labelPoint(opts: {
  kind: EdgeLabelKind
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  midX?: number
  midY?: number
}): { x: number; y: number } {
  const { kind, sourceX, sourceY, targetX, targetY } = opts
  const midX = opts.midX ?? (sourceX + targetX) / 2
  const midY = opts.midY ?? (sourceY + targetY) / 2

  if (kind === 'branch') {
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    if (Math.abs(dx) < 48) {
      return { x: midX + 16, y: midY }
    }
    if (dx < 0 && Math.abs(dy) > 40) {
      return { x: targetX - BRANCH_INSET_PX, y: midY }
    }
    const inset = Math.min(COL_GAP / 2, Math.abs(dx) * 0.45 || COL_GAP / 2)
    const y = dy > 40 ? targetY - NODE_H / 2 - 8 : targetY + LABEL_OFFSET_Y
    return { x: targetX - inset, y }
  }
  if (kind === 'replication') {
    return { x: midX + 12, y: midY }
  }
  return { x: midX, y: midY + LABEL_OFFSET_Y }
}
