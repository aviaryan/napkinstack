import {
  COST_HIGH_FACTOR,
  COST_LOW_FACTOR,
  PRICE_AS_OF,
  postgresMonthly,
  pricesFor,
  redisMonthly,
  vmMonthly,
} from '../data/prices'
import { recipeFor } from '../data/recipes'
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
    appN,
    appLabel: app.label,
    db,
    redisClass: input.provider === 'cheap' ? redis?.cheapClass : redis?.class,
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

function buildGraph(opts: {
  input: ArchitectureInput
  flags: RecipeFlags
  appN: number
  appLabel: string
  db: ReturnType<typeof dbSizeFor>
  redisClass?: string
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
    appN,
    appLabel,
    db,
    redisClass,
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
  })

  if (flags.comboAppDb) {
    nodes.push({
      id: 'combo',
      kind: 'combo',
      label: 'App + Postgres',
      detail: `${appLabel} · ${formatGb(diskGb)}`,
    })
    edges.push({
      id: 'e-client-combo',
      source: 'client',
      target: 'combo',
      label: `~${formatQpsShort(peakTotalQps)} rps`,
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
    })
    edges.push({
      id: 'e-client-cdn',
      source: 'client',
      target: 'cdn',
      label: `~${formatQpsShort(peakTotalQps)} rps`,
    })
    prev = 'cdn'
  }

  if (flags.lb) {
    nodes.push({
      id: 'lb',
      kind: 'lb',
      label: lbName,
      detail: input.provider === 'cheap' ? 'edge proxy' : 'reverse proxy',
    })
    edges.push({
      id: 'e-prev-lb',
      source: prev,
      target: 'lb',
      label: flags.cdn ? 'origin / API' : `~${formatQpsShort(peakTotalQps)} rps`,
    })
    prev = 'lb'
  }

  const splitApps = appN <= 3
  if (splitApps) {
    for (let i = 1; i <= appN; i++) {
      nodes.push({
        id: `app-${i}`,
        kind: 'app',
        label: `App ${i}`,
        detail: appLabel,
        count: 1,
      })
      edges.push({
        id: `e-prev-app-${i}`,
        source: prev,
        target: `app-${i}`,
        label: `~${formatQpsShort(peakTotalQps / appN)} rps`,
      })
    }
  } else {
    nodes.push({
      id: 'app',
      kind: 'app',
      label: `App × ${appN}`,
      detail: appLabel,
      count: appN,
    })
    edges.push({
      id: 'e-prev-app',
      source: prev,
      target: 'app',
      label: `~${formatQpsShort(peakTotalQps)} rps`,
    })
  }

  const appTargets = splitApps ? Array.from({ length: appN }, (_, i) => `app-${i + 1}`) : ['app']
  const firstApp = appTargets[0]

  if (flags.cache && redisClass) {
    nodes.push({
      id: 'cache',
      kind: 'cache',
      label: flags.cacheCluster ? 'Redis cluster' : 'Redis',
      detail: redisClass,
    })
    const cacheRps = peakReadQps * cacheHitUsed
    edges.push({
      id: 'e-app-cache',
      source: firstApp,
      target: 'cache',
      label: cacheHitUsed > 0 ? `~${formatQpsShort(cacheRps)} rps hits` : 'write-through',
    })
  }

  if (flags.pooler) {
    nodes.push({
      id: 'pooler',
      kind: 'pooler',
      label: 'PgBouncer',
      detail: 'connection pool',
    })
    edges.push({
      id: 'e-app-pooler',
      source: firstApp,
      target: 'pooler',
      label: `~${formatQpsShort(effectiveDbReads + peakWriteQps)} rps`,
    })
  }

  const dbParent = flags.pooler ? 'pooler' : firstApp
  nodes.push({
    id: 'primary',
    kind: 'primary',
    label: `${pgName} primary`,
    detail: `${dbTitle} · ${formatGb(diskGb)}`,
  })
  edges.push({
    id: 'e-db-writes',
    source: dbParent,
    target: 'primary',
    label: input.instantConsistency
      ? `~${formatQpsShort(peakReadQps + peakWriteQps)} rps`
      : `~${formatQpsShort(Math.min(effectiveDbReads, db.primaryReadBudgetQps) + peakWriteQps)} rps`,
  })

  if (replicas > 0) {
    nodes.push({
      id: 'replica',
      kind: 'replica',
      label: replicas === 1 ? 'Read replica' : `Read replicas × ${replicas}`,
      detail: `${dbTitle} · reads`,
      count: replicas,
    })
    const replicaReads = Math.max(0, effectiveDbReads - db.primaryReadBudgetQps)
    edges.push({
      id: 'e-app-replica',
      source: dbParent,
      target: 'replica',
      label: `~${formatQpsShort(replicaReads)} rps reads`,
    })
  }

  if (flags.queue) {
    nodes.push({
      id: 'queue',
      kind: 'queue',
      label: queueName,
      detail: 'async writes',
    })
    edges.push({
      id: 'e-app-queue',
      source: firstApp,
      target: 'queue',
      label: `~${formatQpsShort(peakWriteQps)} rps writes`,
    })
  }

  if (flags.object) {
    nodes.push({
      id: 'object',
      kind: 'object',
      label: objectName,
      detail: 'media / blobs',
    })
    edges.push({
      id: 'e-app-object',
      source: firstApp,
      target: 'object',
      label: 'uploads',
    })
  }

  return { nodes, edges }
}

function formatUsersCompact(n: number): string {
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(2))}M`
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
  return n.toLocaleString('en-US')
}
