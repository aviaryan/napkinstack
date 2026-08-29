import type { ArchitectureResult, EdgeRole } from './types'

const ROLE_STROKE: Record<EdgeRole, string> = {
  read: '#1e4d9c',
  write: '#b8860b',
  mixed: '#142010',
  async: '#5c4a16',
  static: '#5a6b50',
  replication: '#5a6b50',
}

export function toMermaid(result: ArchitectureResult): string {
  const live = result.nodes.filter((n) => !n.ghost)
  const lines = ['flowchart LR']

  const groups = new Map<string, string[]>()
  for (const node of live) {
    const tier = mermaidTier(node.id, node.kind)
    const list = groups.get(tier) ?? []
    list.push(node.id)
    groups.set(tier, list)
  }

  for (const [tier, ids] of groups) {
    lines.push(`  subgraph ${tier}`)
    for (const id of ids) {
      const node = live.find((n) => n.id === id)
      if (!node) continue
      const text = `${node.label}\\n${node.detail}`.replace(/"/g, "'")
      lines.push(`    ${safeId(node.id)}["${text}"]`)
    }
    lines.push('  end')
  }

  const edges = result.edges.filter((e) => live.some((n) => n.id === e.source) && live.some((n) => n.id === e.target))
  for (const edge of edges) {
    const label = edge.label.replace(/"/g, "'")
    const link = edge.role === 'async' || edge.role === 'replication' ? '-.->' : '-->'
    lines.push(`  ${safeId(edge.source)} ${link}|${label}| ${safeId(edge.target)}`)
  }

  edges.forEach((edge, i) => {
    const dash = edge.role === 'async' || edge.role === 'replication' ? ',stroke-dasharray: 5 4' : ''
    lines.push(`  linkStyle ${i} stroke:${ROLE_STROKE[edge.role]}${dash}`)
  })

  return lines.join('\n')
}

function mermaidTier(id: string, kind: string): string {
  if (id === 'client' || id === 'cdn' || kind === 'client' || kind === 'cdn') return 'EDGE'
  if (id === 'lb' || kind === 'lb') return 'TRAFFIC'
  if (id === 'app' || id === 'combo' || kind === 'app' || kind === 'combo') return 'COMPUTE'
  return 'DATA'
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}
