import type { AppSize, AppSizeKey, Band, DbPlan, DbSize, RedisSize } from '../lib/types'

export const BAND_CEILING = {
  hobby: 50,
  small: 300,
  medium: 2000,
  large: 10_000,
} as const

export function pickBand(peakTotalQps: number): Band {
  if (peakTotalQps < BAND_CEILING.hobby) return 'hobby'
  if (peakTotalQps < BAND_CEILING.small) return 'small'
  if (peakTotalQps < BAND_CEILING.medium) return 'medium'
  if (peakTotalQps < BAND_CEILING.large) return 'large'
  return 'xlarge'
}

/** Scale up to a bigger instance size once the peak fleet would pass this many boxes.
 *  Real monoliths run a handful of mid-size boxes, not a swarm of tiny ones. */
export const FLEET_TARGET = 12
export const APP_BASELINE_VCPU = 4
export const REPLICA_CAP = 5
export const CACHE_NODE_BUDGET_QPS = 90_000
export const APP_POOL_PER_INSTANCE = 10
export const POOLER_CONNECTION_TRIGGER = 200

const APP_SIZES: Record<AppSizeKey, AppSize> = {
  small: { key: 'small', vcpu: 1, ramGb: 1, label: '1 vCPU · 1 GB' },
  medium: { key: 'medium', vcpu: 2, ramGb: 4, label: '2 vCPU · 4 GB' },
  large: { key: 'large', vcpu: 4, ramGb: 8, label: '4 vCPU · 8 GB' },
  xlarge: { key: 'xlarge', vcpu: 8, ramGb: 16, label: '8 vCPU · 16 GB' },
  '2xlarge': { key: '2xlarge', vcpu: 16, ramGb: 32, label: '16 vCPU · 32 GB' },
}

const APP_LADDER: AppSize[] = [
  APP_SIZES.small,
  APP_SIZES.medium,
  APP_SIZES.large,
  APP_SIZES.xlarge,
  APP_SIZES['2xlarge'],
]

export function floorAppSize(band: Band): AppSize {
  if (band === 'hobby') return APP_SIZES.small
  if (band === 'small' || band === 'medium') return APP_SIZES.medium
  return APP_SIZES.large
}

/** @deprecated use floorAppSize + pickAppFleet — kept for call sites that only need the band floor */
export function appSizeFor(band: Band): AppSize {
  return floorAppSize(band)
}

export function appCapacityRps(size: AppSize, rpsPerInstance: number): number {
  return rpsPerInstance * (size.vcpu / APP_BASELINE_VCPU)
}

/** Postgres connections held by one app box. Scales with workers / vCPU. */
export function appPoolFor(size: AppSize): number {
  return Math.max(1, Math.round(APP_POOL_PER_INSTANCE * (size.vcpu / APP_BASELINE_VCPU)))
}

export function appCountFor(peakQps: number, capacityRps: number, spare: number, hobby: boolean): number {
  if (hobby) return 1
  return Math.max(2, Math.ceil(peakQps / Math.max(capacityRps, 1)) + spare)
}

/** Smallest size at-or-above the band floor whose fleet stays under FLEET_TARGET. */
export function pickAppFleet(opts: {
  band: Band
  peakQps: number
  rpsPerInstance: number
  spare: number
}): { size: AppSize; count: number; capacityRps: number } {
  const { band, peakQps, rpsPerInstance, spare } = opts
  const floor = floorAppSize(band)
  const start = APP_LADDER.findIndex((s) => s.key === floor.key)
  const hobby = band === 'hobby'
  let picked = APP_LADDER[start]

  for (let i = start; i < APP_LADDER.length; i++) {
    picked = APP_LADDER[i]
    const cap = appCapacityRps(picked, rpsPerInstance)
    const n = appCountFor(peakQps, cap, spare, hobby)
    if (n <= FLEET_TARGET || i === APP_LADDER.length - 1) {
      return { size: picked, count: n, capacityRps: cap }
    }
  }

  const cap = appCapacityRps(picked, rpsPerInstance)
  return { size: picked, count: appCountFor(peakQps, cap, spare, hobby), capacityRps: cap }
}

const DB_BY_CLASS: Record<string, DbSize> = {
  'db.t3.micro': {
    class: 'db.t3.micro',
    cheapClass: 'PS hobby',
    primaryReadBudgetQps: 80,
    replicaQps: 80,
    writeBudgetQps: 40,
    storageBudgetGb: 50,
  },
  'db.t3.medium': {
    class: 'db.t3.medium',
    cheapClass: 'PS scaler',
    primaryReadBudgetQps: 250,
    replicaQps: 250,
    writeBudgetQps: 120,
    storageBudgetGb: 200,
  },
  'db.r5.large': {
    class: 'db.r5.large',
    cheapClass: 'PS pro',
    primaryReadBudgetQps: 800,
    replicaQps: 700,
    writeBudgetQps: 400,
    storageBudgetGb: 500,
  },
  'db.r5.xlarge': {
    class: 'db.r5.xlarge',
    cheapClass: 'PS business',
    primaryReadBudgetQps: 2000,
    replicaQps: 1800,
    writeBudgetQps: 900,
    storageBudgetGb: 2_000,
  },
  'db.r5.2xlarge': {
    class: 'db.r5.2xlarge',
    cheapClass: 'PS business+',
    primaryReadBudgetQps: 4000,
    replicaQps: 3500,
    writeBudgetQps: 1800,
    storageBudgetGb: 4_000,
  },
  'db.r5.4xlarge': {
    class: 'db.r5.4xlarge',
    cheapClass: 'PS enterprise',
    primaryReadBudgetQps: 8000,
    replicaQps: 7000,
    writeBudgetQps: 3500,
    storageBudgetGb: 8_000,
  },
  'db.r5.8xlarge': {
    class: 'db.r5.8xlarge',
    cheapClass: 'PS enterprise+',
    primaryReadBudgetQps: 15_000,
    replicaQps: 13_000,
    writeBudgetQps: 6500,
    storageBudgetGb: 16_000,
  },
  'db.r5.16xlarge': {
    class: 'db.r5.16xlarge',
    cheapClass: 'PS enterprise max',
    primaryReadBudgetQps: 28_000,
    replicaQps: 24_000,
    writeBudgetQps: 12_000,
    storageBudgetGb: 32_000,
  },
}

export const DB_LADDER: DbSize[] = [
  DB_BY_CLASS['db.t3.micro'],
  DB_BY_CLASS['db.t3.medium'],
  DB_BY_CLASS['db.r5.large'],
  DB_BY_CLASS['db.r5.xlarge'],
  DB_BY_CLASS['db.r5.2xlarge'],
  DB_BY_CLASS['db.r5.4xlarge'],
  DB_BY_CLASS['db.r5.8xlarge'],
  DB_BY_CLASS['db.r5.16xlarge'],
]

export const TOP_DB = DB_LADDER[DB_LADDER.length - 1]

function bandMinDb(band: Band): DbSize {
  if (band === 'hobby') return DB_BY_CLASS['db.t3.micro']
  if (band === 'small') return DB_BY_CLASS['db.t3.medium']
  if (band === 'medium') return DB_BY_CLASS['db.r5.large']
  if (band === 'large') return DB_BY_CLASS['db.r5.xlarge']
  return DB_BY_CLASS['db.r5.2xlarge']
}

function rungFits(size: DbSize, writeQps: number, storageGb: number, readQps: number, instant: boolean): boolean {
  const storageOk = storageGb <= size.storageBudgetGb
  const writeOk = writeQps <= size.writeBudgetQps * 1.2
  const readOk = !instant || readQps <= size.primaryReadBudgetQps * 1.4
  return storageOk && writeOk && readOk
}

function climbLadder(opts: {
  band: Band
  writeQps: number
  storageGb: number
  readQps: number
  instantConsistency: boolean
}): DbSize {
  const minClass = bandMinDb(opts.band)
  const start = DB_LADDER.findIndex((d) => d.class === minClass.class)
  for (let i = start; i < DB_LADDER.length; i++) {
    if (rungFits(DB_LADDER[i], opts.writeQps, opts.storageGb, opts.readQps, opts.instantConsistency)) {
      return DB_LADDER[i]
    }
  }
  return TOP_DB
}

function readCapWithReplicas(size: DbSize): number {
  return size.primaryReadBudgetQps + REPLICA_CAP * size.replicaQps
}

export function dbPlanFor(opts: {
  band: Band
  storageGb: number
  peakWriteQps: number
  dbReadQps: number
  instantConsistency: boolean
  allowReplicas: boolean
}): DbPlan {
  const { band, storageGb, peakWriteQps, dbReadQps, instantConsistency, allowReplicas } = opts

  let shards = 1
  if (peakWriteQps > TOP_DB.writeBudgetQps * 1.2) {
    shards = Math.ceil(peakWriteQps / TOP_DB.writeBudgetQps)
  }
  if (storageGb > TOP_DB.storageBudgetGb) {
    shards = Math.max(shards, Math.ceil(storageGb / TOP_DB.storageBudgetGb))
  }
  if (instantConsistency && dbReadQps > TOP_DB.primaryReadBudgetQps * 1.4) {
    shards = Math.max(shards, Math.ceil(dbReadQps / TOP_DB.primaryReadBudgetQps))
  }
  if (allowReplicas && !instantConsistency && dbReadQps > readCapWithReplicas(TOP_DB)) {
    shards = Math.max(shards, Math.ceil(dbReadQps / readCapWithReplicas(TOP_DB)))
  }

  const perWrite = peakWriteQps / shards
  const perStorage = storageGb / shards
  const perRead = dbReadQps / shards
  const size = climbLadder({
    band,
    writeQps: perWrite,
    storageGb: perStorage,
    readQps: perRead,
    instantConsistency,
  })

  let replicas = 0
  if (allowReplicas && !instantConsistency) {
    replicas = Math.max(0, Math.ceil((perRead - size.primaryReadBudgetQps) / size.replicaQps))
    replicas = Math.min(REPLICA_CAP, replicas)
  }

  return { size, shards, replicas }
}

/** Size only — used by older call sites. Prefer dbPlanFor. */
export function dbSizeFor(opts: {
  band: Band
  storageGb: number
  peakWriteQps: number
  primaryReadQps: number
  instantConsistency: boolean
}): DbSize {
  return dbPlanFor({
    ...opts,
    dbReadQps: opts.primaryReadQps,
    allowReplicas: !opts.instantConsistency,
  }).size
}

export function redisSizeFor(band: Band, clustered: boolean, cacheHitQps = 0): RedisSize {
  if (clustered || band === 'large' || band === 'xlarge') {
    const nodes = Math.max(3, Math.ceil(Math.max(cacheHitQps, 1) / CACHE_NODE_BUDGET_QPS))
    return {
      class: `cache.r6g.large ×${nodes}`,
      cheapClass: `Upstash Pro ×${nodes}`,
      clustered: true,
      nodes,
    }
  }
  if (band === 'medium') {
    return {
      class: 'cache.t3.medium',
      cheapClass: 'Upstash Pay-as-you-go',
      clustered: false,
      nodes: 1,
    }
  }
  return {
    class: 'cache.t3.micro',
    cheapClass: 'Upstash Free/fixed',
    clustered: false,
    nodes: 1,
  }
}

export function storageWithHeadroomGb(storageGb: number): number {
  return Math.max(10, Math.ceil(storageGb))
}
