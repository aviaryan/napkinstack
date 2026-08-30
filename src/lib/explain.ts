import {
  APP_BASELINE_VCPU,
  APP_POOL_PER_INSTANCE,
  CACHE_NODE_BUDGET_QPS,
  FLEET_TARGET,
  POOLER_CONNECTION_TRIGGER,
  REPLICA_CAP,
} from '../data/sizes'
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
      `Run the app and Postgres (or SQLite) on a single VM. There is no load balancer, so you are the failover plan.`,
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
      lines.push(`No cache yet. The read/write mix is not cache-heavy enough to bother.`)
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
      `~${peak} peak QPS is still a monolith, just a large one. Scale up before out: we grow instance size before the fleet passes ~${FLEET_TARGET} boxes.`,
    )
    if (metrics.shards > 1) {
      lines.push(
        `Writes exceed any single box, so shard Postgres by user id: ${metrics.shards} shards, ~${formatQpsShort(metrics.originWriteQps / metrics.shards)} writes/s each.`,
      )
    } else {
      lines.push(
        `${metrics.appN} app instances sit behind one load balancer. Plan for sharding the primary later; do not invent Kubernetes for this.`,
      )
    }
    if (flags.queue) {
      lines.push(
        `A queue sits in front of the heaviest writes (~${formatQpsShort(metrics.peakWriteQps)} QPS peak).`,
      )
    }
  }

  if (metrics.cdnOffloadUsed > 0) {
    const pct = Math.round(metrics.cdnOffloadUsed * 100)
    lines.push(
      `CDN serves ~${pct}% of reads at the edge. Origin sees ~${formatQpsShort(metrics.originTotalQps)} rps, not the full ${peak}.`,
    )
  } else if (flags.cdn && input.appShape !== 'crud') {
    lines.push(
      `A CDN sits in front for static${input.appShape === 'content' ? ' and media' : ''} assets. It does not answer product reads.`,
    )
  } else if (flags.cdn) {
    lines.push(`A CDN is in the picture for static assets at this scale.`)
  }

  if (input.instantConsistency) {
    lines.push(
      metrics.shards > 1
        ? `Instant consistency is on: user-facing reads go to the primary of each shard (write-through / tiny TTL cache). No async replica-reads, and a CDN is never the source of truth.`
        : `Instant consistency is on: user-facing reads go to the primary (write-through / tiny TTL cache). No async replica-reads, and a CDN is never the source of truth.`,
    )
  } else if (metrics.replicas > 0) {
    lines.push(
      metrics.shards > 1
        ? `${metrics.replicas} read replica${metrics.replicas === 1 ? '' : 's'} per shard take leftover reads after a ${Math.round(metrics.cacheHitUsed * 100)}% cache hit (~${formatQpsShort(metrics.effectiveDbReads)} QPS still hits the database).`
        : `${metrics.replicas} read replica${metrics.replicas === 1 ? '' : 's'} take leftover reads after a ${Math.round(metrics.cacheHitUsed * 100)}% cache hit (~${formatQpsShort(metrics.effectiveDbReads)} QPS still hits the database).`,
    )
  } else if (flags.allowReplicas && band !== 'hobby') {
    lines.push(
      metrics.shards > 1
        ? 'Primary budget per shard covers the leftover cache-miss reads, so no extra replicas.'
        : 'The primary can absorb the leftover cache-miss reads, so no replicas yet.',
    )
  }

  if (flags.object) {
    lines.push(`Object storage holds media blobs so the database is not a file server.`)
  }

  return lines.slice(0, 7)
}

export function assumptionList(
  input: ArchitectureInput,
  flags: RecipeFlags,
  metrics?: ArchitectureMetrics,
): string[] {
  const offloadPct = Math.round((metrics?.cdnOffloadUsed ?? (flags.cdn ? input.cdnOffload : 0)) * 100)
  const items = [
    `Peak = average × ${input.peakFactor}. Real peaks vary; this is a teaching knob.`,
    `RPS per instance is the 4-vCPU baseline (~${input.rpsPerInstance} rps). Capacity scales with vCPU; RAM follows at 1:2. Scale up before the fleet passes ${FLEET_TARGET} boxes.`,
    `Storage is ${formatBytes(input.bytesPerUser)} per user × 1.5 for indexes and overhead.`,
    `Egress ≈ average QPS × ${input.payloadKb} KB × 2.6e6 seconds/month, split into CDN vs origin.`,
    input.instantConsistency
      ? 'Cache hit rate is ignored for user-facing reads while instant consistency is on.'
      : `Cache hit rate ${Math.round(input.cacheHitRate * 100)}% applies only to cacheable origin reads.`,
    `Cache nodes budget ~${CACHE_NODE_BUDGET_QPS.toLocaleString('en-US')} ops/s each. Read replicas cap at ${REPLICA_CAP} per primary/shard.`,
    flags.cdn && offloadPct > 0
      ? `CDN offload ${offloadPct}% of reads at the edge. Writes and the rest hit origin.`
      : 'CDN offload is 0% unless the recipe adds a CDN and you raise the knob (content defaults to 65%).',
    `DB math is per shard once writes (or storage, or replica fan-out) exceed one box.`,
    `Prices are rough 2026 USD/month ballparks, not a quote.`,
  ]
  if (flags.comboAppDb) {
    items.push('Hobby band colocates the app and the database on one VM.')
  }
  if (flags.pooler) {
    items.push(
      `PgBouncer appears once fleet DB connections (about ${APP_POOL_PER_INSTANCE} per ${APP_BASELINE_VCPU} vCPU) cross ~${POOLER_CONNECTION_TRIGGER}.`,
    )
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
