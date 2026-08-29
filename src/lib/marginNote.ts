import type { ArchitectureResult } from './types'

/** One drafting-style note for the sheet. Never more than one. */
export function marginNote(result: ArchitectureResult): string | null {
  const live = result.nodes.filter((n) => !n.ghost)
  if (live.some((n) => n.kind === 'queue')) return "writes don't block the request path"
  if (live.some((n) => n.kind === 'cache')) return 'cache eats the read storm'
  if (result.band === 'hobby') return 'you are the failover plan'
  return null
}
