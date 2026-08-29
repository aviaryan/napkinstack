import type { AppSize, Band, DbSize, RedisSize } from '../lib/types'

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

const APP_SIZES: Record<AppSize['key'], AppSize> = {
  small: { key: 'small', vcpu: 1, ramGb: 1, label: '1 vCPU · 1 GB' },
  medium: { key: 'medium', vcpu: 2, ramGb: 4, label: '2 vCPU · 4 GB' },
  large: { key: 'large', vcpu: 4, ramGb: 8, label: '4 vCPU · 8 GB' },
}

export function appSizeFor(band: Band): AppSize {
  if (band === 'hobby') return APP_SIZES.small
  if (band === 'small' || band === 'medium') return APP_SIZES.medium
  return APP_SIZES.large
}

const DB_BY_CLASS: Record<string, DbSize> = {
  'db.t3.micro': {
    class: 'db.t3.micro',
    cheapClass: 'PS hobby',
    primaryReadBudgetQps: 80,
    replicaQps: 80,
    writeBudgetQps: 40,
  },
  'db.t3.medium': {
    class: 'db.t3.medium',
    cheapClass: 'PS scaler',
    primaryReadBudgetQps: 250,
    replicaQps: 250,
    writeBudgetQps: 120,
  },
  'db.r5.large': {
    class: 'db.r5.large',
    cheapClass: 'PS pro',
    primaryReadBudgetQps: 800,
    replicaQps: 700,
    writeBudgetQps: 400,
  },
  'db.r5.xlarge': {
    class: 'db.r5.xlarge',
    cheapClass: 'PS business',
    primaryReadBudgetQps: 2000,
    replicaQps: 1800,
    writeBudgetQps: 900,
  },
  'db.r5.2xlarge': {
    class: 'db.r5.2xlarge',
    cheapClass: 'PS business+',
    primaryReadBudgetQps: 4000,
    replicaQps: 3500,
    writeBudgetQps: 1800,
  },
}

const DB_LADDER = [
  DB_BY_CLASS['db.t3.micro'],
  DB_BY_CLASS['db.t3.medium'],
  DB_BY_CLASS['db.r5.large'],
  DB_BY_CLASS['db.r5.xlarge'],
  DB_BY_CLASS['db.r5.2xlarge'],
]

export function dbSizeFor(opts: {
  band: Band
  storageGb: number
  peakWriteQps: number
  primaryReadQps: number
  instantConsistency: boolean
}): DbSize {
  const { band, storageGb, peakWriteQps, primaryReadQps, instantConsistency } = opts

  let minClass: DbSize
  if (band === 'hobby') minClass = DB_BY_CLASS['db.t3.micro']
  else if (band === 'small') minClass = DB_BY_CLASS['db.t3.medium']
  else if (band === 'medium') minClass = DB_BY_CLASS['db.r5.large']
  else if (band === 'large') minClass = DB_BY_CLASS['db.r5.xlarge']
  else minClass = DB_BY_CLASS['db.r5.2xlarge']

  const start = DB_LADDER.findIndex((d) => d.class === minClass.class)
  for (let i = start; i < DB_LADDER.length; i++) {
    const size = DB_LADDER[i]
    const storageOk = storageGb < 400 || i >= 2
    const writeOk = peakWriteQps <= size.writeBudgetQps * 1.2
    const readOk = !instantConsistency || primaryReadQps <= size.primaryReadBudgetQps * 1.4
    if (storageOk && writeOk && readOk) return size
  }
  return DB_LADDER[DB_LADDER.length - 1]
}

export function redisSizeFor(band: Band, clustered: boolean): RedisSize {
  if (clustered || band === 'large' || band === 'xlarge') {
    return {
      class: 'cache.r6g.large ×3',
      cheapClass: 'Upstash Pro cluster',
      clustered: true,
    }
  }
  if (band === 'medium') {
    return {
      class: 'cache.t3.medium',
      cheapClass: 'Upstash Pay-as-you-go',
      clustered: false,
    }
  }
  return {
    class: 'cache.t3.micro',
    cheapClass: 'Upstash Free/fixed',
    clustered: false,
  }
}

export function storageWithHeadroomGb(storageGb: number): number {
  return Math.max(10, Math.ceil(storageGb))
}
