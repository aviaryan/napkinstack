import {
  COST_HIGH_FACTOR,
  COST_LOW_FACTOR,
  PRICE_AS_OF,
  postgresMonthly,
  pricesFor,
  redisMonthly,
  vmMonthly,
} from '../data/prices'
import { QUEUE_WRITE_QPS, READ_WRITE_CACHE_RATIO, recipeFor } from '../data/recipes'
import {
  appSizeFor,
  dbSizeFor,
  pickBand,
  redisSizeFor,
  storageWithHeadroomGb,
} from '../data/sizes'
import { assumptionList, explainArchitecture } from './explain'
import { formatGb, formatNumber, formatQpsShort } from './format'
import type {
  ArchEdge,
  ArchNode,
  ArchitectureInput,
  ArchitectureResult,
  Band,
  CostItem,
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
  const storageGb = (input.users * input.bytesPerUser) / 1e9 * 1.5

  const band = pickBand(peakTotalQps)
  const readWriteRatio =
    input.writesPerUserDay <= 0 ? Infinity : input.readsPerUserDay / input.writesPerUserDay
  const flags = recipeFor({
    band,
    appShape: input.appShape,
    readWriteRatio,
    peakWriteQps,
    instantConsistency: input.instantConsistency,
  })

  let appN = Math.max(1, Math.ceil(peakTotalQps / input.rpsPerInstance) + input.spare)
  if (band !== 'hobby') {
    appN = Math.max(appN, 2)
  }
  if (band === 'hobby') {
    appN = 1
  }

  const cacheHitUsed = input.instantConsistency || !flags.cache ? 0 : input.cacheHitRate
  const effectiveDbReads = peakReadQps * (1 - cacheHitUsed)

  const primaryReadForSizing = input.instantConsistency ? peakReadQps : Math.min(effectiveDbReads, peakReadQps)
  const db = dbSizeFor({
    band,
    storageGb,
    peakWriteQps,
    primaryReadQps: primaryReadForSizing,
    instantConsistency: input.instantConsistency,
  })

  let replicas = 0
  if (!input.instantConsistency && flags.allowReplicas) {
    replicas = Math.max(0, Math.ceil((effectiveDbReads - db.primaryReadBudgetQps) / db.replicaQps))
  }

  const app = appSizeFor(band)
  const redis = flags.cache ? redisSizeFor(band, flags.cacheCluster) : null
  const diskGb = storageWithHeadroomGb(storageGb)

  const { nodes, edges } = buildGraph({
    input,
    flags,
    band,
    appN,
    appLabel: app.label,
    db,
    redisClass: input.provider === 'cheap' ? redis?.cheapClass : redis?.class,
    redisClustered: Boolean(redis?.clustered),
    diskGb,
    peakReadQps,
    peakWriteQps,
    peakTotalQps,
    effectiveDbReads,
    cacheHitUsed,
    replicas,
  })

  const cost = estimateCost({
    input,
    flags,
    appN,
    appKey: app.key,
    dbClass: db.class,
    diskGb,
    replicas,
    redisClustered: Boolean(redis?.clustered),
    peakTotalQps,
  })
  attachCosts(nodes, cost.items)

  const metrics = {
    avgReadQps,
    avgWriteQps,
    peakReadQps,
    peakWriteQps,
    peakTotalQps,
    storageGb,
    appN,
    replicas,
    effectiveDbReads,
    cacheHitUsed,
  }

  const math = buildMath(input, metrics, db, flags)

  return {
    band,
    nodes,
    edges,
    cost,
    explanation: explainArchitecture(input, band, flags, metrics),
    math,
    metrics,
    assumptions: assumptionList(input, flags),
  }
}

function buildMath(
  input: ArchitectureInput,
  metrics: ArchitectureResult['metrics'],
  db: ReturnType<typeof dbSizeFor>,
  flags: RecipeFlags,
): MathLine[] {
  const u = input.users.toLocaleString('en-US')
  return [
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
      label: 'storage_gb',
      formula: `${u} × ${input.bytesPerUser} / 1e9 × 1.5`,
      value: formatNumber(metrics.storageGb, 2),
    },
    {
      label: 'app_n',
      formula:
        metrics.appN === 1 && flags.comboAppDb
          ? `hobby band → 1 box (ceil(${formatNumber(metrics.peakTotalQps, 1)} / ${input.rpsPerInstance}) + ${input.spare} unused)`
          : `max(1, ceil(${formatNumber(metrics.peakTotalQps, 1)} / ${input.rpsPerInstance}) + ${input.spare})${flags.comboAppDb ? '' : ', min 2 if not hobby'}`,
      value: String(metrics.appN),
    },
    {
      label: 'effective_db_reads',
      formula: input.instantConsistency
        ? `${formatNumber(metrics.peakReadQps, 1)} × (1 − 0)  // cache ignored`
        : `${formatNumber(metrics.peakReadQps, 1)} × (1 − ${metrics.cacheHitUsed})`,
      value: formatNumber(metrics.effectiveDbReads, 2),
    },
    {
      label: 'replicas',
      formula: input.instantConsistency
        ? 'instant consistency → 0'
        : `max(0, ceil((${formatNumber(metrics.effectiveDbReads, 1)} − ${db.primaryReadBudgetQps}) / ${db.replicaQps}))`,
      value: String(metrics.replicas),
    },
  ]
}

function estimateCost(opts: {
  input: ArchitectureInput
  flags: RecipeFlags
  appN: number
  appKey: 'small' | 'medium' | 'large'
  dbClass: string
  diskGb: number
  replicas: number
  redisClustered: boolean
  peakTotalQps: number
}) {
  const table = pricesFor(opts.input.provider)
  const items: CostItem[] = []

  const vmCount = opts.flags.comboAppDb ? 1 : opts.appN
  items.push({
    name: opts.flags.comboAppDb ? 'Single VM (app + db)' : `App VMs × ${vmCount}`,
    monthly: vmMonthly(table, opts.appKey, vmCount),
  })

  if (opts.flags.lb) {
    items.push({
      name: opts.input.provider === 'cheap' ? 'Fly / edge proxy' : 'ALB',
      monthly: table.lb,
    })
  }

  if (!opts.flags.comboAppDb) {
    items.push({
      name: opts.input.provider === 'cheap' ? 'PlanetScale-ish' : 'Postgres (RDS-ish)',
      monthly: postgresMonthly(table, opts.dbClass, opts.diskGb, opts.replicas),
    })
  } else {
    items.push({
      name: 'Local disk / sqlite-or-postgres',
      monthly: Math.max(2, opts.diskGb * table.postgresStoragePerGb),
    })
  }

  if (opts.flags.cache) {
    const redisKey = opts.redisClustered ? 'cluster' : opts.flags.cacheCluster ? 'cluster' : opts.appKey === 'small' ? 'micro' : 'medium'
    items.push({
      name: opts.redisClustered ? 'Redis cluster' : 'Redis',
      monthly: redisMonthly(table, opts.redisClustered, redisKey === 'cluster' ? 'cluster' : redisKey === 'micro' ? 'micro' : 'medium'),
    })
  }

  if (opts.flags.queue) {
    items.push({ name: opts.input.provider === 'cheap' ? 'Managed queue' : 'SQS-ish', monthly: table.queue })
  }

  const payloadBytes = opts.input.payloadKb * 1024
  const egressGb = (opts.peakTotalQps * payloadBytes * 2.6e6) / 1e9
  const objectGb = opts.flags.object ? Math.max(opts.diskGb, egressGb * 0.15) : 0

  if (opts.flags.object) {
    items.push({
      name: opts.input.provider === 'cheap' ? 'Object store' : 'S3-ish',
      monthly: table.objectBase + objectGb * table.objectPerGb,
    })
  }

  if (opts.flags.cdn) {
    items.push({
      name: opts.input.provider === 'cheap' ? 'CDN' : 'CloudFront-ish',
      monthly: table.cdnBase + egressGb * 0.4 * table.cdnPerGb,
    })
  }

  items.push({
    name: 'Egress (guess)',
    monthly: egressGb * table.egressPerGb,
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
      return name === 'ALB' || name.includes('proxy')
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

function rpsLabel(qps: number, suffix = ''): string {
  const core = `~${formatQpsShort(qps)} rps`
  return suffix ? `${core} ${suffix}` : core
}

function clampUtil(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(1, n)
}

function buildGraph(opts: {
  input: ArchitectureInput
  flags: RecipeFlags
  band: Band
  appN: number
  appLabel: string
  db: ReturnType<typeof dbSizeFor>
  redisClass?: string
  redisClustered: boolean
  diskGb: number
  peakReadQps: number
  peakWriteQps: number
  peakTotalQps: number
  effectiveDbReads: number
  cacheHitUsed: number
  replicas: number
}): { nodes: ArchNode[]; edges: ArchEdge[] } {
  const {
    input,
    flags,
    band,
    appN,
    appLabel,
    db,
    redisClass,
    redisClustered,
    diskGb,
    peakReadQps,
    peakWriteQps,
    peakTotalQps,
    effectiveDbReads,
    cacheHitUsed,
    replicas,
  } = opts

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
      utilization: clampUtil(peakTotalQps / Math.max(input.rpsPerInstance, 1)),
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
    nodes.push({
      id: 'cdn',
      kind: 'cdn',
      label: cdnName,
      detail: 'static assets',
      why: 'CDN for static assets only — never the source of truth for product reads.',
      appearNote: '+ CDN — static assets at this scale',
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
      label: flags.cdn ? 'origin / API' : rpsLabel(peakTotalQps),
      role: 'mixed',
      qps: peakTotalQps,
    })
    prev = 'lb'
  }

  const readsOnPrimary = input.instantConsistency
    ? peakReadQps
    : Math.min(effectiveDbReads, db.primaryReadBudgetQps)
  const replicaReads = replicas > 0 ? Math.max(0, effectiveDbReads - db.primaryReadBudgetQps) : 0
  const dbTraffic = readsOnPrimary + peakWriteQps

  nodes.push({
    id: 'app',
    kind: 'app',
    label: appN <= 1 ? 'App' : `App × ${appN}`,
    detail: appLabel,
    count: appN,
    stack: appN > 1,
    why: `ceil(${formatQpsShort(peakTotalQps)} rps / ${input.rpsPerInstance}) + ${input.spare} spare${
      band === 'hobby' ? '' : ', min 2 for HA'
    }.`,
    utilization: clampUtil(peakTotalQps / Math.max(appN * input.rpsPerInstance, 1)),
  })
  edges.push({
    id: 'e-prev-app',
    source: prev,
    target: 'app',
    label: rpsLabel(peakTotalQps),
    role: 'mixed',
    qps: peakTotalQps,
  })

  if (flags.cache && redisClass) {
    nodes.push({
      id: 'cache',
      kind: 'cache',
      label: flags.cacheCluster ? 'Redis cluster' : 'Redis',
      detail: redisClass,
      count: redisClustered ? 3 : 1,
      stack: redisClustered,
      why: input.instantConsistency
        ? 'Write-through / tiny TTL — present, but not a stale-read shortcut.'
        : 'Cacheable reads stop here so Postgres never sees them.',
      appearNote: '+ Redis — cacheable reads leave the database path',
    })
    const cacheRps = peakReadQps * cacheHitUsed
    edges.push({
      id: 'e-app-cache',
      source: 'app',
      target: 'cache',
      label: cacheHitUsed > 0 ? rpsLabel(cacheRps, 'hits') : 'write-through',
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
      why: 'xlarge: multiplex app connections so Postgres is not drowned in clients.',
      appearNote: '+ PgBouncer — connection pooling at xlarge',
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
  nodes.push({
    id: 'primary',
    kind: 'primary',
    label: `${pgName} primary`,
    detail: `${dbTitle} · ${formatGb(diskGb)}`,
    why: input.instantConsistency
      ? 'Source of truth. Instant consistency means user-facing reads hit the primary.'
      : 'Source of truth for writes, plus whatever cache-miss reads fit its budget.',
    utilization: clampUtil(
      Math.max(readsOnPrimary / Math.max(db.primaryReadBudgetQps, 1), peakWriteQps / Math.max(db.writeBudgetQps, 1)),
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
      label: replicas === 1 ? 'Read replica' : `Read replicas × ${replicas}`,
      detail: `${dbTitle} · reads`,
      count: replicas,
      stack: replicas > 1,
      why: 'Serves leftover cache-miss reads the primary cannot. Async — stale vs primary.',
      appearNote: '+ replica — leftover reads overflowed the primary',
      utilization: clampUtil(replicaReads / Math.max(replicas * db.replicaQps, 1)),
    })
    edges.push({
      id: 'e-app-replica',
      source: dbParent,
      target: 'replica',
      label: rpsLabel(replicaReads, 'reads'),
      role: 'read',
      qps: replicaReads,
    })
    edges.push({
      id: 'e-repl-stream',
      source: 'primary',
      target: 'replica',
      label: 'replication (async)',
      role: 'replication',
    })
  }

  if (flags.queue) {
    nodes.push({
      id: 'queue',
      kind: 'queue',
      label: queueName,
      detail: 'async writes',
      why: `Peak writes ${formatQpsShort(peakWriteQps)} rps crossed ${QUEUE_WRITE_QPS} — leave the request path.`,
      appearNote: `+ queue — writes crossed ${QUEUE_WRITE_QPS} rps`,
    })
    edges.push({
      id: 'e-app-queue',
      source: 'app',
      target: 'queue',
      label: rpsLabel(peakWriteQps, 'writes'),
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
      appearNote: '+ object store — media blobs',
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

  nodes.push(...ghostNodes(opts))
  return { nodes, edges }
}

function ghostNodes(
  opts: {
    input: ArchitectureInput
    flags: RecipeFlags
    band: Band
    db: ReturnType<typeof dbSizeFor>
    peakWriteQps: number
    effectiveDbReads: number
    replicas: number
  },
): ArchNode[] {
  const { input, flags, band, db, peakWriteQps, effectiveDbReads, replicas } = opts
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
        : `not yet · primary ${formatQpsShort(db.primaryReadBudgetQps)} rps > ${formatQpsShort(effectiveDbReads)} miss rps`,
      ghost: true,
      why: input.instantConsistency
        ? 'Instant consistency forbids serving user-facing reads from a lagging replica.'
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
