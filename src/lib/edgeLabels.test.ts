import { describe, expect, it } from 'vitest'
import { PRESETS } from '../data/presets'
import {
  LABEL_BG_PAD_X,
  LABEL_CHAR_BUDGET,
  LABEL_CHAR_PX,
  LABEL_OFFSET_Y,
  edgeLabelKind,
  labelPoint,
} from './diagramStyle'
import { COL_GAP } from './layout'
import { sizeArchitecture } from './sizeArchitecture'
import { DEFAULT_INPUT } from './defaults'
import type { ArchitectureInput } from './types'

/** Words the color/dash encoding cannot replace. */
const LONG_OK = new Set(['write-thru', 'replication', 'uploads', 'origin / API'])

function sweep(): ArchitectureInput[] {
  const cheap = PRESETS.map((p) => ({ ...p.input, provider: 'aws' as const }))
  const awsCheap = PRESETS.map((p) => ({ ...p.input, provider: 'cheap' as const }))
  const xlarge = {
    ...DEFAULT_INPUT,
    users: 80_000_000,
    readsPerUserDay: 120,
    writesPerUserDay: 12,
    appShape: 'content' as const,
    peakFactor: 8,
    cacheHitRate: 0.9,
    rpsPerInstance: 250,
    spare: 4,
    cdnOffload: 0.65,
  }
  return [DEFAULT_INPUT, xlarge, ...cheap, ...awsCheap]
}

describe('edge label budget', () => {
  it('keeps generated labels at ≤ 12 chars unless they are the known exceptions', () => {
    for (const input of sweep()) {
      const { edges } = sizeArchitecture(input)
      for (const edge of edges) {
        if (LONG_OK.has(edge.label)) continue
        expect(edge.label.length, `${edge.id}: ${edge.label}`).toBeLessThanOrEqual(LABEL_CHAR_BUDGET)
      }
    }
  })

  it('gives the column corridor enough room for a typical rps chip', () => {
    const typical = '~93k rps'
    expect(typical.length).toBeLessThanOrEqual(9)
    expect(COL_GAP).toBeGreaterThanOrEqual(typical.length * LABEL_CHAR_PX + LABEL_BG_PAD_X)
  })
})

describe('labelPoint', () => {
  it('sits above the midpoint on a request-path edge', () => {
    const p = labelPoint({ kind: 'path', sourceX: 0, sourceY: 40, targetX: 200, targetY: 40 })
    expect(p.x).toBe(100)
    expect(p.y).toBe(40 + LABEL_OFFSET_Y)
    expect(edgeLabelKind('app', 'mixed')).toBe('path')
  })

  it('anchors a branch label near the target, not the shared source', () => {
    const p = labelPoint({ kind: 'branch', sourceX: 0, sourceY: 40, targetX: 200, targetY: 120 })
    const mid = labelPoint({ kind: 'path', sourceX: 0, sourceY: 40, targetX: 200, targetY: 120 })
    expect(p.x).toBeGreaterThan(mid.x)
    expect(p.x).toBeLessThan(200)
    expect(p.y).toBeLessThan(120)
    expect(edgeLabelKind('queue', 'async')).toBe('branch')
    expect(edgeLabelKind('primary', 'write')).toBe('branch')
    expect(edgeLabelKind('cache', 'read')).toBe('path')
    expect(edgeLabelKind('replica', 'replication')).toBe('replication')
  })
})
