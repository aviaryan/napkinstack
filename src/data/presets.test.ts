import { describe, expect, it } from 'vitest'
import { sizeArchitecture } from '../lib/sizeArchitecture'
import { matchingPresetId, PRESETS } from './presets'

describe('presets', () => {
  it('lands each scenario in a distinct rising band', () => {
    const bands = PRESETS.map((preset) => sizeArchitecture(preset.input).band)
    expect(bands).toEqual(['hobby', 'medium', 'large', 'xlarge'])
  })

  it('matches a preset only when every input field agrees', () => {
    expect(matchingPresetId(PRESETS[0].input)).toBe('side-project')
    expect(matchingPresetId({ ...PRESETS[0].input, users: 401 })).toBeNull()
  })
})
