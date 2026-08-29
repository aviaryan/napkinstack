import { describe, expect, it } from 'vitest'
import {
  CACHE_NODE_BUDGET_QPS,
  FLEET_TARGET,
  REPLICA_CAP,
  TOP_DB,
  dbPlanFor,
  pickAppFleet,
  redisSizeFor,
} from './sizes'

describe('pickAppFleet', () => {
  it('keeps hobby on a single small box', () => {
    const fleet = pickAppFleet({ band: 'hobby', peakQps: 20, rpsPerInstance: 200, spare: 2 })
    expect(fleet.size.key).toBe('small')
    expect(fleet.count).toBe(1)
  })

  it('does not hand a hobby or medium app a 16-vCPU box', () => {
    const medium = pickAppFleet({ band: 'medium', peakQps: 400, rpsPerInstance: 200, spare: 2 })
    expect(medium.size.vcpu).toBe(2)
    expect(medium.capacityRps).toBe(100)
    expect(medium.count).toBe(6)
  })

  it('scales up before the fleet crosses the target', () => {
    const huge = pickAppFleet({
      band: 'xlarge',
      peakQps: 977_000,
      rpsPerInstance: 250,
      spare: 4,
    })
    expect(huge.size.key).toBe('2xlarge')
    expect(huge.capacityRps).toBe(1000)
    expect(huge.count).toBe(Math.ceil(977_000 / 1000) + 4)
    expect(huge.count).toBeLessThan(1000)
    expect(huge.size.vcpu).toBe(16)
  })

  it('uses the biggest size when even that overshoots the fleet target', () => {
    const over = pickAppFleet({
      band: 'xlarge',
      peakQps: 400_000,
      rpsPerInstance: 250,
      spare: 4,
    })
    expect(over.size.key).toBe('2xlarge')
    expect(over.count).toBeGreaterThan(FLEET_TARGET)
  })
})

describe('dbPlanFor', () => {
  it('stays on one primary while writes fit the ladder', () => {
    const plan = dbPlanFor({
      band: 'large',
      storageGb: 80,
      peakWriteQps: 1_000,
      dbReadQps: 500,
      instantConsistency: false,
      allowReplicas: true,
    })
    expect(plan.shards).toBe(1)
    expect(plan.size.writeBudgetQps).toBeGreaterThanOrEqual(900)
  })

  it('shards once writes exceed the top rung', () => {
    const writes = TOP_DB.writeBudgetQps * 3.2
    const plan = dbPlanFor({
      band: 'xlarge',
      storageGb: 2_000,
      peakWriteQps: writes,
      dbReadQps: 4_000,
      instantConsistency: false,
      allowReplicas: true,
    })
    expect(plan.shards).toBe(Math.ceil(writes / TOP_DB.writeBudgetQps))
    expect(plan.shards).toBeGreaterThan(1)
    expect(plan.size.class).toBe(TOP_DB.class)
  })

  it('caps replicas per shard and adds shards instead of a 25-wide fan-out', () => {
    const plan = dbPlanFor({
      band: 'xlarge',
      storageGb: 1_000,
      peakWriteQps: 500,
      dbReadQps: TOP_DB.primaryReadBudgetQps + TOP_DB.replicaQps * 40,
      instantConsistency: false,
      allowReplicas: true,
    })
    expect(plan.replicas).toBeLessThanOrEqual(REPLICA_CAP)
    expect(plan.shards).toBeGreaterThan(1)
  })

  it('climbs the ladder for storage instead of parking 9 TB on a 2xlarge', () => {
    const plan = dbPlanFor({
      band: 'large',
      storageGb: 9_600,
      peakWriteQps: 200,
      dbReadQps: 200,
      instantConsistency: false,
      allowReplicas: true,
    })
    expect(plan.size.storageBudgetGb).toBeGreaterThanOrEqual(9_600)
    expect(plan.size.class).not.toBe('db.r5.2xlarge')
  })
})

describe('redisSizeFor', () => {
  it('grows cluster nodes with cache-hit QPS', () => {
    const quiet = redisSizeFor('xlarge', true, 80_000)
    const busy = redisSizeFor('xlarge', true, 700_000)
    expect(quiet.nodes).toBe(3)
    expect(busy.nodes).toBe(Math.max(3, Math.ceil(700_000 / CACHE_NODE_BUDGET_QPS)))
    expect(busy.nodes).toBeGreaterThan(quiet.nodes)
    expect(busy.class).toContain(`×${busy.nodes}`)
  })
})
