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

  it('adds spare instances on top of ceil(origin / capacity)', () => {
    const result = sizeArchitecture(
      atPeakQps(400, { spare: 2, rpsPerInstance: 200 }),
    )
    expect(result.band).toBe('medium')
    // medium floor is 2 vCPU → capacity 200 × 2/4 = 100
    expect(result.metrics.appN).toBe(6)
    expect(result.metrics.appCapacityRps).toBe(100)
  })

  it('scales up to mid-size boxes instead of 15 tiny ones around 1,258 rps', () => {
    const result = sizeArchitecture(
      input({
        users: 310_456,
        readsPerUserDay: 50,
        writesPerUserDay: 20,
        peakFactor: 5,
        appShape: 'crud',
        rpsPerInstance: 200,
        spare: 2,
        cdnOffload: 0,
      }),
    )
    expect(result.band).toBe('medium')
    expect(result.metrics.appN).toBe(9)
    expect(result.metrics.appCapacityRps).toBe(200)
    const app = result.nodes.find((n) => n.kind === 'app')
    expect(app?.label).toBe('App × 9')
    expect(app?.detail).toMatch(/4 vCPU · 8 GB/)
    expect(app?.detail).toMatch(/~200 rps each/)
    expect(app?.utilization).toBeGreaterThan(0.65)
    expect(app?.utilization).toBeLessThan(0.75)
    expect(result.math.find((line) => line.label === 'app_size')?.formula).toMatch(/under 12 boxes/)
    expect(app?.why).not.toMatch(/300/)
  })
})

describe('scale up, shards, offload', () => {
  it('picks bigger app boxes at IG-SCALE instead of thousands of 4-vCPU VMs', () => {
    const result = sizeArchitecture(
      input({
        users: 80_000_000,
        readsPerUserDay: 120,
        writesPerUserDay: 12,
        appShape: 'content',
        peakFactor: 8,
        cacheHitRate: 0.9,
        rpsPerInstance: 250,
        bytesPerUser: 80_000,
        spare: 4,
        cdnOffload: 0.65,
      }),
    )
    expect(result.band).toBe('xlarge')
    expect(result.metrics.appN).toBeLessThan(500)
    expect(result.nodes.find((n) => n.kind === 'app')?.detail).toMatch(/16 vCPU/)
    expect(result.metrics.shards).toBeGreaterThanOrEqual(2)
    expect(result.metrics.replicas).toBeLessThanOrEqual(5)
    expect(result.nodes.some((n) => n.kind === 'primary' && /sharded/i.test(n.label))).toBe(true)
    expect(result.metrics.cdnOffloadUsed).toBeCloseTo(0.65)
    expect(result.metrics.originTotalQps).toBeLessThan(result.metrics.peakTotalQps * 0.6)
    expect(result.metrics.cacheNodes).toBeGreaterThanOrEqual(3)
  })

  it('CDN offload shrinks the app fleet versus the same sketch at 0%', () => {
    const base = {
      users: 2_000_000,
      readsPerUserDay: 80,
      writesPerUserDay: 8,
      appShape: 'content' as const,
      peakFactor: 6,
      cacheHitRate: 0.8,
      rpsPerInstance: 200,
      spare: 2,
    }
    const none = sizeArchitecture(input({ ...base, cdnOffload: 0 }))
    const off = sizeArchitecture(input({ ...base, cdnOffload: 0.65 }))
    expect(off.metrics.originTotalQps).toBeLessThan(none.metrics.originTotalQps)
    expect(off.metrics.appN).toBeLessThan(none.metrics.appN)
    expect(off.explanation.some((line) => /edge/i.test(line))).toBe(true)
  })

  it('never fans out more than 5 replicas per shard', () => {
    const result = sizeArchitecture(
      input({
        users: 20_000_000,
        readsPerUserDay: 200,
        writesPerUserDay: 2,
        cacheHitRate: 0,
        instantConsistency: false,
        appShape: 'crud',
        peakFactor: 8,
        cdnOffload: 0,
      }),
    )
    expect(result.metrics.replicas).toBeLessThanOrEqual(5)
  })
})

describe('cost realism', () => {
  it('does not drop the point estimate as users grow', () => {
    const users = [1_000, 10_000, 100_000, 1_000_000, 10_000_000, 80_000_000]
    let prev = 0
    for (const u of users) {
      const point = sizeArchitecture(input({ users: u, appShape: 'content', cdnOffload: 0.65 })).cost.point
      expect(point).toBeGreaterThanOrEqual(prev * 0.98)
      prev = point
    }
  })

  it('prices the queue from write volume, not a flat $22', () => {
    const quiet = sizeArchitecture(
      input({
        users: 86400,
        readsPerUserDay: 2000,
        writesPerUserDay: 401,
        peakFactor: 1,
      }),
    )
    const busy = sizeArchitecture(
      input({
        users: 80_000_000,
        readsPerUserDay: 120,
        writesPerUserDay: 12,
        appShape: 'content',
        peakFactor: 8,
        cdnOffload: 0.65,
      }),
    )
    const quietQ = quiet.cost.items.find((i) => /SQS|queue/i.test(i.name))
    const busyQ = busy.cost.items.find((i) => /SQS|queue/i.test(i.name))
    expect(quietQ).toBeTruthy()
    expect(busyQ).toBeTruthy()
    expect(busyQ!.monthly).toBeGreaterThan(10_000)
    expect(quietQ!.monthly).toBeLessThan(500)
  })

  it('bills egress from average QPS so peak factor does not 8× the line', () => {
    const lowPeak = sizeArchitecture(input({ users: 1_000_000, peakFactor: 2, payloadKb: 5 }))
    const highPeak = sizeArchitecture(input({ users: 1_000_000, peakFactor: 8, payloadKb: 5 }))
    const eLow = lowPeak.cost.items.find((i) => i.name.startsWith('Egress'))!.monthly
    const eHigh = highPeak.cost.items.find((i) => i.name.startsWith('Egress'))!.monthly
    expect(eHigh).toBeCloseTo(eLow, 5)
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
    expect(result.nodes.some((n) => n.kind === 'replica' && !n.ghost)).toBe(true)
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
    expect(instant.nodes.some((n) => n.kind === 'replica' && !n.ghost)).toBe(false)
    expect(instant.nodes.some((n) => n.kind === 'replica' && n.ghost)).toBe(true)
    expect(instant.explanation.some((line) => /instant consistency/i.test(line))).toBe(true)
  })
})

describe('recipe flags', () => {
  it('adds cache on small only when reads/writes > 8', () => {
    const noCache = sizeArchitecture(atPeakQps(80, { readsPerUserDay: 80, writesPerUserDay: 20 }))
    const withCache = sizeArchitecture(atPeakQps(80, { readsPerUserDay: 90, writesPerUserDay: 10 }))
    expect(noCache.nodes.some((n) => n.kind === 'cache' && !n.ghost)).toBe(false)
    expect(withCache.nodes.some((n) => n.kind === 'cache' && !n.ghost)).toBe(true)
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
    expect(quiet.nodes.some((n) => n.kind === 'queue' && !n.ghost)).toBe(false)
    expect(busy.nodes.some((n) => n.kind === 'queue' && !n.ghost)).toBe(true)
  })

  it('adds PgBouncer on xlarge', () => {
    const result = sizeArchitecture(atPeakQps(12_000))
    expect(result.band).toBe('xlarge')
    expect(result.nodes.some((n) => n.kind === 'pooler' && !n.ghost)).toBe(true)
  })

  it('adds PgBouncer on large once big-box pools cross the trigger', () => {
    const result = sizeArchitecture(atPeakQps(5000, { spare: 2, rpsPerInstance: 200 }))
    expect(result.band).toBe('large')
    expect(result.nodes.some((n) => n.kind === 'pooler' && !n.ghost)).toBe(true)
    expect(result.nodes.find((n) => n.kind === 'pooler')?.why).toMatch(/× ~40 conns/)
  })

  it('CDN for content/media, not as source of truth when instant is on', () => {
    const result = sizeArchitecture(
      atPeakQps(800, { appShape: 'content', instantConsistency: true }),
    )
    expect(result.nodes.some((n) => n.kind === 'cdn' && !n.ghost)).toBe(true)
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

describe('diagram teaching metadata', () => {
  it('renders a single stacked app node even when N ≤ 3', () => {
    const result = sizeArchitecture(atPeakQps(50, { spare: 0, rpsPerInstance: 200 }))
    expect(result.metrics.appN).toBe(2)
    expect(result.nodes.filter((n) => n.kind === 'app')).toHaveLength(1)
    expect(result.nodes.find((n) => n.kind === 'app')?.id).toBe('app')
    expect(result.edges.every((e) => e.source !== 'app-1' && e.target !== 'app-2')).toBe(true)
  })

  it('tags edges with a traffic role', () => {
    const result = sizeArchitecture(DEFAULT_INPUT)
    expect(result.edges.length).toBeGreaterThan(0)
    expect(result.edges.every((e) => e.role)).toBe(true)
    expect(result.edges.some((e) => e.role === 'async')).toBe(true)
  })

  it('shows a ghost replica when the primary still has read budget', () => {
    const result = sizeArchitecture(DEFAULT_INPUT)
    expect(result.metrics.replicas).toBe(0)
    const ghost = result.nodes.find((n) => n.kind === 'replica' && n.ghost)
    expect(ghost).toBeTruthy()
    expect(ghost?.detail).toMatch(/not yet/i)
  })

  it('draws async replication from primary to a real replica', () => {
    const result = sizeArchitecture(input({ users: 1_000_000, cacheHitRate: 0 }))
    expect(result.edges.some((e) => e.role === 'replication' && e.source === 'primary')).toBe(true)
  })
})
