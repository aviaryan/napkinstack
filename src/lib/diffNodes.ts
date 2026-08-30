import type { ArchNode } from './types'

export function diffLiveNodes(
  prev: ArchNode[],
  next: ArchNode[],
): { added: ArchNode[]; removed: ArchNode[] } {
  const prevLive = prev.filter((node) => !node.ghost)
  const nextLive = next.filter((node) => !node.ghost)
  const prevIds = new Set(prevLive.map((node) => node.id))
  const nextIds = new Set(nextLive.map((node) => node.id))
  return {
    added: nextLive.filter((node) => !prevIds.has(node.id)),
    removed: prevLive.filter((node) => !nextIds.has(node.id)),
  }
}

export function changeNotes(added: ArchNode[], removed: ArchNode[]): string[] {
  return [
    ...added.map((node) => node.appearNote ?? `+ ${node.label}`),
    ...removed.map((node) => `− ${node.label}`),
  ]
}
