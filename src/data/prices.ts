import type { AppSizeKey, Provider } from '../lib/types'

// update me
export const PRICE_AS_OF = '2026-08'
export const SECONDS_PER_MONTH = 2.6e6
export const LB_SCALE_QPS = 100_000

export interface PriceTable {
  vm: Record<AppSizeKey, number>
  lb: number
  lbPerQps: number
  postgres: Record<string, number>
  postgresStoragePerGb: number
  redis: { micro: number; medium: number; perNode: number }
  queue: number
  queuePerMillion: number
  objectBase: number
  objectPerGb: number
  cdnBase: number
  cdnPerGb: number
  egressPerGb: number
}

export const awsPrices: PriceTable = {
  vm: { small: 15, medium: 30, large: 70, xlarge: 140, '2xlarge': 280 },
  lb: 25,
  lbPerQps: 0.008,
  postgres: {
    'db.t3.micro': 16,
    'db.t3.medium': 62,
    'db.r5.large': 185,
    'db.r5.xlarge': 370,
    'db.r5.2xlarge': 740,
    'db.r5.4xlarge': 1480,
    'db.r5.8xlarge': 2960,
    'db.r5.16xlarge': 5920,
  },
  postgresStoragePerGb: 0.115,
  redis: { micro: 13, medium: 50, perNode: 125 },
  queue: 0,
  queuePerMillion: 0.4,
  objectBase: 5,
  objectPerGb: 0.023,
  cdnBase: 12,
  cdnPerGb: 0.085,
  egressPerGb: 0.09,
}

export const cheapPrices: PriceTable = {
  vm: { small: 5, medium: 12, large: 28, xlarge: 56, '2xlarge': 112 },
  lb: 3,
  lbPerQps: 0.002,
  postgres: {
    'db.t3.micro': 0,
    'db.t3.medium': 29,
    'db.r5.large': 99,
    'db.r5.xlarge': 299,
    'db.r5.2xlarge': 499,
    'db.r5.4xlarge': 899,
    'db.r5.8xlarge': 1699,
    'db.r5.16xlarge': 2999,
  },
  postgresStoragePerGb: 0.04,
  redis: { micro: 0, medium: 10, perNode: 27 },
  queue: 0,
  queuePerMillion: 0.15,
  objectBase: 2,
  objectPerGb: 0.015,
  cdnBase: 5,
  cdnPerGb: 0.03,
  egressPerGb: 0.04,
}

export function pricesFor(provider: Provider): PriceTable {
  return provider === 'cheap' ? cheapPrices : awsPrices
}

export function vmMonthly(table: PriceTable, key: AppSizeKey, count: number): number {
  return table.vm[key] * count
}

export function postgresMonthly(
  table: PriceTable,
  dbClass: string,
  storageGb: number,
  replicas: number,
  shards = 1,
): number {
  const instance = table.postgres[dbClass] ?? table.postgres['db.r5.large']
  const storage = storageGb * table.postgresStoragePerGb
  const replicaFactor = 1 + replicas * 0.85
  return instance * replicaFactor * Math.max(1, shards) + storage
}

export function redisMonthly(
  table: PriceTable,
  clustered: boolean,
  bandish: 'micro' | 'medium',
  nodes = 1,
): number {
  if (clustered) return table.redis.perNode * Math.max(1, nodes)
  return table.redis[bandish]
}

export function queueMonthly(table: PriceTable, avgWriteQps: number): number {
  const writesPerMonth = avgWriteQps * SECONDS_PER_MONTH
  return table.queue + (writesPerMonth / 1e6) * table.queuePerMillion
}

export function lbMonthly(table: PriceTable, peakQps: number): number {
  return table.lb + table.lbPerQps * peakQps
}

export const COST_LOW_FACTOR = 0.7
export const COST_HIGH_FACTOR = 1.5
