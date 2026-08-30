import {
  COST_HIGH_FACTOR,
  COST_LOW_FACTOR,
  LB_SCALE_QPS,
  PRICE_AS_OF,
  SECONDS_PER_MONTH,
  lbMonthly,
  postgresMonthly,
  pricesFor,
  queueMonthly,
  redisMonthly,
  vmMonthly,
} from '../data/prices'
import { QUEUE_WRITE_QPS, READ_WRITE_CACHE_RATIO, recipeFor } from '../data/recipes'
import {
  APP_BASELINE_VCPU,
  FLEET_TARGET,
  POOLER_CONNECTION_TRIGGER,
  REPLICA_CAP,
  TOP_DB,
  appPoolFor,
  dbPlanFor,
  floorAppSize,
  pickAppFleet,
  pickBand,
  redisSizeFor,
  storageWithHeadroomGb,
} from '../data/sizes'
import { assumptionList, explainArchitecture } from './explain'
import { formatGb, formatNumber, formatQpsShort } from './format'
import type {
  AppSizeKey,
  ArchEdge,
  ArchNode,
  ArchitectureInput,
  ArchitectureResult,
  Band,
  CostItem,
  DbPlan,
  MathLine,
  RecipeFlags,
} from './types'

export { pickBand }

export function sizeArchitecture(input: ArchitectureInput): ArchitectureResult {
  const avgReadQps = (input.users * input.readsPerUserDay) / 86400
  const avgWriteQps = (input.users * input.writesPerUserDay) / 86400
  const peakReadQps = avgReadQps * input.peakFactor
  const peakWriteQps = avgWriteQps * input.peakFactor
  const peakTotalQps = peakReadQps + peakWriteQps
  const storageGb = ((input.users * input.bytesPerUser) / 1e9) * 1.5

  const band = pickBand(peakTotalQps)
  const readWriteRatio =
    input.writesPerUserDay <= 0 ? Infinity : input.readsPerUserDay / input.writesPerUserDay
  const baseFlags = recipeFor({
    band,
    appShape: input.appShape,
    readWriteRatio,
    peakWriteQps,
    instantConsistency: input.instantConsistency,
  })

  const cdnOffloadUsed = baseFlags.cdn ? clamp01(input.cdnOffload) : 0
  const originReadQps = peakReadQps * (1 - cdnOffloadUsed)
  const originWriteQps = peakWriteQps
  const originTotalQps = originReadQps + originWriteQps

  const fleet = pickAppFleet({
    band,
    peakQps: originTotalQps,
    rpsPerInstance: input.rpsPerInstance,
    spare: input.spare,
  })
  const appN = fleet.count
  const app = fleet.size
  const appPool = appPoolFor(app)

  const flags: RecipeFlags = {
    ...baseFlags,
    pooler:
      baseFlags.pooler ||
      (!baseFlags.comboAppDb && appN * appPool >= POOLER_CONNECTION_TRIGGER),
  }

  const cacheHitUsed = input.instantConsistency || !flags.cache ? 0 : input.cacheHitRate
  const cacheHitQps = originReadQps * cacheHitUsed
  const effectiveDbReads = originReadQps * (1 - cacheHitUsed)

  const dbReadForPlan = input.instantConsistency ? originReadQps : effectiveDbReads
  const plan = dbPlanFor({
    band,
    storageGb,
    peakWriteQps: originWriteQps,
    dbReadQps: dbReadForPlan,
    instantConsistency: input.instantConsistency,
    allowReplicas: flags.allowReplicas,
  })
  const db = plan.size
  const shards = plan.shards
  const replicas = plan.replicas

  const redis = flags.cache ? redisSizeFor(band, flags.cacheCluster, cacheHitQps) : null
  const diskGb = storageWithHeadroomGb(storageGb)

  const { nodes, edges } = buildGraph({
    input,
    flags,
    band,
    appN,
    appLabel: app.label,
    appCapacityRps: fleet.capacityRps,
    appPool,
    db: plan,
    redisClass: input.provider === 'cheap' ? redis?.cheapClass : redis?.class,
    redisClustered: Boolean(redis?.clustered),
    redisNodes: redis?.nodes ?? 0,
    diskGb,
    peakWriteQps,
    peakTotalQps,
    originReadQps,
    originTotalQps,
    effectiveDbReads,
    cacheHitUsed,
    cdnOffloadUsed,
  })

  const cost = estimateCost({
    input,
    flags,
    appN,
    appKey: app.key,
    dbClass: db.class,
    diskGb,
    replicas,
    shards,
    redisClustered: Boolean(redis?.clustered),
    redisNodes: redis?.nodes ?? 1,
    originTotalQps,
    avgReadQps,
    avgWriteQps,
    cdnOffloadUsed,
  })
  attachCosts(nodes, cost.items)

  const metrics = {
    avgReadQps,
    avgWriteQps,
    peakReadQps,
    peakWriteQps,
    peakTotalQps,
    originReadQps,
    originWriteQps,
    originTotalQps,
    storageGb,
    appN,
    appCapacityRps: fleet.capacityRps,
    replicas,
    shards,
    cacheNodes: redis?.nodes ?? 0,
    effectiveDbReads,
    cacheHitUsed,
    cdnOffloadUsed,
  }

  const math = buildMath(input, metrics, plan, flags, app.vcpu, band)

  return {
    band,
    nodes,
    edges,
    cost,
    explanation: explainArchitecture(input, band, flags, metrics),
    math,
    metrics,
    assumptions: assumptionList(input, flags, metrics),
  }
}

function buildMath(
  input: ArchitectureInput,
  metrics: ArchitectureResult['metrics'],
  plan: DbPlan,
  flags: RecipeFlags,
  appVcpu: number,
  band: Band,
): MathLine[] {
  const u = input.users.toLocaleString('en-US')
  const db = plan.size
  const climbed = appVcpu > floorAppSize(band).vcpu
  const lines: MathLine[] = [
    {
      label: 'avg_read_qps',
      formula: `${u} × ${input.readsPerUserDay} / 86400`,
      value: formatNumber(metrics.avgReadQps, 2),
    },
    {
      label: 'avg_write_qps',
      formula: `${u} × ${input.writesPerUserDay} / 86400`,
      value: formatNumber(metrics.avgWriteQps, 2),
    },
    {
      label: 'peak_read_qps',
      formula: `${formatNumber(metrics.avgReadQps, 2)} × ${input.peakFactor}`,
      value: formatNumber(metrics.peakReadQps, 2),
    },
    {
      label: 'peak_write_qps',
      formula: `${formatNumber(metrics.avgWriteQps, 2)} × ${input.peakFactor}`,
      value: formatNumber(metrics.peakWriteQps, 2),
    },
    {
      label: 'peak_total_qps',
      formula: `${formatNumber(metrics.peakReadQps, 2)} + ${formatNumber(metrics.peakWriteQps, 2)}`,
      value: formatNumber(metrics.peakTotalQps, 2),
    },
    {
      label: 'cdn_offload',
      formula: flags.cdn
        ? `${formatNumber(metrics.peakReadQps, 1)} × (1 − ${metrics.cdnOffloadUsed}) reads + writes → origin`
        : 'no CDN → origin sees full peak',
      value: formatNumber(metrics.originTotalQps, 2),
    },
    {
      label: 'storage_gb',
      formula: `${u} × ${input.bytesPerUser} / 1e9 × 1.5`,
      value: formatNumber(metrics.storageGb, 2),
    },
    {
      label: 'app_size',
      formula: climbed
        ? `${appVcpu} vCPU so the fleet stays under ${FLEET_TARGET} boxes (capacity = ${input.rpsPerInstance} × ${appVcpu}/${APP_BASELINE_VCPU})`
        : `band floor · ${appVcpu} vCPU (capacity = ${input.rpsPerInstance} × ${appVcpu}/${APP_BASELINE_VCPU})`,
      value: `${appVcpu} vCPU`,
    },
    {
      label: 'app_n',
      formula:
        metrics.appN === 1 && flags.comboAppDb
          ? `hobby band → 1 box (ceil(${formatNumber(metrics.originTotalQps, 1)} / ${formatNumber(metrics.appCapacityRps, 0)}) + ${input.spare} unused)`
          : `max(2, ceil(${formatNumber(metrics.originTotalQps, 1)} / ${formatNumber(metrics.appCapacityRps, 0)}) + ${input.spare})`,
      value: String(metrics.appN),
    },
    {
      label: 'effective_db_reads',
      formula: input.instantConsistency
        ? `${formatNumber(metrics.originReadQps, 1)} × (1 − 0)  // cache ignored`
        : `${formatNumber(metrics.originReadQps, 1)} × (1 − ${metrics.cacheHitUsed})`,
      value: formatNumber(metrics.effectiveDbReads, 2),
    },
    {
      label: 'db_shards',
      formula:
        plan.shards > 1
          ? `ceil(${formatNumber(metrics.originWriteQps, 0)} writes / ${TOP_DB.writeBudgetQps} top-rung write budget)`
          : '1 (writes still fit on one primary)',
      value: String(plan.shards),
    },
    {
      label: 'replicas',
      formula: input.instantConsistency
        ? 'instant consistency → 0'
        : plan.shards > 1
          ? `per shard: min(${REPLICA_CAP}, max(0, ceil((${formatNumber(metrics.effectiveDbReads / plan.shards, 1)} − ${db.primaryReadBudgetQps}) / ${db.replicaQps})))`
          : `max(0, ceil((${formatNumber(metrics.effectiveDbReads, 1)} − ${db.primaryReadBudgetQps}) / ${db.replicaQps}))`,
      value: plan.shards > 1 ? `${metrics.replicas} / shard` : String(metrics.replicas),
    },
  ]
  return lines
}

function estimateCost(opts: {
  input: ArchitectureInput
  flags: RecipeFlags
  appN: number
  appKey: AppSizeKey
  dbClass: string
  diskGb: number
  replicas: number
  shards: number
  redisClustered: boolean
  redisNodes: number
  originTotalQps: number
  avgReadQps: number
  avgWriteQps: number
  cdnOffloadUsed: number
}) {
  const table = pricesFor(opts.input.provider)
  const items: CostItem[] = []

  const vmCount = opts.flags.comboAppDb ? 1 : opts.appN
  items.push({
    name: opts.flags.comboAppDb ? 'Single VM (app + db)' : `App VMs × ${vmCount}`,
    monthly: vmMonthly(table, opts.appKey, vmCount),
  })

  if (opts.flags.lb) {
    const lb = lbMonthly(table, opts.originTotalQps)
    const scaled = opts.originTotalQps > LB_SCALE_QPS
    items.push({
      name:
        opts.input.provider === 'cheap'
          ? scaled
            ? 'Fly / edge proxy (scaled)'
            : 'Fly / edge proxy'
          : scaled
            ? 'ALB (scaled)'
            : 'ALB',
      monthly: lb,
    })
  }

  if (!opts.flags.comboAppDb) {
    items.push({
      name: opts.input.provider === 'cheap' ? 'PlanetScale-ish' : 'Postgres (RDS-ish)',
      monthly: postgresMonthly(table, opts.dbClass, opts.diskGb, opts.replicas, opts.shards),
    })
  } else {
    items.push({
      name: 'Local disk / sqlite-or-postgres',
      monthly: Math.max(2, opts.diskGb * table.postgresStoragePerGb),
    })
  }

  if (opts.flags.cache) {
    const redisKey = opts.appKey === 'small' ? 'micro' : 'medium'
    items.push({
      name: opts.redisClustered ? `Redis cluster ×${opts.redisNodes}` : 'Redis',
      monthly: redisMonthly(table, opts.redisClustered, redisKey, opts.redisNodes),
    })
  }

  if (opts.flags.queue) {
    items.push({
      name: opts.input.provider === 'cheap' ? 'Managed queue' : 'SQS-ish',
      monthly: queueMonthly(table, opts.avgWriteQps),
    })
  }

  const payloadBytes = opts.input.payloadKb * 1024
  const avgTotalQps = opts.avgReadQps + opts.avgWriteQps
  const offloadedAvg = opts.avgReadQps * opts.cdnOffloadUsed
  const originAvg = avgTotalQps - offloadedAvg
  const cdnEgressGb = (offloadedAvg * payloadBytes * SECONDS_PER_MONTH) / 1e9
  const originEgressGb = (originAvg * payloadBytes * SECONDS_PER_MONTH) / 1e9
  const objectGb = opts.flags.object ? Math.max(opts.diskGb, (cdnEgressGb + originEgressGb) * 0.15) : 0

  if (opts.flags.object) {
    items.push({
      name: opts.input.provider === 'cheap' ? 'Object store' : 'S3-ish',
      monthly: table.objectBase + objectGb * table.objectPerGb,
    })
  }

  if (opts.flags.cdn) {
    items.push({
      name: opts.input.provider === 'cheap' ? 'CDN' : 'CloudFront-ish',
      monthly: table.cdnBase + cdnEgressGb * table.cdnPerGb,
    })
  }

  items.push({
    name: 'Egress (guess)',
    monthly: originEgressGb * table.egressPerGb,
  })

  if (opts.flags.pooler) {
    items.push({ name: 'PgBouncer / pooler', monthly: opts.input.provider === 'cheap' ? 0 : 15 })
  }

  const point = items.reduce((sum, item) => sum + item.monthly, 0)
  return {
    items,
    point,
    low: point * COST_LOW_FACTOR,
    high: point * COST_HIGH_FACTOR,
    asOf: PRICE_AS_OF,
  }
}

function attachCosts(nodes: ArchNode[], items: CostItem[]): void {
  for (const node of nodes) {
    if (node.ghost) continue
    const item = items.find((row) => matchesCost(node, row.name))
    if (item) node.monthly = item.monthly
  }
}

function matchesCost(node: ArchNode, name: string): boolean {
  switch (node.kind) {
    case 'combo':
      return name.startsWith('Single VM') || name.startsWith('Local disk')
    case 'app':
      return name.startsWith('App VMs')
    case 'lb':
      return name.startsWith('ALB') || name.includes('proxy')
    case 'primary':
      return name.includes('Postgres') || name.includes('PlanetScale')
    case 'replica':
      return name.includes('Postgres') || name.includes('PlanetScale')
    case 'cache':
      return name.startsWith('Redis')
    case 'queue':
      return name.includes('queue') || name.includes('SQS')
    case 'object':
      return name.includes('Object') || name.includes('S3')
    case 'cdn':
      return name.includes('CDN') || name.includes('CloudFront')
    case 'pooler':
      return name.includes('PgBouncer') || name.includes('pooler')
    default:
      return false
  }
}

function rpsLabel(qps: number): string {
  return `~${formatQpsShort(qps)} rps`
}

function clampUtil(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(1, n)
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(0.95, Math.max(0, n))
}

function buildGraph(opts: {
  input: ArchitectureInput
  flags: RecipeFlags
  band: Band
  appN: number
  appLabel: string
  appCapacityRps: number
  appPool: number
  db: DbPlan
  redisClass?: string
  redisClustered: boolean
  redisNodes: number
  diskGb: number
  peakWriteQps: number
  peakTotalQps: number
  originReadQps: number
  originTotalQps: number
  effectiveDbReads: number
  cacheHitUsed: number
  cdnOffloadUsed: number
}): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const {
    input,
    flags,
    band,
    appN,
    appLabel,
    appCapacityRps,
    appPool,
    db: plan,
    redisClass,
    redisClustered,
    redisNodes,
    diskGb,
    peakWriteQps,
    peakTotalQps,
    originReadQps,
    originTotalQps,
    effectiveDbReads,
    cacheHitUsed,
    cdnOffloadUsed,
  } = opts
  const db = plan.size
  const shards = plan.shards
  const replicas = plan.replicas

  const dbTitle = input.provider === 'cheap' ? db.cheapClass : db.class
  const pgName = input.provider === 'cheap' ? 'PlanetScale' : 'Postgres'
  const lbName = input.provider === 'cheap' ? 'Fly proxy' : 'ALB'
  const cdnName = input.provider === 'cheap' ? 'CDN' : 'CloudFront'
  const objectName = input.provider === 'cheap' ? 'Object store' : 'S3'
  const queueName = input.provider === 'cheap' ? 'Queue' : 'SQS'

  const nodes: ArchNode[] = []
  const edges: ArchEdge[] = []

  nodes.push({
    id: 'client',
    kind: 'client',
    label: 'Clients',
    detail: `${formatUsersCompact(input.users)} users`,
    why: 'Where traffic starts. User count × actions/day becomes rps.',
  })

  if (flags.comboAppDb) {
    nodes.push({
      id: 'combo',
      kind: 'combo',
      label: 'App + Postgres',
      detail: `${appLabel} · ${formatGb(diskGb)}`,
      why: 'Hobby band: one VM runs the app and the database. No load balancer.',
      utilization: clampUtil(originTotalQps / Math.max(appCapacityRps, 1)),
    })
    edges.push({
      id: 'e-client-combo',
      source: 'client',
      target: 'combo',
      label: rpsLabel(peakTotalQps),
      role: 'mixed',
      qps: peakTotalQps,
    })
    return { nodes, edges }
  }

  let prev = 'client'

  if (flags.cdn) {
    const pct = Math.round(cdnOffloadUsed * 100)
    nodes.push({
      id: 'cdn',
      kind: 'cdn',
      label: cdnName,
      detail: pct > 0 ? `serves ${pct}% at edge` : 'static assets',
      why:
        pct > 0
          ? `CDN absorbs ${pct}% of reads at the edge so origin never sees them. Writes and cache-miss / API traffic still go through.`
          : 'CDN for static assets only. It is never the source of truth for product reads.',
      appearNote: '+ CDN for edge offload at this scale',
    })
    edges.push({
      id: 'e-client-cdn',
      source: 'client',
      target: 'cdn',
      label: rpsLabel(peakTotalQps),
      role: 'static',
      qps: peakTotalQps,
    })
    prev = 'cdn'
  }

  if (flags.lb) {
    nodes.push({
      id: 'lb',
      kind: 'lb',
      label: lbName,
      detail: input.provider === 'cheap' ? 'edge proxy' : 'reverse proxy',
      why: 'HA entry point. Spreads requests across the app fleet.',
    })
    edges.push({
      id: 'e-prev-lb',
      source: prev,
      target: 'lb',
      label: flags.cdn ? rpsLabel(originTotalQps) : rpsLabel(peakTotalQps),
      role: 'mixed',
      qps: originTotalQps,
    })
    prev = 'lb'
  }

  const readsOnPrimary = input.instantConsistency
    ? originReadQps
    : Math.min(effectiveDbReads, db.primaryReadBudgetQps * shards)
  const replicaReads = replicas > 0 ? Math.max(0, effectiveDbReads - db.primaryReadBudgetQps * shards) : 0
  const dbTraffic = readsOnPrimary + peakWriteQps

  nodes.push({
    id: 'app',
    kind: 'app',
    label: appN <= 1 ? 'App' : `App × ${appN}`,
    detail: `${appLabel}\n~${formatQpsShort(appCapacityRps)} rps each`,
    count: appN,
    stack: appN > 1,
    why: `ceil(${formatQpsShort(originTotalQps)} origin rps / ${formatQpsShort(appCapacityRps)}) + ${input.spare} spare${
      band === 'hobby' ? '' : ', min 2 for HA'
    }. Scale up before out: past ~${FLEET_TARGET} boxes we take the next instance size, which means fewer deploys, fewer DB connections, and less LB churn. Capacity is CPU-driven; RAM rides along at 1:2.`,
    utilization: clampUtil(originTotalQps / Math.max(appN * appCapacityRps, 1)),
  })
  edges.push({
    id: 'e-prev-app',
    source: prev,
    target: 'app',
    label: rpsLabel(originTotalQps),
    role: 'mixed',
    qps: originTotalQps,
  })

  if (flags.cache && redisClass) {
    nodes.push({
      id: 'cache',
      kind: 'cache',
      label: flags.cacheCluster ? 'Redis cluster' : 'Redis',
      detail: redisClass,
      count: redisClustered ? redisNodes : 1,
      stack: redisClustered,
      why: input.instantConsistency
        ? 'Write-through with a tiny TTL. It is here, but not as a stale-read shortcut.'
        : redisClustered
          ? `Cacheable reads stop here. Cluster grows with hit QPS (~90k ops/node).`
          : 'Cacheable reads stop here so Postgres never sees them.',
      appearNote: '+ Redis, cacheable reads leave the database path',
    })
    const cacheRps = originReadQps * cacheHitUsed
    edges.push({
      id: 'e-app-cache',
      source: 'app',
      target: 'cache',
      label: cacheHitUsed > 0 ? rpsLabel(cacheRps) : 'write-thru',
      role: cacheHitUsed > 0 ? 'read' : 'write',
      qps: cacheHitUsed > 0 ? cacheRps : peakWriteQps,
    })
  }

  if (flags.pooler) {
    nodes.push({
      id: 'pooler',
      kind: 'pooler',
      label: 'PgBouncer',
      detail: 'connection pool',
      why: `${appN} app boxes × ~${appPool} conns would drown Postgres. Multiplex through a pooler.`,
      appearNote: '+ PgBouncer for connection pooling',
    })
    edges.push({
      id: 'e-app-pooler',
      source: 'app',
      target: 'pooler',
      label: rpsLabel(effectiveDbReads + peakWriteQps),
      role: 'mixed',
      qps: effectiveDbReads + peakWriteQps,
    })
  }

  const dbParent = flags.pooler ? 'pooler' : 'app'
  const perShardWrite = peakWriteQps / shards
  nodes.push({
    id: 'primary',
    kind: 'primary',
    label: shards > 1 ? `${pgName} × ${shards} (sharded)` : `${pgName} primary`,
    detail: `${dbTitle} · ${formatGb(diskGb)}`,
    count: shards,
    stack: shards > 1,
    why:
      shards > 1
        ? `Writes exceed any single box, so shard by user id at ~${formatQpsShort(perShardWrite)} writes/s per shard.`
        : input.instantConsistency
          ? 'Source of truth. Instant consistency means user-facing reads hit the primary.'
          : 'Source of truth for writes, plus whatever cache-miss reads fit its budget.',
    appearNote: shards > 1 ? `+ ${shards} shards, writes outgrew one primary` : undefined,
    utilization: clampUtil(
      Math.max(
        readsOnPrimary / shards / Math.max(db.primaryReadBudgetQps, 1),
        perShardWrite / Math.max(db.writeBudgetQps, 1),
      ),
    ),
  })
  edges.push({
    id: 'e-db-writes',
    source: dbParent,
    target: 'primary',
    label: rpsLabel(dbTraffic),
    role: input.instantConsistency ? 'mixed' : peakWriteQps >= readsOnPrimary ? 'write' : 'mixed',
    qps: dbTraffic,
  })

  if (replicas > 0) {
    nodes.push({
      id: 'replica',
      kind: 'replica',
      label:
        shards > 1
          ? `+${replicas} replica${replicas === 1 ? '' : 's'} per shard`
          : replicas === 1
            ? 'Read replica'
            : `Read replicas × ${replicas}`,
      detail: `${dbTitle} · reads`,
      count: shards > 1 ? replicas * shards : replicas,
      stack: replicas > 1 || shards > 1,
      why:
        shards > 1
          ? `Leftover cache-miss reads, capped at ${REPLICA_CAP} replicas per shard (WAL fan-out).`
          : 'Serves leftover cache-miss reads the primary cannot. Async, so it lags the primary.',
      appearNote: '+ replica, leftover reads overflowed the primary',
      utilization: clampUtil(replicaReads / Math.max(replicas * shards * db.replicaQps, 1)),
    })
    edges.push({
      id: 'e-app-replica',
      source: dbParent,
      target: 'replica',
      label: rpsLabel(replicaReads),
      role: 'read',
      qps: replicaReads,
    })
    edges.push({
      id: 'e-repl-stream',
      source: 'primary',
      target: 'replica',
      label: 'replication',
      role: 'replication',
    })
  }

  if (flags.queue) {
    nodes.push({
      id: 'queue',
      kind: 'queue',
      label: queueName,
      detail: 'async writes',
      why: `Peak writes ${formatQpsShort(peakWriteQps)} rps crossed ${QUEUE_WRITE_QPS}, so they leave the request path.`,
      appearNote: `+ queue, writes crossed ${QUEUE_WRITE_QPS} rps`,
    })
    edges.push({
      id: 'e-app-queue',
      source: 'app',
      target: 'queue',
      label: rpsLabel(peakWriteQps),
      role: 'async',
      qps: peakWriteQps,
    })
  }

  if (flags.object) {
    nodes.push({
      id: 'object',
      kind: 'object',
      label: objectName,
      detail: 'media / blobs',
      why: 'Blobs stay out of Postgres. The database is not a file server.',
      appearNote: '+ object store for media blobs',
    })
    edges.push({
      id: 'e-app-object',
      source: 'app',
      target: 'object',
      label: 'uploads',
      role: 'write',
      qps: peakWriteQps,
    })
  }

  nodes.push(...ghostNodes({ input, flags, band, db, shards, peakWriteQps, effectiveDbReads, replicas }))
  return { nodes, edges }
}

function ghostNodes(opts: {
  input: ArchitectureInput
  flags: RecipeFlags
  band: Band
  db: DbPlan['size']
  shards: number
  peakWriteQps: number
  effectiveDbReads: number
  replicas: number
}): ArchNode[] {
  const { input, flags, band, db, shards, peakWriteQps, effectiveDbReads, replicas } = opts
  if (flags.comboAppDb) return []

  const ghosts: ArchNode[] = []

  const add = (node: ArchNode) => {
    if (ghosts.some((g) => g.id === node.id) || ghosts.length >= 3) return
    ghosts.push(node)
  }

  if (replicas === 0) {
    add({
      id: 'replica',
      kind: 'replica',
      label: 'Read replica',
      detail: input.instantConsistency
        ? 'not yet · instant consistency'
        : shards > 1
          ? `not yet · ${shards} shards × ${formatQpsShort(db.primaryReadBudgetQps)} rps cover misses`
          : `not yet · primary ${formatQpsShort(db.primaryReadBudgetQps)} rps > ${formatQpsShort(effectiveDbReads)} miss rps`,
      ghost: true,
      why: input.instantConsistency
        ? 'Instant consistency forbids serving user-facing reads from a lagging replica.'
        : shards > 1
          ? 'Primary budget per shard covers cache-miss reads, so extra replicas would sit idle.'
          : 'The primary still has read budget left, so a replica would be idle.',
    })
  }

  const largeish = band === 'large' || band === 'xlarge'
  if (largeish && !flags.queue) {
    add({
      id: 'ghost-queue',
      kind: 'queue',
      label: input.provider === 'cheap' ? 'Queue' : 'SQS',
      detail: `not yet · writes ${formatQpsShort(peakWriteQps)} rps ≤ ${QUEUE_WRITE_QPS}`,
      ghost: true,
      why: `A managed queue appears once peak writes cross ${QUEUE_WRITE_QPS} rps.`,
    })
  }

  if (band === 'small' && !flags.cache) {
    add({
      id: 'ghost-cache',
      kind: 'cache',
      label: 'Redis',
      detail: `not yet · reads/writes ≤ ${READ_WRITE_CACHE_RATIO}`,
      ghost: true,
      why: `Small band only adds a cache when reads outpace writes by more than ${READ_WRITE_CACHE_RATIO}×.`,
    })
  }

  if (!flags.cdn && band === 'medium') {
    add({
      id: 'ghost-cdn',
      kind: 'cdn',
      label: 'CDN',
      detail: 'not yet · static CDN from large (or pick content/media)',
      ghost: true,
      why: 'CRUD APIs wait until large for a CDN. Content/media gets one at medium.',
    })
  }

  return ghosts.slice(0, 3)
}

function formatUsersCompact(n: number): string {
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(2))}M`
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
  return n.toLocaleString('en-US')
}
