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
