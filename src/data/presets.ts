import { DEFAULT_INPUT } from '../lib/defaults'
import type { ArchitectureInput } from '../lib/types'

export interface Preset {
  id: string
  label: string
  blurb: string
  input: ArchitectureInput
}

export const PRESETS: Preset[] = [
  {
    id: 'side-project',
    label: 'Side project',
    blurb: 'A weekend app. One box.',
    input: {
      ...DEFAULT_INPUT,
      users: 400,
      readsPerUserDay: 20,
      writesPerUserDay: 4,
      instantConsistency: false,
      appShape: 'crud',
      peakFactor: 3,
      payloadKb: 4,
      cacheHitRate: 0.7,
      bytesPerUser: 20_000,
      spare: 0,
      provider: 'cheap',
    },
  },
  {
    id: 'hn-launch',
    label: 'HN launch',
    blurb: 'You hit the front page.',
    input: {
      ...DEFAULT_INPUT,
      users: 40_000,
      readsPerUserDay: 40,
      writesPerUserDay: 6,
      instantConsistency: false,
      appShape: 'content',
      peakFactor: 15,
      payloadKb: 8,
      cacheHitRate: 0.85,
      bytesPerUser: 30_000,
      spare: 2,
      provider: 'aws',
    },
  },
  {
    id: 'series-a',
    label: 'Series A',
    blurb: 'Real traffic, still a monolith.',
    input: {
      ...DEFAULT_INPUT,
      users: 1_500_000,
      readsPerUserDay: 50,
      writesPerUserDay: 10,
      instantConsistency: false,
      appShape: 'mixed',
      peakFactor: 6,
      payloadKb: 5,
      cacheHitRate: 0.8,
      bytesPerUser: 50_000,
      spare: 2,
      provider: 'aws',
    },
  },
  {
        id: 'instagram-scale',
    label: 'IG-scale',
    blurb: 'Reads everywhere. Still boring boxes.',
    input: {
      ...DEFAULT_INPUT,
      users: 80_000_000,
      readsPerUserDay: 120,
      writesPerUserDay: 12,
      instantConsistency: false,
      appShape: 'content',
      peakFactor: 8,
      payloadKb: 6,
      cacheHitRate: 0.9,
      rpsPerInstance: 250,
      bytesPerUser: 80_000,
      spare: 4,
      provider: 'aws',
    },
  },
]

export function matchingPresetId(input: ArchitectureInput): string | null {
  for (const preset of PRESETS) {
    if (sameInput(preset.input, input)) return preset.id
  }
  return null
}

function sameInput(a: ArchitectureInput, b: ArchitectureInput): boolean {
  return (Object.keys(a) as (keyof ArchitectureInput)[]).every((key) => a[key] === b[key])
}
