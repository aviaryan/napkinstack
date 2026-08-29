import type { EdgeRole } from './types'

export const EDGE_COLOR: Record<EdgeRole, string> = {
  read: '#1e4d9c',
  write: '#b8860b',
  mixed: '#142010',
  async: '#5c4a16',
  static: '#5a6b50',
  replication: '#5a6b50',
}

export function strokeWidthFor(qps: number | undefined): number {
  if (qps == null || qps <= 0) return 1.15
  const t = Math.log10(Math.max(qps, 1)) / Math.log10(50_000)
  return 1.15 + Math.min(1, Math.max(0, t)) * 3.6
}

export function isDashed(role: EdgeRole): boolean {
  return role === 'async' || role === 'replication'
}
