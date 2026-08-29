import type { Provider } from '../lib/types'

// update me
export const PRICE_AS_OF = '2026-08'

export interface PriceTable {
  vm: { small: number; medium: number; large: number }
  lb: number
  postgres: Record<string, number>
  postgresStoragePerGb: number
  redis: { micro: number; medium: number; cluster: number }
  queue: number
  objectBase: number
  objectPerGb: number
  cdnBase: number
  cdnPerGb: number
  egressPerGb: number
}

export const awsPrices: PriceTable = {
  vm: { small: 15, medium: 30, large: 70 },
  lb: 25,
  postgres: {
    'db.t3.micro': 16,
    'db.t3.medium': 62,
    'db.r5.large': 185,
    'db.r5.xlarge': 370,
    'db.r5.2xlarge': 740,
  },
  postgresStoragePerGb: 0.115,
  redis: { micro: 13, medium: 50, cluster: 380 },
  queue: 22,
  objectBase: 5,
  objectPerGb: 0.023,
  cdnBase: 12,
  cdnPerGb: 0.085,
  egressPerGb: 0.09,
}

export const cheapPrices: PriceTable = {
  vm: { small: 5, medium: 12, large: 28 },
  lb: 3,
  postgres: {
    'db.t3.micro': 0,
    'db.t3.medium': 29,
    'db.r5.large': 99,
    'db.r5.xlarge': 299,
    'db.r5.2xlarge': 499,
  },
  postgresStoragePerGb: 0.04,
  redis: { micro: 0, medium: 10, cluster: 80 },
  queue: 8,
  objectBase: 2,
  objectPerGb: 0.015,
  cdnBase: 5,
  cdnPerGb: 0.03,
  egressPerGb: 0.04,
}

export function pricesFor(provider: Provider): PriceTable {
  return provider === 'cheap' ? cheapPrices : awsPrices
}

export function vmMonthly(table: PriceTable, key: 'small' | 'medium' | 'large', count: number): number {
  return table.vm[key] * count
}

export function postgresMonthly(table: PriceTable, dbClass: string, storageGb: number, replicas: number): number {
  const instance = table.postgres[dbClass] ?? table.postgres['db.r5.large']
  const storage = storageGb * table.postgresStoragePerGb
  const replicaFactor = 1 + replicas * 0.85
  return instance * replicaFactor + storage
}

export function redisMonthly(table: PriceTable, clustered: boolean, bandish: 'micro' | 'medium' | 'cluster'): number {
  if (clustered) return table.redis.cluster
  return table.redis[bandish]
}

export const COST_LOW_FACTOR = 0.7
export const COST_HIGH_FACTOR = 1.5
