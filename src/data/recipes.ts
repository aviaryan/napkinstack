import type { AppShape, Band, RecipeFlags } from '../lib/types'

export const READ_WRITE_CACHE_RATIO = 8
export const QUEUE_WRITE_QPS = 400

/** Default share of *read* traffic a CDN absorbs at the edge. CRUD APIs are not edge-cacheable. */
export const CDN_OFFLOAD: Record<AppShape, number> = {
  content: 0.65,
  mixed: 0.35,
  crud: 0,
}

export function recipeFor(opts: {
  band: Band
  appShape: AppShape
  readWriteRatio: number
  peakWriteQps: number
  instantConsistency: boolean
}): RecipeFlags {
  const { band, appShape, readWriteRatio, peakWriteQps, instantConsistency } = opts
  const media = appShape === 'content'
  const mixed = appShape === 'mixed'

  if (band === 'hobby') {
    return {
      comboAppDb: true,
      lb: false,
      cache: false,
      cacheCluster: false,
      cdn: false,
      queue: false,
      object: false,
      pooler: false,
      allowReplicas: false,
    }
  }

  if (band === 'small') {
    return {
      comboAppDb: false,
      lb: true,
      cache: readWriteRatio > READ_WRITE_CACHE_RATIO,
      cacheCluster: false,
      cdn: false,
      queue: false,
      object: false,
      pooler: false,
      allowReplicas: !instantConsistency,
    }
  }

  if (band === 'medium') {
    return {
      comboAppDb: false,
      lb: true,
      cache: true,
      cacheCluster: false,
      cdn: media,
      queue: false,
      object: media,
      pooler: false,
      allowReplicas: !instantConsistency,
    }
  }

  const largeish = band === 'large' || band === 'xlarge'
  return {
    comboAppDb: false,
    lb: true,
    cache: true,
    cacheCluster: largeish,
    cdn: true,
    queue: peakWriteQps > QUEUE_WRITE_QPS,
    object: media || (mixed && largeish),
    pooler: band === 'xlarge',
    allowReplicas: !instantConsistency,
  }
}

export function bandLabel(band: Band): string {
  switch (band) {
    case 'hobby':
      return 'hobby'
    case 'small':
      return 'small'
    case 'medium':
      return 'medium'
    case 'large':
      return 'large'
    case 'xlarge':
      return 'xlarge'
  }
}
