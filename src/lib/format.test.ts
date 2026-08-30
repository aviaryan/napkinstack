import { describe, expect, it } from 'vitest'
import { formatQpsShort } from './format'

describe('formatQpsShort', () => {
  it('compacts five-digit rps so edge labels stay short', () => {
    expect(formatQpsShort(92_889)).toBe('93k')
    expect(formatQpsShort(10_000)).toBe('10k')
    expect(formatQpsShort(1_200_000)).toBe('1.2M')
  })

  it('keeps modest numbers as decimals or integers', () => {
    expect(formatQpsShort(472)).toBe('472')
    expect(formatQpsShort(12.4)).toBe('12.4')
    expect(formatQpsShort(0.333)).toBe('0.33')
  })
})
