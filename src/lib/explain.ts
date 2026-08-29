import type { ArchitectureInput, ArchitectureMetrics, Band, RecipeFlags } from './types'
import { formatQpsShort, formatUsers } from './format'

export function explainArchitecture(
  input: ArchitectureInput,
  band: Band,
  flags: RecipeFlags,
  metrics: ArchitectureMetrics,
): string[] {
  const peak = formatQpsShort(metrics.peakTotalQps)
  const avg = formatQpsShort(metrics.avgReadQps + metrics.avgWriteQps)
  const users = formatUsers(input.users)
  const lines: string[] = []

  if (band === 'hobby') {
    lines.push(
      `Peak load is only ~${peak} QPS (about ${avg} average), so this still fits on one machine.`,
    )
    lines.push(
      `Run the app and Postgres (or SQLite) on a single VM. There is no load balancer — you are the failover plan.`,
    )
  } else if (band === 'small') {
    lines.push(
      `At ~${peak} peak QPS a reverse proxy in front of ${metrics.appN} app instances and one Postgres is the boring shape.`,
    )
    if (flags.cache) {
      lines.push(
        `Reads outpace writes by more than 8×, so a small cache is worth standing up even at this size.`,
      )
    } else {
      lines.push(`No cache yet — the read/write mix is not cache-heavy enough to bother.`)
    }
  } else if (band === 'medium') {
    lines.push(
      `${users} users push peak to ~${peak} QPS. That wants a load balancer, ${metrics.appN} app boxes, Redis, and a managed primary.`,
    )
  } else if (band === 'large') {
    lines.push(
      `~${peak} peak QPS is a scaled monolith: ${metrics.appN} app instances, a Redis cluster, and a bigger primary.`,
    )
    if (flags.queue) {
      lines.push(
        `Writes peak around ${formatQpsShort(metrics.peakWriteQps)} QPS, so a managed queue absorbs spikes instead of landing every write on the request path.`,
      )
    }
  } else {
    lines.push(
      `~${peak} peak QPS is still a boring monolith — just a large one. Add connection pooling (PgBouncer) and plan for sharding the primary later; do not invent Kubernetes for this.`,
    )
    lines.push(
      `${metrics.appN} app instances sit behind one load balancer. Multiple app pools (API vs workers) are enough; skip a mesh of microservices.`,
    )
    if (flags.queue) {
      lines.push(
        `A queue sits in front of the heaviest writes (~${formatQpsShort(metrics.peakWriteQps)} QPS peak).`,
      )
    }
  }

  if (input.instantConsistency) {
    lines.push(
      `Instant consistency is on: user-facing reads go to the primary (write-through / tiny TTL cache). No async replica-reads, and a CDN is never the source of truth.`,
    )
  } else if (metrics.replicas > 0) {
    lines.push(
      `${metrics.replicas} read replica${metrics.replicas === 1 ? '' : 's'} take leftover reads after a ${Math.round(metrics.cacheHitUsed * 100)}% cache hit (~${formatQpsShort(metrics.effectiveDbReads)} QPS still hits the database).`,
    )
  } else if (flags.allowReplicas && band !== 'hobby') {
    lines.push(`The primary can absorb the leftover cache-miss reads, so no replicas yet.`)
  }

  if (flags.cdn && input.appShape !== 'crud') {
    lines.push(
      `A CDN sits in front for static${input.appShape === 'content' ? ' and media' : ''} assets. It does not answer product reads.`,
    )
  } else if (flags.cdn) {
    lines.push(`A CDN is in the picture for static assets at this scale.`)
  }

  if (flags.object) {
    lines.push(`Object storage holds media blobs so the database is not a file server.`)
  }

  return lines.slice(0, 6)
}

export function assumptionList(input: ArchitectureInput, flags: RecipeFlags): string[] {
  const items = [
    `Peak = average × ${input.peakFactor}. Real peaks vary; this is a teaching knob.`,
    `One app instance is assumed to hold ~${input.rpsPerInstance} rps before you add another.`,
    `Storage is ${formatBytes(input.bytesPerUser)} per user × 1.5 for indexes and overhead.`,
    `Egress ≈ peak QPS × ${input.payloadKb} KB × 2.6e6 seconds/month.`,
    input.instantConsistency
      ? 'Cache hit rate is ignored for user-facing reads while instant consistency is on.'
      : `Cache hit rate ${Math.round(input.cacheHitRate * 100)}% applies only to cacheable reads.`,
    `Prices are rough 2026 USD/month ballparks, not a quote.`,
  ]
  if (flags.comboAppDb) {
    items.push('Hobby band colocates the app and the database on one VM.')
  }
  if (input.provider === 'cheap') {
    items.push('Cheaper-managed flavor swaps RDS/ALB labels for PlanetScale / Fly-style prices.')
  }
  return items
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${bytes / 1_000_000} MB`
  if (bytes >= 1000) return `${bytes / 1000} KB`
  return `${bytes} B`
}
