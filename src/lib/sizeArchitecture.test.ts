import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from './defaults'
import { pickBand, sizeArchitecture } from './sizeArchitecture'
import type { ArchitectureInput } from './types'

function input(partial: Partial<ArchitectureInput> = {}): ArchitectureInput {
  return { ...DEFAULT_INPUT, ...partial }
}

/** users=86400, peakFactor=1 → peak_total_qps = reads + writes */
function atPeakQps(peakQps: number, extra: Partial<ArchitectureInput> = {}): ArchitectureInput {
  return input({
    users: 86400,
    readsPerUserDay: peakQps,
    writesPerUserDay: 0,
    peakFactor: 1,
    ...extra,
  })
}

describe('pickBand', () => {
  it('transitions at the documented QPS ceilings', () => {
    expect(pickBand(0)).toBe('hobby')
    expect(pickBand(49.999)).toBe('hobby')
    expect(pickBand(50)).toBe('small')
    expect(pickBand(299.999)).toBe('small')
    expect(pickBand(300)).toBe('medium')
    expect(pickBand(1999.999)).toBe('medium')
    expect(pickBand(2000)).toBe('large')
    expect(pickBand(9999.999)).toBe('large')
    expect(pickBand(10_000)).toBe('xlarge')
  })
})

describe('sizeArchitecture bands', () => {
  it('maps peak QPS to hobby / small / medium / large / xlarge', () => {
    expect(sizeArchitecture(atPeakQps(49)).band).toBe('hobby')
    expect(sizeArchitecture(atPeakQps(50)).band).toBe('small')
    expect(sizeArchitecture(atPeakQps(299)).band).toBe('small')
    expect(sizeArchitecture(atPeakQps(300)).band).toBe('medium')
    expect(sizeArchitecture(atPeakQps(1999)).band).toBe('medium')
    expect(sizeArchitecture(atPeakQps(2000)).band).toBe('large')
    expect(sizeArchitecture(atPeakQps(9999)).band).toBe('large')
    expect(sizeArchitecture(atPeakQps(10_000)).band).toBe('xlarge')
  })

  it('uses peak QPS, not user count, to pick the band', () => {
    const hugeUsersLowQps = input({
      users: 50_000_000,
      readsPerUserDay: 0.01,
      writesPerUserDay: 0,
      peakFactor: 1,
    })
    expect(sizeArchitecture(hugeUsersLowQps).band).toBe('hobby')
  })

  it('default 1M users lands in large', () => {
    const result = sizeArchitecture(DEFAULT_INPUT)
    expect(result.band).toBe('large')
    expect(result.metrics.peakTotalQps).toBeCloseTo((1_000_000 * 60) / 86400 * 5, 5)
  })
})

describe('sizeArchitecture formulas', () => {
  it('computes storage with 1.5× index overhead', () => {
    const result = sizeArchitecture(input({ users: 1_000_000, bytesPerUser: 50_000 }))
    expect(result.metrics.storageGb).toBeCloseTo(75, 10)
  })

  it('computes average and peak QPS from the spec formulas', () => {
    const result = sizeArchitecture(
      input({
        users: 86400,
        readsPerUserDay: 50,
        writesPerUserDay: 10,
        peakFactor: 5,
      }),
    )
    expect(result.metrics.avgReadQps).toBeCloseTo(50, 10)
    expect(result.metrics.avgWriteQps).toBeCloseTo(10, 10)
    expect(result.metrics.peakReadQps).toBeCloseTo(250, 10)
    expect(result.metrics.peakWriteQps).toBeCloseTo(50, 10)
    expect(result.metrics.peakTotalQps).toBeCloseTo(300, 10)
  })
})

describe('app instances and HA', () => {
  it('hobby is a single box regardless of spare', () => {
    const result = sizeArchitecture(atPeakQps(20, { spare: 2, rpsPerInstance: 200 }))
    expect(result.band).toBe('hobby')
    expect(result.metrics.appN).toBe(1)
    expect(result.nodes.some((n) => n.kind === 'combo')).toBe(true)
    expect(result.nodes.some((n) => n.kind === 'lb')).toBe(false)
  })

  it('enforces HA min 2 app instances outside hobby', () => {
    const result = sizeArchitecture(
      atPeakQps(50, { spare: 0, rpsPerInstance: 200 }),
    )
    expect(result.band).toBe('small')
    expect(result.metrics.appN).toBe(2)
  })

  it('adds spare instances on top of ceil(peak / rps)', () => {
    const result = sizeArchitecture(
      atPeakQps(400, { spare: 2, rpsPerInstance: 200 }),
    )
    expect(result.band).toBe('medium')
    expect(result.metrics.appN).toBe(4)
  })
})

describe('instant consistency', () => {
  it('adds replicas when leftover reads overflow the primary', () => {
    const result = sizeArchitecture(
      input({
        users: 1_000_000,
        cacheHitRate: 0,
        instantConsistency: false,
      }),
    )
    expect(result.metrics.replicas).toBeGreaterThan(0)
    expect(result.nodes.some((n) => n.kind === 'replica')).toBe(true)
  })

  it('forces replicas to 0 and ignores cache hit rate', () => {
    const eventual = sizeArchitecture(
      atPeakQps(2500, {
        writesPerUserDay: 10,
        readsPerUserDay: 2490,
        instantConsistency: false,
        cacheHitRate: 0,
      }),
    )
    const instant = sizeArchitecture(
      atPeakQps(2500, {
        writesPerUserDay: 10,
        readsPerUserDay: 2490,
        instantConsistency: true,
        cacheHitRate: 0.95,
      }),
    )

    expect(eventual.band).toBe('large')
    expect(eventual.metrics.replicas).toBeGreaterThan(0)
    expect(instant.metrics.replicas).toBe(0)
    expect(instant.metrics.cacheHitUsed).toBe(0)
    expect(instant.nodes.some((n) => n.kind === 'replica')).toBe(false)
    expect(instant.explanation.some((line) => /instant consistency/i.test(line))).toBe(true)
  })
})

describe('recipe flags', () => {
  it('adds cache on small only when reads/writes > 8', () => {
    const noCache = sizeArchitecture(atPeakQps(80, { readsPerUserDay: 80, writesPerUserDay: 20 }))
    const withCache = sizeArchitecture(atPeakQps(80, { readsPerUserDay: 90, writesPerUserDay: 10 }))
    expect(noCache.nodes.some((n) => n.kind === 'cache')).toBe(false)
    expect(withCache.nodes.some((n) => n.kind === 'cache')).toBe(true)
  })

  it('adds a queue when peak write QPS > 400', () => {
    const quiet = sizeArchitecture(
      input({
        users: 86400,
        readsPerUserDay: 2000,
        writesPerUserDay: 400,
        peakFactor: 1,
      }),
    )
    const busy = sizeArchitecture(
      input({
        users: 86400,
        readsPerUserDay: 2000,
        writesPerUserDay: 401,
        peakFactor: 1,
      }),
    )
    expect(quiet.band).toBe('large')
    expect(quiet.nodes.some((n) => n.kind === 'queue')).toBe(false)
    expect(busy.nodes.some((n) => n.kind === 'queue')).toBe(true)
  })

  it('adds PgBouncer on xlarge', () => {
    const result = sizeArchitecture(atPeakQps(12_000))
    expect(result.band).toBe('xlarge')
    expect(result.nodes.some((n) => n.kind === 'pooler')).toBe(true)
  })

  it('CDN for content/media, not as source of truth when instant is on', () => {
    const result = sizeArchitecture(
      atPeakQps(800, { appShape: 'content', instantConsistency: true }),
    )
    expect(result.nodes.some((n) => n.kind === 'cdn')).toBe(true)
    expect(result.explanation.some((line) => /source of truth/i.test(line))).toBe(true)
  })
})

describe('cost', () => {
  it('returns a rough low–high range around the point estimate', () => {
    const { cost } = sizeArchitecture(DEFAULT_INPUT)
    expect(cost.asOf).toBe('2026-08')
    expect(cost.low).toBeCloseTo(cost.point * 0.7, 8)
    expect(cost.high).toBeCloseTo(cost.point * 1.5, 8)
    expect(cost.point).toBeGreaterThan(0)
  })

  it('cheap provider is cheaper than aws-ish for the same sketch', () => {
    const aws = sizeArchitecture(input({ provider: 'aws' }))
    const cheap = sizeArchitecture(input({ provider: 'cheap' }))
    expect(cheap.cost.point).toBeLessThan(aws.cost.point)
  })
})
