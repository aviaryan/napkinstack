import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT, isDefaultInput, sameInput } from './defaults'

describe('sameInput / isDefaultInput', () => {
  it('treats DEFAULT_INPUT as the default sketch', () => {
    expect(isDefaultInput(DEFAULT_INPUT)).toBe(true)
    expect(isDefaultInput({ ...DEFAULT_INPUT })).toBe(true)
  })

  it('is false as soon as any knob differs', () => {
    expect(isDefaultInput({ ...DEFAULT_INPUT, users: 400 })).toBe(false)
    expect(sameInput(DEFAULT_INPUT, { ...DEFAULT_INPUT, provider: 'cheap' })).toBe(false)
  })
})
