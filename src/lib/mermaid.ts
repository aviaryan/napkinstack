import type { ArchitectureResult } from './types'

export function toMermaid(result: ArchitectureResult): string {
  const lines = ['flowchart LR']
  for (const node of result.nodes) {
    const text = `${node.label}\\n${node.detail}`.replace(/"/g, "'")
    lines.push(`  ${safeId(node.id)}["${text}"]`)
  }
  for (const edge of result.edges) {
    const label = edge.label.replace(/"/g, "'")
    lines.push(`  ${safeId(edge.source)} -->|${label}| ${safeId(edge.target)}`)
  }
  return lines.join('\n')
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}
