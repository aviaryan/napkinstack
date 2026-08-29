import type { ArchitectureResult } from './types'

/** One drafting-style note for the sheet. Never more than one. */
export function marginNote(result: ArchitectureResult): string | null {
  const live = result.nodes.filter((n) => !n.ghost)
  if (result.metrics.shards > 1) return 'one box cannot take the writes — shard by user id'
  if (result.metrics.cdnOffloadUsed > 0) return 'the edge eats most of the reads'
  if (live.some((n) => n.kind === 'queue')) return "writes don't block the request path"
  if (live.some((n) => n.kind === 'cache')) return 'cache eats the read storm'
  if (result.band === 'hobby') return 'you are the failover plan'
  return null
}
